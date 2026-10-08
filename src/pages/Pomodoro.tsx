import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useReducedMotion } from 'framer-motion';
import { Play, Pause, RotateCcw, SkipForward, Coffee, BrainCircuit, Target, CheckCircle2, Sparkles } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { SYLLABUS } from '../data/syllabus';
import { completeStudyPlanTask } from '../lib/studyPlanEditing';
import { cx, uuid, formatMinutes, getLocalDateString } from '../lib/utils';
import { Card, Badge, Button, PageHeader, ProgressRing } from '../components/ui/Primitives';
import type { PomodoroSession, SubjectColorKey } from '../lib/types';

const DURATIONS: Record<PomodoroSession['mode'], number> = {
  focus: 25,
  shortBreak: 5,
  longBreak: 15,
};

const MODE_LABEL: Record<PomodoroSession['mode'], string> = {
  focus: 'Focus',
  shortBreak: 'Short Break',
  longBreak: 'Long Break',
};

// Focus OS (Phase 20) — the existing Pomodoro engine (timer, modes, addSession/bumpFocusMinutes)
// is untouched below; this phase adds a READ-ONLY deep-link context (?context=, ?subject=) that
// every other page's own "Start Focus" action can use (Study Plan task rows, Syllabus topics,
// Revision items, Command Centre's Quick Actions), plus an explicit (never automatic) "Mark Task
// Complete" action for the one case a real task is linked (?taskId=&taskKind=). No new activity
// store: a completed session still only ever writes through addSession/bumpFocusMinutes, exactly
// as before.
type TaskKindParam = 'syllabus' | 'personal';

export default function Pomodoro() {
  const [searchParams] = useSearchParams();
  const reduceMotion = useReducedMotion();
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const addSession = useAppStore((s) => s.addSession);
  const bumpFocusMinutes = useAppStore((s) => s.bumpFocusMinutes);
  const sessions = useAppStore((s) => s.sessions);
  const studyPlan = useAppStore((s) => s.studyPlan);
  const personalStudyPlanTasks = useAppStore((s) => s.personalStudyPlanTasks);
  const setStudyPlanTasks = useAppStore((s) => s.setStudyPlanTasks);
  const setPersonalStudyPlanTasks = useAppStore((s) => s.setPersonalStudyPlanTasks);

  const [mode, setMode] = useState<PomodoroSession['mode']>('focus');
  const [subject, setSubject] = useState<SubjectColorKey | 'general'>(() => {
    const paramSubject = searchParams.get('subject');
    return paramSubject && SYLLABUS.some((s) => s.colorKey === paramSubject) ? (paramSubject as SubjectColorKey) : 'general';
  });
  const [secondsLeft, setSecondsLeft] = useState(DURATIONS.focus * 60);
  const [running, setRunning] = useState(false);
  const [cyclesDone, setCyclesDone] = useState(0);
  // Session completion acknowledgment (Phase 20) — set once a session is logged, cleared only by
  // an explicit next action (Start or Reset), never by the automatic focus->break mode switch that
  // immediately follows a full completion, so the user actually sees it.
  const [justCompleted, setJustCompleted] = useState<{ mode: PomodoroSession['mode']; minutes: number } | null>(null);
  const startedAtRef = useRef<string | null>(null);

  // Deep-link context (?taskId=&taskKind= from Study Plan, or a bare ?context= label from
  // Syllabus/Revision/Command Centre) — read-only display only; nothing here writes a task link
  // back into the session record (PomodoroSession has no taskId field, and inventing one is out of
  // scope for this phase — see this file's own header).
  const linkedTaskId = searchParams.get('taskId');
  const linkedTaskKind = searchParams.get('taskKind') as TaskKindParam | null;
  const linkedTask = useMemo(() => {
    if (!linkedTaskId || !linkedTaskKind) return null;
    if (linkedTaskKind === 'syllabus') return studyPlan?.tasks.find((t) => t.id === linkedTaskId) ?? null;
    if (linkedTaskKind === 'personal') return personalStudyPlanTasks.find((t) => t.id === linkedTaskId) ?? null;
    return null;
  }, [linkedTaskId, linkedTaskKind, studyPlan, personalStudyPlanTasks]);
  const contextLabel = linkedTask?.title ?? searchParams.get('context');

  // Multi-Workspace OS, Stage 3A — a workspace switch hides every non-'general' subject option
  // (SYLLABUS is APFC-only); reset a stale selection so the <select> never holds a value that no
  // longer has a matching <option>.
  useEffect(() => {
    if (activeWorkspaceId !== 'apfc') setSubject('general');
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          completeSession(true);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, mode]);

  function switchMode(next: PomodoroSession['mode'], autoStart = false) {
    setMode(next);
    setSecondsLeft(DURATIONS[next] * 60);
    setRunning(autoStart);
    startedAtRef.current = autoStart ? new Date().toISOString() : null;
  }

  function completeSession(fully: boolean) {
    setRunning(false);
    const elapsedMinutes = fully ? DURATIONS[mode] : Math.round((DURATIONS[mode] * 60 - secondsLeft) / 60);
    if (elapsedMinutes > 0) {
      const session: PomodoroSession = {
        id: uuid(),
        mode,
        subject,
        startedAt: startedAtRef.current ?? new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMinutes: elapsedMinutes,
        completedFully: fully,
      };
      addSession(session);
      if (mode === 'focus') {
        // The user's local calendar date, not UTC — see lib/utils.ts's getLocalDateString for why
        // (a positive-offset timezone like IST can already be "tomorrow" locally while UTC is
        // still "today", which previously mis-keyed focus minutes into the wrong studyLog date).
        bumpFocusMinutes(getLocalDateString(), elapsedMinutes);
      }
      setJustCompleted({ mode, minutes: elapsedMinutes });
    }

    if (fully && mode === 'focus') {
      const nextCycles = cyclesDone + 1;
      setCyclesDone(nextCycles);
      switchMode(nextCycles % 4 === 0 ? 'longBreak' : 'shortBreak');
    } else if (fully) {
      switchMode('focus');
    } else {
      setSecondsLeft(DURATIONS[mode] * 60);
    }
  }

  function toggleRun() {
    if (!running) {
      if (!startedAtRef.current) startedAtRef.current = new Date().toISOString();
      setJustCompleted(null);
    }
    setRunning((r) => !r);
  }

  function reset() {
    setRunning(false);
    setSecondsLeft(DURATIONS[mode] * 60);
    startedAtRef.current = null;
    setJustCompleted(null);
  }

  function markLinkedTaskComplete() {
    if (!linkedTask || !linkedTaskKind) return;
    if (linkedTaskKind === 'syllabus' && studyPlan) {
      const result = completeStudyPlanTask(studyPlan.tasks, linkedTask.id);
      if (result.ok) setStudyPlanTasks(result.tasks);
    } else if (linkedTaskKind === 'personal') {
      const result = completeStudyPlanTask(personalStudyPlanTasks, linkedTask.id);
      if (result.ok) setPersonalStudyPlanTasks(result.tasks);
    }
  }

  const total = DURATIONS[mode] * 60;
  const pct = ((total - secondsLeft) / total) * 100;
  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  // Explicit state model (Phase 20) — 'idle' (never started, or just reset), 'running', 'paused'
  // (started, stopped before finishing). A fully-finished session is represented by `justCompleted`
  // above, shown alongside whichever of these three the timer moves to next (a fresh 'idle' break/
  // focus countdown), not as a fourth mutually-exclusive state.
  const sessionState: 'idle' | 'running' | 'paused' = running ? 'running' : secondsLeft < total ? 'paused' : 'idle';
  const STATE_META: Record<typeof sessionState, { label: string; tone: 'neutral' | 'success' | 'warning' }> = {
    idle: { label: 'Idle', tone: 'neutral' },
    running: { label: 'Running', tone: 'success' },
    paused: { label: 'Paused', tone: 'warning' },
  };

  // Same local-date comparison as the bumpFocusMinutes write above — completedAt is a full ISO
  // timestamp, so its calendar date must be read via the same local-date convention, not UTC.
  const todayFocus = sessions
    .filter((s) => s.mode === 'focus' && getLocalDateString(new Date(s.completedAt)) === getLocalDateString())
    .reduce((sum, s) => sum + s.durationMinutes, 0);
  const todaySessionCount = sessions.filter((s) => getLocalDateString(new Date(s.completedAt)) === getLocalDateString()).length;

  return (
    <div>
      <PageHeader eyebrow="Deep Work" title="Pomodoro Timer" description="Structured focus sessions to build consistent, distraction-free study habits." />

      {contextLabel && (
        <div className="mb-5 flex items-center gap-3 rounded-2xl border border-brand-200/70 bg-brand-50 px-4 py-3 dark:border-brand-500/30 dark:bg-brand-500/10">
          <Target className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          <p className="min-w-0 truncate text-sm text-brand-800 dark:text-brand-200">
            <span className="font-medium">Focusing on:</span> {contextLabel}
          </p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="flex flex-col items-center p-8 sm:p-12">
          <div className="mb-4 flex items-center gap-2 rounded-full bg-slate-100 dark:bg-slate-800 p-1">
            {(['focus', 'shortBreak', 'longBreak'] as const).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={cx(
                  'min-h-[36px] rounded-full px-4 py-1.5 text-xs font-semibold transition-colors',
                  mode === m ? 'bg-brand-600 text-white' : 'text-slate-500 dark:text-slate-400',
                )}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>

          <Badge tone={STATE_META[sessionState].tone}>{STATE_META[sessionState].label}</Badge>

          <div className="relative mt-4 flex h-64 w-64 items-center justify-center sm:h-72 sm:w-72">
            <ProgressRing
              value={pct}
              radius={90}
              strokeWidth={10}
              colorClassName={mode === 'focus' ? 'text-brand-500' : 'text-gold-500'}
              trackClassName="text-slate-100 dark:text-slate-800"
              transition={reduceMotion ? { duration: 0 } : { duration: 0.4, ease: 'linear' }}
              className="absolute inset-0"
            />
            {/* role="timer" + aria-live — a screen reader hears the remaining time update as it
                counts down, not just a silently-changing number (Phase 20's accessibility
                requirement for timer controls). */}
            <div className="text-center" role="timer" aria-live="polite" aria-atomic="true">
              <p className="font-display text-5xl font-bold text-slate-900 dark:text-white tabular-nums">
                {mins}:{secs.toString().padStart(2, '0')}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {mode === 'focus' ? <BrainCircuit className="inline h-3.5 w-3.5 mr-1" aria-hidden="true" /> : <Coffee className="inline h-3.5 w-3.5 mr-1" aria-hidden="true" />}
                {MODE_LABEL[mode]}
              </p>
            </div>
          </div>

          {mode === 'focus' && (
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value as SubjectColorKey | 'general')}
              aria-label="Focus subject"
              className="mt-6 min-h-[36px] rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            >
              <option value="general">General study</option>
              {/* Multi-Workspace OS, Stage 3A — SYLLABUS is APFC's own subject list; offering it
                  as a focus-session category under a different workspace would be fabricated
                  categorisation for that workspace. */}
              {activeWorkspaceId === 'apfc' &&
                SYLLABUS.map((s) => (
                  <option key={s.id} value={s.colorKey}>
                    {s.shortTitle}
                  </option>
                ))}
            </select>
          )}

          <div className="mt-6 flex items-center gap-3">
            <Button variant="secondary" size="lg" onClick={reset} aria-label="Reset timer">
              <RotateCcw className="h-5 w-5" aria-hidden="true" />
            </Button>
            <Button size="lg" className="w-36" onClick={toggleRun}>
              {running ? (
                <>
                  <Pause className="h-5 w-5" aria-hidden="true" /> Pause
                </>
              ) : (
                <>
                  <Play className="h-5 w-5" aria-hidden="true" /> Start
                </>
              )}
            </Button>
            <Button variant="secondary" size="lg" onClick={() => completeSession(true)} aria-label="Finish session now">
              <SkipForward className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>

          <p className="mt-5 text-xs text-slate-400">Cycle {(cyclesDone % 4) + (running || secondsLeft < total ? 1 : 0)} of 4 before a long break</p>

          {justCompleted && (
            <div className="mt-5 flex w-full max-w-sm items-center gap-2 rounded-xl border border-success-200 bg-success-50 px-3.5 py-2.5 text-xs text-success-700 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-300">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                Logged a {justCompleted.minutes}m {MODE_LABEL[justCompleted.mode].toLowerCase()} session.
              </span>
              {justCompleted.mode === 'focus' && linkedTask && linkedTask.status === 'pending' && (
                <Button size="sm" variant="secondary" onClick={markLinkedTaskComplete}>
                  <Sparkles className="h-3.5 w-3.5" /> Mark Task Complete
                </Button>
              )}
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="mb-3 font-display font-semibold text-slate-800 dark:text-slate-100">Today</h3>
            <p className="font-display text-2xl font-bold text-slate-900 dark:text-white">{formatMinutes(todayFocus)}</p>
            <p className="text-xs text-slate-400 mt-1">focused today · {todaySessionCount} session{todaySessionCount === 1 ? '' : 's'}</p>
          </Card>

          <Card className="p-5">
            <h3 className="mb-3 font-display font-semibold text-slate-800 dark:text-slate-100">Recent Sessions</h3>
            {sessions.length === 0 ? (
              <p className="text-sm text-slate-400">No sessions logged yet.</p>
            ) : (
              <ul className="space-y-2.5 max-h-80 overflow-y-auto no-scrollbar">
                {sessions.slice(0, 10).map((s) => (
                  <li key={s.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={cx('h-2 w-2 rounded-full shrink-0', s.mode === 'focus' ? 'bg-brand-500' : 'bg-gold-400')} />
                      <span className="text-slate-600 dark:text-slate-300 truncate">{MODE_LABEL[s.mode]}</span>
                    </div>
                    <Badge tone={s.completedFully ? 'success' : 'neutral'}>{s.durationMinutes}m</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
