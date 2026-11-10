import { describe, it, expect } from 'vitest';
import { searchLibrary, listLibraryTopicOptions } from './librarySearch';
import { buildWorkspaceDocumentChunks } from './workspaceContentBridge';
import { listApfcTopicsFlat } from '../apfcSyllabusTaxonomy';
import type { Note } from '../types';
import type { ImportedContent } from '../contentImport';
import type { KnowledgeClassification } from '../knowledgeClassification';
import type { JarvisDocumentEmbeddingRecord } from './documents/embeddingIndex';

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    subject: 'general',
    title: 'Untitled note',
    content: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    pinned: false,
    workspaceId: 'apfc',
    ...overrides,
  };
}

function importedContent(overrides: Partial<ImportedContent> = {}): ImportedContent {
  return {
    id: 'content-1',
    workspaceId: 'apfc',
    contentType: 'document',
    title: 'Untitled document',
    rawContent: '',
    provenance: { importedAt: '2026-01-01T00:00:00.000Z', origin: 'manual' },
    ...overrides,
  };
}

function classification(overrides: Partial<KnowledgeClassification> = {}): KnowledgeClassification {
  return {
    id: 'kc-1',
    workspaceId: 'apfc',
    itemId: 'content-1',
    itemType: 'imported_content',
    taxonomy: 'apfc',
    topicId: 'some-topic',
    confidence: 0.8,
    rationale: 'matched keywords',
    status: 'confirmed',
    source: 'lexical',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const REAL_APFC_TOPIC = listApfcTopicsFlat()[0];

describe('searchLibrary', () => {
  it('returns [] for a blank query, never throws', () => {
    expect(searchLibrary([], [], [], 'apfc', { question: '' })).toEqual([]);
    expect(searchLibrary([], [], [], 'apfc', { question: '   ' })).toEqual([]);
  });

  it('finds a matching Note by keyword, with no classifications attached (notes can never carry one)', () => {
    const n = note({ id: 'n1', content: 'Depreciation is the systematic allocation of an asset cost over its useful life.' });
    const results = searchLibrary([n], [], [], 'apfc', { question: 'depreciation' });
    expect(results).toHaveLength(1);
    expect(results[0].itemType).toBe('note');
    expect(results[0].itemId).toBe('n1');
    expect(results[0].classifications).toEqual([]);
    expect(results[0].mode).toBe('deterministic_text_search');
  });

  it('finds a matching ImportedContent item and attaches its real, non-rejected classifications as tags', () => {
    const c = importedContent({ id: 'c1', rawContent: 'The Reserve Bank of India sets the repo rate as part of monetary policy.' });
    const confirmed = classification({ id: 'kc1', itemId: 'c1', taxonomy: 'apfc', topicId: REAL_APFC_TOPIC.topicId, status: 'confirmed', confidence: 0.9 });
    const rejected = classification({ id: 'kc2', itemId: 'c1', taxonomy: 'apfc', topicId: 'irrelevant-rejected-topic', status: 'rejected' });

    const results = searchLibrary([], [c], [confirmed, rejected], 'apfc', { question: 'repo rate' });

    expect(results).toHaveLength(1);
    expect(results[0].itemType).toBe('imported_content');
    expect(results[0].classifications).toHaveLength(1);
    expect(results[0].classifications[0].topicId).toBe(REAL_APFC_TOPIC.topicId);
    expect(results[0].classifications[0].topicTitle).toBe(REAL_APFC_TOPIC.topicTitle);
    expect(results[0].classifications[0].status).toBe('confirmed');
  });

  it('itemType filter "note" excludes every ImportedContent match', () => {
    const n = note({ id: 'n1', content: 'monetary policy and interest rates' });
    const c = importedContent({ id: 'c1', rawContent: 'monetary policy and interest rates' });
    const results = searchLibrary([n], [c], [], 'apfc', { question: 'monetary policy', itemType: 'note' });
    expect(results).toHaveLength(1);
    expect(results[0].itemType).toBe('note');
  });

  it('itemType filter "imported_content" excludes every Note match', () => {
    const n = note({ id: 'n1', content: 'monetary policy and interest rates' });
    const c = importedContent({ id: 'c1', rawContent: 'monetary policy and interest rates' });
    const results = searchLibrary([n], [c], [], 'apfc', { question: 'monetary policy', itemType: 'imported_content' });
    expect(results).toHaveLength(1);
    expect(results[0].itemType).toBe('imported_content');
  });

  it('topicId filter keeps only ImportedContent items with a matching, non-rejected classification, and excludes every Note', () => {
    const n = note({ id: 'n1', content: 'repo rate discussion' });
    const matching = importedContent({ id: 'c1', rawContent: 'repo rate discussion one' });
    const nonMatching = importedContent({ id: 'c2', rawContent: 'repo rate discussion two' });
    const matchClassification = classification({ id: 'kc1', itemId: 'c1', topicId: REAL_APFC_TOPIC.topicId, status: 'confirmed' });

    const results = searchLibrary([n], [matching, nonMatching], [matchClassification], 'apfc', {
      question: 'repo rate',
      topicId: REAL_APFC_TOPIC.topicId,
    });

    expect(results).toHaveLength(1);
    expect(results[0].itemId).toBe('c1');
  });

  it('a REJECTED classification never satisfies the topic filter', () => {
    const c = importedContent({ id: 'c1', rawContent: 'repo rate discussion' });
    const rejected = classification({ id: 'kc1', itemId: 'c1', topicId: REAL_APFC_TOPIC.topicId, status: 'rejected' });

    const results = searchLibrary([], [c], [rejected], 'apfc', { question: 'repo rate', topicId: REAL_APFC_TOPIC.topicId });
    expect(results).toEqual([]);
  });

  it('a taxonomy filter disambiguates a topicId that could in principle collide across taxonomies', () => {
    const c = importedContent({ id: 'c1', rawContent: 'repo rate discussion' });
    const wrongTaxonomy = classification({ id: 'kc1', itemId: 'c1', taxonomy: 'upsc_cse', topicId: REAL_APFC_TOPIC.topicId, status: 'confirmed' });

    const results = searchLibrary([], [c], [wrongTaxonomy], 'apfc', {
      question: 'repo rate',
      topicId: REAL_APFC_TOPIC.topicId,
      taxonomy: 'apfc',
    });
    expect(results).toEqual([]);
  });

  it('combining itemType "note" with an active topic filter yields an empty result, never a silently-ignored filter', () => {
    const n = note({ id: 'n1', content: 'repo rate discussion' });
    const results = searchLibrary([n], [], [], 'apfc', { question: 'repo rate', itemType: 'note', topicId: REAL_APFC_TOPIC.topicId });
    expect(results).toEqual([]);
  });

  it('only searches the active workspace, never a foreign one', () => {
    const n = note({ id: 'n1', workspaceId: 'upsc_cse', content: 'repo rate discussion' });
    const results = searchLibrary([n], [], [], 'apfc', { question: 'repo rate' });
    expect(results).toEqual([]);
  });

  it('falls back to an honest "Untitled source" label rather than fabricating a title', () => {
    const c = importedContent({ id: 'c1', title: '', rawContent: 'repo rate discussion' });
    const results = searchLibrary([], [c], [], 'apfc', { question: 'repo rate' });
    expect(results[0].title).toBe('Untitled source');
  });
});

describe('listLibraryTopicOptions', () => {
  it('returns entries from both taxonomies when unfiltered', () => {
    const options = listLibraryTopicOptions();
    expect(options.some((o) => o.taxonomy === 'apfc')).toBe(true);
    expect(options.some((o) => o.taxonomy === 'upsc_cse')).toBe(true);
  });

  it('narrows to exactly one taxonomy when given', () => {
    const options = listLibraryTopicOptions('apfc');
    expect(options.every((o) => o.taxonomy === 'apfc')).toBe(true);
    expect(options.length).toBeGreaterThan(0);
  });
});

describe('searchLibrary — semantic mode (query.semantic)', () => {
  const MODEL_ID = 'test-model';
  const DIMENSIONS = 3;

  function embeddingRecordFor(chunk: { documentId: string; id: string; text: string }, vector: number[]): JarvisDocumentEmbeddingRecord {
    return { documentId: chunk.documentId, chunkId: chunk.id, modelId: MODEL_ID, dimensions: DIMENSIONS, vector, contentHash: 'irrelevant-for-these-tests', computedAt: '2026-01-01T00:00:00.000Z' };
  }

  it('ranks by cosine similarity to the query vector, never by keyword overlap, and tags every result mode "embedding_similarity"', () => {
    const catsNote = note({ id: 'cats', content: 'All about cats and kittens.' });
    const dogsNote = note({ id: 'dogs', content: 'All about dogs and puppies.' });
    const [catsChunk] = buildWorkspaceDocumentChunks([catsNote], [], 'apfc');
    const [dogsChunk] = buildWorkspaceDocumentChunks([dogsNote], [], 'apfc');

    const records = [embeddingRecordFor(catsChunk, [1, 0, 0]), embeddingRecordFor(dogsChunk, [0, 1, 0])];

    // The query text itself mentions neither "cats" nor "dogs" literally with matching keywords
    // in a way that would favour either under keyword search — only the precomputed vector
    // decides the ranking here, proving this is genuinely vector-based, not keyword matching in
    // disguise.
    const results = searchLibrary([catsNote, dogsNote], [], [], 'apfc', {
      question: 'something about small pets',
      semantic: { queryVector: [0.9, 0.1, 0], modelId: MODEL_ID, dimensions: DIMENSIONS, embeddingRecords: records },
    });

    expect(results[0].itemId).toBe('cats');
    expect(results.every((r) => r.mode === 'embedding_similarity')).toBe(true);
  });

  it('excludes an item with no matching embedding record, even though its text would match the query keywords', () => {
    const indexedNote = note({ id: 'indexed', content: 'machine learning fundamentals' });
    const unindexedNote = note({ id: 'unindexed', content: 'machine learning fundamentals too' });
    const [indexedChunk] = buildWorkspaceDocumentChunks([indexedNote], [], 'apfc');

    const results = searchLibrary([indexedNote, unindexedNote], [], [], 'apfc', {
      question: 'machine learning',
      semantic: { queryVector: [1, 0, 0], modelId: MODEL_ID, dimensions: DIMENSIONS, embeddingRecords: [embeddingRecordFor(indexedChunk, [1, 0, 0])] },
    });

    expect(results).toHaveLength(1);
    expect(results[0].itemId).toBe('indexed');
  });

  it('respects the same itemType/topic filters as keyword mode', () => {
    const n = note({ id: 'n1', content: 'repo rate discussion' });
    const c = importedContent({ id: 'c1', rawContent: 'repo rate discussion' });
    const [noteChunk] = buildWorkspaceDocumentChunks([n], [], 'apfc');
    const [contentChunk] = buildWorkspaceDocumentChunks([], [c], 'apfc');
    const records = [embeddingRecordFor(noteChunk, [1, 0, 0]), embeddingRecordFor(contentChunk, [1, 0, 0])];

    const results = searchLibrary([n], [c], [], 'apfc', {
      question: 'repo rate',
      itemType: 'note',
      semantic: { queryVector: [1, 0, 0], modelId: MODEL_ID, dimensions: DIMENSIONS, embeddingRecords: records },
    });

    expect(results).toHaveLength(1);
    expect(results[0].itemType).toBe('note');
  });

  it('a record computed under a different model is never used for ranking, even with the same dimensions', () => {
    const n = note({ id: 'n1', content: 'repo rate discussion' });
    const [chunk] = buildWorkspaceDocumentChunks([n], [], 'apfc');
    const wrongModelRecord: JarvisDocumentEmbeddingRecord = { ...embeddingRecordFor(chunk, [1, 0, 0]), modelId: 'different-model' };

    const results = searchLibrary([n], [], [], 'apfc', {
      question: 'repo rate',
      semantic: { queryVector: [1, 0, 0], modelId: MODEL_ID, dimensions: DIMENSIONS, embeddingRecords: [wrongModelRecord] },
    });

    expect(results).toEqual([]);
  });

  it('returns [] for a blank query even in semantic mode, never calling into the index at all', () => {
    const results = searchLibrary([], [], [], 'apfc', {
      question: '   ',
      semantic: { queryVector: [1, 0, 0], modelId: MODEL_ID, dimensions: DIMENSIONS, embeddingRecords: [] },
    });
    expect(results).toEqual([]);
  });
});
