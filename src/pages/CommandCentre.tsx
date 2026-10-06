import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Compass, ArrowRight, Sparkles, Bot } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { getLocalDateString, cx } from '../lib/utils';
import { Card, PageHeader, Button, Badge } from '../components/ui/Primitives';
import { getWorkspaceMeta } from '../lib/workspace';
import { getWorkspaceAccent } from '../lib/workspaceAccent';
import {
  generateUpNextItems,
  type CommandCentreItem,
  type ApfcCommandCentreData,
  type UpscCseCommandCentreData,
  type PhdCommandCentreData,
} from '../lib/commandCentre';
// Phase 11 — the smallest sensible JARVIS entry point on this page (see AskJarvis below). This
// is deliberately NOT a second dashboard and never touches generateUpNextItems/the Up Next list
// above: it is its own, separate, optional request/response box a person may ignore entirely.
import { runJarvisRequest, type JarvisRuntimeResult } from '../lib/jarvis/runtime';

// Command Centre (Phase 14) — a single, workspace-agnostic "what should I do next?" entry point,
// reachable from every workspace's own nav (components/layout/nav.ts). This page itself computes
// NOTHING: every item comes from lib/commandCentre.ts's generateUpNextItems, a pure function that
// already composes each workspace's existing, already-tested engines (APFC's revision-due/weak-
// topic selectors, UPSC CSE's generateTodaysStudyItems, PhD's computePhdDashboardSnapshot/
// computePhdAnalytics). This page's own job is strictly: resolve each workspace's current data
// (live fields for the ACTIVE workspace, its own archived slice of inactiveWorkspaceOwnedData for
// the other two — lib/store.ts's existing workspace-swap architecture, read-only here, never
// mutated just to render this page), hand that to generateUpNextItems, and render + navigate.
//
// Clicking an item for a workspace that is NOT currently active switches to it first (the SAME
// setActiveWorkspaceId store action the sidebar's own WorkspaceSwitch already calls — no new
// workspace-switching mechanism), then navigates to that item's own existing actionHref. A plain
// <a href> can't safely carry that state-switch side effect, so each item is a <button> (a single
// interactive element per row, never a link nested inside another control).

const EMPTY_APFC_DATA: ApfcCommandCentreData = { completedTopics: {}, pyqAttempts: [], bookmarkedPyqIds: [], revisionQueue: {} };
const EMPTY_UPSC_CSE_DATA: UpscCseCommandCentreData = { coverage: {}, attempts: [], bookmarkedPyqIds: [], revisionQueue: {}, importedContent: [] };
const EMPTY_PHD_DATA: PhdCommandCentreData = { researchStartDate: '', topicAreas: [], microTargets: [], importedContent: [], notesCount: 0 };

export default function CommandCentre() {
  const navigate = useNavigate();
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const setActiveWorkspaceId = useAppStore((s) => s.setActiveWorkspaceId);
  const inactiveWorkspaceOwnedData = useAppStore((s) => s.inactiveWorkspaceOwnedData);

  // Live, ACTIVE-workspace-only fields — exactly what every existing dashboard already reads
  // directly off the store (see pages/Dashboard.tsx / UpscCseDashboard.tsx / PhdDashboard.tsx).
  // For the two workspaces that are NOT active, the identical fields are read below from their own
  // inactiveWorkspaceOwnedData snapshot instead — never a second, parallel copy of this data.
  const completedTopics = useAppStore((s) => s.completedTopics);
  const pyqAttempts = useAppStore((s) => s.pyqAttempts);
  const bookmarkedPyqIds = useAppStore((s) => s.bookmarkedPyqIds);
  const revisionQueue = useAppStore((s) => s.revisionQueue);
  const upscCseSyllabusCoverage = useAppStore((s) => s.upscCseSyllabusCoverage);
  const upscCsePrelimsPyqAttempts = useAppStore((s) => s.upscCsePrelimsPyqAttempts);
  const importedContent = useAppStore((s) => s.importedContent);
  const phdResearchStartDate = useAppStore((s) => s.phdResearchStartDate);
  const phdTopicAreas = useAppStore((s) => s.phdTopicAreas);
  const phdMicroTargets = useAppStore((s) => s.phdMicroTargets);
  const notes = useAppStore((s) => s.notes);

  const today = useMemo(() => getLocalDateString(), []);

  const apfcData: ApfcCommandCentreData = useMemo(() => {
    if (activeWorkspaceId === 'apfc') return { completedTopics, pyqAttempts, bookmarkedPyqIds, revisionQueue };
    const archived = inactiveWorkspaceOwnedData.apfc;
    return archived
      ? { completedTopics: archived.completedTopics, pyqAttempts: archived.pyqAttempts, bookmarkedPyqIds: archived.bookmarkedPyqIds, revisionQueue: archived.revisionQueue }
      : EMPTY_APFC_DATA;
  }, [activeWorkspaceId, completedTopics, pyqAttempts, bookmarkedPyqIds, revisionQueue, inactiveWorkspaceOwnedData.apfc]);

  const upscCseData: UpscCseCommandCentreData = useMemo(() => {
    if (activeWorkspaceId === 'upsc_cse') {
      return { coverage: upscCseSyllabusCoverage, attempts: upscCsePrelimsPyqAttempts, bookmarkedPyqIds, revisionQueue, importedContent };
    }
    const archived = inactiveWorkspaceOwnedData.upsc_cse;
    return archived
      ? {
          coverage: archived.upscCseSyllabusCoverage,
          attempts: archived.upscCsePrelimsPyqAttempts,
          bookmarkedPyqIds: archived.bookmarkedPyqIds,
          revisionQueue: archived.revisionQueue,
          importedContent: archived.importedContent,
        }
      : EMPTY_UPSC_CSE_DATA;
  }, [activeWorkspaceId, upscCseSyllabusCoverage, upscCsePrelimsPyqAttempts, bookmarkedPyqIds, revisionQueue, importedContent, inactiveWorkspaceOwnedData.upsc_cse]);

  const phdData: PhdCommandCentreData = useMemo(() => {
    if (activeWorkspaceId === 'phd_research') {
      return { researchStartDate: phdResearchStartDate, topicAreas: phdTopicAreas, microTargets: phdMicroTargets, importedContent, notesCount: notes.length };
    }
    const archived = inactiveWorkspaceOwnedData.phd_research;
    return archived
      ? {
          researchStartDate: archived.phdResearchStartDate,
          topicAreas: archived.phdTopicAreas,
          microTargets: archived.phdMicroTargets,
          importedContent: archived.importedContent,
          notesCount: archived.notes.length,
        }
      : EMPTY_PHD_DATA;
  }, [activeWorkspaceId, phdResearchStartDate, phdTopicAreas, phdMicroTargets, importedContent, notes.length, inactiveWorkspaceOwnedData.phd_research]);

  const items = useMemo(
    () => generateUpNextItems({ today, apfc: apfcData, upscCse: upscCseData, phdResearch: phdData }),
    [today, apfcData, upscCseData, phdData],
  );

  function handleItemActivate(item: CommandCentreItem) {
    if (item.workspaceId !== activeWorkspaceId) setActiveWorkspaceId(item.workspaceId);
    navigate(item.actionHref);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Command Centre"
        title="Up Next"
        description="A quick, cross-workspace look at what's actually due — APFC, UPSC CSE and PhD Research together, never a replacement for any one workspace's own dashboard."
      />

      {/* Phase 11.2 — moved above the Up Next list (was previously the last thing on the page,
          below it and its own caption). On a real device with several Up Next items, that
          position pushed Ask JARVIS below the initial viewport, making it invisible without
          scrolling in a plain screenshot — this is a visibility/placement fix, not a change to
          whether it renders (it was always unconditionally in the tree). Up Next's own
          rendering/navigation below is otherwise untouched. */}
      <AskJarvis />

      {items.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-20 px-6 text-center">
          <Sparkles className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
          <h3 className="font-display font-semibold text-slate-700 dark:text-slate-200">You're all caught up</h3>
          <p className="mt-1.5 max-w-sm text-sm text-slate-400">Nothing is due for revision or review across APFC, UPSC CSE or PhD Research right now.</p>
        </Card>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const workspace = getWorkspaceMeta(item.workspaceId);
            const accent = getWorkspaceAccent(item.workspaceId);
            return (
              <li key={item.id}>
                <Card className="p-0">
                  <button
                    type="button"
                    onClick={() => handleItemActivate(item)}
                    aria-label={`${item.actionLabel}: ${item.title} (${workspace.label})`}
                    className="flex w-full items-center gap-3 rounded-2xl p-4 text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 focus-visible:ring-offset-2 dark:hover:bg-slate-800/60 dark:focus-visible:ring-offset-slate-950"
                  >
                    <span className={cx('shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold text-white', accent.bg, accent.shadow, 'shadow-sm')}>
                      {workspace.shortLabel}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-slate-700 dark:text-slate-200">{item.title}</span>
                      {item.context && <span className="mt-0.5 block truncate text-xs text-slate-400">{item.context}</span>}
                    </span>
                    <span className={cx('hidden shrink-0 text-xs font-medium sm:inline', accent.text)}>{item.actionLabel}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true" />
                  </button>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-6 flex items-center gap-1.5 text-xs text-slate-400">
        <Compass className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        Each workspace keeps its own full dashboard — this is just a short list of what's actually due right now.
      </p>
    </div>
  );
}

const PROVENANCE_LABEL: Record<JarvisRuntimeResult['provenance']['source'], string> = {
  deterministic: 'Deterministic',
  android_local_ai: 'Android on-device AI',
  android_native_stub: 'Android bridge (stub, not a real model)',
  no_provider_available: 'No AI available',
};

const PROVENANCE_TONE: Record<JarvisRuntimeResult['provenance']['source'], 'brand' | 'success' | 'warning' | 'neutral'> = {
  deterministic: 'brand',
  android_local_ai: 'success',
  android_native_stub: 'warning',
  no_provider_available: 'neutral',
};

/**
 * Phase 11's own, smallest sensible JARVIS entry point — a plain request/response box, entirely
 * separate from the deterministic Up Next list above (which never calls this or anything in
 * lib/jarvis/runtime.ts). Always goes through runJarvisRequest(), which always calls the existing
 * deterministic handleJarvisRequest() first; this component only renders whatever comes back, and
 * never claims AI involvement runJarvisRequest() itself didn't report via `provenance`.
 */
function AskJarvis() {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<JarvisRuntimeResult | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || isLoading) return;
    setIsLoading(true);
    try {
      // 'global' — this page is explicitly cross-workspace already (see this file's own header);
      // never the per-workspace WorkspaceKind the rest of the store uses.
      const response = await runJarvisRequest({ context: { workspace: 'global', timestamp: new Date().toISOString() }, query: trimmed });
      setResult(response);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card elevated className="mb-6 border border-brand-500/20 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Bot className="h-4 w-4 shrink-0 text-brand-500" aria-hidden="true" />
        <h3 className="font-display text-sm font-semibold text-slate-700 dark:text-slate-200">Ask JARVIS</h3>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. what should I study next?"
          aria-label="Ask JARVIS a question"
          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        />
        <Button type="submit" variant="secondary" disabled={isLoading || !query.trim()}>
          {isLoading ? 'Asking…' : 'Ask'}
        </Button>
      </form>

      {result && (
        <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          <div className="mb-1.5">
            <Badge tone={PROVENANCE_TONE[result.provenance.source]}>{PROVENANCE_LABEL[result.provenance.source]}</Badge>
          </div>
          <p>{result.response.responseText}</p>
          {result.provenance.degraded && result.provenance.degradedReason && <p className="mt-1.5 text-xs text-slate-400">{result.provenance.degradedReason}</p>}
        </div>
      )}
    </Card>
  );
}
