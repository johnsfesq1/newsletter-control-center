'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Radar, Target, Brain, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ProcessTheaterProps {
  isActive: boolean;
  onComplete?: () => void;
}

interface Stage {
  id: number;
  label: string;
  sublabel: string;
  icon: React.ElementType;
  duration: number; // in ms
}

const stages: Stage[] = [
  { id: 1, label: 'Scanning Vector Space', sublabel: 'Searching 70,000+ chunks...', icon: Radar, duration: 2000 },
  { id: 2, label: 'Triangulating Sources', sublabel: 'Found {count} relevant chunks', icon: Target, duration: 3000 },
  { id: 3, label: 'Extracting Facts', sublabel: 'Analyzing key insights...', icon: Brain, duration: 2000 },
  { id: 4, label: 'Synthesizing Narrative', sublabel: 'Composing intelligence brief...', icon: Sparkles, duration: 1000 },
];

export function ProcessTheater({ isActive }: ProcessTheaterProps) {
  const [currentStage, setCurrentStage] = useState(0);
  const [chunksFound, setChunksFound] = useState(0);
  const [progress, setProgress] = useState(0);

  // Reset when becoming active
  useEffect(() => {
    if (isActive) {
      setCurrentStage(0);
      setChunksFound(0);
      setProgress(0);
    }
  }, [isActive]);

  // Stage progression
  useEffect(() => {
    if (!isActive) return;

    const stageTimers: NodeJS.Timeout[] = [];
    let accumulatedTime = 0;

    stages.forEach((stage, index) => {
      const timer = setTimeout(() => {
        setCurrentStage(index);
      }, accumulatedTime);
      stageTimers.push(timer);
      accumulatedTime += stage.duration;
    });

    return () => {
      stageTimers.forEach(clearTimeout);
    };
  }, [isActive]);

  // Chunks counter animation (for stage 2)
  useEffect(() => {
    if (!isActive || currentStage !== 1) return;

    const targetChunks = Math.floor(Math.random() * 20) + 15; // 15-35 chunks
    const interval = setInterval(() => {
      setChunksFound((prev) => {
        if (prev >= targetChunks) {
          clearInterval(interval);
          return prev;
        }
        return prev + 1;
      });
    }, 80);

    return () => clearInterval(interval);
  }, [isActive, currentStage]);

  // Progress bar animation
  useEffect(() => {
    if (!isActive) return;

    const totalDuration = stages.reduce((sum, s) => sum + s.duration, 0);
    const startTime = Date.now();

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min((elapsed / totalDuration) * 100, 100);
      setProgress(newProgress);

      if (newProgress >= 100) {
        clearInterval(interval);
      }
    }, 50);

    return () => clearInterval(interval);
  }, [isActive]);

  if (!isActive) return null;

  const stage = stages[currentStage] || stages[0];
  const StageIcon = stage.icon;

  return (
    <div className="w-full max-w-2xl mx-auto py-16">
      <div className="relative">
        {/* Main Stage Display */}
        <div className="flex flex-col items-center gap-8">
          {/* Animated Icon Container */}
          <div className="relative">
            {/* Outer ring pulse */}
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-emerald-500/30"
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.5, 0, 0.5],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              style={{ width: 120, height: 120, margin: -20 }}
            />
            
            {/* Icon background */}
            <motion.div
              className="relative w-20 h-20 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center"
              animate={{
                boxShadow: [
                  '0 0 20px rgba(16, 185, 129, 0.1)',
                  '0 0 40px rgba(16, 185, 129, 0.2)',
                  '0 0 20px rgba(16, 185, 129, 0.1)',
                ],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={stage.id}
                  initial={{ opacity: 0, scale: 0.5, rotate: -180 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, scale: 0.5, rotate: 180 }}
                  transition={{ duration: 0.3 }}
                >
                  <StageIcon className="w-8 h-8 text-emerald-500" />
                </motion.div>
              </AnimatePresence>
            </motion.div>

            {/* Radar sweep effect for stage 1 */}
            {currentStage === 0 && (
              <motion.div
                className="absolute inset-0 w-20 h-20"
                style={{ transformOrigin: 'center' }}
              >
                <motion.div
                  className="absolute top-1/2 left-1/2 w-10 h-0.5 bg-gradient-to-r from-emerald-500 to-transparent"
                  style={{ transformOrigin: 'left center' }}
                  animate={{ rotate: 360 }}
                  transition={{
                    duration: 1.5,
                    repeat: Infinity,
                    ease: 'linear',
                  }}
                />
              </motion.div>
            )}
          </div>

          {/* Stage Text */}
          <div className="text-center space-y-2">
            <AnimatePresence mode="wait">
              <motion.h3
                key={stage.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="text-xl font-medium text-zinc-100"
              >
                {stage.label}
              </motion.h3>
            </AnimatePresence>

            <AnimatePresence mode="wait">
              <motion.p
                key={`${stage.id}-sub`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="text-sm text-zinc-500 font-mono"
              >
                {currentStage === 1
                  ? stage.sublabel.replace('{count}', String(chunksFound))
                  : stage.sublabel}
              </motion.p>
            </AnimatePresence>
          </div>

          {/* Progress Bar */}
          <div className="w-full max-w-md">
            <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-emerald-600 to-emerald-400"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.1 }}
              />
            </div>

            {/* Stage indicators */}
            <div className="flex justify-between mt-4">
              {stages.map((s, index) => (
                <div
                  key={s.id}
                  className={cn(
                    'flex items-center gap-1.5 text-xs transition-colors duration-300',
                    index <= currentStage ? 'text-emerald-500' : 'text-zinc-600'
                  )}
                >
                  <div
                    className={cn(
                      'w-2 h-2 rounded-full transition-colors duration-300',
                      index < currentStage
                        ? 'bg-emerald-500'
                        : index === currentStage
                        ? 'bg-emerald-500 animate-pulse'
                        : 'bg-zinc-700'
                    )}
                  />
                  <span className="hidden sm:inline">{s.label.split(' ')[0]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Floating data particles effect */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            {[...Array(6)].map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-1 h-1 bg-emerald-500/40 rounded-full"
                initial={{
                  x: Math.random() * 400 - 200,
                  y: 200,
                  opacity: 0,
                }}
                animate={{
                  y: -50,
                  opacity: [0, 1, 0],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  delay: i * 0.5,
                  ease: 'easeOut',
                }}
                style={{
                  left: `${20 + i * 12}%`,
                }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

