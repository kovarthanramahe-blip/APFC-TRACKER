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
  setStudyPlanTasks: (tasks: StudyPlanTask[]) => void;
  personalStudyPlanTasks: PersonalPlanTask[];
  setPersonalStudyPlanTasks: (tasks: PersonalPlanTask[]) => void;

  // Reset
  resetAllData: () => void;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function ensureLogEntry(log: Record<string, StudyLogEntry>, date: string): StudyLogEntry {
  return log[date] ?? { date, focusMinutes: 0, topicsCompleted: 0, testsCompleted: 0 };
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
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

      setStudyPlanTasks: (tasks) =>
        set((state) => (state.studyPlan ? { studyPlan: { ...state.studyPlan, tasks } } : state)),

      personalStudyPlanTasks: [],
      setPersonalStudyPlanTasks: (tasks) => set({ personalStudyPlanTasks: tasks }),

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
  });
}
