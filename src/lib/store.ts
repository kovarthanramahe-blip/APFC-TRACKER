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
import {
  createRevisionQueue,
  recordCorrect as recordRevisionCorrectItem,
  recordIncorrect as recordRevisionIncorrectItem,
  addItem as addRevisionQueueItem,
  type RevisionQueue,
  type RevisionReviewSource,
} from './revisionQueue';
import { DEFAULT_WORKSPACE_ID, type WorkspaceKind } from './workspace';
import type { ImportedContent } from './contentImport';
import { applyImportedContentOrganizationPatch, type ImportedContentOrganizationPatch } from './importedContentRepository';
import { applyNoteOrganizationPatch, type NoteOrganizationPatch } from './noteOrganization';
import { type Folder, deleteFolderFromList, renameFolder as renameFolderInList } from './folders';
import {
  createRelationship as createContentRelationship,
  type ContentRelationship,
  type CreateRelationshipResult,
  type RelationshipEndpoint,
  type RelationshipType,
} from './contentRelationships';
import type { RepositoryImportPlan } from './repositoryImport';
import type { KnowledgeIngestionBatch } from './knowledgeIngestion';
import {
  createManualClassification,
  confirmClassification,
  rejectClassification,
  deleteClassification,
  deleteClassificationsForItem,
  mergeProposedClassifications,
  type KnowledgeClassification,
  type KnowledgeItemType,
} from './knowledgeClassification';
import type { JarvisDocumentEmbeddingRecord } from './jarvis/documents/embeddingIndex';
import type { Annotation, NormalizedPoint } from './annotations';
import { isGeometryAnnotation } from './annotations';
import { sanitizeAnnotations } from './annotationSanitize';
import { addAnnotationToRevisionQueue, type AnnotationRevisionBridgeStatus } from './annotationRevisionBridge';
import type { UpscCseCoverageState, UpscCseSyllabusCoverage } from './upscCseSyllabusCoverage';
import type { UpscCsePrelimsPyqAttempt } from './upscCsePrelimsPyqAttempt';
import {
  setUpscCseStudyTaskStatus as applyUpscCseStudyTaskStatus,
  deleteUpscCseStudyTask as applyDeleteUpscCseStudyTask,
  updateUpscCseStudyTask as applyUpdateUpscCseStudyTask,
  type UpscCseStudyTask,
  type UpscCseStudyTaskStatus,
  type UpdateUpscCseStudyTaskFields,
} from './upscCseStudyTask';
import type { UpscCseStudyPlanConfig } from './upscCseStudyPlanConfig';
import { migrateGranularCoverageBackfill } from './upscCseGranularCoverage';
import { UPSC_CSE_GRANULAR_NODES } from '../data/upscCseGranularTopics';
import {
  updatePhdTopicArea as applyUpdatePhdTopicArea,
  deletePhdTopicArea as applyDeletePhdTopicArea,
  type PhdTopicArea,
  type UpdateTopicAreaFields,
} from './phdTopicArea';
import {
  createMicroTarget as applyCreateMicroTarget,
  updateMicroTarget as applyUpdateMicroTarget,
  setMicroTargetStatus as applySetMicroTargetStatus,
  deleteMicroTarget as applyDeleteMicroTarget,
  type MicroTarget,
  type MicroTargetStatus,
  type CreateMicroTargetInput,
  type UpdateMicroTargetFields,
} from './microTarget';

const PHD_RESEARCH_START_DATE_DEFAULT = '2023-12-21';

interface AppState {
  // Syllabus progress: topicId -> completed
  completedTopics: Record<string, boolean>;
  toggleTopic: (topicId: string) => void;
  markSubjectTopics: (topicIds: string[], value: boolean) => void;

  // UPSC CSE Syllabus UI — coverage state per microsyllabus id (see lib/upscCseSyllabusCoverage.ts).
  // A completely separate map from completedTopics above: different id space (microsyllabus ids,
  // never APFC topic ids), different value shape (a 4-state enum, not a boolean). Workspace-owned
  // exactly like completedTopics — archived/restored by setActiveWorkspaceId's swap below, so this
  // is structurally absent whenever a workspace other than upsc_cse is active.
  upscCseSyllabusCoverage: UpscCseSyllabusCoverage;
  setUpscCseCoverageState: (microsyllabusId: string, coverageState: UpscCseCoverageState) => void;

  // UPSC CSE Prelims PYQ practice attempts (see lib/upscCsePrelimsPyqAttempt.ts for why this is a
  // separate type/field from APFC's own pyqAttempts/PYQAttempt below — APFC's subject/topicId
  // fields are typed to its own closed syllabus, which a UPSC CSE attempt cannot honestly satisfy).
  // Workspace-owned exactly like upscCseSyllabusCoverage above. bookmarkedPyqIds/revisionQueue
  // below are reused AS-IS for UPSC question ids too — both are already pure id-keyed,
  // workspace-owned fields with no APFC-specific typing, so no new field is needed for either.
  upscCsePrelimsPyqAttempts: UpscCsePrelimsPyqAttempt[];
  addUpscCsePrelimsPyqAttempt: (attempt: UpscCsePrelimsPyqAttempt) => void;

  // UPSC CSE Study Dashboard — a deliberately minimal, user-authored daily task list (see
  // lib/upscCseStudyTask.ts's own header for why this is NOT the APFC study plan engine's
  // auto-generated PersonalPlanTask/StudyPlan). Workspace-owned exactly like every other UPSC CSE
  // field above. The page constructs each full task object (id/createdAt) before calling
  // addUpscCseStudyTask, matching addUpscCsePrelimsPyqAttempt's own convention above.
  upscCseStudyTasks: UpscCseStudyTask[];
  addUpscCseStudyTask: (task: UpscCseStudyTask) => void;
  // Bulk-adds an already-built array of tasks in ONE set() call — used by the UPSC CSE Study
  // Plan's generator (lib/upscCseStudyPlanGenerator.ts), which can produce dozens of tasks at
  // once; looping addUpscCseStudyTask would work but cost one store update per task.
  addUpscCseStudyTasks: (tasks: UpscCseStudyTask[]) => void;
  updateUpscCseStudyTask: (id: string, updates: UpdateUpscCseStudyTaskFields) => void;
  setUpscCseStudyTaskStatus: (id: string, status: UpscCseStudyTaskStatus) => void;
  deleteUpscCseStudyTask: (id: string) => void;

  // UPSC CSE Study Plan configuration (lib/upscCseStudyPlanConfig.ts) — a single object, null until
  // the user actually sets one up (never a fabricated default plan). Workspace-owned exactly like
  // every other UPSC CSE field above.
  upscCseStudyPlanConfig: UpscCseStudyPlanConfig | null;
  setUpscCseStudyPlanConfig: (config: UpscCseStudyPlanConfig) => void;
  clearUpscCseStudyPlanConfig: () => void;

  // PhD Research — the research start date (a real, fixed fact: 21 December 2023 — see
  // lib/phdResearch.ts's computeResearchDuration, which derives elapsed duration from it; never a
  // fabricated progress percentage). Workspace-owned exactly like every other PhD/UPSC field here,
  // with a real default so a fresh PhD Research workspace shows a correct duration immediately
  // rather than an empty state — see setPhdResearchStartDate for the rare case of correcting it.
  phdResearchStartDate: string;
  setPhdResearchStartDate: (date: string) => void;

  // PhD Research Topic Areas (lib/phdTopicArea.ts) — user-created, editable, searchable,
  // workspace-owned exactly like upscCseStudyTasks above. A document/note/bibliography record links
  // to one via its OWN metadata.topicAreaId (lib/contentImport.ts's ImportedContentMetadata) —
  // reusing the existing repository architecture rather than a new relationship type.
  phdTopicAreas: PhdTopicArea[];
  addPhdTopicArea: (area: PhdTopicArea) => void;
  updatePhdTopicArea: (id: string, updates: UpdateTopicAreaFields) => void;
  deletePhdTopicArea: (id: string) => void;

  // PhD Research micro-targets — lib/microTarget.ts's GENERIC, reusable MicroTarget model (see its
  // own header for why this is deliberately not merged with UPSC CSE's upscCseStudyTasks or APFC's
  // studyPlan engine). Workspace-owned exactly like phdTopicAreas above; the page constructs each
  // full target object (id/createdAt) before calling addPhdMicroTarget, matching
  // addUpscCseStudyTask's own convention.
  phdMicroTargets: MicroTarget[];
  addPhdMicroTarget: (input: CreateMicroTargetInput, id: string, createdAt: string) => void;
  updatePhdMicroTarget: (id: string, updates: UpdateMicroTargetFields) => void;
  setPhdMicroTargetStatus: (id: string, status: MicroTargetStatus) => void;
  deletePhdMicroTarget: (id: string) => void;

  // Notes
  notes: Note[];
  upsertNote: (note: Note) => void;
  // Cascade-deletes any relationship referencing this note (type 'note') too — same discipline as
  // deleteImportedContent below, so a deleted note never leaves a dangling relationship behind.
  deleteNote: (id: string) => void;
  togglePinNote: (id: string) => void;
  // Premium Note Organisation (Phase 3B) — folder/tag/pin/archive changes for one or many notes in
  // a single set() call (see lib/noteOrganization.ts's applyNoteOrganizationPatch, the pure
  // function this applies per-note). The single-item card UI and multi-select bulk actions both go
  // through this one action, never a separate single-item variant.
  bulkUpdateNotes: (ids: string[], patch: NoteOrganizationPatch) => void;

  // Mock tests
  attempts: MockTestAttempt[];
  addAttempt: (attempt: MockTestAttempt) => void;

  // PYQ practice test attempts — included in the whole-store cloud sync like every other
  // persisted field here (exportAllData()/cloudSync.ts push the entire store, this included;
  // there is no separate or local-only handling for it).
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
  // (lib/revisionQueue's box/dueDate/lastReviewedDate/reviewCount per item id) — which PYQ ids are
  // even eligible (incorrect or bookmarked) is derived live by the caller from pyqAttempts/
  // bookmarkedPyqIds, never stored here, so an id never needs to be added/removed as its
  // eligibility changes. `today` is always supplied by the caller (yyyy-mm-dd, local date).
  revisionQueue: RevisionQueue;
  // P2.8 — `source` is optional and backward-compatible: a caller that omits it behaves exactly as
  // before (lastReviewSource left undefined, never fabricated as 'quiz'). See
  // lib/revisionQueue.ts's RevisionReviewSource/recordCorrect/recordIncorrect for the full contract.
  recordRevisionCorrect: (itemId: string, today: string, source?: RevisionReviewSource) => void;
  recordRevisionIncorrect: (itemId: string, today: string, source?: RevisionReviewSource) => void;
  // Current Affairs Repository revision: unlike a PYQ attempt, a Current Affairs item has no
  // "incorrect attempt" to derive eligibility from, so it needs an explicit, idempotent "add to
  // revision" action — see lib/revisionQueue.ts's addItem (reused as-is; no second engine).
  addToRevisionQueue: (itemId: string, today: string) => void;

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
  // Cascade-deletes any relationship referencing this id too (see contentRelationships below) —
  // otherwise a deleted item would leave dangling relationships pointing at nothing.
  deleteImportedContent: (id: string) => void;
  // Premium Note Organisation (Phase 3B) — the ImportedContent mirror of bulkUpdateNotes above (see
  // lib/importedContentRepository.ts's applyImportedContentOrganizationPatch). Only ever touches
  // `metadata`/`updatedAt` — never rawContent/provenance, preserving source immutability.
  bulkUpdateImportedContent: (ids: string[], patch: ImportedContentOrganizationPatch) => void;

  // Premium Note Organisation (Phase 3B) — a workspace-scoped folder tree shared by Notes and
  // ImportedContent (see lib/folders.ts). Workspace-owned exactly like notes/importedContent above.
  // Deleting a folder never silently deletes its contents: `contentAction` decides what happens to
  // every Note/ImportedContent item currently filed under it (and to its own direct child folders,
  // which are ALWAYS promoted to its parent — never recursively deleted, see lib/folders.ts's own
  // header) — 'moveToParent' re-files them under the deleted folder's own parent (root, if it was
  // itself a root folder); there is no separate "move to root" variant because a root folder's own
  // parent already IS root. The caller (Notes.tsx) is the one place "cancel" is enforced: it simply
  // never calls this action unless the user explicitly confirmed.
  folders: Folder[];
  addFolder: (folder: Folder) => void;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string, contentAction: 'moveToParent') => void;

  // Repository relationships: a minimal, generic relationship between two entities in the PhD
  // Research repository, workspace-scoped exactly like importedContent itself (archived/restored by
  // setActiveWorkspaceId's swap, never per-item filtered) — see lib/contentRelationships.ts for the
  // full model and its extensible RelationshipType union. Each endpoint explicitly names which
  // collection it belongs to (RelationshipEntityType: 'imported_content' | 'note') — added so Notes
  // (lib/types.ts's Note, a separate collection from ImportedContent) can participate in the same
  // relationship model without converting Notes into ImportedContent or building a second model.
  // `addContentRelationship` stamps `workspaceId` with the CURRENT activeWorkspaceId (never
  // trusting a caller-supplied value, same discipline as addImportedContent) and validates each
  // endpoint's id against the CURRENT workspace's own `importedContent`/`notes` ids (by its type) —
  // the mechanism that actually enforces "APFC relationships cannot reference UPSC/PhD content"
  // etc. at runtime, returning a typed rejection instead of throwing or silently doing nothing.
  contentRelationships: ContentRelationship[];
  addContentRelationship: (input: { source: RelationshipEndpoint; target: RelationshipEndpoint; type: RelationshipType }) => CreateRelationshipResult;
  deleteContentRelationship: (id: string) => void;

  // Knowledge Librarian (P0), Phase 2 — Syllabus <-> Knowledge classification: a many-to-many link
  // between a knowledge item (today: ImportedContent) and an APFC syllabus topic, carrying
  // confidence/status/source so MULTIPLE legitimate topic mappings and a review queue are possible
  // — something ImportedContentMetadata.apfcTopicId (a single optional FK) cannot express on its
  // own. See lib/knowledgeClassification.ts's own header for exactly why this is a SEPARATE
  // collection from contentRelationships above, not an overload of it. Workspace-owned exactly like
  // importedContent/contentRelationships (archived/restored by setActiveWorkspaceId's swap).
  knowledgeClassifications: KnowledgeClassification[];
  /** Persists an already-built Markdown multi-article ingestion batch
   * (lib/knowledgeIngestion.ts's ingestMarkdownAsArticles) in one atomic set() — mirrors
   * applyRepositoryImportPlan's own "the batch is already fully built by the caller" pattern for
   * ids/content, BUT (P0.1 hardening) never trusts the batch's own `workspaceId` on any of its
   * records: the original document, every extracted article, every relationship, and every
   * classification are all re-stamped with the CURRENT activeWorkspaceId here, exactly like
   * addImportedContent already does for a single item. A caller cannot insert records into a
   * workspace other than whichever one is active at the moment this action actually runs, even if
   * the batch was built against a stale or incorrect workspaceId. */
  addKnowledgeIngestionBatch: (batch: KnowledgeIngestionBatch) => void;
  /** Confirming a classification also backfills ImportedContentMetadata.apfcTopicId onto the
   * classified item when it doesn't already have one (the first confirmed topic becomes that
   * item's existing single "primary" topic — see this action's own implementation below) — every
   * existing apfcTopicId-driven view (Syllabus.tsx, RepositoryDetail.tsx, lib/repository.ts) then
   * picks it up with no changes of its own. */
  confirmKnowledgeClassification: (id: string) => void;
  rejectKnowledgeClassification: (id: string) => void;
  /** A human explicitly assigning a topic — always `status: 'confirmed'`, `source: 'manual'` (see
   * lib/knowledgeClassification.ts's createManualClassification). */
  addManualKnowledgeClassification: (input: { itemId: string; itemType: KnowledgeItemType; topicId: string }) => void;
  deleteKnowledgeClassification: (id: string) => void;

  // AI Library — semantic search embedding index (lib/jarvis/documents/embeddingIndex.ts). NOT
  // workspace-owned (see APP_STORE_PERSIST_VERSION's own Version 16 comment for why) and
  // deliberately excluded from exportAllData/importAllData/cloudSync — a derived, rebuildable
  // local index, never source-of-truth user data. setDocumentEmbeddings replaces the whole array
  // atomically (the caller already computed the full reconciled set via planEmbeddingIndexing),
  // matching this store's existing "caller builds it, store just persists it" convention for
  // addKnowledgeIngestionBatch above.
  documentEmbeddings: JarvisDocumentEmbeddingRecord[];
  setDocumentEmbeddings: (records: JarvisDocumentEmbeddingRecord[]) => void;

  // Repository Import/Restore — applies an already-built, already-validated RepositoryImportPlan
  // (lib/repositoryImport.ts's buildRepositoryImportPlan: validation, collision detection, id
  // remapping, and which relationships to skip have ALL already happened by the time this is
  // called) as a single merge: every array in the plan is simply prepended to its matching field,
  // exactly like addImportedContent/upsertNote/addContentRelationship already prepend their own new
  // items. This action makes no decisions of its own, so there is nothing here that could leave a
  // half-applied import — either the whole plan merges in this one set() call, or (the user
  // cancels, so this is never called) nothing changes at all.
  applyRepositoryImportPlan: (plan: RepositoryImportPlan) => void;

  // Premium Study Reader (Phase 7) — text-anchored (highlight/underline/strikethrough/note),
  // geometry-anchored (ink/highlighter/shape/arrow), and page-level (sticky note/bookmark)
  // annotations over a Repository content entry (pages/RepositoryDetail.tsx), keyed by documentId
  // (`${entityType}:${entityId}`, the same compound key that page already uses — see
  // lib/annotations.ts for the full domain model and lib/textAnchor.ts for how text is anchored).
  // Workspace-owned exactly like importedContent/notes above. Stroke history for undo/redo is
  // deliberately NOT stored here — that's ephemeral per-session UI state (see
  // components/annotations), never persisted, per this feature's own "only annotation history,
  // never an app-wide undo system" scope.
  annotations: Annotation[];
  addAnnotation: (annotation: Annotation) => void;
  /** Applies only to a textNote/stickyNote annotation (the two annotation types with editable
   * `text`) — a no-op on any other annotation id, never silently mutates the wrong type. */
  updateAnnotationText: (id: string, text: string) => void;
  /** Applies only to a geometry-anchored annotation (ink/highlighter/shape/arrow — the ones with a
   * `points` array) — a no-op on any other annotation id. Used by the Phase F lasso tool's "move
   * selection" action; the points passed in are already-clamped normalized coordinates. */
  updateAnnotationPoints: (id: string, points: NormalizedPoint[]) => void;
  deleteAnnotation: (id: string) => void;
  /** Wave 4A, Scope C — the explicit, idempotent "Add to Revision Queue" bridging action (see
   * lib/annotationRevisionBridge.ts for the full contract). Distinct from the existing "Add to
   * revision" toolbar button above (which only ever tags an annotation with studyTags: ['revision']
   * and is left completely unchanged): this is what a user explicitly triggers afterward to enter
   * an already-tagged annotation into the real lib/revisionQueue.ts. Looks `annotationId` up in
   * `annotations` itself (never trusts a caller-supplied annotation object) so the bridge always
   * acts on the current, persisted annotation. */
  bridgeAnnotationToRevisionQueue: (annotationId: string, today: string) => AnnotationRevisionBridgeStatus;

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
  upscCseSyllabusCoverage: UpscCseSyllabusCoverage;
  upscCsePrelimsPyqAttempts: UpscCsePrelimsPyqAttempt[];
  upscCseStudyTasks: UpscCseStudyTask[];
  upscCseStudyPlanConfig: UpscCseStudyPlanConfig | null;
  phdResearchStartDate: string;
  phdTopicAreas: PhdTopicArea[];
  phdMicroTargets: MicroTarget[];
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
  contentRelationships: ContentRelationship[];
  annotations: Annotation[];
  folders: Folder[];
  knowledgeClassifications: KnowledgeClassification[];
}

// P2.4 — removes exactly one entry from a RevisionQueue by id, used only by deleteImportedContent's
// cascade above. Deliberately kept here rather than added to lib/revisionQueue.ts: it is a plain
// Record key omission with no scheduling logic of its own, and that module is intentionally left
// untouched by this change. Returns the SAME object reference when the id isn't present, matching
// this store's existing "no-op update returns the same reference" convention elsewhere.
function withoutRevisionQueueItem(queue: RevisionQueue, itemId: string): RevisionQueue {
  if (!(itemId in queue)) return queue;
  const { [itemId]: _removed, ...rest } = queue;
  return rest;
}

function emptyWorkspaceOwnedData(): WorkspaceOwnedData {
  return {
    completedTopics: {},
    upscCseSyllabusCoverage: {},
    upscCsePrelimsPyqAttempts: [],
    upscCseStudyTasks: [],
    upscCseStudyPlanConfig: null,
    phdResearchStartDate: PHD_RESEARCH_START_DATE_DEFAULT,
    phdTopicAreas: [],
    phdMicroTargets: [],
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
    contentRelationships: [],
    annotations: [],
    folders: [],
    knowledgeClassifications: [],
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

// Shared by bumpFocusMinutes/bumpTopicsCompleted/bumpTestsCompleted — each only differs in which
// numeric StudyLogEntry field it increments and by how much.
function bumpStudyLogField(
  log: Record<string, StudyLogEntry>,
  date: string,
  field: 'focusMinutes' | 'topicsCompleted' | 'testsCompleted',
  delta: number,
): Record<string, StudyLogEntry> {
  const entry = ensureLogEntry(log, date);
  return { ...log, [date]: { ...entry, [field]: entry[field] + delta } };
}

// Shared by toggleStarredQuestion/toggleBookmarkedPyq — both just toggle an id's membership in a
// string[] of ids.
function toggleInArray(ids: readonly string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
}

// R5 (Phase 2F) — addAttempt/addPyqAttempt share this exact pattern: stamp the active workspace
// (if the attempt doesn't already carry one) and bump today's testsCompleted by one. The third
// parallel action, addUpscCsePrelimsPyqAttempt, deliberately does NEITHER of these and is left
// untouched: UpscCsePrelimsPyqAttempt has no workspaceId field at all (workspace isolation for
// that collection comes entirely from WorkspaceOwnedData's wholesale archive/restore, not
// per-item stamping — see WorkspaceOwnedData above), and UPSC CSE PYQ completions not bumping
// testsCompleted is a pre-existing behavior this consolidation does not change.
function stampWorkspaceAndBumpTestsCompleted<T extends { workspaceId?: WorkspaceKind }>(
  activeWorkspaceId: WorkspaceKind,
  studyLog: Record<string, StudyLogEntry>,
  attempt: T,
): { stamped: T; studyLog: Record<string, StudyLogEntry> } {
  return {
    stamped: { ...attempt, workspaceId: attempt.workspaceId ?? activeWorkspaceId },
    studyLog: bumpStudyLogField(studyLog, todayKey(), 'testsCompleted', 1),
  };
}

/** Knowledge Librarian P0.1 hardening — backfills ImportedContentMetadata.apfcTopicId (the legacy
 * single-primary-topic field) onto `itemId` when it doesn't already have one. Shared by BOTH
 * confirmKnowledgeClassification and addManualKnowledgeClassification so every path that produces
 * a confirmed classification keeps the legacy field in sync identically — previously only
 * confirmKnowledgeClassification did this, so a classification added directly via
 * addManualKnowledgeClassification (which is born already 'confirmed' — see
 * lib/knowledgeClassification.ts's createManualClassification — and so never passes through
 * confirmKnowledgeClassification at all) silently never backfilled the legacy field. Returns
 * `undefined` (no update needed) when the item doesn't exist or already has a primary topic — the
 * FIRST confirmed topic always wins; this never overwrites an existing value. */
function backfillPrimaryApfcTopicId(importedContent: readonly ImportedContent[], itemId: string, topicId: string): ImportedContent[] | undefined {
  const item = importedContent.find((c) => c.id === itemId);
  if (!item || item.metadata?.apfcTopicId) return undefined;
  return importedContent.map((c) => (c.id === itemId ? { ...c, metadata: { ...c.metadata, apfcTopicId: topicId }, updatedAt: new Date().toISOString() } : c));
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
//
// Version 5 (Source <-> Research Document Linking) adds `contentRelationships`
// (ContentRelationship[] — see lib/contentRelationships.ts) the exact same way: another brand-new,
// workspace-owned field with nothing pre-existing to migrate, defaulted to `[]` at both the
// top-level active field and inside every inactiveWorkspaceOwnedData snapshot.
//
// Version 6 (Notes <-> Research Repository Linking) extends every EXISTING contentRelationships
// entry rather than adding a new field: each relationship endpoint now explicitly carries an
// entity type (RelationshipEntityType: 'imported_content' | 'note' — see
// lib/contentRelationships.ts), so a bare id is never ambiguous between the two collections. Every
// relationship created before this version was necessarily between two ImportedContent items (Note
// linking didn't exist yet), so migrating one is simply stamping `sourceType`/`targetType:
// 'imported_content'` onto it when missing — never invented data, exactly what was already
// implicitly true. Reaches the same two places as every prior workspace-owned backfill: the active
// top-level field, and every snapshot inside inactiveWorkspaceOwnedData.
//
// Version 7 (UPSC CSE Syllabus UI) adds `upscCseSyllabusCoverage` (Record<microsyllabusId,
// UpscCseCoverageState> — see lib/upscCseSyllabusCoverage.ts) the exact same way as
// importedContent/contentRelationships before it: another brand-new, workspace-owned field with
// nothing pre-existing to migrate (no prior version could have ever produced one), defaulted to
// `{}` at both the top-level active field and inside every inactiveWorkspaceOwnedData snapshot.
//
// Version 8 (UPSC CSE Practice & Analytics) adds `upscCsePrelimsPyqAttempts`
// (UpscCsePrelimsPyqAttempt[] — see lib/upscCsePrelimsPyqAttempt.ts) the exact same way: another
// brand-new, workspace-owned field with nothing pre-existing to migrate, defaulted to `[]` at both
// the top-level active field and inside every inactiveWorkspaceOwnedData snapshot.
//
// Version 9 (UPSC CSE Study Dashboard) adds `upscCseStudyTasks` (UpscCseStudyTask[] — see
// lib/upscCseStudyTask.ts) the exact same way: another brand-new, workspace-owned field with
// nothing pre-existing to migrate, defaulted to `[]` at both the top-level active field and inside
// every inactiveWorkspaceOwnedData snapshot.
//
// Version 10 (UPSC CSE Granular Syllabus + Exam Targets + PhD Research Dashboard) does two things:
//  - Adds three more brand-new, workspace-owned fields the exact same way as every version above:
//    `phdResearchStartDate` (string, defaulted to PHD_RESEARCH_START_DATE_DEFAULT rather than an
//    empty value — a fresh PhD Research workspace should show a correct duration immediately, not
//    an empty state, since 21 Dec 2023 is a real fixed fact this stage was given, not user input to
//    default blank), `phdTopicAreas` (PhdTopicArea[], defaulted to `[]`), and `phdMicroTargets`
//    (MicroTarget[], defaulted to `[]`).
//  - Runs migrateGranularCoverageBackfill (lib/upscCseGranularCoverage.ts) over
//    `upscCseSyllabusCoverage` — NOT a new field, no shape change to that Record<string,
//    UpscCseCoverageState> at all, but a one-time content backfill: for a microsyllabus item that
//    now has granular Topic/Subtopic/Micro-topic children (see data/upscCseGranularTopics.ts) and
//    already carried a direct coverage entry from before granularization existed, its state is
//    copied onto its new granular leaf ids (unless a leaf already has its own entry) — so a user's
//    prior "Constitution: strong" is preserved as real signal on the new finer-grained nodes,
//    exactly this task's own "preserve existing microsyllabus coverage during migration"
//    requirement, rather than the item silently reading back as fresh "not started" once
//    lib/upscCseGranularCoverage.ts's effectiveMicrosyllabusCoverageState starts reading from
//    leaves. Reaches both the active top-level field and every archived snapshot inside
//    inactiveWorkspaceOwnedData, same as every other workspace-owned backfill above.
//
// Version 11 (Workspace-aware Study Plan + Analytics) adds `upscCseStudyPlanConfig`
// (UpscCseStudyPlanConfig | null — see lib/upscCseStudyPlanConfig.ts) the exact same way as every
// brand-new field above: nothing pre-existing to migrate, defaulted to `null` (no fabricated plan)
// at both the top-level active field and inside every inactiveWorkspaceOwnedData snapshot. The UPSC
// CSE Study Plan's actual tasks and the PhD Research Plan's micro-targets/Topic Areas reuse the
// EXISTING `upscCseStudyTasks`/`phdMicroTargets`/`phdTopicAreas` fields from versions 9-10 above
// (extended with new optional fields — see those modules' own headers) rather than adding any new
// collections, so no further migration is needed for either.
//
// Version 12 (Personal Content Repository foundation) does NOT add a new top-level field — the
// repository's content types ('document', 'study_material' — see lib/contentImport.ts's
// ImportedContentType) are new union members, not new storage, and a persisted item's contentType
// string needs no migration to accept them. What DOES need migrating is `updatedAt`, a new field
// on each ImportedContent array ITEM (not the array itself): backfilled from that item's own real
// `provenance.importedAt` — never fabricated — wherever it's missing, via
// backfillImportedContentUpdatedAt, reached both at the top-level active `importedContent` field
// and inside every archived inactiveWorkspaceOwnedData snapshot (same withWorkspaceOwnedDefaults
// path every other per-item backfill above already uses).
// Version 14 (Premium Note Organisation, Phase 3B) adds `folders` (Folder[] — see lib/folders.ts)
// the exact same way as importedContent/contentRelationships/etc. before it: another brand-new,
// workspace-owned field with nothing pre-existing to migrate (no prior version could have ever
// produced a folder), defaulted to `[]` at both the top-level active field and inside every
// inactiveWorkspaceOwnedData snapshot. Note.folderId/tags/isArchived and
// ImportedContentMetadata.folderId/isPinned/isArchived are all NEW but purely additive optional
// fields on EXISTING array items (not new top-level fields), so — exactly like Version 12's
// ImportedContent.updatedAt before this version bump existed for it — they need no migration step
// of their own: every reader already treats a missing optional field as its own documented default
// (see each field's own doc comment in lib/types.ts / lib/contentImport.ts).
//
// Version 15 (Knowledge Librarian P0, Phase 2) adds `knowledgeClassifications`
// (KnowledgeClassification[] — see lib/knowledgeClassification.ts) the exact same way as
// importedContent/contentRelationships/folders before it: a brand-new, workspace-owned field with
// nothing pre-existing to migrate (no prior version could have ever produced one — this is a new
// collection, not a restructuring of an existing one), defaulted to `[]` at both the top-level
// active field and inside every inactiveWorkspaceOwnedData snapshot.
//
// Version 16 (AI Library, semantic search) adds `documentEmbeddings`
// (JarvisDocumentEmbeddingRecord[] — see lib/jarvis/documents/embeddingIndex.ts). Deliberately
// NOT workspace-owned (not swapped by setActiveWorkspaceId, not part of inactiveWorkspaceOwnedData):
// every record is keyed by its own globally-unique documentId+chunkId, so there is no cross-
// workspace collision risk to guard against, and treating it as workspace-owned would force a full
// re-index on every workspace switch for no correctness benefit. Also deliberately EXCLUDED from
// exportAllData()/importAllData() and therefore from cloudSync.ts (which reuses exportAllData as
// its sync payload) and from backup-file export: this is a derived, rebuildable local SEARCH INDEX,
// never source-of-truth user data — a second device, or a restored backup, simply has an empty
// index until the user re-runs "Index for semantic search" there, which is itself idempotent and
// cheap (planEmbeddingIndexing recomputes only what's missing/stale). This keeps the single Supabase
// JSONB blob and every backup file free of potentially megabytes of floating-point vector noise.
export const APP_STORE_PERSIST_VERSION = 16;

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

/** Version 6 — backfills `sourceType`/`targetType: 'imported_content'` onto a relationship that
 * predates entity-type endpoints (see lib/contentRelationships.ts's RelationshipEntityType). Every
 * such relationship was, by construction, between two ImportedContent items. */
function stampRelationshipEntityTypes(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    const r = item as { sourceType?: string; targetType?: string };
    return { ...item, sourceType: r.sourceType ?? 'imported_content', targetType: r.targetType ?? 'imported_content' };
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** Version 12 — backfills `updatedAt` onto an ImportedContent item that predates that field (see
 * lib/contentImport.ts's own doc comment on it), defaulting to the item's own real, already-known
 * `provenance.importedAt` rather than fabricating a fresh "now" — the same "preserve real known
 * data" discipline as Version 10's granular-coverage backfill. Never overwrites an already-present
 * `updatedAt`. */
function backfillImportedContentUpdatedAt(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.map((item) => {
    if (!isPlainObject(item)) return item;
    if (typeof item.updatedAt === 'string') return item;
    const provenance = isPlainObject(item.provenance) ? item.provenance : {};
    const importedAt = typeof provenance.importedAt === 'string' ? provenance.importedAt : new Date().toISOString();
    return { ...item, updatedAt: importedAt };
  });
}

/** Backfills `importedContent: []` (each item also getting Version 12's `updatedAt` backfill — see
 * backfillImportedContentUpdatedAt), `contentRelationships: []` (with every entry's entity types
 * stamped — see stampRelationshipEntityTypes), `upscCseSyllabusCoverage: {}` (plus, for whatever
 * coverage entries already exist, the granular roll-up backfill — see migrateGranularCoverageBackfill),
 * `upscCsePrelimsPyqAttempts: []`, `upscCseStudyTasks: []`, `phdResearchStartDate`,
 * `phdTopicAreas: []`, `phdMicroTargets: []`, and (Version 13) a SANITISED `annotations: []` (see
 * lib/annotationSanitize.ts — drops/repairs any record with an unrecognised type, missing anchor,
 * or invalid geometry rather than trusting the persisted shape blindly) onto a workspace-owned data
 * snapshot that predates one or more of these — used for both the active top-level state and every
 * archived snapshot inside inactiveWorkspaceOwnedData (see withWorkspaceOwnedDefaultsInArchive). */
function withWorkspaceOwnedDefaults(value: unknown): unknown {
  if (!isPlainObject(value)) return value;
  const snapshot = value;
  const coverage = (isPlainObject(snapshot.upscCseSyllabusCoverage) ? snapshot.upscCseSyllabusCoverage : {}) as UpscCseSyllabusCoverage;
  return {
    ...snapshot,
    importedContent: backfillImportedContentUpdatedAt(Array.isArray(snapshot.importedContent) ? snapshot.importedContent : []),
    contentRelationships: stampRelationshipEntityTypes(Array.isArray(snapshot.contentRelationships) ? snapshot.contentRelationships : []),
    upscCseSyllabusCoverage: migrateGranularCoverageBackfill(coverage, UPSC_CSE_GRANULAR_NODES),
    upscCsePrelimsPyqAttempts: Array.isArray(snapshot.upscCsePrelimsPyqAttempts) ? snapshot.upscCsePrelimsPyqAttempts : [],
    upscCseStudyTasks: Array.isArray(snapshot.upscCseStudyTasks) ? snapshot.upscCseStudyTasks : [],
    upscCseStudyPlanConfig: isPlainObject(snapshot.upscCseStudyPlanConfig) ? snapshot.upscCseStudyPlanConfig : null,
    phdResearchStartDate: typeof snapshot.phdResearchStartDate === 'string' ? snapshot.phdResearchStartDate : PHD_RESEARCH_START_DATE_DEFAULT,
    phdTopicAreas: Array.isArray(snapshot.phdTopicAreas) ? snapshot.phdTopicAreas : [],
    phdMicroTargets: Array.isArray(snapshot.phdMicroTargets) ? snapshot.phdMicroTargets : [],
    annotations: sanitizeAnnotations(snapshot.annotations),
    folders: Array.isArray(snapshot.folders) ? snapshot.folders : [],
    knowledgeClassifications: Array.isArray(snapshot.knowledgeClassifications) ? (snapshot.knowledgeClassifications as KnowledgeClassification[]) : [],
  };
}

/** Backfills `importedContent: []`/`contentRelationships: []` onto every snapshot inside an
 * inactiveWorkspaceOwnedData archive (see withWorkspaceOwnedDefaults) — not just the top-level
 * active fields. */
function withWorkspaceOwnedDefaultsInArchive(rawArchive: unknown): Record<string, unknown> {
  if (!rawArchive || typeof rawArchive !== 'object' || Array.isArray(rawArchive)) return {};
  const archive = rawArchive as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(archive)) {
    result[key] = withWorkspaceOwnedDefaults(archive[key]);
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
    importedContent: backfillImportedContentUpdatedAt(Array.isArray(state.importedContent) ? state.importedContent : []),
    contentRelationships: stampRelationshipEntityTypes(Array.isArray(state.contentRelationships) ? state.contentRelationships : []),
    upscCseSyllabusCoverage: migrateGranularCoverageBackfill(
      (isPlainObject(state.upscCseSyllabusCoverage) ? state.upscCseSyllabusCoverage : {}) as UpscCseSyllabusCoverage,
      UPSC_CSE_GRANULAR_NODES,
    ),
    upscCsePrelimsPyqAttempts: Array.isArray(state.upscCsePrelimsPyqAttempts) ? state.upscCsePrelimsPyqAttempts : [],
    upscCseStudyTasks: Array.isArray(state.upscCseStudyTasks) ? state.upscCseStudyTasks : [],
    upscCseStudyPlanConfig: isPlainObject(state.upscCseStudyPlanConfig) ? state.upscCseStudyPlanConfig : null,
    phdResearchStartDate: typeof state.phdResearchStartDate === 'string' ? state.phdResearchStartDate : PHD_RESEARCH_START_DATE_DEFAULT,
    phdTopicAreas: Array.isArray(state.phdTopicAreas) ? state.phdTopicAreas : [],
    phdMicroTargets: Array.isArray(state.phdMicroTargets) ? state.phdMicroTargets : [],
    folders: Array.isArray(state.folders) ? state.folders : [],
    knowledgeClassifications: Array.isArray(state.knowledgeClassifications) ? state.knowledgeClassifications : [],
    documentEmbeddings: Array.isArray(state.documentEmbeddings) ? state.documentEmbeddings : [],
    activeWorkspaceId: (state.activeWorkspaceId as WorkspaceKind | undefined) ?? DEFAULT_WORKSPACE_ID,
    inactiveWorkspaceOwnedData: withWorkspaceOwnedDefaultsInArchive(state.inactiveWorkspaceOwnedData),
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

      upscCseSyllabusCoverage: {},
      setUpscCseCoverageState: (microsyllabusId, coverageState) =>
        set((state) => ({ upscCseSyllabusCoverage: { ...state.upscCseSyllabusCoverage, [microsyllabusId]: coverageState } })),

      upscCsePrelimsPyqAttempts: [],
      addUpscCsePrelimsPyqAttempt: (attempt) => set((state) => ({ upscCsePrelimsPyqAttempts: [attempt, ...state.upscCsePrelimsPyqAttempts] })),

      upscCseStudyTasks: [],
      addUpscCseStudyTask: (task) => set((state) => ({ upscCseStudyTasks: [task, ...state.upscCseStudyTasks] })),
      addUpscCseStudyTasks: (tasks) => set((state) => ({ upscCseStudyTasks: [...tasks, ...state.upscCseStudyTasks] })),
      updateUpscCseStudyTask: (id, updates) => set((state) => ({ upscCseStudyTasks: applyUpdateUpscCseStudyTask(state.upscCseStudyTasks, id, updates) })),
      setUpscCseStudyTaskStatus: (id, status) =>
        set((state) => ({ upscCseStudyTasks: applyUpscCseStudyTaskStatus(state.upscCseStudyTasks, id, status, new Date().toISOString()) })),
      deleteUpscCseStudyTask: (id) => set((state) => ({ upscCseStudyTasks: applyDeleteUpscCseStudyTask(state.upscCseStudyTasks, id) })),

      upscCseStudyPlanConfig: null,
      setUpscCseStudyPlanConfig: (config) => set({ upscCseStudyPlanConfig: config }),
      clearUpscCseStudyPlanConfig: () => set({ upscCseStudyPlanConfig: null }),

      phdResearchStartDate: PHD_RESEARCH_START_DATE_DEFAULT,
      setPhdResearchStartDate: (date) => set({ phdResearchStartDate: date }),

      phdTopicAreas: [],
      addPhdTopicArea: (area) => set((state) => ({ phdTopicAreas: [area, ...state.phdTopicAreas] })),
      updatePhdTopicArea: (id, updates) =>
        set((state) => ({ phdTopicAreas: applyUpdatePhdTopicArea(state.phdTopicAreas, id, updates, new Date().toISOString()) })),
      deletePhdTopicArea: (id) => set((state) => ({ phdTopicAreas: applyDeletePhdTopicArea(state.phdTopicAreas, id) })),

      phdMicroTargets: [],
      addPhdMicroTarget: (input, id, createdAt) =>
        set((state) => ({ phdMicroTargets: [applyCreateMicroTarget(input, id, createdAt), ...state.phdMicroTargets] })),
      updatePhdMicroTarget: (id, updates) => set((state) => ({ phdMicroTargets: applyUpdateMicroTarget(state.phdMicroTargets, id, updates) })),
      setPhdMicroTargetStatus: (id, status) =>
        set((state) => ({ phdMicroTargets: applySetMicroTargetStatus(state.phdMicroTargets, id, status, new Date().toISOString()) })),
      deletePhdMicroTarget: (id) => set((state) => ({ phdMicroTargets: applyDeleteMicroTarget(state.phdMicroTargets, id) })),

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
      deleteNote: (id) =>
        set((state) => ({
          notes: state.notes.filter((n) => n.id !== id),
          contentRelationships: state.contentRelationships.filter(
            (r) => !((r.sourceId === id && r.sourceType === 'note') || (r.targetId === id && r.targetType === 'note')),
          ),
          // AI Library — same cascade as deleteImportedContent's own documentEmbeddings line above.
          documentEmbeddings: state.documentEmbeddings.filter((r) => r.documentId !== `note:${id}`),
        })),
      togglePinNote: (id) =>
        set((state) => ({
          notes: state.notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n)),
        })),
      bulkUpdateNotes: (ids, patch) =>
        set((state) => {
          const idSet = new Set(ids);
          const now = new Date().toISOString();
          return { notes: state.notes.map((n) => (idSet.has(n.id) ? applyNoteOrganizationPatch(n, patch, now) : n)) };
        }),

      attempts: [],
      addAttempt: (attempt) =>
        set((state) => {
          const { stamped, studyLog } = stampWorkspaceAndBumpTestsCompleted(state.activeWorkspaceId, state.studyLog, attempt);
          return { attempts: [stamped, ...state.attempts], studyLog };
        }),

      pyqAttempts: [],
      addPyqAttempt: (attempt) =>
        set((state) => {
          const { stamped, studyLog } = stampWorkspaceAndBumpTestsCompleted(state.activeWorkspaceId, state.studyLog, attempt);
          return { pyqAttempts: [stamped, ...state.pyqAttempts], studyLog };
        }),

      sessions: [],
      addSession: (session) =>
        set((state) => ({ sessions: [{ ...session, workspaceId: session.workspaceId ?? state.activeWorkspaceId }, ...state.sessions] })),

      studyLog: {},
      bumpFocusMinutes: (date, minutes) =>
        set((state) => ({ studyLog: bumpStudyLogField(state.studyLog, date, 'focusMinutes', minutes) })),
      bumpTopicsCompleted: (date, count) =>
        set((state) => ({ studyLog: bumpStudyLogField(state.studyLog, date, 'topicsCompleted', count) })),
      bumpTestsCompleted: (date) =>
        set((state) => ({ studyLog: bumpStudyLogField(state.studyLog, date, 'testsCompleted', 1) })),

      starredQuestionIds: [],
      toggleStarredQuestion: (id) =>
        set((state) => ({ starredQuestionIds: toggleInArray(state.starredQuestionIds, id) })),

      bookmarkedPyqIds: [],
      toggleBookmarkedPyq: (id) =>
        set((state) => ({ bookmarkedPyqIds: toggleInArray(state.bookmarkedPyqIds, id) })),

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
      recordRevisionCorrect: (itemId, today, source) =>
        set((state) => ({ revisionQueue: recordRevisionCorrectItem(state.revisionQueue, itemId, today, source) })),
      recordRevisionIncorrect: (itemId, today, source) =>
        set((state) => ({ revisionQueue: recordRevisionIncorrectItem(state.revisionQueue, itemId, today, source) })),
      addToRevisionQueue: (itemId, today) =>
        set((state) => ({ revisionQueue: addRevisionQueueItem(state.revisionQueue, itemId, today) })),

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
            // `updatedAt` is always freshly stamped here, never trusted from `updates` — same
            // "the store owns this timestamp, not the caller" discipline as id/workspaceId above.
            return { ...c, ...safeUpdates, updatedAt: new Date().toISOString() };
          }),
        })),
      deleteImportedContent: (id) =>
        set((state) => ({
          importedContent: state.importedContent.filter((c) => c.id !== id),
          // Cascade: a relationship pointing at content that no longer exists is never left
          // dangling — see contentRelationships below. Type-checked too: an id that happens to
          // coincide with a Note's id (astronomically unlikely, but never assumed impossible — see
          // lib/contentRelationships.ts's module header) must never cascade-delete a note-endpoint
          // relationship by mistake.
          contentRelationships: state.contentRelationships.filter(
            (r) => !((r.sourceId === id && r.sourceType === 'imported_content') || (r.targetId === id && r.targetType === 'imported_content')),
          ),
          // Same cascade for knowledgeClassifications — a classification referencing deleted
          // content is never left dangling either (see lib/knowledgeClassification.ts's
          // deleteClassificationsForItem).
          knowledgeClassifications: deleteClassificationsForItem(state.knowledgeClassifications, id, 'imported_content'),
          // AI Library — same cascade for the semantic search index: an embedding record pointing
          // at deleted content is never left dangling. `'imported_content:' + id` mirrors
          // lib/jarvis/workspaceContentBridge.ts's own toWorkspaceDocumentId format exactly (not
          // imported directly, to avoid a new store.ts -> jarvis/* dependency for one string
          // template) — that file remains the one source of truth for the format itself.
          documentEmbeddings: state.documentEmbeddings.filter((r) => r.documentId !== `imported_content:${id}`),
          // P2.4 — same cascade discipline for revisionQueue (lib/revisionQueue.ts): an id added to
          // revision via RepositoryDetail.tsx's "Add to Revision" button (Current Affairs only — see
          // that module's own header) is never left scheduling a review for content that no longer
          // exists. Only ever removes THIS exact id's own entry via withoutRevisionQueueItem below —
          // every other id's scheduling state (box/dueDate/reviewCount) is untouched. APFC's PYQ ids
          // are never ImportedContent ids (a PYQ is never stored as ImportedContent at all), so this
          // can only ever strip a CSE Current Affairs article's own entry, never an APFC one.
          revisionQueue: withoutRevisionQueueItem(state.revisionQueue, id),
        })),
      bulkUpdateImportedContent: (ids, patch) =>
        set((state) => {
          const idSet = new Set(ids);
          const now = new Date().toISOString();
          return { importedContent: state.importedContent.map((c) => (idSet.has(c.id) ? applyImportedContentOrganizationPatch(c, patch, now) : c)) };
        }),

      folders: [],
      addFolder: (folder) => set((state) => ({ folders: [folder, ...state.folders] })),
      renameFolder: (id, name) => set((state) => ({ folders: renameFolderInList(state.folders, id, name) })),
      deleteFolder: (id, _contentAction) =>
        set((state) => {
          const target = state.folders.find((f) => f.id === id);
          if (!target) return {};
          const promotedParentId = target.parentId;
          const now = new Date().toISOString();
          return {
            folders: deleteFolderFromList(state.folders, id, now),
            notes: state.notes.map((n) => (n.folderId === id ? { ...n, folderId: promotedParentId, updatedAt: now } : n)),
            importedContent: state.importedContent.map((c) =>
              c.metadata?.folderId === id ? { ...c, metadata: { ...c.metadata, folderId: promotedParentId }, updatedAt: now } : c,
            ),
          };
        }),

      contentRelationships: [],
      addContentRelationship: (input) => {
        const state = get();
        const pools = {
          importedContentIds: new Set(state.importedContent.map((c) => c.id)),
          noteIds: new Set(state.notes.map((n) => n.id)),
        };
        const result = createContentRelationship(state.contentRelationships, pools, {
          workspaceId: state.activeWorkspaceId,
          source: input.source,
          target: input.target,
          type: input.type,
        });
        if (result.status === 'ok') {
          set({ contentRelationships: [result.relationship, ...state.contentRelationships] });
        }
        return result;
      },
      deleteContentRelationship: (id) => set((state) => ({ contentRelationships: state.contentRelationships.filter((r) => r.id !== id) })),

      knowledgeClassifications: [],
      // Knowledge Librarian P0.1 hardening — every record in the batch is re-stamped with the
      // CURRENT activeWorkspaceId here, exactly like addImportedContent already does for a single
      // item (never trusting whatever workspaceId the batch itself carries — see this action's own
      // doc comment above). Still one atomic set() call: the whole batch commits together in a
      // single state transition, or (if the caller never calls this) not at all — re-stamping each
      // record's workspaceId first doesn't change that.
      addKnowledgeIngestionBatch: (batch) =>
        set((state) => {
          const workspaceId = state.activeWorkspaceId;
          const originalDocument = { ...batch.originalDocument, workspaceId };
          const articles = batch.articles.map((a) => ({ ...a, workspaceId }));
          const relationships = batch.relationships.map((r) => ({ ...r, workspaceId }));
          const classifications = batch.classifications.map((c) => ({ ...c, workspaceId }));
          return {
            importedContent: [originalDocument, ...articles, ...state.importedContent],
            contentRelationships: [...relationships, ...state.contentRelationships],
            knowledgeClassifications: [...classifications, ...state.knowledgeClassifications],
          };
        }),
      confirmKnowledgeClassification: (id) =>
        set((state) => {
          const target = state.knowledgeClassifications.find((c) => c.id === id);
          const updated = confirmClassification(state.knowledgeClassifications, id);
          // P1.1 — backfillPrimaryApfcTopicId writes to the APFC-ONLY legacy metadata.apfcTopicId
          // field; a confirmed UPSC CSE classification's topicId is a granular CSE node id, which
          // must never be written there (that field would then hold a value no APFC-topic-shaped
          // consumer, e.g. lib/apfcSyllabus.ts's resolveApfcTopicPath, could ever resolve). Only the
          // 'apfc' taxonomy has this legacy single-primary-topic field at all today — see this
          // feature's own P1.1 report for what a UPSC CSE/PhD equivalent would need.
          if (!target || target.taxonomy !== 'apfc') return { knowledgeClassifications: updated };
          // Backfill the EXISTING single-primary-topic field (see backfillPrimaryApfcTopicId's own
          // header above) so every existing apfcTopicId-driven view (Syllabus.tsx's "linked" count,
          // RepositoryDetail.tsx's "APFC Syllabus Topic" line) picks this up with no changes of its
          // own. The FIRST confirmed topic becomes the item's primary one; a later confirm for a
          // DIFFERENT topic on the same item never overwrites it — that second topic simply stays
          // fully discoverable via lib/repository.ts's listImportedContentByApfcTopicIncluding
          // Classifications instead (see this feature's own "multiple legitimate topic mappings"
          // requirement).
          const backfilled = backfillPrimaryApfcTopicId(state.importedContent, target.itemId, target.topicId);
          return backfilled ? { knowledgeClassifications: updated, importedContent: backfilled } : { knowledgeClassifications: updated };
        }),
      rejectKnowledgeClassification: (id) => set((state) => ({ knowledgeClassifications: rejectClassification(state.knowledgeClassifications, id) })),
      // Knowledge Librarian P0.1 hardening — duplicate-classification prevention at the store
      // level, independent of whatever the UI's own topic picker already filters out (defense in
      // depth: this guarantees at most one record per (itemId, itemType, taxonomy, topicId) no
      // matter what calls this action). Reuses mergeProposedClassifications (previously unused —
      // see lib/knowledgeClassification.ts's own header) exactly as it already behaves for a
      // single-candidate "batch":
      //   - no existing record for this pair -> added as a fresh confirmed/manual record.
      //   - an existing 'confirmed' record -> left completely untouched (nothing sensible to do;
      //     it's already decided — no duplicate, no change).
      //   - an existing 'rejected' record -> left completely untouched; a manual add is NEVER
      //     allowed to silently resurrect a rejection. Deliberately reclassifying a rejected entry
      //     is its own separate, explicit action — see confirmKnowledgeClassification, which
      //     RepositoryDetail.tsx's "Reclassify" button (shown only on rejected rows) calls
      //     directly, exactly the "documented reclassification workflow" this needs.
      //   - an existing 'proposed' record -> refreshed in place to the manual candidate's own
      //     confidence(1)/rationale/source('manual'), but its STATUS stays 'proposed' (merge never
      //     promotes status on its own) — reachable only if a caller bypasses the UI's own
      //     already-classified filter, since the picker never offers a topic with any existing
      //     record; still never a duplicate row.
      addManualKnowledgeClassification: (input) =>
        set((state) => {
          // P1.1 — createManualClassification now derives its taxonomy from the (trusted,
          // store-owned) activeWorkspaceId rather than hardcoding APFC, and returns `undefined`
          // for a workspace with no taxonomy yet (today: PhD research) — never throws, never
          // fabricates a classification for a workspace that can't support one. A UI should never
          // let this be reached for such a workspace (no topic picker to click), but if it somehow
          // were, this is a no-op rather than a silently-mis-tagged record.
          const manual = createManualClassification({ workspaceId: state.activeWorkspaceId, itemId: input.itemId, itemType: input.itemType, topicId: input.topicId });
          if (!manual) return {};
          const knowledgeClassifications = mergeProposedClassifications(state.knowledgeClassifications, [manual]);
          // A manual classification is born already 'confirmed' (createManualClassification), so
          // it never passes through confirmKnowledgeClassification's own backfill — this action
          // needs the exact same backfill itself (see backfillPrimaryApfcTopicId's header above),
          // but ONLY for the 'apfc' taxonomy — see confirmKnowledgeClassification's own P1.1 note
          // on why a CSE classification must never write to the APFC-only legacy field.
          if (manual.taxonomy !== 'apfc') return { knowledgeClassifications };
          const backfilled = backfillPrimaryApfcTopicId(state.importedContent, input.itemId, input.topicId);
          return backfilled ? { knowledgeClassifications, importedContent: backfilled } : { knowledgeClassifications };
        }),
      deleteKnowledgeClassification: (id) => set((state) => ({ knowledgeClassifications: deleteClassification(state.knowledgeClassifications, id) })),

      documentEmbeddings: [],
      setDocumentEmbeddings: (records) => set({ documentEmbeddings: records }),

      applyRepositoryImportPlan: (plan) =>
        set((state) => ({
          notes: [...plan.notesToAdd, ...state.notes],
          importedContent: [...plan.importedContentToAdd, ...state.importedContent],
          contentRelationships: [...plan.relationshipsToAdd, ...state.contentRelationships],
        })),

      annotations: [],
      addAnnotation: (annotation) => set((state) => ({ annotations: [annotation, ...state.annotations] })),
      updateAnnotationText: (id, text) =>
        set((state) => ({
          annotations: state.annotations.map((a) => (a.id === id && (a.type === 'textNote' || a.type === 'stickyNote') ? { ...a, text, updatedAt: new Date().toISOString() } : a)),
        })),
      updateAnnotationPoints: (id, points) =>
        set((state) => ({
          annotations: state.annotations.map((a) => (a.id === id && isGeometryAnnotation(a) ? { ...a, points, updatedAt: new Date().toISOString() } : a)),
        })),
      deleteAnnotation: (id) => set((state) => ({ annotations: state.annotations.filter((a) => a.id !== id) })),
      bridgeAnnotationToRevisionQueue: (annotationId, today) => {
        const state = get();
        const annotation = state.annotations.find((a) => a.id === annotationId);
        if (!annotation) return 'cannot_add';
        const result = addAnnotationToRevisionQueue(state.revisionQueue, annotation, today);
        if (result.status === 'added') set({ revisionQueue: result.queue });
        return result.status;
      },

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
            upscCseSyllabusCoverage: state.upscCseSyllabusCoverage,
            upscCsePrelimsPyqAttempts: state.upscCsePrelimsPyqAttempts,
            upscCseStudyTasks: state.upscCseStudyTasks,
            upscCseStudyPlanConfig: state.upscCseStudyPlanConfig,
            phdResearchStartDate: state.phdResearchStartDate,
            phdTopicAreas: state.phdTopicAreas,
            phdMicroTargets: state.phdMicroTargets,
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
            contentRelationships: state.contentRelationships,
            annotations: state.annotations,
            folders: state.folders,
            knowledgeClassifications: state.knowledgeClassifications,
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
          upscCseSyllabusCoverage: {},
          upscCsePrelimsPyqAttempts: [],
          upscCseStudyTasks: [],
          upscCseStudyPlanConfig: null,
          phdResearchStartDate: PHD_RESEARCH_START_DATE_DEFAULT,
          phdTopicAreas: [],
          phdMicroTargets: [],
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
          contentRelationships: [],
          annotations: [],
          folders: [],
          knowledgeClassifications: [],
          documentEmbeddings: [],
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
    upscCseSyllabusCoverage: state.upscCseSyllabusCoverage,
    upscCsePrelimsPyqAttempts: state.upscCsePrelimsPyqAttempts,
    upscCseStudyTasks: state.upscCseStudyTasks,
    upscCseStudyPlanConfig: state.upscCseStudyPlanConfig,
    phdResearchStartDate: state.phdResearchStartDate,
    phdTopicAreas: state.phdTopicAreas,
    phdMicroTargets: state.phdMicroTargets,
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
    contentRelationships: state.contentRelationships,
    annotations: state.annotations,
    folders: state.folders,
    knowledgeClassifications: state.knowledgeClassifications,
    // documentEmbeddings is DELIBERATELY excluded from this export (and therefore from
    // cloudSync.ts, which reuses this function as its sync payload) — see APP_STORE_PERSIST_VERSION's
    // own Version 16 comment for why: it is a derived, rebuildable local search index, never
    // source-of-truth user data.
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
    upscCseSyllabusCoverage: data.upscCseSyllabusCoverage ?? {},
    upscCsePrelimsPyqAttempts: data.upscCsePrelimsPyqAttempts ?? [],
    upscCseStudyTasks: data.upscCseStudyTasks ?? [],
    upscCseStudyPlanConfig: data.upscCseStudyPlanConfig ?? null,
    phdResearchStartDate: data.phdResearchStartDate ?? PHD_RESEARCH_START_DATE_DEFAULT,
    phdTopicAreas: data.phdTopicAreas ?? [],
    phdMicroTargets: data.phdMicroTargets ?? [],
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
    importedContent: backfillImportedContentUpdatedAt(data.importedContent ?? []) as ImportedContent[],
    contentRelationships: data.contentRelationships ?? [],
    annotations: sanitizeAnnotations(data.annotations),
    folders: data.folders ?? [],
    knowledgeClassifications: data.knowledgeClassifications ?? [],
    activeWorkspaceId: (data.activeWorkspaceId as WorkspaceKind | undefined) ?? DEFAULT_WORKSPACE_ID,
    inactiveWorkspaceOwnedData: data.inactiveWorkspaceOwnedData ?? {},
  });
}
