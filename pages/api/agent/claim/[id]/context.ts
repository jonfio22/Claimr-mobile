import { NextApiRequest, NextApiResponse } from 'next';
import { ContextBuilder } from '@/lib/mcp';
import { errorHandler } from '@/lib/agent/errorHandler';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id } = req.query;
    
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Valid claim ID is required' });
    }
    
    const context = await ContextBuilder.buildClaimContext(id);
    
    return res.status(200).json({
      claimId: id,
      context,
      _meta: {
        timestamp: new Date().toISOString(),
        source: 'claimr-mcp7'
      }
    });
  } catch (error) {
    return errorHandler(error, res);
  }
}
