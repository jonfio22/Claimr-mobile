/**
 * MCP7 Memory Layer - Main Exports
 * 
 * This is the primary entry point for the MCP7 memory layer.
 * Import functionality from here rather than from individual modules.
 */

// Export all types
export * from './types';

// Export config
export { default as config } from './config';

// Export core classes
export { default as MemoryTracker } from './memoryTracker';
export { default as AnomalyDetector } from './anomalyDetector';
export { default as RecommendationEngine } from './recommendationEngine';
export { default as ContextBuilder } from './contextBuilder';
export { default as MCPMemoryProvider } from './memoryProvider';

// Export Supabase client
export { supabase } from './utils/supabaseClient';

/**
 * Quick start usage examples:
 * 
 * // Log an event
 * import { MemoryTracker } from 'lib/mcp';
 * await MemoryTracker.logEvent('claim_created', 'claim', claimId, { details }, { userId, vendorId });
 * 
 * // Check for anomalies
 * import { AnomalyDetector } from 'lib/mcp';
 * const anomalies = await AnomalyDetector.runAllChecks(claimId);
 * 
 * // Get recommendations
 * import { RecommendationEngine } from 'lib/mcp';
 * const recommendations = await RecommendationEngine.getClaimRecommendations(claimId);
 * 
 * // Build context for AI
 * import { ContextBuilder } from 'lib/mcp';
 * const context = await ContextBuilder.buildClaimContext(claimId);
 */
