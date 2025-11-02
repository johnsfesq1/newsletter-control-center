'use client';

import { useState } from 'react';
import Link from 'next/link';

interface SemanticResult {
  query: string;
  answer: string;
  citations: Array<{
    chunk_id: string;
    citation: string;
    publisher: string;
    date: any;
    subject: string;
  }>;
  chunks_used: number;
  cost_usd: number;
  chunks: Array<{
    chunk_id: string;
    subject: string;
    publisher: string;
    score: number;
  }>;
}

export default function SemanticSearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SemanticResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const searchSemantic = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError('');
    setResults(null);

    try {
      const response = await fetch('/api/intelligence/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Search failed');
      }

      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateInput: any) => {
    if (!dateInput) return 'Date unknown';
    
    if (dateInput && typeof dateInput === 'object' && dateInput.value) {
      try {
        return new Date(dateInput.value).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      } catch {
        return 'Date unknown';
      }
    }
    
    if (typeof dateInput === 'string') {
      try {
        return new Date(dateInput).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      } catch {
        return 'Date unknown';
      }
    }
    
    return 'Date unknown';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Semantic Newsletter Search</h1>
          <p className="text-gray-600">Ask questions and get intelligent answers from 69,673 newsletters</p>
        </div>

        {/* Search Form */}
        <form onSubmit={searchSemantic} className="bg-white p-6 rounded-lg shadow-md mb-6">
          <div className="flex gap-4">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a question... (e.g., 'What are the latest developments in AI regulation?')"
              className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="bg-white rounded-lg shadow-md p-8 text-center">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
              <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            </div>
            <p className="mt-4 text-gray-500">Searching 938,601 chunks...</p>
          </div>
        )}

        {/* Results */}
        {results && !loading && (
          <div className="space-y-6">
            {/* AI Answer */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Answer</h2>
              <div className="prose max-w-none text-gray-700 whitespace-pre-wrap">
                {results.answer}
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200 text-sm text-gray-500">
                Based on {results.chunks_used} relevant chunks • Cost: ${results.cost_usd.toFixed(4)}
              </div>
            </div>

            {/* Citations */}
            {results.citations && results.citations.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">Sources</h3>
                <div className="space-y-3">
                  {results.citations.map((citation, idx) => (
                    <div key={idx} className="border-l-4 border-blue-500 pl-4 py-2">
                      <div className="font-medium text-gray-900">{citation.citation}</div>
                      <div className="text-sm text-gray-500 mt-1">
                        {formatDate(citation.date)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top Chunks */}
            {results.chunks && results.chunks.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h3 className="text-xl font-semibold text-gray-900 mb-4">
                  Relevant Newsletters ({results.chunks.length})
                </h3>
                <div className="space-y-3">
                  {results.chunks.slice(0, 5).map((chunk, idx) => (
                    <div key={chunk.chunk_id} className="border border-gray-200 rounded p-3 hover:bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="font-medium text-gray-900">{chunk.subject}</div>
                          <div className="text-sm text-gray-500">{chunk.publisher}</div>
                        </div>
                        <div className="text-sm text-gray-400 ml-4">
                          {(chunk.score * 100).toFixed(0)}% match
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* No Results State */}
        {!loading && !results && !error && query && (
          <div className="bg-white p-6 rounded-lg shadow-md text-center">
            <p className="text-gray-500">Enter a question above to search.</p>
          </div>
        )}
      </div>
    </div>
  );
}
