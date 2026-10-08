import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Send, Square, RotateCcw, Cpu, ShieldCheck, Loader2, Sparkles } from 'lucide-react';
import { Card, PageHeader, Button, Badge } from '../components/ui/Primitives';
import { cx } from '../lib/utils';
import { useJarvisConversation } from '../lib/jarvisChat/useJarvisConversation';
import { useJarvisRuntimeStatus } from '../lib/jarvisChat/useJarvisRuntimeStatus';
import { useActiveWorkspaceGroundingData } from '../lib/jarvisChat/useActiveWorkspaceGroundingData';
import { buildJarvisChatRequestContext } from '../lib/jarvisChat/buildJarvisChatRequest';
import { JARVIS_UI_RUNTIME_STATUS_LABEL } from '../lib/jarvisChat/jarvisRuntimeStatus';
import type { JarvisChatMessage } from '../lib/jarvisChat/jarvisConversationTypes';
import type { JarvisRuntimeProvenanceSource } from '../lib/jarvis/runtime';

// JARVIS Phase 14 — the dedicated JARVIS conversation surface. Deliberately NOT a reimplementation
// of anything: every request still goes through the EXISTING runtime.ts (runJarvisRequest's own
// streaming sibling, streamJarvisRequest) -> routingPolicy.ts -> the EXISTING Decision Engine/
// grounded context for study_next, or the EXISTING Android local-LLM provider for anything else.
// This file and its own small hooks (useJarvisConversation/useJarvisRuntimeStatus) own ONLY
// presentation and React wiring — no llama.cpp/native call appears anywhere below; every one of
// those lives behind the already-existing, already-tested runtime/provider layer.

const PROVENANCE_LABEL: Record<JarvisRuntimeProvenanceSource, string> = {
  deterministic: 'Deterministic',
  android_local_ai: 'Local AI (Qwen3)',
  android_native_stub: 'On-device (bridge stub)',
  no_provider_available: 'Deterministic fallback',
};

const PROVENANCE_TONE: Record<JarvisRuntimeProvenanceSource, 'brand' | 'success' | 'warning' | 'neutral'> = {
  deterministic: 'brand',
  android_local_ai: 'success',
  android_native_stub: 'warning',
  no_provider_available: 'neutral',
};

const STATUS_DOT_CLASS: Record<ReturnType<typeof useJarvisRuntimeStatus>['status'], string> = {
  deterministic: 'bg-slate-400',
  model_unavailable: 'bg-amber-500',
  model_loading: 'bg-brand-500 animate-pulse',
  model_ready: 'bg-emerald-500',
};

function RuntimeStatusBar() {
  const { status, modelDisplayName, modelSizeBytes, canLoadModel, loadModel } = useJarvisRuntimeStatus();
  const [isLoadingModel, setIsLoadingModel] = useState(false);

  async function handleLoadModel() {
    setIsLoadingModel(true);
    try {
      await loadModel();
    } finally {
      setIsLoadingModel(false);
    }
  }

  return (
    <Card className="mb-4 flex flex-wrap items-center gap-2 p-3">
      <AnimatePresence mode="wait">
        <motion.div
          key={status}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.2 }}
          className="flex items-center gap-1.5"
        >
          <span className={cx('h-2 w-2 shrink-0 rounded-full', STATUS_DOT_CLASS[status])} aria-hidden="true" />
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{JARVIS_UI_RUNTIME_STATUS_LABEL[status]}</span>
        </motion.div>
      </AnimatePresence>

      {status === 'model_ready' && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge tone="success" className="gap-1">
            <Cpu className="h-3 w-3" aria-hidden="true" />
            {modelDisplayName ?? 'Local model'}
            {modelSizeBytes ? ` · ${(modelSizeBytes / 1_000_000_000).toFixed(1)} GB` : ''}
          </Badge>
          <Badge tone="neutral">On-device</Badge>
          <Badge tone="neutral" className="gap-1">
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            Private
          </Badge>
        </div>
      )}

      {status === 'model_unavailable' && canLoadModel && (
        <Button type="button" variant="secondary" size="sm" onClick={handleLoadModel} disabled={isLoadingModel} className="ml-auto">
          {isLoadingModel ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Cpu className="h-3.5 w-3.5" aria-hidden="true" />}
          {isLoadingModel ? 'Loading…' : `Load ${modelDisplayName ?? 'model'}`}
        </Button>
      )}
    </Card>
  );
}

function StreamingCursor() {
  return <span className="ml-0.5 inline-block h-3.5 w-[2px] animate-pulse bg-current align-middle" aria-hidden="true" />;
}

function MessageBubble({ message, onRetry }: { message: JarvisChatMessage; onRetry: (id: string) => void }) {
  const isUser = message.role === 'user';
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={cx('flex', isUser ? 'justify-end' : 'justify-start')}
    >
      <div className={cx('max-w-[85%] sm:max-w-[75%]', isUser ? '' : 'w-full')}>
        {isUser ? (
          <div className="rounded-2xl rounded-br-md bg-brand-600 px-4 py-2.5 text-sm text-white shadow-sm shadow-brand-600/30">{message.text}</div>
        ) : (
          <Card className="rounded-br-2xl rounded-tl-md p-3.5">
            <div className="mb-1.5 flex items-center gap-2">
              <Bot className="h-3.5 w-3.5 shrink-0 text-brand-500" aria-hidden="true" />
              <span className="font-display text-xs font-semibold text-slate-500 dark:text-slate-400">JARVIS</span>
              {message.status === 'done' && message.provenanceSource && (
                <Badge tone={PROVENANCE_TONE[message.provenanceSource]} className="ml-auto">
                  {PROVENANCE_LABEL[message.provenanceSource]}
                </Badge>
              )}
            </div>

            {message.status === 'error' ? (
              <div className="space-y-2">
                <p className="text-sm text-rose-600 dark:text-rose-400">{message.errorMessage ?? 'JARVIS failed to respond.'}</p>
                <Button type="button" variant="secondary" size="sm" onClick={() => onRetry(message.id)}>
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Retry
                </Button>
              </div>
            ) : message.status === 'cancelled' ? (
              <p className="text-sm italic text-slate-400">Cancelled.</p>
            ) : (
              <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
                {message.text}
                {message.status === 'streaming' && <StreamingCursor />}
              </p>
            )}

            {message.status === 'done' && message.degraded && message.degradedReason && <p className="mt-1.5 text-xs text-slate-400">{message.degradedReason}</p>}
          </Card>
        )}
      </div>
    </motion.div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-16 px-6 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600/10">
        <Sparkles className="h-6 w-6 text-brand-500" aria-hidden="true" />
      </div>
      <h3 className="font-display font-semibold text-slate-700 dark:text-slate-200">Ask JARVIS anything about your study plan</h3>
      <p className="mt-1.5 max-w-sm text-sm text-slate-400">
        Every answer is grounded in your real, current progress — JARVIS never invents a deadline, priority, or fact that isn't already in your data.
      </p>
    </div>
  );
}

export default function JarvisChat() {
  const { messages, isLoading, send, cancel, retry } = useJarvisConversation();
  const grounding = useActiveWorkspaceGroundingData();
  const [query, setQuery] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || isLoading) return;
    setQuery('');
    const context = buildJarvisChatRequestContext(grounding);
    await send(trimmed, context);
    textareaRef.current?.focus();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit(event as unknown as FormEvent);
    }
  }

  return (
    <div className="flex h-[calc(100vh-10rem)] min-h-[28rem] flex-col sm:h-[calc(100vh-8rem)]">
      <PageHeader eyebrow="JARVIS" title="Ask JARVIS" description="A dedicated conversation with JARVIS — grounded in your real study state, never fabricated." />

      <RuntimeStatusBar />

      <Card className="flex flex-1 flex-col overflow-hidden p-0">
        <div className="flex-1 space-y-3 overflow-y-auto p-4" role="log" aria-live="polite" aria-label="JARVIS conversation">
          {messages.length === 0 ? (
            <EmptyState />
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((message) => (
                <MessageBubble key={message.id} message={message} onRetry={retry} />
              ))}
            </AnimatePresence>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-slate-200 p-3 dark:border-slate-800">
          <textarea
            ref={textareaRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask JARVIS — e.g. what should I study next?"
            aria-label="Message JARVIS"
            rows={1}
            disabled={isLoading}
            className="min-h-[2.5rem] max-h-32 flex-1 resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          />
          {isLoading ? (
            <Button type="button" variant="danger" onClick={cancel} aria-label="Stop generating">
              <Square className="h-4 w-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button type="submit" variant="primary" disabled={!query.trim()} aria-label="Send message">
              <Send className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </form>
      </Card>
    </div>
  );
}
