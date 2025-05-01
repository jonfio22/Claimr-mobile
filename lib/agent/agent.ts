// Public interface for invoking the agent from the UI or API
import { AgentConfig, AgentRequest, AgentResponse, SystemStatus } from './types';
import { toolchain, validateToolchain } from './toolchain';
import { OrgLearningVaultService } from '../org/orgLearningVaultService';

interface ExecuteRequestParams {
  action: string;
  claimId: string;
  entityType?: string;
  entityId?: string;
  orgId?: string;
  params?: Record<string, any>;
  source?: string;
  timestamp?: string;
}

interface A2AMessageParams {
  intent: string;
  content: any;
  sessionContext?: Record<string, any>;
  metadata?: Record<string, any>;
}

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
  
  // New method to handle agent requests from API endpoints
  static async executeRequest(params: ExecuteRequestParams): Promise<AgentResponse> {
    try {
      console.log(`Executing agent action: ${params.action} for claim ${params.claimId}`);
      
      // Create a standardized request object
      const request: AgentRequest = {
        sessionId: `session-${Date.now()}`,
        action: params.action,
        entityId: params.claimId,
        entityType: 'claim',
        orgId: params.orgId || 'default-org',
        params: params.params || {},
        source: 'api',
        timestamp: new Date().toISOString()
      };
      
      // Process the request based on action type
      let result: any;
      
      switch (params.action) {
        case 'analyzeClaim':
          result = await this.performClaimAnalysis(params.claimId, params.params);
          break;
          
        case 'analyzeAttachment':
          result = await this.analyzeAttachment(params.claimId, params.params);
          break;
          
        case 'generateRecommendations':
          result = await this.generateRecommendations(params.claimId, params.params);
          break;
          
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
      
      return {
        id: `result-${Date.now()}`,
        status: 'success',
        result,
        explanation: `Successfully executed ${params.action} for claim ${params.claimId}`,
        nextSteps: this.generateNextSteps(params.action, result)
      };
    } catch (error) {
      console.error('Agent execution error:', error);
      return {
        id: `error-${Date.now()}`,
        status: 'error',
        error: error.message,
        result: null
      };
    }
  }
  
  // Process agent-to-agent messages
  static async processA2AMessage(params: A2AMessageParams): Promise<AgentResponse> {
    try {
      console.log(`Processing A2A message with intent: ${params.intent}`);
      
      // Create a standardized request object for A2A communication
      const request: AgentRequest = {
        sessionId: `a2a-${Date.now()}`,
        action: params.intent,
        entityType: params.content.entityType || 'unknown',
        entityId: params.content.entityId || '',
        params: params.content,
        context: params.sessionContext || {},
        source: 'a2a',
        timestamp: new Date().toISOString()
      };
      
      // Process the intent
      let result: any;
      
      switch (params.intent) {
        case 'analyzeClaim':
          result = await this.performClaimAnalysis(params.content.claimId, params.content);
          break;
          
        case 'getRecommendations':
          result = await this.generateRecommendations(params.content.claimId, params.content);
          break;
          
        case 'detectAnomalies':
          result = await this.detectAnomalies(params.content.claimId, params.content);
          break;
          
        case 'queryVault':
          result = await this.queryVault(params.content.query, params.content);
          break;
          
        default:
          throw new Error(`Unknown intent: ${params.intent}`);
      }
      
      return {
        id: `a2a-result-${Date.now()}`,
        status: 'success',
        result,
        explanation: `Successfully processed ${params.intent}`,
        nextSteps: this.generateNextSteps(params.intent, result)
      };
    } catch (error) {
      console.error('A2A processing error:', error);
      return {
        id: `a2a-error-${Date.now()}`,
        status: 'error',
        error: error.message,
        result: null
      };
    }
  }
  
  // Helper method to generate analysis for claims
  private static async performClaimAnalysis(claimId: string, params?: any): Promise<any> {
    // In a real implementation, this would use AI/ML models to analyze the claim
    // For now, we'll simulate some analysis results
    console.log(`Performing analysis for claim ${claimId}`);
    
    // Sample analysis result
    return {
      summary: "This claim appears to involve image irregularities in a Sony projector's display. Based on the documentation provided and historical data, this is likely an LCD panel issue.",
      diagnosis: "Likely LCD panel defect based on the described symptoms and image analysis.",
      suggestedActions: [
        "Request additional photos focusing on the affected area",
        "Check system logs for overheating incidents",
        "Verify input source quality"
      ],
      confidence: 0.92,
      similarClaims: [
        "CLM-38219",
        "CLM-42088"
      ],
      analysisTimestamp: new Date().toISOString()
    };
  }
  
  // Helper method to analyze attachments
  private static async analyzeAttachment(claimId: string, params?: any): Promise<any> {
    const { attachmentId, fileUrl, fileType } = params || {};
    
    // In a real implementation, this would use computer vision/AI to analyze images or docs
    console.log(`Analyzing attachment ${attachmentId} for claim ${claimId}`);
    
    // Sample attachment analysis
    return {
      detectedObjects: ["projector", "display screen", "discoloration"],
      textContent: fileType === 'application/pdf' ? "Sample extracted text from PDF" : null,
      relevance: 0.89,
      recommendation: "This image clearly shows the issue described in the claim."
    };
  }
  
  // Helper method to generate recommendations
  private static async generateRecommendations(claimId: string, params?: any): Promise<any> {
    console.log(`Generating recommendations for claim ${claimId}`);
    
    // Sample recommendations
    return {
      recommendations: [
        {
          type: "documentation",
          description: "Request system log export file",
          priority: "high",
          reasoning: "System logs may reveal overheating or other systemic issues"
        },
        {
          type: "escalation",
          description: "Escalate to Sony professional support tier 2",
          priority: "medium",
          reasoning: "Issue matches known pattern requiring specialized attention"
        }
      ],
      alternativeParts: [
        "Sony LCD Panel A-5522-18",
        "Sony Display Module S-76612"
      ]
    };
  }
  
  // Helper method to detect anomalies
  private static async detectAnomalies(claimId: string, params?: any): Promise<any> {
    console.log(`Detecting anomalies for claim ${claimId}`);
    
    // Sample anomalies
    return {
      anomalies: [
        {
          type: "pattern_deviation",
          description: "Unusual number of similar issues from same customer site",
          severity: 3,
          confidence: 0.78
        }
      ],
      suggestedActions: [
        "Review site environment conditions",
        "Check for proper ventilation"
      ]
    };
  }
  
  // Helper method to query the org learning vault
  private static async queryVault(query: string, params?: any): Promise<any> {
    console.log(`Querying vault with: ${query}`);
    
    // Sample vault response
    return {
      results: [
        {
          title: "Sony Projector LCD Panel Replacement Guide",
          relevance: 0.95,
          snippet: "For discoloration in the upper quadrant, follow procedure 3.2..."
        },
        {
          title: "Case Study: Conference Room Projector Fleet Maintenance",
          relevance: 0.82,
          snippet: "Regular cleaning of air filters reduced LCD panel failures by 72%..."
        }
      ],
      suggestedSearches: [
        "Sony VPL-FHZ75 panel replacement time",
        "projector overheating discoloration"
      ]
    };
  }
  
  // Helper to generate appropriate next steps based on action and result
  private static generateNextSteps(action: string, result: any): string[] {
    // Default next steps
    const defaultSteps = [
      "Review analysis results",
      "Update claim status"
    ];
    
    // Add action-specific steps
    switch (action) {
      case 'analyzeClaim':
        return [
          ...defaultSteps,
          "Request additional information if needed",
          "Schedule follow-up with customer"
        ];
      
      case 'analyzeAttachment':
        return [
          ...defaultSteps,
          "Review detected objects in attachment"
        ];
        
      case 'generateRecommendations':
        return [
          ...defaultSteps,
          "Implement recommended actions"
        ];
        
      case 'detectAnomalies':
        return [
          ...defaultSteps,
          "Investigate detected anomalies",
          "Adjust claim handling process if needed"
        ];
        
      default:
        return defaultSteps;
    }
  }
  
  // Generate system status for the introspection endpoint
  static async getSystemStatus(): Promise<SystemStatus> {
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
