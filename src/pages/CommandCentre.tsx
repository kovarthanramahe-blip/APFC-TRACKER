import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Compass, ArrowRight, Sparkles } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { getLocalDateString, cx } from '../lib/utils';
import { Card, PageHeader } from '../components/ui/Primitives';
import { getWorkspaceMeta } from '../lib/workspace';
import { getWorkspaceAccent } from '../lib/workspaceAccent';
import {
  generateUpNextItems,
  type CommandCentreItem,
  type ApfcCommandCentreData,
  type UpscCseCommandCentreData,
  type PhdCommandCentreData,
} from '../lib/commandCentre';

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
