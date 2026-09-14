import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  MockTestAttempt,
  Note,
  PomodoroSession,
  PYQAttempt,
  StudyLogEntry,
  ThemeMode,
} from './types';
import type { StudyPlan, StudyPlanTask } from './studyPlan';
import type { PersonalPlanTask } from './studyPlanEditing';
import { adaptStudyPlan as runAdaptStudyPlan, type AdaptiveResult } from './studyPlanAdaptive';
import type { SyllabusSubject } from './types';
import type { PyqPerformanceSnapshot } from './pyqPerformance';
import { getLocalDateString } from './utils';
import { createRevisionQueue, recordCorrect as recordRevisionCorrectItem, recordIncorrect as recordRevisionIncorrectItem, type RevisionQueue } from './revisionQueue';

interface AppState {
  // Syllabus progress: topicId -> completed
  completedTopics: Record<string, boolean>;
  toggleTopic: (topicId: string) => void;
  markSubjectTopics: (topicIds: string[], value: boolean) => void;

  // Notes
  notes: Note[];
  upsertNote: (note: Note) => void;
  deleteNote: (id: string) => void;
  togglePinNote: (id: string) => void;

  // Mock tests
  attempts: MockTestAttempt[];
  addAttempt: (attempt: MockTestAttempt) => void;

  // PYQ practice test attempts (local-only for now — no cloud sync yet)
  pyqAttempts: PYQAttempt[];
  addPyqAttempt: (attempt: PYQAttempt) => void;

  // Pomodoro
  sessions: PomodoroSession[];
  addSession: (session: PomodoroSession) => void;

  // Study log (derived aggregate, but also directly bumped)
  studyLog: Record<string, StudyLogEntry>;
  bumpFocusMinutes: (date: string, minutes: number) => void;
  bumpTopicsCompleted: (date: string, count: number) => void;
  bumpTestsCompleted: (date: string) => void;

  // Bookmarked / starred questions for revision
  starredQuestionIds: string[];
  toggleStarredQuestion: (id: string) => void;

  // Bookmarked PYQs (previous-year questions) for later revision
  bookmarkedPyqIds: string[];
  toggleBookmarkedPyq: (id: string) => void;

  // Settings
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  examDate: string;

  // Daily focused-study target, in minutes (gamification "today's goal")
  dailyGoalMinutes: number;
  setDailyGoalMinutes: (minutes: number) => void;

  // Reward id -> ISO timestamp of when it was first detected as unlocked.
  // Doubles as "already celebrated" (key present = don't toast again) and
  // "recently unlocked" (latest timestamp), without a second reward list.
  rewardUnlocks: Record<string, string>;
  recordRewardUnlocks: (ids: string[]) => void;

  // Device-local bookkeeping only (never synced to the cloud payload itself):
  // which signed-in account this cached local data currently belongs to, so
  // a different account signing in on the same device never adopts it.
  lastSyncedUserId: string | null;
  setLastSyncedUserId: (id: string | null) => void;

  // Study Plan (Stage 2): the most recently generated plan, produced entirely by
  // lib/studyPlan's generateStudyPlan — the store only stores its output, never
  // recomputes it. Regenerating replaces this wholesale; there is no plan history.
  studyPlan: StudyPlan | null;
  studyPlanGeneratedAt: string | null;
  setStudyPlan: (plan: StudyPlan) => void;
  clearStudyPlan: () => void;

  // Study Plan editing (Stage 3): edits (complete/move/resize/remove/rebalance — see
  // lib/studyPlanEditing) replace `studyPlan.tasks` wholesale via setStudyPlanTasks, keeping
  // every other field (capacity, capacityReport, coverageSummary, phases, config) exactly as
  // generated. Personal tasks live in their own array — never mixed into the engine's own task
  // list, so they can never be mistaken for syllabus-derived tasks.
  // P1 fix #1 — `unscheduledTopicIds` is optional here: most edits (complete/move/resize/remove)
  // never change which topics have a task at all, so they omit it and it stays as-is. Rebalance
  // recomputes it live (see StudyPlan.tsx's handleRebalance) and passes the fresh value through.
  setStudyPlanTasks: (tasks: StudyPlanTask[], unscheduledTopicIds?: string[]) => void;
  personalStudyPlanTasks: PersonalPlanTask[];
  setPersonalStudyPlanTasks: (tasks: PersonalPlanTask[]) => void;

  // Study Plan adaptive planning (Stage 4): an explicit, on-demand action — never run
  // automatically — that reconciles the plan's remaining (pending) tasks against the student's
  // CURRENT progress via lib/studyPlanAdaptive's pure adaptStudyPlan(). completedTopics and
  // personalStudyPlanTasks are read straight from this store's own state; syllabus/pyqPerf/
  // currentDate come from the caller (the page), exactly like generateStudyPlan's inputs already
  // do — the store holds no app-content or "today" logic of its own. Returns the result so the
  // UI can show what changed; returns null (no-op) when there is no plan to adapt.
  adaptStudyPlan: (syllabus: SyllabusSubject[], pyqPerf: PyqPerformanceSnapshot | null, currentDate: string) => AdaptiveResult | null;

  // Revision queue (Stage 2 of the spaced-repetition feature): pure scheduling state only
  // (lib/revisionQueue's box/dueDate/lastReviewedDate/reviewCount per pyqId) — which PYQ ids are
  // even eligible (incorrect or bookmarked) is derived live by the caller from pyqAttempts/
  // bookmarkedPyqIds, never stored here, so an id never needs to be added/removed as its
  // eligibility changes. `today` is always supplied by the caller (yyyy-mm-dd, local date).
  revisionQueue: RevisionQueue;
  recordRevisionCorrect: (pyqId: string, today: string) => void;
  recordRevisionIncorrect: (pyqId: string, today: string) => void;

  // Reset
  resetAllData: () => void;
}

// P1 fix #4 — the user's LOCAL calendar date, not UTC's (see lib/utils's getLocalDateString):
// toISOString() reports the wrong day for a positive-offset timezone like IST during the early
// hours of the morning. This only changes how "today" is computed going forward — no persisted
// StudyLogEntry/task/attempt date already on disk is reinterpreted or rewritten.
function todayKey() {
  return getLocalDateString();
}

function ensureLogEntry(log: Record<string, StudyLogEntry>, date: string): StudyLogEntry {
  return log[date] ?? { date, focusMinutes: 0, topicsCompleted: 0, testsCompleted: 0 };
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      completedTopics: {},
      toggleTopic: (topicId) =>
        set((state) => {
          const wasCompleted = !!state.completedTopics[topicId];
          const next = { ...state.completedTopics, [topicId]: !wasCompleted };
          if (!wasCompleted) {
            const date = todayKey();
            const entry = ensureLogEntry(state.studyLog, date);
            return {
              completedTopics: next,
              studyLog: { ...state.studyLog, [date]: { ...entry, topicsCompleted: entry.topicsCompleted + 1 } },
            };
          }
          return { completedTopics: next };
        }),
      markSubjectTopics: (topicIds, value) =>
        set((state) => {
          const next = { ...state.completedTopics };
          topicIds.forEach((id) => {
            next[id] = value;
          });
          return { completedTopics: next };
        }),

      notes: [],
      upsertNote: (note) =>
        set((state) => {
          const idx = state.notes.findIndex((n) => n.id === note.id);
          if (idx >= 0) {
            const copy = [...state.notes];
            copy[idx] = note;
            return { notes: copy };
          }
          return { notes: [note, ...state.notes] };
        }),
      deleteNote: (id) => set((state) => ({ notes: state.notes.filter((n) => n.id !== id) })),
      togglePinNote: (id) =>
        set((state) => ({
          notes: state.notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)),
        })),

      attempts: [],
      addAttempt: (attempt) =>
        set((state) => {
          const date = todayKey();
          const entry = ensureLogEntry(state.studyLog, date);
          return {
            attempts: [attempt, ...state.attempts],
            studyLog: { ...state.studyLog, [date]: { ...entry, testsCompleted: entry.testsCompleted + 1 } },
          };
        }),

      pyqAttempts: [],
      addPyqAttempt: (attempt) =>
        set((state) => {
          const date = todayKey();
          const entry = ensureLogEntry(state.studyLog, date);
          return {
            pyqAttempts: [attempt, ...state.pyqAttempts],
            studyLog: { ...state.studyLog, [date]: { ...entry, testsCompleted: entry.testsCompleted + 1 } },
          };
        }),

      sessions: [],
      addSession: (session) =>
        set((state) => ({ sessions: [session, ...state.sessions] })),

      studyLog: {},
      bumpFocusMinutes: (date, minutes) =>
        set((state) => {
          const entry = ensureLogEntry(state.studyLog, date);
          return { studyLog: { ...state.studyLog, [date]: { ...entry, focusMinutes: entry.focusMinutes + minutes } } };
        }),
      bumpTopicsCompleted: (date, count) =>
        set((state) => {
          const entry = ensureLogEntry(state.studyLog, date);
          return { studyLog: { ...state.studyLog, [date]: { ...entry, topicsCompleted: entry.topicsCompleted + count } } };
        }),
      bumpTestsCompleted: (date) =>
        set((state) => {
          const entry = ensureLogEntry(state.studyLog, date);
          return { studyLog: { ...state.studyLog, [date]: { ...entry, testsCompleted: entry.testsCompleted + 1 } } };
        }),

      starredQuestionIds: [],
      toggleStarredQuestion: (id) =>
        set((state) => ({
          starredQuestionIds: state.starredQuestionIds.includes(id)
            ? state.starredQuestionIds.filter((x) => x !== id)
            : [...state.starredQuestionIds, id],
        })),

      bookmarkedPyqIds: [],
      toggleBookmarkedPyq: (id) =>
        set((state) => ({
          bookmarkedPyqIds: state.bookmarkedPyqIds.includes(id)
            ? state.bookmarkedPyqIds.filter((x) => x !== id)
            : [...state.bookmarkedPyqIds, id],
        })),

      theme: 'system',
      setTheme: (t) => set({ theme: t }),
      examDate: '2026-12-20',

      dailyGoalMinutes: 60,
      setDailyGoalMinutes: (minutes) => set({ dailyGoalMinutes: Math.max(5, Math.round(minutes)) }),

      rewardUnlocks: {},
      recordRewardUnlocks: (ids) =>
        set((state) => {
          if (ids.length === 0) return state;
          const now = new Date().toISOString();
          const next = { ...state.rewardUnlocks };
          for (const id of ids) {
            if (!next[id]) next[id] = now;
          }
          return { rewardUnlocks: next };
        }),

      lastSyncedUserId: null,
      setLastSyncedUserId: (id) => set({ lastSyncedUserId: id }),

      studyPlan: null,
      studyPlanGeneratedAt: null,
      setStudyPlan: (plan) => set({ studyPlan: plan, studyPlanGeneratedAt: new Date().toISOString() }),
      clearStudyPlan: () => set({ studyPlan: null, studyPlanGeneratedAt: null }),

      setStudyPlanTasks: (tasks, unscheduledTopicIds) =>
        set((state) =>
          state.studyPlan
            ? { studyPlan: { ...state.studyPlan, tasks, ...(unscheduledTopicIds !== undefined ? { unscheduledTopicIds } : {}) } }
            : state,
        ),

      personalStudyPlanTasks: [],
      setPersonalStudyPlanTasks: (tasks) => set({ personalStudyPlanTasks: tasks }),

      adaptStudyPlan: (syllabus, pyqPerf, currentDate) => {
        const state = get();
        if (!state.studyPlan) return null;
        const result = runAdaptStudyPlan({
          plan: state.studyPlan,
          personalTasks: state.personalStudyPlanTasks,
          syllabus,
          completedTopics: state.completedTopics,
          pyqPerf,
          currentDate,
        });
        // P1 fix #1 — persist the freshly recomputed unscheduledTopicIds alongside the adapted
        // tasks, so CapacitySummary never displays a stale generation-time snapshot after Adapt.
        set({ studyPlan: { ...state.studyPlan, tasks: result.updatedTasks, unscheduledTopicIds: result.unscheduledTopicIds } });
        return result;
      },

      revisionQueue: createRevisionQueue(),
      recordRevisionCorrect: (pyqId, today) =>
        set((state) => ({ revisionQueue: recordRevisionCorrectItem(state.revisionQueue, pyqId, today) })),
      recordRevisionIncorrect: (pyqId, today) =>
        set((state) => ({ revisionQueue: recordRevisionIncorrectItem(state.revisionQueue, pyqId, today) })),

      resetAllData: () =>
        set({
          completedTopics: {},
          notes: [],
          attempts: [],
          pyqAttempts: [],
          sessions: [],
          studyLog: {},
          starredQuestionIds: [],
          bookmarkedPyqIds: [],
          rewardUnlocks: {},
          studyPlan: null,
          studyPlanGeneratedAt: null,
          personalStudyPlanTasks: [],
          revisionQueue: createRevisionQueue(),
        }),
    }),
    {
      name: 'apfc-tracker-storage',
      version: 1,
    },
  ),
);

export function exportAllData() {
  const state = useAppStore.getState();
  const data = {
    completedTopics: state.completedTopics,
    notes: state.notes,
    attempts: state.attempts,
    pyqAttempts: state.pyqAttempts,
    sessions: state.sessions,
    studyLog: state.studyLog,
    starredQuestionIds: state.starredQuestionIds,
    bookmarkedPyqIds: state.bookmarkedPyqIds,
    theme: state.theme,
    dailyGoalMinutes: state.dailyGoalMinutes,
    rewardUnlocks: state.rewardUnlocks,
    studyPlan: state.studyPlan,
    studyPlanGeneratedAt: state.studyPlanGeneratedAt,
    personalStudyPlanTasks: state.personalStudyPlanTasks,
    revisionQueue: state.revisionQueue,
    exportedAt: new Date().toISOString(),
  };
  return JSON.stringify(data, null, 2);
}

export function importAllData(json: string) {
  const data = JSON.parse(json);
  useAppStore.setState({
    completedTopics: data.completedTopics ?? {},
    notes: data.notes ?? [],
    attempts: data.attempts ?? [],
    pyqAttempts: data.pyqAttempts ?? [],
    sessions: data.sessions ?? [],
    studyLog: data.studyLog ?? {},
    starredQuestionIds: data.starredQuestionIds ?? [],
    bookmarkedPyqIds: data.bookmarkedPyqIds ?? [],
    theme: data.theme ?? 'system',
    dailyGoalMinutes: data.dailyGoalMinutes ?? 60,
    rewardUnlocks: data.rewardUnlocks ?? {},
    studyPlan: data.studyPlan ?? null,
    studyPlanGeneratedAt: data.studyPlanGeneratedAt ?? null,
    personalStudyPlanTasks: data.personalStudyPlanTasks ?? [],
    revisionQueue: data.revisionQueue ?? createRevisionQueue(),
  });
}
