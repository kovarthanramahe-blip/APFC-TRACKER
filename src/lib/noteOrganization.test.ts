import { describe, it, expect } from 'vitest';
import {
  getNoteTags,
  getNoteFolderId,
  isNoteArchived,
  searchNotes,
  filterNotesByTags,
  filterNotesByFolder,
  filterNotesPinned,
  filterNotesByArchived,
  sortNotes,
  queryNotes,
  collectNoteTags,
  applyNoteOrganizationPatch,
  countNotesByTopic,
} from './noteOrganization';
import { createFolder } from './folders';
import type { Note } from './types';

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: overrides.id ?? 'n1',
    subject: overrides.subject ?? 'general',
    title: overrides.title ?? 'Untitled',
    content: overrides.content ?? '',
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z',
    pinned: overrides.pinned ?? false,
    workspaceId: overrides.workspaceId ?? 'phd_research',
    folderId: overrides.folderId,
    tags: overrides.tags,
    isArchived: overrides.isArchived,
  };
}

describe('getNoteTags / getNoteFolderId / isNoteArchived — missing-field handling', () => {
  it('defaults to no tags, unfiled/root, not archived for a note with none set', () => {
    const n = note();
    expect(getNoteTags(n)).toEqual([]);
    expect(getNoteFolderId(n)).toBeNull();
    expect(isNoteArchived(n)).toBe(false);
  });

  it('reads whatever is actually set', () => {
    const n = note({ tags: ['Revision'], folderId: 'f1', isArchived: true });
    expect(getNoteTags(n)).toEqual(['Revision']);
    expect(getNoteFolderId(n)).toBe('f1');
    expect(isNoteArchived(n)).toBe(true);
  });
});

describe('searchNotes', () => {
  it('matches title or content, case-insensitively', () => {
    const a = note({ id: 'a', title: 'Polity Notes', content: 'irrelevant' });
    const b = note({ id: 'b', title: 'Other', content: 'about polity too' });
    const c = note({ id: 'c', title: 'Unrelated', content: 'nothing here' });
    expect(searchNotes([a, b, c], 'polity').map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('an empty query returns everything', () => {
    const a = note({ id: 'a' });
    expect(searchNotes([a], '   ')).toEqual([a]);
  });

  // Phase 5L — search now also covers tags and (when folders are supplied) folder name, so a note
  // is findable without needing the separate tag-chip/folder-tree UI.
  it('matches a tag, case-insensitively', () => {
    const a = note({ id: 'a', tags: ['Revision', 'Important'] });
    const b = note({ id: 'b', tags: ['Other'] });
    expect(searchNotes([a, b], 'revision').map((n) => n.id)).toEqual(['a']);
  });

  it('matches the note\'s own folder name when folders are supplied', () => {
    const folder = createFolder('phd_research', 'Constitutional Law');
    const a = note({ id: 'a', folderId: folder.id });
    const b = note({ id: 'b', folderId: null });
    expect(searchNotes([a, b], 'constitutional', [folder]).map((n) => n.id)).toEqual(['a']);
  });

  it('never matches by folder name when folders is omitted (backward-compatible default)', () => {
    const folder = createFolder('phd_research', 'Constitutional Law');
    const a = note({ id: 'a', folderId: folder.id, title: 'Untitled', content: '' });
    expect(searchNotes([a], 'constitutional')).toEqual([]);
  });
});

describe('filterNotesByTags / filterNotesByFolder / filterNotesPinned / filterNotesByArchived', () => {
  it('filterNotesByTags matches any of the given tags', () => {
    const a = note({ id: 'a', tags: ['UPSC', 'History'] });
    const b = note({ id: 'b', tags: ['PhD'] });
    expect(filterNotesByTags([a, b], ['history']).map((n) => n.id)).toEqual(['a']);
  });

  it('an empty tags filter is a no-op', () => {
    const a = note({ id: 'a' });
    expect(filterNotesByTags([a], [])).toEqual([a]);
  });

  it('filterNotesByFolder matches exactly one folder, including null (root)', () => {
    const a = note({ id: 'a', folderId: 'f1' });
    const b = note({ id: 'b', folderId: null });
    expect(filterNotesByFolder([a, b], 'f1')).toEqual([a]);
    expect(filterNotesByFolder([a, b], null)).toEqual([b]);
  });

  it('filterNotesPinned returns only pinned notes', () => {
    const a = note({ id: 'a', pinned: true });
    const b = note({ id: 'b', pinned: false });
    expect(filterNotesPinned([a, b])).toEqual([a]);
  });

  it('filterNotesByArchived(false) excludes archived; (true) returns only archived', () => {
    const a = note({ id: 'a', isArchived: true });
    const b = note({ id: 'b' });
    expect(filterNotesByArchived([a, b], false)).toEqual([b]);
    expect(filterNotesByArchived([a, b], true)).toEqual([a]);
  });
});

describe('sortNotes', () => {
  it('sorts by updated (default), most recent first', () => {
    const older = note({ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' });
    const newer = note({ id: 'b', updatedAt: '2026-02-01T00:00:00.000Z' });
    expect(sortNotes([older, newer]).map((n) => n.id)).toEqual(['b', 'a']);
  });

  it('sorts by created', () => {
    const older = note({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' });
    const newer = note({ id: 'b', createdAt: '2026-02-01T00:00:00.000Z' });
    expect(sortNotes([older, newer], 'created').map((n) => n.id)).toEqual(['b', 'a']);
  });

  it('sorts title A-Z and Z-A', () => {
    const a = note({ id: 'a', title: 'Alpha' });
    const z = note({ id: 'z', title: 'Zeta' });
    expect(sortNotes([z, a], 'title-asc').map((n) => n.id)).toEqual(['a', 'z']);
    expect(sortNotes([a, z], 'title-desc').map((n) => n.id)).toEqual(['z', 'a']);
  });

  it('ties break deterministically by id', () => {
    const a = note({ id: 'b', updatedAt: '2026-01-01T00:00:00.000Z' });
    const b = note({ id: 'a', updatedAt: '2026-01-01T00:00:00.000Z' });
    expect(sortNotes([a, b]).map((n) => n.id)).toEqual(['a', 'b']);
  });
});

describe('queryNotes — combined filters', () => {
  it('excludes archived by default', () => {
    const active = note({ id: 'active' });
    const archived = note({ id: 'archived', isArchived: true });
    expect(queryNotes([active, archived], {}).map((n) => n.id)).toEqual(['active']);
  });

  it('archived: true returns only archived notes', () => {
    const active = note({ id: 'active' });
    const archived = note({ id: 'archived', isArchived: true });
    expect(queryNotes([active, archived], { archived: true }).map((n) => n.id)).toEqual(['archived']);
  });

  it('combines search + tag + folder + pinned filters', () => {
    const match = note({ id: 'match', title: 'Coromandel Sources', tags: ['PhD'], folderId: 'f1', pinned: true });
    const wrongTag = note({ id: 'wrong-tag', title: 'Coromandel Notes', tags: ['Other'], folderId: 'f1', pinned: true });
    const wrongFolder = note({ id: 'wrong-folder', title: 'Coromandel Extra', tags: ['PhD'], folderId: 'f2', pinned: true });
    const notPinned = note({ id: 'not-pinned', title: 'Coromandel More', tags: ['PhD'], folderId: 'f1', pinned: false });
    const result = queryNotes([match, wrongTag, wrongFolder, notPinned], { search: 'coromandel', tags: ['PhD'], folderId: 'f1', pinnedOnly: true });
    expect(result.map((n) => n.id)).toEqual(['match']);
  });

  it('search text also resolves a note by its own folder name, when folders is passed through', () => {
    const folder = createFolder('phd_research', 'Constitutional Law');
    const inFolder = note({ id: 'in-folder', folderId: folder.id });
    const elsewhere = note({ id: 'elsewhere', folderId: null });
    const result = queryNotes([inFolder, elsewhere], { search: 'constitutional', folders: [folder] });
    expect(result.map((n) => n.id)).toEqual(['in-folder']);
  });
});

describe('collectNoteTags', () => {
  it('deduplicates case-insensitively, alphabetically sorted, first-seen casing kept', () => {
    const a = note({ id: 'a', tags: ['Revision', 'history'] });
    const b = note({ id: 'b', tags: ['revision', 'Polity'] });
    expect(collectNoteTags([a, b])).toEqual(['history', 'Polity', 'Revision']);
  });

  it('a note with no tags contributes nothing', () => {
    expect(collectNoteTags([note()])).toEqual([]);
  });
});

describe('applyNoteOrganizationPatch', () => {
  it('sets folderId, leaving title/content untouched', () => {
    const n = note({ title: 'Keep', content: 'Keep body' });
    const patched = applyNoteOrganizationPatch(n, { folderId: 'f1' }, '2026-02-01T00:00:00.000Z');
    expect(patched.folderId).toBe('f1');
    expect(patched.title).toBe('Keep');
    expect(patched.content).toBe('Keep body');
    expect(patched.updatedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('folderId: null explicitly moves to root, distinct from omitting folderId', () => {
    const n = note({ folderId: 'f1' });
    expect(applyNoteOrganizationPatch(n, { folderId: null }).folderId).toBeNull();
    expect(applyNoteOrganizationPatch(n, { pinned: true }).folderId).toBe('f1');
  });

  it('toggles pinned/isArchived independently, reusing the existing pinned flag', () => {
    const n = note();
    expect(applyNoteOrganizationPatch(n, { pinned: true }).pinned).toBe(true);
    expect(applyNoteOrganizationPatch(n, { isArchived: true }).isArchived).toBe(true);
  });

  it('addTags merges, deduplicated case-insensitively, keeping first-seen casing', () => {
    const n = note({ tags: ['Revision'] });
    const patched = applyNoteOrganizationPatch(n, { addTags: ['revision', 'Important'] });
    expect(patched.tags).toEqual(['Revision', 'Important']);
  });

  it('removeTags removes case-insensitively', () => {
    const n = note({ tags: ['Revision', 'Important'] });
    const patched = applyNoteOrganizationPatch(n, { removeTags: ['REVISION'] });
    expect(patched.tags).toEqual(['Important']);
  });

  it('never touches title/content/subject/topicId — organisation is additive-field-only', () => {
    const n = note({ title: 'Original', content: 'Original body', subject: 'general', id: 'n1' });
    const patched = applyNoteOrganizationPatch(n, { isArchived: true, folderId: 'f1', addTags: ['x'] });
    expect(patched.title).toBe('Original');
    expect(patched.content).toBe('Original body');
    expect(patched.subject).toBe('general');
    expect(patched.id).toBe('n1');
  });

  it('never mutates the input note', () => {
    const n = note({ tags: ['a'] });
    const snapshot = JSON.parse(JSON.stringify(n));
    applyNoteOrganizationPatch(n, { pinned: true, addTags: ['b'] });
    expect(n).toEqual(snapshot);
  });
});

describe('countNotesByTopic (Phase 4 — Visual Syllabus System)', () => {
  it('counts only notes whose topicId matches exactly', () => {
    const notes: Note[] = [
      { ...note({ id: 'n1' }), topicId: 'topic-a' },
      { ...note({ id: 'n2' }), topicId: 'topic-a' },
      { ...note({ id: 'n3' }), topicId: 'topic-b' },
    ];
    expect(countNotesByTopic(notes, 'topic-a')).toBe(2);
    expect(countNotesByTopic(notes, 'topic-b')).toBe(1);
  });

  it('is 0 for a topic with no notes filed under it, never throwing', () => {
    const notes: Note[] = [{ ...note({ id: 'n1' }), topicId: 'topic-a' }];
    expect(() => countNotesByTopic(notes, 'topic-z')).not.toThrow();
    expect(countNotesByTopic(notes, 'topic-z')).toBe(0);
  });

  it('a note with no topicId at all is never counted against any topic', () => {
    const notes: Note[] = [note({ id: 'n1' })];
    expect(countNotesByTopic(notes, 'topic-a')).toBe(0);
  });

  it('is 0 over an empty notes collection', () => {
    expect(countNotesByTopic([], 'topic-a')).toBe(0);
  });
});
