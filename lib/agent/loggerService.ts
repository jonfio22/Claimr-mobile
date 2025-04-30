export const loggerService = {
  /**
   * Log agent activity with structured metadata
   */
  async logAgentActivity(
    agentId: string | null,
    activityType: string,
    details: Record<string, any>
  ) {
    // Implementation could use Supabase, external logging service, etc.
    console.log({
      timestamp: new Date().toISOString(),
      agentId,
      activityType,
      details
    });
    
    // Could be extended to send to a monitoring service
  }
};
