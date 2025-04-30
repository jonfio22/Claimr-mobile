import { supabase } from '../mcp/utils/supabaseClient';

/**
 * Get the currently authenticated user
 */
export async function getUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  
  if (error) {
    console.error('Error fetching user:', error);
    return null;
  }
  
  if (!user) return null;
  
  // Get additional user data from users table
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();
    
  if (userError) {
    console.error('Error fetching user data:', userError);
    return user;
  }
  
  return { ...user, ...userData };
}
