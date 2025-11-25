'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Play, 
  Mail, 
  X, 
  Loader2, 
  CheckCircle, 
  AlertCircle,
  Clock,
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

type TimeWindow = '24' | '48' | 'delta';

interface ToastState {
  visible: boolean;
  type: 'success' | 'error';
  message: string;
}

interface CommandBarProps {
  /** Current briefing ID (for email button) */
  briefingId?: string;
  /** Callback when a new briefing is generated */
  onBriefingGenerated?: () => void;
  /** Admin key for generation endpoint */
  adminKey?: string;
}

// ============================================================================
// Toast Component
// ============================================================================

function Toast({ toast, onDismiss }: { toast: ToastState; onDismiss: () => void }) {
  return (
    <AnimatePresence>
      {toast.visible && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          className="fixed bottom-6 right-6 z-50"
        >
          <div
            className={cn(
              'flex items-center gap-3 px-4 py-3 rounded-lg shadow-lg border',
              toast.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-800 text-emerald-200'
                : 'bg-red-950/90 border-red-800 text-red-200'
            )}
          >
            {toast.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-400" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400" />
            )}
            <span className="text-sm font-medium">{toast.message}</span>
            <button
              onClick={onDismiss}
              className="ml-2 p-1 rounded hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ============================================================================
// Generate Modal Component
// ============================================================================

interface GenerateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (windowHours: number | null) => Promise<void>;
  isGenerating: boolean;
}

function GenerateModal({ isOpen, onClose, onGenerate, isGenerating }: GenerateModalProps) {
  const [selectedWindow, setSelectedWindow] = useState<TimeWindow>('24');

  const windowOptions: { value: TimeWindow; label: string; description: string }[] = [
    { value: '24', label: 'Last 24 Hours', description: 'Standard daily briefing' },
    { value: '48', label: 'Last 48 Hours', description: 'Extended lookback' },
    { value: 'delta', label: 'Since Last Briefing', description: 'Process only new emails' },
  ];

  const handleGenerate = () => {
    const hours = selectedWindow === 'delta' ? null : parseInt(selectedWindow);
    onGenerate(hours);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md"
          >
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl shadow-2xl overflow-hidden">
              {/* Header */}
              <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                    <Zap className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-zinc-100">
                      Run Intelligence Cycle
                    </h2>
                    <p className="text-xs text-zinc-500">
                      Generate a new briefing from newsletters
                    </p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  disabled={isGenerating}
                  className="p-2 rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50"
                >
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6">
                <label className="block text-sm font-medium text-zinc-300 mb-3">
                  Time Window
                </label>
                <div className="space-y-2">
                  {windowOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setSelectedWindow(option.value)}
                      disabled={isGenerating}
                      className={cn(
                        'w-full p-4 rounded-lg border text-left transition-all',
                        selectedWindow === option.value
                          ? 'bg-emerald-500/10 border-emerald-500/50 ring-1 ring-emerald-500/30'
                          : 'bg-zinc-800/50 border-zinc-700 hover:border-zinc-600'
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Clock className={cn(
                          'w-5 h-5',
                          selectedWindow === option.value ? 'text-emerald-400' : 'text-zinc-500'
                        )} />
                        <div>
                          <div className={cn(
                            'font-medium',
                            selectedWindow === option.value ? 'text-emerald-300' : 'text-zinc-300'
                          )}>
                            {option.label}
                          </div>
                          <div className="text-xs text-zinc-500 mt-0.5">
                            {option.description}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {isGenerating && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="mt-4 p-4 rounded-lg bg-zinc-800/50 border border-zinc-700"
                  >
                    <div className="flex items-center gap-3">
                      <Loader2 className="w-5 h-5 text-emerald-400 animate-spin" />
                      <div>
                        <div className="text-sm font-medium text-zinc-300">
                          Generating Briefing...
                        </div>
                        <div className="text-xs text-zinc-500 mt-0.5">
                          This typically takes 1-2 minutes
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-emerald-500"
                        initial={{ width: '0%' }}
                        animate={{ width: '100%' }}
                        transition={{ duration: 90, ease: 'linear' }}
                      />
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-end gap-3">
                <button
                  onClick={onClose}
                  disabled={isGenerating}
                  className="px-4 py-2 text-sm font-medium text-zinc-400 hover:text-zinc-300 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={isGenerating}
                  className={cn(
                    'px-5 py-2 rounded-lg text-sm font-medium transition-all',
                    'bg-emerald-600 hover:bg-emerald-500 text-white',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    'flex items-center gap-2'
                  )}
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      Run Cycle
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ============================================================================
// Main Command Bar Component
// ============================================================================

export function CommandBar({ briefingId, onBriefingGenerated, adminKey }: CommandBarProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [toast, setToast] = useState<ToastState>({ visible: false, type: 'success', message: '' });

  const showToast = useCallback((type: 'success' | 'error', message: string) => {
    setToast({ visible: true, type, message });
    setTimeout(() => setToast(prev => ({ ...prev, visible: false })), 5000);
  }, []);

  const dismissToast = useCallback(() => {
    setToast(prev => ({ ...prev, visible: false }));
  }, []);

  const handleGenerate = async (windowHours: number | null) => {
    setIsGenerating(true);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Get admin key from env or prop (NEXT_PUBLIC_ prefix exposes to client)
      const key = process.env.NEXT_PUBLIC_BRIEFING_ADMIN_KEY || adminKey;
      
      if (!key) {
        console.warn('⚠️ NEXT_PUBLIC_BRIEFING_ADMIN_KEY not set - API may reject request');
      }
      
      if (key) {
        headers['Authorization'] = `Bearer ${key}`;
      }

      const body: Record<string, unknown> = {};
      if (windowHours !== null) {
        body.windowHours = windowHours;
      }

      const response = await fetch('/api/intelligence/briefing/generate', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Generation failed');
      }

      const result = await response.json();
      
      showToast('success', `Briefing generated! ${result.email_count} emails processed.`);
      setIsModalOpen(false);

      // Trigger refresh callback
      if (onBriefingGenerated) {
        // Small delay to ensure BigQuery has the new row
        setTimeout(() => {
          onBriefingGenerated();
        }, 1000);
      } else {
        // Fallback: reload the page
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      }

    } catch (error) {
      console.error('Generation failed:', error);
      showToast('error', error instanceof Error ? error.message : 'Failed to generate briefing');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSendEmail = async () => {
    setIsSendingEmail(true);

    try {
      const body: Record<string, string> = {};
      if (briefingId) {
        body.briefingId = briefingId;
      }

      const response = await fetch('/api/intelligence/briefing/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to send email');
      }

      const result = await response.json();
      showToast('success', `Email sent to ${result.recipient}`);

    } catch (error) {
      console.error('Email send failed:', error);
      showToast('error', error instanceof Error ? error.message : 'Failed to send email');
    } finally {
      setIsSendingEmail(false);
    }
  };

  return (
    <>
      {/* Command Bar */}
      <div className="flex items-center gap-2">
        {/* Run Intelligence Cycle Button */}
        <button
          onClick={() => setIsModalOpen(true)}
          disabled={isGenerating}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            'bg-zinc-800/50 border border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800',
            'text-zinc-300 hover:text-zinc-100',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
        >
          {isGenerating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          <span className="hidden sm:inline">Run Intelligence Cycle</span>
          <span className="sm:hidden">Run</span>
        </button>

        {/* Email Button */}
        <button
          onClick={handleSendEmail}
          disabled={isSendingEmail || !briefingId}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            'bg-zinc-800/50 border border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800',
            'text-zinc-300 hover:text-zinc-100',
            'disabled:opacity-50 disabled:cursor-not-allowed'
          )}
          title={!briefingId ? 'No briefing available' : 'Email this briefing'}
        >
          {isSendingEmail ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Mail className="w-4 h-4" />
          )}
          <span className="hidden sm:inline">Email to Me</span>
          <span className="sm:hidden">Email</span>
        </button>
      </div>

      {/* Generate Modal */}
      <GenerateModal
        isOpen={isModalOpen}
        onClose={() => !isGenerating && setIsModalOpen(false)}
        onGenerate={handleGenerate}
        isGenerating={isGenerating}
      />

      {/* Toast Notifications */}
      <Toast toast={toast} onDismiss={dismissToast} />
    </>
  );
}

export default CommandBar;

