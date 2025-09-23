"use client";

import { useEffect, useState } from 'react';

type ProductAnalytics = {
  product: string;
  variants?: Array<{ name: string; count: number }>;
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
    fetch('/api/analytics/products?threshold=0.85')
      .then(res => res.json())
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading analytics...</div>;
  if (error) return <div className="error">Error: {error}</div>;
  if (!data) return <div className="loading">No data available</div>;

  

  return (
    <main className="container-main">
      <h1 className="page-title">Product Analytics</h1>
      
      <div className="stats-grid">
        <div className="card-muted">
          <div className="muted">Total Products</div>
          <div className="value-lg">{data.totalProducts}</div>
        </div>
        <div className="card-muted">
          <div className="muted">Total Calls Analyzed</div>
          <div className="value-lg">{data.totalRecords}</div>
        </div>
      </div>

      <div className="products-grid">
        {data.products.map((product) => (
          <div key={product.product} className="product-card">
            <div className="mb-16">
              <h2 className="h2">{product.product}</h2>
              {product.variants && product.variants.length > 1 && (
                <div className="variants">
                  <span className="muted" style={{ marginRight: 8 }}>Product variants:</span>
                  {product.variants.map((variant, idx) => (
                    <span
                      key={idx}
                      className={`variant-pill ${variant.name === product.product ? 'active' : ''}`}
                    >
                      {variant.name} ({variant.count})
                    </span>
                  ))}
                </div>
              )}
            </div>
            
            <div className="metrics-grid">
              <div>
                <div className="metric-label">Total Calls</div>
                <div className="metric-value">{product.totalCalls}</div>
              </div>
              <div>
                <div className="metric-label">Success Rate</div>
                <div className="metric-value metric-success">{product.successRate}%</div>
              </div>
              <div>
                <div className="metric-label">Partial Success</div>
                <div className="metric-value metric-partial">{product.partialSuccessRate}%</div>
              </div>
              <div>
                <div className="metric-label">Failure Rate</div>
                <div className="metric-value metric-fail">{product.failureRate}%</div>
              </div>
            </div>

            <div className="section">
              <h3 className="section-title">Top Customer Intents</h3>
              <div className="list-grid">
                {product.topIntents.map((intent, i) => (
                  <div key={i} className="list-row">
                    <div>
                      <span className="font-medium">{intent.intent}</span>
                      <span className="muted" style={{ marginLeft: 8 }}>({intent.category})</span>
                    </div>
                    <span className="pill-count">
                      {intent.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="info-grid">
              <div>
                <h3 className="info-title">Outcomes</h3>
                <div className="info-text">
                  {Object.entries(product.outcomes).map(([outcome, count]) => (
                    <div key={outcome} className="info-row">
                      <span>{outcome}:</span>
                      <span className="font-semibold">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="info-title">Call Types</h3>
                <div className="info-text">
                  {Object.entries(product.callTypes).map(([type, count]) => (
                    <div key={type} className="info-row">
                      <span>{type}:</span>
                      <span className="font-semibold">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <h3 className="record-section-title">Call Records by Outcome</h3>
              {Object.entries(product.recordsByOutcome).map(([outcome, records]) => (
                records.length > 0 && (
                  <div key={outcome} className="record-block">
                    <h4 className={`record-heading ${outcome === 'Successful' ? 'text-success' : outcome === 'Partially Successful' ? 'text-partial' : 'text-fail'}`}>
                      {outcome} ({records.length})
                    </h4>
                    <div className="record-list">
                      {records.slice(0, 3).map((record) => (
                        <div key={record.id} className="record-card">
                          <div className="record-card-header">
                            <span className="font-semibold">{record.intent}</span>
                            <span className="record-badge">{record.callType}</span>
                          </div>
                          <div className="record-id">ID: {record.id.substring(0, 8)}...</div>
                        </div>
                      ))}
                      {records.length > 3 && (
                        <div className="more">+{records.length - 3} more records</div>
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
        <div className="empty-state">No product data found. Analyze some calls first to see product analytics.</div>
      )}
    </main>
  );
}
