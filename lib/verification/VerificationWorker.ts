import { supabase } from '../supabase/client';
import { EventType, AnomalyType } from '../mcp/types';
import { v4 as uuidv4 } from 'uuid';

type StageVerificationResult = {
  stageStatus: 'SUCCESS' | 'WARNING' | 'FAILURE';
  stageConfidence: number;
  expectedResult?: Record<string, any>;
  actualResult?: Record<string, any>;
  durationMs?: number;
  errorMessage?: string;
  metadata?: Record<string, any>;
};

type ToolVerificationResult = {
  activationStatus: 'TRIGGERED' | 'COMPLETED' | 'FAILED' | 'SKIPPED';
  resultStatus: 'VALID' | 'INVALID' | 'ERROR';
  confidenceScore?: number;
  inputParameters?: Record<string, any>;
  outputResult?: Record<string, any>;
  errorDetails?: string;
  retryCount?: number;
  fallbackUsed?: boolean;
  fallbackTool?: string;
  executionTimeMs?: number;
};

/**
 * Verification Worker Service
 * 
 * Processes claim events from the stream to verify processing integrity
 * and calculate confidence scores.
 */
export class VerificationWorker {
  /**
   * Initialize a claim audit record
   * @param claimId Claim identifier
   * @param claimMetadata Additional claim metadata
   * @returns Audit ID for tracking
   */
  async initializeClaimAudit(claimId: string, claimMetadata?: Record<string, any>): Promise<string> {
    try {
      const { data, error } = await supabase
        .from('claim_pipeline_audits')
        .insert({
          claim_id: claimId,
          claim_version: 1, // Default to first version
          audit_timestamp: new Date().toISOString(),
          verification_complete: false,
          overall_status: 'PARTIAL',
          overall_confidence: 50, // Start with neutral confidence
          requires_review: false,
          claim_metadata: claimMetadata || {}
        })
        .select('audit_id')
        .single();

      if (error) {
        console.error('Failed to initialize claim audit:', error);
        throw error;
      }

      return data.audit_id;
    } catch (error) {
      console.error('Error in initializeClaimAudit:', error);
      throw error;
    }
  }

  /**
   * Verify a pipeline stage
   * @param auditId The audit ID
   * @param stage Pipeline stage name
   * @param result Verification result
   * @returns The verification ID
   */
  async verifyStage(
    auditId: string, 
    stage: string, 
    result: StageVerificationResult
  ): Promise<string> {
    try {
      const { data, error } = await supabase
        .from('claim_stage_verifications')
        .insert({
          audit_id: auditId,
          pipeline_stage: stage,
          stage_status: result.stageStatus,
          stage_confidence: result.stageConfidence,
          expected_result: result.expectedResult,
          actual_result: result.actualResult,
          verification_timestamp: new Date().toISOString(),
          duration_ms: result.durationMs,
          error_message: result.errorMessage,
          metadata: result.metadata
        })
        .select('verification_id')
        .single();

      if (error) {
        console.error(`Failed to record stage verification for ${stage}:`, error);
        throw error;
      }

      return data.verification_id;
    } catch (error) {
      console.error(`Error in verifyStage for ${stage}:`, error);
      throw error;
    }
  }

  /**
   * Verify a tool activation
   * @param auditId The audit ID
   * @param claimId The claim ID
   * @param toolName Name of the activated tool
   * @param result Tool verification result
   * @returns The activation ID
   */
  async verifyToolActivation(
    auditId: string,
    claimId: string,
    toolName: string,
    result: ToolVerificationResult
  ): Promise<string> {
    try {
      const { data, error } = await supabase
        .from('tool_activation_audits')
        .insert({
          audit_id: auditId,
          claim_id: claimId,
          tool_name: toolName,
          activation_timestamp: new Date().toISOString(),
          activation_status: result.activationStatus,
          result_status: result.resultStatus,
          confidence_score: result.confidenceScore,
          input_parameters: result.inputParameters,
          output_result: result.outputResult,
          error_details: result.errorDetails,
          retry_count: result.retryCount || 0,
          fallback_used: result.fallbackUsed || false,
          fallback_tool: result.fallbackTool,
          execution_time_ms: result.executionTimeMs
        })
        .select('activation_id')
        .single();

      if (error) {
        console.error(`Failed to record tool activation for ${toolName}:`, error);
        throw error;
      }

      return data.activation_id;
    } catch (error) {
      console.error(`Error in verifyToolActivation for ${toolName}:`, error);
      throw error;
    }
  }

  /**
   * Complete a claim audit
   * @param auditId The audit ID
   * @param overallStatus Final status
   * @param overallConfidence Final confidence score
   * @param requiresReview Whether claim needs manual review
   * @param reviewReason Reason for review
   * @returns Success status
   */
  async completeClaimAudit(
    auditId: string,
    overallStatus: 'VERIFIED' | 'PARTIAL' | 'FAILED',
    overallConfidence: number,
    requiresReview: boolean = false,
    reviewReason?: string
  ): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('claim_pipeline_audits')
        .update({
          verification_complete: true,
          overall_status: overallStatus,
          overall_confidence: overallConfidence,
          requires_review: requiresReview,
          review_reason: reviewReason,
          updated_at: new Date().toISOString()
        })
        .eq('audit_id', auditId);

      if (error) {
        console.error('Failed to complete claim audit:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error in completeClaimAudit:', error);
      return false;
    }
  }

  /**
   * Calculate stage confidence score
   * @param stageData Stage data for confidence calculation
   * @returns Confidence score (0-100)
   */
  calculateStageConfidence(stageData: Record<string, any>): number {
    const weights = {
      dataCompleteness: 0.30,
      ruleCompliance: 0.35,
      processingTime: 0.15,
      errorRate: 0.20
    };
    
    // Default scores if metrics aren't provided
    let scores = {
      dataCompleteness: 100,
      ruleCompliance: 100,
      processingTime: 100,
      errorRate: 100
    };
    
    // Calculate completeness score if data is available
    if (stageData.outputs) {
      scores.dataCompleteness = this.evaluateCompleteness(stageData.outputs);
    }
    
    // Check rule compliance if rules are provided
    if (stageData.stage && stageData.outputs) {
      scores.ruleCompliance = this.evaluateRuleCompliance(stageData.stage, stageData.outputs);
    }
    
    // Calculate processing time score if duration data is available
    if (stageData.duration !== undefined && stageData.expectedDuration !== undefined) {
      scores.processingTime = this.evaluateProcessingTime(
        stageData.duration, 
        stageData.expectedDuration
      );
    }
    
    // Calculate error rate score if error data is available
    if (stageData.errors !== undefined) {
      scores.errorRate = this.evaluateErrorRate(stageData.errors);
    }
    
    // Calculate weighted average
    return Object.keys(weights).reduce((total, key) => {
      return total + (weights[key as keyof typeof weights] * scores[key as keyof typeof scores]);
    }, 0);
  }
  
  /**
   * Calculate overall claim confidence score
   * @param claimId Claim ID
   * @returns Promise resolving to confidence score
   */
  async calculateOverallConfidence(claimId: string, auditId: string): Promise<number> {
    try {
      // Get stage verification scores
      const { data: stageData, error: stageError } = await supabase
        .from('claim_stage_verifications')
        .select('stage_confidence')
        .eq('audit_id', auditId);
        
      if (stageError) {
        console.error('Error fetching stage confidence scores:', stageError);
        return 50; // Default to neutral score on error
      }
      
      // Get tool verification scores
      const { data: toolData, error: toolError } = await supabase
        .from('tool_activation_audits')
        .select('confidence_score')
        .eq('audit_id', auditId);
        
      if (toolError) {
        console.error('Error fetching tool confidence scores:', toolError);
        return 50; // Default to neutral score on error
      }
      
      // Extract scores
      const stageScores = stageData
        .map(item => item.stage_confidence)
        .filter(score => score !== null && score !== undefined);
        
      const toolScores = toolData
        .map(item => item.confidence_score)
        .filter(score => score !== null && score !== undefined);
      
      // Get claim type for weight determination
      const { data: claimData, error: claimError } = await supabase
        .from('claims')
        .select('claim_type')
        .eq('id', claimId)
        .single();
        
      // Determine weights based on claim type
      let stageWeight = 0.6;
      let toolWeight = 0.4;
      
      // Adjust weights if we have claim type information
      if (!claimError && claimData?.claim_type) {
        const weights = this.getConfidenceWeights(claimData.claim_type);
        stageWeight = weights.stageWeight;
        toolWeight = weights.toolWeight;
      }
      
      // Calculate weighted average if we have scores
      if (stageScores.length > 0 && toolScores.length > 0) {
        const avgStageScore = stageScores.reduce((sum, score) => sum + score, 0) / stageScores.length;
        const avgToolScore = toolScores.reduce((sum, score) => sum + score, 0) / toolScores.length;
        
        return (avgStageScore * stageWeight) + (avgToolScore * toolWeight);
      } else if (stageScores.length > 0) {
        // Only stage scores available
        return stageScores.reduce((sum, score) => sum + score, 0) / stageScores.length;
      } else if (toolScores.length > 0) {
        // Only tool scores available
        return toolScores.reduce((sum, score) => sum + score, 0) / toolScores.length;
      }
      
      return 50; // Default to neutral if no scores
    } catch (error) {
      console.error('Error calculating overall confidence:', error);
      return 50; // Default to neutral score on error
    }
  }

  /**
   * Evaluate completeness of data
   * @param outputs Output data to check for completeness
   * @returns Completeness score (0-100)
   */
  private evaluateCompleteness(outputs: Record<string, any>): number {
    // Implementation depends on specific data structure
    // Simple implementation based on required fields
    const requiredFields = this.getRequiredFieldsForOutput(outputs);
    
    if (requiredFields.length === 0) {
      return 100; // No required fields defined
    }
    
    // Count how many required fields are present and non-null
    const presentFields = requiredFields.filter(field => {
      const value = outputs[field];
      return value !== undefined && value !== null && value !== '';
    });
    
    return (presentFields.length / requiredFields.length) * 100;
  }

  /**
   * Evaluate compliance with business rules
   * @param stage Pipeline stage
   * @param outputs Output data to check
   * @returns Rule compliance score (0-100)
   */
  private evaluateRuleCompliance(stage: string, outputs: Record<string, any>): number {
    // Get rules for the specific stage
    const rules = this.getRulesForStage(stage);
    
    if (rules.length === 0) {
      return 100; // No rules defined
    }
    
    // Check each rule against the outputs
    const passedRules = rules.filter(rule => {
      try {
        return rule.check(outputs);
      } catch (error) {
        console.error(`Error evaluating rule for stage ${stage}:`, error);
        return false;
      }
    });
    
    return (passedRules.length / rules.length) * 100;
  }

  /**
   * Evaluate processing time performance
   * @param actualDuration Actual processing duration (ms)
   * @param expectedDuration Expected processing duration (ms)
   * @returns Processing time score (0-100)
   */
  private evaluateProcessingTime(actualDuration: number, expectedDuration: number): number {
    if (actualDuration <= expectedDuration) {
      return 100; // Within expected time
    }
    
    // Calculate penalty for exceeding expected time
    const overage = actualDuration / expectedDuration;
    
    if (overage <= 1.5) {
      // Up to 50% over is still acceptable
      return 80;
    } else if (overage <= 2) {
      // Up to 100% over gets a moderate penalty
      return 60;
    } else if (overage <= 3) {
      // Up to 200% over gets a significant penalty
      return 40;
    } else {
      // More than 200% over gets a severe penalty
      return 20;
    }
  }

  /**
   * Evaluate error rate
   * @param errors Error data
   * @returns Error rate score (0-100)
   */
  private evaluateErrorRate(errors: any[]): number {
    // Simple implementation based on error count
    if (!Array.isArray(errors) || errors.length === 0) {
      return 100; // No errors
    }
    
    // Classify errors by severity
    const criticalErrors = errors.filter(err => err.severity === 'CRITICAL').length;
    const majorErrors = errors.filter(err => err.severity === 'MAJOR').length;
    const minorErrors = errors.filter(err => err.severity === 'MINOR').length;
    
    // Apply weighted penalties
    const criticalPenalty = criticalErrors * 30;
    const majorPenalty = majorErrors * 15;
    const minorPenalty = minorErrors * 5;
    
    // Calculate score with floor of 0
    const score = 100 - (criticalPenalty + majorPenalty + minorPenalty);
    return Math.max(0, score);
  }

  /**
   * Get required fields for a given output type
   * @param outputs Output data to determine required fields
   * @returns Array of required field names
   */
  private getRequiredFieldsForOutput(outputs: Record<string, any>): string[] {
    // This would be populated based on your specific data schema
    // Default implementation with common fields
    const commonFields = ['id', 'timestamp', 'status'];
    
    // Add context-specific required fields
    if (outputs.claim_id) {
      return [...commonFields, 'claim_id', 'claim_number', 'claim_status'];
    } else if (outputs.equipment_id) {
      return [...commonFields, 'equipment_id', 'model', 'serial_number'];
    } else if (outputs.vendor_id) {
      return [...commonFields, 'vendor_id', 'vendor_name', 'vendor_status'];
    }
    
    return commonFields;
  }

  /**
   * Get business rules for a specific pipeline stage
   * @param stage Pipeline stage
   * @returns Array of business rules to check
   */
  private getRulesForStage(stage: string): Array<{ check: (data: Record<string, any>) => boolean }> {
    // This would be populated based on your specific business rules
    // Default implementation with basic rules
    const commonRules = [
      { check: (data: Record<string, any>) => data.id !== undefined && data.id !== null }
    ];
    
    switch (stage) {
      case 'INGESTION':
        return [
          ...commonRules,
          { check: (data) => !!data.claim_number && data.claim_number.match(/^CLM-\d{4}-\d{5}$/) !== null },
          { check: (data) => !!data.status && ['NEW', 'SUBMITTED'].includes(data.status) }
        ];
        
      case 'VALIDATION':
        return [
          ...commonRules,
          { check: (data) => !!data.equipment_id },
          { check: (data) => data.validation_errors === undefined || data.validation_errors.length === 0 }
        ];
        
      case 'PROCESSING':
        return [
          ...commonRules,
          { check: (data) => !!data.ai_insights },
          { check: (data) => data.status !== 'FAILED' }
        ];
        
      case 'COMPLETION':
        return [
          ...commonRules,
          { check: (data) => !!data.completion_date },
          { check: (data) => ['COMPLETED', 'REJECTED', 'CANCELLED'].includes(data.status) }
        ];
        
      default:
        return commonRules;
    }
  }

  /**
   * Get confidence weight factors based on claim type
   * @param claimType Type of claim
   * @returns Weight factors for confidence calculation
   */
  private getConfidenceWeights(claimType: string): { stageWeight: number, toolWeight: number } {
    switch (claimType) {
      case 'WARRANTY':
        return { stageWeight: 0.7, toolWeight: 0.3 };
        
      case 'DAMAGE':
        return { stageWeight: 0.5, toolWeight: 0.5 };
        
      case 'TECHNICAL':
        return { stageWeight: 0.4, toolWeight: 0.6 };
        
      case 'SERVICE':
        return { stageWeight: 0.6, toolWeight: 0.4 };
        
      default:
        return { stageWeight: 0.6, toolWeight: 0.4 };
    }
  }
}

export default VerificationWorker;
