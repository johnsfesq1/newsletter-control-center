'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Search, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchInputProps {
  onSearch: (query: string) => void;
  isSearching: boolean;
  hasResults: boolean;
  costUsd?: number;
}

export function SearchInput({ onSearch, isSearching, hasResults, costUsd }: SearchInputProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim() && !isSearching) {
      onSearch(query.trim());
    }
  };

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const isCompact = hasResults || isSearching;

  return (
    <motion.div
      layout
      className={cn(
        'w-full transition-all duration-500',
        isCompact ? 'py-4' : 'py-16 md:py-24'
      )}
    >
      <motion.div
        layout
        className="max-w-4xl mx-auto px-4"
      >
        {/* Title - only show when not compact */}
        <motion.div
          initial={false}
          animate={{
            opacity: isCompact ? 0 : 1,
            height: isCompact ? 0 : 'auto',
            marginBottom: isCompact ? 0 : 32,
          }}
          transition={{ duration: 0.3 }}
          className="text-center overflow-hidden"
        >
          <h1 className="text-4xl md:text-5xl font-bold text-zinc-100 mb-3 tracking-tight">
            Intelligence Console
          </h1>
          <p className="text-zinc-500 text-lg">
            Query 70,000+ newsletters for strategic insights
          </p>
        </motion.div>

        {/* Search Form */}
        <form onSubmit={handleSubmit} className="relative">
          <div className={cn(
            'relative flex items-center gap-3 rounded-xl border transition-all duration-300',
            'bg-zinc-900/80 backdrop-blur-sm',
            isSearching 
              ? 'border-emerald-500/50 shadow-lg shadow-emerald-500/10' 
              : 'border-zinc-800 hover:border-zinc-700 focus-within:border-zinc-600'
          )}>
            {/* Search Icon */}
            <div className="pl-5">
              <Search className={cn(
                'w-5 h-5 transition-colors',
                isSearching ? 'text-emerald-500' : 'text-zinc-500'
              )} />
            </div>

            {/* Input */}
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What is the outlook for lithium mining?"
              disabled={isSearching}
              className={cn(
                'flex-1 bg-transparent py-4 text-lg text-zinc-100 placeholder:text-zinc-600',
                'focus:outline-none font-mono',
                isSearching && 'cursor-not-allowed opacity-70'
              )}
            />

            {/* Submit Button */}
            <button
              type="submit"
              disabled={!query.trim() || isSearching}
              className={cn(
                'mr-2 px-6 py-2.5 rounded-lg font-medium text-sm transition-all duration-200',
                'flex items-center gap-2',
                query.trim() && !isSearching
                  ? 'bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-600/20'
                  : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
              )}
            >
              <Zap className="w-4 h-4" />
              Query
            </button>
          </div>

          {/* Status Badge - shows when we have results */}
          {hasResults && costUsd !== undefined && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="absolute -bottom-8 right-0 flex items-center gap-2 text-xs text-zinc-500"
            >
              <span className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                ${costUsd.toFixed(4)}
              </span>
              <span className="text-zinc-700">•</span>
              <span>Gemini 2.5 Pro</span>
            </motion.div>
          )}
        </form>
      </motion.div>
    </motion.div>
  );
}

