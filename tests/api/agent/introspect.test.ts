import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import introspectHandler from '@/pages/api/agent/introspect';
import type { NextApiRequest, NextApiResponse } from 'next';

// Mock response and request
function createMockRequestResponse() {
  const req: Partial<NextApiRequest> = {
    method: 'GET',
    headers: {
      'x-api-key': 'test-api-key-12345'
    }
  };

  const res: Partial<NextApiResponse> = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
    _getStatusCode: vi.fn().mockReturnValue(200),
    _getData: vi.fn().mockReturnValue('{}')
  };

  return { req, res };
}

// Mock modules
vi.mock('@/lib/agent/apiKeyService', () => ({
  isApiKeyValid: vi.fn().mockResolvedValue(true)
}));

vi.mock('@/lib/agent/agent', () => ({
  ClaimrAgent: {
    getSystemStatus: vi.fn().mockResolvedValue({
      status: 'online',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      services: {
        memoryTracker: 'online',
        anomalyDetector: 'online',
        recommendationEngine: 'online',
        contextBuilder: 'online'
      }
    })
  }
}));

describe('Agent Introspection API', () => {
  it('should return 401 if API key is missing', async () => {
    const { req, res } = createMockRequestResponse();
    req.headers = {}; // Remove API key

    await introspectHandler(req as NextApiRequest, res as NextApiResponse);
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ 
      status: 'error',
      error: 'Invalid API key' 
    });
  });
  
  it('should return 405 for non-GET requests', async () => {
    const { req, res } = createMockRequestResponse();
    req.method = 'POST';
    
    await introspectHandler(req as NextApiRequest, res as NextApiResponse);
    
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith({ 
      status: 'error',
      error: 'Method not allowed' 
    });
  });
  
  it('should return system status for valid requests', async () => {
    const { req, res } = createMockRequestResponse();
    
    await introspectHandler(req as NextApiRequest, res as NextApiResponse);
    
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'success',
      data: expect.objectContaining({
        systemStatus: expect.objectContaining({
          status: 'online',
          version: '1.0.0'
        })
      })
    }));
  });
});
