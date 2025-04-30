import { 
  getVaultByType, 
  updateVault, 
  logVaultEvent,
  getOrganizationClaims,
  getOrganizationVendors,
  getOrganizationEquipment,
  calculateSimilarity,
  formatRecommendation
} from './utils';
import { 
  VaultType, 
  ClaimPattern,
  VendorInsight,
  TechBehavior,
  EquipmentTrend,
  Recommendation
} from './types';
import { MCP7MemoryManager } from '../mcp/memoryManager';

/**
 * Core service for managing organization-scoped learning vaults
 */
export class OrgLearningVaultService {
  private orgId: string;
  private mcpManager: MCP7MemoryManager;
  
  constructor(orgId: string, mcpManager: MCP7MemoryManager) {
    this.orgId = orgId;
    this.mcpManager = mcpManager;
  }
  
  /**
   * Get claim patterns for the organization
   */
  async getClaimPatterns(): Promise<ClaimPattern[]> {
    const vault = await getVaultByType(this.orgId, 'claim_patterns');
    if (!vault || !vault.data.patterns) return [];
    
    return vault.data.patterns || [];
  }
  
  /**
   * Update claim pattern based on new claim data
   */
  async updateClaimPatterns(claimId: string, claimData: any): Promise<void> {
    // Get existing patterns
    const vault = await getVaultByType(this.orgId, 'claim_patterns');
    if (!vault) return;
    
    const patterns: ClaimPattern[] = vault.data.patterns || [];
    
    // Extract key information from claim
    const { 
      status, 
      issue_type, 
      resolution_approach,
      resolution_time_hours,
      equipment_type,
      vendor_id
    } = claimData;
    
    // Check if this claim reveals any patterns
    if (status === 'resolved') {
      // Look for existing pattern that matches
      const existingPatternIndex = patterns.findIndex(p => 
        p.indicators.includes(`issue_type:${issue_type}`) &&
        p.indicators.includes(`equipment_type:${equipment_type}`)
      );
      
      if (existingPatternIndex >= 0) {
        // Update existing pattern
        patterns[existingPatternIndex] = {
          ...patterns[existingPatternIndex],
          confidence: Math.min(0.95, patterns[existingPatternIndex].confidence + 0.05),
          occurenceCount: patterns[existingPatternIndex].occurenceCount + 1,
          lastUpdated: new Date().toISOString()
        };
      } else {
        // Create new pattern
        const newPattern: ClaimPattern = {
          patternId: `pattern_${Date.now()}`,
          description: `${issue_type} issues with ${equipment_type} equipment`,
          indicators: [
            `issue_type:${issue_type}`,
            `equipment_type:${equipment_type}`,
            `vendor_id:${vendor_id}`
          ],
          confidence: 0.4, // Start with moderate confidence
          occurenceCount: 1,
          lastUpdated: new Date().toISOString(),
          metadata: {
            typical_resolution_time: resolution_time_hours,
            resolution_approach
          }
        };
        
        patterns.push(newPattern);
      }
      
      // Save updated patterns
      await updateVault(this.orgId, 'claim_patterns', { patterns });
    }
  }
  
  /**
   * Get vendor insights for the organization
   */
  async getVendorInsights(vendorId?: string): Promise<VendorInsight[]> {
    const vault = await getVaultByType(this.orgId, 'vendor_insights');
    if (!vault || !vault.data.vendors) return [];
    
    const insights: VendorInsight[] = vault.data.vendors || [];
    
    if (vendorId) {
      return insights.filter(v => v.vendorId === vendorId);
    }
    
    return insights;
  }
  
  /**
   * Update vendor insights based on new claim data
   */
  async updateVendorInsights(vendorId: string, claimData: any): Promise<void> {
    const vault = await getVaultByType(this.orgId, 'vendor_insights');
    if (!vault) return;
    
    const vendors: VendorInsight[] = vault.data.vendors || [];
    
    // Extract key vendor interaction information
    const { 
      approved, 
      response_time_hours,
      escalated,
      vendor_responses
    } = claimData;
    
    // Find or create vendor insight
    const existingVendorIndex = vendors.findIndex(v => v.vendorId === vendorId);
    
    if (existingVendorIndex >= 0) {
      const vendor = vendors[existingVendorIndex];
      const responsePatterns = vendor.responsePatterns;
      
      // Update response metrics
      const totalResponses = responsePatterns.approvalRate * 100 + 1;
      const newApprovalRate = approved 
        ? (responsePatterns.approvalRate * 100 + 1) / totalResponses
        : responsePatterns.approvalRate;
        
      const newEscalationRate = escalated
        ? (responsePatterns.escalationRate * 100 + 1) / totalResponses
        : responsePatterns.escalationRate;
        
      // Weighted average for response time
      const newAvgResponseTime = 
        (responsePatterns.averageResponseTime * 100 + response_time_hours) / (100 + 1);
      
      // Update vendor insight
      vendors[existingVendorIndex] = {
        ...vendor,
        responsePatterns: {
          ...responsePatterns,
          averageResponseTime: newAvgResponseTime,
          approvalRate: newApprovalRate,
          escalationRate: newEscalationRate
        },
        lastUpdated: new Date().toISOString()
      };
    } else {
      // Create new vendor insight
      vendors.push({
        vendorId,
        responsePatterns: {
          averageResponseTime: response_time_hours || 24, // Default to 24h if unknown
          approvalRate: approved ? 1 : 0,
          escalationRate: escalated ? 1 : 0,
          commonResponses: vendor_responses ? 
            vendor_responses.map((r: string) => ({ content: r, frequency: 1 })) : []
        },
        negotiationTips: [],
        strengths: [],
        challenges: [],
        lastUpdated: new Date().toISOString()
      });
    }
    
    // Save updated vendor insights
    await updateVault(this.orgId, 'vendor_insights', { vendors });
  }
  
  /**
   * Get equipment trends for the organization
   */
  async getEquipmentTrends(equipmentType?: string): Promise<EquipmentTrend[]> {
    const vault = await getVaultByType(this.orgId, 'equipment_trends');
    if (!vault || !vault.data.equipment) return [];
    
    const trends: EquipmentTrend[] = vault.data.equipment || [];
    
    if (equipmentType) {
      return trends.filter(e => e.equipmentType === equipmentType);
    }
    
    return trends;
  }
  
  /**
   * Get tech behaviors for the organization
   */
  async getTechBehaviors(techId?: string): Promise<TechBehavior[]> {
    const vault = await getVaultByType(this.orgId, 'tech_behaviors');
    if (!vault || !vault.data.techs) return [];
    
    const behaviors: TechBehavior[] = vault.data.techs || [];
    
    if (techId) {
      return behaviors.filter(t => t.techId === techId);
    }
    
    return behaviors;
  }
  
  /**
   * Get personalized recommendations based on context
   */
  async getRecommendations(context: any): Promise<Recommendation[]> {
    const recommendations: Recommendation[] = [];
    
    // Extract context information
    const { 
      claim_id, 
      user_id, 
      claim_type, 
      vendor_id, 
      equipment_id, 
      equipment_type,
      issue_description
    } = context;
    
    // Get relevant vault data
    const claimPatterns = await this.getClaimPatterns();
    const vendorInsights = vendor_id ? await this.getVendorInsights(vendor_id) : [];
    const equipmentTrends = equipment_type ? await this.getEquipmentTrends(equipment_type) : [];
    
    // Generate claim approach recommendations
    if (claim_type && claimPatterns.length > 0) {
      // Find relevant patterns
      const relevantPatterns = claimPatterns.filter(pattern => 
        pattern.indicators.some(i => i.includes(claim_type)) ||
        (equipment_type && pattern.indicators.some(i => i.includes(equipment_type)))
      );
      
      if (relevantPatterns.length > 0) {
        // Sort by confidence
        relevantPatterns.sort((a, b) => b.confidence - a.confidence);
        
        // Generate recommendation from most confident pattern
        const topPattern = relevantPatterns[0];
        recommendations.push(
          formatRecommendation(
            'claim_approach',
            'Suggested Claim Approach',
            `Based on ${topPattern.occurenceCount} similar claims, we recommend: ${topPattern.description}`,
            topPattern.confidence,
            `This approach has been successful in similar claims with ${equipment_type || 'this equipment'}`,
            [
              `Focus on documenting the issue clearly`,
              `Include all required photos and evidence`,
              topPattern.metadata?.resolution_approach || 'Follow standard protocol'
            ],
            {
              pattern_id: topPattern.patternId,
              typical_resolution_time: topPattern.metadata?.typical_resolution_time
            }
          )
        );
      }
    }
    
    // Generate vendor strategy recommendations
    if (vendor_id && vendorInsights.length > 0) {
      const vendorData = vendorInsights[0];
      const approvalRate = vendorData.responsePatterns.approvalRate;
      const avgResponseTime = vendorData.responsePatterns.averageResponseTime;
      
      let vendorStrategy: string;
      let suggestedActions: string[] = [];
      
      if (approvalRate > 0.8) {
        vendorStrategy = `This vendor has a high approval rate (${Math.round(approvalRate * 100)}%). Focus on clear documentation.`;
        suggestedActions = [
          `Provide clear, concise documentation`,
          `Expect a response in approximately ${Math.round(avgResponseTime)} hours`,
          `Follow up professionally if no response within ${Math.round(avgResponseTime * 1.5)} hours`
        ];
      } else if (approvalRate < 0.5) {
        vendorStrategy = `This vendor has a lower approval rate (${Math.round(approvalRate * 100)}%). Be thorough with documentation.`;
        suggestedActions = [
          `Provide extremely detailed documentation`,
          `Include additional photos beyond minimum requirements`,
          `Be prepared for potential escalation`,
          `Schedule follow-up within ${Math.round(avgResponseTime * 0.8)} hours`
        ];
      } else {
        vendorStrategy = `This vendor has a moderate approval rate (${Math.round(approvalRate * 100)}%).`;
        suggestedActions = [
          `Provide thorough documentation with all required details`,
          `Follow up if no response within ${Math.round(avgResponseTime)} hours`
        ];
      }
      
      recommendations.push(
        formatRecommendation(
          'vendor_strategy',
          'Vendor Engagement Strategy',
          vendorStrategy,
          0.7, // Medium-high confidence
          `Based on ${vendorData.responsePatterns.commonResponses.length} tracked interactions with this vendor`,
          suggestedActions,
          {
            vendor_id: vendor_id,
            avg_response_time: avgResponseTime,
            approval_rate: approvalRate
          }
        )
      );
    }
    
    return recommendations;
  }
  
  /**
   * Get introspection data about the organization's learning vaults
   */
  async getIntrospectData(): Promise<Record<string, any>> {
    // Get vault status and stats
    const vaults = await Promise.all([
      getVaultByType(this.orgId, 'claim_patterns'),
      getVaultByType(this.orgId, 'vendor_insights'),
      getVaultByType(this.orgId, 'tech_behaviors'),
      getVaultByType(this.orgId, 'equipment_trends')
    ]);
    
    // Calculate vault stats
    const vaultStats = vaults.map(vault => {
      if (!vault) return { type: 'unknown', entryCount: 0, lastUpdated: null };
      
      let entryCount = 0;
      if (vault.vault_type === 'claim_patterns') entryCount = (vault.data.patterns || []).length;
      if (vault.vault_type === 'vendor_insights') entryCount = (vault.data.vendors || []).length;
      if (vault.vault_type === 'tech_behaviors') entryCount = (vault.data.techs || []).length;
      if (vault.vault_type === 'equipment_trends') entryCount = (vault.data.equipment || []).length;
      
      return {
        type: vault.vault_type,
        entryCount,
        lastUpdated: vault.updated_at,
        version: vault.version
      };
    });
    
    // Calculate learning effectiveness
    const learningEffectiveness = this.calculateLearningEffectiveness(vaultStats);
    
    return {
      orgId: this.orgId,
      vaultStats,
      learningEffectiveness,
      mcpIntegrationStatus: {
        memoryConnected: true,
        anomalyDetectionEnabled: true,
        contextBuildingEnabled: true
      },
      recommendationCapabilities: [
        'claim_approach',
        'vendor_strategy',
        'equipment_insight',
        'escalation_suggestion'
      ].filter(cap => learningEffectiveness > 0.4) // Only enable if we have enough data
    };
  }
  
  /**
   * Calculate the learning effectiveness score
   */
  private calculateLearningEffectiveness(vaultStats: any[]): number {
    // Simple scoring mechanism based on entry counts and freshness
    let totalScore = 0;
    let maxScore = 0;
    
    for (const vault of vaultStats) {
      maxScore += 100;
      
      // Entry count score (up to 70%)
      let entriesScore = Math.min(70, vault.entryCount * 10);
      
      // Freshness score (up to 30%)
      let freshnessScore = 0;
      if (vault.lastUpdated) {
        const daysSinceUpdate = Math.max(0, (new Date().getTime() - new Date(vault.lastUpdated).getTime()) / (1000 * 3600 * 24));
        freshnessScore = daysSinceUpdate <= 7 ? 30 : daysSinceUpdate <= 30 ? 15 : 5;
      }
      
      totalScore += entriesScore + freshnessScore;
    }
    
    return totalScore / maxScore;
  }
  
  /**
   * Process real-time feedback to improve learning
   */
  async processFeedback(
    feedbackType: 'recommendation' | 'insight' | 'prediction',
    feedbackData: {
      itemId: string,
      context: Record<string, any>,
      rating: number, // 1-5 scale
      comments?: string,
      outcome?: string
    }
  ): Promise<void> {
    // Implementation depends on feedback type
    if (feedbackType === 'recommendation') {
      await this.processRecommendationFeedback(feedbackData);
    } else if (feedbackType === 'insight') {
      await this.processInsightFeedback(feedbackData);
    } else if (feedbackType === 'prediction') {
      await this.processPredictionFeedback(feedbackData);
    }
  }
  
  /**
   * Process feedback on recommendations
   */
  private async processRecommendationFeedback(feedback: any): Promise<void> {
    const { itemId, context, rating, outcome } = feedback;
    
    // Add feedback to MCP memory system
    await this.mcpManager.logEvent({
      event_type: 'feedback_received',
      entity_type: 'recommendation',
      entity_id: itemId,
      metadata: {
        rating,
        outcome,
        context
      }
    });
    
    // Update learning model based on feedback
    // This would adjust confidence scores and possibly recommendation strategies
    // Implementation would depend on recommendation type
    // Placeholder for more sophisticated learning algorithms
  }
  
  /**
   * Process feedback on insights
   */
  private async processInsightFeedback(feedback: any): Promise<void> {
    // Similar implementation to recommendation feedback
    // Would focus on adjusting insight patterns
  }
  
  /**
   * Process feedback on predictions
   */
  private async processPredictionFeedback(feedback: any): Promise<void> {
    // Similar implementation to recommendation feedback
    // Would focus on improving prediction algorithms
  }
}
