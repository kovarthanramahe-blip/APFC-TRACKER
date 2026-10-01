// Premium Note Organisation (Phase 3B) — the Note-side mirror of
// lib/importedContentRepository.ts's search/filter/sort/patch functions. A SEPARATE module rather
// than a generic one shared with ImportedContent, because Note carries folderId/tags/isArchived as
// flat fields (see lib/types.ts's Note) rather than ImportedContent's nested `metadata` object, and
// Note's existing pin flag is already named `pinned` (not `isPinned`) — the comparison/filter logic
// itself is small enough (a few lines each) that duplicating it here is simpler and safer than
// forcing both shapes through one generic function (see lib/bibliography.ts's own queryBibliography
// for existing precedent: a domain-specific query wrapper coexisting with the shared
// queryImportedContent, rather than one function trying to serve every shape).
import type { Note } from './types';
import type { Folder } from './folders';

export function getNoteTags(note: Note): string[] {
  return note.tags ?? [];
}

export function getNoteFolderId(note: Note): string | null {
  return note.folderId ?? null;
}

export function isNoteArchived(note: Note): boolean {
  return note.isArchived ?? false;
}

/** Phase 4 — Visual Syllabus System: how many notes are filed under this syllabus topic
 * (Note.topicId — the SAME pre-existing FK pages/Syllabus.tsx's own "Study this topic" deep-link
 * already uses, see lib/types.ts's own header on it). Used to show a compact, "at a glance" notes
 * count on a syllabus topic row, shown only when > 0 — never fabricated for a topic with none. */
export function countNotesByTopic(notes: readonly Note[], topicId: string): number {
  return notes.filter((n) => n.topicId === topicId).length;
}

/** Case-insensitive substring search over title, Markdown content, tags, and (when `folders` is
 * supplied) the note's own folder name — Phase 5L: extends this one existing search function
 * rather than adding a second search engine, so every caller (queryNotes below, and Notes.tsx's
 * own Browse-mode search bar) gains the same coverage for free. `folders` defaults to `[]` (folder
 * matching silently skipped) so existing callers that only ever searched title/content keep
 * working unchanged. A wiki-link's target text (`[[Target]]`) lives directly in `note.content`, so
 * it is already covered by the content check — no separate handling needed. */
export function searchNotes(notes: readonly Note[], query: string, folders: readonly Folder[] = []): Note[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...notes];
  const folderNameById = new Map(folders.map((f) => [f.id, f.name.toLowerCase()]));
  return notes.filter((note) => {
    if (note.title.toLowerCase().includes(q)) return true;
    if (note.content.toLowerCase().includes(q)) return true;
    if (getNoteTags(note).some((t) => t.toLowerCase().includes(q))) return true;
    const folderId = getNoteFolderId(note);
    const folderName = folderId ? folderNameById.get(folderId) : undefined;
    return folderName ? folderName.includes(q) : false;
  });
}

/** Notes carrying ANY of the given tags (case-insensitive) — an empty `tags` list is a no-op. */
export function filterNotesByTags(notes: readonly Note[], tags: readonly string[]): Note[] {
  if (tags.length === 0) return [...notes];
  const wanted = new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean));
  if (wanted.size === 0) return [...notes];
  return notes.filter((note) => getNoteTags(note).some((t) => wanted.has(t.trim().toLowerCase())));
}

/** Notes filed under exactly `folderId` — pass `null` for "unfiled, at the workspace root". */
export function filterNotesByFolder(notes: readonly Note[], folderId: string | null): Note[] {
  return notes.filter((note) => getNoteFolderId(note) === folderId);
}

export function filterNotesPinned(notes: readonly Note[]): Note[] {
  return notes.filter((note) => note.pinned);
}

/** The one place "should this note show in the default (non-Archived) view" is decided. */
export function filterNotesByArchived(notes: readonly Note[], archived: boolean): Note[] {
  return notes.filter((note) => isNoteArchived(note) === archived);
}

export type NoteSortOrder = 'updated' | 'created' | 'title-asc' | 'title-desc';

/** Deterministic — ties always break the same way (by id, ascending). */
export function sortNotes(notes: readonly Note[], order: NoteSortOrder = 'updated'): Note[] {
  const sorted = [...notes];
  sorted.sort((a, b) => {
    let primary = 0;
    if (order === 'updated') primary = b.updatedAt.localeCompare(a.updatedAt);
    else if (order === 'created') primary = b.createdAt.localeCompare(a.createdAt);
    else if (order === 'title-desc') primary = b.title.toLowerCase().localeCompare(a.title.toLowerCase());
    else primary = a.title.toLowerCase().localeCompare(b.title.toLowerCase());
    return primary !== 0 ? primary : a.id.localeCompare(b.id);
  });
  return sorted;
}

export interface NoteQuery {
  search?: string;
  /** Only used to resolve a note's folder NAME for `search` text-matching (Phase 5L) — never
   * required, and unrelated to `folderId` below (the exact-folder filter, which needs no lookup). */
  folders?: readonly Folder[];
  tags?: readonly string[];
  folderId?: string | null;
  pinnedOnly?: boolean;
  /** Defaults to false — the default view never shows archived notes. */
  archived?: boolean;
  sort?: NoteSortOrder;
}

/** archive filter + search + tag filter + folder filter + pinned filter + deterministic sort,
 * applied in that order — mirrors lib/importedContentRepository.ts's queryImportedContent. */
export function queryNotes(notes: readonly Note[], query: NoteQuery): Note[] {
  let results = filterNotesByArchived(notes, query.archived ?? false);
  if (query.search) results = searchNotes(results, query.search, query.folders);
  if (query.tags && query.tags.length > 0) results = filterNotesByTags(results, query.tags);
  if (query.folderId !== undefined) results = filterNotesByFolder(results, query.folderId);
  if (query.pinnedOnly) results = filterNotesPinned(results);
  return sortNotes(results, query.sort ?? 'updated');
}

/** Every distinct tag across a collection, alphabetically sorted (case-insensitive), de-duplicated
 * while keeping first-seen casing — populates the Tags sidebar section. */
export function collectNoteTags(notes: readonly Note[]): string[] {
  const seen = new Map<string, string>();
  for (const note of notes) {
    for (const tag of getNoteTags(note)) {
      const trimmed = tag.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (!seen.has(key)) seen.set(key, trimmed);
    }
  }
  return [...seen.values()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

/** Mirrors lib/importedContentRepository.ts's ImportedContentOrganizationPatch exactly, for Note's
 * flat fields instead of a nested `metadata` object. `pinned` reuses Note's own existing flag —
 * never a second, duplicate "isPinned". */
export interface NoteOrganizationPatch {
  folderId?: string | null;
  pinned?: boolean;
  isArchived?: boolean;
  addTags?: readonly string[];
  removeTags?: readonly string[];
}

/** Pure — applied by lib/store.ts's bulkUpdateNotes, never called directly against the store. Only
 * ever touches folderId/tags/pinned/isArchived/updatedAt — title/content/subject/topicId are
 * completely untouched. */
export function applyNoteOrganizationPatch(note: Note, patch: NoteOrganizationPatch, now: string = new Date().toISOString()): Note {
  const currentTags = getNoteTags(note);
  let tags = currentTags;
  if (patch.addTags && patch.addTags.length > 0) {
    const seen = new Map(currentTags.map((t) => [t.toLowerCase(), t]));
    for (const raw of patch.addTags) {
      const trimmed = raw.trim();
      if (trimmed && !seen.has(trimmed.toLowerCase())) seen.set(trimmed.toLowerCase(), trimmed);
    }
    tags = [...seen.values()];
  }
  if (patch.removeTags && patch.removeTags.length > 0) {
    const toRemove = new Set(patch.removeTags.map((t) => t.trim().toLowerCase()));
    tags = tags.filter((t) => !toRemove.has(t.toLowerCase()));
  }

  return {
    ...note,
    ...(tags !== currentTags ? { tags } : {}),
    ...(patch.folderId !== undefined ? { folderId: patch.folderId } : {}),
    ...(patch.pinned !== undefined ? { pinned: patch.pinned } : {}),
    ...(patch.isArchived !== undefined ? { isArchived: patch.isArchived } : {}),
    updatedAt: now,
  };
}
