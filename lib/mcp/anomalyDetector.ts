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
    const anomalies = [];
    
    // Run individual checks in parallel
    const [slaViolation, excessiveResubmissions, approvalAnomaly, timeAnomaly, equipmentAnomaly, vendorAnomaly, patternAnomaly] = await Promise.all([
      this.checkVendorResponseSLA(claimId),
      this.checkExcessiveResubmissions(claimId),
      this.checkVendorApprovalAnomaly(claimId),
      this.detectTimeAnomalies(claim, historicalClaims || []),
      this.detectEquipmentAnomalies(claim, historicalClaims || []),
      this.detectVendorAnomalies(claim, historicalClaims || []),
      this.detectPatternAnomalies(claim, historicalClaims || [])
    ]);
   * Detect anomalies related to claim submission time patterns
   * 
   * @param claim The claim to analyze
   * @param historicalClaims Previous claims for comparison
   * @returns Array of detected anomalies
   */
  static async detectTimeAnomalies(claim: any, historicalClaims: any[]) {
    const anomalies = [];
    
    // Example: Detect unusual claim submission times
    const submissionHour = new Date(claim.created_at).getHours();
    const isNonBusinessHour = submissionHour < 8 || submissionHour > 18;
    
    if (isNonBusinessHour) {
      anomalies.push({
        id: `time-anomaly-${Date.now()}`,
        anomaly_type: 'submission_time',
        severity: 2, // Low severity
        entity_type: 'claim',
        entity_id: claim.id,
        claim_id: claim.id,
        description: 'Claim submitted outside of normal business hours',
        metadata: {
          submission_time: claim.created_at,
          hour: submissionHour
        },
        created_at: new Date().toISOString()
      });
    }
    
    // Detect unusual frequency of claims
    const last24HoursClaims = historicalClaims.filter(c => 
      new Date(c.created_at).getTime() > Date.now() - 24 * 60 * 60 * 1000 &&
      c.user_id === claim.user_id
    );
    
    if (last24HoursClaims.length >= 3) { // User submitted 3+ claims in 24 hours
      anomalies.push({
        id: `frequency-anomaly-${Date.now()}`,
        anomaly_type: 'submission_frequency',
        severity: 3, // Medium severity
        entity_type: 'user',
        entity_id: claim.user_id,
        claim_id: claim.id,
        description: `Unusual number of claims (${last24HoursClaims.length + 1}) submitted by same user in 24 hours`,
        metadata: {
          recent_claims: last24HoursClaims.map(c => c.id),
          total_count: last24HoursClaims.length + 1
        },
        created_at: new Date().toISOString()
      });
    }
    
    return anomalies;
  }

  /**
   * Detect anomalies related to equipment patterns
   * 
   * @param claim The claim to analyze
   * @param historicalClaims Previous claims for comparison
   * @returns Array of detected anomalies
   */
  static async detectEquipmentAnomalies(claim: any, historicalClaims: any[]) {
    const anomalies = [];
    
    if (!claim.equipment_id) return anomalies;
    
    // Check for repeated claims on same equipment
    const sameEquipmentClaims = historicalClaims.filter(c => 
      c.equipment_id === claim.equipment_id
    );
    
    // If there are 3+ claims on the same equipment
    if (sameEquipmentClaims.length >= 2) {
      anomalies.push({
        id: `equipment-anomaly-${Date.now()}`,
        anomaly_type: 'repeat_equipment_issue',
        severity: 4, // High severity
        entity_type: 'equipment',
        entity_id: claim.equipment_id,
        claim_id: claim.id,
        description: `Multiple claims (${sameEquipmentClaims.length + 1}) filed for the same equipment`,
        metadata: {
          previous_claims: sameEquipmentClaims.map(c => ({ 
            id: c.id, 
            created_at: c.created_at,
            issue: c.issue_description || c.description
          })),
          total_count: sameEquipmentClaims.length + 1
        },
        created_at: new Date().toISOString()
      });
    }
    
    // Check for unusual issue type for this equipment model
    if (claim.equipment && claim.equipment.model) {
      // Get all claims for the same equipment model
      const sameModelClaims = historicalClaims.filter(c => 
        c.equipment && c.equipment.model === claim.equipment.model
      );
      
      // Check if this issue is unique compared to historical issues
      if (sameModelClaims.length > 5) {
        const issueDesc = claim.issue_description || claim.description || '';
        const similarIssues = sameModelClaims.filter(c => 
          (c.issue_description || c.description || '').toLowerCase().includes(
            issueDesc.toLowerCase().substring(0, 10) // Simple check for similar text
          )
        );
        
        // If no similar issues found despite many claims for this model
        if (similarIssues.length === 0) {
          anomalies.push({
            id: `unique-issue-anomaly-${Date.now()}`,
            anomaly_type: 'unique_equipment_issue',
            severity: 3, // Medium severity
            entity_type: 'equipment',
            entity_id: claim.equipment_id,
            claim_id: claim.id,
            description: `Unusual issue reported for ${claim.equipment.model} compared to historical patterns`,
            metadata: {
              current_issue: issueDesc,
              model: claim.equipment.model,
              historical_issue_count: sameModelClaims.length
            },
            created_at: new Date().toISOString()
          });
        }
      }
    }
    
    return anomalies;
  }

  /**
   * Detect anomalies related to vendor interactions
   * 
   * @param claim The claim to analyze
   * @param historicalClaims Previous claims for comparison
   * @returns Array of detected anomalies
   */
  static async detectVendorAnomalies(claim: any, historicalClaims: any[]) {
    const anomalies = [];
    
    if (!claim.vendor_id) return anomalies;
    
    // Get historical approval rate for this vendor
    const vendorClaims = historicalClaims.filter(c => c.vendor_id === claim.vendor_id);
    if (vendorClaims.length < 5) return anomalies; // Not enough historical data
    
    const approvedClaims = vendorClaims.filter(c => c.status === 'APPROVED' || c.status === 'COMPLETED');
    const rejectedClaims = vendorClaims.filter(c => c.status === 'REJECTED');
    
    const approvalRate = approvedClaims.length / vendorClaims.length;
    const rejectionRate = rejectedClaims.length / vendorClaims.length;
    
    // Low approval rate vendor (less than 50% approvals)
    if (approvalRate < 0.5 && vendorClaims.length >= 10) {
      anomalies.push({
        id: `vendor-approval-anomaly-${Date.now()}`,
        anomaly_type: 'low_vendor_approval_rate',
        severity: 3, // Medium severity
        entity_type: 'vendor',
        entity_id: claim.vendor_id,
        claim_id: claim.id,
        description: `Vendor has unusually low approval rate (${Math.round(approvalRate * 100)}%)`,
        metadata: {
          approval_rate: approvalRate,
          rejection_rate: rejectionRate,
          sample_size: vendorClaims.length,
          vendor_name: claim.vendor?.name || 'Unknown Vendor'
        },
        created_at: new Date().toISOString()
      });
    }
    
    // Check for sudden change in vendor response patterns
    const recentVendorClaims = vendorClaims
      .filter(c => new Date(c.created_at).getTime() > Date.now() - 30 * 24 * 60 * 60 * 1000) // Last 30 days
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    
    if (recentVendorClaims.length >= 5) {
      const recentApprovalRate = recentVendorClaims.filter(c => 
        c.status === 'APPROVED' || c.status === 'COMPLETED'
      ).length / recentVendorClaims.length;
      
      // If recent approval rate differs significantly from historical rate
      if (Math.abs(recentApprovalRate - approvalRate) > 0.25) { // 25% difference
        anomalies.push({
          id: `vendor-pattern-change-${Date.now()}`,
          anomaly_type: 'vendor_pattern_change',
          severity: 3, // Medium severity
          entity_type: 'vendor',
          entity_id: claim.vendor_id,
          claim_id: claim.id,
          description: `Significant change in vendor approval patterns recently`,
          metadata: {
            historical_rate: approvalRate,
            recent_rate: recentApprovalRate,
            historical_sample: vendorClaims.length,
            recent_sample: recentVendorClaims.length,
            vendor_name: claim.vendor?.name || 'Unknown Vendor'
          },
          created_at: new Date().toISOString()
        });
      }
    }
    
    return anomalies;
  }

  /**
   * Detect organization-wide patterns and anomalies
   * 
   * @param claim The claim to analyze
   * @param historicalClaims Previous claims for comparison
   * @returns Array of detected anomalies
   */
  static async detectPatternAnomalies(claim: any, historicalClaims: any[]) {
    const anomalies = [];
    
    if (historicalClaims.length < 10) return anomalies; // Not enough historical data
    
    // Detect sudden spike in claim volume
    const last7DaysClaims = historicalClaims.filter(c => 
      new Date(c.created_at).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000
    );
    
    const last30DaysClaims = historicalClaims.filter(c => 
      new Date(c.created_at).getTime() > Date.now() - 30 * 24 * 60 * 60 * 1000
    );
    
    // Calculate averages
    const avg7DaysPerWeek = last7DaysClaims.length;
    const avg30DaysPerWeek = last30DaysClaims.length / 4; // Approx 4 weeks
    
    // If recent volume is 2x the monthly average
    if (avg7DaysPerWeek > avg30DaysPerWeek * 2 && last30DaysClaims.length >= 10) {
      anomalies.push({
        id: `volume-spike-${Date.now()}`,
        anomaly_type: 'claim_volume_spike',
        severity: 4, // High severity
        entity_type: 'organization',
        entity_id: claim.org_id,
        claim_id: claim.id,
        description: `Unusual spike in claim volume in the past week`,
        metadata: {
          weekly_avg: avg7DaysPerWeek,
          monthly_avg_per_week: avg30DaysPerWeek,
          increase_percentage: Math.round((avg7DaysPerWeek / avg30DaysPerWeek - 1) * 100),
          recent_claims: last7DaysClaims.length,
          organization_name: claim.organization?.name || 'Organization'
        },
        created_at: new Date().toISOString()
      });
    }
    
    // Add more pattern detection algorithms as needed
    
    return anomalies;
  }

  /**
   * Check for anomalies in a claim
   * Alias for toolchain compatibility
   * 
   * @param params Parameters containing claimId and optionally orgId
   * @returns Array of detected anomalies
   */
  static async checkForAnomalies(params: { claimId: string, orgId?: string }) {
    return this.runAllChecks(params.claimId);
  }
}

export default AnomalyDetector;
