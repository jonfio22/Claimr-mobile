import React from 'react';
import { useOrgLearning } from '../hooks/useOrgLearning';

interface OrgInsightsPanelProps {
  orgId: string;
}

export const OrgInsightsPanel: React.FC<OrgInsightsPanelProps> = ({ orgId }) => {
  const { 
    claimPatterns,
    vendorInsights,
    loading,
    error,
    learningEffectiveness,
    hasLearningCapability
  } = useOrgLearning({ orgId });

  if (loading) {
    return (
      <div className="p-4 bg-white rounded-lg shadow">
        <div className="animate-pulse h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
        <div className="animate-pulse h-20 bg-gray-200 rounded w-full mb-2"></div>
        <div className="animate-pulse h-4 bg-gray-200 rounded w-1/2"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-white rounded-lg shadow">
        <h3 className="text-lg font-semibold text-red-600">Error Loading Insights</h3>
        <p className="text-gray-600">Unable to load organization insights. Please try again later.</p>
      </div>
    );
  }

  // Format learning effectiveness as percentage
  const learningScore = Math.round(learningEffectiveness * 100);
  
  // Get learning system status
  const learningStatus = 
    learningScore < 30 ? 'Learning' :
    learningScore < 60 ? 'Developing' :
    learningScore < 85 ? 'Proficient' : 
    'Expert';

  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Organization Learning</h3>
        <div className="flex items-center">
          <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
          <span className="text-sm text-gray-600">Active</span>
        </div>
      </div>
      
      {/* Learning System Status */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm text-gray-600">Learning System</span>
          <span className="text-sm font-medium">{learningStatus}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className={`h-2 rounded-full ${
              learningScore < 30 ? 'bg-blue-400' :
              learningScore < 60 ? 'bg-blue-500' :
              learningScore < 85 ? 'bg-blue-600' : 
              'bg-blue-700'
            }`}
            style={{ width: `${learningScore}%` }}
          ></div>
        </div>
      </div>
      
      {/* Learning Capabilities */}
      <div className="mb-4">
        <h4 className="text-sm font-medium mb-2">Active Capabilities</h4>
        <div className="flex flex-wrap gap-2">
          {hasLearningCapability('claim_approach') && (
            <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800">
              Claim Insights
            </span>
          )}
          {hasLearningCapability('vendor_strategy') && (
            <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">
              Vendor Strategy
            </span>
          )}
          {hasLearningCapability('equipment_insight') && (
            <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800">
              Equipment Insights
            </span>
          )}
          {hasLearningCapability('escalation_suggestion') && (
            <span className="px-2 py-1 text-xs rounded-full bg-amber-100 text-amber-800">
              Escalation Strategy
            </span>
          )}
        </div>
      </div>
      
      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="text-sm text-gray-600">Identified Patterns</div>
          <div className="text-xl font-semibold">{claimPatterns.length}</div>
        </div>
        <div className="p-3 bg-gray-50 rounded-lg">
          <div className="text-sm text-gray-600">Vendor Insights</div>
          <div className="text-xl font-semibold">{vendorInsights.length}</div>
        </div>
      </div>
      
      {/* Recent Learning */}
      {claimPatterns.length > 0 && (
        <div>
          <h4 className="text-sm font-medium mb-2">Recent Learnings</h4>
          <ul className="space-y-2">
            {claimPatterns
              .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
              .slice(0, 3)
              .map(pattern => (
                <li key={pattern.patternId} className="text-sm">
                  <div className="flex items-start">
                    <div className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 mr-2 flex-shrink-0"></div>
                    <div>
                      <p className="text-gray-800">{pattern.description}</p>
                      <p className="text-xs text-gray-500">
                        Confidence: {Math.round(pattern.confidence * 100)}% • 
                        Occurrences: {pattern.occurenceCount}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
};
