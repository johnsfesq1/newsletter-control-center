'use client';

import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { ExternalLink, Calendar, FileText } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface Citation {
  chunk_id: string;
  gmail_message_id: string;
  chunk_index?: number;
  citation: string;
  publisher: string;
  date: string | { value: string };
  subject: string;
}

interface EvidenceCardProps {
  citation: Citation;
  index: number;
  isHighlighted?: boolean;
  onHover?: (index: number | null) => void;
}

// Helper to format date safely
function formatRelativeDate(d: string | { value: string }): string {
  try {
    const dateStr = typeof d === 'object' && d?.value ? d.value : d;
    if (!dateStr) return 'Date unknown';
    
    const date = new Date(dateStr as string);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    return `${Math.floor(diffDays / 365)} years ago`;
  } catch {
    return 'Date unknown';
  }
}

export const EvidenceCard = forwardRef<HTMLDivElement, EvidenceCardProps>(
  ({ citation, index, isHighlighted, onHover }, ref) => {
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.05, duration: 0.3 }}
        onMouseEnter={() => onHover?.(index)}
        onMouseLeave={() => onHover?.(null)}
        className={cn(
          'group relative rounded-lg border transition-all duration-200',
          'bg-zinc-900/50 hover:bg-zinc-900',
          isHighlighted
            ? 'border-emerald-500/50 shadow-lg shadow-emerald-500/10'
            : 'border-zinc-800 hover:border-zinc-700'
        )}
      >
        {/* Citation number badge */}
        <div className={cn(
          'absolute -left-3 top-4 w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono',
          'transition-colors duration-200',
          isHighlighted
            ? 'bg-emerald-500 text-zinc-900'
            : 'bg-zinc-800 text-zinc-400 group-hover:bg-zinc-700'
        )}>
          {index + 1}
        </div>

        <div className="p-4 pl-6">
          {/* Header: Publisher + Date */}
          <div className="flex items-center justify-between mb-3">
            <span className={cn(
              'text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded',
              'bg-zinc-800 text-zinc-300'
            )}>
              {citation.publisher}
            </span>
            <span className="flex items-center gap-1 text-xs text-zinc-500">
              <Calendar className="w-3 h-3" />
              {formatRelativeDate(citation.date)}
            </span>
          </div>

          {/* Subject line */}
          <h4 className="text-sm font-medium text-zinc-200 mb-2 line-clamp-2">
            {citation.subject}
          </h4>

          {/* Citation snippet */}
          <p className="text-sm text-zinc-400 line-clamp-3 leading-relaxed mb-3">
            {citation.citation}
          </p>

          {/* Action: View Full Email */}
          <Link
            href={`/email/${citation.gmail_message_id}?highlight_chunk=${citation.chunk_index ?? 0}`}
            className={cn(
              'inline-flex items-center gap-1.5 text-xs font-medium transition-colors',
              'text-zinc-500 hover:text-emerald-400'
            )}
          >
            <FileText className="w-3.5 h-3.5" />
            View Full Email
            <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </motion.div>
    );
  }
);

EvidenceCard.displayName = 'EvidenceCard';

