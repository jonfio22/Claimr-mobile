import React, { useState } from 'react';
import { AgentResponse } from '../types';

interface ClaimAnalysisPanelProps {
  claimId: string;
  orgId: string;
  initialData?: any;
}

export function ClaimAnalysisPanel({ claimId, orgId, initialData }: ClaimAnalysisPanelProps) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AgentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const analyzeClaim = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch('/api/agent/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'analyzeClaim',
          claimId,
          orgId,
          claimData: initialData,
        }),
      });
      
      const data = await response.json();
      
      if (data.status === 'error') {
        setError(data.error || 'Unknown error occurred');
      } else {
        setResult(data.data);
      }
    } catch (err) {
      setError('Failed to analyze claim: ' + (err.message || 'Unknown error'));
      console.error('Claim analysis error:', err);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow p-4 mb-4 max-w-4xl mx-auto">
      <h2 className="text-xl font-semibold mb-4">Claim Analysis</h2>
      
      <div className="grid grid-cols-1 gap-4 mb-4">
        <div className="flex flex-col">
          <span className="text-sm font-medium text-gray-500">Claim ID</span>
          <span className="font-medium">{claimId}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-gray-500">Organization</span>
          <span className="font-medium">{orgId}</span>
        </div>
      </div>
      
      <button
        onClick={analyzeClaim}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed w-full mb-4"
      >
        {loading ? 'Analyzing...' : 'Analyze Claim'}
      </button>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 p-3 rounded-md mb-4">
          {error}
        </div>
      )}
      
      {result && (
        <div className="border border-gray-200 rounded-md p-4">
          <h3 className="font-semibold text-lg mb-3">Analysis Results</h3>
          
          {result.explanation && (
            <div className="mb-4">
              <h4 className="font-medium text-gray-700 mb-1">Explanation</h4>
              <p className="text-gray-800">{result.explanation}</p>
            </div>
          )}
          
          {result.nextSteps && result.nextSteps.length > 0 && (
            <div className="mb-4">
              <h4 className="font-medium text-gray-700 mb-1">Recommended Next Steps</h4>
              <ul className="list-disc list-inside">
                {result.nextSteps.map((step, idx) => (
                  <li key={idx} className="text-gray-800">{step}</li>
                ))}
              </ul>
            </div>
          )}
          
          {result.toolsUsed && result.toolsUsed.length > 0 && (
            <div className="mb-4">
              <h4 className="font-medium text-gray-700 mb-1">Tools Used</h4>
              <div className="flex flex-wrap gap-2">
                {result.toolsUsed.map((tool, idx) => (
                  <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                    {tool}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {result.result && (
            <div>
              <h4 className="font-medium text-gray-700 mb-1">Detailed Results</h4>
              <div className="bg-gray-50 p-3 rounded overflow-auto max-h-60">
                <pre className="text-xs">{JSON.stringify(result.result, null, 2)}</pre>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Example of a button component that can be placed anywhere in the app
export function ClaimAnalysisButton({ claimId, orgId }: { claimId: string; orgId: string }) {
  const [showAnalysis, setShowAnalysis] = useState(false);
  
  return (
    <>
      <button
        onClick={() => setShowAnalysis(!showAnalysis)}
        className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
      >
        {showAnalysis ? 'Hide Analysis' : 'Analyze Claim'}
      </button>
      
      {showAnalysis && (
        <div className="mt-4">
          <ClaimAnalysisPanel claimId={claimId} orgId={orgId} />
        </div>
      )}
    </>
  );
}
