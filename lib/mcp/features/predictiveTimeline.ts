import { supabase } from '../utils/supabaseClient';
import { MemoryTracker } from '../memoryTracker';
import { AnomalyDetector } from '../anomalyDetector';
import { TimelineEvent } from '../types';
import dayjs from 'dayjs';

/**
 * Types for the Predictive Timeline feature
 */
export interface ClaimPattern {
  patternType: 'delay' | 'escalation' | 'resolution' | 'response';
  likelihood: number; // 0-1
  typicalDuration: number; // in hours
  indicatorEvents: string[];
  description: string;
}

export interface TimelinePrediction {
  eventType: string;
  predictedAt: Date;
  confidence: number; // 0-1
  description: string;
  baseReasoning: string;
  alternateScenarios?: {
    description: string;
    likelihood: number;
    impactLevel: 'low' | 'medium' | 'high';
  }[];
}

export interface PredictedTimeline {
  claimId: string;
  currentStatus: string;
  historicalEvents: TimelineEvent[];
  predictedEvents: TimelinePrediction[];
  estimatedResolutionDate: Date | null;
  confidenceScore: number; // 0-1
  potentialBlockers: string[];
  generatedAt: Date;
}

/**
 * Service for predictive timeline analysis and generation
 */
export class ClaimPredictiveTimeline {
  private memoryTracker: MemoryTracker;
  private anomalyDetector: AnomalyDetector;
  
  constructor() {
    this.memoryTracker = new MemoryTracker();
    this.anomalyDetector = new AnomalyDetector();
  }
  
  /**
   * Generate a predictive timeline for a claim
   */
  async predictClaimTimeline(claimId: string): Promise<PredictedTimeline> {
    // Get claim data
    const { data: claim, error: claimError } = await supabase
      .from('claims')
      .select('*, vendors(*)')
      .eq('id', claimId)
      .single();
      
    if (claimError) throw claimError;
    
    // Get historical claim events
    const historicalEvents = await this.memoryTracker.getClaimMemoryStream(claimId);
    
    // Get similar claims history
    const similarClaims = await this.findSimilarClaims(claim);
    
    // Analyze patterns in similar claims
    const patterns = await this.analyzeClaimPatterns(similarClaims);
    
    // Predict potential anomalies
    const potentialAnomalies = await this.anomalyDetector.runAllChecks(claimId);
    
    // Generate timeline predictions
    const predictedEvents = this.generateTimelinePredictions(
      claim,
      historicalEvents,
      patterns,
      potentialAnomalies
    );
    
    // Calculate resolution date
    const estimatedResolutionDate = this.estimateResolutionDate(
      claim,
      historicalEvents,
      patterns,
      predictedEvents
    );
    
    // Format as timeline
    return {
      claimId,
      currentStatus: claim.status,
      historicalEvents: historicalEvents.map(event => ({
        id: event.id,
        timestamp: new Date(event.created_at),
        eventType: event.event_type,
        entityType: event.entity_type,
        entityId: event.entity_id,
        details: event.metadata || {}
      })),
      predictedEvents,
      estimatedResolutionDate,
      confidenceScore: this.calculateConfidenceScore(patterns, historicalEvents.length),
      potentialBlockers: this.identifyPotentialBlockers(claim, patterns, potentialAnomalies),
      generatedAt: new Date()
    };
  }
  
  /**
   * Find similar claims based on type, vendor, and complexity
   */
  private async findSimilarClaims(claim: any): Promise<any[]> {
    const { data: similarClaims, error } = await supabase
      .from('claims')
      .select('*')
      .eq('status', 'resolved') // Only look at resolved claims
      .eq('issue_type', claim.issue_type)
      .eq('vendor_id', claim.vendor_id)
      .order('created_at', { ascending: false })
      .limit(20);
      
    if (error) throw error;
    return similarClaims || [];
  }
  
  /**
   * Analyze patterns in similar claims
   */
  private async analyzeClaimPatterns(similarClaims: any[]): Promise<ClaimPattern[]> {
    const patterns: ClaimPattern[] = [];
    
    // No similar claims, return empty patterns
    if (similarClaims.length === 0) return patterns;
    
    // Calculate average resolution time
    const resolutionTimes = similarClaims
      .filter(c => c.resolved_at)
      .map(c => dayjs(c.resolved_at).diff(dayjs(c.created_at), 'hour'));
      
    if (resolutionTimes.length > 0) {
      const avgResolutionTime = resolutionTimes.reduce((sum, time) => sum + time, 0) / resolutionTimes.length;
      
      patterns.push({
        patternType: 'resolution',
        likelihood: 0.85,
        typicalDuration: avgResolutionTime,
        indicatorEvents: ['claim_created', 'status_changed'],
        description: `Based on similar claims, typical resolution time is around ${Math.round(avgResolutionTime)} hours`
      });
    }
    
    // Calculate vendor response patterns
    const firstResponseTimes = await this.calculateFirstResponseTimes(similarClaims);
    if (firstResponseTimes.length > 0) {
      const avgResponseTime = firstResponseTimes.reduce((sum, time) => sum + time, 0) / firstResponseTimes.length;
      
      patterns.push({
        patternType: 'response',
        likelihood: 0.75,
        typicalDuration: avgResponseTime,
        indicatorEvents: ['claim_created'],
        description: `Vendor typically responds within ${Math.round(avgResponseTime)} hours`
      });
    }
    
    // Look for escalation patterns
    const escalationRate = similarClaims.filter(c => c.escalated).length / similarClaims.length;
    if (escalationRate > 0.2) {
      patterns.push({
        patternType: 'escalation',
        likelihood: escalationRate,
        typicalDuration: 72, // Default assumption
        indicatorEvents: ['status_changed', 'message_received'],
        description: `${Math.round(escalationRate * 100)}% of similar claims required escalation`
      });
    }
    
    return patterns;
  }
  
  /**
   * Calculate first response times for a set of claims
   */
  private async calculateFirstResponseTimes(claims: any[]): Promise<number[]> {
    const responseTimes: number[] = [];
    
    for (const claim of claims) {
      // Get first vendor message
      const { data: firstVendorMessage } = await supabase
        .from('messages')
        .select('created_at')
        .eq('claim_id', claim.id)
        .eq('sender_type', 'vendor')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();
        
      if (firstVendorMessage) {
        const responseTime = dayjs(firstVendorMessage.created_at).diff(dayjs(claim.created_at), 'hour');
        responseTimes.push(responseTime);
      }
    }
    
    return responseTimes;
  }
  
  /**
   * Generate timeline predictions based on patterns and claim state
   */
  private generateTimelinePredictions(
    claim: any,
    historicalEvents: any[],
    patterns: ClaimPattern[],
    potentialAnomalies: any[]
  ): TimelinePrediction[] {
    const predictions: TimelinePrediction[] = [];
    const now = dayjs();
    
    // Current claim age
    const claimAge = now.diff(dayjs(claim.created_at), 'hour');
    
    // Add vendor response prediction if claim is new
    const responsePattern = patterns.find(p => p.patternType === 'response');
    if (claim.status === 'submitted' && responsePattern) {
      // Check if vendor has already responded
      const vendorResponded = historicalEvents.some(e => 
        e.event_type === 'message_received' && e.metadata?.sender_type === 'vendor'
      );
      
      if (!vendorResponded) {
        const predictedResponseTime = dayjs(claim.created_at).add(responsePattern.typicalDuration, 'hour');
        
        // Only predict if it's in the future
        if (predictedResponseTime.isAfter(now)) {
          predictions.push({
            eventType: 'vendor_response',
            predictedAt: predictedResponseTime.toDate(),
            confidence: responsePattern.likelihood,
            description: 'Vendor expected to respond',
            baseReasoning: `Based on analysis of ${patterns.length} similar claims where vendors responded within ${Math.round(responsePattern.typicalDuration)} hours`
          });
        }
      }
    }
    
    // Add resolution prediction
    const resolutionPattern = patterns.find(p => p.patternType === 'resolution');
    if (resolutionPattern && claim.status !== 'resolved') {
      const predictedResolutionTime = dayjs(claim.created_at).add(resolutionPattern.typicalDuration, 'hour');
      
      // Adjust for anomalies
      let adjustedResolutionTime = predictedResolutionTime;
      let adjustmentReasoning = '';
      
      if (potentialAnomalies.length > 0) {
        // Add delay based on anomalies
        const anomalyDelay = potentialAnomalies.length * 24; // 24 hours per anomaly
        adjustedResolutionTime = adjustedResolutionTime.add(anomalyDelay, 'hour');
        adjustmentReasoning = ` (adjusted +${anomalyDelay} hours due to potential anomalies)`;
      }
      
      // Only predict if it's in the future
      if (adjustedResolutionTime.isAfter(now)) {
        predictions.push({
          eventType: 'claim_resolved',
          predictedAt: adjustedResolutionTime.toDate(),
          confidence: resolutionPattern.likelihood - (potentialAnomalies.length * 0.1),
          description: 'Claim expected to be resolved',
          baseReasoning: `Based on analysis of similar claims with resolution time of ${Math.round(resolutionPattern.typicalDuration)} hours${adjustmentReasoning}`,
          alternateScenarios: potentialAnomalies.map(anomaly => ({
            description: `Delay due to ${anomaly.anomaly_type}: ${anomaly.description}`,
            likelihood: 0.3 + (anomaly.severity / 10),
            impactLevel: anomaly.severity > 3 ? 'high' : 'medium'
          }))
        });
      }
    }
    
    // Add escalation prediction if applicable
    const escalationPattern = patterns.find(p => p.patternType === 'escalation');
    if (escalationPattern && !claim.escalated && claim.status !== 'resolved') {
      // Predict escalation at around 60% of the way to resolution
      const resolutionDuration = resolutionPattern?.typicalDuration || 168; // Default 7 days
      const escalationTime = dayjs(claim.created_at).add(resolutionDuration * 0.6, 'hour');
      
      // Only predict if it's in the future
      if (escalationTime.isAfter(now)) {
        predictions.push({
          eventType: 'escalation_needed',
          predictedAt: escalationTime.toDate(),
          confidence: escalationPattern.likelihood,
          description: 'Claim may need escalation',
          baseReasoning: `${Math.round(escalationPattern.likelihood * 100)}% of similar claims required escalation at this stage`,
          alternateScenarios: [
            {
              description: 'Normal resolution without escalation',
              likelihood: 1 - escalationPattern.likelihood,
              impactLevel: 'low'
            }
          ]
        });
      }
    }
    
    // Sort predictions by predicted date
    return predictions.sort((a, b) => a.predictedAt.getTime() - b.predictedAt.getTime());
  }
  
  /**
   * Estimate the final resolution date
   */
  private estimateResolutionDate(
    claim: any,
    historicalEvents: any[],
    patterns: ClaimPattern[],
    predictions: TimelinePrediction[]
  ): Date | null {
    if (claim.status === 'resolved') {
      return new Date(claim.resolved_at);
    }
    
    // Look for resolution prediction
    const resolutionPrediction = predictions.find(p => p.eventType === 'claim_resolved');
    if (resolutionPrediction) {
      return resolutionPrediction.predictedAt;
    }
    
    // If no prediction but we have patterns, use them
    const resolutionPattern = patterns.find(p => p.patternType === 'resolution');
    if (resolutionPattern) {
      return dayjs(claim.created_at).add(resolutionPattern.typicalDuration, 'hour').toDate();
    }
    
    // Default fallback based on claim type
    const fallbackDays = claim.issue_type === 'complex' ? 14 : 7;
    return dayjs(claim.created_at).add(fallbackDays, 'day').toDate();
  }
  
  /**
   * Calculate confidence score for predictions
   */
  private calculateConfidenceScore(patterns: ClaimPattern[], eventCount: number): number {
    // Base confidence on pattern strength and event count
    const patternStrength = patterns.reduce((sum, p) => sum + p.likelihood, 0) / (patterns.length || 1);
    const eventFactor = Math.min(1, eventCount / 10); // More events = better prediction
    
    return Math.min(0.95, patternStrength * 0.7 + eventFactor * 0.3);
  }
  
  /**
   * Identify potential blockers to resolution
   */
  private identifyPotentialBlockers(
    claim: any,
    patterns: ClaimPattern[],
    anomalies: any[]
  ): string[] {
    const blockers: string[] = [];
    
    // Anomaly-based blockers
    if (anomalies.length > 0) {
      anomalies.forEach(anomaly => {
        blockers.push(`${anomaly.anomaly_type}: ${anomaly.description}`);
      });
    }
    
    // Pattern-based blockers
    if (patterns.find(p => p.patternType === 'escalation')?.likelihood > 0.6) {
      blockers.push('High likelihood of requiring escalation');
    }
    
    // Claim-specific blockers
    if (!claim.vendor_id) {
      blockers.push('No vendor assigned');
    }
    
    // Photo evidence blockers
    const photoCount = claim.photo_count || 0;
    if (photoCount < 3) {
      blockers.push('Insufficient photo documentation');
    }
    
    return blockers;
  }
}

// Export a singleton instance
export const predictiveTimeline = new ClaimPredictiveTimeline();
