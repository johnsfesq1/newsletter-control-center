'use client';

import { motion } from 'framer-motion';
import { Radio, TrendingUp } from 'lucide-react';

interface RadarWidgetProps {
  signals: string[];
}

export function RadarWidget({ signals }: RadarWidgetProps) {
  if (!signals || signals.length === 0) {
    return null;
  }

  return (
    <div className="rounded-lg border border-zinc-800 bg-gradient-to-br from-cyan-900/10 to-zinc-900 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-800/50 bg-cyan-500/5">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
            Radar Signals
          </h3>
        </div>
        <p className="text-xs text-zinc-500 mt-1">
          Emerging terms with unusual velocity
        </p>
      </div>
      
      {/* Signal chips */}
      <div className="p-4">
        <div className="flex flex-wrap gap-2">
          {signals.map((signal, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 + index * 0.05, duration: 0.3 }}
              className="group relative"
            >
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-500/10 border border-cyan-500/20 hover:border-cyan-500/40 transition-colors cursor-default">
                <TrendingUp className="w-3 h-3 text-cyan-400" />
                <span className="text-sm text-cyan-300 font-medium">
                  {signal}
                </span>
              </div>
              
              {/* Pulse animation on first few items */}
              {index < 2 && (
                <motion.div
                  className="absolute inset-0 rounded-full border border-cyan-500/30"
                  initial={{ opacity: 0.5, scale: 1 }}
                  animate={{ opacity: 0, scale: 1.5 }}
                  transition={{
                    repeat: Infinity,
                    duration: 2,
                    delay: index * 0.5,
                  }}
                />
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}

