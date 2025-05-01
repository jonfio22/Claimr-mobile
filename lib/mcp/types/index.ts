// Core MCP7 types
export * from './contextTypes';

export type EntityType = 'claim' | 'message' | 'equipment' | 'vendor' | 'user' | 'photo';

export type EventType = 
  | 'claim_created' 
  | 'claim_updated' 
  | 'message_sent' 
  | 'message_received' 
  | 'status_changed' 
  | 'photo_uploaded' 
  | 'escalation_requested' 
  | 'claim_resolved';

export type AnomalyType = 
  | 'late_response' 
  | 'excessive_resubmissions' 
  | 'unusual_denial' 
  | 'sla_violation' 
  | 'pattern_deviation' 
  | 'suspicious_activity'
  | 'missing_documentation';

export type AnomalySeverity = 1 | 2 | 3 | 4 | 5;

export type RecommendationType = 
  | 'escalation' 
  | 'documentation' 
  | 'follow_up' 
  | 'alternative_approach' 
  | 'timing_optimization';

export interface TimelineEvent {
  id: string;
  timestamp: Date;
  eventType: EventType;
  entityType: EntityType;
  entityId: string;
  details: any;
}

export interface MCP7Config {
  anomalyDetectionInterval: number; // ms
  responseTimeThresholdHours: number; 
  photoCountThreshold: number;
  enableRealTimeDetection: boolean;
  modelSettings: {
    embeddingModel: string;
    embeddingDimension: number;
    similarityThreshold: number;
  };
}
