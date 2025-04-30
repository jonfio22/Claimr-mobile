import { SchemaDefinition, SchemaId, SchemaRegistry } from '../types';
import { supabase } from '@/lib/mcp/utils/supabaseClient';
import { v4 as uuidv4 } from 'uuid';

/**
 * Supabase implementation of SchemaRegistry
 * Manages schema definitions for validation and discovery
 */
export class SupabaseSchemaRegistry implements SchemaRegistry {
  private readonly TABLE_NAME = 'linker_schemas';

  /**
   * Register a new schema definition
   */
  async registerSchema(schema: Omit<SchemaDefinition, 'id' | 'createdAt' | 'updatedAt'>): Promise<SchemaDefinition> {
    const id = uuidv4();
    const now = new Date();
    
    const newSchema: SchemaDefinition = {
      ...schema,
      id,
      createdAt: now,
      updatedAt: now
    };
    
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .insert(this.formatForStorage(newSchema))
      .select()
      .single();
      
    if (error) {
      console.error('Error registering schema:', error);
      throw new Error(`Failed to register schema: ${error.message}`);
    }
    
    return this.formatFromStorage(data);
  }
  
  /**
   * Get a schema by its ID
   */
  async getSchema(id: SchemaId): Promise<SchemaDefinition | null> {
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('id', id)
      .single();
      
    if (error) {
      if (error.code === 'PGRST116') { // 'no rows returned' error code
        return null;
      }
      console.error('Error fetching schema:', error);
      throw new Error(`Failed to fetch schema: ${error.message}`);
    }
    
    return data ? this.formatFromStorage(data) : null;
  }
  
  /**
   * List schemas with optional filtering
   */
  async listSchemas(filter?: Partial<SchemaDefinition>): Promise<SchemaDefinition[]> {
    let query = supabase
      .from(this.TABLE_NAME)
      .select('*');
      
    // Apply filters if provided
    if (filter) {
      if (filter.status) {
        query = query.eq('status', filter.status);
      }
      if (filter.name) {
        query = query.ilike('name', `%${filter.name}%`);
      }
      if (filter.version) {
        query = query.eq('version', filter.version);
      }
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Error listing schemas:', error);
      throw new Error(`Failed to list schemas: ${error.message}`);
    }
    
    return data ? data.map(schema => this.formatFromStorage(schema)) : [];
  }
  
  /**
   * Update an existing schema
   */
  async updateSchema(id: SchemaId, updates: Partial<SchemaDefinition>): Promise<SchemaDefinition> {
    const { data: existingSchema } = await supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('id', id)
      .single();
      
    if (!existingSchema) {
      throw new Error(`Schema with ID ${id} not found`);
    }
    
    const updatedSchema = {
      ...updates,
      id,
      updatedAt: new Date()
    };
    
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .update(this.formatForStorage(updatedSchema))
      .eq('id', id)
      .select()
      .single();
      
    if (error) {
      console.error('Error updating schema:', error);
      throw new Error(`Failed to update schema: ${error.message}`);
    }
    
    return this.formatFromStorage(data);
  }
  
  /**
   * Deprecate a schema (mark as deprecated but don't delete)
   */
  async deprecateSchema(id: SchemaId): Promise<void> {
    const { error } = await supabase
      .from(this.TABLE_NAME)
      .update({ 
        status: 'deprecated',
        updatedAt: new Date()
      })
      .eq('id', id);
      
    if (error) {
      console.error('Error deprecating schema:', error);
      throw new Error(`Failed to deprecate schema: ${error.message}`);
    }
  }
  
  /**
   * Format schema data for Supabase storage
   */
  private formatForStorage(schema: Partial<SchemaDefinition>): Record<string, any> {
    const formattedSchema: Record<string, any> = { ...schema };
    
    // Convert dates to ISO strings for storage
    if (formattedSchema.createdAt instanceof Date) {
      formattedSchema.createdAt = formattedSchema.createdAt.toISOString();
    }
    if (formattedSchema.updatedAt instanceof Date) {
      formattedSchema.updatedAt = formattedSchema.updatedAt.toISOString();
    }
    
    // Stringify JSON fields
    if (formattedSchema.jsonSchema) {
      formattedSchema.jsonSchema = JSON.stringify(formattedSchema.jsonSchema);
    }
    if (formattedSchema.examples) {
      formattedSchema.examples = JSON.stringify(formattedSchema.examples);
    }
    
    return formattedSchema;
  }
  
  /**
   * Format schema data from Supabase storage
   */
  private formatFromStorage(data: Record<string, any>): SchemaDefinition {
    const schema = { ...data };
    
    // Parse dates
    schema.createdAt = new Date(data.createdAt);
    schema.updatedAt = new Date(data.updatedAt);
    
    // Parse JSON fields
    if (typeof schema.jsonSchema === 'string') {
      schema.jsonSchema = JSON.parse(schema.jsonSchema);
    }
    if (typeof schema.examples === 'string') {
      schema.examples = JSON.parse(schema.examples);
    }
    
    return schema as SchemaDefinition;
  }
}

/**
 * Create and export a singleton instance of the schema registry
 */
export const schemaRegistry = new SupabaseSchemaRegistry();
