import { supabase } from './utils/supabaseClient';
import MemoryTracker from './memoryTracker';
import AnomalyDetector from './anomalyDetector';
import RecommendationEngine from './recommendationEngine';
import { ClaimContext, ContextBuilderOptions, EquipmentContext, VendorContext } from './types';

/**
 * Context Builder - Creates rich context objects for AI agents and interfaces
 * 
 * @description Assembles comprehensive context for claims, equipment, and vendors
 * including historical data, anomalies, recommendations, and related entities.
 */
export class ContextBuilder {
  /**
   * Builds a comprehensive context object for a given entity
   * 
   * @param entityType Type of entity (claim, vendor, equipment)
   * @param entityId ID of the entity
   * @param options Optional configuration for context building
   * @returns Structured context object with all relevant information
   */
  static async buildContext(
    entityType: string = 'claim',
    entityId: string,
    options: ContextBuilderOptions = {
      includeRecommendations: true,
      includeAnomalies: true,
      includeRelated: true,
      maxHistoryItems: 50
    }
  ): Promise<ClaimContext | VendorContext | EquipmentContext> {
    switch (entityType.toLowerCase()) {
      case 'claim':
        return this.buildClaimContext(entityId, options);
      case 'equipment':
        return this.buildEquipmentContext(entityId, options);
      case 'vendor':
        return this.buildVendorContext(entityId, options);
      default:
        throw new Error(`Unsupported entity type: ${entityType}`);
    }
  }

  /**
   * Build a comprehensive context object for AI interactions related to a claim
   * 
   * @param claimId UUID of the claim
   * @param options Optional configuration for context building
   * @returns Structured context object with memory, patterns, and recommendations
   */
  static async buildClaimContext(claimId: string, options: ContextBuilderOptions = {}) {
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

  /**
   * Build a comprehensive context object for equipment
   * 
   * @param equipmentId UUID of the equipment
   * @param options Optional configuration for context building
   * @returns Structured context object with equipment data, history, and patterns
   */
  static async buildEquipmentContext(equipmentId: string, options: ContextBuilderOptions = {}) {
    try {
      // Get basic equipment data
      const { data: equipment, error: equipmentError } = await supabase
        .from('equipment')
        .select(`
          *,
          organization:org_id(*)
        `)
        .eq('id', equipmentId)
        .single();

      if (equipmentError) throw equipmentError;

      // Get related claims for this equipment
      const { data: relatedClaims, error: claimsError } = await supabase
        .from('claims')
        .select(`
          id,
          created_at,
          updated_at,
          status,
          issue_description,
          resolution
        `)
        .eq('equipment_id', equipmentId)
        .order('created_at', { ascending: false })
        .limit(options.maxHistoryItems || 20);

      if (claimsError) throw claimsError;

      // Get maintenance records
      const { data: maintenanceRecords, error: maintenanceError } = await supabase
        .from('equipment_maintenance')
        .select('*')
        .eq('equipment_id', equipmentId)
        .order('service_date', { ascending: false })
        .limit(options.maxHistoryItems || 10);

      // Initialize the context object
      const context: EquipmentContext = {
        entityId: equipmentId,
        entityType: 'equipment',
        timestamp: new Date().toISOString(),
        context: {
          equipment,
          claims: relatedClaims || [],
          maintenance: maintenanceRecords || [],
          stats: await this.calculateEquipmentStats(equipmentId, relatedClaims || [])
        }
      };

      // Include anomalies if requested
      if (options.includeAnomalies) {
        const { data: anomalies } = await supabase
          .from('anomaly_log')
          .select('*')
          .eq('equipment_id', equipmentId)
          .order('created_at', { ascending: false })
          .limit(10);

        context.context.anomalies = anomalies || [];
      }

      // Include recommendations if requested
      if (options.includeRecommendations) {
        const recommendations = await RecommendationEngine.getEquipmentRecommendations(equipmentId);
        context.context.recommendations = recommendations || [];
      }

      return context;
    } catch (err) {
      console.error('Error building equipment context:', err);
      throw err;
    }
  }

  /**
   * Build a comprehensive context object for vendor
   * 
   * @param vendorId UUID of the vendor
   * @param options Optional configuration for context building
   * @returns Structured context object with vendor data, history, and patterns
   */
  static async buildVendorContext(vendorId: string, options: ContextBuilderOptions = {}) {
    try {
      // Get basic vendor data
      const { data: vendor, error: vendorError } = await supabase
        .from('vendors')
        .select('*')
        .eq('id', vendorId)
        .single();

      if (vendorError) throw vendorError;

      // Get related claims for this vendor
      const { data: relatedClaims, error: claimsError } = await supabase
        .from('claims')
        .select(`
          id,
          created_at,
          updated_at,
          status,
          equipment_id,
          equipment:equipment_id(name, model),
          issue_description,
          resolution
        `)
        .eq('vendor_id', vendorId)
        .order('created_at', { ascending: false })
        .limit(options.maxHistoryItems || 30);

      if (claimsError) throw claimsError;

      // Calculate vendor performance metrics
      const stats = this.calculateVendorStats(relatedClaims || []);

      // Initialize the context object
      const context: VendorContext = {
        entityId: vendorId,
        entityType: 'vendor',
        timestamp: new Date().toISOString(),
        context: {
          vendor,
          claims: relatedClaims || [],
          stats
        }
      };

      // Include anomalies if requested
      if (options.includeAnomalies) {
        const { data: anomalies } = await supabase
          .from('anomaly_log')
          .select('*')
          .eq('vendor_id', vendorId)
          .order('created_at', { ascending: false })
          .limit(10);

        context.context.anomalies = anomalies || [];
      }

      return context;
    } catch (err) {
      console.error('Error building vendor context:', err);
      throw err;
    }
  }

  /**
   * Calculate statistics for a vendor based on claim history
   * 
   * @param claims Array of claims associated with the vendor
   * @returns Object containing vendor performance metrics
   */
  private static calculateVendorStats(claims: any[]) {
    if (!claims.length) return { approvalRate: 0, avgResponseTime: 0, claimCount: 0 };
    
    const approvedClaims = claims.filter(c => 
      c.status === 'APPROVED' || c.status === 'COMPLETED'
    );
    const rejectedClaims = claims.filter(c => c.status === 'REJECTED');
    const pendingClaims = claims.filter(c => 
      c.status !== 'APPROVED' && c.status !== 'COMPLETED' && c.status !== 'REJECTED'
    );
    
    return {
      approvalRate: approvedClaims.length / claims.length,
      rejectionRate: rejectedClaims.length / claims.length,
      pendingRate: pendingClaims.length / claims.length,
      claimCount: claims.length,
      equipmentDistribution: this.getEquipmentDistribution(claims),
      statusDistribution: this.getStatusDistribution(claims)
    };
  }

  /**
   * Calculate statistics for equipment based on claim history
   * 
   * @param equipmentId ID of the equipment
   * @param claims Array of claims associated with the equipment
   * @returns Object containing equipment performance metrics
   */
  private static async calculateEquipmentStats(equipmentId: string, claims: any[]) {
    if (!claims.length) return { failureRate: 0, mtbf: 0, claimCount: 0 };
    
    // Get equipment age (if possible)
    const { data: equipment } = await supabase
      .from('equipment')
      .select('installation_date, purchase_date')
      .eq('id', equipmentId)
      .single();
    
    const startDate = equipment?.installation_date || equipment?.purchase_date;
    const ageInDays = startDate ? 
      Math.ceil((Date.now() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) : 365;
    
    // Calculate mean time between failures
    const claimDates = claims.map(c => new Date(c.created_at).getTime()).sort();
    let totalTimeBetween = 0;
    
    for (let i = 1; i < claimDates.length; i++) {
      totalTimeBetween += claimDates[i] - claimDates[i-1];
    }
    
    const mtbf = claims.length > 1 ? 
      totalTimeBetween / (claims.length - 1) / (1000 * 60 * 60 * 24) : ageInDays;
    
    return {
      failureRate: claims.length / ageInDays,
      mtbf: Math.round(mtbf), // Mean time between failures in days
      claimCount: claims.length,
      issueTypes: this.categorizeIssues(claims),
      daysSinceLastClaim: claims.length > 0 ? 
        Math.ceil((Date.now() - new Date(claims[0].created_at).getTime()) / (1000 * 60 * 60 * 24)) : 0
    };
  }

  /**
   * Get distribution of equipment in claims
   * 
   * @param claims Array of claims
   * @returns Object with equipment distribution
   */
  private static getEquipmentDistribution(claims: any[]) {
    const distribution: Record<string, number> = {};
    
    claims.forEach(claim => {
      if (claim.equipment && claim.equipment.name) {
        const key = claim.equipment.name;
        distribution[key] = (distribution[key] || 0) + 1;
      }
    });
    
    return distribution;
  }

  /**
   * Get distribution of statuses in claims
   * 
   * @param claims Array of claims
   * @returns Object with status distribution
   */
  private static getStatusDistribution(claims: any[]) {
    const distribution: Record<string, number> = {};
    
    claims.forEach(claim => {
      const status = claim.status || 'UNKNOWN';
      distribution[status] = (distribution[status] || 0) + 1;
    });
    
    return distribution;
  }

  /**
   * Categorize issues by common keywords
   * 
   * @param claims Array of claims
   * @returns Object with issue categories and counts
   */
  private static categorizeIssues(claims: any[]) {
    const categories: Record<string, number> = {
      'display': 0,
      'power': 0,
      'connection': 0,
      'audio': 0,
      'physical': 0,
      'other': 0
    };
    
    const keywords: Record<string, string[]> = {
      'display': ['screen', 'display', 'image', 'pixel', 'color', 'resolution'],
      'power': ['power', 'on/off', 'boot', 'startup', 'shutdown', 'battery'],
      'connection': ['hdmi', 'usb', 'port', 'connect', 'cable', 'input'],
      'audio': ['sound', 'audio', 'speaker', 'volume', 'noise'],
      'physical': ['damage', 'broken', 'crack', 'dent', 'physical']
    };
    
    claims.forEach(claim => {
      const description = (claim.issue_description || claim.description || '').toLowerCase();
      let categorized = false;
      
      for (const [category, terms] of Object.entries(keywords)) {
        if (terms.some(term => description.includes(term))) {
          categories[category]++;
          categorized = true;
          break;
        }
      }
      
      if (!categorized) {
        categories['other']++;
      }
    });
    
    return categories;
  }

  /**
   * Build context object for a claim
   * Compatibility alias for the toolchain
   * 
   * @param params Parameters containing claimId
   * @returns Context object for the claim
   */
  static async getClaimContext(params: { claimId: string }) {
    return this.buildClaimContext(params.claimId);
  }
}

export default ContextBuilder;
