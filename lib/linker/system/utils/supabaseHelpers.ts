import { supabase } from '@/lib/mcp/utils/supabaseClient';

/**
 * Utility functions for working with Supabase in the MCPLinker context
 */

/**
 * Initialize required tables in Supabase if they don't exist
 * This is useful for development and testing
 */
export async function ensureLinkerTables(): Promise<void> {
  try {
    // Check if tables exist first to avoid unnecessary operations
    const { data: tablesData, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .in('table_name', ['linker_schemas', 'linker_tools', 'linker_components', 'linker_component_links'])
      .eq('table_schema', 'public');
    
    if (tablesError) {
      console.error('Error checking linker tables:', tablesError);
      throw tablesError;
    }
    
    const existingTables = tablesData?.map(t => t.table_name) || [];
    
    // Create schemas table if it doesn't exist
    if (!existingTables.includes('linker_schemas')) {
      await supabase.rpc('create_linker_schemas_table');
    }
    
    // Create tools table if it doesn't exist
    if (!existingTables.includes('linker_tools')) {
      await supabase.rpc('create_linker_tools_table');
    }
    
    // Create components table if it doesn't exist
    if (!existingTables.includes('linker_components')) {
      await supabase.rpc('create_linker_components_table');
    }
    
    // Create component links table if it doesn't exist
    if (!existingTables.includes('linker_component_links')) {
      await supabase.rpc('create_linker_component_links_table');
    }
    
    console.log('All linker tables are ready');
  } catch (error) {
    console.error('Error ensuring linker tables:', error);
    throw error;
  }
}

/**
 * Format a record for Supabase storage
 * Handles date conversions and JSON stringification
 */
export function formatRecordForStorage<T extends Record<string, any>>(
  record: T, 
  jsonFields: string[] = []
): Record<string, any> {
  const formatted: Record<string, any> = { ...record };
  
  // Convert dates to ISO strings
  Object.keys(formatted).forEach(key => {
    if (formatted[key] instanceof Date) {
      formatted[key] = formatted[key].toISOString();
    }
  });
  
  // Stringify JSON fields
  jsonFields.forEach(field => {
    if (formatted[field] && typeof formatted[field] !== 'string') {
      formatted[field] = JSON.stringify(formatted[field]);
    }
  });
  
  return formatted;
}

/**
 * Parse a record from Supabase storage
 * Handles date parsing and JSON parsing
 */
export function parseRecordFromStorage<T extends Record<string, any>>(
  record: Record<string, any>,
  dateFields: string[] = ['createdAt', 'updatedAt'],
  jsonFields: string[] = []
): T {
  const parsed: Record<string, any> = { ...record };
  
  // Parse date fields
  dateFields.forEach(field => {
    if (parsed[field] && typeof parsed[field] === 'string') {
      parsed[field] = new Date(parsed[field]);
    }
  });
  
  // Parse JSON fields
  jsonFields.forEach(field => {
    if (parsed[field] && typeof parsed[field] === 'string') {
      try {
        parsed[field] = JSON.parse(parsed[field]);
      } catch (error) {
        console.warn(`Failed to parse JSON for field ${field}:`, error);
      }
    }
  });
  
  return parsed as T;
}
