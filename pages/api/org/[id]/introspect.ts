import { NextApiRequest, NextApiResponse } from 'next';
import { authMiddleware } from '../../../../lib/agent/authMiddleware';
import { OrgLearningVaultService } from '../../../../lib/org/orgLearningVaultService';
import { MCP7MemoryManager } from '../../../../lib/mcp/memoryManager';

async function handleIntrospectRequest(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: 'Missing organization ID' });
    return;
  }
  
  const mcpManager = new MCP7MemoryManager();
  const vaultService = new OrgLearningVaultService(id, mcpManager);
  
  try {
    const introspectData = await vaultService.getIntrospectData();
    res.status(200).json({
      status: 'success',
      data: introspectData
    });
  } catch (error) {
    console.error('Error in introspect handler:', error);
    res.status(500).json({ 
      status: 'error',
      message: 'Failed to retrieve introspect data'
    });
  }
}

export default authMiddleware(handleIntrospectRequest);
