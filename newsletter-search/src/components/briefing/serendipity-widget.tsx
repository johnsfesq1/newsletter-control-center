'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import type { SerendipityItem } from '@/lib/briefing';

interface SerendipityWidgetProps {
  items: SerendipityItem[];
}

export function SerendipityWidget({ items }: SerendipityWidgetProps) {
  if (!items || items.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-gradient-to-br from-purple-900/10 to-zinc-900 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800/50 bg-purple-500/5">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
            Serendipity Corner
          </h3>
        </div>
        <p className="text-xs text-zinc-500 mt-1">
          Unexpected insights worth knowing
        </p>
      </div>
      
      {/* Items */}
      <div className="divide-y divide-zinc-800/50">
        {items.map((item, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + index * 0.1, duration: 0.4 }}
            className="p-4 hover:bg-zinc-800/30 transition-colors"
          >
            <h4 className="text-sm font-medium text-zinc-100 mb-1">
              {item.title}
            </h4>
            <p className="text-sm text-zinc-400 leading-relaxed">
              {item.insight}
            </p>
            <span className="text-xs text-zinc-600 mt-2 block">
              via {item.publisher}
            </span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

