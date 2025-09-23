"use client";

import { useState } from 'react';
import { MODEL_PROVIDERS } from '@/lib/ai';

type BatchResult = {
  success: boolean;
  transcript: string;
  totalModels: number;
  successfulAnalyses: number;
  failedAnalyses: number;
  consensus: {
    callType: string;
    successCategory: string;
    intent: string;
    totalVotes: number;
  };
  results: Array<{
    success: boolean;
    modelId: string;
    modelInfo: {
      modelId: string;
      provider: string;
      name: string;
    };
    result?: any;
    error?: string;
  }>;
  processingTime: number;
};

export default function BatchAnalyzePage() {
  const [transcript, setTranscript] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BatchResult | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<string[]>(Object.keys(MODEL_PROVIDERS));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (transcript.trim().length < 10) {
      setError('Transcript must be at least 10 characters');
      return;
    }

    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/batch-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          transcript,
          includeProviders: selectedProviders 
        }),
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Analysis failed');
      }
      
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to analyze');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleProvider = (provider: string) => {
    if (selectedProviders.includes(provider)) {
      setSelectedProviders(selectedProviders.filter(p => p !== provider));
    } else {
      setSelectedProviders([...selectedProviders, provider]);
    }
  };

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8 }}>Batch Model Analysis</h1>
      <p style={{ color: '#6b7280', marginBottom: 24 }}>
        Test your transcript across multiple AI models simultaneously
      </p>

      <form onSubmit={handleSubmit} style={{ marginBottom: 24 }}>
        <div style={{ marginBottom: 16 }}>
          <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Select Providers:</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {Object.entries(MODEL_PROVIDERS).map(([providerId, provider]) => (
              <label key={providerId} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="checkbox"
                  checked={selectedProviders.includes(providerId)}
                  onChange={() => toggleProvider(providerId)}
                />
                <span>{provider.name}</span>
                <span style={{ color: '#6b7280', fontSize: 12 }}>
                  ({Object.keys(provider.models).length} models)
                </span>
              </label>
            ))}
          </div>
        </div>

        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="Enter call transcript here..."
          style={{
            width: '100%',
            minHeight: 150,
            padding: 12,
            border: '1px solid #e5e7eb',
            borderRadius: 6,
            fontSize: 14,
            fontFamily: 'inherit',
            resize: 'vertical',
            marginBottom: 16
          }}
        />

        <button
          type="submit"
          disabled={isLoading || selectedProviders.length === 0}
          style={{
            padding: '12px 24px',
            backgroundColor: isLoading ? '#9ca3af' : '#4f46e5',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            fontSize: 16,
            fontWeight: 600,
            cursor: isLoading ? 'not-allowed' : 'pointer',
          }}
        >
          {isLoading ? 'Analyzing...' : 'Analyze with All Models'}
        </button>
      </form>

      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: 12, borderRadius: 6, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {result && (
        <div>
          <div style={{ backgroundColor: '#f3f4f6', padding: 16, borderRadius: 8, marginBottom: 24 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>Consensus Results</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <div>
                <div style={{ fontSize: 14, color: '#6b7280' }}>Call Type</div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{result.consensus.callType}</div>
              </div>
              <div>
                <div style={{ fontSize: 14, color: '#6b7280' }}>Success Category</div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{result.consensus.successCategory}</div>
              </div>
              <div>
                <div style={{ fontSize: 14, color: '#6b7280' }}>Intent</div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{result.consensus.intent}</div>
              </div>
              <div>
                <div style={{ fontSize: 14, color: '#6b7280' }}>Processing Time</div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>
                  {(result.processingTime / 1000).toFixed(2)}s
                </div>
              </div>
            </div>
            <div style={{ marginTop: 8, fontSize: 14, color: '#6b7280' }}>
              {result.successfulAnalyses} of {result.totalModels} models analyzed successfully
            </div>
          </div>

          <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>Individual Model Results</h2>
          <div style={{ display: 'grid', gap: 16 }}>
            {Object.entries(MODEL_PROVIDERS).map(([providerId, provider]) => {
              const providerResults = result.results.filter(r => r.modelInfo.provider === providerId);
              if (providerResults.length === 0) return null;

              return (
                <div key={providerId} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
                    {provider.name}
                  </h3>
                  <div style={{ display: 'grid', gap: 12 }}>
                    {providerResults.map((modelResult) => (
                      <div 
                        key={modelResult.modelId}
                        style={{
                          padding: 12,
                          backgroundColor: modelResult.success ? '#f0fdf4' : '#fef2f2',
                          borderRadius: 6,
                          border: `1px solid ${modelResult.success ? '#86efac' : '#fca5a5'}`
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                          <span style={{ fontWeight: 600 }}>{modelResult.modelInfo.name}</span>
                          <span style={{ 
                            fontSize: 12, 
                            color: modelResult.success ? '#15803d' : '#991b1b'
                          }}>
                            {modelResult.success ? 'Success' : 'Failed'}
                          </span>
                        </div>
                        
                        {modelResult.success && modelResult.result ? (
                          <div style={{ fontSize: 14 }}>
                            <div>
                              <span style={{ color: '#6b7280' }}>Call Type:</span> {modelResult.result.callType}
                            </div>
                            <div>
                              <span style={{ color: '#6b7280' }}>Success:</span> {modelResult.result.successCategory}
                            </div>
                            <div>
                              <span style={{ color: '#6b7280' }}>Intent:</span> {modelResult.result.intent}
                            </div>
                            <div>
                              <span style={{ color: '#6b7280' }}>Confidence:</span> {Math.round((modelResult.result.confidence || 0) * 100)}%
                            </div>
                            {modelResult.result.analysisTime && (
                              <div>
                                <span style={{ color: '#6b7280' }}>Time:</span> {(modelResult.result.analysisTime / 1000).toFixed(2)}s
                              </div>
                            )}
                          </div>
                        ) : (
                          <div style={{ fontSize: 14, color: '#991b1b' }}>
                            {modelResult.error || 'Analysis failed'}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </main>
  );
}
