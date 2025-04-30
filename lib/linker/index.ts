/**
 * MCPLinker - Main Export File
 * 
 * This module provides a registry and validation system for connecting
 * components, schemas, and tools in the Claimr application.
 */

// Export types
export * from './types';

// Export registries
export { toolRegistry } from './toolRegistry';
export { schemaRegistry } from './system/schemaRegistry';
export { linkerValidator } from './system/linkerValidator';

// Export utility functions
export { 
  ensureLinkerTables, 
  formatRecordForStorage, 
  parseRecordFromStorage 
} from './system/utils/supabaseHelpers';

export { 
  getComponentGraph, 
  generateSystemReport, 
  findOrphanedEntities 
} from './system/utils/introspection';

// Export constants
export { 
  LINKER_CONFIG, 
  COMPONENT_RELATIONSHIPS, 
  SCHEMA_TEMPLATES, 
  ERROR_CODES 
} from './system/utils/constants';

/**
 * MCPLinker System
 * 
 * The MCPLinker provides a way to register, validate, and connect different
 * parts of the Claimr system, including:
 * 
 * - Schemas: Data structure definitions for validation
 * - Tools: Operations that can be performed on data 
 * - Components: Logical groupings of related functionality
 * 
 * This system is used to ensure consistency, discover capabilities,
 * and enable AI-driven components to understand the system.
 * 
 * Example usage:
 * 
 * // Register a schema
 * const schema = await schemaRegistry.registerSchema({
 *   name: 'UserProfile', 
 *   version: '1.0.0',
 *   description: 'Schema for user profile data',
 *   jsonSchema: { // JSON Schema object
 *     type: 'object',
 *     properties: {
 *       name: { type: 'string' },
 *       email: { type: 'string', format: 'email' }
 *     },
 *     required: ['name', 'email']
 *   },
 *   status: 'active',
 *   metadata: {}
 * });
 * 
 * // Register a tool
 * const tool = await toolRegistry.registerTool({
 *   name: 'findUser',
 *   description: 'Find a user by email',
 *   version: '1.0.0',
 *   inputSchema: schema.id, // Reference to the schema
 *   handler: 'api.user.findUser',
 *   status: 'active',
 *   metadata: {}
 * });
 * 
 * // Validate data against a schema
 * const result = await linkerValidator.validateAgainstSchema(
 *   { name: 'John Doe', email: 'john@example.com' },
 *   schema.id
 * );
 */
