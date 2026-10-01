import { describe, it, expect } from 'vitest';
import { buildPhdKnowledgeTree, UNATTRIBUTED_AUTHOR } from './phdKnowledgeTree';
import { createManualImportedContent } from './contentImport';
import type { ContentRelationship } from './contentRelationships';

function bib(title: string, authors?: string[]) {
  return createManualImportedContent({
    workspaceId: 'phd_research',
    contentType: 'bibliography',
    title,
    metadata: authors ? { bibliography: { authors } } : undefined,
  });
}

function doc(title: string) {
  return createManualImportedContent({ workspaceId: 'phd_research', contentType: 'research_document', title });
}

function linksTo(sourceId: string, targetId: string): ContentRelationship {
  return { id: `${sourceId}->${targetId}`, workspaceId: 'phd_research', sourceId, sourceType: 'imported_content', targetId, targetType: 'imported_content', type: 'cites', createdAt: 'a' };
}

describe('buildPhdKnowledgeTree', () => {
  it('groups a source under its single author, with its linked research documents as chapters', () => {
    const source = bib('A Theory of Justice', ['John Rawls']);
    const chapter = doc('Chapter 1 notes');
    const tree = buildPhdKnowledgeTree([source], [chapter], [linksTo(source.id, chapter.id)]);

    expect(tree).toHaveLength(1);
    expect(tree[0].author).toBe('John Rawls');
    expect(tree[0].sources).toHaveLength(1);
    expect(tree[0].sources[0].source.id).toBe(source.id);
    expect(tree[0].sources[0].chapters.map((c) => c.id)).toEqual([chapter.id]);
  });

  it('a source with multiple authors appears under EVERY author (same node, not duplicated data)', () => {
    const source = bib('Co-authored Paper', ['Author A', 'Author B']);
    const tree = buildPhdKnowledgeTree([source], [], []);

    expect(tree.map((g) => g.author).sort()).toEqual(['Author A', 'Author B']);
    expect(tree[0].sources[0].source).toBe(tree[1].sources[0].source);
  });

  it('a source with no authors is grouped under UNATTRIBUTED_AUTHOR rather than dropped', () => {
    const source = bib('Anonymous Pamphlet');
    const tree = buildPhdKnowledgeTree([source], [], []);

    expect(tree).toHaveLength(1);
    expect(tree[0].author).toBe(UNATTRIBUTED_AUTHOR);
    expect(tree[0].sources[0].source.id).toBe(source.id);
  });

  it('UNATTRIBUTED_AUTHOR always sorts last, named authors sort alphabetically (case-insensitive)', () => {
    const z = bib('Z Book', ['Zara']);
    const a = bib('A Book', ['adam']);
    const anon = bib('No author book');
    const tree = buildPhdKnowledgeTree([z, a, anon], [], []);

    expect(tree.map((g) => g.author)).toEqual(['adam', 'Zara', UNATTRIBUTED_AUTHOR]);
  });

  it('a source with no linked research documents has an empty chapters array, never throwing', () => {
    const source = bib('Standalone Source', ['Author A']);
    const tree = buildPhdKnowledgeTree([source], [], []);

    expect(tree[0].sources[0].chapters).toEqual([]);
  });

  it('only relationships where this source is the OUTGOING sourceId resolve as chapters — an incoming link to a note or another source never appears', () => {
    const source = bib('Source', ['Author A']);
    const chapter = doc('Real chapter');
    const note: ContentRelationship = { id: 'n1', workspaceId: 'phd_research', sourceId: 'some-note-id', sourceType: 'note', targetId: source.id, targetType: 'imported_content', type: 'related_to', createdAt: 'a' };
    const tree = buildPhdKnowledgeTree([source], [chapter], [linksTo(source.id, chapter.id), note]);

    expect(tree[0].sources[0].chapters.map((c) => c.id)).toEqual([chapter.id]);
  });

  it('a relationship pointing at a document id that no longer exists in researchDocuments is silently skipped, never throwing', () => {
    const source = bib('Source', ['Author A']);
    const tree = buildPhdKnowledgeTree([source], [], [linksTo(source.id, 'deleted-doc-id')]);

    expect(() => tree[0].sources[0].chapters).not.toThrow();
    expect(tree[0].sources[0].chapters).toEqual([]);
  });

  it('sources under the same author are sorted by title (case-insensitive)', () => {
    const b = bib('Beta Book', ['Author A']);
    const a = bib('alpha book', ['Author A']);
    const tree = buildPhdKnowledgeTree([b, a], [], []);

    expect(tree[0].sources.map((s) => s.source.title)).toEqual(['alpha book', 'Beta Book']);
  });

  it('an empty bibliography collection produces an empty tree, never throwing', () => {
    expect(() => buildPhdKnowledgeTree([], [], [])).not.toThrow();
    expect(buildPhdKnowledgeTree([], [], [])).toEqual([]);
  });
});
