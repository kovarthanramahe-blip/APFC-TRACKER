import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  CalendarRange,
  Sparkles,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Layers,
  Check,
  CalendarClock,
  Clock,
  Trash2,
  Plus,
  Shuffle,
  Activity,
  FlaskConical,
  X,
} from 'lucide-react';
import { useAppStore } from '../lib/store';
import { getWorkspaceMeta } from '../lib/workspace';
import { SYLLABUS } from '../data/syllabus';
import { PYQ_BANK } from '../data/pyq';
import { computePyqPerformance } from '../lib/pyqPerformance';
import {
  generateStudyPlan,
  validateStudyPlanConfig,
  type StudyPlanConfig,
  type StudyPlanTask,
  type WeekdayIndex,
  type CapacityVerdict,
  type PlanTaskType,
  type PlanTaskStatus,
} from '../lib/studyPlan';
import {
  completeStudyPlanTask,
  reopenStudyPlanTask,
  moveStudyPlanTask,
  resizeStudyPlanTask,
  removeStudyPlanTask,
  addPersonalStudyPlanTask,
  rebalanceStudyPlan,
  computeEditedCapacity,
  planHasCompletedTasks,
  MAX_TASK_MINUTES,
  type PersonalPlanTask,
} from '../lib/studyPlanEditing';
import { computeUnscheduledTopicIds } from '../lib/studyPlanAdaptive';
import { computePlanHealth, type PlanHealthInput, type PlanHealthReport, type PlanHealthVerdict } from '../lib/studyPlanHealth';
import { simulateMissedStudyDays, simulateTargetDateShift, type ScenarioResult } from '../lib/studyPlanScenarios';
import { formatDate, formatMinutes, getLocalDateString, cx } from '../lib/utils';
import { Card, Badge, Button, PageHeader, WorkspaceComingSoon } from '../components/ui/Primitives';

type TaskKind = 'syllabus' | 'personal';

const WEEKDAY_LABELS: { index: WeekdayIndex; short: string }[] = [
  { index: 0, short: 'Sun' },
  { index: 1, short: 'Mon' },
  { index: 2, short: 'Tue' },
  { index: 3, short: 'Wed' },
  { index: 4, short: 'Thu' },
  { index: 5, short: 'Fri' },
  { index: 6, short: 'Sat' },
];

const TASK_TYPE_LABEL: Record<PlanTaskType, string> = {
  coverage: 'Coverage',
  revision: 'Revision',
  pyq_practice: 'PYQ Practice',
  review: 'Review',
};

const VERDICT_META: Record<CapacityVerdict, { label: string; tone: 'success' | 'warning' | 'danger'; icon: typeof CheckCircle2 }> = {
  comfortable: { label: 'Comfortable', tone: 'success', icon: CheckCircle2 },
  tight: { label: 'Tight', tone: 'warning', icon: AlertTriangle },
  insufficient: { label: 'Insufficient', tone: 'danger', icon: AlertTriangle },
};

// P1 fix #4 — the user's LOCAL calendar date, not UTC's (see lib/utils's getLocalDateString).
function todayStr() {
  return getLocalDateString();
}

/** Groups tasks by date, dates sorted ascending — pure display-layer grouping only; the engine
 * itself already decides which date each task belongs to. Exported so it's directly testable
 * without rendering the page. */
export function groupTasksByDate(tasks: StudyPlanTask[]): [string, StudyPlanTask[]][] {
  const map = new Map<string, StudyPlanTask[]>();
  for (const task of tasks) {
    const existing = map.get(task.date);
    if (existing) existing.push(task);
    else map.set(task.date, [task]);
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
}

/** Groups a single date's tasks by phase, preserving the order they were scheduled in. */
export function groupTasksByPhase(tasks: StudyPlanTask[]): [string, StudyPlanTask[]][] {
  const map = new Map<string, StudyPlanTask[]>();
  for (const task of tasks) {
    const existing = map.get(task.phase);
    if (existing) existing.push(task);
    else map.set(task.phase, [task]);
  }
  return [...map.entries()];
}

export default function StudyPlan() {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const completedTopics = useAppStore((s) => s.completedTopics);
  const pyqAttempts = useAppStore((s) => s.pyqAttempts);
  const examDate = useAppStore((s) => s.examDate);
  const dailyGoalMinutes = useAppStore((s) => s.dailyGoalMinutes);
  const studyPlan = useAppStore((s) => s.studyPlan);
  const studyPlanGeneratedAt = useAppStore((s) => s.studyPlanGeneratedAt);
  const setStudyPlan = useAppStore((s) => s.setStudyPlan);
  const setStudyPlanTasks = useAppStore((s) => s.setStudyPlanTasks);
  const personalTasks = useAppStore((s) => s.personalStudyPlanTasks);
  const setPersonalStudyPlanTasks = useAppStore((s) => s.setPersonalStudyPlanTasks);
  const adaptStudyPlan = useAppStore((s) => s.adaptStudyPlan);

  // Sensible defaults reuse existing app conventions: examDate is already the target the rest of
  // the app counts down to, and dailyGoalMinutes is the user's own existing daily-study setting.
  const [startDate, setStartDate] = useState(studyPlan?.config.startDate ?? todayStr());
  const [targetDate, setTargetDate] = useState(studyPlan?.config.targetDate ?? examDate);
  const [studyDaysPerWeek, setStudyDaysPerWeek] = useState(studyPlan?.config.studyDaysPerWeek ?? 6);
  const [hoursPerStudyDay, setHoursPerStudyDay] = useState(studyPlan?.config.hoursPerStudyDay ?? Math.max(1, Math.round((dailyGoalMinutes / 60) * 2) / 2));
  const [preferredDays, setPreferredDays] = useState<WeekdayIndex[]>(studyPlan?.config.preferredStudyDays ?? []);
  const [restDays, setRestDays] = useState<WeekdayIndex[]>(studyPlan?.config.restDays ?? []);

  const config: StudyPlanConfig = useMemo(
    () => ({
      startDate,
      targetDate,
      studyDaysPerWeek,
      hoursPerStudyDay,
      preferredStudyDays: preferredDays.length ? preferredDays : undefined,
      restDays: restDays.length ? restDays : undefined,
    }),
    [startDate, targetDate, studyDaysPerWeek, hoursPerStudyDay, preferredDays, restDays],
  );

  const validationErrors = useMemo(() => validateStudyPlanConfig(config), [config]);

  function toggleDay(list: WeekdayIndex[], setList: (v: WeekdayIndex[]) => void, day: WeekdayIndex) {
    setList(list.includes(day) ? list.filter((d) => d !== day) : [...list, day].sort((a, b) => a - b));
  }

  function handleGenerate() {
    // P1 fix #2 — regenerating replaces `plan.tasks` wholesale (a brand-new, all-pending task
    // list), which silently discards this plan's own task-level completion history. Warn first,
    // exactly like the existing Remove-task confirmation, and only when there's actually
    // something to lose. completedTopics/PYQ/session history are never touched either way.
    if (plan && planHasCompletedTasks(plan.tasks)) {
      const confirmed = confirm(
        'Regenerating the plan will replace the current Study Plan and reset completion status for its tasks. Your syllabus, PYQ, and study-session history will not be deleted. Continue?',
      );
      if (!confirmed) return;
    }
    // The engine (lib/studyPlan.ts) is the single source of truth for plan generation — this
    // page only gathers the existing inputs it needs (real syllabus, real progress, real PYQ
    // performance via the F3 helper) and hands them over, never recomputing planning logic itself.
    const pyqPerf = computePyqPerformance(PYQ_BANK, pyqAttempts);
    const result = generateStudyPlan({ config, syllabus: SYLLABUS, completedTopics, pyqPerf });
    if (result.ok) setStudyPlan(result.plan);
  }

  const plan = studyPlan;

  // --- Editing (Stage 3) — every mutation goes through lib/studyPlanEditing's pure functions;
  // this component only picks which of the two task arrays (syllabus vs personal) to apply the
  // result to and persists it via the existing store setters. Only one inline editor (move or
  // resize) is open at a time, and edits never auto-rebalance — the user rebalances explicitly.
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);
  const [resizingTaskId, setResizingTaskId] = useState<string | null>(null);
  const [showAddPersonal, setShowAddPersonal] = useState(false);

  function handleComplete(taskId: string, kind: TaskKind) {
    if (kind === 'syllabus') {
      if (!plan) return;
      const result = completeStudyPlanTask(plan.tasks, taskId);
      if (result.ok) setStudyPlanTasks(result.tasks);
    } else {
      const result = completeStudyPlanTask(personalTasks, taskId);
      if (result.ok) setPersonalStudyPlanTasks(result.tasks);
    }
  }

  function handleReopen(taskId: string, kind: TaskKind) {
    if (kind === 'syllabus') {
      if (!plan) return;
      const result = reopenStudyPlanTask(plan.tasks, taskId);
      if (result.ok) setStudyPlanTasks(result.tasks);
    } else {
      const result = reopenStudyPlanTask(personalTasks, taskId);
      if (result.ok) setPersonalStudyPlanTasks(result.tasks);
    }
  }

  function handleMove(taskId: string, kind: TaskKind, newDate: string) {
    if (kind === 'syllabus') {
      if (!plan) return;
      const result = moveStudyPlanTask(plan.tasks, taskId, newDate, {
        validStudyDates: plan.capacity.studyDayDates,
        minutesPerStudyDay: plan.capacity.minutesPerStudyDay,
      });
      if (result.ok) setStudyPlanTasks(result.tasks);
      setActionMessage(result.warning ?? result.error ?? null);
    } else {
      const result = moveStudyPlanTask(personalTasks, taskId, newDate);
      if (result.ok) setPersonalStudyPlanTasks(result.tasks);
      setActionMessage(result.warning ?? result.error ?? null);
    }
    setMovingTaskId(null);
  }

  function handleResize(taskId: string, kind: TaskKind, minutes: number) {
    if (kind === 'syllabus') {
      if (!plan) return;
      const result = resizeStudyPlanTask(plan.tasks, taskId, minutes, plan.capacity.minutesPerStudyDay);
      if (result.ok) setStudyPlanTasks(result.tasks);
      setActionMessage(result.warning ?? result.error ?? null);
    } else {
      const result = resizeStudyPlanTask(personalTasks, taskId, minutes);
      if (result.ok) setPersonalStudyPlanTasks(result.tasks);
      setActionMessage(result.warning ?? result.error ?? null);
    }
    setResizingTaskId(null);
  }

  function handleRemove(taskId: string, kind: TaskKind) {
    if (!confirm('Remove this task from your schedule? The topic stays part of your syllabus either way.')) return;
    if (kind === 'syllabus') {
      if (!plan) return;
      const result = removeStudyPlanTask(plan.tasks, taskId);
      if (result.ok) setStudyPlanTasks(result.tasks);
      else setActionMessage(result.error ?? null);
    } else {
      const result = removeStudyPlanTask(personalTasks, taskId);
      if (result.ok) setPersonalStudyPlanTasks(result.tasks);
      else setActionMessage(result.error ?? null);
    }
  }

  function handleAddPersonal(input: { title: string; date: string; estimatedMinutes: number }) {
    const result = addPersonalStudyPlanTask(personalTasks, input);
    if (result.ok) {
      setPersonalStudyPlanTasks(result.tasks);
      setShowAddPersonal(false);
      setActionMessage(null);
    } else {
      setActionMessage(result.error ?? null);
    }
  }

  function handleRebalance() {
    if (!plan) return;
    const result = rebalanceStudyPlan(plan.capacity, plan.tasks);
    // P1 fix #1 — Rebalance never changes which topics have a task, but it CAN change which
    // tasks fit the calendar; recompute unscheduledTopicIds against the post-rebalance task list
    // so CapacitySummary's "N topics could not be scheduled" badge is never stale.
    const pyqPerf = computePyqPerformance(PYQ_BANK, pyqAttempts);
    const unscheduledTopicIds = computeUnscheduledTopicIds(result.tasks, SYLLABUS, completedTopics, pyqPerf);
    setStudyPlanTasks(result.tasks, unscheduledTopicIds);
    if (result.movedCount === 0) {
      setActionMessage('Nothing needed to move — your plan is already well balanced.');
    } else {
      const extra = result.unscheduledTaskIds.length > 0 ? ` ${result.unscheduledTaskIds.length} task(s) still don't fit before your target date.` : '';
      setActionMessage(`Rebalanced: moved ${result.movedCount} task${result.movedCount === 1 ? '' : 's'} to fit your schedule.${extra}`);
    }
  }

  // Adaptive planning (Stage 4) — an explicit, user-triggered action only; nothing calls this on
  // mount or on a timer. Reconciles the plan's remaining tasks against current progress, then
  // reuses the exact same rebalance step Rebalance Remaining Plan uses.
  function handleAdapt() {
    const pyqPerf = computePyqPerformance(PYQ_BANK, pyqAttempts);
    const result = adaptStudyPlan(SYLLABUS, pyqPerf, todayStr());
    if (!result) return;
    const parts: string[] = [];
    if (result.addedTaskIds.length) parts.push(`${result.addedTaskIds.length} added`);
    if (result.removedTaskIds.length) parts.push(`${result.removedTaskIds.length} removed`);
    if (result.movedTaskIds.length) parts.push(`${result.movedTaskIds.length} moved`);
    const summary = parts.length ? `Plan adapted: ${parts.join(', ')}.` : 'Plan adapted: no changes were needed.';
    const warning = result.warnings.length ? ` ${result.warnings.join(' ')}` : '';
    setActionMessage(summary + warning);
  }

  const editedCapacity = useMemo(
    () => (plan ? computeEditedCapacity(plan.capacity, [...plan.tasks, ...personalTasks]) : null),
    [plan, personalTasks],
  );

  // Plan Health (Stage 5) — purely derived from current state on every render, never persisted
  // (see lib/studyPlanHealth). Recomputed the same way generate/adapt gather their inputs. Shared
  // as `healthInput` with the Stage 6 scenario simulator below so both stay in sync with exactly
  // the same real-plan snapshot.
  const healthInput: PlanHealthInput | null = useMemo(() => {
    if (!plan) return null;
    const pyqPerf = computePyqPerformance(PYQ_BANK, pyqAttempts);
    return { plan, personalTasks, syllabus: SYLLABUS, completedTopics, pyqPerf, currentDate: todayStr() };
  }, [plan, personalTasks, pyqAttempts, completedTopics]);

  const planHealth = useMemo(() => (healthInput ? computePlanHealth(healthInput) : null), [healthInput]);

  // Plan Scenarios (Stage 6) — a pure "what if" simulation, run only when the user explicitly
  // presses Simulate. Held entirely in local component state: never written to the store, and
  // never touches the real plan (see lib/studyPlanScenarios). Re-simulating after the underlying
  // plan changes is left to the user — a stale scenario result is cleared automatically below
  // whenever the input it was computed from goes away or the plan regenerates.
  const [scenarioMissedDays, setScenarioMissedDays] = useState(3);
  const [scenarioShiftDays, setScenarioShiftDays] = useState(7);
  const [scenarioResult, setScenarioResult] = useState<ScenarioResult | null>(null);
  const [scenarioError, setScenarioError] = useState<string | null>(null);

  function handleSimulateMissedDays() {
    if (!healthInput) return;
    const outcome = simulateMissedStudyDays(healthInput, scenarioMissedDays);
    if (outcome.ok) {
      setScenarioResult(outcome.result);
      setScenarioError(null);
    } else {
      setScenarioResult(null);
      setScenarioError(outcome.error);
    }
  }

  function handleSimulateTargetDateShift() {
    if (!healthInput) return;
    const outcome = simulateTargetDateShift(healthInput, scenarioShiftDays);
    if (outcome.ok) {
      setScenarioResult(outcome.result);
      setScenarioError(null);
    } else {
      setScenarioResult(null);
      setScenarioError(outcome.error);
    }
  }

  function handleClearScenario() {
    setScenarioResult(null);
    setScenarioError(null);
  }

  const tasksByDate = useMemo(() => {
    if (!plan) return [];
    const dates = new Set([...plan.tasks.map((t) => t.date), ...personalTasks.map((t) => t.date)]);
    return [...dates].sort().map((date) => ({
      date,
      syllabus: plan.tasks.filter((t) => t.date === date),
      personal: personalTasks.filter((t) => t.date === date),
    }));
  }, [plan, personalTasks]);

  // Multi-Workspace OS, Stage 3A — plan generation depends on SYLLABUS (APFC's own real data);
  // a plan "generated" for a workspace with no syllabus yet would be fabricated content.
  if (activeWorkspaceId !== 'apfc') {
    return (
      <div>
        <PageHeader eyebrow="Preparation" title="Study Plan" />
        <WorkspaceComingSoon icon={CalendarRange} workspaceLabel={getWorkspaceMeta(activeWorkspaceId).shortLabel} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Preparation"
        title="Study Plan"
        description="Generate a realistic, deterministic plan from your available time and current progress."
      />

      <Card className="p-5 sm:p-6 space-y-5">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Plan Configuration</h3>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date" required>
            <DateInput value={startDate} onChange={setStartDate} />
          </Field>
          <Field label="Target date" required>
            <DateInput value={targetDate} onChange={setTargetDate} />
          </Field>
          <Field label="Study days per week" required>
            <input
              type="number"
              min={1}
              max={7}
              value={studyDaysPerWeek}
              onChange={(e) => setStudyDaysPerWeek(Math.round(Number(e.target.value) || 1))}
              className={inputClass}
            />
          </Field>
          <Field label="Hours per study day" required>
            <input
              type="number"
              min={0.5}
              max={16}
              step={0.5}
              value={hoursPerStudyDay}
              onChange={(e) => setHoursPerStudyDay(Number(e.target.value) || 0)}
              className={inputClass}
            />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Preferred study days" hint="Optional — leave blank to distribute automatically.">
            <WeekdayPicker selected={preferredDays} onToggle={(d) => toggleDay(preferredDays, setPreferredDays, d)} />
          </Field>
          <Field label="Rest days" hint="Optional — always excluded, even if also preferred.">
            <WeekdayPicker selected={restDays} onToggle={(d) => toggleDay(restDays, setRestDays, d)} />
          </Field>
        </div>

        {validationErrors.length > 0 && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10 px-4 py-3">
            <ul className="space-y-1 text-xs text-rose-700 dark:text-rose-300">
              {validationErrors.map((e) => (
                <li key={e.field}>{e.message}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button onClick={handleGenerate} disabled={validationErrors.length > 0}>
            {plan ? <RotateCcw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            {plan ? 'Regenerate Plan' : 'Generate Study Plan'}
          </Button>
          {plan && (
            <Button variant="secondary" onClick={handleRebalance}>
              <Shuffle className="h-4 w-4" /> Rebalance Remaining Plan
            </Button>
          )}
          {plan && (
            <Button variant="secondary" onClick={handleAdapt}>
              <Sparkles className="h-4 w-4" /> Adapt Plan
            </Button>
          )}
        </div>
        {plan && (
          <p className="text-[11px] text-slate-400">
            Rebalance only moves pending tasks to fit your schedule. Adapt also adds or removes tasks based on your current progress — completed work is never touched by either.
          </p>
        )}
      </Card>

      {!plan ? (
        <div className="mt-6 flex flex-col items-center justify-center py-16 text-center">
          <Sparkles className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-slate-400 text-sm">No plan generated yet — configure your available time above and generate one.</p>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-6">
          {actionMessage && (
            <div className="rounded-xl border border-brand-200 bg-brand-50 dark:border-brand-500/30 dark:bg-brand-500/10 px-4 py-3">
              <p className="text-xs text-brand-700 dark:text-brand-300">{actionMessage}</p>
            </div>
          )}
          {editedCapacity && <CapacitySummary plan={plan} edited={editedCapacity} generatedAt={studyPlanGeneratedAt} />}
          {planHealth && <PlanHealthCard health={planHealth} />}
          {plan && (
            <PlanScenariosCard
              missedDays={scenarioMissedDays}
              onMissedDaysChange={setScenarioMissedDays}
              onSimulateMissedDays={handleSimulateMissedDays}
              shiftDays={scenarioShiftDays}
              onShiftDaysChange={setScenarioShiftDays}
              onSimulateTargetDateShift={handleSimulateTargetDateShift}
              result={scenarioResult}
              error={scenarioError}
              onClear={handleClearScenario}
            />
          )}
          {plan.phases.length > 0 && <PhaseList phases={plan.phases} />}
          <AddPersonalTask show={showAddPersonal} onToggle={() => setShowAddPersonal((v) => !v)} onAdd={handleAddPersonal} />
          <TaskList
            tasksByDate={tasksByDate}
            studyDayDates={plan.capacity.studyDayDates}
            movingTaskId={movingTaskId}
            resizingTaskId={resizingTaskId}
            onStartMove={setMovingTaskId}
            onStartResize={setResizingTaskId}
            onCancelEdit={() => {
              setMovingTaskId(null);
              setResizingTaskId(null);
            }}
            onComplete={handleComplete}
            onReopen={handleReopen}
            onMove={handleMove}
            onResize={handleResize}
            onRemove={handleRemove}
          />
        </motion.div>
      )}
    </div>
  );
}

const inputClass =
  'w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40';

function DateInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />;
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function WeekdayPicker({ selected, onToggle }: { selected: WeekdayIndex[]; onToggle: (day: WeekdayIndex) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {WEEKDAY_LABELS.map(({ index, short }) => (
        <button
          key={index}
          type="button"
          onClick={() => onToggle(index)}
          className={cx(
            'rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-colors',
            selected.includes(index)
              ? 'bg-brand-600 text-white border-brand-600'
              : 'bg-transparent text-slate-500 border-slate-200 dark:border-slate-700 hover:border-brand-300 dark:text-slate-400',
          )}
        >
          {short}
        </button>
      ))}
    </div>
  );
}

function CapacitySummary({
  plan,
  edited,
  generatedAt,
}: {
  plan: NonNullable<ReturnType<typeof useAppStore.getState>['studyPlan']>;
  edited: ReturnType<typeof computeEditedCapacity>;
  generatedAt: string | null;
}) {
  const { capacity, capacityReport, coverageSummary, unscheduledTopicIds } = plan;
  // The verdict/planned-time shown here reflect the LIVE, post-edit state (edited) — the
  // original capacityReport.requiredMinutes is kept only as "what the syllabus originally
  // needed" context; everything else updates as tasks are completed/moved/resized/removed/added.
  const meta = VERDICT_META[edited.verdict];
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Capacity Summary</h3>
        <Badge tone={meta.tone}>
          <meta.icon className="h-3 w-3" /> {meta.label}
        </Badge>
      </div>

      {edited.verdict !== 'comfortable' && (
        <div
          className={cx(
            'mb-4 flex items-start gap-2 rounded-xl border px-4 py-3',
            edited.verdict === 'insufficient'
              ? 'border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10'
              : 'border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10',
          )}
        >
          <AlertTriangle className={cx('h-4 w-4 shrink-0 mt-0.5', edited.verdict === 'insufficient' ? 'text-rose-500' : 'text-amber-500')} />
          <p className={cx('text-xs', edited.verdict === 'insufficient' ? 'text-rose-700 dark:text-rose-300' : 'text-amber-700 dark:text-amber-300')}>
            {edited.message}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Target Date" value={formatDate(plan.config.targetDate)} />
        <Stat label="Available Time" value={formatMinutes(capacity.totalAvailableMinutes)} />
        <Stat label="Pending Time" value={formatMinutes(edited.plannedPendingMinutes)} />
        <Stat label="Completed" value={formatMinutes(edited.completedMinutes)} />
        <Stat label="Total Planned" value={formatMinutes(edited.totalPlannedMinutes)} />
        <Stat label="Originally Required" value={formatMinutes(capacityReport.requiredMinutes)} />
        <Stat label="Buffer Reserved" value={formatMinutes(capacity.totalAvailableMinutes - capacity.plannableMinutes)} />
        {edited.overCapacityMinutes > 0 && <Stat label="Over Capacity" value={formatMinutes(edited.overCapacityMinutes)} tone="danger" />}
      </div>

      {unscheduledTopicIds.length > 0 && (
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-rose-600 dark:text-rose-400">{unscheduledTopicIds.length} topic{unscheduledTopicIds.length === 1 ? '' : 's'}</span>{' '}
          could not be scheduled within your available time.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 dark:border-slate-800 pt-4 text-xs">
        <Badge tone="danger">{coverageSummary.needsCoverage} need coverage</Badge>
        <Badge tone="warning">{coverageSummary.needsRevision} need revision</Badge>
        <Badge tone="warning">{coverageSummary.needsPractice} need practice</Badge>
        <Badge tone="success">{coverageSummary.strong} strong</Badge>
      </div>

      {generatedAt && <p className="mt-3 text-[11px] text-slate-400">Generated {new Date(generatedAt).toLocaleString('en-IN')}</p>}
    </Card>
  );
}

function Stat({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'neutral' | 'danger' }) {
  return (
    <div className="rounded-xl bg-white/70 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800 px-3 py-2.5">
      <p className={cx('font-display text-base font-bold', tone === 'danger' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white')}>{value}</p>
      <p className="text-[11px] text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}

const HEALTH_VERDICT_META: Record<PlanHealthVerdict, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  on_track: { label: 'On Track', tone: 'success' },
  tight: { label: 'Tight', tone: 'warning' },
  at_risk: { label: 'At Risk', tone: 'warning' },
  over_capacity: { label: 'Over Capacity', tone: 'danger' },
  completed: { label: 'Completed', tone: 'success' },
};

function PlanHealthCard({ health }: { health: PlanHealthReport }) {
  const meta = HEALTH_VERDICT_META[health.verdict];
  const topBottleneck = health.bottlenecks[0]; // already sorted most-severe-first
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Plan Health</h3>
        </div>
        <Badge tone={meta.tone}>{meta.label}</Badge>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">{health.message}</p>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Required/Day" value={formatMinutes(health.required.requiredMinutesPerStudyDay)} />
        <Stat label="Available/Day" value={formatMinutes(health.required.configuredMinutesPerStudyDay)} />
        <Stat label="Topics Remaining" value={`${health.syllabus.remainingTopics}/${health.syllabus.totalTopics}`} />
        <Stat label="Planned Work Left" value={formatMinutes(health.required.remainingTaskMinutes)} />
      </div>

      {topBottleneck && (
        <div className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 px-3.5 py-2.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-700 dark:text-slate-200">{topBottleneck.title}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{topBottleneck.detail}</p>
          </div>
        </div>
      )}

      {health.recommendations[0] && <p className="mt-3 text-xs text-brand-700 dark:text-brand-300">{health.recommendations[0]}</p>}

      {/* P1 fix #3 — Plan Health and Plan Progress (Analytics) answer different questions and can
          legitimately disagree; this line is the only thing that changed here, no new logic. */}
      <p className="mt-3 text-[11px] text-slate-400">
        Plan Health checks whether your remaining workload fits your remaining time. See Plan Progress on Analytics for whether your actual pace matches the plan so far.
      </p>
    </Card>
  );
}

function scenarioTitle(result: ScenarioResult): string {
  if (result.type === 'missed_days') return `Miss ${result.missedDays} study day${result.missedDays === 1 ? '' : 's'}`;
  const { targetDateShiftDays } = result;
  if (targetDateShiftDays === 0) return 'No change to target date';
  const days = Math.abs(targetDateShiftDays);
  const direction = targetDateShiftDays > 0 ? 'Extend' : 'Shorten';
  return `${direction} target date by ${days} day${days === 1 ? '' : 's'}`;
}

function formatSignedMinutesPerDay(delta: number): string {
  if (delta === 0) return 'No change in required time/day';
  const sign = delta > 0 ? '+' : '−';
  return `${sign}${formatMinutes(Math.abs(delta))}/day required`;
}

const SCENARIO_OUTCOME_META: Record<ScenarioResult['comparison']['outcome'], { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  improves: { label: 'Improves', tone: 'success' },
  worsens: { label: 'Worsens', tone: 'danger' },
  unchanged: { label: 'Unchanged', tone: 'warning' },
};

/** Stage 6 — compact "what if" simulator. Two explicit, button-triggered scenarios (never run
 * automatically while typing); results are ephemeral local state passed in from the parent and
 * never touch the real plan/store (see lib/studyPlanScenarios). */
function PlanScenariosCard({
  missedDays,
  onMissedDaysChange,
  onSimulateMissedDays,
  shiftDays,
  onShiftDaysChange,
  onSimulateTargetDateShift,
  result,
  error,
  onClear,
}: {
  missedDays: number;
  onMissedDaysChange: (n: number) => void;
  onSimulateMissedDays: () => void;
  shiftDays: number;
  onShiftDaysChange: (n: number) => void;
  onSimulateTargetDateShift: () => void;
  result: ScenarioResult | null;
  error: string | null;
  onClear: () => void;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Plan Scenarios</h3>
        </div>
        {(result || error) && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-rose-600 dark:hover:text-rose-400"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">See how your plan would change without actually changing it.</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 px-3.5 py-3">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Miss study days</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={30}
              value={missedDays}
              onChange={(e) => onMissedDaysChange(clampInt(Number(e.target.value), 1, 30))}
              className="w-20 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-2.5 py-1.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
            <Button size="sm" variant="secondary" onClick={onSimulateMissedDays}>
              Simulate
            </Button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 px-3.5 py-3">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Change target date (days)</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={-365}
              max={365}
              value={shiftDays}
              onChange={(e) => onShiftDaysChange(clampInt(Number(e.target.value), -365, 365))}
              className="w-20 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-2.5 py-1.5 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
            <Button size="sm" variant="secondary" onClick={onSimulateTargetDateShift}>
              Simulate
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10 px-4 py-3">
          <p className="text-xs text-rose-700 dark:text-rose-300">{error}</p>
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-3 border-t border-slate-100 dark:border-slate-800 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Scenario: {scenarioTitle(result)}</p>
            <Badge tone={SCENARIO_OUTCOME_META[result.comparison.outcome].tone}>{SCENARIO_OUTCOME_META[result.comparison.outcome].label}</Badge>
          </div>

          {result.type === 'target_date_shift' && result.targetDateShiftDays < 0 && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              A negative shift shortens your preparation period — fewer days remain to complete the plan, not more.
            </p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/70 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800 px-3 py-2.5">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Current</p>
              <Badge tone={HEALTH_VERDICT_META[result.comparison.current.verdict].tone}>{HEALTH_VERDICT_META[result.comparison.current.verdict].label}</Badge>
              <p className="mt-1.5 font-display text-sm font-bold text-slate-900 dark:text-white">
                {formatMinutes(result.comparison.current.requiredMinutesPerStudyDay)}/day
              </p>
            </div>
            <div className="rounded-xl bg-white/70 dark:bg-slate-900/50 border border-slate-200/60 dark:border-slate-800 px-3 py-2.5">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Scenario</p>
              <Badge tone={HEALTH_VERDICT_META[result.comparison.scenario.verdict].tone}>{HEALTH_VERDICT_META[result.comparison.scenario.verdict].label}</Badge>
              <p className="mt-1.5 font-display text-sm font-bold text-slate-900 dark:text-white">
                {formatMinutes(result.comparison.scenario.requiredMinutesPerStudyDay)}/day
              </p>
            </div>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Impact: <span className="font-medium text-slate-700 dark:text-slate-200">{formatSignedMinutesPerDay(result.comparison.requiredMinutesPerDayDelta)}</span>
          </p>

          <p className="text-xs text-brand-700 dark:text-brand-300">{result.recommendation}</p>
        </div>
      )}
    </Card>
  );
}

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, Math.round(n)));
}

function PhaseList({ phases }: { phases: NonNullable<ReturnType<typeof useAppStore.getState>['studyPlan']>['phases'] }) {
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <Layers className="h-4 w-4 text-brand-600 dark:text-brand-400" />
        <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Phases</h3>
      </div>
      <div className="space-y-3">
        {phases.map((phase) => (
          <div key={phase.id} className="rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{phase.title}</p>
              <span className="text-xs text-slate-400">
                {formatDate(phase.startDate)} – {formatDate(phase.endDate)}
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{phase.focus}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}

interface TaskListDay {
  date: string;
  syllabus: StudyPlanTask[];
  personal: PersonalPlanTask[];
}

function TaskList({
  tasksByDate,
  studyDayDates,
  movingTaskId,
  resizingTaskId,
  onStartMove,
  onStartResize,
  onCancelEdit,
  onComplete,
  onReopen,
  onMove,
  onResize,
  onRemove,
}: {
  tasksByDate: TaskListDay[];
  studyDayDates: string[];
  movingTaskId: string | null;
  resizingTaskId: string | null;
  onStartMove: (id: string | null) => void;
  onStartResize: (id: string | null) => void;
  onCancelEdit: () => void;
  onComplete: (id: string, kind: TaskKind) => void;
  onReopen: (id: string, kind: TaskKind) => void;
  onMove: (id: string, kind: TaskKind, date: string) => void;
  onResize: (id: string, kind: TaskKind, minutes: number) => void;
  onRemove: (id: string, kind: TaskKind) => void;
}) {
  if (tasksByDate.length === 0) {
    return (
      <Card className="p-5 sm:p-6">
        <p className="text-sm text-slate-400">Every topic is already in good shape — no tasks were scheduled.</p>
      </Card>
    );
  }

  const rowProps = { movingTaskId, resizingTaskId, onStartMove, onStartResize, onCancelEdit, onComplete, onReopen, onMove, onResize, onRemove, studyDayDates };

  return (
    <Card className="p-5 sm:p-6">
      <h3 className="mb-4 font-display font-semibold text-slate-800 dark:text-slate-100">Schedule</h3>
      <div className="space-y-4 max-h-[36rem] overflow-y-auto pr-1">
        {tasksByDate.map(({ date, syllabus, personal }) => {
          const byPhase = groupTasksByPhase(syllabus);
          return (
            <div key={date} className="rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3">
              <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
              </p>
              <div className="space-y-3">
                {personal.length > 0 && (
                  <div>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Personal</p>
                    <ul className="space-y-1.5">
                      {personal.map((t) => (
                        <TaskRow key={t.id} id={t.id} date={t.date} title={t.title} reason={t.reason} estimatedMinutes={t.estimatedMinutes} status={t.status} kind="personal" {...rowProps} />
                      ))}
                    </ul>
                  </div>
                )}
                {byPhase.map(([phase, phaseTasks]) => (
                  <div key={phase}>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{TASK_TYPE_LABEL[phaseTasks[0].taskType]}</p>
                    <ul className="space-y-1.5">
                      {phaseTasks.map((t) => (
                        <TaskRow key={t.id} id={t.id} date={t.date} title={t.title} reason={t.reason} estimatedMinutes={t.estimatedMinutes} status={t.status} kind="syllabus" {...rowProps} />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function TaskRow({
  id,
  date,
  title,
  reason,
  estimatedMinutes,
  status,
  kind,
  studyDayDates,
  movingTaskId,
  resizingTaskId,
  onStartMove,
  onStartResize,
  onCancelEdit,
  onComplete,
  onReopen,
  onMove,
  onResize,
  onRemove,
}: {
  id: string;
  date: string;
  title: string;
  reason: string;
  estimatedMinutes: number;
  status: PlanTaskStatus;
  kind: TaskKind;
  studyDayDates: string[];
  movingTaskId: string | null;
  resizingTaskId: string | null;
  onStartMove: (id: string | null) => void;
  onStartResize: (id: string | null) => void;
  onCancelEdit: () => void;
  onComplete: (id: string, kind: TaskKind) => void;
  onReopen: (id: string, kind: TaskKind) => void;
  onMove: (id: string, kind: TaskKind, date: string) => void;
  onResize: (id: string, kind: TaskKind, minutes: number) => void;
  onRemove: (id: string, kind: TaskKind) => void;
}) {
  const isCompleted = status === 'completed';
  const isMoving = movingTaskId === id;
  const isResizing = resizingTaskId === id;
  // Syllabus tasks may only move to a configured study day; personal tasks can go on any date.
  const dateOptions = kind === 'syllabus' ? studyDayDates : undefined;

  return (
    <li className="rounded-lg border border-slate-100 dark:border-slate-800/80 px-2.5 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={cx('truncate text-sm', isCompleted ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200')}>{title}</p>
          <p className="truncate text-[11px] text-slate-400">{reason}</p>
        </div>
        <span className="shrink-0 text-xs text-slate-400">{estimatedMinutes} min</span>
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        {isCompleted ? (
          <IconButton label="Reopen" onClick={() => onReopen(id, kind)} icon={RotateCcw} />
        ) : (
          <>
            <IconButton label="Complete" onClick={() => onComplete(id, kind)} icon={Check} />
            <IconButton label="Move" onClick={() => onStartMove(isMoving ? null : id)} icon={CalendarClock} active={isMoving} />
            <IconButton label="Edit time" onClick={() => onStartResize(isResizing ? null : id)} icon={Clock} active={isResizing} />
            <IconButton label="Remove" onClick={() => onRemove(id, kind)} icon={Trash2} tone="danger" />
          </>
        )}
      </div>

      {isMoving && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="date"
            defaultValue={date}
            min={dateOptions?.[0]}
            max={dateOptions?.[dateOptions.length - 1]}
            list={dateOptions ? `study-dates-${id}` : undefined}
            onKeyDown={(e) => e.key === 'Enter' && onMove(id, kind, (e.target as HTMLInputElement).value)}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            id={`move-input-${id}`}
          />
          {dateOptions && (
            <datalist id={`study-dates-${id}`}>
              {dateOptions.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          )}
          <Button size="sm" onClick={() => onMove(id, kind, (document.getElementById(`move-input-${id}`) as HTMLInputElement).value)}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancelEdit}>
            Cancel
          </Button>
        </div>
      )}

      {isResizing && (
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={MAX_TASK_MINUTES}
            defaultValue={estimatedMinutes}
            onKeyDown={(e) => e.key === 'Enter' && onResize(id, kind, Math.round(Number((e.target as HTMLInputElement).value) || 0))}
            className="w-24 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            id={`resize-input-${id}`}
          />
          <span className="text-xs text-slate-400">min</span>
          <Button size="sm" onClick={() => onResize(id, kind, Math.round(Number((document.getElementById(`resize-input-${id}`) as HTMLInputElement).value) || 0))}>
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancelEdit}>
            Cancel
          </Button>
        </div>
      )}
    </li>
  );
}

function IconButton({
  label,
  icon: Icon,
  onClick,
  active,
  tone = 'neutral',
}: {
  label: string;
  icon: typeof Check;
  onClick: () => void;
  active?: boolean;
  tone?: 'neutral' | 'danger';
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={cx(
        'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium border transition-colors',
        active
          ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
          : tone === 'danger'
          ? 'border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-600 hover:border-rose-300 dark:hover:text-rose-400'
          : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:text-brand-600 hover:border-brand-300 dark:text-slate-400 dark:hover:text-brand-400',
      )}
    >
      <Icon className="h-3 w-3" /> {label}
    </button>
  );
}

function AddPersonalTask({
  show,
  onToggle,
  onAdd,
}: {
  show: boolean;
  onToggle: () => void;
  onAdd: (input: { title: string; date: string; estimatedMinutes: number }) => void;
}) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayStr());
  const [minutes, setMinutes] = useState(30);

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Personal Tasks</h3>
        <Button variant="secondary" size="sm" onClick={onToggle}>
          <Plus className="h-3.5 w-3.5" /> Add Personal Task
        </Button>
      </div>
      {show && (
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
          <Field label="Title" required>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Revise my notes"
              className={inputClass}
            />
          </Field>
          <Field label="Date" required>
            <DateInput value={date} onChange={setDate} />
          </Field>
          <Field label="Minutes" required>
            <input
              type="number"
              min={1}
              max={MAX_TASK_MINUTES}
              value={minutes}
              onChange={(e) => setMinutes(Math.round(Number(e.target.value) || 0))}
              className={cx(inputClass, 'sm:w-24')}
            />
          </Field>
          <Button
            onClick={() => {
              onAdd({ title, date, estimatedMinutes: minutes });
              setTitle('');
            }}
            disabled={!title.trim()}
          >
            Add
          </Button>
        </div>
      )}
    </Card>
  );
}
