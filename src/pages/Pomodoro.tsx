import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, RotateCcw, SkipForward, Coffee, BrainCircuit } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { SYLLABUS } from '../data/syllabus';
import { cx, uuid, formatMinutes } from '../lib/utils';
import { Card, Badge, Button, PageHeader } from '../components/ui/Primitives';
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

export default function Pomodoro() {
  const addSession = useAppStore((s) => s.addSession);
  const bumpFocusMinutes = useAppStore((s) => s.bumpFocusMinutes);
  const sessions = useAppStore((s) => s.sessions);

  const [mode, setMode] = useState<PomodoroSession['mode']>('focus');
  const [subject, setSubject] = useState<SubjectColorKey | 'general'>('general');
  const [secondsLeft, setSecondsLeft] = useState(DURATIONS.focus * 60);
  const [running, setRunning] = useState(false);
  const [cyclesDone, setCyclesDone] = useState(0);
  const startedAtRef = useRef<string | null>(null);

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
        bumpFocusMinutes(new Date().toISOString().slice(0, 10), elapsedMinutes);
      }
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
    if (!running && !startedAtRef.current) startedAtRef.current = new Date().toISOString();
    setRunning((r) => !r);
  }

  function reset() {
    setRunning(false);
    setSecondsLeft(DURATIONS[mode] * 60);
    startedAtRef.current = null;
  }

  const total = DURATIONS[mode] * 60;
  const pct = ((total - secondsLeft) / total) * 100;
  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  const todayFocus = sessions
    .filter((s) => s.mode === 'focus' && s.completedAt.slice(0, 10) === new Date().toISOString().slice(0, 10))
    .reduce((sum, s) => sum + s.durationMinutes, 0);

  return (
    <div>
      <PageHeader eyebrow="Deep Work" title="Pomodoro Timer" description="Structured focus sessions to build consistent, distraction-free study habits." />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card className="flex flex-col items-center p-8 sm:p-12">
          <div className="mb-6 flex gap-2 rounded-full bg-slate-100 dark:bg-slate-800 p-1">
            {(['focus', 'shortBreak', 'longBreak'] as const).map((m) => (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={cx(
                  'rounded-full px-4 py-1.5 text-xs font-semibold transition-colors',
                  mode === m ? 'bg-brand-600 text-white' : 'text-slate-500 dark:text-slate-400',
                )}
              >
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>

          <div className="relative flex h-64 w-64 items-center justify-center sm:h-72 sm:w-72">
            <svg viewBox="0 0 200 200" className="absolute inset-0 -rotate-90">
              <circle cx="100" cy="100" r="90" fill="none" stroke="currentColor" strokeWidth="10" className="text-slate-100 dark:text-slate-800" />
              <motion.circle
                cx="100"
                cy="100"
                r="90"
                fill="none"
                stroke="currentColor"
                strokeWidth="10"
                strokeLinecap="round"
                className={mode === 'focus' ? 'text-brand-500' : 'text-gold-500'}
                strokeDasharray={2 * Math.PI * 90}
                animate={{ strokeDashoffset: 2 * Math.PI * 90 * (1 - pct / 100) }}
                transition={{ duration: 0.4, ease: 'linear' }}
              />
            </svg>
            <div className="text-center">
              <p className="font-display text-5xl font-bold text-slate-900 dark:text-white tabular-nums">
                {mins}:{secs.toString().padStart(2, '0')}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {mode === 'focus' ? <BrainCircuit className="inline h-3.5 w-3.5 mr-1" /> : <Coffee className="inline h-3.5 w-3.5 mr-1" />}
                {MODE_LABEL[mode]}
              </p>
            </div>
          </div>

          {mode === 'focus' && (
            <select
              value={subject}
              onChange={(e) => setSubject(e.target.value as SubjectColorKey | 'general')}
              className="mt-6 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            >
              <option value="general">General study</option>
              {SYLLABUS.map((s) => (
                <option key={s.id} value={s.colorKey}>
                  {s.shortTitle}
                </option>
              ))}
            </select>
          )}

          <div className="mt-6 flex items-center gap-3">
            <Button variant="secondary" size="lg" onClick={reset}>
              <RotateCcw className="h-5 w-5" />
            </Button>
            <Button size="lg" className="w-36" onClick={toggleRun}>
              {running ? (
                <>
                  <Pause className="h-5 w-5" /> Pause
                </>
              ) : (
                <>
                  <Play className="h-5 w-5" /> Start
                </>
              )}
            </Button>
            <Button variant="secondary" size="lg" onClick={() => completeSession(true)}>
              <SkipForward className="h-5 w-5" />
            </Button>
          </div>

          <p className="mt-5 text-xs text-slate-400">Cycle {(cyclesDone % 4) + (running || secondsLeft < total ? 1 : 0)} of 4 before a long break</p>
        </Card>

        <div className="space-y-6">
          <Card className="p-5">
            <h3 className="mb-3 font-display font-semibold text-slate-800 dark:text-slate-100">Today</h3>
            <p className="font-display text-2xl font-bold text-slate-900 dark:text-white">{formatMinutes(todayFocus)}</p>
            <p className="text-xs text-slate-400 mt-1">focused today</p>
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
