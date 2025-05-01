import { VerificationWorker } from './VerificationWorker';
import { supabase } from '../supabase/client';
import { ClaimrAgent } from '../agent/agent';
import { v4 as uuidv4 } from 'uuid';

/**
 * Event types handled by the stream processor
 */
export enum VerificationEventType {
  CLAIM_CREATED = 'claim_created',
  CLAIM_UPDATED = 'claim_updated',
  STAGE_ENTERED = 'stage_entered',
  STAGE_COMPLETED = 'stage_completed',
  TOOL_ACTIVATED = 'tool_activated',
  TOOL_COMPLETED = 'tool_completed',
  VERIFICATION_REQUESTED = 'verification_requested',
  AUDIT_COMPLETE = 'audit_complete'
}

/**
 * Event payload interface
 */
export interface VerificationEvent {
  id: string;
  eventType: VerificationEventType;
  timestamp: string;
  claimId: string;
  stage?: string;
  toolName?: string;
  data: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * Event Stream Processor
 * 
 * Captures, processes, and routes verification events through the system.
 * This implementation uses Supabase Realtime for event streaming.
 */
export class EventStreamProcessor {
  private worker: VerificationWorker;
  private activeAudits: Map<string, string>; // Maps claimId to auditId
  private subscribers: Map<VerificationEventType, Array<(event: VerificationEvent) => Promise<void>>>;
  private retryQueue: VerificationEvent[] = [];
  private isProcessing: boolean = false;
  
  constructor() {
    this.worker = new VerificationWorker();
    this.activeAudits = new Map();
    this.subscribers = new Map();
    
    // Set up subscribers for each event type
    Object.values(VerificationEventType).forEach(eventType => {
      this.subscribers.set(eventType as VerificationEventType, []);
    });
    
    // Register default event handlers
    this.registerDefaultHandlers();
    
    // Start retry processing loop
    this.processRetryQueue();
  }
  
  /**
   * Initialize the event stream processor
   * Sets up database listeners for claim events
   */
  async initialize(): Promise<void> {
    try {
      console.log('Initializing Event Stream Processor...');
      
      // Subscribe to claim events via Supabase Realtime
      this.subscribeToClaimEvents();
      
      // Subscribe to tool activation events
      this.subscribeToToolEvents();
      
      console.log('Event Stream Processor initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Event Stream Processor:', error);
      throw error;
    }
  }
  
  /**
   * Subscribe to a specific event type
   * @param eventType Type of event to subscribe to
   * @param handler Event handler function
   */
  subscribe(
    eventType: VerificationEventType,
    handler: (event: VerificationEvent) => Promise<void>
  ): void {
    const handlers = this.subscribers.get(eventType) || [];
    handlers.push(handler);
    this.subscribers.set(eventType, handlers);
  }
  
  /**
   * Publish an event to the stream
   * @param event Event to publish
   * @returns Whether event was successfully published
   */
  async publishEvent(event: VerificationEvent): Promise<boolean> {
    try {
      // Ensure event has required fields
      if (!event.id) {
        event.id = uuidv4();
      }
      
      if (!event.timestamp) {
        event.timestamp = new Date().toISOString();
      }
      
      // Log event to verification_events table for auditability
      const { error } = await supabase
        .from('verification_events')
        .insert({
          event_id: event.id,
          event_type: event.eventType,
          timestamp: event.timestamp,
          claim_id: event.claimId,
          pipeline_stage: event.stage,
          tool_name: event.toolName,
          event_data: event.data,
          metadata: event.metadata
        });
        
      if (error) {
        console.error('Failed to log verification event:', error);
        // Add to retry queue but continue processing
        this.retryQueue.push(event);
      }
      
      // Process event through appropriate handlers
      await this.processEvent(event);
      
      return true;
    } catch (error) {
      console.error('Error publishing event:', error);
      // Add to retry queue
      this.retryQueue.push(event);
      return false;
    }
  }
  
  /**
   * Subscribe to claim-related events from the database
   */
  private subscribeToClaimEvents(): void {
    // Subscribe to claim INSERT events
    supabase
      .channel('claims-inserts')
      .on(
        'postgres_changes',
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'claims' 
        },
        async (payload) => {
          try {
            const claimId = payload.new.id;
            
            // Create claim created event
            const event: VerificationEvent = {
              id: uuidv4(),
              eventType: VerificationEventType.CLAIM_CREATED,
              timestamp: new Date().toISOString(),
              claimId,
              stage: 'INGESTION',
              data: payload.new,
              metadata: {
                source: 'database_trigger',
                table: 'claims',
                operation: 'INSERT'
              }
            };
            
            await this.publishEvent(event);
          } catch (error) {
            console.error('Error processing claim insert event:', error);
          }
        }
      )
      .subscribe();
      
    // Subscribe to claim UPDATE events
    supabase
      .channel('claims-updates')
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'claims' 
        },
        async (payload) => {
          try {
            const claimId = payload.new.id;
            
            // Create claim updated event
            const event: VerificationEvent = {
              id: uuidv4(),
              eventType: VerificationEventType.CLAIM_UPDATED,
              timestamp: new Date().toISOString(),
              claimId,
              data: {
                previous: payload.old,
                current: payload.new
              },
              metadata: {
                source: 'database_trigger',
                table: 'claims',
                operation: 'UPDATE'
              }
            };
            
            // Determine stage based on status changes
            if (payload.old.status !== payload.new.status) {
              switch (payload.new.status) {
                case 'SUBMITTED':
                  event.stage = 'INGESTION';
                  break;
                case 'PROCESSING':
                  event.stage = 'PROCESSING';
                  break;
                case 'APPROVED':
                case 'REJECTED':
                  event.stage = 'COMPLETION';
                  break;
              }
            }
            
            await this.publishEvent(event);
          } catch (error) {
            console.error('Error processing claim update event:', error);
          }
        }
      )
      .subscribe();
  }
  
  /**
   * Subscribe to tool activation events
   */
  private subscribeToToolEvents(): void {
    // In a real implementation, this would subscribe to a dedicated Kafka topic or event stream
    // For this implementation, we'll use a custom channel in Supabase Realtime
    
    supabase
      .channel('tool-activations')
      .on(
        'broadcast',
        { event: 'tool_activated' },
        async (payload) => {
          try {
            const { claimId, toolName, input, timestamp } = payload;
            
            // Create tool activated event
            const event: VerificationEvent = {
              id: uuidv4(),
              eventType: VerificationEventType.TOOL_ACTIVATED,
              timestamp: timestamp || new Date().toISOString(),
              claimId,
              toolName,
              data: { input },
              metadata: {
                source: 'broadcast',
                channel: 'tool-activations'
              }
            };
            
            await this.publishEvent(event);
          } catch (error) {
            console.error('Error processing tool activation event:', error);
          }
        }
      )
      .on(
        'broadcast',
        { event: 'tool_completed' },
        async (payload) => {
          try {
            const { claimId, toolName, result, input, executionTimeMs, timestamp } = payload;
            
            // Create tool completed event
            const event: VerificationEvent = {
              id: uuidv4(),
              eventType: VerificationEventType.TOOL_COMPLETED,
              timestamp: timestamp || new Date().toISOString(),
              claimId,
              toolName,
              data: { 
                result,
                input,
                executionTimeMs
              },
              metadata: {
                source: 'broadcast',
                channel: 'tool-activations'
              }
            };
            
            await this.publishEvent(event);
          } catch (error) {
            console.error('Error processing tool completion event:', error);
          }
        }
      )
      .subscribe();
  }
  
  /**
   * Process an incoming verification event
   * @param event Event to process
   */
  private async processEvent(event: VerificationEvent): Promise<void> {
    try {
      // Get subscribers for this event type
      const handlers = this.subscribers.get(event.eventType) || [];
      
      // Execute all handlers concurrently
      await Promise.all(
        handlers.map(async (handler) => {
          try {
            await handler(event);
          } catch (error) {
            console.error(`Error in event handler for ${event.eventType}:`, error);
          }
        })
      );
    } catch (error) {
      console.error('Error processing event:', error);
      // Add to retry queue
      this.retryQueue.push(event);
    }
  }
  
  /**
   * Process events in the retry queue
   */
  private async processRetryQueue(): Promise<void> {
    if (this.isProcessing || this.retryQueue.length === 0) {
      // Schedule next check
      setTimeout(() => this.processRetryQueue(), 5000);
      return;
    }
    
    this.isProcessing = true;
    
    try {
      // Get next event from queue
      const event = this.retryQueue.shift();
      
      if (event) {
        console.log(`Retrying event ${event.id} of type ${event.eventType}`);
        
        // Process the event
        await this.processEvent(event);
      }
    } catch (error) {
      console.error('Error processing retry queue:', error);
    } finally {
      this.isProcessing = false;
      
      // Schedule next check
      setTimeout(() => this.processRetryQueue(), 5000);
    }
  }
  
  /**
   * Register default event handlers
   */
  private registerDefaultHandlers(): void {
    // Handle claim creation events
    this.subscribe(VerificationEventType.CLAIM_CREATED, async (event) => {
      try {
        // Initialize audit record
        const auditId = await this.worker.initializeClaimAudit(event.claimId, event.data);
        
        // Store audit ID for this claim
        this.activeAudits.set(event.claimId, auditId);
        
        // Verify INGESTION stage
        await this.worker.verifyStage(auditId, 'INGESTION', {
          stageStatus: 'SUCCESS',
          stageConfidence: 90,
          actualResult: event.data,
          metadata: { source: event.metadata?.source }
        });
        
        console.log(`Initialized audit ${auditId} for claim ${event.claimId}`);
      } catch (error) {
        console.error(`Error handling claim creation for ${event.claimId}:`, error);
      }
    });
    
    // Handle claim update events
    this.subscribe(VerificationEventType.CLAIM_UPDATED, async (event) => {
      try {
        // Get or create audit record
        let auditId = this.activeAudits.get(event.claimId);
        
        if (!auditId) {
          // If no active audit, initialize one
          auditId = await this.worker.initializeClaimAudit(event.claimId, event.data.current);
          this.activeAudits.set(event.claimId, auditId);
        }
        
        // If stage is defined, verify it
        if (event.stage) {
          await this.worker.verifyStage(auditId, event.stage, {
            stageStatus: 'SUCCESS',
            stageConfidence: 85,
            actualResult: event.data.current,
            metadata: { 
              previousState: event.data.previous,
              source: event.metadata?.source
            }
          });
        }
        
        console.log(`Updated audit ${auditId} for claim ${event.claimId}`);
      } catch (error) {
        console.error(`Error handling claim update for ${event.claimId}:`, error);
      }
    });
    
    // Handle tool activation events
    this.subscribe(VerificationEventType.TOOL_ACTIVATED, async (event) => {
      try {
        // Get or create audit record
        let auditId = this.activeAudits.get(event.claimId);
        
        if (!auditId) {
          // If no active audit, initialize one
          auditId = await this.worker.initializeClaimAudit(event.claimId);
          this.activeAudits.set(event.claimId, auditId);
        }
        
        // Record tool activation with TRIGGERED status
        await this.worker.verifyToolActivation(auditId, event.claimId, event.toolName!, {
          activationStatus: 'TRIGGERED',
          resultStatus: 'VALID', // Assume valid at activation time
          inputParameters: event.data.input
        });
        
        console.log(`Recorded activation of tool ${event.toolName} for claim ${event.claimId}`);
      } catch (error) {
        console.error(`Error handling tool activation for ${event.claimId}:`, error);
      }
    });
    
    // Handle tool completion events
    this.subscribe(VerificationEventType.TOOL_COMPLETED, async (event) => {
      try {
        // Get audit record
        const auditId = this.activeAudits.get(event.claimId);
        
        if (!auditId) {
          console.error(`No active audit found for claim ${event.claimId}`);
          return;
        }
        
        // Calculate confidence score based on tool result
        const confidenceScore = this.calculateToolConfidence(
          event.toolName!,
          event.data.result,
          event.data.executionTimeMs
        );
        
        // Record tool completion
        await this.worker.verifyToolActivation(auditId, event.claimId, event.toolName!, {
          activationStatus: 'COMPLETED',
          resultStatus: this.isValidToolResult(event.data.result) ? 'VALID' : 'INVALID',
          confidenceScore,
          inputParameters: event.data.input,
          outputResult: event.data.result,
          executionTimeMs: event.data.executionTimeMs
        });
        
        console.log(`Recorded completion of tool ${event.toolName} for claim ${event.claimId}`);
        
        // If this is the final expected tool, complete the audit
        const isLastTool = await this.isLastExpectedTool(event.claimId, event.toolName!);
        
        if (isLastTool) {
          // Calculate overall confidence
          const overallConfidence = await this.worker.calculateOverallConfidence(event.claimId, auditId);
          
          // Complete the audit
          await this.worker.completeClaimAudit(
            auditId, 
            overallConfidence >= 70 ? 'VERIFIED' : (overallConfidence >= 50 ? 'PARTIAL' : 'FAILED'),
            overallConfidence,
            overallConfidence < 50,
            overallConfidence < 50 ? 'Low confidence score requires review' : undefined
          );
          
          console.log(`Completed audit for claim ${event.claimId} with confidence ${overallConfidence}`);
          
          // Remove from active audits
          this.activeAudits.delete(event.claimId);
        }
      } catch (error) {
        console.error(`Error handling tool completion for ${event.claimId}:`, error);
      }
    });
  }
  
  /**
   * Calculate confidence score for a tool result
   * @param toolName Name of the tool
   * @param result Tool execution result
   * @param executionTimeMs Execution time in milliseconds
   * @returns Confidence score (0-100)
   */
  private calculateToolConfidence(
    toolName: string,
    result: any,
    executionTimeMs?: number
  ): number {
    // Default confidence score
    let confidence = 75;
    
    // Adjust based on tool-specific logic
    switch (toolName) {
      case 'AnomalyDetector':
        // Higher confidence if anomalies were found (tool did its job)
        if (result && Array.isArray(result.anomalies)) {
          confidence = result.anomalies.length > 0 ? 90 : 80;
        }
        break;
        
      case 'ContextBuilder':
        // Evaluate based on context completeness
        if (result && typeof result === 'object') {
          const requiredKeys = ['claim', 'equipment', 'history'];
          const presentKeys = requiredKeys.filter(key => key in result);
          confidence = (presentKeys.length / requiredKeys.length) * 100;
        }
        break;
        
      case 'RecommendationEngine':
        // Higher confidence with more relevant recommendations
        if (result && Array.isArray(result.recommendations)) {
          confidence = Math.min(85 + (result.recommendations.length * 5), 95);
        }
        break;
        
      case 'MemoryTracker':
        // Generally high confidence for memory operations
        confidence = 85;
        break;
        
      default:
        // For unknown tools, use default confidence
        confidence = 75;
    }
    
    // Adjust for execution time if available
    if (executionTimeMs !== undefined) {
      // Penalize very slow executions
      if (executionTimeMs > 5000) {
        confidence -= 10;
      } else if (executionTimeMs > 2000) {
        confidence -= 5;
      } else if (executionTimeMs < 100) {
        // Bonus for very fast executions
        confidence += 5;
      }
    }
    
    // Ensure confidence is within bounds
    return Math.max(0, Math.min(100, confidence));
  }
  
  /**
   * Check if tool result is valid
   * @param result Tool result to validate
   * @returns Whether result is valid
   */
  private isValidToolResult(result: any): boolean {
    // Simple validation - result should be an object and not null or undefined
    return result !== null && result !== undefined && typeof result === 'object';
  }
  
  /**
   * Check if a tool is the last expected tool for a claim
   * @param claimId Claim ID
   * @param toolName Tool name
   * @returns Whether this is the last expected tool
   */
  private async isLastExpectedTool(claimId: string, toolName: string): Promise<boolean> {
    // This is a simplified implementation
    // In a real system, you would check against a workflow definition
    
    // For now, assume RecommendationEngine is always the last tool
    return toolName === 'RecommendationEngine';
  }
}

export default EventStreamProcessor;
