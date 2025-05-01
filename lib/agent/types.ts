// Shared type definitions for the agent system

export interface Tool {
  id: string;
  name: string;
  description: string;
  execute: (params: any) => Promise<any>;
  schema?: Record<string, any>; // JSON Schema for this tool
  requiredContext?: string[]; // Context keys needed by this tool
}

export interface ToolRegistry {
  [key: string]: Tool;
}

export type AgentRequest = {
  action: string;
  entityType?: string; // Type of entity this request is about (claim, equipment, etc.)
  entityId?: string; // ID of the entity this request is about
  orgId?: string; // Organization context
  sessionId?: string; // For tracking conversation/session state
  context?: Record<string, any>; // Additional context
  params?: Record<string, any>; // Parameters for the action
  source?: string; // Source of the request (api, ui, a2a, etc.)
  timestamp?: string; // ISO timestamp of when the request was created
  [key: string]: any; // Additional parameters specific to the action
};

export type AgentResponse = {
  id?: string; // Unique ID for this response
  result: any;
  explanation?: string;
  toolsUsed?: string[];
  nextSteps?: string[];
  error?: string;
  status: 'success' | 'error' | 'partial';
};

export interface RouterConfig {
  defaultRoute?: string;
  fallbackHandler?: (request: AgentRequest) => Promise<AgentResponse>;
}

export interface AgentConfig {
  toolchain: ToolRegistry;
  router: AgentRouter;
}

// For introspection endpoint
export interface SystemStatus {
  readiness: 'ready' | 'partial' | 'not_ready';
  connectedTools: string[];
  missingTools: string[];
  vaultStatus: {
    isConnected: boolean;
    dataPoints: string[];
    lastUpdate?: Date;
  };
}

// This is needed to avoid circular dependency
export class AgentRouter {
  route(request: AgentRequest): Promise<AgentResponse> {
    return Promise.resolve({
      status: 'success',
      result: null
    });
  }
}
