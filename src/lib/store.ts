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
import { DEFAULT_WORKSPACE_ID, type WorkspaceKind } from './workspace';
import type { ImportedContent } from './contentImport';

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

  // Import-First Content Repository foundation: generic, workspace-scoped records produced by
  // lib/contentImport.ts's pipeline (note/question_bank/descriptive_questions/pyq/
  // research_document/bibliography/other — see that module for the full ImportedContent shape).
  // Workspace-owned exactly like notes/attempts/etc. above — archived/restored by
  // setActiveWorkspaceId's swap, never per-item filtered. No UI writes to this yet; it exists so
  // the persistence/migration layer is ready before one does. `updateImportedContent` cannot
  // change `id` or `workspaceId` — moving an item to a different workspace is not something a
  // generic update should ever silently allow.
  importedContent: ImportedContent[];
  addImportedContent: (item: ImportedContent) => void;
  updateImportedContent: (id: string, updates: Partial<Omit<ImportedContent, 'id' | 'workspaceId'>>) => void;
  deleteImportedContent: (id: string) => void;

  // Multi-Workspace OS: which workspace (see lib/workspace.ts) is currently active. Always 'apfc'
  // for now — there is still no switcher UI (Stage 2 makes the mechanism real and tested; a later
  // stage adds the UI to actually call setActiveWorkspaceId). Excluded from resetAllData (like
  // `theme`, a setting rather than data to wipe), but — unlike a plain device preference — IS
  // included in exportAllData/importAllData/cloud sync: every workspace-owned field below (notes,
  // completedTopics, etc.) is only meaningful together with the workspace id it belongs to, so
  // that pairing must travel with them on any full-state replace (see setActiveWorkspaceId and
  // importAllData). This intentionally differs from lastSyncedUserId, which stays device-local for
  // an unrelated reason (detecting an account change on THIS device) that doesn't apply here.
  activeWorkspaceId: WorkspaceKind;
  // Multi-Workspace OS, Stage 2: switching workspaces archives every workspace-owned field's
  // current value under the OUTGOING workspace's id here, then restores whatever was previously
  // archived for the INCOMING workspace (or a fresh empty snapshot the first time). See
  // WorkspaceOwnedData / emptyWorkspaceOwnedData below and setActiveWorkspaceId's implementation.
  // Round-trips through exportAllData/importAllData and cloud sync (see hasMeaningfulData in
  // cloudSync.ts), same as activeWorkspaceId now does — it is real user data (every OTHER
  // workspace's notes/attempts/etc.), and losing it on sync would be data loss. Always `{}` today,
  // since nothing calls setActiveWorkspaceId yet.
  inactiveWorkspaceOwnedData: Partial<Record<WorkspaceKind, WorkspaceOwnedData>>;
  setActiveWorkspaceId: (id: WorkspaceKind) => void;

  // Reset
  resetAllData: () => void;
}

/**
 * Multi-Workspace OS, Stage 2 — the complete set of fields that belong to ONE workspace, as
 * opposed to global device/app settings (theme, examDate, dailyGoalMinutes, lastSyncedUserId,
 * activeWorkspaceId itself) which apply across every workspace and are deliberately excluded.
 * This is exactly the field list AppState exposes for "the current workspace's data" today — see
 * setActiveWorkspaceId, which archives/restores precisely this shape when switching workspaces.
 */
interface WorkspaceOwnedData {
  completedTopics: Record<string, boolean>;
  notes: Note[];
  attempts: MockTestAttempt[];
  pyqAttempts: PYQAttempt[];
  sessions: PomodoroSession[];
  studyLog: Record<string, StudyLogEntry>;
  starredQuestionIds: string[];
  bookmarkedPyqIds: string[];
  rewardUnlocks: Record<string, string>;
  studyPlan: StudyPlan | null;
  studyPlanGeneratedAt: string | null;
  personalStudyPlanTasks: PersonalPlanTask[];
  revisionQueue: RevisionQueue;
  importedContent: ImportedContent[];
}

function emptyWorkspaceOwnedData(): WorkspaceOwnedData {
  return {
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
    importedContent: [],
  };
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

// --- Multi-Workspace OS persist migration (Stage 1 + Stage 2, folded into one forward step) ---
// Every existing user's persisted data (localStorage today; the same JSON also round-trips
// through Supabase's single `user_data` row via cloudSync.ts) predates the very idea of a
// workspace: it is implicitly "the APFC data," just never labelled as such. This migration makes
// that label explicit and permanent, with zero manual steps and zero data loss, for a persisted
// blob at ANY prior version (true pre-Stage-1 data, or already-Stage-1-migrated version-2 data):
//  - every existing array-of-object entity (notes, mock test attempts, PYQ attempts, Pomodoro
//    sessions, personal study-plan tasks) gets `workspaceId: 'apfc'` stamped onto each item that
//    doesn't already have one;
//  - the single current study plan (if any) gets the same stamp;
//  - `activeWorkspaceId` is set to the default ('apfc') if not already present;
//  - `inactiveWorkspaceOwnedData` (Stage 2 — see the interface above) is set to `{}` if not already
//    present. There is nothing to migrate INTO it: it holds OTHER workspaces' archived data, and
//    since 'apfc' has always been the only real workspace, nothing has ever been archived.
// Deliberately NOT restructured here: completedTopics, studyLog, rewardUnlocks, and revisionQueue
// are all keyed Records (by topicId/date/id/pyqId) rather than arrays of objects, and
// starredQuestionIds/bookmarkedPyqIds are plain string arrays (question ids, not objects) — none
// of these take a per-entry `workspaceId` (would corrupt a non-object value, or a bare string).
// Stage 2 instead isolates these correctly via setActiveWorkspaceId's whole-field archive/restore
// swap (see below) rather than by tagging individual entries — so their ON-DISK shape genuinely
// never needs to change at all, at any version: whatever is currently in e.g. `completedTopics`
// already unambiguously belongs to `activeWorkspaceId` by construction, because the swap is the
// only thing that ever replaces these fields wholesale. Nothing about this migration changes
// PYQ_BANK, QUESTION_BANK, syllabus data, or the generated-question pipeline — none of that is
// persisted user state, so none of it is touched by (or even reachable from) this function.
//
// Pure, deterministic, and idempotent: given the same input it always returns the same output,
// and running it again on its own output is a no-op (every item it would stamp already has a
// truthy workspaceId, so the `?? DEFAULT_WORKSPACE_ID` fallback never re-fires, and
// inactiveWorkspaceOwnedData is left exactly as-is once present).
//
// Version 4 (Import-First Content Repository foundation) adds one more backfill on top of the
// above: `importedContent` (ImportedContent[] — see lib/contentImport.ts) is a BRAND NEW field
// with no pre-existing data of its own to migrate or stamp — unlike notes/attempts/etc., nothing
// before this version could have ever produced one, so there is nothing to retroactively tag,
// only a missing array to default to `[]`. That backfill has to reach two places: the active
// top-level field, AND every snapshot already sitting inside inactiveWorkspaceOwnedData (a real
// user may already have archived snapshots there from using the Stage 3A workspace switcher) —
// missing it in the archive would mean restoring a workspace via setActiveWorkspaceId later
// produces a state with importedContent === undefined instead of [].
export const APP_STORE_PERSIST_VERSION = 4;

function stampWorkspaceIdOnArray(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((item) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? { ...item, workspaceId: (item as { workspaceId?: WorkspaceKind }).workspaceId ?? DEFAULT_WORKSPACE_ID }
      : item,
  );
}

function stampWorkspaceIdOnObject(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return { ...value, workspaceId: (value as { workspaceId?: WorkspaceKind }).workspaceId ?? DEFAULT_WORKSPACE_ID };
}

function withImportedContentDefault(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const snapshot = value as Record<string, unknown>;
  return { ...snapshot, importedContent: Array.isArray(snapshot.importedContent) ? snapshot.importedContent : [] };
}

/** Backfills `importedContent: []` onto every snapshot inside an inactiveWorkspaceOwnedData
 * archive (see withImportedContentDefault) — not just the top-level active fields. */
function withImportedContentDefaultInArchive(rawArchive: unknown): Record<string, unknown> {
  if (!rawArchive || typeof rawArchive !== 'object' || Array.isArray(rawArchive)) return {};
  const archive = rawArchive as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(archive)) {
    result[key] = withImportedContentDefault(archive[key]);
  }
  return result;
}

/** Exported for direct, isolated testing (see store.test.ts) — this is the exact function wired
 * into `persist`'s own `migrate` option below, not a re-implementation of it. */
export function migrateAppStorage(persistedState: unknown, version: number): unknown {
  const state: Record<string, unknown> =
    persistedState && typeof persistedState === 'object' && !Array.isArray(persistedState)
      ? { ...(persistedState as Record<string, unknown>) }
      : {};

  if (version >= APP_STORE_PERSIST_VERSION) return state;

  return {
    ...state,
    notes: stampWorkspaceIdOnArray(state.notes),
    attempts: stampWorkspaceIdOnArray(state.attempts),
    pyqAttempts: stampWorkspaceIdOnArray(state.pyqAttempts),
    sessions: stampWorkspaceIdOnArray(state.sessions),
    personalStudyPlanTasks: stampWorkspaceIdOnArray(state.personalStudyPlanTasks),
    studyPlan: stampWorkspaceIdOnObject(state.studyPlan),
    importedContent: Array.isArray(state.importedContent) ? state.importedContent : [],
    activeWorkspaceId: (state.activeWorkspaceId as WorkspaceKind | undefined) ?? DEFAULT_WORKSPACE_ID,
    inactiveWorkspaceOwnedData: withImportedContentDefaultInArchive(state.inactiveWorkspaceOwnedData),
  };
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
          // Multi-Workspace OS, Stage 2 — stamp the current workspace on a genuinely new note;
          // preserve whatever workspaceId an existing/edited note already carries (spread from the
          // original note object by Notes.tsx's NoteEditor) rather than ever overwriting it.
          const stamped = { ...note, workspaceId: note.workspaceId ?? state.activeWorkspaceId };
          const idx = state.notes.findIndex((n) => n.id === stamped.id);
          if (idx >= 0) {
            const copy = [...state.notes];
            copy[idx] = stamped;
            return { notes: copy };
          }
          return { notes: [stamped, ...state.notes] };
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
            attempts: [{ ...attempt, workspaceId: attempt.workspaceId ?? state.activeWorkspaceId }, ...state.attempts],
            studyLog: { ...state.studyLog, [date]: { ...entry, testsCompleted: entry.testsCompleted + 1 } },
          };
        }),

      pyqAttempts: [],
      addPyqAttempt: (attempt) =>
        set((state) => {
          const date = todayKey();
          const entry = ensureLogEntry(state.studyLog, date);
          return {
            pyqAttempts: [{ ...attempt, workspaceId: attempt.workspaceId ?? state.activeWorkspaceId }, ...state.pyqAttempts],
            studyLog: { ...state.studyLog, [date]: { ...entry, testsCompleted: entry.testsCompleted + 1 } },
          };
        }),

      sessions: [],
      addSession: (session) =>
        set((state) => ({ sessions: [{ ...session, workspaceId: session.workspaceId ?? state.activeWorkspaceId }, ...state.sessions] })),

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
      setStudyPlan: (plan) =>
        set((state) => ({
          // Multi-Workspace OS, Stage 2 — stamp the current workspace, same rule as upsertNote.
          studyPlan: { ...plan, workspaceId: plan.workspaceId ?? state.activeWorkspaceId },
          studyPlanGeneratedAt: new Date().toISOString(),
        })),
      clearStudyPlan: () => set({ studyPlan: null, studyPlanGeneratedAt: null }),

      setStudyPlanTasks: (tasks, unscheduledTopicIds) =>
        set((state) =>
          state.studyPlan
            ? { studyPlan: { ...state.studyPlan, tasks, ...(unscheduledTopicIds !== undefined ? { unscheduledTopicIds } : {}) } }
            : state,
        ),

      personalStudyPlanTasks: [],
      setPersonalStudyPlanTasks: (tasks) =>
        set((state) => ({
          personalStudyPlanTasks: tasks.map((t) => ({ ...t, workspaceId: t.workspaceId ?? state.activeWorkspaceId })),
        })),

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

      importedContent: [],
      // The store is the single source of truth for which workspace an item belongs to — always
      // the CURRENT activeWorkspaceId at the moment of adding, never trusting whatever
      // `item.workspaceId` happened to already say. This guarantees the invariant every other
      // workspace-owned collection already relies on: everything physically sitting in
      // `importedContent` right now truly belongs to the active workspace, so setActiveWorkspaceId's
      // swap (below) can keep moving the whole array wholesale without per-item inspection.
      addImportedContent: (item) =>
        set((state) => ({ importedContent: [{ ...item, workspaceId: state.activeWorkspaceId }, ...state.importedContent] })),
      updateImportedContent: (id, updates) =>
        set((state) => ({
          importedContent: state.importedContent.map((c) => {
            if (c.id !== id) return c;
            // Runtime enforcement, not just the TS signature above: `id`/`workspaceId` are
            // stripped from `updates` even if a caller bypasses the type system and includes
            // them — workspace isolation must hold regardless of what a caller passes in.
            const { id: _ignoredId, workspaceId: _ignoredWorkspaceId, ...safeUpdates } = updates as Partial<ImportedContent>;
            return { ...c, ...safeUpdates };
          }),
        })),
      deleteImportedContent: (id) => set((state) => ({ importedContent: state.importedContent.filter((c) => c.id !== id) })),

      activeWorkspaceId: DEFAULT_WORKSPACE_ID,
      inactiveWorkspaceOwnedData: {},
      // Multi-Workspace OS, Stage 2 — the whole-field archive/restore swap: every field listed in
      // WorkspaceOwnedData is snapshotted under the OUTGOING workspace's id in
      // inactiveWorkspaceOwnedData, then replaced with whatever was previously archived for the
      // INCOMING workspace (or a fresh empty snapshot the first time that workspace is visited).
      // No per-item filtering or inspection is needed here: everything currently sitting in e.g.
      // `notes` already belongs to the outgoing workspace by construction (every write path stamps
      // new items with the CURRENT activeWorkspaceId, and the only other thing that ever replaces
      // these fields wholesale is this same swap) — so the whole bucket moves together. A no-op
      // (returns state unchanged) when switching to the workspace that's already active.
      setActiveWorkspaceId: (id) =>
        set((state) => {
          if (id === state.activeWorkspaceId) return state;
          const outgoingSnapshot: WorkspaceOwnedData = {
            completedTopics: state.completedTopics,
            notes: state.notes,
            attempts: state.attempts,
            pyqAttempts: state.pyqAttempts,
            sessions: state.sessions,
            studyLog: state.studyLog,
            starredQuestionIds: state.starredQuestionIds,
            bookmarkedPyqIds: state.bookmarkedPyqIds,
            rewardUnlocks: state.rewardUnlocks,
            studyPlan: state.studyPlan,
            studyPlanGeneratedAt: state.studyPlanGeneratedAt,
            personalStudyPlanTasks: state.personalStudyPlanTasks,
            revisionQueue: state.revisionQueue,
            importedContent: state.importedContent,
          };
          const incoming = state.inactiveWorkspaceOwnedData[id] ?? emptyWorkspaceOwnedData();
          return {
            activeWorkspaceId: id,
            inactiveWorkspaceOwnedData: { ...state.inactiveWorkspaceOwnedData, [state.activeWorkspaceId]: outgoingSnapshot },
            ...incoming,
          };
        }),

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
          importedContent: [],
          // Multi-Workspace OS, Stage 2 — "reset ALL data" means every workspace's data, not just
          // the active one's; a no-op today since nothing has ever populated this archive.
          inactiveWorkspaceOwnedData: {},
        }),
    }),
    {
      name: 'apfc-tracker-storage',
      version: APP_STORE_PERSIST_VERSION,
      migrate: migrateAppStorage as (persistedState: unknown, version: number) => AppState,
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
    importedContent: state.importedContent,
    // Multi-Workspace OS, Stage 2 — activeWorkspaceId travels WITH the flat fields above (notes,
    // completedTopics, etc.) because they only mean "this workspace's data" together with it; and
    // every OTHER workspace's archived data is equally real user data (see AppState's doc-comment)
    // — both must survive a JSON backup / cloud sync round-trip, same as everything else here.
    activeWorkspaceId: state.activeWorkspaceId,
    inactiveWorkspaceOwnedData: state.inactiveWorkspaceOwnedData,
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
    importedContent: data.importedContent ?? [],
    activeWorkspaceId: (data.activeWorkspaceId as WorkspaceKind | undefined) ?? DEFAULT_WORKSPACE_ID,
    inactiveWorkspaceOwnedData: data.inactiveWorkspaceOwnedData ?? {},
  });
}
