// Public interface for invoking the agent from the UI or API
import { AgentConfig, AgentRequest, AgentResponse, SystemStatus } from './types';
import { toolchain, validateToolchain } from './toolchain';
import { OrgLearningVaultService } from '../org/orgLearningVaultService';

export class ClaimrAgent {
  private config: AgentConfig;
  
  constructor(config: AgentConfig) {
    this.config = config;
  }
  
  // Main entry point for agent execution
  async execute(request: AgentRequest): Promise<AgentResponse> {
    try {
      // Validate request
      if (!request) {
        throw new Error('Empty request');
      }
      
      // Add session tracking if not present
      if (!request.sessionId) {
        request.sessionId = this.generateSessionId();
      }
      
      // Route the request to the appropriate handler
      const response = await this.config.router.route(request);
      
      // Add additional metadata
      return {
        ...response,
        // timestamp is not included in the AgentResponse type
      };
    } catch (error) {
      console.error('Agent execution error:', error);
      return {
        status: 'error',
        error: error.message,
        result: null
      };
    }
  }
  
  // Generate system status for the introspection endpoint
  async getSystemStatus(): Promise<SystemStatus> {
    const toolchainStatus = validateToolchain();
    
    // Check vault connection
    let vaultStatus = {
      isConnected: false,
      dataPoints: [] as string[]
    };

    try {
      // MCP7MemoryManager is required by OrgLearningVaultService
      const MCP7MemoryManager = (await import('../mcp/memoryManager')).MCP7MemoryManager;
      const mcpManager = new MCP7MemoryManager();
      const vault = new OrgLearningVaultService('00000000-0000-0000-0000-000000000000', mcpManager);
      const status = await vault.getIntrospectData();
      vaultStatus = {
        isConnected: true,
        dataPoints: Object.keys(status)
        // Not including lastUpdate as it's not in the type definition
      };
    } catch (error) {
      console.error('Vault connection error:', error);
    }
    
    // Determine system readiness
    let readiness: 'ready' | 'partial' | 'not_ready' = 'ready';
    
    if (!toolchainStatus.valid || !vaultStatus.isConnected) {
      readiness = 'not_ready';
    } else if (vaultStatus.dataPoints.length === 0) {
      readiness = 'partial';
    }
    
    return {
      readiness,
      connectedTools: Object.keys(toolchain),
      missingTools: toolchainStatus.missing,
      vaultStatus
    };
  }
  
  // List all available tools and their capabilities
  getTools() {
    return Object.values(toolchain).map(tool => ({
      id: tool.id,
      name: tool.name,
      description: tool.description,
      schema: tool.schema
    }));
  }
  
  // Helper to generate unique session IDs
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
}
