import React, { useState, useEffect } from 'react';
import { useOrgLearning } from '../hooks/useOrgLearning';
import { Recommendation } from '../types';

interface ClaimRecommendationsProps {
  orgId: string;
  claimId: string;
  claimData: any;
}

export const ClaimRecommendations: React.FC<ClaimRecommendationsProps> = ({ 
  orgId, 
  claimId,
  claimData 
}) => {
  const { getRecommendations, submitFeedback, loading } = useOrgLearning({ orgId });
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [expandedRecommendation, setExpandedRecommendation] = useState<string | null>(null);

  // Fetch recommendations when claim data changes
  useEffect(() => {
    if (claimId && claimData) {
      fetchRecommendations();
    }
  }, [claimId, claimData]);

  const fetchRecommendations = async () => {
    setLoadingRecommendations(true);
    
    // Build context object for recommendations
    const context = {
      claim_id: claimId,
      user_id: claimData.user_id,
      claim_type: claimData.issue_type,
      vendor_id: claimData.vendor_id,
      equipment_id: claimData.equipment_id,
      equipment_type: claimData.equipment_type,
      issue_description: claimData.description
    };
    
    try {
      const recs = await getRecommendations(context);
      setRecommendations(recs);
    } catch (error) {
      console.error('Error fetching recommendations:', error);
    } finally {
      setLoadingRecommendations(false);
    }
  };

  const handleFeedback = async (recommendation: Recommendation, rating: number) => {
    await submitFeedback('recommendation', {
      itemId: `${recommendation.type}_${Date.now()}`,
      context: {
        claim_id: claimId,
        recommendation_type: recommendation.type
      },
      rating,
      comments: '',
      outcome: 'feedback_submitted'
    });
    
    // Refresh recommendations after feedback
    fetchRecommendations();
  };

  const toggleExpand = (id: string) => {
    if (expandedRecommendation === id) {
      setExpandedRecommendation(null);
    } else {
      setExpandedRecommendation(id);
    }
  };

  if (loading || loadingRecommendations) {
    return (
      <div className="p-4 bg-white rounded-lg shadow">
        <div className="animate-pulse h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
        <div className="space-y-3">
          <div className="animate-pulse h-16 bg-gray-200 rounded w-full"></div>
          <div className="animate-pulse h-16 bg-gray-200 rounded w-full"></div>
        </div>
      </div>
    );
  }

  if (recommendations.length === 0) {
    return (
      <div className="p-4 bg-white rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-2">Recommendations</h3>
        <p className="text-gray-600">No recommendations available for this claim yet.</p>
      </div>
    );
  }

  return (
    <div className="p-4 bg-white rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4">Recommendations</h3>
      
      <div className="space-y-4">
        {recommendations.map((recommendation, index) => (
          <div 
            key={`${recommendation.type}-${index}`}
            className="border border-gray-100 rounded-lg overflow-hidden shadow-sm"
          >
            <div 
              className={`p-3 ${
                recommendation.type === 'claim_approach' ? 'bg-blue-50' :
                recommendation.type === 'vendor_strategy' ? 'bg-green-50' :
                recommendation.type === 'equipment_insight' ? 'bg-purple-50' :
                'bg-amber-50'
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-medium">{recommendation.title}</h4>
                  <p className="text-sm text-gray-700">{recommendation.description}</p>
                </div>
                <button
                  onClick={() => toggleExpand(`${recommendation.type}-${index}`)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  {expandedRecommendation === `${recommendation.type}-${index}` ? (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  )}
                </button>
              </div>
              
              <div className="flex items-center mt-2">
                <div className="flex-1">
                  <div className="flex items-center">
                    <span className="text-xs text-gray-500 mr-2">Confidence</span>
                    <div className="w-24 bg-gray-200 rounded-full h-1.5">
                      <div 
                        className={`h-1.5 rounded-full ${
                          recommendation.confidence < 0.4 ? 'bg-amber-500' :
                          recommendation.confidence < 0.7 ? 'bg-blue-500' :
                          'bg-green-500'
                        }`}
                        style={{ width: `${recommendation.confidence * 100}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
                
                <div className="flex space-x-1">
                  <button 
                    onClick={() => handleFeedback(recommendation, 5)}
                    className="p-1 rounded hover:bg-gray-100"
                    aria-label="Helpful"
                  >
                    <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                      <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
                    </svg>
                  </button>
                  <button 
                    onClick={() => handleFeedback(recommendation, 1)}
                    className="p-1 rounded hover:bg-gray-100"
                    aria-label="Not helpful"
                  >
                    <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
                      <path d="M18 9.5a1.5 1.5 0 11-3 0v-6a1.5 1.5 0 013 0v6zM14 9.667v-5.43a2 2 0 00-1.105-1.79l-.05-.025A4 4 0 0011.055 2H5.64a2 2 0 00-1.962 1.608l-1.2 6A2 2 0 004.44 12H8v4a2 2 0 002 2 1 1 0 001-1v-.667a4 4 0 01.8-2.4l1.4-1.866a4 4 0 00.8-2.4z" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            
            {expandedRecommendation === `${recommendation.type}-${index}` && (
              <div className="p-3 bg-white">
                <div className="mb-3">
                  <h5 className="text-xs font-medium text-gray-500 uppercase">Reasoning</h5>
                  <p className="text-sm text-gray-700">{recommendation.reasoning}</p>
                </div>
                
                <div>
                  <h5 className="text-xs font-medium text-gray-500 uppercase">Suggested Actions</h5>
                  <ul className="list-disc list-inside text-sm text-gray-700 mt-1">
                    {recommendation.suggestedActions.map((action, i) => (
                      <li key={i}>{action}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
