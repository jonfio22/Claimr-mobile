import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export const apiKeyService = {
  /**
   * Validate an API key against the database
   */
  async validateApiKey(apiKey: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('api_keys')
      .select('id, active')
      .eq('key', apiKey)
      .eq('active', true)
      .single();
    
    if (error || !data) {
      return false;
    }
    
    return true;
  },
  
  /**
   * Log API usage with optional agent identification
   */
  async logApiUsage(apiKey: string, endpoint: string, agentId?: string) {
    const { error } = await supabase
      .from('api_usage_logs')
      .insert({
        api_key: apiKey,
        endpoint,
        agent_id: agentId || null,
        timestamp: new Date().toISOString()
      });
    
    if (error) {
      console.error('Failed to log API usage:', error);
    }
  }
};
