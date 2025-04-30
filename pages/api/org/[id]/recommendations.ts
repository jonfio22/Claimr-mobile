import { NextApiRequest, NextApiResponse } from 'next';
import { authMiddleware } from '../../../../lib/agent/authMiddleware';
import { OrgLearningVaultService } from '../../../../lib/org/orgLearningVaultService';
import { MCP7MemoryManager } from '../../../../lib/mcp/memoryManager';
import { Recommendation } from '../../../../lib/org/types';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: 'Invalid organization ID' });
  }

  try {
    const { context } = req.body;
    
    if (!context) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing context in request body'
      });
    }
    
    // Initialize services
    const mcpManager = new MCP7MemoryManager();
    const vaultService = new OrgLearningVaultService(id, mcpManager);
    
    // Get recommendations based on context
    const recommendations: Recommendation[] = await vaultService.getRecommendations(context);
    
    // Log this recommendation request to memory
    await mcpManager.logEvent({
      event_type: 'recommendations_requested',
      entity_type: context.claim_id ? 'claim' : 'organization',
      entity_id: context.claim_id || id,
      metadata: {
        context,
        recommendation_count: recommendations.length,
        timestamp: new Date().toISOString()
      }
    });
    
    return res.status(200).json({
      status: 'success',
      data: {
        recommendations,
        timestamp: new Date().toISOString(),
        context: {
          // Return a simplified version of the context
          claim_id: context.claim_id,
          vendor_id: context.vendor_id,
          equipment_type: context.equipment_type
        }
      }
    });
  } catch (error) {
    console.error('Error getting recommendations:', error);
    return res.status(500).json({ 
      status: 'error',
      message: 'Failed to retrieve recommendations' 
    });
  }
}

export default authMiddleware(handler);
