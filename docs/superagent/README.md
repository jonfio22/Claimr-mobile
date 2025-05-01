# Claimr SuperAgent Documentation

## Overview

The Claimr SuperAgent Orchestration Layer is a comprehensive system designed to connect MCP7 tools, create API endpoints, and integrate with the UI. This system allows for intelligent processing and management of insurance claims through advanced AI-powered tools.

## Key Components

The SuperAgent system consists of the following key components:

### 1. MCP7 Core Tools

- **MemoryTracker**: Maintains contextual memory of interactions and events
- **AnomalyDetector**: Identifies unusual patterns and behaviors in claims data
- **RecommendationEngine**: Generates situational recommendations for claims
- **ContextBuilder**: Creates rich context objects for AI agents and interfaces

### 2. API Endpoints

- `/api/agent/introspect`: Get system status and diagnostic information
- `/api/agent/execute`: Execute specific agent actions
- `/api/agent/a2a`: Facilitate agent-to-agent communication

### 3. UI Integration

- **Timeline View**: Visualizes claim events and history with real-time data
- **A2A Dashboard**: Testing interface for agent-to-agent communication
- **Claims Dashboard**: Real-time view of claims with accurate Supabase data

## Architecture

```
┌───────────────────────────────┐
│        Claimr Frontend        │
│  (Next.js, React, TailwindCSS)│
└───────────┬───────────────────┘
            │
            ▼
┌───────────────────────────────┐
│      API Layer (Next.js)      │
│   - /api/agent/introspect     │
│   - /api/agent/execute        │
│   - /api/agent/a2a            │
└───────────┬───────────────────┘
            │
            ▼
┌───────────────────────────────┐
│   SuperAgent Orchestration    │
│        (ClaimrAgent)          │
└───────────┬───────────────────┘
            │
            ▼
┌───────────────────────────────┐
│         MCP7 Tools            │
├───────────┬───────────────────┤
│MemoryTracker│AnomalyDetector  │
├───────────┼───────────────────┤
│RecommendationEngine│ContextBuilder│
└───────────┴───────────────────┘
            │
            ▼
┌───────────────────────────────┐
│      Database (Supabase)      │
│   - Tables with RLS policies  │
└───────────────────────────────┘
```

## Usage Examples

### Agent Introspection

```typescript
// Get system status
const response = await fetch('/api/agent/introspect', {
  method: 'GET',
  headers: {
    'x-api-key': 'your-api-key-here'
  }
});

const data = await response.json();
console.log(data.systemStatus);
```

### Execute an Agent Action

```typescript
// Execute an agent action
const response = await fetch('/api/agent/execute', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'your-api-key-here'
  },
  body: JSON.stringify({
    action: 'analyzeClaim',
    claimId: 'claim-12345',
    orgId: 'org-12345'
  })
});

const result = await response.json();
console.log(result.data);
```

### Agent-to-Agent Communication

```typescript
// Send A2A message
const response = await fetch('/api/agent/a2a', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'your-api-key-here'
  },
  body: JSON.stringify({
    intent: 'getRecommendations',
    content: {
      claimId: 'claim-12345'
    }
  })
});

const result = await response.json();
console.log(result);
```

## MCP7 Tools Reference

### MemoryTracker

The MemoryTracker maintains contextual memory of interactions and events in the claims process.

```typescript
// Track a claim event
await MemoryTracker.trackEvent({
  entityId: 'claim-12345',
  entityType: 'claim',
  eventType: 'status_changed',
  details: {
    previousStatus: 'SUBMITTED',
    newStatus: 'IN_REVIEW'
  }
});

// Retrieve claim memory
const claimMemory = await MemoryTracker.getEntityMemory('claim-12345', 'claim');
```

### AnomalyDetector

The AnomalyDetector identifies unusual patterns and behaviors in claims data.

```typescript
// Detect anomalies for a claim
const anomalies = await AnomalyDetector.analyzeClaimForAnomalies('claim-12345');

// Log a specific anomaly
await AnomalyDetector.logAnomaly({
  entityId: 'claim-12345',
  entityType: 'claim',
  anomalyType: 'late_response',
  severity: 3,
  details: {
    daysLate: 5,
    expectedResponseDate: '2023-05-15'
  }
});
```

### RecommendationEngine

The RecommendationEngine generates situational recommendations for claims.

```typescript
// Get recommendations for a claim
const recommendations = await RecommendationEngine.getClaimRecommendations('claim-12345');

// Generate a specific recommendation
await RecommendationEngine.createRecommendation({
  entityId: 'claim-12345',
  entityType: 'claim',
  recommendationType: 'escalation',
  details: {
    reason: 'Multiple SLA violations',
    suggestedAction: 'Escalate to manager'
  }
});
```

### ContextBuilder

The ContextBuilder creates rich context objects for AI agents and interfaces.

```typescript
// Build context for a claim
const claimContext = await ContextBuilder.buildClaimContext('claim-12345', {
  includeRecommendations: true,
  includeAnomalies: true,
  includeRelated: true,
  maxHistoryItems: 10
});

// Build context for equipment
const equipmentContext = await ContextBuilder.buildEquipmentContext('equipment-12345');

// Build context for a vendor
const vendorContext = await ContextBuilder.buildVendorContext('vendor-12345');
```

## Security

The SuperAgent system implements several security measures:

1. **API Key Authentication**: All agent endpoints require a valid API key
2. **Row-Level Security (RLS)**: Database tables use RLS policies for proper data access control
3. **Request Validation**: All API endpoints validate request data before processing
4. **Error Handling**: Comprehensive error handling to prevent information leakage

## Testing

API endpoint tests are available in the `/tests/api/agent/` directory:

```bash
# Run all agent API tests
npm test -- tests/api/agent

# Run a specific test
npm test -- tests/api/agent/introspect.test.ts
```

## Future Enhancements

Planned future enhancements for the SuperAgent system:

1. **More advanced anomaly detection algorithms**
2. **Enhanced recommendation engine with ML training**
3. **Extended A2A communication patterns**
4. **Third-party integrations with insurance providers**
5. **Real-time notification system for critical events**

## Contributing

When contributing to the SuperAgent system, please follow these guidelines:

1. Write tests for any new API endpoints
2. Update documentation when changing functionality
3. Follow established patterns for MCP7 tool integration
4. Ensure proper error handling and security validation
