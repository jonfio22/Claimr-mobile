import { supabase } from '../supabase/client';
import { AuditStateManager } from './AuditStateManager';
import { v4 as uuidv4 } from 'uuid';

/**
 * Alert severity levels
 */
export enum AlertSeverity {
  INFO = 'INFO',
  WARNING = 'WARNING',
  ERROR = 'ERROR',
  CRITICAL = 'CRITICAL'
}

/**
 * Alert notification interface
 */
export interface AlertNotification {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  source: string;
  sourceId: string;
  timestamp: string;
  metadata?: Record<string, any>;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

/**
 * Alert Generator
 * 
 * Monitors confidence thresholds and verification failures,
 * and issues real-time alerts for claims requiring review.
 */
export class AlertGenerator {
  private auditManager: AuditStateManager;
  private alertThresholds: Record<string, number>;
  private alertHandlers: Array<(alert: AlertNotification) => Promise<void>>;
  
  constructor(auditManager: AuditStateManager) {
    this.auditManager = auditManager;
    this.alertHandlers = [];
    
    // Default confidence thresholds by stage/tool
    this.alertThresholds = {
      // Stage thresholds
      'stage.INGESTION': 80,
      'stage.VALIDATION': 75,
      'stage.PROCESSING': 70,
      'stage.COMPLETION': 85,
      
      // Tool thresholds
      'tool.AnomalyDetector': 80,
      'tool.ContextBuilder': 75,
      'tool.RecommendationEngine': 70,
      'tool.MemoryTracker': 90,
      
      // Overall thresholds
      'overall.confidence': 70
    };
  }
  
  /**
   * Initialize the Alert Generator
   */
  async initialize(): Promise<void> {
    try {
      console.log('Initializing Alert Generator...');
      
      // Load custom thresholds from the database
      await this.loadAlertThresholds();
      
      // Set up database listeners for new audit records
      this.subscribeToAuditEvents();
      
      console.log('Alert Generator initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Alert Generator:', error);
      throw error;
    }
  }
  
  /**
   * Register an alert handler
   * @param handler Alert handler function
   */
  registerAlertHandler(handler: (alert: AlertNotification) => Promise<void>): void {
    this.alertHandlers.push(handler);
  }
  
  /**
   * Set an alert threshold
   * @param key Threshold key (e.g. 'stage.VALIDATION')
   * @param value Threshold value (0-100)
   * @param persist Whether to persist to database
   */
  async setAlertThreshold(key: string, value: number, persist: boolean = true): Promise<void> {
    try {
      // Validate threshold
      if (value < 0 || value > 100) {
        throw new Error('Threshold must be between 0 and 100');
      }
      
      // Update in memory
      this.alertThresholds[key] = value;
      
      // Persist to database if requested
      if (persist) {
        const { error } = await supabase
          .from('verification_settings')
          .upsert({
            setting_key: `threshold.${key}`,
            setting_value: value,
            updated_at: new Date().toISOString()
          }, {
            onConflict: 'setting_key'
          });
          
        if (error) {
          console.error(`Error persisting threshold ${key}:`, error);
          throw error;
        }
      }
    } catch (error) {
      console.error(`Error setting alert threshold ${key}:`, error);
      throw error;
    }
  }
  
  /**
   * Check a claim against all thresholds
   * @param claimId Claim ID to check
   * @returns Whether any alerts were generated
   */
  async checkClaimThresholds(claimId: string): Promise<boolean> {
    try {
      // Get audit state for claim
      const auditState = this.auditManager.getAuditState(claimId);
      
      if (!auditState) {
        console.error(`No audit state found for claim ${claimId}`);
        return false;
      }
      
      let alertsGenerated = false;
      
      // Check overall confidence
      const overallThreshold = this.alertThresholds['overall.confidence'];
      
      if (auditState.overallConfidence < overallThreshold) {
        await this.generateAlert({
          severity: this.getSeverityForConfidence(auditState.overallConfidence, overallThreshold),
          title: 'Low Overall Confidence',
          message: `Claim ${claimId} has overall confidence of ${auditState.overallConfidence.toFixed(1)}%, below threshold of ${overallThreshold}%`,
          source: 'claim_audit',
          sourceId: claimId,
          metadata: {
            auditId: auditState.auditId,
            confidence: auditState.overallConfidence,
            threshold: overallThreshold
          }
        });
        
        alertsGenerated = true;
      }
      
      // Check stage confidences
      for (const [stageName, stageInfo] of Object.entries(auditState.stages)) {
        if (stageInfo.status !== 'COMPLETED') continue;
        
        const thresholdKey = `stage.${stageName}`;
        const threshold = this.alertThresholds[thresholdKey];
        
        if (threshold && stageInfo.confidence < threshold) {
          await this.generateAlert({
            severity: this.getSeverityForConfidence(stageInfo.confidence, threshold),
            title: `Low Confidence in ${stageName} Stage`,
            message: `Claim ${claimId} has ${stageName} stage confidence of ${stageInfo.confidence.toFixed(1)}%, below threshold of ${threshold}%`,
            source: 'stage_verification',
            sourceId: stageInfo.verificationId || `${auditState.auditId}-${stageName}`,
            metadata: {
              auditId: auditState.auditId,
              claimId,
              stage: stageName,
              confidence: stageInfo.confidence,
              threshold
            }
          });
          
          alertsGenerated = true;
        }
      }
      
      // Check tool confidences
      for (const [toolName, toolInfo] of Object.entries(auditState.tools)) {
        if (toolInfo.status !== 'COMPLETED' || toolInfo.confidence === undefined) continue;
        
        const thresholdKey = `tool.${toolName}`;
        const threshold = this.alertThresholds[thresholdKey];
        
        if (threshold && toolInfo.confidence < threshold) {
          await this.generateAlert({
            severity: this.getSeverityForConfidence(toolInfo.confidence, threshold),
            title: `Low Confidence from ${toolName}`,
            message: `Claim ${claimId} has ${toolName} confidence of ${toolInfo.confidence.toFixed(1)}%, below threshold of ${threshold}%`,
            source: 'tool_activation',
            sourceId: toolInfo.activationId || `${auditState.auditId}-${toolName}`,
            metadata: {
              auditId: auditState.auditId,
              claimId,
              tool: toolName,
              confidence: toolInfo.confidence,
              threshold
            }
          });
          
          alertsGenerated = true;
        }
      }
      
      return alertsGenerated;
    } catch (error) {
      console.error(`Error checking thresholds for claim ${claimId}:`, error);
      return false;
    }
  }
  
  /**
   * Generate and publish an alert
   * @param options Alert options
   * @returns The generated alert
   */
  async generateAlert(options: {
    severity: AlertSeverity;
    title: string;
    message: string;
    source: string;
    sourceId: string;
    metadata?: Record<string, any>;
  }): Promise<AlertNotification> {
    try {
      const timestamp = new Date().toISOString();
      
      // Create alert object
      const alert: AlertNotification = {
        id: uuidv4(),
        severity: options.severity,
        title: options.title,
        message: options.message,
        source: options.source,
        sourceId: options.sourceId,
        timestamp,
        metadata: options.metadata,
        acknowledged: false
      };
      
      // Persist to database
      const { error } = await supabase
        .from('verification_alerts')
        .insert({
          alert_id: alert.id,
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
          source: alert.source,
          source_id: alert.sourceId,
          timestamp: alert.timestamp,
          metadata: alert.metadata,
          acknowledged: false
        });
        
      if (error) {
        console.error('Error persisting alert:', error);
        throw error;
      }
      
      // Also send to any registered handlers
      await Promise.all(
        this.alertHandlers.map(async (handler) => {
          try {
            await handler(alert);
          } catch (handlerError) {
            console.error('Error in alert handler:', handlerError);
          }
        })
      );
      
      console.log(`Generated ${alert.severity} alert: ${alert.title}`);
      
      return alert;
    } catch (error) {
      console.error('Error generating alert:', error);
      throw error;
    }
  }
  
  /**
   * Acknowledge an alert
   * @param alertId Alert ID
   * @param acknowledgedBy User who acknowledged
   * @returns Whether acknowledgment was successful
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<boolean> {
    try {
      const timestamp = new Date().toISOString();
      
      // Update in database
      const { error } = await supabase
        .from('verification_alerts')
        .update({
          acknowledged: true,
          acknowledged_by: acknowledgedBy,
          acknowledged_at: timestamp
        })
        .eq('alert_id', alertId);
        
      if (error) {
        console.error(`Error acknowledging alert ${alertId}:`, error);
        return false;
      }
      
      console.log(`Alert ${alertId} acknowledged by ${acknowledgedBy}`);
      return true;
    } catch (error) {
      console.error(`Error acknowledging alert ${alertId}:`, error);
      return false;
    }
  }
  
  /**
   * Get active alerts
   * @param limit Maximum number of alerts to return
   * @param offset Offset for pagination
   * @returns Active (unacknowledged) alerts
   */
  async getActiveAlerts(limit: number = 100, offset: number = 0): Promise<AlertNotification[]> {
    try {
      const { data, error } = await supabase
        .from('verification_alerts')
        .select('*')
        .eq('acknowledged', false)
        .order('timestamp', { ascending: false })
        .range(offset, offset + limit - 1);
        
      if (error) {
        console.error('Error fetching active alerts:', error);
        throw error;
      }
      
      return data.map(this.mapDbAlertToNotification);
    } catch (error) {
      console.error('Error in getActiveAlerts:', error);
      throw error;
    }
  }
  
  /**
   * Get alerts for a specific claim
   * @param claimId Claim ID
   * @returns Alerts for the claim
   */
  async getAlertsForClaim(claimId: string): Promise<AlertNotification[]> {
    try {
      const { data, error } = await supabase
        .from('verification_alerts')
        .select('*')
        .eq('source', 'claim_audit')
        .eq('source_id', claimId)
        .order('timestamp', { ascending: false });
        
      if (error) {
        console.error(`Error fetching alerts for claim ${claimId}:`, error);
        throw error;
      }
      
      return data.map(this.mapDbAlertToNotification);
    } catch (error) {
      console.error(`Error in getAlertsForClaim for ${claimId}:`, error);
      throw error;
    }
  }
  
  /**
   * Subscribe to audit events
   */
  private subscribeToAuditEvents(): void {
    // Subscribe to claim_pipeline_audits inserts/updates
    supabase
      .channel('audit-alerts')
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'claim_pipeline_audits' 
        },
        async (payload) => {
          try {
            const auditData = payload.new;
            
            if (!auditData) return;
            
            const claimId = auditData.claim_id;
            
            // Check if requires_review is true
            if (auditData.requires_review) {
              await this.generateAlert({
                severity: auditData.overall_confidence < 50 
                  ? AlertSeverity.ERROR 
                  : AlertSeverity.WARNING,
                title: 'Claim Requires Review',
                message: `Claim ${claimId} requires review: ${auditData.review_reason || 'No reason provided'}`,
                source: 'claim_audit',
                sourceId: claimId,
                metadata: {
                  auditId: auditData.audit_id,
                  confidence: auditData.overall_confidence,
                  status: auditData.overall_status,
                  reason: auditData.review_reason
                }
              });
            }
            
            // Check confidence thresholds
            await this.checkClaimThresholds(claimId);
          } catch (error) {
            console.error('Error processing audit event for alerts:', error);
          }
        }
      )
      .subscribe();
      
    // Subscribe to claim_stage_verifications for failures
    supabase
      .channel('stage-alerts')
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'claim_stage_verifications' 
        },
        async (payload) => {
          try {
            const verificationData = payload.new;
            
            if (!verificationData) return;
            
            // Check for stage failures
            if (verificationData.stage_status === 'FAILURE') {
              // Get the audit to get the claim ID
              const { data: auditData, error: auditError } = await supabase
                .from('claim_pipeline_audits')
                .select('claim_id')
                .eq('audit_id', verificationData.audit_id)
                .single();
                
              if (auditError || !auditData) {
                console.error('Error fetching audit for stage failure alert:', auditError);
                return;
              }
              
              const claimId = auditData.claim_id;
              
              await this.generateAlert({
                severity: AlertSeverity.ERROR,
                title: `Stage Verification Failed: ${verificationData.pipeline_stage}`,
                message: `Claim ${claimId} failed stage verification: ${verificationData.error_message || 'No error message provided'}`,
                source: 'stage_verification',
                sourceId: verificationData.verification_id,
                metadata: {
                  auditId: verificationData.audit_id,
                  stage: verificationData.pipeline_stage,
                  confidence: verificationData.stage_confidence,
                  claimId
                }
              });
            }
          } catch (error) {
            console.error('Error processing stage verification event for alerts:', error);
          }
        }
      )
      .subscribe();
  }
  
  /**
   * Load alert thresholds from the database
   */
  private async loadAlertThresholds(): Promise<void> {
    try {
      const { data, error } = await supabase
        .from('verification_settings')
        .select('*')
        .like('setting_key', 'threshold.%');
        
      if (error) {
        console.error('Error loading alert thresholds:', error);
        throw error;
      }
      
      // Update thresholds from database
      for (const setting of data || []) {
        const key = setting.setting_key.replace('threshold.', '');
        const value = parseFloat(setting.setting_value);
        
        if (!isNaN(value)) {
          this.alertThresholds[key] = value;
        }
      }
    } catch (error) {
      console.error('Error in loadAlertThresholds:', error);
      throw error;
    }
  }
  
  /**
   * Map database alert to notification object
   * @param dbAlert Database alert record
   * @returns Alert notification
   */
  private mapDbAlertToNotification(dbAlert: any): AlertNotification {
    return {
      id: dbAlert.alert_id,
      severity: dbAlert.severity as AlertSeverity,
      title: dbAlert.title,
      message: dbAlert.message,
      source: dbAlert.source,
      sourceId: dbAlert.source_id,
      timestamp: dbAlert.timestamp,
      metadata: dbAlert.metadata,
      acknowledged: dbAlert.acknowledged,
      acknowledgedBy: dbAlert.acknowledged_by,
      acknowledgedAt: dbAlert.acknowledged_at
    };
  }
  
  /**
   * Get severity level based on confidence score
   * @param confidence Confidence score
   * @param threshold Threshold value
   * @returns Appropriate severity level
   */
  private getSeverityForConfidence(confidence: number, threshold: number): AlertSeverity {
    if (confidence < threshold * 0.6) {
      return AlertSeverity.CRITICAL;
    } else if (confidence < threshold * 0.8) {
      return AlertSeverity.ERROR;
    } else if (confidence < threshold * 0.9) {
      return AlertSeverity.WARNING;
    } else {
      return AlertSeverity.INFO;
    }
  }
}

export default AlertGenerator;
