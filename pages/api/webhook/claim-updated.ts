import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/mcp/utils/supabaseClient';
import { MCPMemoryProvider } from '@/lib/mcp/memoryProvider';
import { loggerService } from '@/lib/agent/loggerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { 
      claimId, 
      updateType, 
      updateDetails, 
      agentId = null,
      timestamp = new Date().toISOString()
    } = req.body;
    
    // Validate required fields
    if (!claimId || !updateType) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        requiredFields: ['claimId', 'updateType'] 
      });
    }
    
    // Record the update in MCP7 memory stream
    await MCPMemoryProvider.logClaimEvent(
      claimId,
      updateType as any,
      updateDetails || {},
      { 
        userId: updateDetails?.userId,
        vendorId: updateDetails?.vendorId,
        equipmentId: updateDetails?.equipmentId
      }
    );
    
    // Log the claim update
    await loggerService.logAgentActivity(
      agentId,
      'CLAIM_UPDATED',
      { claimId, updateType }
    );
    
    return res.status(200).json({ 
      success: true, 
      message: 'Claim update recorded successfully'
    });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return res.status(500).json({ 
      error: 'Failed to process claim update webhook',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
