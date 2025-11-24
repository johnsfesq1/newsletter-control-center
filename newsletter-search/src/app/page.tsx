'use client';

import { useState } from 'react';
import Link from 'next/link';

// --- Types ---
interface Citation {
  chunk_id: string;
  gmail_message_id: string;
  chunk_index?: number;
  citation: string;
  publisher: string;
  date: string | { value: string };
  subject: string;
}

interface SemanticResult {
  query: string;
  answer: string;
  citations: Citation[];
  chunks_used: number;
  cost_usd: number;
}

export default function Page() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SemanticResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResults(null);

    try {
      const apiKey = process.env.NEXT_PUBLIC_API_KEY;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      console.log('🚀 Sending search request:', {
        url: '/api/intelligence/query',
        query,
        apiKeyPresent: !!apiKey,
        apiKeyFirstChars: apiKey ? `${apiKey.substring(0, 10)}...` : 'none'
      });

      const res = await fetch('/api/intelligence/query', {
        method: 'POST',
        headers,
        body: JSON.stringify({ query }),
      });

      console.log('📥 API Response Status:', res.status, res.statusText);

      const data = await res.json();

      if (!res.ok) {
        console.error('❌ API Error Response:', data);
        throw new Error(data.error || data.message || `Search failed with status ${res.status}`);
      }

      console.log('✅ Search successful:', data);
      setResults(data);
    } catch (err: any) {
      console.error('💥 Fetch/Handling Error:', err);
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  // Helper to format date safely
  const formatDate = (d: any) => {
    try {
      const dateStr = typeof d === 'object' && d?.value ? d.value : d;
      if (!dateStr) return 'Date unknown';
      return new Date(dateStr).toLocaleDateString(undefined, { 
        year: 'numeric', month: 'short', day: 'numeric' 
      });
    } catch {
      return 'Date unknown';
    }
  };

  return (
    <div className="min-h-screen p-8 max-w-4xl mx-auto">
      {/* Header */}
      <header className="mb-12 text-center">
        <h1 className="text-3xl font-bold text-blue-900 mb-2">
          Newsletter Intelligence
        </h1>
        <p className="text-gray-600">
          Search 70k+ newsletters for strategic insights
        </p>
      </header>

      {/* Search Box */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 mb-8">
        <form onSubmit={handleSearch} className="flex gap-3">
          <input
            type="text"
            className="flex-1 border border-gray-300 rounded px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Ask a question (e.g., 'What is the outlook for lithium mining?')"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className="bg-blue-600 text-white px-8 py-3 rounded font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </form>
      </div>

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded mb-8">
          <strong>Error:</strong> {error}
          <p className="text-sm mt-2 text-red-600">Check console for full details.</p>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && (
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="h-4 bg-gray-200 rounded w-5/6"></div>
        </div>
      )}

      {/* Results Display */}
      {results && (
        <div className="space-y-8 animate-in fade-in duration-500">
          
          {/* Answer Section */}
          <section className="bg-white p-8 rounded-lg shadow-sm border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 mb-4 border-b pb-2">
              Intelligence Summary
            </h2>
            <div className="prose max-w-none text-gray-800 leading-relaxed whitespace-pre-wrap">
              {results.answer}
            </div>
            <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-gray-500 flex justify-between">
              <span>Based on {results.chunks_used} sources</span>
              <span>Est. Cost: ${results.cost_usd.toFixed(4)}</span>
            </div>
          </section>

          {/* Citations Section */}
          <section>
            <h3 className="text-lg font-semibold text-gray-700 mb-4">
              Sources Used
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              {results.citations.map((cit, idx) => (
                <Link
                  key={`${cit.gmail_message_id}-${idx}`}
                  href={`/email/${cit.gmail_message_id}?highlight_chunk=${cit.chunk_index ?? 0}`}
                  className="block bg-white p-4 rounded border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all group"
                >
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-bold text-blue-600 uppercase tracking-wider bg-blue-50 px-2 py-1 rounded">
                      {cit.publisher}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatDate(cit.date)}
                    </span>
                  </div>
                  <h4 className="font-medium text-gray-900 group-hover:text-blue-700 line-clamp-2">
                    {cit.subject}
                  </h4>
                  <div className="mt-3 text-xs text-gray-400 flex items-center">
                    Read full issue →
                  </div>
                </Link>
              ))}
            </div>
          </section>

        </div>
      )}
    </div>
  );
}
