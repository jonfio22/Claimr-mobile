/**
 * A2AAdapter - Adapter for A2A (Agent-to-Agent) communication protocol
 * 
 * This adapter converts messages from the A2A protocol to the Claimr Agent format
 * and enables interoperability with other agent systems.
 */
import { AgentRequest, AgentResponse } from '../types';

export interface A2AMessage {
  id?: string;
  timestamp?: string;
  intent?: string;
  content?: any;
  metadata?: Record<string, any>;
  sessionContext?: Record<string, any>;
}

export interface A2AResponse {
  id: string;
  timestamp: string;
  status: 'success' | 'error' | 'partial';
  result: any;
  explanation?: string;
  nextSteps?: string[];
  metadata?: Record<string, any>;
}

/**
 * A2A (Agent-to-Agent) Protocol Adapter
 * Converts between A2A messaging format and Claimr agent format
 */
export class A2AAdapter {
  /**
   * Convert A2A message format to Claimr agent request
   */
  static fromA2A(a2aMessage: A2AMessage): AgentRequest {
    return {
      action: a2aMessage.intent || 'analyzeClaim',
      sessionId: a2aMessage.id,
      context: a2aMessage.sessionContext || {},
      // Extract additional parameters based on intent
      ...(a2aMessage.content || {}),
      // Keep metadata for context
      metadata: a2aMessage.metadata || {}
    };
  }
  
  /**
   * Convert Claimr agent response to A2A message format
   */
  static toA2A(agentResponse: AgentResponse, requestId?: string): A2AResponse {
    return {
      id: requestId || `claimr-${Date.now()}`,
      timestamp: new Date().toISOString(),
      status: agentResponse.status,
      result: agentResponse.result,
      explanation: agentResponse.explanation,
      nextSteps: agentResponse.nextSteps,
      metadata: {
        toolsUsed: agentResponse.toolsUsed || [],
        source: 'claimr-agent',
        version: '1.0'
      }
    };
  }
}
