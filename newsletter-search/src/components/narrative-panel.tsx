'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import { cn } from '@/lib/utils';

interface NarrativePanelProps {
  content: string;
  chunksUsed: number;
  onCitationHover?: (index: number | null) => void;
  onCitationClick?: (index: number) => void;
}

export function NarrativePanel({
  content,
  chunksUsed,
  onCitationHover,
  onCitationClick,
}: NarrativePanelProps) {
  // Process content to make citations interactive
  const processedContent = useMemo(() => {
    // Replace [1], [2], etc. with clickable markers
    // This is handled in the markdown components below
    return content;
  }, [content]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="h-full flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-zinc-800">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Intelligence Brief</h2>
          <p className="text-xs text-zinc-500 mt-1">
            Synthesized from {chunksUsed} sources
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs text-zinc-500">Live</span>
        </div>
      </div>

      {/* Narrative Content */}
      <div className="flex-1 overflow-y-auto pr-2">
        <div className="font-narrative prose-narrative text-base leading-relaxed">
          <ReactMarkdown
            components={{
              // Custom paragraph with proper spacing
              p: ({ children }) => (
                <p className="mb-4 text-zinc-300">{children}</p>
              ),
              // Headers with proper hierarchy
              h1: ({ children }) => (
                <h1 className="text-2xl font-bold text-zinc-100 mt-8 mb-4">{children}</h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-xl font-semibold text-zinc-100 mt-6 mb-3">{children}</h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-lg font-semibold text-zinc-200 mt-5 mb-2">{children}</h3>
              ),
              // Lists
              ul: ({ children }) => (
                <ul className="mb-4 pl-4 space-y-2">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="mb-4 pl-4 space-y-2 list-decimal">{children}</ol>
              ),
              li: ({ children }) => (
                <li className="text-zinc-300 pl-2">{children}</li>
              ),
              // Strong/emphasis
              strong: ({ children }) => (
                <strong className="font-semibold text-zinc-100">{children}</strong>
              ),
              em: ({ children }) => (
                <em className="italic text-zinc-400">{children}</em>
              ),
              // Blockquotes for key insights
              blockquote: ({ children }) => (
                <blockquote className="border-l-2 border-emerald-500/50 pl-4 my-4 text-zinc-400 italic">
                  {children}
                </blockquote>
              ),
              // Code blocks
              code: ({ className, children }) => {
                const isInline = !className;
                if (isInline) {
                  // Check if this looks like a citation [1], [2], etc.
                  const text = String(children);
                  const citationMatch = text.match(/^\[(\d+)\]$/);
                  if (citationMatch) {
                    const citationIndex = parseInt(citationMatch[1], 10) - 1;
                    return (
                      <button
                        onClick={() => onCitationClick?.(citationIndex)}
                        onMouseEnter={() => onCitationHover?.(citationIndex)}
                        onMouseLeave={() => onCitationHover?.(null)}
                        className={cn(
                          'inline-flex items-center justify-center',
                          'w-5 h-5 text-[10px] font-mono font-bold rounded-full',
                          'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30',
                          'cursor-pointer transition-colors align-super ml-0.5'
                        )}
                      >
                        {citationMatch[1]}
                      </button>
                    );
                  }
                  return (
                    <code className="bg-zinc-800 px-1.5 py-0.5 rounded text-sm font-mono text-emerald-400">
                      {children}
                    </code>
                  );
                }
                return (
                  <code className={cn('block bg-zinc-900 p-4 rounded-lg overflow-x-auto', className)}>
                    {children}
                  </code>
                );
              },
              // Links
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
                >
                  {children}
                </a>
              ),
            }}
          >
            {processedContent}
          </ReactMarkdown>
        </div>
      </div>
    </motion.div>
  );
}

