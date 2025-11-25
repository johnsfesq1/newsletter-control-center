'use client';

import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';

interface ExecutiveSummaryProps {
  bullets: string[];
}

export function ExecutiveSummary({ bullets }: ExecutiveSummaryProps) {
  if (!bullets || bullets.length === 0) {
    return null;
  }

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-5 h-5 text-amber-400" />
        <h2 className="text-lg font-semibold text-zinc-100 uppercase tracking-wider">
          Executive Summary
        </h2>
      </div>
      
      <div className="grid gap-4 md:grid-cols-3">
        {bullets.map((bullet, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1, duration: 0.4 }}
            className="relative overflow-hidden rounded-lg border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-5"
          >
            {/* Accent line */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
            
            {/* Number badge */}
            <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center">
              <span className="text-xs font-mono text-zinc-400">{index + 1}</span>
            </div>
            
            <p className="text-zinc-200 leading-relaxed font-narrative text-base mt-2">
              {bullet}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}

