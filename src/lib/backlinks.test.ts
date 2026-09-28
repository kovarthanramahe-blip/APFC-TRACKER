import { describe, it, expect } from 'vitest';
import { diffWikiLinkRelationships, getBacklinks } from './backlinks';
import { extractWikiLinks } from './wikiLinks';
import type { Note } from './types';
import type { ImportedContent } from './contentImport';
import type { ContentRelationship } from './contentRelationships';

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: overrides.id ?? 'n1',
    subject: 'general',
    title: overrides.title ?? 'Untitled',
    content: overrides.content ?? '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    pinned: false,
    workspaceId: overrides.workspaceId ?? 'phd_research',
  };
}

function content(overrides: Partial<ImportedContent> = {}): ImportedContent {
  return {
    id: overrides.id ?? 'c1',
    workspaceId: overrides.workspaceId ?? 'phd_research',
    contentType: overrides.contentType ?? 'research_document',
    title: overrides.title ?? 'Untitled Document',
    rawContent: overrides.rawContent ?? '',
    provenance: overrides.provenance ?? { importedAt: '2026-01-01T00:00:00.000Z' },
  };
}

function relationship(overrides: Partial<ContentRelationship> = {}): ContentRelationship {
  return {
    id: overrides.id ?? 'r1',
    workspaceId: overrides.workspaceId ?? 'phd_research',
    sourceId: overrides.sourceId ?? 'src',
    sourceType: overrides.sourceType ?? 'note',
    targetId: overrides.targetId ?? 'tgt',
    targetType: overrides.targetType ?? 'note',
    type: overrides.type ?? 'links_to',
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
  };
}

describe('diffWikiLinkRelationships', () => {
  it('proposes a new relationship for a resolved wiki-link with no existing relationship', () => {
    const target = note({ id: 'n2', title: 'Target Note' });
    const resolved = extractWikiLinks('[[n2|Target Note]]', { notes: [target], importedContent: [], workspaceId: 'phd_research' });
    const diff = diffWikiLinkRelationships('n1', 'note', resolved, [], 'phd_research');
    expect(diff.toAdd).toEqual([{ targetId: 'n2', targetType: 'note' }]);
    expect(diff.toRemoveIds).toEqual([]);
  });

  it('never proposes a duplicate when the link already has a matching relationship', () => {
    const target = note({ id: 'n2', title: 'Target Note' });
    const resolved = extractWikiLinks('[[n2|Target Note]]', { notes: [target], importedContent: [], workspaceId: 'phd_research' });
    const existing = [relationship({ id: 'r1', sourceId: 'n1', sourceType: 'note', targetId: 'n2', targetType: 'note' })];
    const diff = diffWikiLinkRelationships('n1', 'note', resolved, existing, 'phd_research');
    expect(diff.toAdd).toEqual([]);
    expect(diff.toRemoveIds).toEqual([]);
  });

  it('the same target linked twice in one note only ever produces one relationship (deduplicated)', () => {
    const target = note({ id: 'n2', title: 'Target Note' });
    const resolved = extractWikiLinks('[[n2|First mention]] ... [[n2|Second mention]]', { notes: [target], importedContent: [], workspaceId: 'phd_research' });
    const diff = diffWikiLinkRelationships('n1', 'note', resolved, [], 'phd_research');
    expect(diff.toAdd).toEqual([{ targetId: 'n2', targetType: 'note' }]);
  });

  it('proposes removal of a stale relationship whose link was deleted from the text', () => {
    const existing = [relationship({ id: 'r1', sourceId: 'n1', sourceType: 'note', targetId: 'n2', targetType: 'note' })];
    const resolved = extractWikiLinks('No links here anymore.', { notes: [], importedContent: [], workspaceId: 'phd_research' });
    const diff = diffWikiLinkRelationships('n1', 'note', resolved, existing, 'phd_research');
    expect(diff.toRemoveIds).toEqual(['r1']);
    expect(diff.toAdd).toEqual([]);
  });

  it('never creates a relationship for an ambiguous or unresolved link', () => {
    const a = note({ id: 'n2', title: 'Duplicate' });
    const b = note({ id: 'n3', title: 'Duplicate' });
    const resolved = extractWikiLinks('[[Duplicate]] and [[Nonexistent]]', { notes: [a, b], importedContent: [], workspaceId: 'phd_research' });
    const diff = diffWikiLinkRelationships('n1', 'note', resolved, [], 'phd_research');
    expect(diff.toAdd).toEqual([]);
  });

  it('never touches relationships belonging to a DIFFERENT source', () => {
    const existing = [relationship({ id: 'r1', sourceId: 'other-note', sourceType: 'note', targetId: 'n2', targetType: 'note' })];
    const diff = diffWikiLinkRelationships('n1', 'note', [], existing, 'phd_research');
    expect(diff.toRemoveIds).toEqual([]);
  });

  it('never touches a non-links_to relationship even from the same source/target', () => {
    const existing = [relationship({ id: 'r1', sourceId: 'n1', sourceType: 'note', targetId: 'n2', targetType: 'note', type: 'cites' })];
    const diff = diffWikiLinkRelationships('n1', 'note', [], existing, 'phd_research');
    expect(diff.toRemoveIds).toEqual([]); // the 'cites' relationship is untouched, not proposed for removal
  });

  it('workspace isolation: existing relationships from another workspace are never considered', () => {
    const existing = [relationship({ id: 'r1', workspaceId: 'apfc', sourceId: 'n1', sourceType: 'note', targetId: 'n2', targetType: 'note' })];
    const target = note({ id: 'n2', title: 'Target' });
    const resolved = extractWikiLinks('[[n2|Target]]', { notes: [target], importedContent: [], workspaceId: 'phd_research' });
    const diff = diffWikiLinkRelationships('n1', 'note', resolved, existing, 'phd_research');
    // the apfc relationship is invisible, so this still proposes adding the phd_research one
    expect(diff.toAdd).toEqual([{ targetId: 'n2', targetType: 'note' }]);
  });
});

describe('getBacklinks', () => {
  it('finds a backlink from a note to a note, with a snippet', () => {
    const source = note({ id: 'n1', title: 'Source Note', content: 'See also [[n2|Target Note]] for context.' });
    const target = note({ id: 'n2', title: 'Target Note' });
    const rel = relationship({ id: 'r1', sourceId: 'n1', sourceType: 'note', targetId: 'n2', targetType: 'note' });

    const backlinks = getBacklinks('n2', 'note', [rel], [source, target], [], 'phd_research');
    expect(backlinks).toHaveLength(1);
    expect(backlinks[0]).toMatchObject({ sourceId: 'n1', sourceTitle: 'Source Note' });
    expect(backlinks[0].snippet).toContain('Target Note');
  });

  it('finds a backlink from an ImportedContent document to a note', () => {
    const sourceDoc = content({ id: 'c1', title: 'Source Doc', rawContent: '[[n2|Target Note]] is relevant here.' });
    const target = note({ id: 'n2', title: 'Target Note' });
    const rel = relationship({ id: 'r1', sourceId: 'c1', sourceType: 'imported_content', targetId: 'n2', targetType: 'note' });

    const backlinks = getBacklinks('n2', 'note', [rel], [target], [sourceDoc], 'phd_research');
    expect(backlinks).toHaveLength(1);
    expect(backlinks[0]).toMatchObject({ sourceId: 'c1', sourceType: 'imported_content', sourceTitle: 'Source Doc' });
  });

  it('returns nothing for an item with no incoming links', () => {
    expect(getBacklinks('n2', 'note', [], [], [], 'phd_research')).toEqual([]);
  });

  it('omits a backlink whose source no longer exists (dangling relationship), never fabricating a title', () => {
    const rel = relationship({ id: 'r1', sourceId: 'deleted-note', sourceType: 'note', targetId: 'n2', targetType: 'note' });
    const backlinks = getBacklinks('n2', 'note', [rel], [], [], 'phd_research');
    expect(backlinks).toEqual([]);
  });

  it('never resolves a relationship from another workspace', () => {
    const source = note({ id: 'n1', title: 'Source', content: '[[n2|Target]]', workspaceId: 'apfc' });
    const target = note({ id: 'n2', title: 'Target', workspaceId: 'apfc' });
    const rel = relationship({ id: 'r1', workspaceId: 'apfc', sourceId: 'n1', sourceType: 'note', targetId: 'n2', targetType: 'note' });
    const backlinks = getBacklinks('n2', 'note', [rel], [source, target], [], 'phd_research');
    expect(backlinks).toEqual([]);
  });

  it('only ever returns links_to relationships, never cites/supports/related_to', () => {
    const source = note({ id: 'n1', title: 'Source' });
    const target = note({ id: 'n2', title: 'Target' });
    const rel = relationship({ id: 'r1', sourceId: 'n1', sourceType: 'note', targetId: 'n2', targetType: 'note', type: 'cites' });
    const backlinks = getBacklinks('n2', 'note', [rel], [source, target], [], 'phd_research');
    expect(backlinks).toEqual([]);
  });
});
