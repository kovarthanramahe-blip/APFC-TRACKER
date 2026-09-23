import { useMemo, useState } from 'react';
import {
  Compass,
  CalendarClock,
  Plus,
  Trash2,
  Sparkles,
  ListTodo,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCcw,
  ExternalLink,
} from 'lucide-react';
import { useAppStore } from '../lib/store';
import { getWorkspaceMeta } from '../lib/workspace';
import { getLocalDateString, formatDate, cx, uuid } from '../lib/utils';
import { Card, Button, Badge, PageHeader, ProgressBar, WorkspaceComingSoon } from '../components/ui/Primitives';
import { UPSC_CSE_PRELIMS_SYLLABUS } from '../data/upscCsePrelimsSyllabus';
import { UPSC_CSE_MAINS_SYLLABUS } from '../data/upscCseMainsSyllabus';
import { UPSC_CSE_GRANULAR_NODES } from '../data/upscCseGranularTopics';
import { UPSC_CSE_PRELIMS_PYQ_BANK } from '../data/pyqUpscCsePrelims';
import { getSubjectsForPaper, getMicrosyllabusForSubject } from '../lib/upscCseSyllabus';
import {
  createUpscCseStudyPlanConfig,
  validateUpscCseStudyPlanConfig,
  computeUpscCseStudyPlanProgress,
  type UpscCseStudyPlanType,
} from '../lib/upscCseStudyPlanConfig';
import { generateUpscCseStudyPlan } from '../lib/upscCseStudyPlanGenerator';
import {
  isValidStudyTaskTitle,
  createUpscCseStudyTask,
  tasksForDate,
  overdueStudyTasks,
  upcomingStudyTasks,
  type UpscCseStudyTask,
  type UpscCseStudyTaskStatus,
} from '../lib/upscCseStudyTask';
import type { MicroTargetPriority } from '../lib/microTarget';

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PLAN_TYPE_LABELS: Record<UpscCseStudyPlanType, string> = { balanced: 'Balanced', subject_focus: 'Subject Focus', custom: 'Custom' };
const PRIORITY_TONE: Record<MicroTargetPriority, 'neutral' | 'brand' | 'danger'> = { low: 'neutral', medium: 'brand', high: 'danger' };
type ViewFilter = 'today' | 'upcoming' | 'overdue' | 'completed' | 'timeline';

function allSubjectTitles(): string[] {
  const titles = new Set<string>();
  for (const tree of [UPSC_CSE_PRELIMS_SYLLABUS, UPSC_CSE_MAINS_SYLLABUS]) {
    for (const paper of tree.papers) {
      for (const s of getSubjectsForPaper(tree, paper.id)) titles.add(s.title);
    }
  }
  return [...titles];
}

function TaskRow({
  task,
  onSetStatus,
  onDelete,
}: {
  task: UpscCseStudyTask;
  onSetStatus: (id: string, status: UpscCseStudyTaskStatus) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
      <button
        onClick={() => onSetStatus(task.id, task.status === 'completed' ? 'pending' : 'completed')}
        className={cx(
          'flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors',
          task.status === 'completed' ? 'border-transparent bg-brand-500' : 'border-slate-300 dark:border-slate-600',
        )}
        aria-label={task.status === 'completed' ? 'Mark as pending' : 'Mark as completed'}
      >
        {task.status === 'completed' && <span className="text-[10px] font-bold text-white">✓</span>}
      </button>
      <div className="min-w-0 flex-1">
        <span className={cx('text-sm', task.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-300')}>{task.title}</span>
        {task.notes && <p className="text-xs text-slate-400 mt-0.5">{task.notes}</p>}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          {task.subject && <Badge tone="neutral">{task.subject}</Badge>}
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
            <CalendarClock className="h-3 w-3" /> {formatDate(task.date)}
          </span>
          {task.targetMinutes !== undefined && (
            <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
              <Clock className="h-3 w-3" /> {task.targetMinutes}m
            </span>
          )}
          {task.priority && <Badge tone={PRIORITY_TONE[task.priority]}>{task.priority}</Badge>}
        </div>
      </div>
      {task.linkedActionHref && (
        <a href={task.linkedActionHref} className="shrink-0 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-brand-600 hover:underline dark:text-brand-400">
          Open <ExternalLink className="h-3 w-3" />
        </a>
      )}
      {task.status !== 'completed' && (
        <button
          onClick={() => onSetStatus(task.id, task.status === 'in_progress' ? 'pending' : 'in_progress')}
          className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-brand-600 dark:hover:text-brand-400"
        >
          {task.status === 'in_progress' ? 'In Progress' : 'Start'}
        </button>
      )}
      <button onClick={() => onDelete(task.id)} title="Delete task" className="shrink-0 rounded-lg p-1.5 text-slate-300 hover:text-rose-500 dark:text-slate-600">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

export default function UpscCseStudyPlan() {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const coverage = useAppStore((s) => s.upscCseSyllabusCoverage);
  const attempts = useAppStore((s) => s.upscCsePrelimsPyqAttempts);
  const config = useAppStore((s) => s.upscCseStudyPlanConfig);
  const setConfig = useAppStore((s) => s.setUpscCseStudyPlanConfig);
  const studyTasks = useAppStore((s) => s.upscCseStudyTasks);
  const addStudyTasks = useAppStore((s) => s.addUpscCseStudyTasks);
  const addStudyTask = useAppStore((s) => s.addUpscCseStudyTask);
  const setStudyTaskStatus = useAppStore((s) => s.setUpscCseStudyTaskStatus);
  const deleteStudyTask = useAppStore((s) => s.deleteUpscCseStudyTask);

  const today = useMemo(() => getLocalDateString(), []);
  const subjects = useMemo(() => allSubjectTitles(), []);

  // Plan setup form
  const [showSetup, setShowSetup] = useState(false);
  const [startDate, setStartDate] = useState(today);
  const [targetDate, setTargetDate] = useState('');
  const [daysPerWeek, setDaysPerWeek] = useState(5);
  const [minutesPerDay, setMinutesPerDay] = useState(90);
  const [preferredDays, setPreferredDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [planType, setPlanType] = useState<UpscCseStudyPlanType>('balanced');
  const [focusSubject, setFocusSubject] = useState('');
  const [setupError, setSetupError] = useState<string | null>(null);

  function toggleDay(day: number) {
    setPreferredDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)));
  }

  function generateAndSave() {
    const input = { startDate, targetDate, daysPerWeek, minutesPerDay, preferredDays, planType, focusSubject: planType === 'subject_focus' ? focusSubject : undefined };
    const issues = validateUpscCseStudyPlanConfig(input);
    if (issues.length > 0) {
      setSetupError(issues[0].message);
      return;
    }
    setSetupError(null);
    const now = new Date().toISOString();
    const newConfig = createUpscCseStudyPlanConfig(input, now);
    setConfig(newConfig);

    if (planType !== 'custom') {
      const generated = generateUpscCseStudyPlan({
        config: newConfig,
        prelimsTree: UPSC_CSE_PRELIMS_SYLLABUS,
        mainsTree: UPSC_CSE_MAINS_SYLLABUS,
        granularNodes: UPSC_CSE_GRANULAR_NODES,
        coverage,
        pyqBank: UPSC_CSE_PRELIMS_PYQ_BANK,
        attempts,
        existingTasks: studyTasks,
      });
      const built = generated.map((g) => createUpscCseStudyTask(g, uuid(), now));
      if (built.length > 0) addStudyTasks(built);
    }
    setShowSetup(false);
  }

  const progress = config ? computeUpscCseStudyPlanProgress(config, today) : null;

  // Custom task form
  const [showAddTask, setShowAddTask] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskSubject, setTaskSubject] = useState('');
  const [taskMicrosyllabusId, setTaskMicrosyllabusId] = useState('');
  const [taskDate, setTaskDate] = useState(today);
  const [taskMinutes, setTaskMinutes] = useState('');
  const [taskPriority, setTaskPriority] = useState<MicroTargetPriority>('medium');
  const [taskNotes, setTaskNotes] = useState('');

  const microsyllabusOptions = useMemo(() => {
    if (!taskSubject) return [];
    for (const tree of [UPSC_CSE_PRELIMS_SYLLABUS, UPSC_CSE_MAINS_SYLLABUS]) {
      const subject = tree.subjects.find((s) => s.title === taskSubject);
      if (subject) return getMicrosyllabusForSubject(tree, subject.id);
    }
    return [];
  }, [taskSubject]);

  function submitCustomTask() {
    if (!isValidStudyTaskTitle(taskTitle)) return;
    const minutes = taskMinutes.trim() ? Math.max(1, Math.round(Number(taskMinutes))) : undefined;
    addStudyTask(
      createUpscCseStudyTask(
        {
          title: taskTitle,
          date: taskDate,
          targetMinutes: Number.isFinite(minutes) ? minutes : undefined,
          subject: taskSubject || undefined,
          microsyllabusId: taskMicrosyllabusId || undefined,
          priority: taskPriority,
          notes: taskNotes || undefined,
          linkedActionHref: taskMicrosyllabusId ? `/upsc-syllabus?microsyllabusId=${encodeURIComponent(taskMicrosyllabusId)}` : undefined,
        },
        uuid(),
        new Date().toISOString(),
      ),
    );
    setTaskTitle('');
    setTaskSubject('');
    setTaskMicrosyllabusId('');
    setTaskMinutes('');
    setTaskNotes('');
    setTaskPriority('medium');
    setShowAddTask(false);
  }

  const [view, setView] = useState<ViewFilter>('today');
  const todayTasks = useMemo(() => tasksForDate(studyTasks, today), [studyTasks, today]);
  const overdue = useMemo(() => overdueStudyTasks(studyTasks, today), [studyTasks, today]);
  const upcoming = useMemo(() => upcomingStudyTasks(studyTasks, today), [studyTasks, today]);
  const completed = useMemo(() => studyTasks.filter((t) => t.status === 'completed'), [studyTasks]);

  const visibleTasks = useMemo(() => {
    if (view === 'today') return todayTasks;
    if (view === 'overdue') return overdue;
    if (view === 'upcoming') return upcoming;
    if (view === 'completed') return completed;
    return [...studyTasks].sort((a, b) => a.date.localeCompare(b.date)); // timeline
  }, [view, todayTasks, overdue, upcoming, completed, studyTasks]);

  if (activeWorkspaceId !== 'upsc_cse') {
    return (
      <div>
        <PageHeader eyebrow="UPSC CSE" title="Study Plan" />
        <WorkspaceComingSoon icon={Compass} workspaceLabel={getWorkspaceMeta(activeWorkspaceId).shortLabel} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="UPSC CSE"
        title="Study Plan"
        description="A customizable planner built from the real UPSC CSE syllabus — never fabricated topics or study history."
        action={
          config ? (
            <Button variant="secondary" onClick={() => setShowSetup((v) => !v)}>
              <RefreshCcw className="h-4 w-4" /> Reconfigure
            </Button>
          ) : undefined
        }
      />

      {(!config || showSetup) && (
        <Card className="mb-6 p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">{config ? 'Reconfigure Plan' : 'Set Up Your Plan'}</h3>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="text-xs text-slate-500">
              Start date
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs text-slate-500">
              Target date
              <input type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs text-slate-500">
              Study days per week
              <input
                type="number"
                min={1}
                max={7}
                value={daysPerWeek}
                onChange={(e) => setDaysPerWeek(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-3 py-2 text-sm"
              />
            </label>
            <label className="text-xs text-slate-500">
              Minutes per study day
              <input
                type="number"
                min={1}
                value={minutesPerDay}
                onChange={(e) => setMinutesPerDay(Number(e.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="mt-3">
            <p className="mb-1.5 text-xs text-slate-500">Preferred study days (rest days stay unchecked)</p>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_LABELS.map((label, idx) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleDay(idx)}
                  className={cx(
                    'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                    preferredDays.includes(idx) ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3">
            <p className="mb-1.5 text-xs text-slate-500">Plan type</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(PLAN_TYPE_LABELS) as UpscCseStudyPlanType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPlanType(t)}
                  className={cx(
                    'rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                    planType === t ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
                  )}
                >
                  {PLAN_TYPE_LABELS[t]}
                </button>
              ))}
            </div>
          </div>

          {planType === 'subject_focus' && (
            <label className="mt-3 block text-xs text-slate-500">
              Focus subject
              <select value={focusSubject} onChange={(e) => setFocusSubject(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-3 py-2 text-sm">
                <option value="">Select a subject…</option>
                {subjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}

          {planType === 'custom' && (
            <p className="mt-3 text-xs text-slate-400">Custom plans generate no automatic tasks — add exactly what you're studying yourself below, once the plan is set up.</p>
          )}

          {setupError && <p className="mt-3 text-xs text-rose-500">{setupError}</p>}

          <div className="mt-4 flex gap-2">
            <Button onClick={generateAndSave}>{config ? 'Regenerate Plan' : 'Generate Plan'}</Button>
            {config && (
              <Button variant="secondary" onClick={() => setShowSetup(false)}>
                Cancel
              </Button>
            )}
          </div>
        </Card>
      )}

      {config && !showSetup && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-6">
            <Card className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Plan Type</p>
              <p className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-white">{PLAN_TYPE_LABELS[config.planType]}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Target Date</p>
              <p className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-white">{formatDate(config.targetDate)}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Days Remaining</p>
              <p className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-white">{progress?.remainingDays ?? 0}</p>
            </Card>
            <Card className="p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Time Elapsed</p>
              <p className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-white">{progress?.timeElapsedPct ?? 0}%</p>
              <div className="mt-2">
                <ProgressBar value={progress?.timeElapsedPct ?? 0} height="h-1.5" />
              </div>
            </Card>
          </div>

          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Study Tasks</h3>
              </div>
              <Button size="sm" onClick={() => setShowAddTask((v) => !v)}>
                <Plus className="h-4 w-4" /> Add Custom Study Task
              </Button>
            </div>

            {showAddTask && (
              <div className="mb-4 rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                <input
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="Task title…"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-3 py-2 text-sm"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={taskSubject}
                    onChange={(e) => {
                      setTaskSubject(e.target.value);
                      setTaskMicrosyllabusId('');
                    }}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-3 py-2 text-sm"
                  >
                    <option value="">No subject</option>
                    {subjects.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <select
                    value={taskMicrosyllabusId}
                    onChange={(e) => setTaskMicrosyllabusId(e.target.value)}
                    disabled={microsyllabusOptions.length === 0}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-3 py-2 text-sm disabled:opacity-50"
                  >
                    <option value="">No microsyllabus item</option>
                    {microsyllabusOptions.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <input type="date" value={taskDate} onChange={(e) => setTaskDate(e.target.value)} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-3 py-2 text-sm" />
                  <input
                    type="number"
                    min={1}
                    value={taskMinutes}
                    onChange={(e) => setTaskMinutes(e.target.value)}
                    placeholder="Minutes"
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-3 py-2 text-sm"
                  />
                  <select value={taskPriority} onChange={(e) => setTaskPriority(e.target.value as MicroTargetPriority)} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-3 py-2 text-sm">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
                <input
                  value={taskNotes}
                  onChange={(e) => setTaskNotes(e.target.value)}
                  placeholder="Notes (optional)…"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 px-3 py-2 text-sm"
                />
                <Button size="sm" onClick={submitCustomTask} disabled={!isValidStudyTaskTitle(taskTitle)}>
                  Add Task
                </Button>
              </div>
            )}

            <div className="mb-4 flex flex-wrap gap-1.5">
              {(['today', 'upcoming', 'overdue', 'completed', 'timeline'] as ViewFilter[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cx('rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors', view === v ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400')}
                >
                  {v === 'overdue' && <AlertTriangle className="mr-1 inline h-3 w-3" />}
                  {v === 'completed' && <CheckCircle2 className="mr-1 inline h-3 w-3" />}
                  {v}
                </button>
              ))}
            </div>

            {visibleTasks.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">Nothing here yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {visibleTasks.map((t) => (
                  <TaskRow key={t.id} task={t} onSetStatus={setStudyTaskStatus} onDelete={deleteStudyTask} />
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
