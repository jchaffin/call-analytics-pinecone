"use client";

import { useEffect, useState } from 'react';

type IntentCluster = {
  primary: string;
  count: number;
  members: Array<{ intent: string; count: number }>;
  variations: number;
};

type ClustersData = {
  totalIntents: number;
  totalClusters: number;
  avgIntentsPerCluster: string;
  threshold: number;
  clusters: IntentCluster[];
};

export default function IntentClustersPage() {
  const [data, setData] = useState<ClustersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [threshold, setThreshold] = useState(0.7);
  const [pendingThreshold, setPendingThreshold] = useState(0.7);

  const fetchClusters = async (similarityThreshold: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/intent?threshold=${similarityThreshold}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to fetch clusters');
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClusters(threshold);
  }, [threshold]);

  const handleThresholdChange = () => {
    setThreshold(pendingThreshold);
  };

  if (loading) return <div style={{ padding: 24 }}>Loading intent clusters...</div>;
  if (error) return <div style={{ padding: 24, color: '#991b1b' }}>Error: {error}</div>;
  if (!data) return <div style={{ padding: 24 }}>No data available</div>;

  return (
    <main style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>Intent Clusters</h1>
      
      <div style={{ marginBottom: 24, padding: 16, background: '#f3f4f6', borderRadius: 8 }}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4, fontSize: 14, fontWeight: 600 }}>
            Similarity Threshold: {pendingThreshold.toFixed(2)}
          </label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="range"
              min="0.5"
              max="0.95"
              step="0.05"
              value={pendingThreshold}
              onChange={(e) => setPendingThreshold(parseFloat(e.target.value))}
              style={{ flex: 1 }}
            />
            <button
              onClick={handleThresholdChange}
              disabled={pendingThreshold === threshold}
              style={{
                padding: '6px 12px',
                background: pendingThreshold === threshold ? '#9ca3af' : '#4f46e5',
                color: 'white',
                border: 'none',
                borderRadius: 4,
                cursor: pendingThreshold === threshold ? 'not-allowed' : 'pointer',
              }}
            >
              Apply
            </button>
          </div>
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>
            Lower values group more intents together
          </div>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <div>
            <div style={{ fontSize: 14, color: '#6b7280' }}>Unique Intents</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{data.totalIntents}</div>
          </div>
          <div>
            <div style={{ fontSize: 14, color: '#6b7280' }}>Clusters</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{data.totalClusters}</div>
          </div>
          <div>
            <div style={{ fontSize: 14, color: '#6b7280' }}>Avg per Cluster</div>
            <div style={{ fontSize: 24, fontWeight: 700 }}>{data.avgIntentsPerCluster}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 16 }}>
        {data.clusters.map((cluster, index) => (
          <div
            key={index}
            style={{
              border: '1px solid #e5e7eb',
              borderRadius: 8,
              padding: 16,
              background: cluster.variations > 1 ? '#f0fdf4' : 'white'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <h3 style={{ fontSize: 18, fontWeight: 600 }}>{cluster.primary}</h3>
              <div style={{ display: 'flex', gap: 12, fontSize: 14 }}>
                <span style={{ color: '#6b7280' }}>
                  {cluster.count} {cluster.count === 1 ? 'call' : 'calls'}
                </span>
                <span style={{ 
                  color: cluster.variations > 1 ? '#15803d' : '#6b7280',
                  fontWeight: cluster.variations > 1 ? 600 : 400
                }}>
                  {cluster.variations} {cluster.variations === 1 ? 'variant' : 'variants'}
                </span>
              </div>
            </div>
            
            {cluster.variations > 1 && (
              <div style={{ paddingLeft: 16, borderLeft: '3px solid #86efac' }}>
                {cluster.members.map((member, idx) => (
                  <div 
                    key={idx}
                    style={{ 
                      marginBottom: 4, 
                      fontSize: 14,
                      color: member.intent === cluster.primary ? '#000' : '#4b5563'
                    }}
                  >
                    <span style={{ fontWeight: member.intent === cluster.primary ? 600 : 400 }}>
                      {member.intent}
                    </span>
                    <span style={{ color: '#9ca3af', marginLeft: 8 }}>
                      ({member.count})
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
