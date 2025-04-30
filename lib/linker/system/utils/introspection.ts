import { ComponentRegistration, ToolRegistration, SchemaDefinition } from '../../types';
import { supabase } from '@/lib/mcp/utils/supabaseClient';

/**
 * MCPLinker Introspection Utilities
 * Provides methods to inspect and analyze the system components
 */

/**
 * Get a relationship graph of components
 * Returns a network of component relationships for visualization or analysis
 */
export async function getComponentGraph() {
  try {
    // Get all components
    const { data: components, error: componentsError } = await supabase
      .from('linker_components')
      .select('*');
      
    if (componentsError) throw componentsError;
    
    // Get all component links
    const { data: links, error: linksError } = await supabase
      .from('linker_component_links')
      .select('*');
      
    if (linksError) throw linksError;
    
    // Format for graph visualization
    return {
      nodes: components.map((component: any) => ({
        id: component.id,
        label: component.name,
        type: 'component',
        status: component.status,
        metadata: component.metadata
      })),
      edges: links.map((link: any) => ({
        source: link.sourceComponentId,
        target: link.targetComponentId,
        label: link.relationship,
        metadata: link.metadata
      }))
    };
  } catch (error) {
    console.error('Error getting component graph:', error);
    throw error;
  }
}

/**
 * Generate a system report with statistics about registered components
 */
export async function generateSystemReport() {
  try {
    // Get counts of different entities
    const [
      { count: componentsCount },
      { count: schemasCount },
      { count: toolsCount },
      { count: linksCount }
    ] = await Promise.all([
      supabase.from('linker_components').select('*', { count: 'exact', head: true }),
      supabase.from('linker_schemas').select('*', { count: 'exact', head: true }),
      supabase.from('linker_tools').select('*', { count: 'exact', head: true }),
      supabase.from('linker_component_links').select('*', { count: 'exact', head: true })
    ]);
    
    // Get status breakdowns
    const { data: componentStatusData } = await supabase
      .from('linker_components')
      .select('status, count')
      .group('status');
      
    const { data: schemaStatusData } = await supabase
      .from('linker_schemas')
      .select('status, count')
      .group('status');
      
    const { data: toolStatusData } = await supabase
      .from('linker_tools')
      .select('status, count')
      .group('status');
    
    // Format component status counts
    const componentStatusCounts = componentStatusData?.reduce((acc, curr) => {
      acc[curr.status] = curr.count;
      return acc;
    }, {} as Record<string, number>) || {};
    
    // Format schema status counts
    const schemaStatusCounts = schemaStatusData?.reduce((acc, curr) => {
      acc[curr.status] = curr.count;
      return acc;
    }, {} as Record<string, number>) || {};
    
    // Format tool status counts
    const toolStatusCounts = toolStatusData?.reduce((acc, curr) => {
      acc[curr.status] = curr.count;
      return acc;
    }, {} as Record<string, number>) || {};
    
    return {
      timestamp: new Date().toISOString(),
      counts: {
        components: componentsCount,
        schemas: schemasCount,
        tools: toolsCount,
        links: linksCount
      },
      statusBreakdown: {
        components: componentStatusCounts,
        schemas: schemaStatusCounts,
        tools: toolStatusCounts
      }
    };
  } catch (error) {
    console.error('Error generating system report:', error);
    throw error;
  }
}

/**
 * Find orphaned entities that aren't connected to any component
 */
export async function findOrphanedEntities() {
  try {
    // Get all component IDs
    const { data: components } = await supabase
      .from('linker_components')
      .select('id');
      
    const componentIds = components?.map(c => c.id) || [];
    
    // Find schemas not linked to any component
    const { data: allSchemas } = await supabase
      .from('linker_schemas')
      .select('*');
      
    // Find tools not linked to any component
    const { data: allTools } = await supabase
      .from('linker_tools')
      .select('*');
    
    // Get schemas and tools linked to components
    const { data: componentDetails } = await supabase
      .from('linker_components')
      .select('schemas, tools');
    
    // Extract all linked schema and tool IDs
    const linkedSchemaIds = new Set<string>();
    const linkedToolIds = new Set<string>();
    
    componentDetails?.forEach(component => {
      (component.schemas || []).forEach((id: string) => linkedSchemaIds.add(id));
      (component.tools || []).forEach((id: string) => linkedToolIds.add(id));
    });
    
    // Find orphaned schemas and tools
    const orphanedSchemas = allSchemas?.filter(schema => !linkedSchemaIds.has(schema.id)) || [];
    const orphanedTools = allTools?.filter(tool => !linkedToolIds.has(tool.id)) || [];
    
    return {
      orphanedSchemas,
      orphanedTools
    };
  } catch (error) {
    console.error('Error finding orphaned entities:', error);
    throw error;
  }
}
