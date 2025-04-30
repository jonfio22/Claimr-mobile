// API endpoint for Agent-to-Agent (A2A) communication
import { NextApiRequest, NextApiResponse } from 'next';
import { agent } from '@/lib/agent';
import { isApiKeyValid } from '@/lib/supabase/auth';
import { A2AAdapter, A2AMessage } from '@/lib/agent/adapters/a2a';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Validate API key
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey || !(await isApiKeyValid(apiKey))) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Parse and validate the A2A message
    const a2aMessage: A2AMessage = req.body;

    if (!a2aMessage || !a2aMessage.intent) {
      return res.status(400).json({
        status: 'error',
        error: 'Missing required fields in A2A message'
      });
    }

    // Convert A2A message to agent request format
    const agentRequest = A2AAdapter.fromA2A(a2aMessage);
    
    // Execute the agent with the converted request
    const agentResponse = await agent.execute(agentRequest);
    
    // Convert the agent response back to A2A format
    const a2aResponse = A2AAdapter.toA2A(agentResponse, a2aMessage.id);

    // Return the A2A response
    return res.status(200).json(a2aResponse);
  } catch (error) {
    console.error('A2A communication error:', error);
    return res.status(500).json({
      id: req.body?.id || `error-${Date.now()}`,
      timestamp: new Date().toISOString(),
      status: 'error',
      result: null,
      metadata: {
        error: error.message || 'Unknown error',
        source: 'claimr-agent'
      }
    });
  }
}
