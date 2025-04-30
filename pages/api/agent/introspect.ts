// API endpoint for introspection - provides system status and available tools
import { NextApiRequest, NextApiResponse } from 'next';
import { agent } from '@/lib/agent';
import { toolchain, validateToolchain } from '@/lib/agent/toolchain';
import { isApiKeyValid } from '@/lib/supabase/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Validate API key
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey || !(await isApiKeyValid(apiKey))) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    // Only allow GET requests
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Get system status from the agent
    const systemStatus = await agent.getSystemStatus();
    
    // Return detailed introspection data
    return res.status(200).json({
      status: 'success',
      data: {
        systemStatus,
        toolchain: Object.keys(toolchain).map(key => ({
          id: toolchain[key].id,
          name: toolchain[key].name,
          description: toolchain[key].description,
          schemaAvailable: !!toolchain[key].schema,
          requiredContext: toolchain[key].requiredContext || []
        })),
        toolchainValidation: validateToolchain(),
        version: '1.0.0',
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Introspection API error:', error);
    return res.status(500).json({
      status: 'error',
      error: error.message || 'Unknown error'
    });
  }
}
