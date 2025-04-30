import { supabase } from './utils/supabaseClient';
import { RecommendationType } from './types';

/**
 * Recommendation Engine - Provides intelligent next steps and suggestions
 */
export class RecommendationEngine {
  /**
   * Generate recommendations for a specific claim
   * 
   * @param claimId UUID of the claim
   * @returns Array of recommendations with explanation and confidence
   */
  static async getClaimRecommendations(claimId: string) {
    try {
      // Get claim details with related data
      const { data: claim, error: claimError } = await supabase
        .from('claims')
        .select(`
          id,
          status,
          issue_type,
          equipment_id,
          vendor_id,
          created_at,
          escalated,
          (
            SELECT COUNT(*) FROM photos WHERE claim_id = claims.id
          ) as photo_count,
          (
            SELECT COUNT(*) FROM messages WHERE claim_id = claims.id
          ) as message_count
        `)
        .eq('id', claimId)
        .single();

      if (claimError) throw claimError;

      // Get vendor behavior
      const { data: vendorBehavior, error: vendorError } = await supabase
        .from('vendor_behavior')
        .select('*')
        .eq('vendor_id', claim.vendor_id)
        .single();

      // If vendor not found, just ignore
      const vendor = vendorError ? null : vendorBehavior;

      // Get resolution patterns
      const { data: patterns, error: patternError } = await supabase
        .from('resolution_patterns')
        .select('*')
        .eq('issue_type', claim.issue_type)
        .eq('equipment_id', claim.equipment_id)
        .eq('vendor_id', claim.vendor_id)
        .single();

      // If patterns not found, just ignore
      const pattern = patternError ? null : patterns;

      // Get anomalies for this claim
      const { data: anomalies, error: anomalyError } = await supabase
        .from('anomaly_log')
        .select('*')
        .eq('claim_id', claimId)
        .eq('resolved', false)
        .order('severity', { ascending: false });

      if (anomalyError) throw anomalyError;

      const recommendations = [];

      // Recommendation logic based on collected data
      
      // 1. Check if escalation might be needed
      if (
        claim.status === 'submitted' && 
        !claim.escalated && 
        vendor && 
        vendor.escalation_rate > 0.3 && // High escalation rate for this vendor
        pattern && 
        (Date.now() - new Date(claim.created_at).getTime()) / (1000 * 60 * 60 * 24) > 3 // Claim is older than 3 days
      ) {
        recommendations.push({
          type: 'escalation' as RecommendationType,
          message: `Consider escalating this claim. ${Math.round(vendor.escalation_rate * 100)}% of similar claims with ${vendor.name} require escalation.`,
          confidence: calculateConfidence(vendor.escalation_rate, anomalies.length, pattern?.total_claims || 0),
          actionable: true,
          action: {
            type: 'escalate',
            params: { claimId }
          }
        });
      }

      // 2. Check if more photos might be needed
      if (
        claim.status === 'submitted' && 
        pattern && 
        claim.photo_count < pattern.avg_photo_count && 
        vendor && 
        vendor.photo_sensitivity > 0.6 // Vendor is sensitive to photo evidence
      ) {
        recommendations.push({
          type: 'documentation' as RecommendationType,
          message: `Adding more photos may increase approval chances. Similar approved claims have ${Math.round(pattern.avg_photo_count)} photos on average.`,
          confidence: calculateConfidence(vendor.photo_sensitivity, 0, pattern.total_claims),
          actionable: true,
          action: {
            type: 'add_photos',
            params: { claimId }
          }
        });
      }

      // 3. Check timing optimization
      if (
        claim.status === 'draft' && 
        vendor && 
        vendor.business_days_to_first_response
      ) {
        // Find the day with best response rate
        const responseRates = vendor.business_days_to_first_response;
        const bestDay = Object.keys(responseRates).reduce(
          (a, b) => responseRates[a] > responseRates[b] ? a : b
        );

        recommendations.push({
          type: 'timing_optimization' as RecommendationType,
          message: `Submitting on ${bestDay} may get faster responses from this vendor.`,
          confidence: 0.7,
          actionable: false
        });
      }

      // Add more recommendation types based on business logic...

      return recommendations;
    } catch (err) {
      console.error('Error generating recommendations:', err);
      throw err;
    }
  }

  /**
   * Get vendor-specific recommendations based on historical data
   * 
   * @param vendorId UUID of the vendor
   * @returns Array of recommendations for dealing with this vendor
   */
  static async getVendorRecommendations(vendorId: string) {
    try {
      // Get vendor behavior data
      const { data: vendor, error: vendorError } = await supabase
        .from('vendor_behavior')
        .select(`
          *,
          vendors (
            id,
            name
          )
        `)
        .eq('vendor_id', vendorId)
        .single();

      if (vendorError && vendorError.code !== 'PGRST116') throw vendorError;

      // If no data yet
      if (!vendor) {
        return [];
      }

      const recommendations = [];

      // Generate recommendations based on vendor behavior
      if (vendor.photo_sensitivity > 0.8) {
        recommendations.push({
          type: 'documentation' as RecommendationType,
          message: `This vendor typically requires extensive photo documentation. Include at least 4-5 photos from different angles.`,
          confidence: vendor.photo_sensitivity,
          actionable: false
        });
      }

      if (vendor.approval_rate < 0.4) {
        recommendations.push({
          type: 'escalation' as RecommendationType,
          message: `This vendor has a low approval rate (${Math.round(vendor.approval_rate * 100)}%). Consider pre-emptively preparing for escalation.`,
          confidence: 1 - vendor.approval_rate,
          actionable: false
        });
      }

      if (vendor.avg_response_time_hours > 48) {
        recommendations.push({
          type: 'follow_up' as RecommendationType,
          message: `This vendor typically takes ${Math.round(vendor.avg_response_time_hours / 24)} days to respond. Set a reminder to follow up if no response.`,
          confidence: 0.9,
          actionable: false
        });
      }

      return recommendations;
    } catch (err) {
      console.error('Error generating vendor recommendations:', err);
      throw err;
    }
  }
}

// Helper function to calculate recommendation confidence
function calculateConfidence(
  primaryFactor: number, 
  anomalyCount: number, 
  sampleSize: number
): number {
  // Base confidence from primary factor (0-1)
  let confidence = primaryFactor;
  
  // Adjust based on anomalies (each anomaly adds up to 0.1)
  confidence += Math.min(0.2, anomalyCount * 0.05);
  
  // Adjust based on sample size (more samples = more confidence)
  // Small sample size penalty
  if (sampleSize < 10) {
    confidence *= (0.5 + (sampleSize / 20)); // 50% confidence at 0 samples, scales up to 100% at 10 samples
  }
  
  // Cap at 0.95 - never perfect confidence
  return Math.min(0.95, Math.max(0.1, confidence));
}

export default RecommendationEngine;
