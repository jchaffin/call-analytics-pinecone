"use client";

import { useEffect, useState } from 'react';

type ProductAnalytics = {
  product: string;
  totalCalls: number;
  successRate: string;
  partialSuccessRate: string;
  failureRate: string;
  topIntents: Array<{ intent: string; category: string; count: number }>;
  outcomes: Record<string, number>;
  callTypes: Record<string, number>;
  recordsByOutcome: Record<string, Array<{
    id: string;
    intent: string;
    outcome: string;
    callType: string;
  }>>;
  pineconeLinks: Array<{
    id: string;
    intent: string;
    outcome: string;
    callType: string;
    snippet?: string;
  }>;
};

export default function AnalyticsPage() {
  const [data, setData] = useState<{
    totalProducts: number;
    totalRecords: number;
    products: ProductAnalytics[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/analytics/products')
      .then(res => res.json())
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 24 }}>Loading analytics...</div>;
  if (error) return <div style={{ padding: 24, color: '#991b1b' }}>Error: {error}</div>;
  if (!data) return <div style={{ padding: 24 }}>No data available</div>;

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>Product Analytics</h1>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 32 }}>
        <div style={{ background: '#f3f4f6', padding: 16, borderRadius: 8 }}>
          <div style={{ fontSize: 14, color: '#6b7280' }}>Total Products</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{data.totalProducts}</div>
        </div>
        <div style={{ background: '#f3f4f6', padding: 16, borderRadius: 8 }}>
          <div style={{ fontSize: 14, color: '#6b7280' }}>Total Calls Analyzed</div>
          <div style={{ fontSize: 24, fontWeight: 700 }}>{data.totalRecords}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 24 }}>
        {data.products.map((product) => (
          <div key={product.product} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 20 }}>
            <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 16 }}>{product.product}</h2>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 14, color: '#6b7280' }}>Total Calls</div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>{product.totalCalls}</div>
              </div>
              <div>
                <div style={{ fontSize: 14, color: '#6b7280' }}>Success Rate</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#059669' }}>{product.successRate}%</div>
              </div>
              <div>
                <div style={{ fontSize: 14, color: '#6b7280' }}>Partial Success</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#d97706' }}>{product.partialSuccessRate}%</div>
              </div>
              <div>
                <div style={{ fontSize: 14, color: '#6b7280' }}>Failure Rate</div>
                <div style={{ fontSize: 18, fontWeight: 600, color: '#dc2626' }}>{product.failureRate}%</div>
              </div>
            </div>

            <div style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Top Customer Intents</h3>
              <div style={{ display: 'grid', gap: 6 }}>
                {product.topIntents.map((intent, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0' }}>
                    <div>
                      <span style={{ fontWeight: 500 }}>{intent.intent}</span>
                      <span style={{ color: '#6b7280', fontSize: 14, marginLeft: 8 }}>({intent.category})</span>
                    </div>
                    <span style={{ 
                      background: '#e5e7eb', 
                      padding: '2px 8px', 
                      borderRadius: 12, 
                      fontSize: 12,
                      fontWeight: 600
                    }}>
                      {intent.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: '#6b7280' }}>Outcomes</h3>
                <div style={{ fontSize: 14 }}>
                  {Object.entries(product.outcomes).map(([outcome, count]) => (
                    <div key={outcome} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span>{outcome}:</span>
                      <span style={{ fontWeight: 600 }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, color: '#6b7280' }}>Call Types</h3>
                <div style={{ fontSize: 14 }}>
                  {Object.entries(product.callTypes).map(([type, count]) => (
                    <div key={type} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span>{type}:</span>
                      <span style={{ fontWeight: 600 }}>{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Call Records by Outcome</h3>
              {Object.entries(product.recordsByOutcome).map(([outcome, records]) => (
                records.length > 0 && (
                  <div key={outcome} style={{ marginBottom: 16 }}>
                    <h4 style={{ 
                      fontSize: 14, 
                      fontWeight: 600, 
                      marginBottom: 8,
                      color: outcome === 'Successful' ? '#059669' : outcome === 'Partially Successful' ? '#d97706' : '#dc2626'
                    }}>
                      {outcome} ({records.length})
                    </h4>
                    <div style={{ display: 'grid', gap: 8 }}>
                      {records.slice(0, 3).map((record) => (
                        <div 
                          key={record.id} 
                          style={{ 
                            background: '#f9fafb', 
                            padding: 12, 
                            borderRadius: 6,
                            fontSize: 13,
                            border: '1px solid #e5e7eb'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                            <span style={{ fontWeight: 600 }}>{record.intent}</span>
                            <span style={{ 
                              background: '#e5e7eb', 
                              padding: '2px 6px', 
                              borderRadius: 4, 
                              fontSize: 11 
                            }}>
                              {record.callType}
                            </span>
                          </div>
                          <div style={{ fontSize: 11, color: '#6b7280' }}>
                            ID: {record.id.substring(0, 8)}...
                          </div>
                        </div>
                      ))}
                      {records.length > 3 && (
                        <div style={{ fontSize: 12, color: '#6b7280', textAlign: 'center' }}>
                          +{records.length - 3} more records
                        </div>
                      )}
                    </div>
                  </div>
                )
              ))}
            </div>
          </div>
        ))}
      </div>

      {data.products.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48, color: '#6b7280' }}>
          No product data found. Analyze some calls first to see product analytics.
        </div>
      )}
    </main>
  );
}
