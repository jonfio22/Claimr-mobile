import { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Read OpenAPI schema file from the project
    const schemaPath = path.join(process.cwd(), 'schemas', 'agent-api.yaml');
    const schemaContent = fs.readFileSync(schemaPath, 'utf8');
    
    // Set appropriate content type based on the file extension
    const contentType = schemaPath.endsWith('.yaml') || schemaPath.endsWith('.yml') 
      ? 'application/yaml' 
      : 'application/json';
    
    res.setHeader('Content-Type', contentType);
    return res.status(200).send(schemaContent);
  } catch (error) {
    console.error('Error serving schema:', error);
    return res.status(500).json({ error: 'Failed to retrieve API schema' });
  }
}
