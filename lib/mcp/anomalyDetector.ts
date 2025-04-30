import { supabase } from './utils/supabaseClient';
import { AnomalyType, AnomalySeverity, EventType } from './types';
import config from './config';

/**
 * Anomaly Detector - Identifies unusual patterns and behaviors
 */
export class AnomalyDetector {
  /**
   * Detect and log an anomaly
   *
   * @param anomalyType Type of anomaly detected
   * @param severity Severity level (1-5)
   * @param entityType Type of entity with the anomaly
   * @param entityId UUID of the entity
   * @param description Human-readable description of the anomaly
   * @param metadata Additional context about the anomaly
   * @param relatedIds Related entity IDs (claim, vendor, equipment)
   * @returns The created anomaly record
   */
  static async logAnomaly(
    anomalyType: AnomalyType,
    severity: AnomalySeverity,
    entityType: string,
    entityId: string,
    description: string,
    metadata: Record<string, any> = {},
    relatedIds: {
      claimId?: string;
      vendorId?: string;
      equipmentId?: string;
    } = {}
  ) {
    try {
      const { data, error } = await supabase
        .from('anomaly_log')
        .insert({
          anomaly_type: anomalyType,
          severity,
          entity_type: entityType,
          entity_id: entityId,
          claim_id: relatedIds.claimId,
          vendor_id: relatedIds.vendorId,
          equipment_id: relatedIds.equipmentId,
          description,
          metadata
        })
        .select()
        .single();

      if (error) {
        console.error('Error logging anomaly:', error);
        throw error;
      }

      return data;
    } catch (err) {
      console.error('Anomaly logging failed:', err);
      throw err;
    }
  }

  /**
   * Check claim for SLA violations based on vendor response times
   * 
   * @param claimId UUID of the claim to check
   * @returns The anomaly if detected, null if no anomaly found
   */
  static async checkVendorResponseSLA(claimId: string) {
    try {
      // Get claim and vendor information
      const { data: claim, error: claimError } = await supabase
        .from('claims')
        .select(`
          id,
          created_at,
          status,
          vendor_id,
          vendors (
            id,
            name,
            sla_response_hours
          ),
          (
            SELECT COUNT(*) FROM messages 
            WHERE claim_id = claims.id AND sender_type = 'vendor'
          ) as vendor_response_count
        `)
        .eq('id', claimId)
        .single();

      if (claimError) throw claimError;

      // If no vendor responses and claim has been open longer than SLA
      const hoursSinceCreation = (Date.now() - new Date(claim.created_at).getTime()) / (1000 * 60 * 60);
      const slaThreshold = claim.vendors?.sla_response_hours || config.responseTimeThresholdHours;
      
      if (claim.vendor_response_count === 0 && hoursSinceCreation > slaThreshold) {
        return await this.logAnomaly(
          'sla_violation',
          hoursSinceCreation > slaThreshold * 2 ? 4 : 3, // Higher severity for longer delays
          'claim',
          claimId,
          `Vendor has not responded within SLA (${slaThreshold} hours)`,
          {
            hours_elapsed: hoursSinceCreation,
            sla_threshold: slaThreshold
          },
          {
            claimId,
            vendorId: claim.vendor_id
          }
        );
      }
      
      return null;
    } catch (err) {
      console.error('Error checking vendor response SLA:', err);
      throw err;
    }
  }

  /**
   * Check for excessive resubmissions on a claim
   * 
   * @param claimId UUID of the claim to check
   * @returns The anomaly if detected, null if no anomaly found
   */
  static async checkExcessiveResubmissions(claimId: string) {
    try {
      // Get claim status change history
      const { data: statusChanges, error } = await supabase
        .from('memory_stream')
        .select('*')
        .eq('claim_id', claimId)
        .eq('event_type', 'status_changed')
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Count transitions from rejected/denied back to submitted
      let resubmissionCount = 0;
      let lastStatus = null;

      for (const change of statusChanges) {
        const currentStatus = change.metadata?.new_status;
        if ((lastStatus === 'rejected' || lastStatus === 'denied') && currentStatus === 'submitted') {
          resubmissionCount++;
        }
        lastStatus = currentStatus;
      }

      // Log anomaly if resubmissions exceed threshold
      if (resubmissionCount >= 3) {
        return await this.logAnomaly(
          'excessive_resubmissions',
          resubmissionCount >= 5 ? 4 : 3,
          'claim',
          claimId,
          `Claim has been resubmitted ${resubmissionCount} times`,
          { resubmission_count: resubmissionCount },
          { claimId }
        );
      }

      return null;
    } catch (err) {
      console.error('Error checking for excessive resubmissions:', err);
      throw err;
    }
  }
  
  /**
   * Detect anomalies based on vendor approval patterns
   * 
   * @param claimId UUID of the claim to check
   * @returns The anomaly if detected, null if no anomaly found
   */
  static async checkVendorApprovalAnomaly(claimId: string) {
    // Get claim details
    const { data: claim, error: claimError } = await supabase
      .from('claims')
      .select(`
        id, 
        status, 
        issue_type, 
        equipment_id, 
        vendor_id,
        (
          SELECT COUNT(*) FROM photos WHERE claim_id = claims.id
        ) as photo_count
      `)
      .eq('id', claimId)
      .single();
      
    if (claimError) throw claimError;
    
    // Get vendor behavior data
    const { data: vendorBehavior, error: vendorError } = await supabase
      .from('vendor_behavior')
      .select('*')
      .eq('vendor_id', claim.vendor_id)
      .single();
      
    if (vendorError && vendorError.code !== 'PGRST116') throw vendorError; // Ignore not found
    
    // Get resolution patterns
    const { data: patterns, error: patternError } = await supabase
      .from('resolution_patterns')
      .select('*')
      .eq('issue_type', claim.issue_type)
      .eq('equipment_id', claim.equipment_id)
      .eq('vendor_id', claim.vendor_id)
      .single();
      
    if (patternError && patternError.code !== 'PGRST116') throw patternError; // Ignore not found
    
    // If claim was denied with more photos than typically required
    if (claim.status === 'denied' && 
        patterns && 
        claim.photo_count > patterns.avg_photo_count * 1.5 && 
        patterns.approved_claims > 10) {
      return await this.logAnomaly(
        'unusual_denial',
        3,
        'claim',
        claimId,
        `Claim denied despite having ${claim.photo_count} photos (avg: ${patterns.avg_photo_count})`,
        {
          photo_count: claim.photo_count,
          avg_required: patterns.avg_photo_count,
          approval_rate: patterns.approved_claims / patterns.total_claims
        },
        {
          claimId,
          vendorId: claim.vendor_id,
          equipmentId: claim.equipment_id
        }
      );
    }
    
    return null;
  }

  /**
   * Run all anomaly detection checks for a given claim
   * 
   * @param claimId UUID of the claim to check
   * @returns Array of detected anomalies
   */
  static async runAllChecks(claimId: string) {
    const anomalies = [];
    
    try {
      const slaAnomaly = await this.checkVendorResponseSLA(claimId);
      if (slaAnomaly) anomalies.push(slaAnomaly);
      
      const resubmissionAnomaly = await this.checkExcessiveResubmissions(claimId);
      if (resubmissionAnomaly) anomalies.push(resubmissionAnomaly);
      
      const approvalAnomaly = await this.checkVendorApprovalAnomaly(claimId);
      if (approvalAnomaly) anomalies.push(approvalAnomaly);
      
      return anomalies;
    } catch (err) {
      console.error('Error running anomaly checks:', err);
      throw err;
    }
  }
}

export default AnomalyDetector;
