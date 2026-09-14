import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CalendarRange, Sparkles, RotateCcw, AlertTriangle, CheckCircle2, Layers } from 'lucide-react';
import { useAppStore } from '../lib/store';
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
} from '../lib/studyPlan';
import { formatDate, formatMinutes, cx } from '../lib/utils';
import { Card, Badge, Button, PageHeader } from '../components/ui/Primitives';

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

function todayStr() {
  return new Date().toISOString().slice(0, 10);
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
  const completedTopics = useAppStore((s) => s.completedTopics);
  const pyqAttempts = useAppStore((s) => s.pyqAttempts);
  const examDate = useAppStore((s) => s.examDate);
  const dailyGoalMinutes = useAppStore((s) => s.dailyGoalMinutes);
  const studyPlan = useAppStore((s) => s.studyPlan);
  const studyPlanGeneratedAt = useAppStore((s) => s.studyPlanGeneratedAt);
  const setStudyPlan = useAppStore((s) => s.setStudyPlan);

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
    // The engine (lib/studyPlan.ts) is the single source of truth for plan generation — this
    // page only gathers the existing inputs it needs (real syllabus, real progress, real PYQ
    // performance via the F3 helper) and hands them over, never recomputing planning logic itself.
    const pyqPerf = computePyqPerformance(PYQ_BANK, pyqAttempts);
    const result = generateStudyPlan({ config, syllabus: SYLLABUS, completedTopics, pyqPerf });
    if (result.ok) setStudyPlan(result.plan);
  }

  const plan = studyPlan;
  const tasksByDate = useMemo(() => (plan ? groupTasksByDate(plan.tasks) : []), [plan]);

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

        <Button onClick={handleGenerate} disabled={validationErrors.length > 0}>
          {plan ? <RotateCcw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
          {plan ? 'Regenerate Plan' : 'Generate Study Plan'}
        </Button>
      </Card>

      {!plan ? (
        <div className="mt-6 flex flex-col items-center justify-center py-16 text-center">
          <Sparkles className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-slate-400 text-sm">No plan generated yet — configure your available time above and generate one.</p>
        </div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-6 space-y-6">
          <CapacitySummary plan={plan} generatedAt={studyPlanGeneratedAt} />
          {plan.phases.length > 0 && <PhaseList phases={plan.phases} />}
          <TaskList tasksByDate={tasksByDate} />
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

function CapacitySummary({ plan, generatedAt }: { plan: NonNullable<ReturnType<typeof useAppStore.getState>['studyPlan']>; generatedAt: string | null }) {
  const { capacity, capacityReport, coverageSummary, unscheduledTopicIds } = plan;
  const meta = VERDICT_META[capacityReport.verdict];
  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Capacity Summary</h3>
        <Badge tone={meta.tone}>
          <meta.icon className="h-3 w-3" /> {meta.label}
        </Badge>
      </div>

      {capacityReport.verdict === 'insufficient' && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10 px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-rose-500" />
          <p className="text-xs text-rose-700 dark:text-rose-300">{capacityReport.message}</p>
        </div>
      )}
      {capacityReport.verdict === 'tight' && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10 px-4 py-3">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
          <p className="text-xs text-amber-700 dark:text-amber-300">{capacityReport.message}</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Target Date" value={formatDate(plan.config.targetDate)} />
        <Stat label="Available Time" value={formatMinutes(capacity.totalAvailableMinutes)} />
        <Stat label="Planned Time" value={formatMinutes(plan.tasks.reduce((sum, t) => sum + t.estimatedMinutes, 0))} />
        <Stat label="Estimated Required" value={formatMinutes(capacityReport.requiredMinutes)} />
        <Stat label="Buffer Reserved" value={formatMinutes(capacity.totalAvailableMinutes - capacity.plannableMinutes)} />
        {capacityReport.deficitMinutes > 0 && <Stat label="Deficit" value={formatMinutes(capacityReport.deficitMinutes)} tone="danger" />}
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

function TaskList({ tasksByDate }: { tasksByDate: [string, NonNullable<ReturnType<typeof useAppStore.getState>['studyPlan']>['tasks']][] }) {
  if (tasksByDate.length === 0) {
    return (
      <Card className="p-5 sm:p-6">
        <p className="text-sm text-slate-400">Every topic is already in good shape — no tasks were scheduled.</p>
      </Card>
    );
  }
  return (
    <Card className="p-5 sm:p-6">
      <h3 className="mb-4 font-display font-semibold text-slate-800 dark:text-slate-100">Schedule</h3>
      <div className="space-y-4 max-h-[32rem] overflow-y-auto pr-1">
        {tasksByDate.map(([date, tasks]) => {
          const byPhase = groupTasksByPhase(tasks);
          return (
            <div key={date} className="rounded-xl border border-slate-200 dark:border-slate-800 px-4 py-3">
              <p className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                {new Date(date + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
              </p>
              <div className="space-y-3">
                {byPhase.map(([phase, phaseTasks]) => (
                  <div key={phase}>
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{TASK_TYPE_LABEL[phaseTasks[0].taskType]}</p>
                    <ul className="space-y-1.5">
                      {phaseTasks.map((task) => (
                        <li key={task.id} className="flex items-start justify-between gap-3 text-sm">
                          <div className="min-w-0">
                            <p className="truncate text-slate-700 dark:text-slate-200">{task.title}</p>
                            <p className="truncate text-[11px] text-slate-400">{task.reason}</p>
                          </div>
                          <span className="shrink-0 text-xs text-slate-400">{task.estimatedMinutes} min</span>
                        </li>
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
