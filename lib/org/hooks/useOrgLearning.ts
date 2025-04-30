import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../mcp/utils/supabaseClient';
import { 
  VaultType, 
  Recommendation,
  ClaimPattern,
  VendorInsight,
  EquipmentTrend 
} from '../types';

interface UseOrgLearningProps {
  orgId: string;
}

interface UseOrgLearningReturn {
  // Vault data
  claimPatterns: ClaimPattern[];
  vendorInsights: VendorInsight[];
  equipmentTrends: EquipmentTrend[];
  
  // Loading states
  loading: boolean;
  error: Error | null;
  
  // Learning metrics
  learningEffectiveness: number;
  
  // Recommendations
  getRecommendations: (context: any) => Promise<Recommendation[]>;
  
  // Feedback
  submitFeedback: (feedbackType: string, feedbackData: any) => Promise<boolean>;
  
  // Refresh functions
  refreshVaultData: (vaultType?: VaultType) => Promise<void>;
  
  // Learning capability check
  hasLearningCapability: (capability: string) => boolean;
}

/**
 * Hook for accessing organization learning vaults
 */
export function useOrgLearning({ orgId }: UseOrgLearningProps): UseOrgLearningReturn {
  const [claimPatterns, setClaimPatterns] = useState<ClaimPattern[]>([]);
  const [vendorInsights, setVendorInsights] = useState<VendorInsight[]>([]);
  const [equipmentTrends, setEquipmentTrends] = useState<EquipmentTrend[]>([]);
  
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  
  const [learningCapabilities, setLearningCapabilities] = useState<string[]>([]);
  const [learningEffectiveness, setLearningEffectiveness] = useState<number>(0);
  
  // Fetch initial data
  useEffect(() => {
    if (orgId) {
      fetchIntrospectData();
      fetchVaultData();
    }
  }, [orgId]);
  
  /**
   * Fetch introspection data about org learning
   */
  const fetchIntrospectData = async () => {
    try {
      const response = await fetch(`/api/org/${orgId}/introspect`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch introspect data');
      }
      
      const { data } = await response.json();
      
      if (data) {
        setLearningCapabilities(data.recommendationCapabilities || []);
        setLearningEffectiveness(data.learningEffectiveness || 0);
      }
    } catch (err) {
      console.error('Error fetching introspect data:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  };
  
  /**
   * Fetch vault data from the API
   */
  const fetchVaultData = async () => {
    setLoading(true);
    
    try {
      // Fetch claim patterns
      const claimPatternsResponse = await fetch(`/api/org/${orgId}/vault/claim_patterns`);
      if (claimPatternsResponse.ok) {
        const { data } = await claimPatternsResponse.json();
        setClaimPatterns(data?.data?.patterns || []);
      }
      
      // Fetch vendor insights
      const vendorInsightsResponse = await fetch(`/api/org/${orgId}/vault/vendor_insights`);
      if (vendorInsightsResponse.ok) {
        const { data } = await vendorInsightsResponse.json();
        setVendorInsights(data?.data?.vendors || []);
      }
      
      // Fetch equipment trends
      const equipmentTrendsResponse = await fetch(`/api/org/${orgId}/vault/equipment_trends`);
      if (equipmentTrendsResponse.ok) {
        const { data } = await equipmentTrendsResponse.json();
        setEquipmentTrends(data?.data?.equipment || []);
      }
      
      setLoading(false);
    } catch (err) {
      console.error('Error fetching vault data:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      setLoading(false);
    }
  };
  
  /**
   * Refresh a specific vault or all vaults
   */
  const refreshVaultData = async (vaultType?: VaultType) => {
    setLoading(true);
    
    try {
      if (vaultType) {
        // Refresh specific vault
        const response = await fetch(`/api/org/${orgId}/vault/${vaultType}`);
        
        if (response.ok) {
          const { data } = await response.json();
          
          // Update the correct state based on vault type
          if (vaultType === 'claim_patterns') {
            setClaimPatterns(data?.data?.patterns || []);
          } else if (vaultType === 'vendor_insights') {
            setVendorInsights(data?.data?.vendors || []);
          } else if (vaultType === 'equipment_trends') {
            setEquipmentTrends(data?.data?.equipment || []);
          }
        }
      } else {
        // Refresh all vaults
        await fetchVaultData();
      }
      
      setLoading(false);
    } catch (err) {
      console.error('Error refreshing vault data:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      setLoading(false);
    }
  };
  
  /**
   * Get recommendations based on context
   */
  const getRecommendations = async (context: any): Promise<Recommendation[]> => {
    try {
      // First check if we have the specific context items in our in-memory cache
      // This would be a simple implementation for client-side filtering
      
      // For more comprehensive recommendations, call the API
      const response = await fetch(`/api/org/${orgId}/recommendations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ context }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch recommendations');
      }
      
      const { data } = await response.json();
      return data.recommendations || [];
    } catch (err) {
      console.error('Error getting recommendations:', err);
      return [];
    }
  };
  
  /**
   * Submit feedback on recommendations or insights
   */
  const submitFeedback = async (feedbackType: string, feedbackData: any): Promise<boolean> => {
    try {
      const response = await fetch(`/api/org/${orgId}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          feedbackType,
          feedbackData,
        }),
      });
      
      return response.ok;
    } catch (err) {
      console.error('Error submitting feedback:', err);
      return false;
    }
  };
  
  /**
   * Check if the organization has a specific learning capability
   */
  const hasLearningCapability = (capability: string): boolean => {
    return learningCapabilities.includes(capability);
  };
  
  return {
    // Vault data
    claimPatterns,
    vendorInsights,
    equipmentTrends,
    
    // Loading states
    loading,
    error,
    
    // Learning metrics
    learningEffectiveness,
    
    // Functions
    getRecommendations,
    submitFeedback,
    refreshVaultData,
    hasLearningCapability,
  };
}
