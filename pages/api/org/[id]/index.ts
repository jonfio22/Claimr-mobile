import { NextApiRequest, NextApiResponse } from 'next';
import { getOrganizationById } from '../../../../lib/org/utils';
import { authMiddleware } from '../../../../lib/agent/authMiddleware';

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  
  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: 'Invalid organization ID' });
  }

  try {
    const organization = await getOrganizationById(id);
    
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }
    
    return res.status(200).json({
      status: 'success',
      data: organization
    });
  } catch (error) {
    console.error('Error fetching organization:', error);
    return res.status(500).json({ 
      status: 'error',
      message: 'Failed to retrieve organization data' 
    });
  }
}

export default authMiddleware(handler);
