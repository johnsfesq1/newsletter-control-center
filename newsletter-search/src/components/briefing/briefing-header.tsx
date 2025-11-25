'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Mail, Clock, ArrowLeft, Scan, Info } from 'lucide-react';
import Link from 'next/link';

interface BriefingHeaderProps {
  generatedAt: string;
  emailCount: number;
  timeWindowStart: string;
  timeWindowEnd: string;
}

function formatBriefingDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return 'Date unknown';
  }
}

function formatTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

/**
 * Format a compact timestamp: "Nov 24, 1:30 PM"
 */
function formatCompactTimestamp(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    }) + ', ' + date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return dateStr;
  }
}

/**
 * Format the scanning range: "Nov 24, 1:30 PM → Nov 25, 1:30 PM"
 */
function formatScanningRange(start: string, end: string): string {
  return `${formatCompactTimestamp(start)} → ${formatCompactTimestamp(end)}`;
}

/**
 * Calculate window duration in hours
 */
function getWindowDurationHours(start: string, end: string): number {
  try {
    const startDate = new Date(start);
    const endDate = new Date(end);
    return Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60));
  } catch {
    return 0;
  }
}

export function BriefingHeader({
  generatedAt,
  emailCount,
  timeWindowStart,
  timeWindowEnd,
}: BriefingHeaderProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const windowHours = getWindowDurationHours(timeWindowStart, timeWindowEnd);

  return (
    <motion.header
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mb-8"
    >
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Query
      </Link>
      
      {/* Title area */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <p className="text-sm text-emerald-400 font-semibold uppercase tracking-wider mb-1">
            Intelligence Briefing
          </p>
          <h1 className="text-3xl md:text-4xl font-bold text-zinc-100 font-narrative">
            {formatBriefingDate(generatedAt)}
          </h1>
        </div>
        
        {/* Stats badges */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
            <Mail className="w-4 h-4 text-zinc-400" />
            <span className="text-sm text-zinc-300">
              <strong className="text-zinc-100">{emailCount}</strong> newsletters
            </span>
          </div>
          
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700/50">
            <Calendar className="w-4 h-4 text-zinc-400" />
            <span className="text-sm text-zinc-300">
              Generated at {formatTime(generatedAt)}
            </span>
          </div>
        </div>
      </div>

      {/* Scanning Window - Exact Timestamps (100% Falsifiable) */}
      <div className="mt-4 relative">
        <div
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-zinc-900/80 border border-zinc-700/50"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          <Scan className="w-4 h-4 text-emerald-400" />
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
            <span className="text-xs text-zinc-500 uppercase tracking-wider">Scanning</span>
            <span className="text-sm text-zinc-200 font-mono">
              {formatScanningRange(timeWindowStart, timeWindowEnd)}
            </span>
            <span className="text-xs text-zinc-500">
              ({windowHours}h)
            </span>
          </div>
          <Info className="w-3.5 h-3.5 text-zinc-500" />
        </div>

        {/* Tooltip */}
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="absolute z-50 left-0 top-full mt-2 px-4 py-3 rounded-lg bg-zinc-900 border border-zinc-700 shadow-xl max-w-md"
          >
            <p className="text-sm text-zinc-300 leading-relaxed">
              <strong className="text-zinc-100">100% Falsifiable:</strong> Only emails ingested 
              between these exact timestamps are included in this briefing. Earlier emails are 
              excluded to prevent double-counting.
            </p>
            <div className="mt-2 pt-2 border-t border-zinc-800">
              <code className="text-xs font-mono text-zinc-500">
                WHERE ingested_at &gt; &apos;{timeWindowStart}&apos; AND ingested_at &lt;= &apos;{timeWindowEnd}&apos;
              </code>
            </div>
          </motion.div>
        )}
      </div>
    </motion.header>
  );
}

