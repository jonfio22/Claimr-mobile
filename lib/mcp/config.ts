import { MCP7Config } from './types';

// Default configuration for MCP7 memory layer
const config: MCP7Config = {
  anomalyDetectionInterval: 3600000, // Check for anomalies every hour
  responseTimeThresholdHours: 24, // Default SLA for vendor responses (1 day)
  photoCountThreshold: 3, // Minimum recommended photos per claim
  enableRealTimeDetection: true, // Enable real-time anomaly detection
  modelSettings: {
    embeddingModel: 'text-embedding-ada-002', // OpenAI embedding model
    embeddingDimension: 1536, // Dimensions for OpenAI embeddings
    similarityThreshold: 0.8 // Minimum similarity score for relevance
  }
};

export default config;
