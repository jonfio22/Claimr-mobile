/**
 * Claimr Agent System
 * 
 * Includes:
 * 1. Agent API Helper Library - secure, consistent agent-facing APIs
 * 2. Super Agent Orchestration Layer - connects MCP7 tools together
 */

// Export API helper components
export { errorHandler } from './errorHandler';
export { apiKeyService } from './apiKeyService';
export { loggerService } from './loggerService';
export { withApiKeyAuth } from './authMiddleware';

// Import and export Super Agent components
import { ClaimrAgent } from './agent';
import { toolchain } from './toolchain';
import { AgentRouter } from './router';

// Export the initialized agent instance
export const superAgent = new ClaimrAgent({
  toolchain,
  router: new AgentRouter(),
});

// Export individual Super Agent components for modular usage
export * from './agent';
export * from './toolchain';
// Export router explicitly to avoid duplicate exports
export { AgentRouter } from './router';
// Export types except AgentRouter which is already exported
export type { 
  Tool, 
  ToolRegistry, 
  AgentRequest, 
  AgentResponse, 
  RouterConfig, 
  AgentConfig, 
  SystemStatus 
} from './types';

// Export types
export type AgentActivity = {
  agentId: string | null;
  activityType: string;
  details: Record<string, any>;
  timestamp: string;
};

export type ApiUsageLog = {
  apiKey: string;
  endpoint: string;
  agentId?: string | null;
  timestamp: string;
};

/**
 * Example usage:
 * 
 * import { withApiKeyAuth, errorHandler, loggerService } from '@/lib/agent';
 * 
 * const handler = async (req, res) => {
 *   try {
 *     // Your API logic here
 *     
 *     // Log specific agent interactions
 *     await loggerService.logAgentActivity(
 *       req.headers['x-agent-id'] as string,
 *       'recommendation_accepted',
 *       { recommendationId: '123', claimId: '456' }
 *     );
 *     
 *     return res.status(200).json({ success: true });
 *   } catch (error) {
 *     return errorHandler(error, res);
 *   }
 * };
 * 
 * export default withApiKeyAuth(handler);
 */
