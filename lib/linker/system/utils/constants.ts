/**
 * MCPLinker Constants
 * Configuration values and constants used throughout the linker system
 */

// System configuration
export const LINKER_CONFIG = {
  // Table names for Supabase storage
  TABLES: {
    SCHEMAS: 'linker_schemas',
    TOOLS: 'linker_tools',
    COMPONENTS: 'linker_components',
    COMPONENT_LINKS: 'linker_component_links'
  },
  
  // Default values
  DEFAULTS: {
    VERSION: '1.0.0',
    SCHEMA_VERSION: '2023-07',
    STATUS: 'active'
  },
  
  // Validation settings
  VALIDATION: {
    MAX_SCHEMA_SIZE: 1024 * 100, // 100KB max schema size
    MIN_SCHEMA_NAME_LENGTH: 3,
    MAX_SCHEMA_NAME_LENGTH: 64,
  },
  
  // Feature flags
  FEATURES: {
    ENABLE_INTROSPECTION: true,
    ENABLE_AUTO_VALIDATION: true,
    ENABLE_SCHEMA_VERSIONING: true,
    ENABLE_TOOL_DISCOVERY: true
  }
};

// Available component relationship types
export const COMPONENT_RELATIONSHIPS = [
  'depends-on', // Component requires another component
  'extends',    // Component extends functionality of another component
  'uses',       // Component uses another component
  'provides-for' // Component provides services to another component
];

// Schema format templates
export const SCHEMA_TEMPLATES = {
  BASIC: {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'Basic Schema Template',
    type: 'object',
    properties: {},
    required: []
  },
  
  TOOL_INPUT: {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'Tool Input Template',
    type: 'object',
    properties: {
      parameters: {
        type: 'object',
        properties: {},
        required: []
      }
    },
    required: ['parameters']
  },
  
  TOOL_OUTPUT: {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: 'Tool Output Template',
    type: 'object',
    properties: {
      result: {
        type: 'object',
        properties: {},
        required: []
      },
      error: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          message: { type: 'string' }
        },
        required: ['code', 'message']
      }
    },
    oneOf: [
      { required: ['result'] },
      { required: ['error'] }
    ]
  }
};

// Error codes used in the linker system
export const ERROR_CODES = {
  // Registration errors
  REGISTRATION_FAILED: 'ERR_REGISTRATION_FAILED',
  DUPLICATE_ENTITY: 'ERR_DUPLICATE_ENTITY',
  INVALID_SCHEMA: 'ERR_INVALID_SCHEMA',
  
  // Validation errors
  VALIDATION_FAILED: 'ERR_VALIDATION_FAILED',
  SCHEMA_NOT_FOUND: 'ERR_SCHEMA_NOT_FOUND',
  TOOL_NOT_FOUND: 'ERR_TOOL_NOT_FOUND',
  COMPONENT_NOT_FOUND: 'ERR_COMPONENT_NOT_FOUND',
  
  // System errors
  DATABASE_ERROR: 'ERR_DATABASE_ERROR',
  INTROSPECTION_FAILED: 'ERR_INTROSPECTION_FAILED'
};
