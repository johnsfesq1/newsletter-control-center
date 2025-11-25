'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, TrendingUp, TrendingDown, Minus, AlertTriangle, Link2, Copy, Check, FileText, Calculator } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NarrativeCluster as NarrativeClusterType, SourceCitation, SentimentBreakdown } from '@/lib/briefing';

interface NarrativeClusterProps {
  cluster: NarrativeClusterType;
  index: number;
  defaultExpanded?: boolean;
}

const sentimentConfig = {
  Positive: {
    icon: TrendingUp,
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/30',
  },
  Negative: {
    icon: TrendingDown,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
  },
  Mixed: {
    icon: Minus,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
  },
};

// ============================================================================
// Sentiment Badge with Methodology Card (100% Falsifiable)
// ============================================================================

interface SentimentBadgeProps {
  sentiment: 'Positive' | 'Negative' | 'Mixed';
  breakdown?: SentimentBreakdown;
}

function SentimentBadge({ sentiment, breakdown }: SentimentBadgeProps) {
  const [showMethodology, setShowMethodology] = useState(false);
  const config = sentimentConfig[sentiment] || sentimentConfig.Mixed;
  const Icon = config.icon;

  return (
    <div 
      className="relative"
      onMouseEnter={() => setShowMethodology(true)}
      onMouseLeave={() => setShowMethodology(false)}
    >
      {/* Badge */}
      <div className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium cursor-help',
        config.bg,
        config.border,
        'border'
      )}>
        <Icon className={cn('w-3 h-3', config.color)} />
        <span className={config.color}>{sentiment}</span>
        {breakdown && (
          <Calculator className={cn('w-3 h-3 ml-0.5', config.color)} />
        )}
      </div>

      {/* Methodology Hover Card */}
      <AnimatePresence>
        {showMethodology && breakdown && (
          <motion.div
            initial={{ opacity: 0, y: 5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 5, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 left-0 top-full mt-2 p-4 rounded-lg bg-zinc-900 border border-zinc-700 shadow-xl w-72"
          >
            {/* Header */}
            <div className="flex items-center gap-2 mb-3 pb-3 border-b border-zinc-800">
              <Calculator className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                Sentiment Math
              </span>
            </div>

            {/* Breakdown Bars */}
            <div className="space-y-2 mb-3">
              {/* Positive */}
              <div className="flex items-center gap-2">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-emerald-500 transition-all"
                    style={{ width: `${breakdown.total > 0 ? (breakdown.positive / breakdown.total) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-zinc-400 w-6 text-right">{breakdown.positive}</span>
              </div>

              {/* Negative */}
              <div className="flex items-center gap-2">
                <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-red-500 transition-all"
                    style={{ width: `${breakdown.total > 0 ? (breakdown.negative / breakdown.total) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-zinc-400 w-6 text-right">{breakdown.negative}</span>
              </div>

              {/* Neutral */}
              <div className="flex items-center gap-2">
                <Minus className="w-3.5 h-3.5 text-amber-400" />
                <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-amber-500 transition-all"
                    style={{ width: `${breakdown.total > 0 ? (breakdown.neutral / breakdown.total) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-xs font-mono text-zinc-400 w-6 text-right">{breakdown.neutral}</span>
              </div>
            </div>

            {/* Consensus */}
            <div className="text-xs text-zinc-400 mb-2">
              <span className="text-zinc-500">Consensus calculated from </span>
              <span className="text-zinc-200 font-semibold">{breakdown.total} sources</span>
            </div>

            {/* Override Warning */}
            {breakdown.override_applied && (
              <div className="mt-2 p-2 rounded bg-amber-500/10 border border-amber-500/20">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-amber-300">
                    <strong>Math Override:</strong> LLM said &quot;{breakdown.llm_consensus}&quot; but 
                    the numbers show &quot;{breakdown.calculated_consensus}&quot;
                  </div>
                </div>
              </div>
            )}

            {/* 100% Falsifiable */}
            <div className="mt-3 pt-2 border-t border-zinc-800">
              <p className="text-xs text-zinc-500">
                100% Falsifiable: Sentiment derived from counting individual source sentiments, not AI opinion.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================================================
// Citation Card Component (Trust & Verification)
// ============================================================================

interface CitationCardProps {
  source: SourceCitation;
  index: number;
  formatPublisher: (email: string) => string;
  formatRelativeDate: (dateStr: string) => string;
  copiedId: string | null;
  onCopy: (id: string) => void;
}

function CitationCard({ source, formatPublisher, formatRelativeDate, copiedId, onCopy }: CitationCardProps) {
  const [isHovered, setIsHovered] = useState(false);
  const publisherName = formatPublisher(source.publisher);
  const relativeDate = formatRelativeDate(source.sent_date);

  return (
    <div
      className="relative group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Citation Badge */}
      <div className="flex items-center justify-between gap-2">
        <button
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-900/50 border border-zinc-700 hover:border-zinc-600 hover:bg-zinc-900/70 transition-all text-left flex-1 group/citation"
          onClick={(e) => {
            e.stopPropagation();
            onCopy(source.gmail_message_id);
          }}
        >
          <FileText className="w-3.5 h-3.5 text-zinc-500 group-hover/citation:text-emerald-400 transition-colors" />
          <span className="text-sm text-zinc-300 group-hover/citation:text-zinc-100 transition-colors">
            {publisherName} • {relativeDate}
          </span>
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCopy(source.gmail_message_id);
          }}
          className="flex-shrink-0 p-1.5 rounded hover:bg-zinc-700 transition-colors"
          title="Copy source ID"
        >
          {copiedId === source.gmail_message_id ? (
            <Check className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300" />
          )}
        </button>
      </div>

      {/* Hover Card - Trust & Verification */}
      <AnimatePresence>
        {isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 left-0 top-full mt-2 w-96 p-4 rounded-lg bg-zinc-900 border border-zinc-700 shadow-xl"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            {/* Subject */}
            <div className="mb-3">
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Subject</div>
              <div className="text-sm font-medium text-zinc-200">{source.subject}</div>
            </div>

            {/* Snippet */}
            <div>
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Excerpt</div>
              <p className="text-sm text-zinc-400 leading-relaxed line-clamp-4">
                {source.snippet}
              </p>
            </div>

            {/* Source ID (small) */}
            <div className="mt-3 pt-3 border-t border-zinc-800">
              <code className="text-xs font-mono text-zinc-600">
                {source.gmail_message_id.substring(0, 16)}...
              </code>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function NarrativeCluster({ cluster, index, defaultExpanded = false }: NarrativeClusterProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  const sourceCount = cluster.source_ids?.length || 0;
  
  // Grounding strength indicator
  const groundingStrength = sourceCount >= 4 ? 'strong' : sourceCount >= 2 ? 'moderate' : 'weak';
  const groundingConfig = {
    strong: { label: 'Well Grounded', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
    moderate: { label: 'Grounded', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/30' },
    weak: { label: 'Limited Sources', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' },
  };
  const grounding = groundingConfig[groundingStrength];

  const copyToClipboard = async (id: string) => {
    await navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Format relative date (e.g., "2 days ago", "Nov 25")
  const formatRelativeDate = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays} days ago`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
      
      // Fallback to formatted date
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  // Format publisher name (extract domain or use as-is)
  const formatPublisher = (email: string): string => {
    // Extract domain from email (e.g., "crew@morningbrew.com" -> "Morning Brew")
    const domain = email.split('@')[1];
    if (!domain) return email;
    
    // Simple domain-to-name mapping for common newsletters
    const domainMap: Record<string, string> = {
      'morningbrew.com': 'Morning Brew',
      'theknowledge.com': 'The Knowledge',
      'monocle.com': 'Monocle',
    };
    
    return domainMap[domain] || domain.split('.')[0].replace(/^./, (c) => c.toUpperCase());
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.4 }}
      className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900/50 hover:bg-zinc-900/80 transition-colors"
    >
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full p-5 flex items-start justify-between gap-4 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            {/* Sentiment badge with methodology hover card */}
            <SentimentBadge 
              sentiment={cluster.consensus_sentiment} 
              breakdown={cluster.sentiment_breakdown}
            />
            
            {/* Grounding indicator badge */}
            <div className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
              grounding.bg,
              grounding.border,
              'border'
            )}>
              <Link2 className={cn('w-3 h-3', grounding.color)} />
              <span className={grounding.color}>
                {sourceCount} {sourceCount === 1 ? 'Source' : 'Sources'}
            </span>
            </div>
          </div>
          
          <h3 className="text-lg font-semibold text-zinc-100 mb-2">
            {cluster.title}
          </h3>
          
          <p className="text-sm text-zinc-400 line-clamp-2">
            {cluster.synthesis}
          </p>
        </div>
        
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex-shrink-0 mt-1"
        >
          <ChevronDown className="w-5 h-5 text-zinc-500" />
        </motion.div>
      </button>
      
      {/* Expanded content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-0 border-t border-zinc-800/50">
              {/* Full synthesis */}
              <div className="mt-4 mb-4">
                <p className="text-zinc-300 leading-relaxed font-narrative">
                  {cluster.synthesis}
                </p>
              </div>
              
              {/* Counter point - highlighted if present */}
              {cluster.counter_point && (
                <div className="mt-4 p-4 rounded-lg bg-amber-500/5 border border-amber-500/20">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                        Dissenting View
                      </span>
                      <p className="text-sm text-zinc-300 mt-1">
                        {cluster.counter_point}
                      </p>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Source Citations - Trust & Verification */}
              {(cluster.sources && cluster.sources.length > 0) || (cluster.source_ids && cluster.source_ids.length > 0) ? (
                <div className="mt-4 p-4 rounded-lg bg-zinc-800/30 border border-zinc-700/50">
                  <div className="flex items-center gap-2 mb-3">
                    <Link2 className={cn('w-4 h-4', grounding.color)} />
                    <span className={cn('text-xs font-semibold uppercase tracking-wider', grounding.color)}>
                      {grounding.label} • {sourceCount} Citations
                    </span>
                  </div>
                  <div className="space-y-2">
                    {/* Use enriched sources if available, otherwise fall back to IDs */}
                    {cluster.sources && cluster.sources.length > 0 ? (
                      cluster.sources.map((source, idx) => (
                        <CitationCard
                          key={source.gmail_message_id}
                          source={source}
                          index={idx}
                          formatPublisher={formatPublisher}
                          formatRelativeDate={formatRelativeDate}
                          copiedId={copiedId}
                          onCopy={copyToClipboard}
                        />
                      ))
                    ) : (
                      // Fallback: Show IDs if sources not enriched yet
                      cluster.source_ids?.map((id, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between gap-2 group"
                        >
                          <code className="text-xs font-mono text-zinc-400 bg-zinc-900/50 px-2 py-1.5 rounded flex-1 overflow-hidden text-ellipsis">
                            {id}
                          </code>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(id);
                            }}
                            className="flex-shrink-0 p-1.5 rounded hover:bg-zinc-700 transition-colors"
                            title="Copy source ID"
                          >
                            {copiedId === id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-zinc-500 group-hover:text-zinc-300" />
                            )}
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

