// Context Builder Types

export interface ContextBuilderOptions {
  includeRecommendations?: boolean;
  includeAnomalies?: boolean;
  includeRelated?: boolean;
  maxHistoryItems?: number;
}

export interface BaseContext {
  entityId: string;
  entityType: string;
  timestamp: string;
  context: Record<string, any>;
}

export interface ClaimContext extends BaseContext {
  entityType: 'claim';
  context: {
    claim: any;
    timeline?: any[];
    messages?: any[];
    photos?: any[];
    anomalies?: any[];
    recommendations?: any[];
    relatedClaims?: any[];
    stats?: {
      daysOpen: number;
      responseTime: number;
      photoCount: number;
      messageCount: number;
    };
  };
}

export interface EquipmentContext extends BaseContext {
  entityType: 'equipment';
  context: {
    equipment: any;
    claims?: any[];
    maintenance?: any[];
    anomalies?: any[];
    recommendations?: any[];
    stats?: {
      failureRate: number;
      mtbf: number;
      claimCount: number;
      issueTypes?: Record<string, number>;
      daysSinceLastClaim?: number;
    };
  };
}

export interface VendorContext extends BaseContext {
  entityType: 'vendor';
  context: {
    vendor: any;
    claims?: any[];
    anomalies?: any[];
    stats?: {
      approvalRate: number;
      rejectionRate?: number;
      pendingRate?: number;
      claimCount: number;
      equipmentDistribution?: Record<string, number>;
      statusDistribution?: Record<string, number>;
    };
  };
}
