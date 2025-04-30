import { NextApiRequest, NextApiResponse } from 'next';
import { authMiddleware } from '../../../../lib/agent/authMiddleware';
import { OrgLearningVaultService } from '../../../../lib/org/orgLearningVaultService';
import { MCP7MemoryManager } from '../../../../lib/mcp/memoryManager';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: 'Invalid organization ID' });
  }

  try {
    const { feedbackType, feedbackData } = req.body;
    
    if (!feedbackType || !feedbackData) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing feedbackType or feedbackData in request body'
      });
    }
    
    // Validate feedback type
    const validFeedbackTypes = ['recommendation', 'insight', 'prediction'];
    if (!validFeedbackTypes.includes(feedbackType)) {
      return res.status(400).json({
        status: 'error',
        message: `Invalid feedbackType. Must be one of: ${validFeedbackTypes.join(', ')}`
      });
    }
    
    // Initialize services
    const mcpManager = new MCP7MemoryManager();
    const vaultService = new OrgLearningVaultService(id, mcpManager);
    
    // Process feedback
    await vaultService.processFeedback(feedbackType, feedbackData);
    
    // Log feedback event to memory
    await mcpManager.logEvent({
      event_type: 'feedback_received',
      entity_type: 'organization',
      entity_id: id,
      metadata: {
        feedback_type: feedbackType,
        item_id: feedbackData.itemId,
        rating: feedbackData.rating,
        comments: feedbackData.comments || '',
        timestamp: new Date().toISOString()
      }
    });
    
    return res.status(200).json({
      status: 'success',
      message: 'Feedback processed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error processing feedback:', error);
    return res.status(500).json({ 
      status: 'error',
      message: 'Failed to process feedback' 
    });
  }
}

export default authMiddleware(handler);
