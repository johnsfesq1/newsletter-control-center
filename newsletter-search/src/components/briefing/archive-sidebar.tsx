'use client';

import { motion } from 'framer-motion';
import { Calendar, FileText, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { BriefingArchiveItem } from '@/lib/briefing';

interface ArchiveSidebarProps {
  archive: BriefingArchiveItem[];
  currentBriefingId?: string;
}

function formatArchiveDate(dateStr: string): { day: string; month: string; time: string } {
  try {
    const date = new Date(dateStr);
    return {
      day: date.getDate().toString(),
      month: date.toLocaleDateString('en-US', { month: 'short' }),
      time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
    };
  } catch {
    return { day: '?', month: '???', time: '' };
  }
}

function isToday(dateStr: string): boolean {
  try {
    const date = new Date(dateStr);
    const today = new Date();
    return date.toDateString() === today.toDateString();
  } catch {
    return false;
  }
}

export function ArchiveSidebar({ archive, currentBriefingId }: ArchiveSidebarProps) {
  if (!archive || archive.length === 0) {
    return (
      <div className="p-4 text-center">
        <p className="text-sm text-zinc-500">No briefings yet</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-zinc-400" />
          <h2 className="text-sm font-semibold text-zinc-200 uppercase tracking-wider">
            Archive
          </h2>
        </div>
        <p className="text-xs text-zinc-500 mt-1">
          {archive.length} briefings
        </p>
      </div>
      
      {/* Archive list */}
      <div className="flex-1 overflow-y-auto">
        <div className="divide-y divide-zinc-800/50">
          {archive.map((item, index) => {
            const { day, month, time } = formatArchiveDate(item.generated_at);
            const isCurrent = item.briefing_id === currentBriefingId;
            const today = isToday(item.generated_at);
            
            return (
              <motion.div
                key={item.briefing_id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.03, duration: 0.3 }}
              >
                <Link
                  href={`/briefing?id=${item.briefing_id}`}
                  className={cn(
                    'block p-3 hover:bg-zinc-800/50 transition-colors',
                    isCurrent && 'bg-emerald-500/10 border-l-2 border-emerald-500'
                  )}
                >
                  <div className="flex items-center gap-3">
                    {/* Date badge */}
                    <div className={cn(
                      'w-12 h-12 rounded-lg flex flex-col items-center justify-center',
                      today ? 'bg-emerald-500/20' : 'bg-zinc-800',
                    )}>
                      <span className={cn(
                        'text-lg font-bold',
                        today ? 'text-emerald-400' : 'text-zinc-300'
                      )}>
                        {day}
                      </span>
                      <span className={cn(
                        'text-xs uppercase',
                        today ? 'text-emerald-400/70' : 'text-zinc-500'
                      )}>
                        {month}
                      </span>
                    </div>
                    
                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {today && (
                          <span className="text-xs font-medium text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                            Today
                          </span>
                        )}
                        {isCurrent && (
                          <span className="text-xs font-medium text-emerald-400">
                            Current
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-zinc-400 mt-0.5">
                        {time} · {item.email_count} emails
                      </p>
                    </div>
                    
                    <ChevronRight className={cn(
                      'w-4 h-4',
                      isCurrent ? 'text-emerald-400' : 'text-zinc-600'
                    )} />
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

