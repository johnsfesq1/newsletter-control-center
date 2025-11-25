'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, Newspaper } from 'lucide-react';
import Link from 'next/link';
import { SearchInput } from '@/components/search-input';
import { ProcessTheater } from '@/components/process-theater';
import { NarrativePanel } from '@/components/narrative-panel';
import { EvidenceCard } from '@/components/evidence-card';

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

type AppState = 'idle' | 'loading' | 'results' | 'error';

export default function Page() {
  const [appState, setAppState] = useState<AppState>('idle');
  const [results, setResults] = useState<SemanticResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [highlightedCitation, setHighlightedCitation] = useState<number | null>(null);
  
  const evidenceRefs = useRef<(HTMLDivElement | null)[]>([]);

  const handleSearch = async (query: string) => {
    setAppState('loading');
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
      setAppState('results');
    } catch (err: unknown) {
      console.error('💥 Fetch/Handling Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'An error occurred';
      setError(errorMessage);
      setAppState('error');
    }
  };

  const handleCitationHover = useCallback((index: number | null) => {
    setHighlightedCitation(index);
  }, []);

  const handleCitationClick = useCallback((index: number) => {
    const ref = evidenceRefs.current[index];
    if (ref) {
      ref.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightedCitation(index);
      // Clear highlight after a moment
      setTimeout(() => setHighlightedCitation(null), 2000);
    }
  }, []);

  const isSearching = appState === 'loading';
  const hasResults = appState === 'results' && results !== null;

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col">
      {/* Zone A: Command Deck */}
      <motion.header
        layout
        className={`
          sticky top-0 z-50 w-full
          bg-zinc-950/90 backdrop-blur-xl
          border-b border-zinc-800/50
          transition-shadow duration-300
          ${hasResults ? 'shadow-lg shadow-black/20' : ''}
        `}
      >
        {/* Navigation bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/30">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
              Intelligence Center
            </span>
          </div>
          <Link
            href="/briefing"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 hover:border-emerald-500/30 transition-colors"
          >
            <Newspaper className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-medium text-emerald-400">
              Daily Briefing
            </span>
          </Link>
        </div>
        
        <SearchInput
          onSearch={handleSearch}
          isSearching={isSearching}
          hasResults={hasResults}
          costUsd={results?.cost_usd}
        />
      </motion.header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col">
        <AnimatePresence mode="wait">
          {/* Idle State - Empty */}
          {appState === 'idle' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex items-center justify-center"
            >
              <div className="text-center text-zinc-600 max-w-md px-4">
                <p className="text-sm font-mono">
                  Enter a query to search your intelligence corpus
                </p>
              </div>
            </motion.div>
          )}

          {/* Loading State - Process Theater */}
          {appState === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex items-center justify-center px-4"
            >
              <ProcessTheater isActive={true} />
            </motion.div>
          )}

          {/* Error State */}
          {appState === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex items-center justify-center px-4"
            >
              <div className="max-w-md w-full bg-red-950/30 border border-red-900/50 rounded-lg p-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-red-400 mb-1">Query Failed</h3>
                    <p className="text-sm text-red-300/70">{error}</p>
                    <p className="text-xs text-red-400/50 mt-2">
                      Check console for full details.
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Results State - Split View */}
          {hasResults && results && (
            <motion.div
              key="results"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col lg:flex-row min-h-0"
            >
              {/* Zone B: Synthesis Plane (Left 60%) */}
              <div className="lg:w-[60%] border-r border-zinc-800/50 overflow-hidden flex flex-col">
                <div className="flex-1 overflow-y-auto p-6 lg:p-8">
                  <NarrativePanel
                    content={results.answer}
                    chunksUsed={results.chunks_used}
                    onCitationHover={handleCitationHover}
                    onCitationClick={handleCitationClick}
                  />
                </div>
              </div>

              {/* Zone C: Evidence Rail (Right 40%) */}
              <div className="lg:w-[40%] bg-zinc-900/30 overflow-hidden flex flex-col">
                <div className="p-4 border-b border-zinc-800/50">
                  <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
                    Source Evidence
                  </h3>
                  <p className="text-xs text-zinc-600 mt-1">
                    {results.citations.length} citations from your corpus
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {results.citations.map((citation, index) => (
                    <EvidenceCard
                      key={`${citation.gmail_message_id}-${index}`}
                      ref={(el) => { evidenceRefs.current[index] = el; }}
                      citation={citation}
                      index={index}
                      isHighlighted={highlightedCitation === index}
                      onHover={handleCitationHover}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Future: Timeline Scrubber placeholder */}
      {/* <footer className="h-16 border-t border-zinc-800/50 bg-zinc-900/50">
        Timeline Scrubber (Phase 2)
      </footer> */}
    </div>
  );
}
