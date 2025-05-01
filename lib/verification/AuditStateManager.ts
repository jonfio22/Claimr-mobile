import { supabase } from '../supabase/client';
import { v4 as uuidv4 } from 'uuid';

/**
 * Audit state record
 */
export interface AuditState {
  auditId: string;
  claimId: string;
  claimVersion: number;
  status: 'ACTIVE' | 'COMPLETED' | 'FAILED';
  stages: {
    [stage: string]: {
      verificationId?: string;
      status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
      confidence: number;
      startTime?: string;
      endTime?: string;
      metadata?: Record<string, any>;
    }
  };
  tools: {
    [tool: string]: {
      activationId?: string;
      status: 'PENDING' | 'TRIGGERED' | 'COMPLETED' | 'FAILED';
      confidence?: number;
      startTime?: string;
      endTime?: string;
      metadata?: Record<string, any>;
    }
  };
  overallConfidence: number;
  requiresReview: boolean;
  reviewReason?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Audit State Manager
 * 
 * Responsible for maintaining verification state of claims throughout
 * the processing lifecycle and generating comprehensive audit trails.
 */
export class AuditStateManager {
  private auditStates: Map<string, AuditState>;
  private auditIdMap: Map<string, string>; // Maps claimId to auditId
  
  constructor() {
    this.auditStates = new Map();
    this.auditIdMap = new Map();
  }
  
  /**
   * Initialize the Audit State Manager
   */
  async initialize(): Promise<void> {
    try {
      console.log('Initializing Audit State Manager...');
      
      // Load active audits from database
      await this.loadActiveAudits();
      
      console.log(`Loaded ${this.auditStates.size} active audits`);
    } catch (error) {
      console.error('Failed to initialize Audit State Manager:', error);
      throw error;
    }
  }
  
  /**
   * Create a new audit state for a claim
   * @param claimId Claim ID
   * @param metadata Initial metadata
   * @returns Newly created audit state
   */
  async createAuditState(claimId: string, metadata?: Record<string, any>): Promise<AuditState> {
    try {
      // Check if audit already exists for this claim
      const existingAuditId = this.auditIdMap.get(claimId);
      
      if (existingAuditId) {
        const existingState = this.auditStates.get(existingAuditId);
        
        if (existingState && existingState.status === 'ACTIVE') {
          return existingState;
        }
      }
      
      // Get claim version
      const { data: claimData, error: claimError } = await supabase
        .from('claims')
        .select('version')
        .eq('id', claimId)
        .single();
        
      if (claimError) {
        console.error(`Error fetching claim version for ${claimId}:`, claimError);
        throw claimError;
      }
      
      const claimVersion = claimData?.version || 1;
      
      // Create audit record in database
      const { data, error } = await supabase
        .from('claim_pipeline_audits')
        .insert({
          claim_id: claimId,
          claim_version: claimVersion,
          audit_timestamp: new Date().toISOString(),
          verification_complete: false,
          overall_status: 'PARTIAL',
          overall_confidence: 50,
          requires_review: false,
          claim_metadata: metadata || {}
        })
        .select('audit_id')
        .single();
        
      if (error) {
        console.error('Error creating audit record:', error);
        throw error;
      }
      
      const auditId = data.audit_id;
      
      // Create initial audit state
      const timestamp = new Date().toISOString();
      const auditState: AuditState = {
        auditId,
        claimId,
        claimVersion,
        status: 'ACTIVE',
        stages: {
          'INGESTION': { status: 'PENDING', confidence: 0 },
          'VALIDATION': { status: 'PENDING', confidence: 0 },
          'PROCESSING': { status: 'PENDING', confidence: 0 },
          'COMPLETION': { status: 'PENDING', confidence: 0 }
        },
        tools: {},
        overallConfidence: 50,
        requiresReview: false,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      
      // Store in memory
      this.auditStates.set(auditId, auditState);
      this.auditIdMap.set(claimId, auditId);
      
      console.log(`Created new audit state for claim ${claimId} with ID ${auditId}`);
      
      return auditState;
    } catch (error) {
      console.error(`Error creating audit state for claim ${claimId}:`, error);
      throw error;
    }
  }
  
  /**
   * Get the current audit state for a claim
   * @param claimId Claim ID
   * @returns Audit state or null if not found
   */
  getAuditState(claimId: string): AuditState | null {
    const auditId = this.auditIdMap.get(claimId);
    
    if (!auditId) {
      return null;
    }
    
    return this.auditStates.get(auditId) || null;
  }
  
  /**
   * Get an audit state by its ID
   * @param auditId Audit ID
   * @returns Audit state or null if not found
   */
  getAuditStateById(auditId: string): AuditState | null {
    return this.auditStates.get(auditId) || null;
  }
  
  /**
   * Update stage verification in an audit state
   * @param auditId Audit ID
   * @param stage Pipeline stage
   * @param verificationId Stage verification ID
   * @param status Stage status
   * @param confidence Confidence score
   * @param metadata Additional metadata
   * @returns Updated audit state
   */
  async updateStageVerification(
    auditId: string,
    stage: string,
    verificationId: string,
    status: 'COMPLETED' | 'FAILED',
    confidence: number,
    metadata?: Record<string, any>
  ): Promise<AuditState | null> {
    const auditState = this.auditStates.get(auditId);
    
    if (!auditState) {
      console.error(`Audit state not found for ID ${auditId}`);
      return null;
    }
    
    // Update stage information
    auditState.stages[stage] = {
      ...auditState.stages[stage],
      verificationId,
      status,
      confidence,
      endTime: new Date().toISOString(),
      metadata: {
        ...auditState.stages[stage]?.metadata,
        ...metadata
      }
    };
    
    // Update overall audit state
    auditState.updatedAt = new Date().toISOString();
    
    // Recalculate overall confidence
    auditState.overallConfidence = this.calculateOverallConfidence(auditState);
    
    // Check if all stages are complete
    const allStagesComplete = Object.values(auditState.stages).every(
      stage => stage.status === 'COMPLETED' || stage.status === 'FAILED'
    );
    
    // Check if any stages failed
    const anyStagesFailed = Object.values(auditState.stages).some(
      stage => stage.status === 'FAILED'
    );
    
    // Update audit status if needed
    if (allStagesComplete) {
      auditState.status = anyStagesFailed ? 'FAILED' : 'COMPLETED';
      
      // Update in database
      await this.completeAudit(auditState);
    } else {
      // Save in-progress update
      await this.persistAuditState(auditState);
    }
    
    // Update in memory
    this.auditStates.set(auditId, auditState);
    
    return auditState;
  }
  
  /**
   * Update tool activation in an audit state
   * @param auditId Audit ID
   * @param toolName Tool name
   * @param activationId Tool activation ID
   * @param status Tool status
   * @param confidence Confidence score
   * @param metadata Additional metadata
   * @returns Updated audit state
   */
  async updateToolActivation(
    auditId: string,
    toolName: string,
    activationId: string,
    status: 'TRIGGERED' | 'COMPLETED' | 'FAILED',
    confidence?: number,
    metadata?: Record<string, any>
  ): Promise<AuditState | null> {
    const auditState = this.auditStates.get(auditId);
    
    if (!auditState) {
      console.error(`Audit state not found for ID ${auditId}`);
      return null;
    }
    
    // Initialize tool info if not present
    if (!auditState.tools[toolName]) {
      auditState.tools[toolName] = {
        status: 'PENDING',
        confidence: 0
      };
    }
    
    // Update tool information
    auditState.tools[toolName] = {
      ...auditState.tools[toolName],
      activationId,
      status,
      confidence: confidence !== undefined ? confidence : auditState.tools[toolName].confidence,
      // Only set startTime for TRIGGERED status
      ...(status === 'TRIGGERED' ? { startTime: new Date().toISOString() } : {}),
      // Only set endTime for COMPLETED or FAILED status
      ...(status === 'COMPLETED' || status === 'FAILED' ? { endTime: new Date().toISOString() } : {}),
      metadata: {
        ...auditState.tools[toolName]?.metadata,
        ...metadata
      }
    };
    
    // Update overall audit state
    auditState.updatedAt = new Date().toISOString();
    
    // Persist changes
    await this.persistAuditState(auditState);
    
    // Update in memory
    this.auditStates.set(auditId, auditState);
    
    return auditState;
  }
  
  /**
   * Complete an audit
   * @param auditState Audit state to complete
   */
  async completeAudit(auditState: AuditState): Promise<void> {
    try {
      // Calculate final confidence
      const overallConfidence = this.calculateOverallConfidence(auditState);
      
      // Determine if review is required
      const requiresReview = overallConfidence < 70 || 
        Object.values(auditState.stages).some(stage => stage.status === 'FAILED');
      
      // Generate review reason if needed
      let reviewReason: string | undefined;
      
      if (requiresReview) {
        if (overallConfidence < 70) {
          reviewReason = `Low confidence score (${overallConfidence.toFixed(2)})`;
        } else {
          const failedStages = Object.entries(auditState.stages)
            .filter(([_, info]) => info.status === 'FAILED')
            .map(([stage, _]) => stage);
            
          reviewReason = `Failed stages: ${failedStages.join(', ')}`;
        }
      }
      
      // Update in database
      const { error } = await supabase
        .from('claim_pipeline_audits')
        .update({
          verification_complete: true,
          overall_status: auditState.status === 'FAILED' ? 'FAILED' : 
            (overallConfidence >= 70 ? 'VERIFIED' : 'PARTIAL'),
          overall_confidence: overallConfidence,
          requires_review: requiresReview,
          review_reason: reviewReason,
          updated_at: new Date().toISOString()
        })
        .eq('audit_id', auditState.auditId);
        
      if (error) {
        console.error(`Error completing audit ${auditState.auditId}:`, error);
        throw error;
      }
      
      console.log(`Completed audit ${auditState.auditId} for claim ${auditState.claimId}`);
      
      // Final updates to the audit state
      auditState.overallConfidence = overallConfidence;
      auditState.requiresReview = requiresReview;
      auditState.reviewReason = reviewReason;
      auditState.updatedAt = new Date().toISOString();
      
      // Update in memory
      this.auditStates.set(auditState.auditId, auditState);
    } catch (error) {
      console.error(`Error completing audit ${auditState.auditId}:`, error);
      throw error;
    }
  }
  
  /**
   * Generate an audit report for a claim
   * @param claimId Claim ID
   * @returns Comprehensive audit report
   */
  async generateAuditReport(claimId: string): Promise<Record<string, any>> {
    try {
      const auditId = this.auditIdMap.get(claimId);
      
      if (!auditId) {
        throw new Error(`No audit found for claim ${claimId}`);
      }
      
      const auditState = this.auditStates.get(auditId);
      
      if (!auditState) {
        throw new Error(`Audit state not found for ID ${auditId}`);
      }
      
      // Get detailed verification records
      const { data: stageVerifications, error: stageError } = await supabase
        .from('claim_stage_verifications')
        .select('*')
        .eq('audit_id', auditId)
        .order('verification_timestamp', { ascending: true });
        
      if (stageError) {
        console.error(`Error fetching stage verifications for audit ${auditId}:`, stageError);
        throw stageError;
      }
      
      const { data: toolActivations, error: toolError } = await supabase
        .from('tool_activation_audits')
        .select('*')
        .eq('audit_id', auditId)
        .order('activation_timestamp', { ascending: true });
        
      if (toolError) {
        console.error(`Error fetching tool activations for audit ${auditId}:`, toolError);
        throw toolError;
      }
      
      // Build comprehensive report
      return {
        audit: {
          id: auditState.auditId,
          claimId: auditState.claimId,
          claimVersion: auditState.claimVersion,
          status: auditState.status,
          overallConfidence: auditState.overallConfidence,
          requiresReview: auditState.requiresReview,
          reviewReason: auditState.reviewReason,
          createdAt: auditState.createdAt,
          updatedAt: auditState.updatedAt
        },
        stages: Object.entries(auditState.stages).map(([stageName, stageInfo]) => ({
          name: stageName,
          status: stageInfo.status,
          confidence: stageInfo.confidence,
          startTime: stageInfo.startTime,
          endTime: stageInfo.endTime,
          verificationId: stageInfo.verificationId,
          metadata: stageInfo.metadata
        })),
        tools: Object.entries(auditState.tools).map(([toolName, toolInfo]) => ({
          name: toolName,
          status: toolInfo.status,
          confidence: toolInfo.confidence,
          startTime: toolInfo.startTime,
          endTime: toolInfo.endTime,
          activationId: toolInfo.activationId,
          metadata: toolInfo.metadata
        })),
        verifications: stageVerifications || [],
        activations: toolActivations || [],
        summary: {
          stageCount: Object.keys(auditState.stages).length,
          toolCount: Object.keys(auditState.tools).length,
          verificationCount: stageVerifications?.length || 0,
          activationCount: toolActivations?.length || 0,
          completedAt: auditState.status !== 'ACTIVE' ? auditState.updatedAt : undefined,
          processingDuration: auditState.status !== 'ACTIVE' 
            ? this.calculateProcessingDuration(auditState) 
            : undefined
        }
      };
    } catch (error) {
      console.error(`Error generating audit report for claim ${claimId}:`, error);
      throw error;
    }
  }
  
  /**
   * Load active audits from the database
   */
  private async loadActiveAudits(): Promise<void> {
    try {
      // Get active audits (not completed or within the last 24 hours)
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      
      const { data, error } = await supabase
        .from('claim_pipeline_audits')
        .select('*')
        .or(`verification_complete.eq.false,updated_at.gt.${oneDayAgo.toISOString()}`);
        
      if (error) {
        console.error('Error loading active audits:', error);
        throw error;
      }
      
      // Process each audit
      for (const audit of data || []) {
        await this.buildAuditState(audit);
      }
    } catch (error) {
      console.error('Error in loadActiveAudits:', error);
      throw error;
    }
  }
  
  /**
   * Build an audit state from database record
   * @param audit Database audit record
   */
  private async buildAuditState(audit: any): Promise<void> {
    try {
      const auditId = audit.audit_id;
      const claimId = audit.claim_id;
      
      // Get stage verifications
      const { data: stageData, error: stageError } = await supabase
        .from('claim_stage_verifications')
        .select('*')
        .eq('audit_id', auditId);
        
      if (stageError) {
        console.error(`Error fetching stage verifications for audit ${auditId}:`, stageError);
        throw stageError;
      }
      
      // Get tool activations
      const { data: toolData, error: toolError } = await supabase
        .from('tool_activation_audits')
        .select('*')
        .eq('audit_id', auditId);
        
      if (toolError) {
        console.error(`Error fetching tool activations for audit ${auditId}:`, toolError);
        throw toolError;
      }
      
      // Build stages map
      const stages: AuditState['stages'] = {
        'INGESTION': { status: 'PENDING', confidence: 0 },
        'VALIDATION': { status: 'PENDING', confidence: 0 },
        'PROCESSING': { status: 'PENDING', confidence: 0 },
        'COMPLETION': { status: 'PENDING', confidence: 0 }
      };
      
      for (const stage of stageData || []) {
        const stageName = stage.pipeline_stage;
        stages[stageName] = {
          verificationId: stage.verification_id,
          status: this.mapDbStageStatus(stage.stage_status),
          confidence: stage.stage_confidence,
          startTime: stage.created_at,
          endTime: stage.verification_timestamp,
          metadata: stage.metadata
        };
      }
      
      // Build tools map
      const tools: AuditState['tools'] = {};
      
      for (const tool of toolData || []) {
        const toolName = tool.tool_name;
        
        // Only create/update if not exists or this activation is newer
        if (!tools[toolName] || new Date(tool.activation_timestamp) > new Date(tools[toolName].startTime || '')) {
          tools[toolName] = {
            activationId: tool.activation_id,
            status: this.mapDbToolStatus(tool.activation_status),
            confidence: tool.confidence_score,
            startTime: tool.activation_timestamp,
            endTime: tool.activation_status === 'COMPLETED' || tool.activation_status === 'FAILED' 
              ? tool.created_at 
              : undefined,
            metadata: {
              result_status: tool.result_status,
              retry_count: tool.retry_count,
              fallback_used: tool.fallback_used,
              fallback_tool: tool.fallback_tool,
              execution_time_ms: tool.execution_time_ms
            }
          };
        }
      }
      
      // Create audit state
      const auditState: AuditState = {
        auditId,
        claimId,
        claimVersion: audit.claim_version,
        status: audit.verification_complete ? (audit.overall_status === 'FAILED' ? 'FAILED' : 'COMPLETED') : 'ACTIVE',
        stages,
        tools,
        overallConfidence: audit.overall_confidence,
        requiresReview: audit.requires_review,
        reviewReason: audit.review_reason,
        createdAt: audit.created_at,
        updatedAt: audit.updated_at
      };
      
      // Save to memory
      this.auditStates.set(auditId, auditState);
      this.auditIdMap.set(claimId, auditId);
    } catch (error) {
      console.error(`Error building audit state for audit ${audit.audit_id}:`, error);
      throw error;
    }
  }
  
  /**
   * Persist an audit state to the database
   * @param auditState Audit state to persist
   */
  private async persistAuditState(auditState: AuditState): Promise<void> {
    try {
      // Update main audit record
      const { error } = await supabase
        .from('claim_pipeline_audits')
        .update({
          verification_complete: auditState.status !== 'ACTIVE',
          overall_status: auditState.status === 'ACTIVE' ? 'PARTIAL' : 
            (auditState.status === 'FAILED' ? 'FAILED' : 'VERIFIED'),
          overall_confidence: auditState.overallConfidence,
          requires_review: auditState.requiresReview,
          review_reason: auditState.reviewReason,
          updated_at: new Date().toISOString()
        })
        .eq('audit_id', auditState.auditId);
        
      if (error) {
        console.error(`Error persisting audit state ${auditState.auditId}:`, error);
        throw error;
      }
    } catch (error) {
      console.error(`Error in persistAuditState for ${auditState.auditId}:`, error);
      throw error;
    }
  }
  
  /**
   * Calculate overall confidence score from stage and tool scores
   * @param auditState Audit state to evaluate
   * @returns Overall confidence score (0-100)
   */
  private calculateOverallConfidence(auditState: AuditState): number {
    // Get all stage confidences
    const stageScores = Object.values(auditState.stages)
      .filter(stage => stage.status === 'COMPLETED')
      .map(stage => stage.confidence);
      
    // Get all tool confidences
    const toolScores = Object.values(auditState.tools)
      .filter(tool => tool.status === 'COMPLETED' && tool.confidence !== undefined)
      .map(tool => tool.confidence!)
      .filter(score => !isNaN(score));
      
    // If no scores, return default
    if (stageScores.length === 0 && toolScores.length === 0) {
      return 50;
    }
    
    // Calculate stage average
    const stageWeight = 0.6;
    const toolWeight = 0.4;
    
    let overallScore = 0;
    let totalWeight = 0;
    
    if (stageScores.length > 0) {
      const avgStageScore = stageScores.reduce((sum, score) => sum + score, 0) / stageScores.length;
      overallScore += avgStageScore * stageWeight;
      totalWeight += stageWeight;
    }
    
    if (toolScores.length > 0) {
      const avgToolScore = toolScores.reduce((sum, score) => sum + score, 0) / toolScores.length;
      overallScore += avgToolScore * toolWeight;
      totalWeight += toolWeight;
    }
    
    // Normalize by total weight
    return totalWeight > 0 ? overallScore / totalWeight : 50;
  }
  
  /**
   * Calculate processing duration in milliseconds
   * @param auditState Audit state to evaluate
   * @returns Processing duration in milliseconds
   */
  private calculateProcessingDuration(auditState: AuditState): number {
    const startTime = new Date(auditState.createdAt).getTime();
    const endTime = new Date(auditState.updatedAt).getTime();
    
    return endTime - startTime;
  }
  
  /**
   * Map database stage status to internal status
   * @param dbStatus Database status
   * @returns Internal status
   */
  private mapDbStageStatus(dbStatus: string): 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' {
    switch (dbStatus) {
      case 'SUCCESS':
        return 'COMPLETED';
      case 'FAILURE':
        return 'FAILED';
      case 'WARNING':
        return 'IN_PROGRESS';
      default:
        return 'PENDING';
    }
  }
  
  /**
   * Map database tool status to internal status
   * @param dbStatus Database status
   * @returns Internal status
   */
  private mapDbToolStatus(dbStatus: string): 'PENDING' | 'TRIGGERED' | 'COMPLETED' | 'FAILED' {
    switch (dbStatus) {
      case 'TRIGGERED':
        return 'TRIGGERED';
      case 'COMPLETED':
        return 'COMPLETED';
      case 'FAILED':
        return 'FAILED';
      case 'SKIPPED':
        return 'PENDING';
      default:
        return 'PENDING';
    }
  }
}

export default AuditStateManager;
