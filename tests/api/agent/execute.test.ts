import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import executeHandler from '@/pages/api/agent/execute';
import type { NextApiRequest, NextApiResponse } from 'next';

// Mock response and request
function createMockRequestResponse() {
  const req: Partial<NextApiRequest> = {
    method: 'POST',
    headers: {
      'x-api-key': 'test-api-key-12345',
      'content-type': 'application/json'
    },
    body: {
      action: 'analyzeClaim',
      claimId: 'claim-12345',
      orgId: 'org-12345'
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
    executeRequest: vi.fn().mockResolvedValue({
      id: 'result-12345',
      status: 'success',
      result: {
        analysis: 'This claim appears to be valid',
        confidence: 0.92,
        recommendedAction: 'Approve'
      },
      explanation: 'Claim matches criteria for approval',
      nextSteps: ['Send confirmation to customer', 'Process paperwork']
    })
  }
}));

describe('Agent Execute API', () => {
  it('should return 401 if API key is missing', async () => {
    const { req, res } = createMockRequestResponse();
    req.headers = {}; // Remove API key

    await executeHandler(req as NextApiRequest, res as NextApiResponse);
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ 
      status: 'error',
      error: expect.stringContaining('API key') 
    }));
  });
  
  it('should return 405 for non-POST requests', async () => {
    const { req, res } = createMockRequestResponse();
    req.method = 'GET';
    
    await executeHandler(req as NextApiRequest, res as NextApiResponse);
    
    expect(res.status).toHaveBeenCalledWith(405);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ 
      status: 'error',
      error: expect.stringContaining('not allowed') 
    }));
  });
  
  it('should return 400 for missing required fields', async () => {
    const { req, res } = createMockRequestResponse();
    req.body = {}; // Missing required fields
    
    await executeHandler(req as NextApiRequest, res as NextApiResponse);
    
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'error'
    }));
  });
  
  it('should execute agent request for valid data', async () => {
    const { req, res } = createMockRequestResponse();
    
    await executeHandler(req as NextApiRequest, res as NextApiResponse);
    
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      status: 'success',
      data: expect.objectContaining({
        id: 'result-12345',
        status: 'success',
        result: expect.objectContaining({
          analysis: expect.any(String),
          confidence: expect.any(Number)
        })
      })
    }));
  });
});
