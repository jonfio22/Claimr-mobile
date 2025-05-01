import { ContextBuilder } from '../mcp/contextBuilder';
import { MemoryTracker } from '../mcp/memoryTracker';
import { AnomalyDetector } from '../mcp/anomalyDetector';
import { RecommendationEngine } from '../mcp/recommendationEngine';
import { ClaimrAgent } from '../agent/agent';
import { AgentRequest, AgentResponse } from '../agent/types';
import { EventType } from '../mcp/types';
import { supabase } from '../supabase/client';

/**
 * ClaimAgentService orchestrates the SuperAgent functionality for claims analysis,
 * connecting all MCP7 tools and coordinating intelligence operations.
 */
export class ClaimAgentService {
  private contextBuilder: ContextBuilder;
  private memoryTracker: MemoryTracker;
  private anomalyDetector: AnomalyDetector;
  private recommendationEngine: RecommendationEngine;
  private superAgent: ClaimrAgent;
  
  constructor() {
    this.contextBuilder = new ContextBuilder();
    this.memoryTracker = new MemoryTracker();
    this.anomalyDetector = new AnomalyDetector();
    this.recommendationEngine = new RecommendationEngine();
    // We'll use the static methods of ClaimrAgent instead of instantiating it
    this.superAgent = null as any; // Will use static methods instead
  }
  
  /**
   * Analyzes a claim using all intelligence tools
   * @param claimId The ID of the claim to analyze
   * @returns Analysis results
   */
  async analyzeClaim(claimId: string) {
    // Fetch claim data with related equipment and attachments
    const claimData = await this.fetchClaimFullContext(claimId);
    
    // Prepare claim analysis context
    const context = await ContextBuilder.buildClaimContext(claimId, {
      includeRecommendations: true,
      includeAnomalies: true,
      includeRelated: true
    });
    
    // Run analyzeClaim action with full context
    const analysisResult = await ClaimrAgent.executeRequest({
      action: 'analyzeClaim',
      entityType: 'claim',
      entityId: claimId,
      claimId, // Needed for backward compatibility
      params: {
        claimData,
        context,
        attachments: claimData.attachments
      }
    });
    
    // Update claim with intelligence results
    await this.persistAnalysisResults(claimId, analysisResult);
    
    // Feed to memory tracker and anomaly detector
    await MemoryTracker.logEvent(
      'claim_updated' as EventType, // Use an existing EventType
      'claim', // entityType
      claimId, // entityId
      { // metadata
        analysisAction: 'analysis_completed',
        timestamp: new Date().toISOString(),
        analysisId: analysisResult.id,
        confidenceScore: analysisResult.result?.confidence || 0
      },
      { claimId } // relatedIds
    );
    
    // Check for anomalies based on the analysis
    // Find anomalies using the claim data
    const claimAnomalies = await this.findClaimAnomalies(claimId, claimData);
    
    // Log anomalies if any found
    if (claimAnomalies.length > 0) {
      for (const anomaly of claimAnomalies) {
        await AnomalyDetector.logAnomaly(
          anomaly.type as any, // anomalyType
          anomaly.severity as any, // severity
          'claim', // entityType
          claimId, // entityId
          anomaly.description, // description
          anomaly.metadata || {}, // metadata
          { claimId } // relatedIds
        );
      }
    }
    
    // Generate recommendations
    const recommendations = await RecommendationEngine.getClaimRecommendations(claimId);
    
    // Return the complete analysis package
    return {
      ...analysisResult,
      recommendations
    };
  }
  
  /**
   * Find anomalies in a claim
   * @param claimId The claim ID
   * @param claimData The claim data
   * @returns Array of anomalies found
   */
  private async findClaimAnomalies(claimId: string, claimData: any) {
    interface ClaimAnomaly {
      type: string;
      severity: number;
      description: string;
      metadata: Record<string, any>;
    }
    
    const anomalies: ClaimAnomaly[] = [];
    
    // Check for long SLA time
    const submittedAt = new Date(claimData.submitted_at);
    const now = new Date();
    const daysSinceSubmission = Math.floor((now.getTime() - submittedAt.getTime()) / (1000 * 60 * 60 * 24));
    
    if (claimData.status !== 'completed' && daysSinceSubmission > 7) {
      anomalies.push({
        type: 'sla_violation',
        severity: daysSinceSubmission > 14 ? 4 : 3,
        description: `Claim has been open for ${daysSinceSubmission} days, which exceeds normal SLA`,
        metadata: {
          daysSinceSubmission,
          expectedSLA: 7,
          status: claimData.status
        }
      });
    }
    
    // Check for unusual claim patterns based on equipment
    if (claimData.equipment) {
      const { data: equipmentClaims } = await supabase
        .from('claims')
        .select('*')
        .eq('equipment_id', claimData.equipment_id)
        .not('id', 'eq', claimId); // Exclude current claim
      
      if (equipmentClaims && equipmentClaims.length >= 3) {
        anomalies.push({
          type: 'frequent_claims',
          severity: 3,
          description: `Equipment has ${equipmentClaims.length} previous claims`,
          metadata: {
            numPreviousClaims: equipmentClaims.length,
            equipmentId: claimData.equipment_id
          }
        });
      }
    }
    
    // Return all found anomalies
    return anomalies;
  }
  
  /**
   * Fetches the full context for a claim including all related data
   * @param claimId The ID of the claim
   * @returns Full claim data with relationships
   */
  private async fetchClaimFullContext(claimId: string) {
    // Fetch claim with equipment and vendor data
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
      throw new Error(`Failed to fetch claim data: ${error.message}`);
    }
    
    // Fetch claim events (timeline)
    const { data: events } = await supabase
      .from('claim_events')
      .select('*')
      .eq('claim_id', claimId)
      .order('event_date', { ascending: true });
      
    // Fetch messages
    const { data: messages } = await supabase
      .from('messages')
      .select('*')
      .eq('claim_id', claimId)
      .order('created_at', { ascending: true });
      
    return {
      ...claim,
      timeline: events || [],
      messages: messages || []
    };
  }
  
  /**
   * Persists analysis results back to the database
   * @param claimId The ID of the claim
   * @param analysisResult The results from analysis
   */
  private async persistAnalysisResults(claimId: string, analysisResult: AgentResponse) {
    // Extract key insights
    const insights = analysisResult.result || {};
    
    // Update the claim with analysis results
    const { error } = await supabase
      .from('claims')
      .update({
        ai_insights: insights,
        ai_analysis_timestamp: new Date().toISOString(),
        last_updated: new Date().toISOString()
      })
      .eq('id', claimId);
      
    if (error) {
      console.error('Failed to update claim with analysis results:', error);
    }
    
    // Create a claim event for the analysis
    await supabase
      .from('claim_events')
      .insert({
        claim_id: claimId,
        event_type: 'ai_analysis',
        event_description: 'AI analysis completed',
        metadata: {
          analysisId: analysisResult.id,
          summary: insights.summary,
          confidence: insights.confidence,
          timestamp: new Date().toISOString()
        }
      });
  }
  
  /**
   * Processes new attachments for a claim and updates analysis
   * @param claimId The claim ID
   * @param attachmentIds Array of new attachment IDs
   */
  async processNewAttachments(claimId: string, attachmentIds: string[]) {
    // Fetch the new attachments
    const { data: attachments } = await supabase
      .from('claim_attachments')
      .select('*')
      .in('id', attachmentIds);
      
    if (!attachments || attachments.length === 0) {
      return;
    }
    
    // Analyze each attachment
    for (const attachment of attachments) {
      // Only analyze images and PDFs
      if (attachment.file_type.startsWith('image/') || 
          attachment.file_type === 'application/pdf') {
        
        const analysis = await ClaimrAgent.executeRequest({
          action: 'analyzeAttachment',
          entityType: 'attachment',
          entityId: attachment.id,
          claimId, // Needed for backward compatibility
          params: {
            claimId,
            attachmentId: attachment.id,
            fileUrl: attachment.file_url,
            fileType: attachment.file_type
          }
        });
        
        // Update attachment with analysis
        await supabase
          .from('claim_attachments')
          .update({
            ai_analysis: analysis.result
          })
          .eq('id', attachment.id);
      }
    }
    
    // Re-run full claim analysis with new attachments
    return this.analyzeClaim(claimId);
  }
}
