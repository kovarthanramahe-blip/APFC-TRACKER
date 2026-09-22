import type { WorkspaceKind } from './workspace';
import { DEFAULT_WORKSPACE_ID } from './workspace';
import {
  IMPORTED_CONTENT_TYPES,
  confirmImportedContent,
  createManualImportedContent,
  getImportedContentById,
  selectImportedContentByType,
  type ImportedContent,
  type ImportedContentMetadata,
  type ImportedContentType,
} from './contentImport';
import {
  collectImportedContentCategories,
  collectImportedContentTags,
  getContentCategory,
  getContentTags,
  queryImportedContent,
  searchImportedContent,
  sortImportedContent,
  type ImportedContentSortOrder,
} from './importedContentRepository';
import type { Note } from './types';
import type { ContentRelationship, RelationshipEntityType } from './contentRelationships';

// Unified Repository Foundation.
//
// This module does NOT introduce a second persistence layer or a new store — it is a reusable
// service layer of PURE functions built on top of what already exists: lib/contentImport.ts's
// ImportedContent pipeline, lib/importedContentRepository.ts's search/filter/sort utilities, the
// Note domain model (lib/types.ts), and lib/contentRelationships.ts. Every function here either
// reuses one of those directly or is a thin, equally-pure wrapper around them. Nothing here is
// wired into lib/store.ts or any page — the existing store actions (addImportedContent,
// updateImportedContent, deleteImportedContent, upsertNote, deleteNote, addContentRelationship,
// deleteContentRelationship) remain the only way any of this is actually persisted, and every
// existing PhD Research / Working Bibliography / Notes page keeps calling them exactly as before.
// This is foundation only — see the module's own stage notes for what's deliberately NOT here yet:
// no repository UI, no question extraction/generation, no cloud-sync/export-format changes.
//
// The pipeline this foundation models (already true of contentImport.ts, restated here as this
// module's own frame of reference):
//   FILE -> PARSE -> CONTENT TYPE -> PREVIEW -> USER CONFIRMATION -> PERSIST -> SEARCH/FILTER -> RELATIONSHIPS

// ============================================================================================
// 1. Content-type registry — metadata/capabilities only, never actual content.
// ============================================================================================

/** Every content type the repository foundation knows about — reuses ImportedContentType as the
 * single source of truth (it already lists exactly: note, research_document, bibliography,
 * question_bank, descriptive_questions, pyq, other) rather than defining a second, parallel enum
 * that could drift out of sync. */
export type RepositoryContentType = ImportedContentType;

export const REPOSITORY_CONTENT_TYPES: readonly RepositoryContentType[] = IMPORTED_CONTENT_TYPES;

/** A capability a content type may or may not support — deliberately not assumed uniform across
 * every type (see capabilitiesForContentType below for which types support which). */
export type RepositoryCapability = 'importable' | 'searchable' | 'taggable' | 'categorisable' | 'linkable' | 'editable' | 'deletable';

export type RepositoryCapabilities = Record<RepositoryCapability, boolean>;

/** Content types actually wired into lib/contentRelationships.ts today (see the PhD Research
 * Source<->Document and Notes<->Repository linking stages) — 'linkable' reflects what is really
 * connected right now, not what the relationship model could theoretically support (it is in fact
 * type-agnostic — see contentRelationships.ts's own header — but no linking UI exists yet for
 * question_bank/descriptive_questions/pyq/other, so this registry does not overclaim it). */
const LINKABLE_CONTENT_TYPES: ReadonlySet<RepositoryContentType> = new Set(['note', 'research_document', 'bibliography']);

/**
 * Capability derivation, one content type at a time. 'note' is the one type whose real persistence
 * destination is a domain Note (lib/types.ts), not an ImportedContent (see contentImport.ts's own
 * module header) — a Note has no tags/category field at all, so 'note' is never taggable or
 * categorisable, unlike every other type, which is backed by ImportedContent and therefore always
 * carries the generic `metadata.tags`/`metadata.category` fields (contentImport.ts imposes no
 * per-contentType restriction on metadata). `importable` is true for every type because
 * confirmImportedContent/createManualImportedContent take an explicit, caller-supplied contentType
 * and impose no restriction on which one — the PIPELINE is generic even for content types with no
 * dedicated UI yet (question_bank, descriptive_questions, pyq). `editable`/`deletable` are true for
 * every type for the same reason: updateImportedContent/deleteImportedContent (and upsertNote/
 * deleteNote for 'note') have no contentType restriction.
 */
function capabilitiesForContentType(type: RepositoryContentType): RepositoryCapabilities {
  const isNote = type === 'note';
  return {
    importable: true,
    searchable: true,
    taggable: !isNote,
    categorisable: !isNote,
    linkable: LINKABLE_CONTENT_TYPES.has(type),
    editable: true,
    deletable: true,
  };
}

const REPOSITORY_CONTENT_TYPE_LABELS: Record<RepositoryContentType, string> = {
  note: 'Note',
  research_document: 'Research Document',
  bibliography: 'Bibliography',
  question_bank: 'Question Bank',
  descriptive_questions: 'Descriptive Questions',
  pyq: 'Previous Year Questions',
  other: 'Other',
};

export interface RepositoryContentTypeMeta {
  type: RepositoryContentType;
  label: string;
  capabilities: RepositoryCapabilities;
}

/** The single registry of supported repository content types — metadata/capabilities only, built
 * once from REPOSITORY_CONTENT_TYPES so it is always exactly as complete as that list (a registry
 * entry can never silently go missing for a type that exists). */
export const REPOSITORY_CONTENT_TYPE_REGISTRY: readonly RepositoryContentTypeMeta[] = REPOSITORY_CONTENT_TYPES.map((type) => ({
  type,
  label: REPOSITORY_CONTENT_TYPE_LABELS[type],
  capabilities: capabilitiesForContentType(type),
}));

export function getRepositoryContentTypeMeta(type: RepositoryContentType): RepositoryContentTypeMeta {
  const meta = REPOSITORY_CONTENT_TYPE_REGISTRY.find((m) => m.type === type);
  if (!meta) throw new Error(`Unknown repository content type: ${type}`);
  return meta;
}

/** Whether a content type supports a given capability — the one function UI code should call
 * rather than inspecting `.capabilities` directly, so "does this type support X" reads as a single
 * question at every call site. */
export function repositoryContentTypeSupports(type: RepositoryContentType, capability: RepositoryCapability): boolean {
  return getRepositoryContentTypeMeta(type).capabilities[capability];
}

// ============================================================================================
// Workspace scoping helpers
// ============================================================================================

/** Every ImportedContent always carries an explicit workspaceId (contentImport.ts's constructors
 * require it) — this is a plain field read, kept as a named helper only so it reads symmetrically
 * with effectiveNoteWorkspaceId below at call sites that handle both collections generically. */
export function effectiveImportedContentWorkspaceId(item: ImportedContent): WorkspaceKind {
  return item.workspaceId;
}

/** A Note's `workspaceId` is optional on the type (pre-Multi-Workspace-OS notes had none) — every
 * live note is stamped with one at write time (lib/store.ts's upsertNote) and at migration time
 * (lib/store.ts's stampWorkspaceIdOnArray, defaulting to DEFAULT_WORKSPACE_ID), but this module
 * takes arbitrary Note[] fixtures directly (see its tests) rather than only ever the live store, so
 * it applies the exact same fallback here instead of assuming the field is always present. */
export function effectiveNoteWorkspaceId(note: Note): WorkspaceKind {
  return note.workspaceId ?? DEFAULT_WORKSPACE_ID;
}

// ============================================================================================
// 5. Unified repository entry — a read-only PROJECTION for discovery/search/display, never a
// replacement for either domain model. An ImportedContent stays an ImportedContent; a Note stays a
// Note (lib/store.ts keeps them in their own separate fields, unchanged by this module) — this is
// just a common shape a search result can be rendered from without the caller needing to know
// which of the two collections a given result actually came from.
// ============================================================================================

export interface RepositoryEntry {
  entityId: string;
  /** Which collection this entry actually lives in — reuses RelationshipEntityType
   * ('imported_content' | 'note') so a RepositoryEntry's id can be fed straight into
   * lib/contentRelationships.ts's functions without another lookup or type translation. */
  entityType: RelationshipEntityType;
  contentType: RepositoryContentType;
  title: string;
  workspaceId: WorkspaceKind;
  /** 'import' | 'manual' mirror ImportedContentProvenance.origin (see contentImport.ts — an item
   * saved before that field existed is treated as 'import', the same default contentImport.ts's
   * own readers use); 'created' is a Note, which has no import/manual distinction of its own. */
  origin: 'import' | 'manual' | 'created';
  /** ISO timestamp — ImportedContent.provenance.importedAt, or Note.createdAt. */
  createdAt: string;
  tags: string[];
  category?: string;
}

export function repositoryEntryFromImportedContent(item: ImportedContent): RepositoryEntry {
  return {
    entityId: item.id,
    entityType: 'imported_content',
    contentType: item.contentType,
    title: item.title,
    workspaceId: item.workspaceId,
    origin: item.provenance.origin ?? 'import',
    createdAt: item.provenance.importedAt,
    tags: getContentTags(item),
    category: getContentCategory(item),
  };
}

export function repositoryEntryFromNote(note: Note): RepositoryEntry {
  return {
    entityId: note.id,
    entityType: 'note',
    contentType: 'note',
    title: note.title,
    workspaceId: effectiveNoteWorkspaceId(note),
    origin: 'created',
    createdAt: note.createdAt,
    tags: [],
    category: undefined,
  };
}

/** Every entry from both collections, as RepositoryEntry projections — the base discovery list
 * every query/filter/stat function below reads from. Order is not meaningful here (queryRepository
 * applies its own deterministic sort); this is discovery, not display order. */
export function listRepositoryEntries(importedContent: readonly ImportedContent[], notes: readonly Note[]): RepositoryEntry[] {
  return [...importedContent.map(repositoryEntryFromImportedContent), ...notes.map(repositoryEntryFromNote)];
}

// ============================================================================================
// 1 + 4. Safe, pure repository operations — list / retrieve / filter / search / sort / query, all
// reusing lib/importedContentRepository.ts's existing utilities for the ImportedContent side rather
// than duplicating that logic, plus the equivalent handling for Notes (which has no tags/category
// of its own, so only title/content search and workspace/content-type scoping apply to it).
// ============================================================================================

/** List an ImportedContent collection's items belonging to one workspace. The live store's
 * `importedContent` field already only ever holds the active workspace's own items (see
 * lib/store.ts's setActiveWorkspaceId swap), but this function scopes explicitly rather than
 * assuming that invariant, so it is safe to call with any collection (e.g. a fixture spanning more
 * than one workspace in a test, or a future caller reading an archived snapshot). */
export function listImportedContentForWorkspace(items: readonly ImportedContent[], workspaceId: WorkspaceKind): ImportedContent[] {
  return items.filter((item) => effectiveImportedContentWorkspaceId(item) === workspaceId);
}

/** The Note equivalent of listImportedContentForWorkspace, using effectiveNoteWorkspaceId's same
 * DEFAULT_WORKSPACE_ID fallback for a note with no workspaceId at all. */
export function listNotesForWorkspace(notes: readonly Note[], workspaceId: WorkspaceKind): Note[] {
  return notes.filter((note) => effectiveNoteWorkspaceId(note) === workspaceId);
}

export { getImportedContentById, selectImportedContentByType, searchImportedContent, sortImportedContent };

export interface RepositoryQuery {
  workspaceId: WorkspaceKind;
  contentType?: RepositoryContentType;
  search?: string;
  tags?: readonly string[];
  category?: string;
  sort?: ImportedContentSortOrder;
}

/** Deterministic tie-break sort over RepositoryEntry, mirroring
 * lib/importedContentRepository.ts's sortImportedContent exactly (same three orders, same
 * "always break ties by id" rule) but generalised to RepositoryEntry's own createdAt/title/id
 * fields so it works identically for entries projected from either collection. */
export function sortRepositoryEntries(entries: readonly RepositoryEntry[], order: ImportedContentSortOrder = 'newest'): RepositoryEntry[] {
  const sorted = [...entries];
  sorted.sort((a, b) => {
    let primary = 0;
    if (order === 'newest') primary = b.createdAt.localeCompare(a.createdAt);
    else if (order === 'oldest') primary = a.createdAt.localeCompare(b.createdAt);
    else primary = a.title.toLowerCase().localeCompare(b.title.toLowerCase());
    return primary !== 0 ? primary : a.entityId.localeCompare(b.entityId);
  });
  return sorted;
}

/**
 * The single generic query entry point across BOTH collections — workspace + content type + search
 * text + tags + category + deterministic sort, applied in that order, returned as RepositoryEntry
 * projections. Reuses queryImportedContent for the entire ImportedContent side (search, tag
 * filter, category filter — sort is re-applied afterwards via sortRepositoryEntries so the two
 * collections interleave deterministically together, not as two separately-sorted blocks).
 *
 * Content-type filtering: 'note' matches every domain Note (they are always conceptually type
 * 'note') AND any ImportedContent item whose own contentType happens to be 'note' (a theoretical
 * case today — see contentImport.ts's module header, nothing currently creates one — but the
 * model permits it, so it is not silently dropped). Any other content type only ever matches
 * ImportedContent items (Notes are excluded entirely). No content type filter returns everything.
 *
 * Notes have no tags/category of their own, so an active tags or category filter naturally excludes
 * every note (a note never has any of the wanted tags, never matches a wanted category) — this
 * requires no special-casing here, it falls out of Note's actual shape.
 */
export function queryRepository(
  importedContent: readonly ImportedContent[],
  notes: readonly Note[],
  query: RepositoryQuery,
): RepositoryEntry[] {
  const scopedContent = listImportedContentForWorkspace(importedContent, query.workspaceId);
  const scopedNotes = listNotesForWorkspace(notes, query.workspaceId);

  const contentByType = query.contentType ? selectImportedContentByType(scopedContent, query.contentType) : scopedContent;

  const matchedContent = queryImportedContent(contentByType, {
    search: query.search,
    tags: query.tags,
    category: query.category,
  });

  // Tags/category filters never match a Note by construction (see doc comment above) — only a
  // content-type filter for something OTHER than 'note' needs to explicitly drop notes here.
  const notesEligible = !query.contentType || query.contentType === 'note';
  const tagsOrCategoryActive = (query.tags && query.tags.length > 0) || !!query.category;
  const matchedNotes = notesEligible && !tagsOrCategoryActive ? searchNotes(scopedNotes, query.search ?? '') : [];

  const entries = [...matchedContent.map(repositoryEntryFromImportedContent), ...matchedNotes.map(repositoryEntryFromNote)];
  return sortRepositoryEntries(entries, query.sort ?? 'newest');
}

/** Case-insensitive substring search over a Note's title and content — the Note-side equivalent of
 * lib/importedContentRepository.ts's searchImportedContent, kept separate since Note has no
 * rawContent/sourceFilename field to search. An empty/whitespace-only query matches everything,
 * exactly like searchImportedContent. */
export function searchNotes(notes: readonly Note[], query: string): Note[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...notes];
  return notes.filter((note) => note.title.toLowerCase().includes(q) || note.content.toLowerCase().includes(q));
}

// ============================================================================================
// 1. Create / import — pure builders. These already exist as contentImport.ts's
// confirmImportedContent/createManualImportedContent; re-exported here under the repository
// module's own name so callers working against this module's API don't need a second import, and
// so this module genuinely offers "create/import" as one of its listed operations without
// duplicating their logic.
// ============================================================================================

export { confirmImportedContent as createRepositoryImportedContent, createManualImportedContent as createManualRepositoryContent };

// ============================================================================================
// 1. Update metadata / delete — pure array-transform equivalents of lib/store.ts's
// updateImportedContent/deleteImportedContent actions. These do NOT touch the store (nothing here
// persists anything — see the module header); they exist so "update"/"delete" are genuinely
// available as safe, pure, independently-testable operations, matching exactly what the store
// actions already do so a future caller could use either interchangeably.
// ============================================================================================

/** Pure equivalent of lib/store.ts's updateImportedContent: returns a new array with the item's
 * metadata replaced (id/workspaceId are never touched, same runtime enforcement the store action
 * itself applies). Unmatched ids are a no-op (returns the array unchanged in content, matching the
 * store action's own silent-no-op behaviour for an unknown id). */
export function updateRepositoryContentMetadata(
  items: readonly ImportedContent[],
  id: string,
  metadata: ImportedContentMetadata | undefined,
): ImportedContent[] {
  return items.map((item) => (item.id === id ? { ...item, metadata } : item));
}

/** Pure equivalent of lib/store.ts's deleteImportedContent, including its cascade: removes the item
 * AND any relationship (in either direction) that references it as an 'imported_content' endpoint,
 * type-checked so an id that happens to coincide with a Note's id is never mistaken for it (same
 * discipline as the store action and lib/contentRelationships.ts's own header). */
export function deleteRepositoryImportedContent(
  items: readonly ImportedContent[],
  relationships: readonly ContentRelationship[],
  id: string,
): { items: ImportedContent[]; relationships: ContentRelationship[] } {
  return {
    items: items.filter((item) => item.id !== id),
    relationships: relationships.filter(
      (r) => !((r.sourceId === id && r.sourceType === 'imported_content') || (r.targetId === id && r.targetType === 'imported_content')),
    ),
  };
}

/** Pure equivalent of lib/store.ts's deleteNote, including its cascade over relationships with a
 * 'note' endpoint. */
export function deleteRepositoryNote(
  notes: readonly Note[],
  relationships: readonly ContentRelationship[],
  id: string,
): { notes: Note[]; relationships: ContentRelationship[] } {
  return {
    notes: notes.filter((note) => note.id !== id),
    relationships: relationships.filter((r) => !((r.sourceId === id && r.sourceType === 'note') || (r.targetId === id && r.targetType === 'note'))),
  };
}

// ============================================================================================
// 6. Repository statistics — pure calculations only, over whatever collections a caller supplies
// (not tied to "the active workspace only" — a caller can pass a single workspace's data or, for
// example, data spanning several archived snapshots, and get accurate counts either way).
// ============================================================================================

export interface RepositoryStatistics {
  totalItems: number;
  countsByContentType: Partial<Record<RepositoryContentType, number>>;
  countsByWorkspace: Partial<Record<WorkspaceKind, number>>;
  countsByCategory: Record<string, number>;
  /** Entries with no category set — kept separate from countsByCategory for the same reason
   * lib/importedContentRepository.ts's filterImportedContentUncategorized is kept separate from
   * filterImportedContentByCategory: an empty-string category key must never be confused with "no
   * category". Only ImportedContent-backed entries are eligible for a category at all (see
   * RepositoryEntry.category — a Note-backed entry's category is always undefined). */
  uncategorizedCount: number;
}

/** Pure statistics over a set of RepositoryEntry projections — build the input with
 * listRepositoryEntries (optionally pre-filtered with listImportedContentForWorkspace/
 * listNotesForWorkspace) rather than this function reading the store directly. */
export function computeRepositoryStatistics(entries: readonly RepositoryEntry[]): RepositoryStatistics {
  const countsByContentType: Partial<Record<RepositoryContentType, number>> = {};
  const countsByWorkspace: Partial<Record<WorkspaceKind, number>> = {};
  const countsByCategory: Record<string, number> = {};
  let uncategorizedCount = 0;

  for (const entry of entries) {
    countsByContentType[entry.contentType] = (countsByContentType[entry.contentType] ?? 0) + 1;
    countsByWorkspace[entry.workspaceId] = (countsByWorkspace[entry.workspaceId] ?? 0) + 1;
    const category = entry.category?.trim();
    if (category) countsByCategory[category] = (countsByCategory[category] ?? 0) + 1;
    else uncategorizedCount++;
  }

  return { totalItems: entries.length, countsByContentType, countsByWorkspace, countsByCategory, uncategorizedCount };
}

/** Every distinct tag across an ImportedContent collection — thin re-export of
 * lib/importedContentRepository.ts's collectImportedContentTags so this module's statistics and
 * organisation-utility surface can be reached from one place. Category collection is likewise
 * re-exported for the same reason. */
export { collectImportedContentTags, collectImportedContentCategories };

// ============================================================================================
// 7. Export-ready serialisation — a deterministic, JSON-safe representation of one workspace's
// repository content. This is intentionally SEPARATE from lib/store.ts's existing
// exportAllData/importAllData (pages/Settings.tsx's backup format), which this module does not
// read, call, or change in any way. It exists so a future export feature has a ready-made,
// already-tested building block rather than re-deriving this shape from scratch — nothing calls it
// yet.
// ============================================================================================

export interface RepositoryExportSnapshot {
  workspaceId: WorkspaceKind;
  exportedAt: string;
  importedContent: ImportedContent[];
  notes: Note[];
  relationships: ContentRelationship[];
}

/**
 * Builds a deterministic snapshot of one workspace's repository content: every array is filtered
 * to that workspace (relationships by their own workspaceId; imported content/notes via the same
 * scoping helpers every other function in this module uses) and sorted by id, so two calls given
 * the same underlying data always serialise identically regardless of the source arrays' original
 * order — the one property "deterministic" requires here. `exportedAt` is the only field that
 * varies run-to-run by design (it records when the snapshot was taken); callers wanting a fully
 * reproducible fixture (e.g. a test) can pass an explicit `exportedAt` override.
 */
export function buildRepositoryExportSnapshot(
  importedContent: readonly ImportedContent[],
  notes: readonly Note[],
  relationships: readonly ContentRelationship[],
  workspaceId: WorkspaceKind,
  exportedAt: string = new Date().toISOString(),
): RepositoryExportSnapshot {
  return {
    workspaceId,
    exportedAt,
    importedContent: [...listImportedContentForWorkspace(importedContent, workspaceId)].sort((a, b) => a.id.localeCompare(b.id)),
    notes: [...listNotesForWorkspace(notes, workspaceId)].sort((a, b) => a.id.localeCompare(b.id)),
    relationships: relationships.filter((r) => r.workspaceId === workspaceId).sort((a, b) => a.id.localeCompare(b.id)),
  };
}

/** JSON-stringifies a RepositoryExportSnapshot deterministically (stable 2-space indent, no key
 * reordering needed since object literal key order in buildRepositoryExportSnapshot is already
 * fixed by construction and JSON.stringify preserves insertion order for string keys). */
export function serializeRepositoryExportSnapshot(snapshot: RepositoryExportSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}
