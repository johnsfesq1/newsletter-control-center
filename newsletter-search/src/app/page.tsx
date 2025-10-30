'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface SearchResult {
  id: string;
  sender: string;
  subject: string;
  sent_date: any; // BigQueryTimestamp object
  received_date: any; // BigQueryTimestamp object
  body_text: string;
  body_html: string | null;
  is_vip: boolean;
  publisher_name: string;
  source_type: string;
  word_count: number;
  has_attachments: boolean;
  snippet: string;
}

interface SearchResponse {
  results: SearchResult[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [publisher, setPublisher] = useState('');
  const [vipOnly, setVipOnly] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const searchNewsletters = async (page = 1) => {
    setLoading(true);
    setError('');
    
    try {
      const params = new URLSearchParams({
        q: query,
        startDate,
        endDate,
        publisher,
        vipOnly: vipOnly.toString(),
        page: page.toString()
      });

      const response = await fetch(`/api/search?${params}`);
      const data: SearchResponse = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Search failed');
      }
      
      setResults(data.results);
      setPagination(data.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    searchNewsletters(1);
  };

  const handlePageChange = (newPage: number) => {
    searchNewsletters(newPage);
  };

  const formatDate = (dateInput: any) => {
    // Case 1: NULL values
    if (!dateInput) return 'N/A';
    
    // Case 2: BigQueryTimestamp objects (what BigQuery actually returns)
    if (dateInput && typeof dateInput === 'object' && dateInput.value) {
      try {
        const date = new Date(dateInput.value);
        if (isNaN(date.getTime())) {
          return 'Invalid Date';
        }
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric'
        });
      } catch (error) {
        return 'Invalid Date';
      }
    }
    
    // Case 3: Date OBJECTS
    if (dateInput instanceof Date) {
      if (isNaN(dateInput.getTime())) {
        return 'Invalid Date';
      }
      return dateInput.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
    
    // Case 4: String dates
    if (typeof dateInput === 'string') {
      let date: Date;
      if (dateInput.includes('T')) {
        // ISO format with time
        date = new Date(dateInput);
      } else if (dateInput.includes('-')) {
        // Date only format (YYYY-MM-DD)
        date = new Date(dateInput + 'T00:00:00');
      } else {
        // Try parsing as-is
        date = new Date(dateInput);
      }
      
      if (isNaN(date.getTime())) {
        return 'Invalid Date';
      }
      
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    }
    
    // Fallback for unexpected types
    return 'Invalid Date';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Newsletter Search</h1>
        
        {/* Search Form */}
        <form onSubmit={handleSearch} className="bg-white p-6 rounded-lg shadow-md mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search
              </label>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search newsletters..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Publisher
              </label>
              <input
                type="text"
                value={publisher}
                onChange={(e) => setPublisher(e.target.value)}
                placeholder="Filter by publisher..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={vipOnly}
                onChange={(e) => setVipOnly(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">VIP only</span>
            </label>
            
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="bg-white rounded-lg shadow-md">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">
                Results ({pagination.total} found)
              </h2>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sender
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Subject
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Snippet
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {results.map((result) => (
                    <tr key={result.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {result.sender}
                            </div>
                            <div className="text-xs text-gray-500">
                              {result.publisher_name}
                            </div>
                          </div>
                          {result.is_vip && (
                            <span className="ml-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                              VIP
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Link 
                          href={`/newsletter/${result.id}${query ? `?q=${encodeURIComponent(query)}` : ''}`}
                          className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          {result.subject}
                        </Link>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <div>
                          <div>{formatDate(result.sent_date)}</div>
                          <div className="text-xs text-gray-400">
                            {result.word_count} words
                            {result.has_attachments && ' • Has attachments'}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {query ? (
                          <span dangerouslySetInnerHTML={{
                            __html: result.snippet.replace(
                              new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
                              '<mark class="bg-yellow-200 px-1 rounded">$1</mark>'
                            )
                          }} />
                        ) : (
                          result.snippet + '...'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Showing page {pagination.page} of {pagination.totalPages}
                  </div>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => handlePageChange(pagination.page - 1)}
                      disabled={pagination.page === 1}
                      className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => handlePageChange(pagination.page + 1)}
                      disabled={pagination.page === pagination.totalPages}
                      className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* No Results */}
        {!loading && results.length === 0 && query && (
          <div className="bg-white p-6 rounded-lg shadow-md text-center">
            <p className="text-gray-500">No newsletters found matching your search criteria.</p>
          </div>
        )}
      </div>
    </div>
  );
}