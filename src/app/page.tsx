"use client";

import React, { useMemo, useState, useEffect } from 'react';
import { MODEL_PROVIDERS, getDefaultModelId } from '@/lib/ai';

type Result = {
  analysisTime: number;
  callType: 'Automated' | 'Escalated';
  successCategory: 'Successful' | 'Partially Successful' | 'Unsuccessful';
  intent: string;
  intentCategory: string;
  confidence: number;
  summary: string;
  keyPoints: string[];
  actionItems: string[];
  escalationReason?: string;
  products?: { id: string; name: string; score: number; brand?: string; category?: string }[];
  keywords?: { term: string; score: number }[];
  orderNumbers?: string[];
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

type BatchResult = {
  success: boolean;
  modelId: string;
  result: Result | null;
  error: string | null;
  modelInfo: {
    provider: string;
    name: string;
  };
};

type BatchAnalysis = {
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
  resultsByProvider: Record<string, BatchResult[]>;
  results: BatchResult[];
  processingTime: number;
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
  const [batchResult, setBatchResult] = useState<BatchAnalysis | null>(null);
  const [isBatchLoading, setIsBatchLoading] = useState(false);
  const [sortByTime, setSortByTime] = useState<'asc' | 'desc' | null>(null);

  const canSubmit = useMemo(() => transcript.trim().length > 0 && !isLoading, [transcript, isLoading]);

  // Sort batch results by analysis time
  const sortedBatchResults = useMemo(() => {
    if (!batchResult || !sortByTime) return batchResult?.results || [];

    return [...batchResult.results].sort((a, b) => {
      const timeA = a.result?.analysisTime || 0;
      const timeB = b.result?.analysisTime || 0;

      if (sortByTime === 'asc') {
        return timeA - timeB;
      } else {
        return timeB - timeA;
      }
    });
  }, [batchResult, sortByTime]);

  const handleTimeSort = () => {
    setSortByTime(current => {
      if (current === null) return 'asc';
      if (current === 'asc') return 'desc';
      return null;
    });
  };
  
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

  const renderTextWithProductLinks = (text: string, products: Array<{ id: string; name: string; score: number; brand?: string; category?: string }> | undefined) => {
    if (!products || products.length === 0) return text;

    // Create a more flexible matching approach
    // We'll look for sequences of words that match product components
    const result: (string | React.JSX.Element)[] = [];
    const words = text.split(/\s+/);
    let i = 0;

    while (i < words.length) {
      let matchedProduct = null;
      let matchLength = 0;

      // Try to match increasingly longer sequences of words
      for (let len = Math.min(words.length - i, 5); len >= 1; len--) {
        const phrase = words.slice(i, i + len).join(' ');
        matchedProduct = products.find(p => {
          const productName = p.name.toLowerCase();
          const phraseLower = phrase.toLowerCase();

          // Exact match
          if (productName === phraseLower) return true;

          // Product name contains the phrase
          if (productName.includes(phraseLower)) return true;

          // Phrase contains the product name
          if (phraseLower.includes(productName)) return true;

          // Check individual words - if most words in phrase are in product name
          const phraseWords = phraseLower.split(/\s+/);
          const productWords = productName.split(/\s+/);
          const matchingWords = phraseWords.filter(word =>
            productWords.some(pWord => pWord.includes(word) || word.includes(pWord))
          );

          return matchingWords.length >= Math.min(phraseWords.length, productWords.length) * 0.8;
        });

        if (matchedProduct) {
          matchLength = len;
          break;
        }
      }

      if (matchedProduct && matchLength > 0) {
        const matchedText = words.slice(i, i + matchLength).join(' ');
        result.push(
          <button
            key={i}
            onClick={() => {
              setSelectedProduct(matchedProduct.name);
              fetchProductAnalytics(matchedProduct.name);
            }}
            className="bg-none border-none p-0 text-indigo-500 underline cursor-pointer font-inherit"
            title={`View analytics for ${matchedProduct.name}`}
          >
            {matchedText}
          </button>
        );
        i += matchLength;
      } else {
        result.push(words[i]);
        i++;
      }

      // Add space between words (except for the last element)
      if (i < words.length) {
        result.push(' ');
      }
    }

    return result;
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
    console.log('File selected:', file.name, 'size:', file.size);
    const text = await file.text();
    console.log('File content length:', text.length);
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
      console.log('Starting analysis for text length:', tx.length);
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: tx, model })
      });
      console.log('API response status:', res.status);
      const data = await res.json();
      console.log('API response data:', data);

      if (!res.ok) throw new Error(data?.error || 'Failed');

      // Check if response contains error
      if (data.error) {
        throw new Error(data.error);
      }

      // Basic validation that we have the expected result structure
      if (!data.callType || !data.successCategory || !data.intent) {
        throw new Error('Invalid response format from server');
      }

      console.log('Setting result...');
      setResult(data as Result);
      console.log('Result set successfully');
    } catch (e: any) {
      console.error('Analysis error:', e);
      setError(e?.message || 'Unexpected error');
    } finally {
      console.log('Setting loading to false');
      setIsLoading(false);
    }
  };

  const batchAnalyze = async (inputText?: string) => {
    const tx = (inputText ?? transcript).trim();
    if (tx.length < 10) {
      setError('Please enter at least 10 characters.');
      return;
    }
    setIsBatchLoading(true);
    setError(null);
    setBatchResult(null);
    try {
      console.log('Starting batch analysis for text length:', tx.length);
      const res = await fetch('/api/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: tx })
      });
      console.log('Batch API response status:', res.status);
      const data = await res.json();
      console.log('Batch API response data:', data);

      if (!res.ok) throw new Error(data?.error || 'Failed');

      // Check if response contains error
      if (data.error) {
        throw new Error(data.error);
      }

      console.log('Setting batch result...');
      setBatchResult(data as BatchAnalysis);
      console.log('Batch result set successfully');
    } catch (e: any) {
      console.error('Batch analysis error:', e);
      setError(e?.message || 'Unexpected error');
    } finally {
      console.log('Setting batch loading to false');
      setIsBatchLoading(false);
    }
  };

  return (
    <main className="max-w-5xl mx-auto p-6">
      <h1 className="text-4xl font-bold mb-2">Post Call Analysis</h1>
      <p className="text-gray-500 mb-6">
        Upload a transcript (.txt) or paste below.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          analyze();
        }}
        className="mb-6"
      >
        <div className="flex gap-3 items-center mb-3">
          <input
            type="file"
            accept=".txt"
            onChange={(e) => onFile(e.target.files?.[0])}
            id="file-upload"
            className="hidden"
          />
          <label htmlFor="file-upload" className="file-input">
            Choose File
          </label>
          <button
            type="submit"
            disabled={isLoading || isBatchLoading}
            className={`px-6 py-3 text-white rounded-lg text-base font-semibold ${
              isLoading || isBatchLoading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 cursor-pointer'
            }`}
          >
            {isLoading ? 'Analyzing...' : 'Analyze'}
          </button>
          <button
            type="button"
            disabled={isLoading || isBatchLoading}
            onClick={() => batchAnalyze()}
            className={`px-6 py-3 text-white rounded-lg text-base font-semibold ${
              isLoading || isBatchLoading
                ? 'bg-gray-400 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700 cursor-pointer'
            }`}
          >
            {isBatchLoading ? 'Batch Analyzing...' : 'Batch Analyze'}
          </button>
          {transcript.trim().length > 0 && transcript.trim().length < 10 && !isLoading && (
            <span className="text-gray-500 text-xs">Min 10 characters</span>
          )}
          <select
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="ml-2 px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm cursor-pointer"
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
          <div className="text-xs text-gray-500 mb-2 text-center">
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
          placeholder="Enter call transcript here..."
          className="w-full min-h-36 p-3 border border-gray-300 rounded-lg text-sm font-inherit resize-vertical mb-4"
        />
        <div className="text-gray-500 text-xs -mt-2 mb-4">
          Press ⌘ Enter (Mac) or Ctrl Enter to analyze
        </div>
      </form>

      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4">
          {error}
        </div>
      )}

      {result && (
        <>
          <div className="bg-gray-100 p-4 rounded-lg mb-6">
            <h2 className="text-xl font-semibold mb-3">Analysis Results</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
              <div>
                <div className="text-sm text-gray-500">Call Type</div>
                <div className="text-lg font-semibold">{result.callType}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Success Category</div>
                <div className="text-lg font-semibold">{result.successCategory}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Intent</div>
                <div className="text-lg font-semibold">{result.intent}</div>
              </div>
              <div>
                <div className="text-sm text-gray-500">Confidence</div>
                <div className="text-lg font-semibold">{Math.round(result.confidence * 100)}%</div>
              </div>
              {result.escalationReason && (
                <div>
                  <div className="text-sm text-gray-500">Escalation Reason</div>
                  <div className="text-sm font-medium">{result.escalationReason}</div>
                </div>
              )}
            </div>

            {result._timings && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="text-sm font-medium text-blue-800 mb-1">Analysis Time</div>
                <div className="text-sm text-blue-700">
                  Total: {(result._timings.total / 1000).toFixed(2)}s |
                  AI: {(result._timings.ai_analysis / 1000).toFixed(2)}s |
                  Pinecone: {((result._timings.pinecone_search + result._timings.pinecone_upsert) / 1000).toFixed(2)}s
                </div>
              </div>
            )}
          </div>

          <div className="mt-6">
            <h3 className="font-semibold mb-1.5">Summary</h3>
            <p className="mb-3">{renderTextWithProductLinks(result.summary, result.products)}</p>
            <h3 className="font-semibold mb-1.5">Key Points</h3>
            <ul className="pl-4 mb-3">
              {result.keyPoints.map((k, i) => (
                <li key={i}>{renderTextWithProductLinks(k, result.products)}</li>
              ))}
            </ul>
            {result.actionItems.length > 0 && (
              <>
                <h3 className="font-semibold mb-1.5">Action Items</h3>
                <ul className="pl-4">
                  {result.actionItems.map((k, i) => (
                    <li key={i}>{renderTextWithProductLinks(k, result.products)}</li>
                  ))}
                </ul>
              </>
            )}

          {result.products && result.products.length > 0 && (
            <>
              <h3 className="font-semibold my-3">Products Mentioned</h3>
              <div className="flex flex-wrap gap-2 ml-4">
                {result.products.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setSelectedProduct(p.name);
                      fetchProductAnalytics(p.name);
                    }}
                    className="px-3 py-1 bg-purple-200 text-purple-800 rounded-full text-sm border-none cursor-pointer hover:bg-purple-300 transition-colors duration-200"
                    title={`${p.brand ? `${p.brand} ` : ''}${p.name}${p.category ? ` (${p.category})` : ''}`}
                  >
                    {p.brand ? `${p.brand} ${p.name}` : p.name} ({Math.round(p.score * 100)}%)
                  </button>
                ))}
              </div>
            </>
          )}

          {result.pineconeRecordId && (
            <>
              <h3 className="font-semibold my-3">Pinecone Record</h3>
              <p className="ml-4 font-mono text-sm text-indigo-500">
                ID: {result.pineconeRecordId}
              </p>
            </>
          )}

          {result.keywords && result.keywords.length > 0 && (
            <>
              <h3 className="font-semibold my-3">Keywords</h3>
              <div className="flex flex-wrap gap-2">
                {result.keywords.map((k, i) => (
                  <span key={i} className="bg-gray-100 px-2 py-1 rounded-full">{k.term}</span>
                ))}
              </div>
            </>
          )}

          {result.orderNumbers && result.orderNumbers.length > 0 && (
            <>
              <h3 className="font-semibold my-3">Order Numbers</h3>
              <div className="flex flex-wrap gap-2">
                {result.orderNumbers.map((orderNum, i) => (
                  <span key={i} className="bg-green-100 text-green-800 px-3 py-1 rounded-full font-mono text-sm">
                    {orderNum}
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
        </>
      )}

      {batchResult && (
        <div className="mt-8">
          <h2 className="text-2xl font-bold mb-4">Batch Analysis Results</h2>

          {/* Consensus Summary */}
          <div className="bg-blue-50 p-4 rounded-lg mb-6">
            <h3 className="text-lg font-semibold mb-2">Consensus Analysis</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-gray-600">Call Type</div>
                <div className="font-semibold">{batchResult.consensus.callType}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Success Category</div>
                <div className="font-semibold">{batchResult.consensus.successCategory}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Primary Intent</div>
                <div className="font-semibold">{batchResult.consensus.intent}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600">Total Votes</div>
                <div className="font-semibold">{batchResult.consensus.totalVotes}</div>
              </div>
            </div>
            <div className="mt-2 text-sm text-gray-600">
              Processed {batchResult.totalModels} models • {batchResult.successfulAnalyses} successful • {batchResult.failedAnalyses} failed • {(batchResult.processingTime / 1000).toFixed(2)}s total
            </div>
          </div>

          {/* Results Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse border border-gray-300">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-4 py-2 text-left">Model</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">Provider</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">Status</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">Call Type</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">Success</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">Intent</th>
                  <th className="border border-gray-300 px-4 py-2 text-left">Confidence</th>
                  <th
                    className="border border-gray-300 px-4 py-2 text-left cursor-pointer hover:bg-gray-100 select-none"
                    onClick={handleTimeSort}
                  >
                    Time (s)
                    {sortByTime === 'asc' && ' ↑'}
                    {sortByTime === 'desc' && ' ↓'}
                  </th>
                  <th className="border border-gray-300 px-4 py-2 text-left">Error</th>
                </tr>
              </thead>
              <tbody>
                {sortedBatchResults.map((result, index) => (
                  <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="border border-gray-300 px-4 py-2 font-mono text-sm">
                      {result.modelInfo.name}
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      {result.modelInfo.provider}
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${
                        result.success
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {result.success ? 'Success' : 'Failed'}
                      </span>
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      {result.result?.callType || '-'}
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      {result.result?.successCategory || '-'}
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-sm">
                      {result.result?.intent || '-'}
                    </td>
                    <td className="border border-gray-300 px-4 py-2">
                      {result.result ? `${Math.round(result.result.confidence * 100)}%` : '-'}
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-right">
                      {result.result ? `${((result.result.analysisTime || 0) / 1000).toFixed(2)}` : '-'}
                    </td>
                    <td className="border border-gray-300 px-4 py-2 text-sm text-red-600">
                      {result.error || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Product Analytics Modal */}
      {selectedProduct && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          onClick={() => setSelectedProduct(null)}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-2xl w-11/12 max-h-4/5 overflow-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold">
                {selectedProduct} Analytics
              </h2>
              <button
                onClick={() => setSelectedProduct(null)}
                className="w-8 h-8 flex items-center justify-center rounded border-none bg-gray-100 cursor-pointer hover:bg-gray-200"
              >
                ✕
              </button>
            </div>

            {loadingAnalytics ? (
              <p>Loading analytics...</p>
            ) : productAnalytics ? (
              <div>
                <div className="mb-4">
                  <h3 className="font-semibold mb-2">Overview</h3>
                  <p>Total Calls: {productAnalytics.totalCalls}</p>
                  <p>Success Rate: {productAnalytics.successRate}</p>
                  {productAnalytics.partialSuccessRate !== '0.0%' && (
                    <p>Partial Success Rate: {productAnalytics.partialSuccessRate}</p>
                  )}
                  <p>Failure Rate: {productAnalytics.failureRate}</p>
                </div>

                <div className="mb-4">
                  <h3 className="font-semibold mb-2">Top Intents</h3>
                  <ul className="pl-4">
                    {productAnalytics.topIntents.slice(0, 5).map((intent, i) => (
                      <li key={i}>
                        {intent.intent} ({intent.category}) - {intent.count} calls
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mb-4">
                  <h3 className="font-semibold mb-2">Outcomes</h3>
                  <ul className="pl-4">
                    {Object.entries(productAnalytics.outcomes).map(([outcome, count]) => (
                      <li key={outcome}>
                        {outcome}: {count} calls
                      </li>
                    ))}
                  </ul>
                </div>

                {productAnalytics.recordsByOutcome && (
                  <div>
                    <h3 className="font-semibold mb-2">Sample Calls by Outcome</h3>
                    {Object.entries(productAnalytics.recordsByOutcome).map(([outcome, records]) => (
                      <div key={outcome} className="mb-3">
                        <h4 className="font-medium mb-1">{outcome}:</h4>
                        <ul className="pl-4 text-sm">
                          {records.slice(0, 3).map((record) => (
                            <li key={record.id}>
                              Intent: {record.intent} | Type: {record.callType} |
                              <span className="ml-1 text-indigo-500 font-mono text-xs">
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
    <div className="flex flex-col">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}

