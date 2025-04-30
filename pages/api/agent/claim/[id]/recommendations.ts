import { NextApiRequest, NextApiResponse } from 'next';
import { RecommendationEngine } from '@/lib/mcp';
import { errorHandler } from '@/lib/agent/errorHandler';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { id } = req.query;
    
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'Valid claim ID is required' });
    }
    
    const recommendations = await RecommendationEngine.getClaimRecommendations(id);
    
    return res.status(200).json({
      claimId: id,
      recommendations,
      _meta: {
        timestamp: new Date().toISOString(),
        recommendationCount: recommendations.length
      }
    });
  } catch (error) {
    return errorHandler(error, res);
  }
}
