import { describe, it, expect } from 'vitest';
import { countRelatedContent } from './relatedContentSummary';
import type { ContentRelationship } from './contentRelationships';
import type { ImportedContent } from './contentImport';
import type { Note } from './types';

function relationship(overrides: Partial<ContentRelationship> = {}): ContentRelationship {
  return {
    id: overrides.id ?? 'r1',
    workspaceId: overrides.workspaceId ?? 'phd_research',
    sourceId: overrides.sourceId ?? 'a',
    sourceType: overrides.sourceType ?? 'imported_content',
    targetId: overrides.targetId ?? 'b',
    targetType: overrides.targetType ?? 'imported_content',
    type: overrides.type ?? 'cites',
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
  };
}

function content(overrides: Partial<ImportedContent> = {}): ImportedContent {
  return {
    id: overrides.id ?? 'c1',
    workspaceId: overrides.workspaceId ?? 'phd_research',
    contentType: overrides.contentType ?? 'research_document',
    title: overrides.title ?? 'Item',
    rawContent: overrides.rawContent ?? '',
    provenance: overrides.provenance ?? { importedAt: '2026-01-01T00:00:00.000Z', origin: 'import' },
    metadata: overrides.metadata,
  };
}

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: overrides.id ?? 'n1',
    subject: overrides.subject ?? 'general',
    title: overrides.title ?? 'Note',
    content: overrides.content ?? '',
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z',
    pinned: overrides.pinned ?? false,
    workspaceId: overrides.workspaceId,
    topicId: overrides.topicId,
  };
}

describe('countRelatedContent — document relationship counts', () => {
  it('counts linked notes and bibliography records separately for a research document', () => {
    const doc = content({ id: 'doc1', contentType: 'research_document' });
    const bib = content({ id: 'bib1', contentType: 'bibliography' });
    const n = note({ id: 'note1' });
    const relationships = [
      relationship({ id: 'r1', sourceId: 'bib1', targetId: 'doc1', type: 'cites' }), // bib -> doc (incoming for doc)
      relationship({ id: 'r2', sourceId: 'doc1', targetId: 'note1', targetType: 'note', type: 'related_to' }), // doc -> note (outgoing for doc)
    ];
    const counts = countRelatedContent(relationships, 'doc1', 'imported_content', [doc, bib], [n]);
    expect(counts.notes).toBe(1);
    expect(counts.bibliographyRecords).toBe(1);
    expect(counts.researchDocuments).toBe(0);
    expect(counts.total).toBe(2);
  });

  it('a document with no relationships returns all-zero counts, never throwing', () => {
    const doc = content({ id: 'doc1' });
    expect(() => countRelatedContent([], 'doc1', 'imported_content', [doc], [])).not.toThrow();
    const counts = countRelatedContent([], 'doc1', 'imported_content', [doc], []);
    expect(counts).toEqual({ notes: 0, researchDocuments: 0, bibliographyRecords: 0, other: 0, total: 0 });
  });
});

describe('countRelatedContent — bibliography relationship counts', () => {
  it('counts linked research documents and linked notes for a bibliography record', () => {
    const bib = content({ id: 'bib1', contentType: 'bibliography' });
    const doc1 = content({ id: 'doc1', contentType: 'research_document' });
    const doc2 = content({ id: 'doc2', contentType: 'research_document' });
    const n = note({ id: 'note1' });
    const relationships = [
      relationship({ id: 'r1', sourceId: 'bib1', targetId: 'doc1', type: 'cites' }),
      relationship({ id: 'r2', sourceId: 'bib1', targetId: 'doc2', type: 'supports' }),
      relationship({ id: 'r3', sourceId: 'bib1', targetId: 'note1', targetType: 'note', type: 'related_to' }),
    ];
    const counts = countRelatedContent(relationships, 'bib1', 'imported_content', [bib, doc1, doc2], [n]);
    expect(counts.researchDocuments).toBe(2);
    expect(counts.notes).toBe(1);
    expect(counts.bibliographyRecords).toBe(0);
    expect(counts.total).toBe(3);
  });
});

describe('countRelatedContent — note relationship counts', () => {
  it('counts linked research documents and bibliography records for a note (its incoming relationships)', () => {
    const doc = content({ id: 'doc1', contentType: 'research_document' });
    const bib = content({ id: 'bib1', contentType: 'bibliography' });
    const n = note({ id: 'note1' });
    const relationships = [
      relationship({ id: 'r1', sourceId: 'doc1', targetId: 'note1', targetType: 'note', type: 'cites' }),
      relationship({ id: 'r2', sourceId: 'bib1', targetId: 'note1', targetType: 'note', type: 'supports' }),
    ];
    const counts = countRelatedContent(relationships, 'note1', 'note', [doc, bib], [n]);
    expect(counts.researchDocuments).toBe(1);
    expect(counts.bibliographyRecords).toBe(1);
    expect(counts.notes).toBe(0);
    expect(counts.total).toBe(2);
  });

  it('a note with no relationships returns all-zero counts', () => {
    const n = note({ id: 'note1' });
    expect(countRelatedContent([], 'note1', 'note', [], [n]).total).toBe(0);
  });
});

describe('countRelatedContent — relationship-type separation and correctness', () => {
  it('relationships touching a DIFFERENT entity are never counted', () => {
    const doc1 = content({ id: 'doc1' });
    const doc2 = content({ id: 'doc2' });
    const bib = content({ id: 'bib1', contentType: 'bibliography' });
    const relationships = [relationship({ id: 'r1', sourceId: 'bib1', targetId: 'doc2', type: 'cites' })];
    const counts = countRelatedContent(relationships, 'doc1', 'imported_content', [doc1, doc2, bib], []);
    expect(counts.total).toBe(0);
  });

  it('an id with the wrong entity type is never counted (a note id colliding with an imported_content id)', () => {
    const doc = content({ id: 'shared-id', contentType: 'research_document' });
    const n = note({ id: 'shared-id' });
    const target = content({ id: 'target-doc' });
    // relationship sourced from the NOTE 'shared-id', not the imported_content 'shared-id'
    const relationships = [relationship({ id: 'r1', sourceId: 'shared-id', sourceType: 'note', targetId: 'target-doc', type: 'cites' })];
    const counts = countRelatedContent(relationships, 'shared-id', 'imported_content', [doc, target], [n]);
    expect(counts.total).toBe(0); // the imported_content 'shared-id' has no outgoing/incoming relationships of its own
  });

  it('a related id that no longer resolves to a real item is skipped, never counted or thrown on', () => {
    const doc = content({ id: 'doc1' });
    const relationships = [relationship({ id: 'r1', sourceId: 'doc1', targetId: 'ghost-note', targetType: 'note', type: 'cites' })];
    expect(() => countRelatedContent(relationships, 'doc1', 'imported_content', [doc], [])).not.toThrow();
    expect(countRelatedContent(relationships, 'doc1', 'imported_content', [doc], []).total).toBe(0);
  });

  it('an "other" content type (neither research_document nor bibliography) is counted separately, not folded into either', () => {
    const doc = content({ id: 'doc1', contentType: 'research_document' });
    const other = content({ id: 'note-import1', contentType: 'note' }); // an imported "note" ImportedContent, distinct from lib/types.ts's Note
    const relationships = [relationship({ id: 'r1', sourceId: 'note-import1', targetId: 'doc1', type: 'cites' })];
    const counts = countRelatedContent(relationships, 'doc1', 'imported_content', [doc, other], []);
    expect(counts.other).toBe(1);
    expect(counts.researchDocuments).toBe(0);
    expect(counts.bibliographyRecords).toBe(0);
    expect(counts.notes).toBe(0);
  });

  it('mixed outgoing and incoming relationships are both counted correctly for the same entity', () => {
    const doc = content({ id: 'doc1', contentType: 'research_document' });
    const bib = content({ id: 'bib1', contentType: 'bibliography' });
    const n = note({ id: 'note1' });
    const relationships = [
      relationship({ id: 'r1', sourceId: 'bib1', targetId: 'doc1', type: 'cites' }), // incoming to doc1
      relationship({ id: 'r2', sourceId: 'doc1', targetId: 'note1', targetType: 'note', type: 'related_to' }), // outgoing from doc1
    ];
    const counts = countRelatedContent(relationships, 'doc1', 'imported_content', [doc, bib], [n]);
    expect(counts.bibliographyRecords).toBe(1);
    expect(counts.notes).toBe(1);
  });
});
