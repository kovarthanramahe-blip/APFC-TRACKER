import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, Timer, Target, FileClock, CheckCircle2, Brain, Flame, CalendarDays, ArrowUpRight } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { getWorkspaceMeta } from '../lib/workspace';
import { getLocalDateString, formatMinutes, cx } from '../lib/utils';
import {
  buildStudyHistoryEvents,
  filterEventsByRange,
  groupEventsByDate,
  computeStudyHistoryAnalytics,
  type StudyHistoryEvent,
  type StudyHistoryEventKind,
} from '../lib/studyHistory';
import { addDaysToDateString } from '../lib/studyProgressInsights';
import { Card, PageHeader, StatCard, Badge, SectionHeader, EmptyState, Tabs, type TabItem, cardEntrance, WorkspaceComingSoon } from '../components/ui/Primitives';

// Study History (Phase 21) — a chronological, read-only log of activity this app ALREADY records
// (see lib/studyHistory.ts's own header: every event is built from a real field on an existing
// PomodoroSession/PYQAttempt/MockTestAttempt/StudyPlanTask/RevisionItem, never invented). Scope
// matches pages/Revision.tsx's/pages/StudyPlan.tsx's own precedent: APFC-only, since several of
// these sources (pyqAttempts, the study plan's own tasks) are APFC-specific data — a non-APFC
// workspace gets the same WorkspaceComingSoon gate those pages already use.

type RangeKey = 'today' | '7d' | '30d';
const RANGE_TABS: TabItem[] = [
  { id: 'today', label: 'Today' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
];

const KIND_META: Record<StudyHistoryEventKind, { icon: typeof Timer; badgeTone: 'brand' | 'jarvis' | 'success' | 'gold' | 'neutral' }> = {
  focus_session: { icon: Timer, badgeTone: 'brand' },
  pyq_attempt: { icon: Target, badgeTone: 'jarvis' },
  mock_test: { icon: FileClock, badgeTone: 'gold' },
  task_completed: { icon: CheckCircle2, badgeTone: 'success' },
  revision_review: { icon: Brain, badgeTone: 'neutral' },
};

export default function History() {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const sessions = useAppStore((s) => s.sessions);
  const pyqAttempts = useAppStore((s) => s.pyqAttempts);
  const attempts = useAppStore((s) => s.attempts);
  const studyPlan = useAppStore((s) => s.studyPlan);
  const personalStudyPlanTasks = useAppStore((s) => s.personalStudyPlanTasks);
  const revisionQueue = useAppStore((s) => s.revisionQueue);
  const studyLog = useAppStore((s) => s.studyLog);

  const [range, setRange] = useState<RangeKey>('7d');
  const today = useMemo(() => getLocalDateString(), []);

  const allEvents = useMemo(
    () =>
      buildStudyHistoryEvents({
        sessions,
        pyqAttempts,
        mockTestAttempts: attempts,
        planTasks: studyPlan?.tasks ?? [],
        personalTasks: personalStudyPlanTasks,
        revisionQueue,
      }),
    [sessions, pyqAttempts, attempts, studyPlan, personalStudyPlanTasks, revisionQueue],
  );

  const rangeStart = useMemo(() => {
    if (range === 'today') return today;
    if (range === '7d') return addDaysToDateString(today, -6);
    return addDaysToDateString(today, -29);
  }, [range, today]);

  const rangeEvents = useMemo(() => filterEventsByRange(allEvents, rangeStart, today), [allEvents, rangeStart, today]);
  const grouped = useMemo(() => groupEventsByDate(rangeEvents), [rangeEvents]);

  const analytics = useMemo(() => computeStudyHistoryAnalytics(allEvents, studyLog, today), [allEvents, studyLog, today]);
  const rangeFocusMinutes = rangeEvents.reduce((sum, e) => sum + (e.kind === 'focus_session' ? e.minutes ?? 0 : 0), 0);

  if (activeWorkspaceId !== 'apfc') {
    return (
      <div>
        <PageHeader eyebrow="Study History" title="History" />
        <WorkspaceComingSoon icon={Clock} workspaceLabel={getWorkspaceMeta(activeWorkspaceId).shortLabel} />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        eyebrow="Study History"
        title="History"
        description="Every focus session, PYQ test, mock test, completed task and revision review — exactly as it happened, in order."
        action={
          <Link to="/analytics" className="inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline">
            Full Analytics <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        }
      />

      <motion.div {...cardEntrance}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={Clock} label="Total focused" value={formatMinutes(analytics.totalFocusMinutes)} accentClassName="text-brand-600 dark:text-brand-400" />
          <StatCard icon={Flame} label="Current streak" value={`${analytics.streak.current}d`} accentClassName="text-warning-600 dark:text-warning-400" />
          <StatCard icon={Timer} label={`Focused (${RANGE_TABS.find((t) => t.id === range)?.label})`} value={formatMinutes(rangeFocusMinutes)} accentClassName="text-jarvis-600 dark:text-jarvis-400" />
          <StatCard icon={CalendarDays} label="Events in range" value={`${rangeEvents.length}`} accentClassName="text-slate-500 dark:text-slate-400" />
        </div>
      </motion.div>

      <motion.div {...cardEntrance}>
        <Card className="p-4">
          <Tabs tabs={RANGE_TABS} activeId={range} onChange={(id) => setRange(id as RangeKey)} />
        </Card>
      </motion.div>

      {allEvents.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="No activity recorded yet"
          description="Complete a focus session, practice a PYQ, take a mock test, finish a planned task, or review something due, and it will show up here."
        />
      ) : grouped.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Nothing in this range" description="Try a wider date range." />
      ) : (
        <div className="space-y-4">
          {grouped.map(([date, events]) => (
            <motion.div key={date} {...cardEntrance}>
              <Card className="p-5 sm:p-6">
                <SectionHeader
                  title={new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
                  action={<Badge tone="neutral">{events.length}</Badge>}
                />
                <ul className="space-y-2">
                  {events.map((event) => (
                    <HistoryEventRow key={event.id} event={event} />
                  ))}
                </ul>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryEventRow({ event }: { event: StudyHistoryEvent }) {
  const meta = KIND_META[event.kind];
  const Icon = meta.icon;
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-slate-200/70 p-3 dark:border-slate-800">
      <span className={cx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400')}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{event.title}</p>
        <p className="truncate text-xs text-slate-400">{event.detail}</p>
      </div>
      {event.minutes !== undefined && (
        <Badge tone={meta.badgeTone} className="shrink-0 tabular-nums">
          {event.minutes}m
        </Badge>
      )}
    </li>
  );
}
