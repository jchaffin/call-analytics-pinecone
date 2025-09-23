"use client";

import { useMemo, useState, useEffect } from 'react';
import { MODEL_PROVIDERS, getDefaultModelId } from '@/lib/ai';

type Result = {
  callType: 'Automated' | 'Escalated';
  successCategory: 'Successful' | 'Partially Successful' | 'Unsuccessful';
  intent: string;
  intentCategory: string;
  confidence: number;
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  escalationReason?: string;
  products?: { id: string; name: string; score: number }[];
  keywords?: { term: string; score: number }[];
  relatedDocs?: { id: string; score: number; metadata?: Record<string, unknown> }[];
  pineconeRecordId?: string;
  _timings?: {
    ai_analysis: number;
    pinecone_search: number;
    pinecone_upsert: number;
    total: number;
    unit: string;
  };
};

type ProductAnalytics = {
  product: string;
  totalCalls: number;
  successRate: string;
  partialSuccessRate: string;
  failureRate: string;
  topIntents: Array<{ intent: string; category: string; count: number }>;
  outcomes: Record<string, number>;
  recordsByOutcome: Record<string, Array<{
    id: string;
    intent: string;
    outcome: string;
    callType: string;
  }>>;
};

export default function HomePage() {
  const [transcript, setTranscript] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [model, setModel] = useState(getDefaultModelId());
  const [selectedProduct, setSelectedProduct] = useState<string | null>(null);
  const [productAnalytics, setProductAnalytics] = useState<ProductAnalytics | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  const canSubmit = useMemo(() => transcript.trim().length > 0 && !isLoading, [transcript, isLoading]);
  
  // Helper to get model info
  const getModelInfo = (modelId: string): { name: string; description: string } | null => {
    for (const provider of Object.values(MODEL_PROVIDERS)) {
      const models = provider.models as Record<string, { name: string; description: string }>;
      if (modelId in models) {
        return models[modelId];
      }
    }
    return null;
  };

  const renderTextWithProductLinks = (text: string, products: Array<{ id: string; name: string; score: number }> | undefined) => {
    if (!products || products.length === 0) return text;
    
    // Create a regex pattern that matches any of the product names
    const productNames = products.map(p => p.name);
    const pattern = new RegExp(`(${productNames.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    
    const parts = text.split(pattern);
    
    return parts.map((part, index) => {
      const matchedProduct = products.find(p => p.name.toLowerCase() === part.toLowerCase());
      if (matchedProduct) {
        return (
          <button
            key={index}
            onClick={() => {
              setSelectedProduct(matchedProduct.name);
              fetchProductAnalytics(matchedProduct.name);
            }}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              color: '#6366f1',
              textDecoration: 'underline',
              cursor: 'pointer',
              font: 'inherit'
            }}
          >
            {part}
          </button>
        );
      }
      return part;
    });
  };

  const fetchProductAnalytics = async (productName: string) => {
    setLoadingAnalytics(true);
    try {
      const res = await fetch(`/api/analytics/products?product=${encodeURIComponent(productName)}&threshold=0.85`);
      const data = await res.json();
      const product = data.products.find((p: ProductAnalytics) => p.product === productName);
      setProductAnalytics(product || null);
    } catch (e) {
      console.error('Failed to fetch product analytics:', e);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    setTranscript(text);
    setError(null);
  };

  const analyze = async (inputText?: string) => {
    const tx = (inputText ?? transcript).trim();
    if (tx.length < 10) {
      setError('Please enter at least 10 characters.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: tx, model })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed');
      setResult(data as Result);
    } catch (e: any) {
      setError(e?.message || 'Unexpected error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>Post Call Analysis</h1>
      <p style={{ color: '#555', marginBottom: 16 }}>Upload a transcript (.txt) or paste below.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          analyze();
        }}
      >
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
          <input type="file" accept=".txt" onChange={(e) => onFile(e.target.files?.[0])} />
          <button type="submit" disabled={isLoading} style={{ padding: '8px 12px' }}>
            {isLoading ? 'Analyzing…' : 'Analyze'}
          </button>
          {transcript.trim().length > 0 && transcript.trim().length < 10 && !isLoading && (
            <span style={{ color: '#6b7280', fontSize: 12 }}>Min 10 characters</span>
          )}
          <select 
            value={model} 
            onChange={(e) => setModel(e.target.value)}
            style={{
              marginLeft: 8,
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid #e5e7eb',
              backgroundColor: 'white',
              fontSize: 14,
              cursor: 'pointer'
            }}
            title="Select AI model for analysis"
          >
            {Object.entries(MODEL_PROVIDERS).map(([providerId, provider]) => (
              <optgroup key={providerId} label={provider.name}>
                {Object.entries(provider.models).map(([modelId, modelInfo]) => (
                  <option key={modelId} value={modelId}>
                    {modelInfo.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        {model && getModelInfo(model) && (
          <div style={{ 
            fontSize: 12, 
            color: '#6b7280', 
            marginBottom: 8,
            textAlign: 'center'
          }}>
            {getModelInfo(model)?.description}
          </div>
        )}

        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              analyze();
            }
          }}
          placeholder="Paste transcript text here"
          rows={12}
          style={{ width: '100%', padding: 12, fontFamily: 'ui-monospace, SFMono-Regular', marginBottom: 16 }}
        />
        <div style={{ color: '#6b7280', fontSize: 12, marginTop: -8, marginBottom: 16 }}>
          Press ⌘ Enter (Mac) or Ctrl Enter to analyze
        </div>
      </form>

      {error && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: 12, borderRadius: 6, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {result && (
        <section style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <Info label="Call Type" value={result.callType} />
            <Info label="Success" value={result.successCategory} />
            <Info label="Intent" value={result.intent} />
            <Info label="Intent Category" value={result.intentCategory} />
            <Info label="Confidence" value={`${Math.round(result.confidence * 100)}%`} />
            {result.escalationReason && <Info label="Escalation Reason" value={result.escalationReason} />}
          </div>
          
          {result._timings && (
            <div style={{ 
              marginBottom: 12, 
              padding: '8px 12px', 
              backgroundColor: '#f3f4f6', 
              borderRadius: 6,
              fontSize: 14
            }}>
              <span style={{ color: '#6b7280' }}>Analysis time: </span>
              <span style={{ fontWeight: 600 }}>{(result._timings.total / 1000).toFixed(2)}s</span>
              <span style={{ color: '#6b7280', fontSize: 12, marginLeft: 8 }}>
                (AI: {(result._timings.ai_analysis / 1000).toFixed(2)}s, 
                 Pinecone: {((result._timings.pinecone_search + result._timings.pinecone_upsert) / 1000).toFixed(2)}s)
              </span>
            </div>
          )}
          <h3 style={{ fontWeight: 600, marginBottom: 6 }}>Summary</h3>
          <p style={{ marginBottom: 12 }}>{renderTextWithProductLinks(result.summary, result.products)}</p>
          <h3 style={{ fontWeight: 600, marginBottom: 6 }}>Key Points</h3>
          <ul style={{ paddingLeft: 18, marginBottom: 12 }}>
            {result.keyPoints.map((k, i) => (
              <li key={i}>{renderTextWithProductLinks(k, result.products)}</li>
            ))}
          </ul>
          {result.actionItems.length > 0 && (
            <>
              <h3 style={{ fontWeight: 600, marginBottom: 6 }}>Action Items</h3>
              <ul style={{ paddingLeft: 18 }}>
                {result.actionItems.map((k, i) => (
                  <li key={i}>{renderTextWithProductLinks(k, result.products)}</li>
                ))}
              </ul>
            </>
          )}

          {result.products && result.products.length > 0 && (
            <>
              <h3 style={{ fontWeight: 600, margin: '12px 0 6px' }}>Products Mentioned</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginLeft: 18 }}>
                {result.products.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setSelectedProduct(p.name);
                      fetchProductAnalytics(p.name);
                    }}
                    style={{
                      padding: '4px 12px',
                      backgroundColor: '#e9d5ff',
                      color: '#6b21a8',
                      borderRadius: '9999px',
                      fontSize: '14px',
                      border: 'none',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s'
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#d8b4fe'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#e9d5ff'}
                  >
                    {p.name} ({Math.round(p.score * 100)}%)
                  </button>
                ))}
              </div>
            </>
          )}

          {result.pineconeRecordId && (
            <>
              <h3 style={{ fontWeight: 600, margin: '12px 0 6px' }}>Pinecone Record</h3>
              <p style={{ marginLeft: 18, fontFamily: 'monospace', fontSize: '14px', color: '#6366f1' }}>
                ID: {result.pineconeRecordId}
              </p>
            </>
          )}

          {result.keywords && result.keywords.length > 0 && (
            <>
              <h3 style={{ fontWeight: 600, margin: '12px 0 6px' }}>Keywords</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {result.keywords.map((k, i) => (
                  <span key={i} style={{ background: '#f3f4f6', padding: '4px 8px', borderRadius: 999 }}>{k.term}</span>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* Product Analytics Modal */}
      {selectedProduct && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50
          }}
          onClick={() => setSelectedProduct(null)}
        >
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '600px',
              width: '90%',
              maxHeight: '80vh',
              overflow: 'auto',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: '24px', fontWeight: 'bold' }}>
                {selectedProduct} Analytics
              </h2>
              <button
                onClick={() => setSelectedProduct(null)}
                style={{
                  width: '32px',
                  height: '32px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '4px',
                  border: 'none',
                  backgroundColor: '#f3f4f6',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>

            {loadingAnalytics ? (
              <p>Loading analytics...</p>
            ) : productAnalytics ? (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Overview</h3>
                  <p>Total Calls: {productAnalytics.totalCalls}</p>
                  <p>Success Rate: {productAnalytics.successRate}</p>
                  {productAnalytics.partialSuccessRate !== '0.0%' && (
                    <p>Partial Success Rate: {productAnalytics.partialSuccessRate}</p>
                  )}
                  <p>Failure Rate: {productAnalytics.failureRate}</p>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Top Intents</h3>
                  <ul style={{ paddingLeft: 18 }}>
                    {productAnalytics.topIntents.slice(0, 5).map((intent, i) => (
                      <li key={i}>
                        {intent.intent} ({intent.category}) - {intent.count} calls
                      </li>
                    ))}
                  </ul>
                </div>

                <div style={{ marginBottom: 16 }}>
                  <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Outcomes</h3>
                  <ul style={{ paddingLeft: 18 }}>
                    {Object.entries(productAnalytics.outcomes).map(([outcome, count]) => (
                      <li key={outcome}>
                        {outcome}: {count} calls
                      </li>
                    ))}
                  </ul>
                </div>

                {productAnalytics.recordsByOutcome && (
                  <div>
                    <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Sample Calls by Outcome</h3>
                    {Object.entries(productAnalytics.recordsByOutcome).map(([outcome, records]) => (
                      <div key={outcome} style={{ marginBottom: 12 }}>
                        <h4 style={{ fontWeight: 500, marginBottom: 4 }}>{outcome}:</h4>
                        <ul style={{ paddingLeft: 18, fontSize: '14px' }}>
                          {records.slice(0, 3).map((record) => (
                            <li key={record.id}>
                              Intent: {record.intent} | Type: {record.callType} | 
                              <span style={{ marginLeft: 4, color: '#6366f1', fontFamily: 'monospace', fontSize: '12px' }}>
                                {record.id.slice(0, 8)}...
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <p>No analytics data available for this product.</p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <span style={{ fontSize: 12, color: '#6b7280' }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 600 }}>{value}</span>
    </div>
  );
}

