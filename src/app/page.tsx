'use client';

import { useState } from 'react';
import { DashboardHeader } from '@/components/dashboard-header';
import { HeroSearch } from '@/components/hero-search';
import { BentoGrid } from '@/components/bento-grid';
import { ResultsSection } from '@/components/results-section';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"

// Interface for API results
interface SemanticResult {
  query: string;
  answer: string;
  citations: Array<{
    chunk_id: string;
    newsletter_id: string;
    chunk_index?: number;
    citation: string;
    publisher: string;
    date: any;
    subject: string;
  }>;
  chunks_used: number;
  cost_usd: number;
  chunks: Array<{
    chunk_id: string;
    newsletter_id: string;
    subject: string;
    publisher: string;
    score: number;
    normalized_score?: number;
  }>;
  publisher_rankings?: Array<{
    publisher: string;
    relevance_score: number;
    chunk_count: number;
    avg_score: number;
    latest_date?: any;
  }>;
}

export default function DashboardPage() {
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [apiResults, setApiResults] = useState<SemanticResult | null>(null);
  const [error, setError] = useState('');

  const handleSearch = async (query: string) => {
    if (!query.trim()) return;
    
    setIsSearching(true);
    setSearchQuery(query);
    setShowResults(false);
    setError('');
    setApiResults(null);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      const apiKey = process.env.NEXT_PUBLIC_API_KEY;
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }

      const response = await fetch('/api/intelligence/query', {
        method: 'POST',
        headers,
        body: JSON.stringify({ query }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Search failed');
      }

      setApiResults(data);
      setShowResults(true);
    } catch (err) {
      console.error('Search error:', err);
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f3f1] pb-20">
      <div className="container mx-auto max-w-6xl px-4 md:px-6">
        <DashboardHeader />

        <main className="mt-6 flex flex-col gap-10">
          <HeroSearch onSearch={handleSearch} isSearching={isSearching} />

          {error && (
            <Alert variant="destructive" className="bg-red-50 border-red-200 text-red-800">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {!showResults && !isSearching && !error && (
            <div className="animate-in fade-in duration-700">
              <BentoGrid />
            </div>
          )}

          {showResults && apiResults && (
            <ResultsSection 
              query={searchQuery} 
              results={apiResults} 
            />
          )}
        </main>
      </div>
    </div>
  );
}

