/**
 * MCPLinker Core Types
 * These types define the core structures used by the linker subsystem
 */

// Basic registration and identification types
export type ComponentId = string;
export type SchemaId = string;
export type ToolId = string;

// Registration status types
export enum RegistrationStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  DEPRECATED = 'deprecated',
  DISABLED = 'disabled',
}

// Component registration info
export interface ComponentRegistration {
  id: ComponentId;
  name: string;
  version: string;
  description: string;
  schemas: SchemaId[];
  tools: ToolId[];
  status: RegistrationStatus;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// Schema definition for validation
export interface SchemaDefinition {
  id: SchemaId;
  name: string;
  version: string;
  description: string;
  jsonSchema: Record<string, any>;
  examples?: Record<string, any>[];
  status: RegistrationStatus;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// Tool/action registration
export interface ToolRegistration {
  id: ToolId;
  name: string;
  description: string;
  version: string;
  inputSchema?: SchemaId;
  outputSchema?: SchemaId;
  handler: string;
  status: RegistrationStatus;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// Validation result type
export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

// Link between components
export interface ComponentLink {
  sourceComponentId: ComponentId;
  targetComponentId: ComponentId;
  relationship: 'depends-on' | 'extends' | 'uses' | 'provides-for';
  metadata: Record<string, any>;
  createdAt: Date;
}

// Schema repository interface
export interface SchemaRegistry {
  registerSchema(schema: Omit<SchemaDefinition, 'id' | 'createdAt' | 'updatedAt'>): Promise<SchemaDefinition>;
  getSchema(id: SchemaId): Promise<SchemaDefinition | null>;
  listSchemas(filter?: Partial<SchemaDefinition>): Promise<SchemaDefinition[]>;
  updateSchema(id: SchemaId, updates: Partial<SchemaDefinition>): Promise<SchemaDefinition>;
  deprecateSchema(id: SchemaId): Promise<void>;
}

// Tool registry interface
export interface ToolRegistry {
  registerTool(tool: Omit<ToolRegistration, 'id' | 'createdAt' | 'updatedAt'>): Promise<ToolRegistration>;
  getTool(id: ToolId): Promise<ToolRegistration | null>;
  listTools(filter?: Partial<ToolRegistration>): Promise<ToolRegistration[]>;
  updateTool(id: ToolId, updates: Partial<ToolRegistration>): Promise<ToolRegistration>;
  deprecateTool(id: ToolId): Promise<void>;
}

// Component registry interface
export interface ComponentRegistry {
  registerComponent(component: Omit<ComponentRegistration, 'id' | 'createdAt' | 'updatedAt'>): Promise<ComponentRegistration>;
  getComponent(id: ComponentId): Promise<ComponentRegistration | null>;
  listComponents(filter?: Partial<ComponentRegistration>): Promise<ComponentRegistration[]>;
  updateComponent(id: ComponentId, updates: Partial<ComponentRegistration>): Promise<ComponentRegistration>;
  deprecateComponent(id: ComponentId): Promise<void>;
  linkComponents(sourceId: ComponentId, targetId: ComponentId, relationship: ComponentLink['relationship'], metadata?: Record<string, any>): Promise<ComponentLink>;
  getComponentLinks(componentId: ComponentId): Promise<ComponentLink[]>;
}

// Validator interface
export interface Validator {
  validateAgainstSchema(data: any, schemaId: SchemaId): Promise<ValidationResult>;
  validateToolInput(toolId: ToolId, input: any): Promise<ValidationResult>;
  validateToolOutput(toolId: ToolId, output: any): Promise<ValidationResult>;
}
