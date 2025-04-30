// Intelligent routing layer that maps actions to the appropriate tools
import { 
  AgentRequest, 
  AgentResponse, 
  RouterConfig 
} from './types';
import { toolchain, initializeToolchain } from './toolchain';

export class AgentRouter {
  private config: RouterConfig;
  
  constructor(config: RouterConfig = {}) {
    this.config = {
      defaultRoute: 'contextBuilder',
      ...config
    };
  }
  
  // Route the request to the appropriate handler based on action
  async route(request: AgentRequest): Promise<AgentResponse> {
    try {
      // Validate the request
      if (!request.action) {
        throw new Error('No action specified in request');
      }
      
      // Map actions to specific tools or sequences
      switch (request.action) {
        case 'analyzeClaim':
          return await this.handleClaimAnalysis(request);
          
        case 'getRecommendations':
          return await this.executeTool('recommendationEngine' as keyof typeof toolchain, request);
          
        case 'detectAnomalies':
          return await this.executeTool('anomalyDetector' as keyof typeof toolchain, request);
          
        case 'queryVault':
          return await this.executeTool('orgLearningVault' as keyof typeof toolchain, request);
          
        case 'trackMemory':
          return await this.executeTool('memoryTracker' as keyof typeof toolchain, request);
          
        case 'buildContext':
          return await this.executeTool('contextBuilder' as keyof typeof toolchain, request);
          
        default:
          // Check if there's a direct tool match
          if (toolchain[request.action as keyof typeof toolchain]) {
            return await this.executeTool(request.action as keyof typeof toolchain, request);
          }
          
          // Use fallback handler or default route
          if (this.config.fallbackHandler) {
            return await this.config.fallbackHandler(request);
          } else if (this.config.defaultRoute) {
            return await this.executeTool(this.config.defaultRoute as keyof typeof toolchain, request);
          }
          
          throw new Error(`Unsupported action: ${request.action}`);
      }
    } catch (error) {
      console.error('Router error:', error);
      return {
        status: 'error',
        error: error.message,
        result: null
      };
    }
  }
  
  // Handle complex multi-tool sequences
  private async handleClaimAnalysis(request: AgentRequest): Promise<AgentResponse> {
    const toolsUsed = [];
    let context = { ...request };
    
    try {
      // Step 1: Build context
      const contextResult = await this.executeTool('contextBuilder' as keyof typeof toolchain, context);
      toolsUsed.push('contextBuilder');
      context = { ...context, ...contextResult.result };
      
      // Step 2: Detect anomalies
      const anomalyResult = await this.executeTool('anomalyDetector' as keyof typeof toolchain, context);
      toolsUsed.push('anomalyDetector');
      const anomalies = anomalyResult.result;
      
      // Step 3: Get recommendations
      const recommendationContext = { 
        ...context, 
        anomalies 
      };
      const recommendationResult = await this.executeTool('recommendationEngine' as keyof typeof toolchain, recommendationContext);
      toolsUsed.push('recommendationEngine');
      const recommendations = recommendationResult.result;
      
      // Step 4: Get org insights from vault
      const vaultResult = await this.executeTool('orgLearningVault' as keyof typeof toolchain, {
        ...context,
        query: { claimType: context.claimData?.type }
      });
      toolsUsed.push('orgLearningVault');
      const orgInsights = vaultResult.result;
      
      // Step 5: Track this interaction in memory
      await this.executeTool('memoryTracker' as keyof typeof toolchain, {
        sessionId: request.sessionId,
        action: 'store',
        data: { anomalies, recommendations, orgInsights }
      });
      toolsUsed.push('memoryTracker');
      
      // Generate explanation based on findings
      const explanation = this.generateExplanation({
        anomalies,
        recommendations,
        orgInsights
      });
      
      // Generate suggested next steps
      const nextSteps = this.generateNextSteps({
        anomalies,
        recommendations
      });
      
      return {
        status: 'success',
        result: {
          anomalies,
          recommendations,
          orgInsights
        },
        explanation,
        nextSteps,
        toolsUsed
      };
    } catch (error) {
      console.error('Claim analysis error:', error);
      return {
        status: 'error',
        error: error.message,
        result: null,
        toolsUsed
      };
    }
  }
  
  // Execute a single tool
  private async executeTool(toolId: keyof typeof toolchain, params: any): Promise<AgentResponse> {
    const tool = toolchain[toolId];
    
    if (!tool) {
      throw new Error(`Tool not found: ${toolId}`);
    }
    
    // Check for required context
    if (tool.requiredContext) {
      for (const contextKey of tool.requiredContext) {
        if (!params[contextKey] && (!params.context || !params.context[contextKey])) {
          return {
            status: 'error',
            error: `Missing required context for tool ${toolId}: ${contextKey}`,
            result: null
          };
        }
      }
    }
    
    try {
      const result = await tool.execute(params);
      
      return {
        status: 'success',
        result,
        toolsUsed: [toolId as string]
      };
    } catch (error) {
      console.error(`Error executing tool ${toolId}:`, error);
      
      return {
        status: 'error',
        error: `Error executing ${tool.name}: ${error.message}`,
        result: null,
        toolsUsed: [toolId as string]
      };
    }
  }
  
  // Generate human-readable explanation of findings
  private generateExplanation(data: any): string {
    const { anomalies, recommendations, orgInsights } = data;
    
    let explanation = '';
    
    if (anomalies && anomalies.length > 0) {
      explanation += `Found ${anomalies.length} potential issues with this claim. `;
      
      if (anomalies.length === 1) {
        explanation += `The issue is related to ${anomalies[0].type}: ${anomalies[0].description}. `;
      } else {
        explanation += `The main concerns are: ${anomalies.slice(0, 2).map(a => a.type).join(' and ')}. `;
      }
    } else {
      explanation += 'No anomalies detected with this claim. ';
    }
    
    if (recommendations && recommendations.length > 0) {
      explanation += `Based on analysis, ${recommendations.length} recommendations have been generated. `;
      
      if (recommendations[0].confidence > 0.8) {
        explanation += `Strongly recommend to: ${recommendations[0].description}. `;
      } else {
        explanation += `Consider: ${recommendations[0].description}. `;
      }
    }
    
    if (orgInsights && Object.keys(orgInsights).length > 0) {
      explanation += 'Organization-specific insights have been applied to this analysis.';
    }
    
    return explanation;
  }
  
  // Generate actionable next steps
  private generateNextSteps(data: any): string[] {
    const { anomalies, recommendations } = data;
    const nextSteps: string[] = [];
    
    if (anomalies && anomalies.length > 0) {
      nextSteps.push(`Address ${anomalies[0].type} issue before proceeding`);
    }
    
    if (recommendations && recommendations.length > 0) {
      recommendations.slice(0, 3).forEach(rec => {
        if (rec.actionItem) {
          nextSteps.push(rec.actionItem as string);
        }
      });
    }
    
    if (nextSteps.length === 0) {
      nextSteps.push('Proceed with standard claim processing');
    }
    
    return nextSteps;
  }
}
