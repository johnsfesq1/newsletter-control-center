'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, AlertCircle, Newspaper, RefreshCw } from 'lucide-react';
import {
  BriefingHeader,
  ExecutiveSummary,
  NarrativeCluster,
  SerendipityWidget,
  RadarWidget,
  ArchiveSidebar,
  CommandBar,
} from '@/components/briefing';
import type { StoredBriefing, BriefingArchiveItem } from '@/lib/briefing';

type BriefingState = 'loading' | 'ready' | 'error' | 'empty';

function BriefingContent() {
  const searchParams = useSearchParams();
  const briefingId = searchParams.get('id');
  
  const [state, setState] = useState<BriefingState>('loading');
  const [briefing, setBriefing] = useState<StoredBriefing | null>(null);
  const [archive, setArchive] = useState<BriefingArchiveItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Fetch briefing data
  const fetchBriefing = async () => {
    setState('loading');
    setError(null);

    try {
      // Fetch specific briefing or latest
      const briefingUrl = briefingId
        ? `/api/intelligence/briefing/${briefingId}`
        : '/api/intelligence/briefing/latest';
      
      const [briefingRes, archiveRes] = await Promise.all([
        fetch(briefingUrl),
        fetch('/api/intelligence/briefing/archive?limit=30'),
      ]);

      if (!briefingRes.ok) {
        if (briefingRes.status === 404) {
          setState('empty');
          // Still try to get archive
          if (archiveRes.ok) {
            const archiveData = await archiveRes.json();
            setArchive(archiveData.briefings || []);
          }
          return;
        }
        throw new Error(`Failed to fetch briefing: ${briefingRes.status}`);
      }

      const briefingData = await briefingRes.json();
      setBriefing(briefingData);

      if (archiveRes.ok) {
        const archiveData = await archiveRes.json();
        setArchive(archiveData.briefings || []);
      }

      setState('ready');
    } catch (err) {
      console.error('Failed to fetch briefing:', err);
      setError(err instanceof Error ? err.message : 'Failed to load briefing');
      setState('error');
    }
  };

  useEffect(() => {
    fetchBriefing();
  }, [briefingId]);

  return (
    <div className="min-h-screen bg-zinc-950 flex">
      {/* Archive Sidebar (Desktop) */}
      <aside className="hidden lg:block w-72 border-r border-zinc-800 bg-zinc-900/50">
        <ArchiveSidebar
          archive={archive}
          currentBriefingId={briefing?.briefing_id}
        />
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0">
        <AnimatePresence mode="wait">
          {/* Loading State */}
          {state === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center h-screen"
            >
              <div className="text-center">
                <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mx-auto mb-4" />
                <p className="text-sm text-zinc-500">Loading briefing...</p>
              </div>
            </motion.div>
          )}

          {/* Empty State */}
          {state === 'empty' && (
            <motion.div
              key="empty"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center h-screen"
            >
              <div className="text-center max-w-md px-4">
                <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center mx-auto mb-6">
                  <Newspaper className="w-8 h-8 text-zinc-500" />
                </div>
                <h2 className="text-xl font-semibold text-zinc-200 mb-2">
                  No Briefings Yet
                </h2>
                <p className="text-sm text-zinc-500 mb-6">
                  Generate your first intelligence briefing to get started. 
                  The briefing engine will analyze your newsletters and create 
                  a synthesized daily report.
                </p>
                <div className="mt-6">
                  <CommandBar onBriefingGenerated={fetchBriefing} />
                </div>
              </div>
            </motion.div>
          )}

          {/* Error State */}
          {state === 'error' && (
            <motion.div
              key="error"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center h-screen"
            >
              <div className="max-w-md w-full mx-4 bg-red-950/30 border border-red-900/50 rounded-lg p-6">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-medium text-red-400 mb-1">Failed to Load Briefing</h3>
                    <p className="text-sm text-red-300/70">{error}</p>
                    <button
                      onClick={fetchBriefing}
                      className="mt-4 inline-flex items-center gap-2 text-sm text-red-400 hover:text-red-300"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Try Again
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Briefing Content */}
          {state === 'ready' && briefing && (
            <motion.div
              key="content"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-5xl mx-auto px-6 py-8"
            >
              {/* Command Bar - Fixed at top */}
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-zinc-800">
                <span className="text-xs text-zinc-500 uppercase tracking-wider font-medium">
                  Control Center
                </span>
                <CommandBar 
                  briefingId={briefing.briefing_id}
                  onBriefingGenerated={fetchBriefing}
                />
              </div>

              {/* Header */}
              <BriefingHeader
                generatedAt={briefing.generated_at}
                emailCount={briefing.email_count}
                timeWindowStart={briefing.time_window_start}
                timeWindowEnd={briefing.time_window_end}
              />

              {/* Executive Summary */}
              <ExecutiveSummary
                bullets={briefing.content_json.executive_summary}
              />

              {/* Main Content: Clusters + Widgets */}
              <div className="flex flex-col lg:flex-row gap-8">
                {/* Narrative Clusters (60%) */}
                <div className="lg:w-[60%] space-y-4">
                  <h2 className="text-lg font-semibold text-zinc-100 uppercase tracking-wider mb-4">
                    Narrative Clusters
                  </h2>
                  {briefing.content_json.narrative_clusters.length > 0 ? (
                    briefing.content_json.narrative_clusters.map((cluster, index) => (
                      <NarrativeCluster
                        key={index}
                        cluster={cluster}
                        index={index}
                        defaultExpanded={index === 0}
                      />
                    ))
                  ) : (
                    <p className="text-sm text-zinc-500 italic">
                      No narrative clusters generated for this briefing.
                    </p>
                  )}
                </div>

                {/* Right Rail (40%) */}
                <div className="lg:w-[40%] space-y-6">
                  <SerendipityWidget
                    items={briefing.content_json.serendipity_corner}
                  />
                  <RadarWidget
                    signals={briefing.content_json.radar_signals}
                  />
                </div>
              </div>

              {/* Mobile Archive */}
              <div className="lg:hidden mt-12 border-t border-zinc-800 pt-8">
                <h2 className="text-lg font-semibold text-zinc-100 uppercase tracking-wider mb-4">
                  Previous Briefings
                </h2>
                <ArchiveSidebar
                  archive={archive}
                  currentBriefingId={briefing.briefing_id}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

export default function BriefingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
      </div>
    }>
      <BriefingContent />
    </Suspense>
  );
}

