import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  MockTestAttempt,
  Note,
  PomodoroSession,
  StudyLogEntry,
  ThemeMode,
} from './types';

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

  // Settings
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  examDate: string;

  // Daily focused-study target, in minutes (gamification "today's goal")
  dailyGoalMinutes: number;
  setDailyGoalMinutes: (minutes: number) => void;

  // Device-local bookkeeping only (never synced to the cloud payload itself):
  // which signed-in account this cached local data currently belongs to, so
  // a different account signing in on the same device never adopts it.
  lastSyncedUserId: string | null;
  setLastSyncedUserId: (id: string | null) => void;

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

      theme: 'system',
      setTheme: (t) => set({ theme: t }),
      examDate: '2026-12-20',

      dailyGoalMinutes: 60,
      setDailyGoalMinutes: (minutes) => set({ dailyGoalMinutes: Math.max(5, Math.round(minutes)) }),

      lastSyncedUserId: null,
      setLastSyncedUserId: (id) => set({ lastSyncedUserId: id }),

      resetAllData: () =>
        set({
          completedTopics: {},
          notes: [],
          attempts: [],
          sessions: [],
          studyLog: {},
          starredQuestionIds: [],
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
    sessions: state.sessions,
    studyLog: state.studyLog,
    starredQuestionIds: state.starredQuestionIds,
    theme: state.theme,
    dailyGoalMinutes: state.dailyGoalMinutes,
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
    sessions: data.sessions ?? [],
    studyLog: data.studyLog ?? {},
    starredQuestionIds: data.starredQuestionIds ?? [],
    theme: data.theme ?? 'system',
    dailyGoalMinutes: data.dailyGoalMinutes ?? 60,
  });
}
