export type Organization = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  settings: Record<string, any>;
  active: boolean;
};

export type VaultType = 
  | 'claim_patterns'
  | 'vendor_insights'
  | 'tech_behaviors'
  | 'equipment_trends';

export type OrganizationVault = {
  id: string;
  org_id: string;
  vault_type: VaultType;
  data: Record<string, any>;
  created_at: string;
  updated_at: string;
  version: number;
};

export type VaultEventType = 
  | 'training'
  | 'update'
  | 'retrieval'
  | 'inference';

export type VaultLogEntry = {
  id: string;
  org_id: string;
  vault_id: string;
  event_type: VaultEventType;
  data: Record<string, any>;
  created_at: string;
  created_by?: string;
  metrics: Record<string, any>;
};

export type BehaviorType = 
  | 'escalation_rule'
  | 'approval_hint'
  | 'vendor_approach';

export type OrganizationBehavior = {
  id: string;
  org_id: string;
  behavior_type: BehaviorType;
  priority: number;
  conditions: Record<string, any>;
  actions: Record<string, any>;
  active: boolean;
  created_at: string;
  updated_at: string;
};

// Learning patterns and insights types
export type ClaimPattern = {
  patternId: string;
  description: string;
  indicators: string[];
  confidence: number;
  occurenceCount: number;
  lastUpdated: string;
  metadata: Record<string, any>;
};

export type VendorInsight = {
  vendorId: string;
  responsePatterns: {
    averageResponseTime: number; // in hours
    approvalRate: number; // 0-1
    escalationRate: number; // 0-1
    commonResponses: {
      content: string;
      frequency: number;
    }[];
  };
  negotiationTips: string[];
  strengths: string[];
  challenges: string[];
  lastUpdated: string;
};

export type TechBehavior = {
  techId: string;
  specialties: string[];
  preferredEquipment: string[];
  approachStyle: string;
  commonSolutions: {
    problemType: string;
    solutionApproach: string;
    successRate: number;
  }[];
  lastUpdated: string;
};

export type EquipmentTrend = {
  equipmentType: string;
  commonIssues: {
    issue: string;
    frequency: number;
    resolvedBy: {
      approach: string;
      successRate: number;
    }[];
  }[];
  maintenancePatterns: {
    interval: string;
    activities: string[];
    effectiveness: number;
  }[];
  replacementIndicators: string[];
  lastUpdated: string;
};

// Learning recommendation types
export type RecommendationType = 
  | 'claim_approach'
  | 'vendor_strategy'
  | 'equipment_insight'
  | 'escalation_suggestion';
  
export type Recommendation = {
  type: RecommendationType;
  title: string;
  description: string;
  confidence: number;
  reasoning: string;
  suggestedActions: string[];
  metadata: Record<string, any>;
};
