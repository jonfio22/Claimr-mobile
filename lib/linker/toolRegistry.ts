import { ToolId, ToolRegistration, ToolRegistry } from './types';
import { supabase } from '@/lib/mcp/utils/supabaseClient';
import { v4 as uuidv4 } from 'uuid';

/**
 * Supabase implementation of ToolRegistry
 * Manages the registration and discovery of tools/actions in the system
 */
export class SupabaseToolRegistry implements ToolRegistry {
  private readonly TABLE_NAME = 'linker_tools';

  /**
   * Register a new tool in the system
   */
  async registerTool(tool: Omit<ToolRegistration, 'id' | 'createdAt' | 'updatedAt'>): Promise<ToolRegistration> {
    const id = uuidv4();
    const now = new Date();
    
    const newTool: ToolRegistration = {
      ...tool,
      id,
      createdAt: now,
      updatedAt: now
    };
    
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .insert(this.formatForStorage(newTool))
      .select()
      .single();
      
    if (error) {
      console.error('Error registering tool:', error);
      throw new Error(`Failed to register tool: ${error.message}`);
    }
    
    return this.formatFromStorage(data);
  }
  
  /**
   * Get a tool by its ID
   */
  async getTool(id: ToolId): Promise<ToolRegistration | null> {
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('id', id)
      .single();
      
    if (error) {
      if (error.code === 'PGRST116') { // 'no rows returned' error code
        return null;
      }
      console.error('Error fetching tool:', error);
      throw new Error(`Failed to fetch tool: ${error.message}`);
    }
    
    return data ? this.formatFromStorage(data) : null;
  }
  
  /**
   * List tools with optional filtering
   */
  async listTools(filter?: Partial<ToolRegistration>): Promise<ToolRegistration[]> {
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
      console.error('Error listing tools:', error);
      throw new Error(`Failed to list tools: ${error.message}`);
    }
    
    return data ? data.map(tool => this.formatFromStorage(tool)) : [];
  }
  
  /**
   * Update an existing tool
   */
  async updateTool(id: ToolId, updates: Partial<ToolRegistration>): Promise<ToolRegistration> {
    const { data: existingTool } = await supabase
      .from(this.TABLE_NAME)
      .select('*')
      .eq('id', id)
      .single();
      
    if (!existingTool) {
      throw new Error(`Tool with ID ${id} not found`);
    }
    
    const updatedTool = {
      ...updates,
      id,
      updatedAt: new Date()
    };
    
    const { data, error } = await supabase
      .from(this.TABLE_NAME)
      .update(this.formatForStorage(updatedTool))
      .eq('id', id)
      .select()
      .single();
      
    if (error) {
      console.error('Error updating tool:', error);
      throw new Error(`Failed to update tool: ${error.message}`);
    }
    
    return this.formatFromStorage(data);
  }
  
  /**
   * Deprecate a tool (mark as deprecated but don't delete)
   */
  async deprecateTool(id: ToolId): Promise<void> {
    const { error } = await supabase
      .from(this.TABLE_NAME)
      .update({ 
        status: 'deprecated',
        updatedAt: new Date()
      })
      .eq('id', id);
      
    if (error) {
      console.error('Error deprecating tool:', error);
      throw new Error(`Failed to deprecate tool: ${error.message}`);
    }
  }
  
  /**
   * Format tool data for Supabase storage
   */
  private formatForStorage(tool: Partial<ToolRegistration>): Record<string, any> {
    const formattedTool: Record<string, any> = { ...tool };
    
    // Convert dates to ISO strings for storage
    if (formattedTool.createdAt instanceof Date) {
      formattedTool.createdAt = formattedTool.createdAt.toISOString();
    }
    if (formattedTool.updatedAt instanceof Date) {
      formattedTool.updatedAt = formattedTool.updatedAt.toISOString();
    }
    
    return formattedTool;
  }
  
  /**
   * Format tool data from Supabase storage
   */
  private formatFromStorage(data: Record<string, any>): ToolRegistration {
    return {
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt)
    } as ToolRegistration;
  }
}

/**
 * Create and export a singleton instance of the tool registry
 */
export const toolRegistry = new SupabaseToolRegistry();
