// API endpoint for executing the Claimr Super Agent
import { NextApiRequest, NextApiResponse } from 'next';
import { agent } from '@/lib/agent';
import { isApiKeyValid } from '@/lib/supabase/auth';
import { AgentRequest } from '@/lib/agent/types';

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

    // Parse and validate the request body
    const agentRequest: AgentRequest = req.body;

    if (!agentRequest || !agentRequest.action) {
      return res.status(400).json({
        status: 'error',
        error: 'Missing required fields in request body'
      });
    }

    // Execute the agent with the provided request
    const result = await agent.execute(agentRequest);

    // Return the agent's response
    return res.status(200).json({
      status: 'success',
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Agent execution API error:', error);
    return res.status(500).json({
      status: 'error',
      error: error.message || 'Unknown error'
    });
  }
}
