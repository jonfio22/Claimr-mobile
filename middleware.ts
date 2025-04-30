import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { apiKeyService } from './lib/agent/apiKeyService';

export async function middleware(request: NextRequest) {
  // Only apply to /api/agent routes
  if (!request.nextUrl.pathname.startsWith('/api/agent')) {
    return NextResponse.next();
  }

  // Get API key from header
  const apiKey = request.headers.get('x-api-key');
  const agentId = request.headers.get('x-agent-id');
  
  // If no API key, return 401
  if (!apiKey) {
    return new NextResponse(
      JSON.stringify({ error: 'API key is required', code: 'MISSING_API_KEY' }),
      { 
        status: 401, 
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
  
  // Validate API key
  const isValid = await apiKeyService.validateApiKey(apiKey);
  
  if (!isValid) {
    return new NextResponse(
      JSON.stringify({ error: 'Invalid API key', code: 'INVALID_API_KEY' }),
      { 
        status: 401, 
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
  
  // Log API usage
  await apiKeyService.logApiUsage(
    apiKey, 
    request.nextUrl.pathname,
    agentId || undefined
  );
  
  // Continue with the request
  return NextResponse.next();
}

// Configure the middleware to run only on /api/agent routes
export const config = {
  matcher: '/api/agent/:path*',
};
