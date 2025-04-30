import { supabase } from './utils/supabaseClient';
import MemoryTracker from './memoryTracker';
import { EntityType, EventType } from './types';
import dayjs from 'dayjs';

/**
 * MCPMemoryProvider - Wraps MemoryTracker to provide convenient access patterns
 * for the Agent Bridge API endpoints
 */
export class MCPMemoryProvider {
  /**
   * Log an event related to a claim
   * 
   * @param claimId The ID of the claim
   * @param eventType The type of event
   * @param metadata Additional details about the event
   * @param relatedIds Optional related entity IDs
   */
  static async logClaimEvent(
    claimId: string, 
    eventType: EventType, 
    metadata: Record<string, any> = {},
    relatedIds: {
      userId?: string;
      vendorId?: string;
      equipmentId?: string;
    } = {}
  ) {
    return await MemoryTracker.logEvent(
      eventType,
      'claim',
      claimId,
      metadata,
      {
        claimId,
        ...relatedIds
      }
    );
  }

  /**
   * Get the memory stream for a claim as a timeline
   * 
   * @param claimId The ID of the claim
   * @param limit Maximum number of events to return
   * @returns Formatted timeline of claim events
   */
  static async getClaimMemoryStream(claimId: string, limit: number = 100) {
    const events = await MemoryTracker.getClaimMemoryStream(claimId, limit);
    
    // Convert raw memory stream events to a more API-friendly format
    return events.map(event => ({
      id: event.id,
      timestamp: event.created_at,
      eventType: event.event_type,
      entityType: event.entity_type,
      entityId: event.entity_id,
      details: event.metadata || {}
    }));
  }

  /**
   * Get timeline events for a claim
   * 
   * @param claimId The ID of the claim
   * @param options Optional parameters like limit and filter
   * @returns Chronological timeline of significant claim events
   */
  static async getClaimTimeline(
    claimId: string,
    options: {
      limit?: number;
      filter?: 'all' | 'significant' | 'anomalies';
    } = {}
  ) {
    const { limit = 50, filter = 'all' } = options;
    
    // Get raw events
    let events = await this.getClaimMemoryStream(claimId, limit * 2); // Fetch more to account for filtering
    
    // Apply filtering if needed
    if (filter === 'significant') {
      // Only include significant events like status changes, escalations, etc.
      const significantTypes: EventType[] = [
        'claim_created',
        'status_changed',
        'escalation_requested',
        'claim_resolved'
      ];
      events = events.filter(event => significantTypes.includes(event.eventType as EventType));
    } else if (filter === 'anomalies') {
      // Get anomalies related to this claim
      const { data: anomalies } = await supabase
        .from('anomaly_log')
        .select('*')
        .eq('claim_id', claimId)
        .order('created_at', { ascending: false })
        .limit(limit);
        
      // Combine with specific event types
      const anomalyEvents = (anomalies || []).map(anomaly => ({
        id: anomaly.id,
        timestamp: anomaly.created_at,
        eventType: 'anomaly_detected' as any,
        entityType: anomaly.entity_type as EntityType,
        entityId: anomaly.entity_id,
        details: {
          anomaly_type: anomaly.anomaly_type,
          severity: anomaly.severity,
          description: anomaly.description,
          ...anomaly.metadata
        }
      }));
      
      events = [...anomalyEvents, ...events]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, limit);
    }
    
    // Limit to requested size
    return events.slice(0, limit);
  }

  /**
   * Generate a summary of the claim's memory stream
   * 
   * @param claimId The ID of the claim
   * @returns Summary statistics about the claim's history
   */
  static async getMemorySummary(claimId: string) {
    // Get claim details
    const { data: claim } = await supabase
      .from('claims')
      .select('created_at, status, escalated')
      .eq('id', claimId)
      .single();
      
    // Get memory stream (limit high to get accurate counts)
    const events = await MemoryTracker.getClaimMemoryStream(claimId, 1000);
    
    // Count event types
    const eventCounts = events.reduce((counts, event) => {
      const type = event.event_type;
      counts[type] = (counts[type] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);
    
    // Calculate time metrics
    const createdAt = claim ? dayjs(claim.created_at) : null;
    const now = dayjs();
    const ageDays = createdAt ? now.diff(createdAt, 'day') : null;
    
    // Get most recent status change
    const statusChanges = events.filter(e => e.event_type === 'status_changed');
    const lastStatusChange = statusChanges.length > 0 ? statusChanges[0] : null;
    
    // Count messages
    const { data: messages } = await supabase
      .from('messages')
      .select('id, sender_type')
      .eq('claim_id', claimId);
      
    const messageCounts = (messages || []).reduce((counts, message) => {
      const type = message.sender_type || 'unknown';
      counts[type] = (counts[type] || 0) + 1;
      return counts;
    }, {} as Record<string, number>);
    
    // Count photos
    const { count: photoCount } = await supabase
      .from('photos')
      .select('id', { count: 'exact', head: true })
      .eq('claim_id', claimId);
    
    // Get anomalies
    const { data: anomalies } = await supabase
      .from('anomaly_log')
      .select('anomaly_type, severity')
      .eq('claim_id', claimId)
      .eq('resolved', false);
      
    return {
      ageInDays: ageDays,
      currentStatus: claim?.status || 'unknown',
      escalated: claim?.escalated || false,
      eventCount: events.length,
      eventBreakdown: eventCounts,
      messageCount: (messages || []).length,
      messageBreakdown: messageCounts,
      photoCount: photoCount || 0,
      anomalyCount: (anomalies || []).length,
      lastActivity: events.length > 0 ? events[0].created_at : null,
      lastStatusChange: lastStatusChange ? {
        timestamp: lastStatusChange.created_at,
        from: lastStatusChange.metadata?.old_status,
        to: lastStatusChange.metadata?.new_status
      } : null
    };
  }
}

export default MCPMemoryProvider;
