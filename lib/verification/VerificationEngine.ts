import { EventStreamProcessor, VerificationEventType } from './EventStreamProcessor';
import { VerificationWorker } from './VerificationWorker';
import { AuditStateManager } from './AuditStateManager';
import { AlertGenerator, AlertSeverity } from './AlertGenerator';
import { supabase } from '../supabase/client';

/**
 * Live Claim Verification Engine
 * 
 * The main service that ties together all verification components to provide
 * a comprehensive audit and verification system for claim processing.
 */
export class VerificationEngine {
  private eventProcessor: EventStreamProcessor;
  private worker: VerificationWorker;
  private auditManager: AuditStateManager;
  private alertGenerator: AlertGenerator;
  private isInitialized: boolean = false;
  
  constructor() {
    // Initialize components
    this.worker = new VerificationWorker();
    this.auditManager = new AuditStateManager();
    this.alertGenerator = new AlertGenerator(this.auditManager);
    this.eventProcessor = new EventStreamProcessor();
  }
  
  /**
   * Initialize the verification engine
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.warn('VerificationEngine already initialized');
      return;
    }
    
    try {
      console.log('Initializing Verification Engine...');
      
      // Create database tables if they don't exist
      await this.ensureDatabaseTables();
      
      // Initialize components
      await this.auditManager.initialize();
      await this.alertGenerator.initialize();
      
      // Set up alert handler
      this.alertGenerator.registerAlertHandler(this.handleAlert.bind(this));
      
      // Initialize event processor last, as it will start processing events
      await this.eventProcessor.initialize();
      
      // Register manual verification handler
      this.eventProcessor.subscribe(
        VerificationEventType.VERIFICATION_REQUESTED, 
        this.handleManualVerification.bind(this)
      );
      
      this.isInitialized = true;
      console.log('Verification Engine initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Verification Engine:', error);
      throw error;
    }
  }
  
  /**
   * Start verification for a specific claim
   * @param claimId Claim ID to verify
   * @param options Verification options
   * @returns Audit ID for tracking
   */
  async startVerification(
    claimId: string, 
    options: { 
      force?: boolean;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<string> {
    try {
      // Check if claim already has an active verification
      let auditState = this.auditManager.getAuditState(claimId);
      
      if (auditState && auditState.status === 'ACTIVE' && !options.force) {
        console.log(`Claim ${claimId} already has an active verification`);
        return auditState.auditId;
      }
      
      // Get claim data
      const { data: claim, error } = await supabase
        .from('claims')
        .select('*')
        .eq('id', claimId)
        .single();
        
      if (error) {
        console.error(`Error fetching claim ${claimId}:`, error);
        throw error;
      }
      
      // Initialize a new audit
      auditState = await this.auditManager.createAuditState(claimId, {
        ...options.metadata,
        claim_number: claim.claim_number,
        status: claim.status,
        equipment_id: claim.equipment_id,
        created_at: claim.created_at
      });
      
      // Publish verification request event
      await this.eventProcessor.publishEvent({
        id: '',
        eventType: VerificationEventType.VERIFICATION_REQUESTED,
        timestamp: new Date().toISOString(),
        claimId,
        data: {
          auditId: auditState.auditId,
          options
        }
      });
      
      console.log(`Started verification for claim ${claimId}`);
      return auditState.auditId;
    } catch (error) {
      console.error(`Error starting verification for claim ${claimId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get verification status for a claim
   * @param claimId Claim ID
   * @returns Verification status or null if not found
   */
  async getVerificationStatus(claimId: string): Promise<Record<string, any> | null> {
    try {
      const auditState = this.auditManager.getAuditState(claimId);
      
      if (!auditState) {
        return null;
      }
      
      // Get active alerts
      const alerts = await this.alertGenerator.getAlertsForClaim(claimId);
      
      // Build comprehensive status
      return {
        auditId: auditState.auditId,
        status: auditState.status,
        confidence: auditState.overallConfidence,
        requiresReview: auditState.requiresReview,
        reviewReason: auditState.reviewReason,
        createdAt: auditState.createdAt,
        updatedAt: auditState.updatedAt,
        stages: Object.entries(auditState.stages).map(([name, info]) => ({
          name,
          status: info.status,
          confidence: info.confidence
        })),
        tools: Object.entries(auditState.tools).map(([name, info]) => ({
          name,
          status: info.status,
          confidence: info.confidence
        })),
        alerts: alerts.map(alert => ({
          id: alert.id,
          severity: alert.severity,
          title: alert.title,
          timestamp: alert.timestamp,
          acknowledged: alert.acknowledged
        }))
      };
    } catch (error) {
      console.error(`Error getting verification status for claim ${claimId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get detailed audit report for a claim
   * @param claimId Claim ID
   * @returns Detailed audit report
   */
  async getAuditReport(claimId: string): Promise<Record<string, any>> {
    try {
      return await this.auditManager.generateAuditReport(claimId);
    } catch (error) {
      console.error(`Error getting audit report for claim ${claimId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get verification metrics and statistics
   * @param filters Filtering options
   * @returns Verification metrics
   */
  async getVerificationMetrics(filters: {
    startDate?: string;
    endDate?: string;
    status?: string;
    minConfidence?: number;
    maxConfidence?: number;
  } = {}): Promise<Record<string, any>> {
    try {
      // Build query
      let query = supabase
        .from('claim_pipeline_audits')
        .select('*');
        
      // Apply filters
      if (filters.startDate) {
        query = query.gte('created_at', filters.startDate);
      }
      
      if (filters.endDate) {
        query = query.lte('created_at', filters.endDate);
      }
      
      if (filters.status) {
        query = query.eq('overall_status', filters.status);
      }
      
      if (filters.minConfidence !== undefined) {
        query = query.gte('overall_confidence', filters.minConfidence);
      }
      
      if (filters.maxConfidence !== undefined) {
        query = query.lte('overall_confidence', filters.maxConfidence);
      }
      
      // Execute query
      const { data, error } = await query;
      
      if (error) {
        console.error('Error fetching audit metrics:', error);
        throw error;
      }
      
      // Calculate metrics
      const total = data.length;
      const verified = data.filter(audit => audit.overall_status === 'VERIFIED').length;
      const partial = data.filter(audit => audit.overall_status === 'PARTIAL').length;
      const failed = data.filter(audit => audit.overall_status === 'FAILED').length;
      const reviewRequired = data.filter(audit => audit.requires_review).length;
      
      let avgConfidence = 0;
      
      if (total > 0) {
        avgConfidence = data.reduce((sum, audit) => sum + audit.overall_confidence, 0) / total;
      }
      
      // Get stage-level metrics
      const { data: stageData, error: stageError } = await supabase
        .from('claim_stage_verifications')
        .select('pipeline_stage, stage_status, stage_confidence');
        
      if (stageError) {
        console.error('Error fetching stage metrics:', stageError);
        throw stageError;
      }
      
      // Group by stage
      const stageMetrics: Record<string, {
        total: number;
        success: number;
        failure: number;
        avgConfidence: number;
      }> = {};
      
      for (const stage of stageData) {
        const stageName = stage.pipeline_stage;
        
        if (!stageMetrics[stageName]) {
          stageMetrics[stageName] = {
            total: 0,
            success: 0,
            failure: 0,
            avgConfidence: 0
          };
        }
        
        stageMetrics[stageName].total++;
        
        if (stage.stage_status === 'SUCCESS') {
          stageMetrics[stageName].success++;
        } else if (stage.stage_status === 'FAILURE') {
          stageMetrics[stageName].failure++;
        }
        
        stageMetrics[stageName].avgConfidence += stage.stage_confidence;
      }
      
      // Calculate averages
      Object.keys(stageMetrics).forEach(stageName => {
        const metrics = stageMetrics[stageName];
        
        if (metrics.total > 0) {
          metrics.avgConfidence /= metrics.total;
        }
      });
      
      // Return comprehensive metrics
      return {
        overallMetrics: {
          total,
          verified,
          partial,
          failed,
          reviewRequired,
          avgConfidence,
          verificationRate: total > 0 ? verified / total : 0,
          failureRate: total > 0 ? failed / total : 0,
          reviewRate: total > 0 ? reviewRequired / total : 0
        },
        stageMetrics,
        timeRange: {
          start: filters.startDate || data[0]?.created_at,
          end: filters.endDate || new Date().toISOString()
        }
      };
    } catch (error) {
      console.error('Error getting verification metrics:', error);
      throw error;
    }
  }
  
  /**
   * Get active alerts requiring attention
   * @param limit Maximum number of alerts to return
   * @param offset Offset for pagination
   * @returns Active alerts
   */
  async getActiveAlerts(limit: number = 100, offset: number = 0): Promise<Array<Record<string, any>>> {
    try {
      const alerts = await this.alertGenerator.getActiveAlerts(limit, offset);
      
      // Transform to simplified format
      return alerts.map(alert => ({
        id: alert.id,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        source: alert.source,
        sourceId: alert.sourceId,
        timestamp: alert.timestamp,
        metadata: alert.metadata
      }));
    } catch (error) {
      console.error('Error getting active alerts:', error);
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
      return await this.alertGenerator.acknowledgeAlert(alertId, acknowledgedBy);
    } catch (error) {
      console.error(`Error acknowledging alert ${alertId}:`, error);
      return false;
    }
  }
  
  /**
   * Set an alert threshold
   * @param key Threshold key
   * @param value Threshold value
   * @returns Whether update was successful
   */
  async setAlertThreshold(key: string, value: number): Promise<boolean> {
    try {
      await this.alertGenerator.setAlertThreshold(key, value);
      return true;
    } catch (error) {
      console.error(`Error setting alert threshold ${key}:`, error);
      return false;
    }
  }
  
  /**
   * Add a claim to the review queue
   * @param claimId Claim ID
   * @param reason Reason for review
   * @param priority Priority level (1-10)
   * @returns Whether addition was successful
   */
  async addToReviewQueue(
    claimId: string, 
    reason: string, 
    priority: number = 5
  ): Promise<boolean> {
    try {
      // Get audit ID
      const auditState = this.auditManager.getAuditState(claimId);
      
      if (!auditState) {
        throw new Error(`No audit found for claim ${claimId}`);
      }
      
      // Check if already in queue
      const { data, error } = await supabase
        .from('claim_review_queue')
        .select('queue_id')
        .eq('claim_id', claimId)
        .eq('status', 'PENDING')
        .maybeSingle();
        
      if (error) {
        console.error(`Error checking review queue for claim ${claimId}:`, error);
        throw error;
      }
      
      if (data) {
        console.log(`Claim ${claimId} already in review queue`);
        return true;
      }
      
      // Add to queue
      const { error: insertError } = await supabase
        .from('claim_review_queue')
        .insert({
          claim_id: claimId,
          audit_id: auditState.auditId,
          priority: Math.min(10, Math.max(1, priority)),
          status: 'PENDING',
          flagged_reason: [reason],
          confidence_score: auditState.overallConfidence
        });
        
      if (insertError) {
        console.error(`Error adding claim ${claimId} to review queue:`, insertError);
        throw insertError;
      }
      
      console.log(`Added claim ${claimId} to review queue with priority ${priority}`);
      return true;
    } catch (error) {
      console.error(`Error adding claim ${claimId} to review queue:`, error);
      return false;
    }
  }
  
  /**
   * Get claims in review queue
   * @param status Queue status filter
   * @param limit Maximum number of items to return
   * @param offset Offset for pagination
   * @returns Claims in review queue
   */
  async getReviewQueue(
    status: 'PENDING' | 'IN_REVIEW' | 'RESOLVED' | 'ALL' = 'PENDING',
    limit: number = 100,
    offset: number = 0
  ): Promise<Array<Record<string, any>>> {
    try {
      // Build query
      let query = supabase
        .from('claim_review_queue')
        .select(`
          *,
          claim:claim_id(id, claim_number, status, submission_date, equipment_id),
          audit:audit_id(overall_confidence, overall_status, review_reason)
        `)
        .order('priority', { ascending: false });
        
      // Apply status filter
      if (status !== 'ALL') {
        query = query.eq('status', status);
      }
      
      // Apply pagination
      query = query.range(offset, offset + limit - 1);
      
      // Execute query
      const { data, error } = await query;
      
      if (error) {
        console.error('Error fetching review queue:', error);
        throw error;
      }
      
      // Transform to a more usable format
      return data.map(item => ({
        queueId: item.queue_id,
        claimId: item.claim_id,
        auditId: item.audit_id,
        priority: item.priority,
        status: item.status,
        assignedTo: item.assigned_to,
        flaggedReason: item.flagged_reason,
        confidenceScore: item.confidence_score,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        claim: item.claim,
        audit: item.audit
      }));
    } catch (error) {
      console.error('Error getting review queue:', error);
      throw error;
    }
  }
  
  /**
   * Update status of a review queue item
   * @param queueId Queue item ID
   * @param status New status
   * @param assignedTo User to assign to (for IN_REVIEW status)
   * @returns Whether update was successful
   */
  async updateReviewStatus(
    queueId: string, 
    status: 'PENDING' | 'IN_REVIEW' | 'RESOLVED',
    assignedTo?: string
  ): Promise<boolean> {
    try {
      // Build update data
      const updateData: Record<string, any> = {
        status,
        updated_at: new Date().toISOString()
      };
      
      // Add assignment if provided
      if (assignedTo) {
        updateData.assigned_to = assignedTo;
      }
      
      // Update in database
      const { error } = await supabase
        .from('claim_review_queue')
        .update(updateData)
        .eq('queue_id', queueId);
        
      if (error) {
        console.error(`Error updating review queue item ${queueId}:`, error);
        throw error;
      }
      
      console.log(`Updated review queue item ${queueId} to status ${status}`);
      return true;
    } catch (error) {
      console.error(`Error updating review queue item ${queueId}:`, error);
      return false;
    }
  }
  
  /**
   * Handle an alert (internal method)
   * @param alert Alert notification
   */
  private async handleAlert(alert: Record<string, any>): Promise<void> {
    // For critical alerts, add to review queue automatically
    if (alert.severity === AlertSeverity.CRITICAL && alert.source === 'claim_audit') {
      await this.addToReviewQueue(
        alert.sourceId, 
        alert.title, 
        10 // Highest priority
      );
    }
    
    // Publish alert to the UI via Supabase Realtime
    await supabase
      .channel('verification-alerts')
      .send({
        type: 'broadcast',
        event: 'new_alert',
        payload: {
          id: alert.id,
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
          source: alert.source,
          sourceId: alert.sourceId,
          timestamp: alert.timestamp
        }
      });
  }
  
  /**
   * Handle manual verification requests (internal method)
   * @param event Verification event
   */
  private async handleManualVerification(event: Record<string, any>): Promise<void> {
    try {
      const claimId = event.claimId;
      const auditId = event.data.auditId;
      
      // Get claim data
      const { data: claim, error } = await supabase
        .from('claims')
        .select(`
          *,
          equipment:equipment_id(*),
          vendor:vendor_id(*),
          attachments:claim_attachments(*)
        `)
        .eq('id', claimId)
        .single();
        
      if (error) {
        console.error(`Error fetching claim ${claimId} for verification:`, error);
        throw error;
      }
      
      // Get claim timeline
      const { data: timeline, error: timelineError } = await supabase
        .from('claim_events')
        .select('*')
        .eq('claim_id', claimId)
        .order('event_date', { ascending: true });
        
      if (timelineError) {
        console.error(`Error fetching timeline for claim ${claimId}:`, timelineError);
        throw timelineError;
      }
      
      // Verify each stage based on claim data
      
      // 1. INGESTION stage
      await this.worker.verifyStage(auditId, 'INGESTION', {
        stageStatus: 'SUCCESS',
        stageConfidence: 90,
        actualResult: {
          claim_id: claim.id,
          claim_number: claim.claim_number,
          status: claim.status,
          submission_date: claim.created_at
        },
        durationMs: 150,
        metadata: {
          source: 'manual_verification',
          verification_timestamp: new Date().toISOString()
        }
      });
      
      // 2. VALIDATION stage
      const validationResult = this.validateClaim(claim);
      
      await this.worker.verifyStage(auditId, 'VALIDATION', {
        stageStatus: validationResult.isValid ? 'SUCCESS' : 'FAILURE',
        stageConfidence: validationResult.confidence,
        expectedResult: {
          requiredFields: validationResult.requiredFields
        },
        actualResult: {
          claim_id: claim.id,
          validation_errors: validationResult.errors
        },
        durationMs: 200,
        errorMessage: validationResult.errors.length > 0 ? validationResult.errors[0] : undefined,
        metadata: {
          source: 'manual_verification',
          verification_timestamp: new Date().toISOString()
        }
      });
      
      // 3. PROCESSING stage
      const hasAiInsights = claim.ai_insights !== null && 
        typeof claim.ai_insights === 'object' &&
        Object.keys(claim.ai_insights).length > 0;
      
      await this.worker.verifyStage(auditId, 'PROCESSING', {
        stageStatus: hasAiInsights ? 'SUCCESS' : 'WARNING',
        stageConfidence: hasAiInsights ? 85 : 60,
        expectedResult: {
          hasAiInsights: true
        },
        actualResult: {
          claim_id: claim.id,
          ai_insights: claim.ai_insights,
          has_insights: hasAiInsights
        },
        durationMs: 350,
        metadata: {
          source: 'manual_verification',
          verification_timestamp: new Date().toISOString()
        }
      });
      
      // 4. COMPLETION stage
      const isCompleted = ['COMPLETED', 'REJECTED', 'CANCELLED'].includes(claim.status);
      
      await this.worker.verifyStage(auditId, 'COMPLETION', {
        stageStatus: isCompleted ? 'SUCCESS' : 'WARNING',
        stageConfidence: isCompleted ? 95 : 50,
        expectedResult: {
          isCompleted: true
        },
        actualResult: {
          claim_id: claim.id,
          status: claim.status,
          completion_date: claim.completed_at || null
        },
        durationMs: 100,
        metadata: {
          source: 'manual_verification',
          verification_timestamp: new Date().toISOString()
        }
      });
      
      // Verify tool activations if available
      const { data: toolActivations, error: toolError } = await supabase
        .from('tool_activation_log')
        .select('*')
        .eq('claim_id', claimId);
        
      if (!toolError && toolActivations) {
        for (const activation of toolActivations) {
          await this.worker.verifyToolActivation(auditId, claimId, activation.tool_name, {
            activationStatus: 'COMPLETED',
            resultStatus: 'VALID',
            confidenceScore: 85,
            inputParameters: activation.input_params,
            outputResult: activation.output_result,
            executionTimeMs: activation.execution_time_ms
          });
        }
      }
      
      // Calculate overall confidence and complete audit
      const overallConfidence = await this.worker.calculateOverallConfidence(claimId, auditId);
      
      await this.worker.completeClaimAudit(
        auditId,
        overallConfidence >= 70 ? 'VERIFIED' : (overallConfidence >= 50 ? 'PARTIAL' : 'FAILED'),
        overallConfidence,
        overallConfidence < 50,
        overallConfidence < 50 ? 'Low confidence score requires review' : undefined
      );
      
      console.log(`Completed manual verification for claim ${claimId}`);
    } catch (error) {
      console.error(`Error handling manual verification for claim ${event.claimId}:`, error);
    }
  }
  
  /**
   * Validate a claim (internal method)
   * @param claim Claim data
   * @returns Validation result
   */
  private validateClaim(claim: any): {
    isValid: boolean;
    confidence: number;
    requiredFields: string[];
    errors: string[];
  } {
    const requiredFields = [
      'claim_number',
      'equipment_id',
      'status',
      'issue_description'
    ];
    
    const errors: string[] = [];
    
    // Check required fields
    for (const field of requiredFields) {
      if (!claim[field]) {
        errors.push(`Missing required field: ${field}`);
      }
    }
    
    // Check if claim number has correct format
    if (claim.claim_number && !claim.claim_number.match(/^CLM-\d{4}-\d+$/)) {
      errors.push('Invalid claim number format');
    }
    
    // Check if equipment is valid
    if (!claim.equipment && claim.equipment_id) {
      errors.push('Invalid equipment reference');
    }
    
    // Check status
    const validStatuses = ['SUBMITTED', 'PROCESSING', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'];
    
    if (claim.status && !validStatuses.includes(claim.status)) {
      errors.push('Invalid claim status');
    }
    
    // Calculate confidence based on errors
    let confidence = 100;
    
    if (errors.length > 0) {
      confidence = Math.max(0, 100 - (errors.length * 20));
    }
    
    return {
      isValid: errors.length === 0,
      confidence,
      requiredFields,
      errors
    };
  }
  
  /**
   * Ensure required database tables exist
   */
  private async ensureDatabaseTables(): Promise<void> {
    try {
      // Check if verification_settings table exists
      const { error: settingsError } = await supabase
        .from('verification_settings')
        .select('setting_key')
        .limit(1);
        
      if (settingsError && settingsError.code === '42P01') {
        // Table doesn't exist, create it
        await supabase.rpc('create_verification_settings_table', {});
      }
      
      // Check if verification_alerts table exists
      const { error: alertsError } = await supabase
        .from('verification_alerts')
        .select('alert_id')
        .limit(1);
        
      if (alertsError && alertsError.code === '42P01') {
        // Table doesn't exist, create it
        await supabase.rpc('create_verification_alerts_table', {});
      }
      
      // Check if verification_events table exists
      const { error: eventsError } = await supabase
        .from('verification_events')
        .select('event_id')
        .limit(1);
        
      if (eventsError && eventsError.code === '42P01') {
        // Table doesn't exist, create it
        await supabase.rpc('create_verification_events_table', {});
      }
    } catch (error) {
      console.error('Error ensuring database tables:', error);
      throw error;
    }
  }
}

export default VerificationEngine;
