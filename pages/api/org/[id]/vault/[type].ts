import { NextApiRequest, NextApiResponse } from 'next';
import { getVaultByType } from '../../../../../lib/org/utils';
import { authMiddleware } from '../../../../../lib/agent/authMiddleware';
import { VaultType } from '../../../../../lib/org/types';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id, type } = req.query;
  
  if (!id || Array.isArray(id) || !type || Array.isArray(type)) {
    return res.status(400).json({ error: 'Invalid parameters' });
  }

  // Validate vault type
  const validTypes: VaultType[] = [
    'claim_patterns',
    'vendor_insights',
    'tech_behaviors',
    'equipment_trends'
  ];
  
  if (!validTypes.includes(type as VaultType)) {
    return res.status(400).json({ error: 'Invalid vault type' });
  }

  try {
    if (req.method === 'GET') {
      const vault = await getVaultByType(id, type as VaultType);
      
      if (!vault) {
        return res.status(404).json({ error: 'Vault not found' });
      }
      
      return res.status(200).json({
        status: 'success',
        data: vault
      });
    } else if (req.method === 'POST') {
      // This would be for updating vault data
      // Would need to implement updateVault logic
      return res.status(501).json({ 
        status: 'error',
        message: 'Update functionality not yet implemented' 
      });
    }
  } catch (error) {
    console.error(`Error handling vault ${type}:`, error);
    return res.status(500).json({ 
      status: 'error',
      message: `Failed to process vault data for ${type}` 
    });
  }
}

export default authMiddleware(handler);
