import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { MCP } from '../mcp/mcp';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

/**
 * Smart Claim Blueprint Generator
 * 
 * A pre-submission intelligence layer that evaluates claim quality and provides
 * recommendations before the user finalizes a claim.
 */
export class BlueprintGenerator {
  /**
   * Initialize the Blueprint Generator with MCP tools
   */
  constructor() {
    // Initialize MCP tools to be used
    this.ensureDBTables();
  }

  /**
   * Generate a blueprint for a claim
   * 
   * @param claimData Draft claim data
   * @param userId User ID of the claim creator
   * @returns Generated blueprint
   */
  async generateBlueprint(claimData: any, userId: string) {
    try {
      console.log('Generating blueprint for claim', claimData.claim_id);
      
      // Initialize MCP7 session
      const mcpSession = await MCP.createSession({
        context: 'claim_blueprint',
        claim_id: claimData.claim_id,
        user_id: userId,
        entity_type: 'CLAIM',
        entity_id: claimData.claim_id
      });
      
      // 1. Context Building - Analyze the claim data
      const claimContext = await this.buildContext(mcpSession, claimData);
      
      // 2. Historical Pattern Recognition
      const historicalPatterns = await this.getHistoricalPatterns(mcpSession, claimData, claimContext);
      
      // 3. Anomaly Detection
      const anomalies = await this.detectAnomalies(mcpSession, claimData, claimContext, historicalPatterns);
      
      // 4. Get vendor-specific requirements
      const vendorRequirements = await this.getVendorRequirements(claimData.equipment?.manufacturer);
      
      // 5. Generate recommendations
      const recommendations = await this.generateRecommendations(
        mcpSession, 
        claimData, 
        claimContext, 
        historicalPatterns, 
        anomalies,
        vendorRequirements
      );
      
      // 6. Calculate confidence score
      const confidenceScore = this.calculateConfidenceScore(claimData, recommendations, anomalies, vendorRequirements);
      
      // 7. Assemble blueprint
      const blueprint = this.assembleBlueprint(
        claimData,
        claimContext,
        historicalPatterns,
        anomalies,
        recommendations,
        confidenceScore,
        vendorRequirements
      );
      
      // 8. Save blueprint to database
      const savedBlueprint = await this.saveBlueprint(blueprint, claimData.claim_id, mcpSession);
      
      // 9. Format blueprint for UI
      const uiBlueprint = this.formatBlueprintForUI(savedBlueprint);
      
      return {
        success: true,
        blueprint_id: savedBlueprint.id,
        ...uiBlueprint
      };
    } catch (error: any) {
      console.error('Blueprint generation error:', error);
      throw new Error(`Failed to generate blueprint: ${error.message}`);
    }
  }

  /**
   * Build context for the claim using contextBuilder
   */
  private async buildContext(mcpSession: any, claimData: any) {
    try {
      const contextBuilder = await mcpSession.getTool('contextBuilder');
      
      const context = await contextBuilder.analyze({
        equipment: claimData.equipment,
        description: claimData.description,
        photos: claimData.attachments?.filter((a: any) => a.type === 'photo') || [],
        metadata: claimData.draft_metadata
      });
      
      return {
        equipmentType: context.equipmentType || claimData.equipment?.category,
        issueCategories: context.identifiedIssueCategories || [],
        entities: context.entities || [],
        keyPhrases: context.keyPhrases || [],
        techParams: context.technicalParameters || {}
      };
    } catch (error) {
      console.error('Context building error:', error);
      // Fallback context if contextBuilder fails
      return {
        equipmentType: claimData.equipment?.category,
        issueCategories: [],
        entities: [],
        keyPhrases: [],
        techParams: {}
      };
    }
  }

  /**
   * Get historical patterns from the orgLearningVault
   */
  private async getHistoricalPatterns(mcpSession: any, claimData: any, context: any) {
    try {
      const orgLearningVault = await mcpSession.getTool('orgLearningVault');
      
      const historicalData = await orgLearningVault.query({
        equipmentModel: claimData.equipment?.model,
        vendor: claimData.equipment?.manufacturer,
        issueCategories: context.issueCategories,
        limit: 20
      });
      
      return {
        successPatterns: historicalData.successPatterns || [],
        rejectionReasons: historicalData.rejectionReasons || [],
        typicalRequirements: historicalData.typicalRequirements || [],
        similarClaims: historicalData.similarClaims || []
      };
    } catch (error) {
      console.error('Historical pattern retrieval error:', error);
      // Fallback empty patterns if orgLearningVault fails
      return {
        successPatterns: [],
        rejectionReasons: [],
        typicalRequirements: [],
        similarClaims: []
      };
    }
  }

  /**
   * Detect anomalies in the claim data
   */
  private async detectAnomalies(mcpSession: any, claimData: any, context: any, historicalPatterns: any) {
    try {
      const anomalyDetector = await mcpSession.getTool('anomalyDetector');
      
      // Get vendor requirements for this equipment manufacturer
      const vendorRequirements = await this.getVendorRequirements(claimData.equipment?.manufacturer);
      
      const anomalies = await anomalyDetector.analyze({
        currentClaim: claimData,
        context: context,
        historicalPatterns: historicalPatterns,
        requiredFields: vendorRequirements?.required_fields || []
      });
      
      return {
        missingFields: anomalies.missingFields || [],
        unusualValues: anomalies.unusualValues || [],
        missingEvidence: anomalies.missingEvidence || [],
        inconsistencies: anomalies.inconsistencies || []
      };
    } catch (error) {
      console.error('Anomaly detection error:', error);
      // Fallback empty anomalies if anomalyDetector fails
      return {
        missingFields: [],
        unusualValues: [],
        missingEvidence: [],
        inconsistencies: []
      };
    }
  }

  /**
   * Get vendor-specific requirements
   */
  private async getVendorRequirements(manufacturer: string) {
    if (!manufacturer) return null;
    
    try {
      // Normalize manufacturer name (lowercase, remove spaces)
      const normalizedName = manufacturer.toLowerCase().replace(/\s+/g, '_');
      
      // Query vendor requirements from database
      const { data, error } = await supabase
        .from('vendor_requirements')
        .select('*')
        .eq('vendor_id', normalizedName)
        .single();
      
      if (error) throw error;
      
      return data;
    } catch (error) {
      console.error('Error fetching vendor requirements:', error);
      return null;
    }
  }

  /**
   * Generate recommendations for improving the claim
   */
  private async generateRecommendations(
    mcpSession: any, 
    claimData: any, 
    context: any, 
    historicalPatterns: any, 
    anomalies: any,
    vendorRequirements: any
  ) {
    try {
      const recommendationEngine = await mcpSession.getTool('recommendationEngine');
      
      const recommendations = await recommendationEngine.generate({
        anomalies: anomalies,
        context: context,
        historicalSuccess: historicalPatterns.successPatterns,
        vendorRequirements: vendorRequirements
      });
      
      return {
        suggestedTitle: recommendations.suggestedTitle,
        issueDiagnosis: recommendations.issueDiagnosis || {},
        suggestedAttachments: recommendations.suggestedAttachments || [],
        missingData: recommendations.missingData || [],
        actions: recommendations.actions || []
      };
    } catch (error) {
      console.error('Recommendation generation error:', error);
      
      // Fallback: Try to get recommendations from blueprint_templates
      try {
        const { data } = await supabase
          .from('blueprint_templates')
          .select('*')
          .eq('equipment_type', context.equipmentType?.toLowerCase())
          .eq('manufacturer', claimData.equipment?.manufacturer?.toLowerCase())
          .eq('issue_category', context.issueCategories[0]?.toLowerCase() || 'general')
          .single();
        
        if (data) {
          return {
            suggestedTitle: `${claimData.equipment?.manufacturer} ${claimData.equipment?.model} - Issue`,
            issueDiagnosis: { primary_category: context.issueCategories[0] || 'General' },
            suggestedAttachments: data.template_data.suggested_attachments || [],
            missingData: data.template_data.missing_data_fields || [],
            actions: []
          };
        }
      } catch (templateError) {
        console.error('Template fallback error:', templateError);
      }
      
      // Ultimate fallback if both recommendation engine and templates fail
      return {
        suggestedTitle: `${claimData.equipment?.manufacturer} ${claimData.equipment?.model} - Issue`,
        issueDiagnosis: {},
        suggestedAttachments: [],
        missingData: [],
        actions: []
      };
    }
  }

  /**
   * Calculate confidence score for the claim
   */
  private calculateConfidenceScore(
    claimData: any, 
    recommendations: any, 
    anomalies: any, 
    vendorRequirements: any
  ) {
    const weights = {
      completeness: 0.3,
      evidenceQuality: 0.25,
      historicalAlignment: 0.2,
      vendorRequirementMatch: 0.25
    };
    
    // Calculate completeness score
    const completeness = this.calculateCompleteness(claimData, recommendations.missingData);
    
    // Calculate evidence quality score
    const evidenceQuality = this.assessEvidenceQuality(claimData.attachments || []);
    
    // Calculate historical alignment score (default to 70 if no historical data)
    const historicalAlignment = 70;
    
    // Calculate vendor requirement match score
    const vendorRequirementMatch = this.checkVendorRequirements(
      claimData, 
      vendorRequirements
    );
    
    // Calculate final score
    const scores = {
      completeness,
      evidenceQuality,
      historicalAlignment,
      vendorRequirementMatch
    };
    
    const finalScore = Object.keys(weights).reduce((total, key) => {
      const weight = weights[key as keyof typeof weights];
      const score = scores[key as keyof typeof scores];
      return total + (score * weight);
    }, 0);
    
    // Round to nearest integer
    return Math.round(finalScore);
  }

  /**
   * Calculate completeness score
   */
  private calculateCompleteness(claimData: any, missingData: any[]) {
    // Base score - starts at 100
    let score = 100;
    
    // Check basic fields
    if (!claimData.equipment?.model) score -= 15;
    if (!claimData.equipment?.serial) score -= 10;
    if (!claimData.description || claimData.description.length < 10) score -= 20;
    
    // Check for attachments
    if (!claimData.attachments || claimData.attachments.length === 0) {
      score -= 30;
    } else {
      // Only reduce by 15 if there are some attachments but not enough
      if (claimData.attachments.length < 2) score -= 15;
    }
    
    // Deduct for missing fields identified in missingData
    const missingFieldDeduction = missingData.reduce((total: number, item: any) => {
      switch (item.importance) {
        case 'critical': return total + 15;
        case 'high': return total + 10;
        case 'medium': return total + 5;
        default: return total + 2;
      }
    }, 0);
    
    score -= missingFieldDeduction;
    
    // Ensure score is between 0 and 100
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Assess quality of evidence (attachments)
   */
  private assessEvidenceQuality(attachments: any[]) {
    if (!attachments || attachments.length === 0) return 0;
    
    // Base score based on number of attachments (up to 5)
    const countScore = Math.min(attachments.length * 20, 100);
    
    // Check for diversity of attachment types
    const types = new Set(attachments.map(a => a.type));
    const diversityScore = types.size > 1 ? 100 : 70;
    
    // Average the scores
    return (countScore + diversityScore) / 2;
  }

  /**
   * Check if claim meets vendor requirements
   */
  private checkVendorRequirements(claimData: any, vendorRequirements: any) {
    if (!vendorRequirements) return 70; // Default score if no vendor requirements
    
    const requiredFields = vendorRequirements.required_fields || [];
    
    // Count how many required fields are present
    let presentCount = 0;
    
    for (const field of requiredFields) {
      // Check if field exists in additional_fields or main claim data
      if (
        (claimData.additional_fields && claimData.additional_fields[field]) ||
        (claimData[field])
      ) {
        presentCount++;
      }
    }
    
    // Calculate percentage of required fields present
    const percentage = requiredFields.length > 0 
      ? (presentCount / requiredFields.length) * 100 
      : 100;
    
    return percentage;
  }

  /**
   * Assemble the complete blueprint object
   */
  private assembleBlueprint(
    claimData: any,
    context: any,
    historicalPatterns: any,
    anomalies: any,
    recommendations: any,
    confidenceScore: number,
    vendorRequirements: any
  ) {
    // Construct the recommended title if not provided
    const recommendedTitle = recommendations.suggestedTitle || 
      `${claimData.equipment?.manufacturer} ${claimData.equipment?.model} - ${recommendations.issueDiagnosis?.primary_category || 'Issue'}`;
    
    // Construct issue diagnosis
    const issueDiagnosis = {
      primary_category: recommendations.issueDiagnosis?.primary_category || context.issueCategories[0] || 'Unknown',
      specific_issue: recommendations.issueDiagnosis?.specific_issue || 'General Issue',
      confidence: recommendations.issueDiagnosis?.confidence || 70,
      details: recommendations.issueDiagnosis?.details || 'No detailed diagnosis available.',
      alternative_diagnoses: recommendations.issueDiagnosis?.alternative_diagnoses || []
    };
    
    // Construct risk factors based on anomalies and vendor requirements
    const riskFactors = this.buildRiskFactors(anomalies, vendorRequirements, confidenceScore);
    
    // Construct the checklist items
    const checklist = this.buildChecklist(claimData, recommendations, anomalies);
    
    // Construct the vendor-specific mappings
    const formMapping = vendorRequirements?.form_templates || {};
    
    // Assemble complete blueprint
    return {
      recommended_title: recommendedTitle,
      issue_diagnosis: issueDiagnosis,
      confidence_score: confidenceScore,
      suggested_attachments: recommendations.suggestedAttachments,
      missing_data: recommendations.missingData,
      risk_factors: riskFactors,
      vendor_id: claimData.equipment?.manufacturer,
      vendor_specific_requirements: vendorRequirements 
        ? { required_fields: vendorRequirements.required_fields, optional_fields: vendorRequirements.optional_fields }
        : null,
      form_mapping: formMapping,
      checklist,
      historical_context: {
        similar_claims_count: historicalPatterns.similarClaims?.length || 0,
        common_rejection_reasons: historicalPatterns.rejectionReasons
      }
    };
  }

  /**
   * Build risk factors based on anomalies and confidence score
   */
  private buildRiskFactors(anomalies: any, vendorRequirements: any, confidenceScore: number) {
    const riskFactors = [];
    
    // Add risk factors for missing critical vendor requirements
    if (vendorRequirements && vendorRequirements.required_fields) {
      for (const field of vendorRequirements.required_fields) {
        if (anomalies.missingFields.some((f: any) => f.field === field)) {
          riskFactors.push({
            type: 'rejection_risk',
            reason: `Missing required field: ${field}`,
            severity: 'high'
          });
        }
      }
    }
    
    // Add risk factors for missing evidence
    for (const evidence of anomalies.missingEvidence) {
      riskFactors.push({
        type: 'rejection_risk',
        reason: `Missing evidence: ${evidence.type}`,
        severity: evidence.importance || 'medium'
      });
    }
    
    // Add risk factors for inconsistencies
    for (const inconsistency of anomalies.inconsistencies) {
      riskFactors.push({
        type: 'delay_risk',
        reason: `Data inconsistency: ${inconsistency.description}`,
        severity: 'medium'
      });
    }
    
    // Add overall risk factor based on confidence score
    if (confidenceScore < 50) {
      riskFactors.push({
        type: 'rejection_risk',
        reason: 'Overall claim quality is poor',
        severity: 'high'
      });
    } else if (confidenceScore < 75) {
      riskFactors.push({
        type: 'delay_risk',
        reason: 'Claim may require additional information',
        severity: 'medium'
      });
    }
    
    return riskFactors;
  }

  /**
   * Build checklist items for the blueprint
   */
  private buildChecklist(claimData: any, recommendations: any, anomalies: any) {
    const completed = [];
    const incomplete = [];
    
    // Check basic information
    if (claimData.equipment?.model && claimData.description && claimData.description.length >= 10) {
      completed.push({
        id: 'basic_info',
        name: 'Basic Information',
        score: 100
      });
    } else {
      incomplete.push({
        id: 'basic_info',
        name: 'Basic Information',
        score: 50,
        recommendation: 'Provide complete equipment details and description',
        importance: 'critical'
      });
    }
    
    // Check initial photo
    if (claimData.attachments && claimData.attachments.some((a: any) => a.type === 'photo')) {
      completed.push({
        id: 'initial_photo',
        name: 'Initial Photo',
        score: 80
      });
    } else {
      incomplete.push({
        id: 'initial_photo',
        name: 'Initial Photo',
        score: 0,
        recommendation: 'Add at least one photo showing the issue',
        importance: 'critical'
      });
    }
    
    // Add missing data as incomplete items
    for (const missing of recommendations.missingData) {
      incomplete.push({
        id: `missing_${missing.field.toLowerCase().replace(/\s+/g, '_')}`,
        name: missing.field,
        score: 0,
        recommendation: missing.reason,
        importance: missing.importance
      });
    }
    
    // Add suggested attachments as incomplete items
    for (const attachment of recommendations.suggestedAttachments) {
      incomplete.push({
        id: `attachment_${attachment.type}_${attachment.name.toLowerCase().replace(/\s+/g, '_')}`,
        name: attachment.name,
        score: 0,
        recommendation: attachment.reason,
        importance: attachment.priority
      });
    }
    
    return { completed, incomplete };
  }

  /**
   * Save blueprint to database
   */
  private async saveBlueprint(blueprint: any, claimId: string, mcpSession: any) {
    try {
      const { data, error } = await supabase
        .from('claim_blueprints')
        .insert({
          claim_id: claimId,
          recommended_title: blueprint.recommended_title,
          issue_diagnosis: blueprint.issue_diagnosis,
          confidence_score: blueprint.confidence_score,
          suggested_attachments: blueprint.suggested_attachments,
          missing_data: blueprint.missing_data,
          risk_factors: blueprint.risk_factors,
          vendor_id: blueprint.vendor_id,
          vendor_specific_requirements: blueprint.vendor_specific_requirements,
          form_mapping: blueprint.form_mapping,
          tools_used: mcpSession.tools_used,
          processing_time: mcpSession.processing_time
        })
        .select()
        .single();
      
      if (error) throw error;
      
      return data;
    } catch (error) {
      console.error('Error saving blueprint:', error);
      throw error;
    }
  }

  /**
   * Format blueprint for UI display
   */
  private formatBlueprintForUI(blueprint: any) {
    // Transform the database blueprint into a UI-friendly format
    // This is essentially what the API response will look like
    return {
      confidence_score: blueprint.confidence_score,
      recommended_title: blueprint.recommended_title,
      issue_diagnosis: blueprint.issue_diagnosis,
      checklist: blueprint.checklist,
      risk_assessment: {
        overall_risk: this.determineOverallRisk(blueprint.risk_factors),
        factors: blueprint.risk_factors
      },
      ui_elements: {
        progress_bar: {
          value: blueprint.confidence_score,
          color: this.getConfidenceColor(blueprint.confidence_score),
          label: `Claim Readiness: ${blueprint.confidence_score}%`
        },
        critical_items: blueprint.checklist.incomplete.filter((i: any) => i.importance === 'critical').length,
        important_items: blueprint.checklist.incomplete.filter((i: any) => i.importance === 'high').length,
        enhancement_items: blueprint.checklist.incomplete.filter((i: any) => i.importance === 'medium').length
      }
    };
  }

  /**
   * Determine overall risk level based on risk factors
   */
  private determineOverallRisk(riskFactors: any[]) {
    if (!riskFactors || riskFactors.length === 0) return 'low';
    
    // Check if any high severity risk factors exist
    if (riskFactors.some(r => r.severity === 'high')) {
      return 'high';
    }
    
    // Check if more than 2 medium severity risk factors exist
    if (riskFactors.filter(r => r.severity === 'medium').length > 2) {
      return 'high';
    }
    
    // If there are any medium risks, return medium
    if (riskFactors.some(r => r.severity === 'medium')) {
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * Get color based on confidence score
   */
  private getConfidenceColor(score: number) {
    if (score < 50) return 'red';
    if (score < 75) return 'yellow';
    return 'green';
  }

  /**
   * Ensure required database tables exist
   */
  private async ensureDBTables() {
    try {
      // Check if claim_blueprints table exists
      const { error } = await supabase
        .from('claim_blueprints')
        .select('id')
        .limit(1);
      
      if (error) {
        console.warn('claim_blueprints table may not exist:', error.message);
        // We'll let the application continue, as the tables might be created separately
      }
    } catch (error) {
      console.warn('Error checking database tables:', error);
    }
  }
}
