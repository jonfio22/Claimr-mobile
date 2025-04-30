import { supabase } from '../mcp/utils/supabaseClient';
import { 
  Organization,
  OrganizationVault,
  VaultType,
  VaultLogEntry,
  VaultEventType,
  Recommendation
} from './types';

export async function getOrganizationById(orgId: string): Promise<Organization | null> {
  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', orgId)
    .single();
  
  if (error) {
    console.error('Error fetching organization:', error);
    return null;
  }
  
  return data;
}

export async function getVaultByType(orgId: string, vaultType: VaultType): Promise<OrganizationVault | null> {
  const { data, error } = await supabase
    .from('org_vaults')
    .select('*')
    .eq('org_id', orgId)
    .eq('vault_type', vaultType)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      // No vault found, create a new one
      return createVault(orgId, vaultType);
    }
    console.error(`Error fetching vault ${vaultType}:`, error);
    return null;
  }
  
  return data;
}

export async function createVault(orgId: string, vaultType: VaultType): Promise<OrganizationVault | null> {
  const { data, error } = await supabase
    .from('org_vaults')
    .insert({
      org_id: orgId,
      vault_type: vaultType,
      data: {},
      version: 1
    })
    .select()
    .single();
  
  if (error) {
    console.error(`Error creating vault ${vaultType}:`, error);
    return null;
  }
  
  return data;
}

export async function updateVault(
  orgId: string, 
  vaultType: VaultType, 
  data: Record<string, any>,
  userId?: string
): Promise<boolean> {
  // Get current vault
  const vault = await getVaultByType(orgId, vaultType);
  
  if (!vault) return false;
  
  // Update vault data with new data
  const { error } = await supabase
    .from('org_vaults')
    .update({
      data: { ...vault.data, ...data },
      version: vault.version + 1
    })
    .eq('id', vault.id);
  
  if (error) {
    console.error(`Error updating vault ${vaultType}:`, error);
    return false;
  }
  
  // Log update event
  await logVaultEvent(orgId, vault.id, 'update', {
    updated_fields: Object.keys(data),
    previous_version: vault.version
  }, userId);
  
  return true;
}

export async function logVaultEvent(
  orgId: string,
  vaultId: string,
  eventType: VaultEventType,
  data: Record<string, any>,
  userId?: string,
  metrics: Record<string, any> = {}
): Promise<VaultLogEntry | null> {
  const { data: logEntry, error } = await supabase
    .from('org_vault_logs')
    .insert({
      org_id: orgId,
      vault_id: vaultId,
      event_type: eventType,
      data,
      created_by: userId,
      metrics
    })
    .select()
    .single();
  
  if (error) {
    console.error(`Error logging vault event ${eventType}:`, error);
    return null;
  }
  
  return logEntry;
}

export async function getOrganizationUsers(orgId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('org_id', orgId);
  
  if (error) {
    console.error('Error fetching organization users:', error);
    return [];
  }
  
  return data || [];
}

export async function getOrganizationClaims(orgId: string, limit = 50): Promise<any[]> {
  const { data, error } = await supabase
    .from('claims')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (error) {
    console.error('Error fetching organization claims:', error);
    return [];
  }
  
  return data || [];
}

export async function getOrganizationVendors(orgId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('vendors')
    .select('*')
    .eq('org_id', orgId);
  
  if (error) {
    console.error('Error fetching organization vendors:', error);
    return [];
  }
  
  return data || [];
}

export async function getOrganizationEquipment(orgId: string): Promise<any[]> {
  const { data, error } = await supabase
    .from('equipment')
    .select('*')
    .eq('org_id', orgId);
  
  if (error) {
    console.error('Error fetching organization equipment:', error);
    return [];
  }
  
  return data || [];
}

// Calculate similarity between two objects for recommendation purposes
export function calculateSimilarity(objectA: any, objectB: any, fields: string[]): number {
  let similarityScore = 0;
  let totalWeight = 0;
  
  for (const field of fields) {
    const weight = field.includes('id') ? 5 : 1; // IDs are more important for matching
    totalWeight += weight;
    
    if (objectA[field] && objectB[field]) {
      if (objectA[field] === objectB[field]) {
        similarityScore += weight;
      } else if (typeof objectA[field] === 'string' && typeof objectB[field] === 'string') {
        // Calculate string similarity
        const stringSimilarity = calculateStringSimilarity(objectA[field], objectB[field]);
        similarityScore += stringSimilarity * weight;
      }
    }
  }
  
  return totalWeight > 0 ? similarityScore / totalWeight : 0;
}

// Helper function to calculate string similarity (0-1)
function calculateStringSimilarity(stringA: string, stringB: string): number {
  // Simple implementation - could be improved with more sophisticated algorithms
  const maxLength = Math.max(stringA.length, stringB.length);
  if (maxLength === 0) return 1;
  
  let matches = 0;
  const minLength = Math.min(stringA.length, stringB.length);
  
  for (let i = 0; i < minLength; i++) {
    if (stringA[i].toLowerCase() === stringB[i].toLowerCase()) {
      matches++;
    }
  }
  
  return matches / maxLength;
}

// Format recommendations with confidence scores
export function formatRecommendation(
  type: Recommendation['type'],
  title: string,
  description: string,
  confidence: number,
  reasoning: string,
  suggestedActions: string[],
  metadata: Record<string, any> = {}
): Recommendation {
  return {
    type,
    title,
    description,
    confidence: Math.min(Math.max(confidence, 0), 1), // Ensure 0-1 range
    reasoning,
    suggestedActions,
    metadata
  };
}
