import { NextApiRequest, NextApiResponse } from 'next';
import { apiKeyService } from './apiKeyService';
import { loggerService } from './loggerService';

type NextApiHandler = (req: NextApiRequest, res: NextApiResponse) => Promise<void> | void;

/**
 * Middleware to protect API routes with API key authentication
 */
export const withApiKeyAuth = (handler: NextApiHandler): NextApiHandler => {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    try {
      // Extract API key from header
      const apiKey = req.headers['x-api-key'] as string;
      
      // Check if API key is provided
      if (!apiKey) {
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Missing API key',
          code: 'MISSING_API_KEY'
        });
      }
      
      // Validate API key
      const isValid = await apiKeyService.validateApiKey(apiKey);
      
      if (!isValid) {
        await loggerService.logAgentActivity(
          null,
          'auth_failed',
          { 
            apiKey: `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`,
            endpoint: req.url
          }
        );
        
        return res.status(401).json({
          error: 'Unauthorized',
          message: 'Invalid API key',
          code: 'INVALID_API_KEY'
        });
      }
      
      // Optional: extract agent ID if provided
      const agentId = req.headers['x-agent-id'] as string;
      
      // Log API usage
      await apiKeyService.logApiUsage(apiKey, req.url || 'unknown', agentId);
      
      // Call the original handler
      return handler(req, res);
    } catch (error) {
      console.error('Auth middleware error:', error);
      return res.status(500).json({
        error: 'Internal server error',
        message: 'Authentication service unavailable',
        code: 'AUTH_SERVICE_ERROR'
      });
    }
  };
};

/**
 * Usage example:
 * 
 * // In your API route file:
 * import { withApiKeyAuth } from '@/lib/agent/authMiddleware';
 * 
 * const handler = async (req, res) => {
 *   // Your protected API logic here
 * };
 * 
 * export default withApiKeyAuth(handler);
 */
