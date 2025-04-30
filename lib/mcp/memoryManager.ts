import { supabase } from './utils/supabaseClient';
import { MemoryTracker } from './memoryTracker';
import { AnomalyDetector } from './anomalyDetector';
import { RecommendationEngine } from './recommendationEngine';
import { ContextBuilder } from './contextBuilder';
import { EntityType, EventType, MemoryEvent } from './types';

/**
 * Central manager for MCP7 Memory System
 * Coordinates memory operations across the system
 */
export class MCP7MemoryManager {
  private memoryTracker: MemoryTracker;
  private anomalyDetector: AnomalyDetector;
  private recommendationEngine: RecommendationEngine;
  private contextBuilder: ContextBuilder;
  
  constructor() {
    this.memoryTracker = new MemoryTracker();
    this.anomalyDetector = new AnomalyDetector();
    this.recommendationEngine = new RecommendationEngine();
    this.contextBuilder = new ContextBuilder();
  }
  
  /**
   * Log an event to the memory system
   */
  async logEvent(event: Partial<MemoryEvent>): Promise<MemoryEvent | null> {
    // Ensure required fields
    if (!event.event_type) {
      console.error('Missing event_type in event:', event);
      return null;
    }
    
    if (!event.entity_type) {
      console.error('Missing entity_type in event:', event);
      return null;
    }
    
    if (!event.entity_id) {
      console.error('Missing entity_id in event:', event);
      return null;
    }
    
    // Log the event
    const memoryEvent = await this.memoryTracker.logEvent(
      event.event_type as EventType,
      event.entity_type as EntityType,
      event.entity_id,
      event.metadata || {}
    );
    
    // Run anomaly detection if enabled
    if (memoryEvent) {
      this.anomalyDetector.checkForAnomalies(memoryEvent);
    }
    
    return memoryEvent;
  }
  
  /**
   * Get memory stream for a specific entity
   */
  async getMemoryStream(
    entityType: EntityType, 
    entityId: string,
    limit = 50
  ): Promise<MemoryEvent[]> {
    return this.memoryTracker.getMemoryStream(entityType, entityId, limit);
  }
  
  /**
   * Get a specific memory event by ID
   */
  async getMemoryEvent(eventId: string): Promise<MemoryEvent | null> {
    return this.memoryTracker.getMemoryEvent(eventId);
  }
  
  /**
   * Get recommendations for a specific entity
   */
  async getRecommendations(
    entityType: EntityType,
    entityId: string,
    limit = 5
  ): Promise<any[]> {
    return this.recommendationEngine.getRecommendations(entityType, entityId, limit);
  }
  
  /**
   * Build context for AI agent interactions
   */
  async buildAgentContext(
    entityType: EntityType,
    entityId: string,
    includeRecommendations = true,
    includeAnomalies = true
  ): Promise<any> {
    return this.contextBuilder.buildContext(
      entityType, 
      entityId, 
      includeRecommendations,
      includeAnomalies
    );
  }
  
  /**
   * Get recent anomalies for an entity
   */
  async getAnomalies(
    entityType: EntityType,
    entityId: string,
    limit = 10
  ): Promise<any[]> {
    return this.anomalyDetector.getAnomalies(entityType, entityId, limit);
  }
  
  /**
   * Connect organization learning vaults to memory system
   * This enables the memory system to feed data to the organization learning vaults
   */
  async connectOrganizationVault(orgId: string): Promise<boolean> {
    try {
      // Set up subscription to memory events for this org
      const subscription = supabase
        .channel('org-memory-events')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'memory_stream',
            filter: `org_id=eq.${orgId}`
          },
          async (payload) => {
            // Process the memory event for organizational learning
            await this.processMemoryEventForOrgLearning(payload.new, orgId);
          }
        )
        .subscribe();
      
      console.log(`Connected organization vault for org ${orgId} to memory system`);
      return true;
    } catch (error) {
      console.error('Error connecting organization vault:', error);
      return false;
    }
  }
  
  /**
   * Process a memory event for organization learning
   */
  private async processMemoryEventForOrgLearning(event: any, orgId: string): Promise<void> {
    // Depending on the event type and entity type, update different vaults
    const eventType = event.event_type;
    const entityType = event.entity_type;
    const entityId = event.entity_id;
    const metadata = event.metadata || {};
    
    // Import here to avoid circular dependency
    const { OrgLearningVaultService } = require('../org/orgLearningVaultService');
    const vaultService = new OrgLearningVaultService(orgId, this);
    
    // Process claim events
    if (entityType === 'claim') {
      if (eventType === 'status_changed' || eventType === 'updated' || eventType === 'created') {
        // Get claim data
        const { data: claim } = await supabase
          .from('claims')
          .select('*')
          .eq('id', entityId)
          .single();
          
        if (claim) {
          // Update claim patterns
          await vaultService.updateClaimPatterns(entityId, claim);
          
          // If claim has vendor, update vendor insights
          if (claim.vendor_id) {
            await vaultService.updateVendorInsights(claim.vendor_id, claim);
          }
        }
      }
    }
    
    // Process vendor events
    if (entityType === 'vendor' && (eventType === 'updated' || eventType === 'created')) {
      // Get vendor data
      const { data: vendor } = await supabase
        .from('vendors')
        .select('*')
        .eq('id', entityId)
        .single();
        
      if (vendor) {
        // This would update vendor-specific learning
        // Implementation would depend on vendor data structure
      }
    }
    
    // Process tech/user events
    if (entityType === 'user' && (eventType === 'claim_assignment' || eventType === 'claim_resolution')) {
      // Get user/tech data
      const { data: user } = await supabase
        .from('users')
        .select('*')
        .eq('id', entityId)
        .single();
        
      if (user) {
        // Update tech behaviors
        // Implementation would depend on tech data structure
      }
    }
  }
}
