import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '@/lib/mcp/utils/supabaseClient';
import { loggerService } from '@/lib/agent/loggerService';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const { 
      claimId, 
      anomalyType, 
      anomalyDetails, 
      severity,
      timestamp = new Date().toISOString()
    } = req.body;
    
    // Validate required fields
    if (!claimId || !anomalyType) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        requiredFields: ['claimId', 'anomalyType'] 
      });
    }
    
    // Store the anomaly event
    const { data, error } = await supabase
      .from('anomaly_events')
      .insert({
        claim_id: claimId,
        anomaly_type: anomalyType,
        details: anomalyDetails,
        severity: severity || 'medium',
        detected_at: timestamp
      });
    
    if (error) {
      throw error;
    }
    
    // Log the anomaly detection
    await loggerService.logAgentActivity(
      req.headers['x-agent-id'] as string || null,
      'ANOMALY_DETECTED',
      { claimId, anomalyType, severity }
    );
    
    return res.status(200).json({ 
      success: true, 
      message: 'Anomaly recorded successfully'
    });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return res.status(500).json({ 
      error: 'Failed to process anomaly webhook',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
