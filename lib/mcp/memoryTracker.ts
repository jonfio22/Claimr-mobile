import { createClient } from '@supabase/supabase-js';
import { EntityType, EventType } from './types';
import { supabase } from './utils/supabaseClient';

/**
 * Memory Tracker - Records events to the memory_stream table
 */
export class MemoryTracker {
  /**
   * Log an event to the memory stream
   * 
   * @param eventType Type of event occurring in the system
   * @param entityType Type of entity the event relates to
   * @param entityId UUID of the related entity
   * @param metadata Additional contextual data about the event
   * @param relatedIds Object containing related entity IDs (claim, user, vendor, equipment)
   * @returns The created memory stream record
   */
  static async logEvent(
    eventType: EventType,
    entityType: EntityType,
    entityId: string,
    metadata: Record<string, any> = {},
    relatedIds: {
      claimId?: string;
      userId?: string;
      vendorId?: string;
      equipmentId?: string;
    } = {}
  ) {
    try {
      const { data, error } = await supabase
        .from('memory_stream')
        .insert({
          event_type: eventType,
          entity_type: entityType,
          entity_id: entityId,
          user_id: relatedIds.userId,
          vendor_id: relatedIds.vendorId,
          equipment_id: relatedIds.equipmentId,
          claim_id: relatedIds.claimId,
          metadata
        })
        .select()
        .single();

      if (error) {
        console.error('Error logging to memory stream:', error);
        throw error;
      }

      // Run anomaly detection if this is a critical event type
      if (['status_changed', 'claim_updated', 'message_received'].includes(eventType)) {
        // We'll implement this later
        // anomalyDetector.checkForAnomalies(eventType, entityId, metadata);
      }

      return data;
    } catch (err) {
      console.error('Memory tracking failed:', err);
      throw err;
    }
  }

  /**
   * Get recent events for a specific entity
   * 
   * @param entityType Type of entity to retrieve events for
   * @param entityId UUID of the entity
   * @param limit Maximum number of events to return (default: 50)
   * @returns Array of memory stream events
   */
  static async getEntityTimeline(
    entityType: EntityType,
    entityId: string,
    limit: number = 50
  ) {
    const { data, error } = await supabase
      .from('memory_stream')
      .select('*')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching entity timeline:', error);
      throw error;
    }

    return data;
  }

  /**
   * Get memory stream for a claim including all related entities
   * 
   * @param claimId UUID of the claim
   * @param limit Maximum number of events to return (default: 100)
   * @returns Array of memory stream events for the claim
   */
  static async getClaimMemoryStream(
    claimId: string,
    limit: number = 100
  ) {
    const { data, error } = await supabase
      .from('memory_stream')
      .select('*')
      .eq('claim_id', claimId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching claim memory stream:', error);
      throw error;
    }

    return data;
  }

  // Example usage for claim creation:
  // MemoryTracker.logEvent(
  //   'claim_created',
  //   'claim',
  //   newClaim.id,
  //   { issue_description: newClaim.description },
  //   {
  //     claimId: newClaim.id,
  //     userId: newClaim.userId,
  //     vendorId: newClaim.vendorId,
  //     equipmentId: newClaim.equipmentId
  //   }
  // );
}

export default MemoryTracker;
