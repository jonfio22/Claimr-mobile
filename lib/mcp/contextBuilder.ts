import { supabase } from './utils/supabaseClient';
import MemoryTracker from './memoryTracker';
import AnomalyDetector from './anomalyDetector';
import RecommendationEngine from './recommendationEngine';

/**
 * Context Builder - Creates rich context objects for AI agents and interfaces
 */
export class ContextBuilder {
  /**
   * Build a comprehensive context object for AI interactions related to a claim
   * 
   * @param claimId UUID of the claim
   * @returns Structured context object with memory, patterns, and recommendations
   */
  static async buildClaimContext(claimId: string) {
    try {
      // Get basic claim data
      const { data: claim, error: claimError } = await supabase
        .from('claims')
        .select(`
          *,
          equipment (
            id,
            name,
            model,
            manufacturer
          ),
          vendors (
            id,
            name
          ),
          users (
            id,
            email,
            first_name,
            last_name
          )
        `)
        .eq('id', claimId)
        .single();

      if (claimError) throw claimError;

      // Get claim timeline
      const timeline = await MemoryTracker.getClaimMemoryStream(claimId, 50);

      // Get related messages
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .eq('claim_id', claimId)
        .order('created_at', { ascending: true });

      if (messagesError) throw messagesError;

      // Get anomalies
      const { data: anomalies, error: anomaliesError } = await supabase
        .from('anomaly_log')
        .select('*')
        .eq('claim_id', claimId)
        .order('created_at', { ascending: false });

      if (anomaliesError) throw anomaliesError;

      // Get recommendations
      const recommendations = await RecommendationEngine.getClaimRecommendations(claimId);

      // Get resolution patterns
      const { data: patterns, error: patternsError } = await supabase
        .from('resolution_patterns')
        .select('*')
        .eq('issue_type', claim.issue_type)
        .eq('equipment_id', claim.equipment_id)
        .eq('vendor_id', claim.vendor_id)
        .single();

      // Ignore if patterns not found
      const resolutionPatterns = patternsError ? null : patterns;

      // Get semantic tags
      const { data: tags, error: tagsError } = await supabase
        .from('semantic_tags')
        .select('*')
        .eq('entity_type', 'claim')
        .eq('entity_id', claimId);

      if (tagsError) throw tagsError;

      // Get photos
      const { data: photos, error: photosError } = await supabase
        .from('photos')
        .select('*')
        .eq('claim_id', claimId);

      if (photosError) throw photosError;

      // Build comprehensive context object
      return {
        claim: {
          ...claim,
          photos: photos || []
        },
        memory: {
          timeline: timeline || [],
          messages: messages || [],
          anomalies: anomalies || []
        },
        intelligence: {
          recommendations: recommendations || [],
          patterns: resolutionPatterns,
          tags: tags || []
        },
        metadata: {
          contextBuiltAt: new Date().toISOString(),
          contextVersion: '1.0'
        }
      };
    } catch (err) {
      console.error('Error building claim context:', err);
      throw err;
    }
  }

  /**
   * Build a vendor context object for AI interactions
   * 
   * @param vendorId UUID of the vendor
   * @returns Structured context with vendor behavior and patterns
   */
  static async buildVendorContext(vendorId: string) {
    try {
      // Get vendor data
      const { data: vendor, error: vendorError } = await supabase
        .from('vendors')
        .select('*')
        .eq('id', vendorId)
        .single();

      if (vendorError) throw vendorError;

      // Get vendor behavior
      const { data: behavior, error: behaviorError } = await supabase
        .from('vendor_behavior')
        .select('*')
        .eq('vendor_id', vendorId)
        .single();

      // If no behavior data yet, just proceed
      const vendorBehavior = behaviorError ? null : behavior;

      // Get resolution patterns by this vendor
      const { data: patterns, error: patternsError } = await supabase
        .from('resolution_patterns')
        .select('*')
        .eq('vendor_id', vendorId);

      if (patternsError) throw patternsError;

      // Get recent anomalies for this vendor
      const { data: anomalies, error: anomaliesError } = await supabase
        .from('anomaly_log')
        .select('*')
        .eq('vendor_id', vendorId)
        .order('created_at', { ascending: false })
        .limit(10);

      if (anomaliesError) throw anomaliesError;

      // Get recommendations
      const recommendations = await RecommendationEngine.getVendorRecommendations(vendorId);

      return {
        vendor,
        behavior: vendorBehavior,
        patterns: patterns || [],
        anomalies: anomalies || [],
        recommendations: recommendations || [],
        metadata: {
          contextBuiltAt: new Date().toISOString(),
          contextVersion: '1.0'
        }
      };
    } catch (err) {
      console.error('Error building vendor context:', err);
      throw err;
    }
  }

  /**
   * Build an equipment context object
   * 
   * @param equipmentId UUID of the equipment
   * @returns Context object with equipment data and patterns
   */
  static async buildEquipmentContext(equipmentId: string) {
    try {
      // Get equipment data
      const { data: equipment, error: equipmentError } = await supabase
        .from('equipment')
        .select('*')
        .eq('id', equipmentId)
        .single();

      if (equipmentError) throw equipmentError;

      // Get resolution patterns for this equipment
      const { data: patterns, error: patternsError } = await supabase
        .from('resolution_patterns')
        .select('*')
        .eq('equipment_id', equipmentId);

      if (patternsError) throw patternsError;

      // Group patterns by issue type
      const patternsByIssue = {};
      patterns.forEach(pattern => {
        if (!patternsByIssue[pattern.issue_type]) {
          patternsByIssue[pattern.issue_type] = [];
        }
        patternsByIssue[pattern.issue_type].push(pattern);
      });

      // Calculate success rates by issue type
      const issueSuccessRates = {};
      Object.keys(patternsByIssue).forEach(issueType => {
        const issuePatterns = patternsByIssue[issueType];
        const totalClaims = issuePatterns.reduce((sum, p) => sum + p.total_claims, 0);
        const approvedClaims = issuePatterns.reduce((sum, p) => sum + p.approved_claims, 0);
        
        issueSuccessRates[issueType] = totalClaims > 0 ? approvedClaims / totalClaims : null;
      });

      return {
        equipment,
        issuePatterns: patternsByIssue,
        issueSuccessRates,
        metadata: {
          contextBuiltAt: new Date().toISOString(),
          contextVersion: '1.0'
        }
      };
    } catch (err) {
      console.error('Error building equipment context:', err);
      throw err;
    }
  }
}

export default ContextBuilder;
