import { useEffect, useRef, useState } from 'react';
import { X, Sparkles, Loader2, AlertTriangle, FileText } from 'lucide-react';
import { explainSelection, summarizeDocument, askDocumentQuestion, type DocumentIntelligenceOutcome } from '../../lib/jarvis/repositoryDocumentIntelligence';
import type { WorkspaceKind } from '../../lib/workspace';
import { Button } from '../ui/Primitives';

// Wave 4A, Scope A — the one UI surface for the three document-aware JARVIS actions (Explain
// selection / Summarise document / Ask a question). Deliberately a sibling panel to
// DocumentAnnotator/ContextualSelectionToolbar, not code inside either of them — per this wave's
// own authorization, all document-intelligence logic lives outside the toolbar/annotator; this
// component only calls lib/jarvis/repositoryDocumentIntelligence.ts and renders what comes back.
// Follows the same responsive bottom-sheet-to-side-panel pattern AnnotationIndex already uses, so
// it looks and behaves consistently with the rest of the Premium Study Reader rather than
// inventing a second panel style.

type Mode = 'explain' | 'summarize' | 'ask';

export interface DocumentIntelligencePanelProps {
  documentId: string;
  rawText: string;
  activeWorkspaceId: WorkspaceKind;
  route?: string;
  /** Set by the caller whenever "Explain with JARVIS" is tapped on a live selection — this panel
   * runs that action immediately on mount/update and never re-runs it for the same text twice. */
  initialSelectedText?: string;
  onClose: () => void;
}

/** One real source passage, honestly labelled — shown for every outcome except 'no_evidence', so
 * the reader can always see exactly what JARVIS actually grounded on, whether or not a real AI
 * answer came back. Never a paraphrase: `citation.quote` is the exact (possibly truncated) source
 * text lib/jarvis/documents/documentQuestion.ts's own citation builder already produces. */
function EvidenceList({ evidence }: { evidence: DocumentIntelligenceOutcome['evidence'] }) {
  if (evidence.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Source passage{evidence.length > 1 ? 's' : ''}</p>
      <div className="space-y-2">
        {evidence.map((item) => (
          <blockquote key={item.citation.chunkId} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
            &ldquo;{item.citation.quote}&rdquo;
            {item.citation.page !== undefined && <span className="ml-1 text-slate-400">— page {item.citation.page}</span>}
          </blockquote>
        ))}
      </div>
    </div>
  );
}

function OutcomeView({ outcome }: { outcome: DocumentIntelligenceOutcome }) {
  if (outcome.kind === 'no_evidence') {
    return (
      <div className="flex flex-col items-center gap-1 py-8 text-center text-sm text-slate-400">
        <FileText className="h-6 w-6 text-slate-300 dark:text-slate-600" />
        <p>{outcome.reason ?? 'Nothing to show yet.'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {outcome.coverage?.truncated && (
        <div className="flex items-start gap-2 rounded-xl bg-slate-100 p-2.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          <p>
            This document is long — only the first {outcome.coverage.coveredChunks} of {outcome.coverage.totalChunks} sections were summarised. It does not cover the rest of the
            document.
          </p>
        </div>
      )}
      {outcome.kind === 'ai_answer' ? (
        <div className="rounded-xl bg-brand-50 p-3 text-sm text-slate-700 dark:bg-brand-500/10 dark:text-slate-200">
          <p className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">
            <Sparkles className="h-3 w-3" /> JARVIS
          </p>
          <p className="whitespace-pre-wrap">{outcome.aiAnswerText}</p>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{outcome.reason}</p>
        </div>
      )}
      <EvidenceList evidence={outcome.evidence} />
    </div>
  );
}

export function DocumentIntelligencePanel({ documentId, rawText, activeWorkspaceId, route, initialSelectedText, onClose }: DocumentIntelligencePanelProps) {
  const [mode, setMode] = useState<Mode>(initialSelectedText ? 'explain' : 'summarize');
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [outcome, setOutcome] = useState<DocumentIntelligenceOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [handledSelection, setHandledSelection] = useState<string | undefined>(undefined);

  // Stale-response race fix — a request-generation counter, the simplest mechanism compatible
  // with this panel's architecture (repositoryDocumentIntelligence.ts's actions take no
  // AbortSignal today, and adding one would mean widening that adapter's and/or runtime.ts's own
  // contract, which this fix deliberately avoids per its own narrow scope). Every call to run()
  // claims the next id; a request may only touch loading/error/outcome state if its own id is
  // STILL the current one by the time it settles — a newer request (any of: a second click, a new
  // initialSelectedText, or a documentId/activeWorkspaceId change) always wins, and a request that
  // settles after this component has unmounted never touches state at all. This is the ONE place
  // that reads or writes requestIdRef/mountedRef; every call site below is unchanged otherwise.
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function run(action: () => Promise<DocumentIntelligenceOutcome>) {
    const myRequestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    setOutcome(null);
    try {
      const result = await action();
      if (!mountedRef.current || myRequestId !== requestIdRef.current) return; // superseded or unmounted — never shown
      setOutcome(result);
    } catch {
      if (!mountedRef.current || myRequestId !== requestIdRef.current) return;
      // A thrown error (never expected from runDocumentIntelligenceAction's own contract, but
      // guarded defensively — e.g. a genuinely unexpected native-bridge rejection) still gets an
      // honest, safe message, never a raw stack trace, and never a silently stuck spinner.
      setError('Something went wrong while asking JARVIS. Please try again.');
    } finally {
      // A stale request's own finally must never clear a NEWER request's still-in-flight loading
      // state — only the request that is still current may flip it back off.
      if (mountedRef.current && myRequestId === requestIdRef.current) setLoading(false);
    }
  }

  // Context reset — documentId/activeWorkspaceId changing means any in-flight request was asking
  // about a document this panel is no longer showing; bump the generation so its result (success
  // or error) can never land, and clear whatever was visible for the previous context. Skipped on
  // the very first render (nothing to invalidate yet) via the ref below.
  const isFirstContextRender = useRef(true);
  useEffect(() => {
    if (isFirstContextRender.current) {
      isFirstContextRender.current = false;
      return;
    }
    requestIdRef.current += 1;
    setLoading(false);
    setError(null);
    setOutcome(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId, activeWorkspaceId]);

  useEffect(() => {
    if (initialSelectedText && initialSelectedText !== handledSelection) {
      setHandledSelection(initialSelectedText);
      setMode('explain');
      void run(() =>
        explainSelection({ documentId, activeWorkspaceId, route, timestamp: new Date().toISOString(), selectedText: initialSelectedText }),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSelectedText]);

  function handleSummarize() {
    setMode('summarize');
    void run(() => summarizeDocument({ documentId, activeWorkspaceId, route, timestamp: new Date().toISOString(), rawText }));
  }

  function handleAsk() {
    const trimmed = question.trim();
    if (!trimmed) return;
    setMode('ask');
    void run(() => askDocumentQuestion({ documentId, activeWorkspaceId, route, timestamp: new Date().toISOString(), rawText, question: trimmed }));
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm sm:hidden" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-96 sm:rounded-none sm:border-l sm:border-slate-200 sm:shadow-xl sm:dark:border-slate-800">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
          <h3 className="flex items-center gap-1.5 font-display font-semibold text-slate-800 dark:text-slate-100">
            <Sparkles className="h-4 w-4 text-brand-500" /> Ask JARVIS
          </h3>
          <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex gap-1.5 border-b border-slate-100 px-4 py-2 dark:border-slate-800">
          <Button variant={mode === 'summarize' ? 'primary' : 'secondary'} size="sm" onClick={handleSummarize}>
            Summarise document
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
            </div>
          )}
          {!loading && error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}
          {!loading && !error && outcome && <OutcomeView outcome={outcome} />}
          {!loading && !error && !outcome && mode === 'explain' && (
            <p className="text-sm text-slate-400">Select text in the document and choose &ldquo;Explain with JARVIS&rdquo;.</p>
          )}
        </div>

        <div className="border-t border-slate-100 p-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <label htmlFor="jarvis-document-question" className="sr-only">
              Ask a question about this document
            </label>
            <input
              id="jarvis-document-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAsk();
              }}
              placeholder="Ask a question about this document…"
              className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:border-brand-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
            <Button size="sm" onClick={handleAsk} disabled={!question.trim()}>
              Ask
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
