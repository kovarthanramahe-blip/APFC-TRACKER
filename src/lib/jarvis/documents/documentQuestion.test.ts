import { describe, it, expect } from 'vitest';
import { buildEvidenceForQuestion, isEvidenceWellFormed } from './documentQuestion';
import type { JarvisDocumentChunk } from './types';

function chunk(overrides: Partial<JarvisDocumentChunk> & { id: string; documentId: string; order: number; text: string }): JarvisDocumentChunk {
  return { ...overrides };
}

describe('buildEvidenceForQuestion — question -> retrieval -> evidence -> citations (Part 9)', () => {
  it('returns one evidence item per retrieved chunk, each carrying the original chunk and a matching citation', () => {
    const chunks = [
      chunk({ id: 'c1', documentId: 'doc-1', order: 0, text: 'Merchant capitalism preceded industrial capital formation.', startPage: 4 }),
      chunk({ id: 'c2', documentId: 'doc-1', order: 1, text: 'Unrelated content about rivers.' }),
    ];
    const evidence = buildEvidenceForQuestion(chunks, { question: 'merchant capitalism' });
    expect(evidence).toHaveLength(1);
    expect(evidence[0].chunk).toEqual(chunks[0]);
    expect(evidence[0].citation).toEqual({ documentId: 'doc-1', chunkId: 'c1', page: 4, quote: 'Merchant capitalism preceded industrial capital formation.' });
  });

  it('generates no AI prose — every citation quote is an exact, unmodified excerpt of the chunk text', () => {
    const chunks = [chunk({ id: 'c1', documentId: 'doc-1', order: 0, text: 'Merchant capitalism and trade networks expanded rapidly.' })];
    const [evidence] = buildEvidenceForQuestion(chunks, { question: 'merchant capitalism' });
    expect(chunks[0].text.includes(evidence.citation.quote!.replace('…', ''))).toBe(true);
  });

  it('truncates an overlong chunk to a capped quote length, marked with an ellipsis', () => {
    const longText = 'merchant capitalism '.repeat(30);
    const chunks = [chunk({ id: 'c1', documentId: 'doc-1', order: 0, text: longText })];
    const [evidence] = buildEvidenceForQuestion(chunks, { question: 'merchant capitalism' });
    expect(evidence.citation.quote!.length).toBeLessThanOrEqual(201);
    expect(evidence.citation.quote!.endsWith('…')).toBe(true);
  });

  it('respects document scoping via documentIds', () => {
    const chunks = [
      chunk({ id: 'a1', documentId: 'doc-1', order: 0, text: 'merchant capitalism' }),
      chunk({ id: 'b1', documentId: 'doc-2', order: 0, text: 'merchant capitalism' }),
    ];
    const evidence = buildEvidenceForQuestion(chunks, { question: 'merchant capitalism', documentIds: ['doc-2'] });
    expect(evidence.map((item) => item.chunk.id)).toEqual(['b1']);
  });

  it('respects the limit parameter', () => {
    const chunks = Array.from({ length: 5 }, (_, i) => chunk({ id: `c${i}`, documentId: 'doc-1', order: i, text: 'merchant capitalism' }));
    const evidence = buildEvidenceForQuestion(chunks, { question: 'merchant capitalism', limit: 2 });
    expect(evidence).toHaveLength(2);
  });

  it('returns an empty array when nothing matches, never a fabricated/empty-citation result', () => {
    const chunks = [chunk({ id: 'c1', documentId: 'doc-1', order: 0, text: 'Unrelated content about rivers.' })];
    expect(buildEvidenceForQuestion(chunks, { question: 'merchant capitalism' })).toEqual([]);
  });

  it('is deterministic — the same input always produces the same output', () => {
    const chunks = [chunk({ id: 'c1', documentId: 'doc-1', order: 0, text: 'merchant capitalism' }), chunk({ id: 'c2', documentId: 'doc-1', order: 1, text: 'merchant capitalism' })];
    const query = { question: 'merchant capitalism' };
    expect(buildEvidenceForQuestion(chunks, query)).toEqual(buildEvidenceForQuestion(chunks, query));
  });
});

describe('isEvidenceWellFormed', () => {
  it('returns true when every citation has a non-empty documentId and a chunkId matching its own chunk', () => {
    const chunks = [chunk({ id: 'c1', documentId: 'doc-1', order: 0, text: 'merchant capitalism' })];
    const evidence = buildEvidenceForQuestion(chunks, { question: 'merchant capitalism' });
    expect(isEvidenceWellFormed(evidence)).toBe(true);
  });

  it('returns true for an empty evidence list (vacuously well-formed)', () => {
    expect(isEvidenceWellFormed([])).toBe(true);
  });

  it('returns false when a citation chunkId does not match its own chunk id', () => {
    const chunks = [chunk({ id: 'c1', documentId: 'doc-1', order: 0, text: 'merchant capitalism' })];
    const [evidence] = buildEvidenceForQuestion(chunks, { question: 'merchant capitalism' });
    const tampered = { ...evidence, citation: { ...evidence.citation, chunkId: 'different-id' } };
    expect(isEvidenceWellFormed([tampered])).toBe(false);
  });

  it('returns false when a citation documentId is empty', () => {
    const chunks = [chunk({ id: 'c1', documentId: 'doc-1', order: 0, text: 'merchant capitalism' })];
    const [evidence] = buildEvidenceForQuestion(chunks, { question: 'merchant capitalism' });
    const tampered = { ...evidence, citation: { ...evidence.citation, documentId: '' } };
    expect(isEvidenceWellFormed([tampered])).toBe(false);
  });
});
