import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Compass,
  ArrowRight,
  Sparkles,
  Bot,
  Flame,
  Target,
  ListChecks,
  Timer,
  NotebookPen,
  Library,
  GraduationCap,
  CalendarClock,
  AlertTriangle,
  CheckCircle2,
  BookOpenCheck,
  FileText,
  Trophy,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useAppStore } from '../lib/store';
import { getLocalDateString, cx, formatDate, formatMinutes } from '../lib/utils';
import {
  Card,
  PageHeader,
  Button,
  IconButton,
  Badge,
  SectionHeader,
  StatCard,
  ProgressBar,
  ProgressRing,
  JarvisCard,
  JarvisThinkingIndicator,
  EmptyState,
  cardEntrance,
} from '../components/ui/Primitives';
import { getWorkspaceMeta, type WorkspaceKind } from '../lib/workspace';
import { getWorkspaceAccent } from '../lib/workspaceAccent';
import {
  generateUpNextItems,
  type CommandCentreItem,
  type CommandCentreItemKind,
  type ApfcCommandCentreData,
  type UpscCseCommandCentreData,
  type PhdCommandCentreData,
} from '../lib/commandCentre';
import { computeApfcHomeSnapshot, type ApfcHomeData, type ApfcHomeSnapshot } from '../lib/commandCentreHome';
import { computePhdDashboardSnapshot, type PhdDashboardSnapshot } from '../lib/phdDashboard';
import { computePhdAnalytics, type PhdAnalyticsSnapshot } from '../lib/phdAnalytics';
// Phase 11 — the smallest sensible JARVIS entry point on this page (see AskJarvis below). This
// is deliberately NOT a second dashboard and never touches generateUpNextItems/the Up Next list
// above: it is its own, separate, optional request/response box a person may ignore entirely.
import { runJarvisRequest, type JarvisRuntimeResult } from '../lib/jarvis/runtime';
// Phase 11.4 — wires AskJarvis's own request up to the EXISTING Phase 2 application tools, through
// the EXISTING Phase 3 context engine (see runtime.ts's own Phase 11.4 section). toJarvisWorkspace
// is the ONE existing conversion between this app's WorkspaceKind and JARVIS's own JarvisWorkspace
// (see applicationTools.ts's own header) — never duplicated here.
import { toJarvisWorkspace } from '../lib/jarvis/applicationTools';
import type { JarvisContextToolInputs } from '../lib/jarvis/contextEngine';

// Command Centre 2.0 (Phase 16) — evolves the existing Command Centre (Phase 14, "Up Next") into
// the flagship APFC-TRACKER home experience, WITHOUT changing this page's own existing route
// (/command-centre, already the second nav item in every workspace — see components/layout/nav.ts)
// or touching pages/Dashboard.tsx (APFC's own existing `/` home, left completely alone). Every
// number on this page comes from an already-existing, already-tested engine — generateUpNextItems
// (unchanged aggregation, now additionally kind-tagged for the JARVIS Priority Panel),
// lib/commandCentreHome's computeApfcHomeSnapshot (the SAME lib/studyPlanDailyQueue /
// lib/gamification / lib/pyqFilters+lib/revisionQueue / lib/studyProgressInsights engines
// pages/Dashboard.tsx itself already calls), and lib/phdDashboard/lib/phdAnalytics (the same ones
// pages/PhdDashboard.tsx/PhdAnalytics.tsx already call). This page's own job is strictly: resolve
// each workspace's current data (live fields for the ACTIVE workspace, its own archived slice of
// inactiveWorkspaceOwnedData for the other two — lib/store.ts's existing workspace-swap
// architecture, read-only here, never mutated just to render this page), hand that to those
// engines, and render + navigate. APFC's Today/Study Pulse/Revision/Gamification panels show
// APFC's REAL numbers regardless of which workspace is currently active — the same cross-workspace
// philosophy this page's own original "Up Next" list already established.

const EMPTY_APFC_DATA: ApfcCommandCentreData = { completedTopics: {}, pyqAttempts: [], bookmarkedPyqIds: [], revisionQueue: {} };
const EMPTY_UPSC_CSE_DATA: UpscCseCommandCentreData = { coverage: {}, attempts: [], bookmarkedPyqIds: [], revisionQueue: {}, importedContent: [] };
const EMPTY_PHD_DATA: PhdCommandCentreData = { researchStartDate: '', topicAreas: [], microTargets: [], importedContent: [], notesCount: 0 };
const EMPTY_APFC_HOME_DATA: ApfcHomeData = {
  completedTopics: {},
  pyqAttempts: [],
  bookmarkedPyqIds: [],
  revisionQueue: {},
  attempts: [],
  sessions: [],
  studyLog: {},
  starredQuestionIds: [],
  studyPlan: null,
  personalStudyPlanTasks: [],
  dailyGoalMinutes: 60,
};

function greetingForHour(hour: number): string {
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 21) return 'Good evening';
  return 'Good evening';
}

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
  // Phase 16 — additional APFC-owned fields needed for the Today/Study Pulse/Revision/
  // Gamification panels, resolved live-or-archived the same way as every field above.
  const mockTestAttempts = useAppStore((s) => s.attempts);
  const sessions = useAppStore((s) => s.sessions);
  const studyLog = useAppStore((s) => s.studyLog);
  const starredQuestionIds = useAppStore((s) => s.starredQuestionIds);
  const studyPlan = useAppStore((s) => s.studyPlan);
  const personalStudyPlanTasks = useAppStore((s) => s.personalStudyPlanTasks);
  // Global device setting (see lib/store.ts's own WorkspaceOwnedData header comment: dailyGoalMinutes
  // is explicitly NOT workspace-owned) — always live, no archived/active resolution needed.
  const dailyGoalMinutes = useAppStore((s) => s.dailyGoalMinutes);

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

  const apfcHomeData: ApfcHomeData = useMemo(() => {
    if (activeWorkspaceId === 'apfc') {
      return { completedTopics, pyqAttempts, bookmarkedPyqIds, revisionQueue, attempts: mockTestAttempts, sessions, studyLog, starredQuestionIds, studyPlan, personalStudyPlanTasks, dailyGoalMinutes };
    }
    const archived = inactiveWorkspaceOwnedData.apfc;
    return archived
      ? {
          completedTopics: archived.completedTopics,
          pyqAttempts: archived.pyqAttempts,
          bookmarkedPyqIds: archived.bookmarkedPyqIds,
          revisionQueue: archived.revisionQueue,
          attempts: archived.attempts,
          sessions: archived.sessions,
          studyLog: archived.studyLog,
          starredQuestionIds: archived.starredQuestionIds,
          studyPlan: archived.studyPlan,
          personalStudyPlanTasks: archived.personalStudyPlanTasks,
          dailyGoalMinutes,
        }
      : { ...EMPTY_APFC_HOME_DATA, dailyGoalMinutes };
  }, [
    activeWorkspaceId,
    completedTopics,
    pyqAttempts,
    bookmarkedPyqIds,
    revisionQueue,
    mockTestAttempts,
    sessions,
    studyLog,
    starredQuestionIds,
    studyPlan,
    personalStudyPlanTasks,
    dailyGoalMinutes,
    inactiveWorkspaceOwnedData.apfc,
  ]);

  const apfcHome: ApfcHomeSnapshot = useMemo(() => computeApfcHomeSnapshot(apfcHomeData, today), [apfcHomeData, today]);

  const phdSnapshot: PhdDashboardSnapshot = useMemo(
    () => computePhdDashboardSnapshot({ researchStartDate: phdData.researchStartDate, topicAreas: phdData.topicAreas, microTargets: phdData.microTargets, importedContent: phdData.importedContent, today }),
    [phdData, today],
  );
  const phdAnalytics: PhdAnalyticsSnapshot = useMemo(
    () =>
      computePhdAnalytics({
        researchStartDate: phdData.researchStartDate,
        topicAreas: phdData.topicAreas,
        microTargets: phdData.microTargets,
        importedContent: phdData.importedContent,
        notesCount: phdData.notesCount,
        today,
      }),
    [phdData, today],
  );

  const items = useMemo(
    () => generateUpNextItems({ today, apfc: apfcData, upscCse: upscCseData, phdResearch: phdData }),
    [today, apfcData, upscCseData, phdData],
  );

  function handleItemActivate(item: CommandCentreItem) {
    if (item.workspaceId !== activeWorkspaceId) setActiveWorkspaceId(item.workspaceId);
    navigate(item.actionHref);
  }

  // Command Header's primary action — the single highest-priority Up Next item when one exists
  // (the same deterministic priority order generateUpNextItems already established), otherwise a
  // real, always-available destination: the Study Plan when APFC genuinely has pending work today,
  // or Focus when it doesn't — never a fabricated "all done" CTA with nowhere real to go.
  const primaryAction = useMemo(() => {
    if (items.length > 0) {
      const top = items[0];
      return { label: top.actionLabel, onClick: () => handleItemActivate(top) };
    }
    if (apfcHome.dailyQueue.status === 'active' && apfcHome.dailyQueue.todayPending.length > 0) {
      return { label: 'Continue Studying', onClick: () => navigate('/study-plan') };
    }
    return { label: 'Start a Focus Session', onClick: () => navigate('/pomodoro') };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, apfcHome.dailyQueue, navigate]);

  const workspace = getWorkspaceMeta(activeWorkspaceId);
  const accent = getWorkspaceAccent(activeWorkspaceId);

  return (
    <div className="space-y-6 pb-10">
      <PageHeader eyebrow="Command Centre" title="Up Next" description="Your operational starting point — what's due, what's next, and a calm read on real progress across APFC, UPSC CSE and PhD Research." />

      <CommandHeader workspaceLabel={workspace.shortLabel} accentClassName={accent.text} today={today} overallSyllabusPct={apfcHome.overallSyllabusPct} primaryAction={primaryAction} />

      <motion.div {...cardEntrance}>
        <Card className="p-5 sm:p-6">
          <SectionHeader title="JARVIS Priority Panel" description="Deterministic, grounded in your real data — never generated prose." />

          {/* Phase 11.2 — AskJarvis stays unconditionally rendered here, BEFORE the Up Next list
              below, exactly like the original Command Centre: on a day with several Up Next items,
              a collapsed/conditional AskJarvis previously made it invisible without scrolling (see
              this page's own Phase 11.2 fix history) — never reintroduced. */}
          <AskJarvis activeWorkspaceId={activeWorkspaceId} today={today} apfcData={apfcData} upscCseData={upscCseData} phdData={phdData} />

          {items.length === 0 ? (
            <JarvisCard className="mt-4 flex flex-col items-center justify-center py-10 px-6 text-center">
              <Sparkles className="h-8 w-8 text-jarvis-400 dark:text-jarvis-500 mb-2" aria-hidden="true" />
              <h3 className="font-display font-semibold text-slate-700 dark:text-slate-200">You&apos;re all caught up</h3>
              <p className="mt-1 max-w-sm text-sm text-slate-400">Nothing is due for revision or review across APFC, UPSC CSE or PhD Research right now.</p>
            </JarvisCard>
          ) : (
            <ul className="mt-4 space-y-2">
              {items.map((item) => {
                const itemWorkspace = getWorkspaceMeta(item.workspaceId);
                const itemAccent = getWorkspaceAccent(item.workspaceId);
                const meta = KIND_META[item.kind ?? 'recommendation'];
                const KindIcon = meta.icon;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => handleItemActivate(item)}
                      aria-label={`${item.actionLabel}: ${item.title} (${itemWorkspace.label})`}
                      className="flex w-full items-center gap-3 rounded-2xl border border-slate-200/70 p-3.5 text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 dark:border-slate-800 dark:hover:bg-slate-800/60 dark:focus-visible:ring-offset-slate-950"
                    >
                      <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', meta.iconBg)}>
                        <KindIcon className="h-4.5 w-4.5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white', itemAccent.bg)}>{itemWorkspace.shortLabel}</span>
                          <Badge tone={meta.badgeTone} className="shrink-0">
                            {meta.label}
                          </Badge>
                        </span>
                        <span className="mt-1 block truncate text-sm font-medium text-slate-700 dark:text-slate-200">{item.title}</span>
                        {item.context && <span className="mt-0.5 block truncate text-xs text-slate-400">{item.context}</span>}
                      </span>
                      <span className="hidden shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400 sm:inline">{item.actionLabel}</span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </motion.div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <TodayCommandPanel home={apfcHome} />
          <QuickActions />
          <StudyPulse home={apfcHome} />
          <RevisionPreview buckets={apfcHome.revisionBuckets} />
        </div>
        <div className="space-y-6">
          <ResearchPulse snapshot={phdSnapshot} analytics={phdAnalytics} hasAnyPhdData={phdData.topicAreas.length > 0 || phdData.importedContent.length > 0} />
          <GamificationPanel home={apfcHome} />
          <RecentContinue notes={notes} sessions={sessions} />
        </div>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------------------------
// 1. Command Header
// --------------------------------------------------------------------------------------------

function CommandHeader({
  workspaceLabel,
  accentClassName,
  today,
  overallSyllabusPct,
  primaryAction,
}: {
  workspaceLabel: string;
  accentClassName: string;
  today: string;
  overallSyllabusPct: number;
  primaryAction: { label: string; onClick: () => void };
}) {
  const greeting = greetingForHour(new Date().getHours());
  return (
    <motion.div {...cardEntrance}>
      <Card elevated className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0">
          <p className={cx('text-xs font-semibold uppercase tracking-widest', accentClassName)}>{formatDate(today)}</p>
          <h2 className="mt-1 font-display text-xl font-bold text-slate-900 dark:text-white sm:text-2xl">
            {greeting}. Currently in {workspaceLabel}.
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">APFC syllabus: {overallSyllabusPct}% complete overall.</p>
        </div>
        <Button size="lg" onClick={primaryAction.onClick} className="shrink-0">
          {primaryAction.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </Card>
    </motion.div>
  );
}

// --------------------------------------------------------------------------------------------
// 2. JARVIS Priority Panel
// --------------------------------------------------------------------------------------------

// KIND_META and the Up Next list's own rendering live inline in the main CommandCentre() function
// above (not extracted into a separate component) so handleItemActivate is called directly at the
// click site — the exact same structure the original Command Centre used, preserving every
// existing structural guarantee (AskJarvis unconditional and before the list, Up Next still
// navigating via handleItemActivate) without a parallel, differently-shaped code path.
const KIND_META: Record<CommandCentreItemKind, { label: string; badgeTone: 'danger' | 'jarvis' | 'success'; iconBg: string; icon: typeof AlertTriangle }> = {
  warning: { label: 'Needs attention', badgeTone: 'danger', iconBg: 'bg-danger-100 text-danger-600 dark:bg-danger-500/15 dark:text-danger-400', icon: AlertTriangle },
  recommendation: { label: 'Recommended', badgeTone: 'jarvis', iconBg: 'bg-jarvis-100 text-jarvis-600 dark:bg-jarvis-500/15 dark:text-jarvis-400', icon: Sparkles },
  action: { label: 'In progress', badgeTone: 'success', iconBg: 'bg-success-100 text-success-600 dark:bg-success-500/15 dark:text-success-400', icon: CheckCircle2 },
};

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

interface AskJarvisProps {
  activeWorkspaceId: WorkspaceKind;
  today: string;
  apfcData: ApfcCommandCentreData;
  upscCseData: UpscCseCommandCentreData;
  phdData: PhdCommandCentreData;
}

/**
 * Phase 11's own, smallest sensible JARVIS entry point — a plain request/response box, entirely
 * separate from the deterministic Up Next list above (which never calls this or anything in
 * lib/jarvis/runtime.ts). Always goes through runJarvisRequest(), which always calls the existing
 * deterministic handleJarvisRequest() first; this component only renders whatever comes back, and
 * never claims AI involvement runJarvisRequest() itself didn't report via `provenance`. Unchanged
 * logic from the original Command Centre — Phase 16 only adds the thinking-indicator swap on its
 * own submit button; placement (unconditional, before the Up Next list) is unchanged.
 */
function AskJarvis({ activeWorkspaceId, today, apfcData, upscCseData, phdData }: AskJarvisProps) {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<JarvisRuntimeResult | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || isLoading) return;
    setIsLoading(true);
    try {
      const workspace = toJarvisWorkspace(activeWorkspaceId);
      // Only the ACTIVE workspace's own tool input is ever included — exactly the data this page
      // already has live (see this file's own header on live vs. archived inactiveWorkspaceOwnedData
      // fields), never a guess at, or a snapshot of, a workspace that isn't currently active.
      const toolInputs: JarvisContextToolInputs = {
        'global.workspace_state': { activeWorkspaceId },
        ...(workspace === 'apfc' ? { 'apfc.study_state': { ...apfcData, today } } : {}),
        ...(workspace === 'upsc'
          ? {
              'upsc.study_state': { ...upscCseData, today },
              'upsc.current_affairs_revision': { importedContent: upscCseData.importedContent, revisionQueue: upscCseData.revisionQueue, today },
            }
          : {}),
        ...(workspace === 'phd' ? { 'phd.research_state': { ...phdData, today } } : {}),
      };
      const response = await runJarvisRequest({ context: { workspace, timestamp: new Date().toISOString() }, query: trimmed, toolInputs });
      setResult(response);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Card className="mb-4 border border-jarvis-500/20 bg-jarvis-50/40 p-4 dark:bg-jarvis-500/5">
      <div className="mb-3 flex items-center gap-2">
        <Bot className="h-4 w-4 shrink-0 text-jarvis-600 dark:text-jarvis-400" aria-hidden="true" />
        <h3 className="font-display text-sm font-semibold text-slate-700 dark:text-slate-200">Ask JARVIS</h3>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. what should I study next?"
          aria-label="Ask JARVIS a question"
          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        />
        <Button type="submit" variant="secondary" disabled={isLoading || !query.trim()}>
          {isLoading ? (
            <>
              <JarvisThinkingIndicator label="JARVIS is thinking" /> Asking
            </>
          ) : (
            'Ask'
          )}
        </Button>
      </form>

      {result && (
        <div className="mt-3 rounded-xl bg-white/70 p-3 text-sm text-slate-600 dark:bg-slate-900/60 dark:text-slate-300">
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

// --------------------------------------------------------------------------------------------
// 3. Today Command Panel
// --------------------------------------------------------------------------------------------

function TodayCommandPanel({ home }: { home: ApfcHomeSnapshot }) {
  const remaining = home.dailyQueue.status === 'active' ? home.dailyQueue.todayPending.length : 0;
  const completed = home.dailyQueue.status === 'active' ? home.dailyQueue.todayCompletedCount : 0;
  return (
    <motion.div {...cardEntrance}>
      <Card className="p-5 sm:p-6">
        <SectionHeader title="Today" description="APFC — your whole day in a glance." />
        {/* lg: not sm: — this panel sits inside a lg:col-span-2 nested column (see the main return
            below), so its real rendered width at a tablet-class viewport (e.g. 800px, Xiaomi Pad 6
            portrait) is far narrower than the viewport itself once the sidebar is accounted for;
            sm:'s 640px viewport threshold fired well before there was room for 4 StatCards
            (icon + label + value each), clipping/wrapping their labels unreadably — confirmed via
            this phase's own visual validation. lg: (1024px) is the point this column actually has
            enough width. */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={Timer} label="Focus today" value={formatMinutes(home.todayFocusMinutes)} accentClassName="text-brand-600 dark:text-brand-400" />
          <StatCard icon={Target} label="Daily target" value={formatMinutes(home.dailyGoalMinutes)} accentClassName="text-primary-600 dark:text-primary-400" />
          <StatCard icon={ListChecks} label="Tasks remaining" value={`${remaining}`} accentClassName="text-jarvis-600 dark:text-jarvis-400" />
          <StatCard icon={Flame} label="Streak" value={`${home.gamification.streaks.current}d`} accentClassName="text-warning-600 dark:text-warning-400" />
        </div>
        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              {formatMinutes(home.todayFocusMinutes)} of {formatMinutes(home.dailyGoalMinutes)}
            </span>
            {completed > 0 && <span>{completed} completed today</span>}
          </div>
          <ProgressBar value={home.todayFocusMinutes} max={Math.max(home.dailyGoalMinutes, 1)} colorClassName="bg-primary-600" />
        </div>
      </Card>
    </motion.div>
  );
}

// --------------------------------------------------------------------------------------------
// 4. Quick Actions
// --------------------------------------------------------------------------------------------

function QuickActions() {
  const navigate = useNavigate();
  const actions: { icon: typeof Timer; label: string; href: string }[] = [
    { icon: Timer, label: 'Start Focus', href: '/pomodoro' },
    { icon: ListChecks, label: 'Study Plan', href: '/study-plan' },
    { icon: NotebookPen, label: 'Add Note', href: '/notes' },
    { icon: BookOpenCheck, label: 'Revise PYQs', href: '/revision' },
    { icon: Bot, label: 'Ask JARVIS', href: '/jarvis' },
    { icon: Library, label: 'Repository', href: '/repository' },
  ];
  return (
    <motion.div {...cardEntrance}>
      <Card className="p-5 sm:p-6">
        <SectionHeader title="Quick Actions" />
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
          {actions.map((action) => (
            <button
              key={action.href}
              type="button"
              onClick={() => navigate(action.href)}
              className="flex flex-col items-center gap-1.5 rounded-2xl p-3 text-center transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus dark:hover:bg-slate-800/60"
            >
              <IconButton icon={action.icon} label={action.label} variant="secondary" className="pointer-events-none" />
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">{action.label}</span>
            </button>
          ))}
        </div>
      </Card>
    </motion.div>
  );
}

// --------------------------------------------------------------------------------------------
// 5. Study Pulse
// --------------------------------------------------------------------------------------------

function StudyPulse({ home }: { home: ApfcHomeSnapshot }) {
  const navigate = useNavigate();
  const weekMinutes = home.activityTrend.reduce((sum, d) => sum + d.focusMinutes, 0);
  const maxMinutes = Math.max(1, ...home.activityTrend.map((d) => d.focusMinutes));
  const hasActivity = home.activityTrend.some((d) => d.focusMinutes > 0);

  return (
    <motion.div {...cardEntrance}>
      <Card className="p-5 sm:p-6">
        <SectionHeader title="Study Pulse" description="APFC — last 7 days." />
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <button
            type="button"
            onClick={() => navigate('/syllabus')}
            title="Open Syllabus Tracker"
            className="flex shrink-0 flex-col items-center gap-2 rounded-2xl p-2 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus dark:hover:bg-slate-800/60"
          >
            <ProgressRing value={home.overallSyllabusPct} radius={34} strokeWidth={7} colorClassName="text-primary-600" className="h-20 w-20" />
            <p className="text-center text-xs text-slate-500 dark:text-slate-400">
              Syllabus
              <br />
              <span className="font-display text-sm font-bold text-slate-800 dark:text-slate-100">{home.overallSyllabusPct}%</span>
            </p>
          </button>
          <div className="w-full flex-1">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>This week</span>
              <span>{formatMinutes(weekMinutes)}</span>
            </div>
            {!hasActivity ? (
              <p className="py-4 text-center text-sm text-slate-400">No study activity in the last 7 days yet.</p>
            ) : (
              <div className="flex items-end justify-between gap-1.5">
                {home.activityTrend.map((day) => {
                  const heightPct = Math.max(4, (day.focusMinutes / maxMinutes) * 100);
                  return (
                    <div key={day.date} className="flex flex-1 flex-col items-center gap-1">
                      <div className="flex h-16 w-full items-end">
                        <div className={cx('w-full rounded-md', day.focusMinutes > 0 ? 'bg-primary-500' : 'bg-slate-100 dark:bg-slate-800')} style={{ height: `${heightPct}%` }} />
                      </div>
                      <span className="text-[10px] text-slate-400">{new Date(day.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

// --------------------------------------------------------------------------------------------
// 6. Revision Preview
// --------------------------------------------------------------------------------------------

function RevisionPreview({ buckets }: { buckets: ApfcHomeSnapshot['revisionBuckets'] }) {
  const navigate = useNavigate();
  const rows: { label: string; count: number; tone: 'danger' | 'warning' | 'jarvis' | 'neutral' }[] = [
    { label: 'Overdue', count: buckets.overdue, tone: 'danger' },
    { label: 'Today', count: buckets.dueToday, tone: 'warning' },
    { label: 'Tomorrow', count: buckets.dueTomorrow, tone: 'jarvis' },
    { label: 'This Week', count: buckets.dueThisWeek, tone: 'neutral' },
  ];
  const total = buckets.overdue + buckets.dueToday + buckets.dueTomorrow + buckets.dueThisWeek;

  return (
    <motion.div {...cardEntrance}>
      <Card className="p-5 sm:p-6">
        <SectionHeader title="Revision Preview" description="APFC PYQ revision — a gateway into the full Revision OS." />
        {/* lg: not sm: on the grid below — same nested-column width reasoning as
            TodayCommandPanel's own grid. */}
        {total === 0 ? (
          <EmptyState icon={CheckCircle2} title="Nothing due for revision" description="Bookmark or miss a PYQ and it will show up here, scheduled automatically." />
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {rows.map((row) => (
              <button
                key={row.label}
                type="button"
                onClick={() => navigate('/revision')}
                disabled={row.count === 0}
                className="rounded-2xl border border-slate-200/70 p-3.5 text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-default disabled:opacity-50 disabled:hover:bg-transparent dark:border-slate-800 dark:hover:bg-slate-800/60"
              >
                <Badge tone={row.tone === 'neutral' ? 'neutral' : row.tone}>{row.label}</Badge>
                <p className="mt-2 font-display text-2xl font-bold text-slate-900 dark:text-white">{row.count}</p>
              </button>
            ))}
          </div>
        )}
      </Card>
    </motion.div>
  );
}

// --------------------------------------------------------------------------------------------
// 7. Research Pulse
// --------------------------------------------------------------------------------------------

function ResearchPulse({ snapshot, analytics, hasAnyPhdData }: { snapshot: PhdDashboardSnapshot; analytics: PhdAnalyticsSnapshot; hasAnyPhdData: boolean }) {
  const navigate = useNavigate();
  const toContinue = analytics.researchDocumentsToContinueCount + analytics.bibliographyToContinueCount;

  return (
    <motion.div {...cardEntrance}>
      <Card className="p-5 sm:p-6">
        <SectionHeader title="Research Pulse" description="PhD Research." />
        {!hasAnyPhdData ? (
          <EmptyState icon={GraduationCap} title="No research activity yet" description="Add a topic area or import a document to see your research pulse here." />
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" /> Research duration
              </span>
              <span className="font-medium text-slate-800 dark:text-slate-100">
                {snapshot.duration.years}y {snapshot.duration.months}m
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-500 dark:text-slate-400">Active targets</span>
              <span className="font-medium text-slate-800 dark:text-slate-100">{snapshot.activeTargets.length}</span>
            </div>
            {snapshot.overdueTargets.length > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 text-danger-600 dark:text-danger-400">
                  <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Overdue targets
                </span>
                <span className="font-medium text-danger-600 dark:text-danger-400">{snapshot.overdueTargets.length}</span>
              </div>
            )}
            {toContinue > 0 && (
              <button
                type="button"
                onClick={() => navigate('/phd-research')}
                className="flex w-full items-center justify-between rounded-xl bg-jarvis-50 px-3 py-2 text-sm text-jarvis-700 transition-colors hover:bg-jarvis-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus dark:bg-jarvis-500/10 dark:text-jarvis-300 dark:hover:bg-jarvis-500/15"
              >
                <span className="flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" /> {toContinue} to continue reading
                </span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            )}
            <Button variant="ghost" size="sm" className="w-full" onClick={() => navigate('/phd-dashboard')}>
              Open PhD Dashboard
            </Button>
          </div>
        )}
      </Card>
    </motion.div>
  );
}

// --------------------------------------------------------------------------------------------
// 8. Gamification / Motivation
// --------------------------------------------------------------------------------------------

function GamificationPanel({ home }: { home: ApfcHomeSnapshot }) {
  const { level } = home.gamification;
  return (
    <motion.div {...cardEntrance}>
      <Card className="p-5 sm:p-6">
        <SectionHeader title="Motivation" description="APFC." />
        <div className="flex items-center gap-4">
          <ProgressRing value={level.progressPct} radius={28} strokeWidth={6} colorClassName="text-gold-500" className="h-16 w-16" />
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-bold text-slate-900 dark:text-white">Level {level.level}</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {level.xpIntoLevel} / {level.xpForNextLevel} XP to next level
            </p>
          </div>
          <span className="flex items-center gap-1 rounded-full bg-warning-100 px-2.5 py-1 text-xs font-semibold text-warning-700 dark:bg-warning-500/15 dark:text-warning-400">
            <Flame className="h-3.5 w-3.5" aria-hidden="true" /> {home.gamification.streaks.current}d
          </span>
        </div>
        {home.rewards.nextReward && (
          <div className="mt-4 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="flex items-center gap-1 font-medium text-slate-600 dark:text-slate-300">
                <Trophy className="h-3.5 w-3.5 text-gold-500" aria-hidden="true" /> {home.rewards.nextReward.title}
              </span>
              <span className="text-slate-400">{Math.round(home.rewards.nextReward.progress(home.rewards.context))}%</span>
            </div>
            <ProgressBar value={home.rewards.nextReward.progress(home.rewards.context)} colorClassName="bg-gold-500" height="h-1.5" />
          </div>
        )}
      </Card>
    </motion.div>
  );
}

// --------------------------------------------------------------------------------------------
// 9. Recent / Continue
// --------------------------------------------------------------------------------------------

function RecentContinue({ notes, sessions }: { notes: { id: string; title: string; updatedAt: string }[]; sessions: { id: string; subject?: string; completedAt: string; mode: string }[] }) {
  const navigate = useNavigate();
  const mostRecentNote = [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const mostRecentSession = [...sessions]
    .filter((s) => s.mode === 'focus')
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0];

  const hasAny = mostRecentNote || mostRecentSession;

  return (
    <motion.div {...cardEntrance}>
      <Card className="p-5 sm:p-6">
        <SectionHeader title="Recent" />
        {!hasAny ? (
          <EmptyState icon={Compass} title="Nothing recent yet" description="Your most recently edited note or focus session will show up here." />
        ) : (
          <div className="space-y-2">
            {mostRecentNote && (
              <button
                type="button"
                onClick={() => navigate('/notes')}
                className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus dark:hover:bg-slate-800/60"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <NotebookPen className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-700 dark:text-slate-200">{mostRecentNote.title || 'Untitled note'}</span>
                  <span className="block text-xs text-slate-400">Last edited {formatDate(mostRecentNote.updatedAt.slice(0, 10))}</span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true" />
              </button>
            )}
            {mostRecentSession && (
              <button
                type="button"
                onClick={() => navigate('/pomodoro')}
                className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus dark:hover:bg-slate-800/60"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <Timer className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-700 dark:text-slate-200">Last focus session{mostRecentSession.subject ? ` — ${mostRecentSession.subject}` : ''}</span>
                  <span className="block text-xs text-slate-400">{formatDate(mostRecentSession.completedAt.slice(0, 10))}</span>
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-slate-600" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </Card>
    </motion.div>
  );
}
