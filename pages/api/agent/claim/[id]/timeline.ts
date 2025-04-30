import { NextApiRequest, NextApiResponse } from 'next';
import { MCPMemoryProvider } from '@/lib/mcp';
import { errorHandler } from '@/lib/agent/errorHandler';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id } = req.query;
    
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Valid claim ID is required' });
    }
    
    const timelineEvents = await MCPMemoryProvider.getClaimMemoryStream(id);
    
    return res.status(200).json({
      claimId: id,
      events: timelineEvents,
      _meta: {
        timestamp: new Date().toISOString(),
        eventCount: timelineEvents.length
      }
    });
  } catch (error) {
    return errorHandler(error, res);
  }
}
