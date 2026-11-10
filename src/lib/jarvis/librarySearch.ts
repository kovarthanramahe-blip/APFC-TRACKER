// AI Library — unified cross-category search.
//
// This is deliberately NOT a new search engine: it is a thin, additive composition over modules
// that already exist and are already shipped —
//   - retrieval/citation: workspaceContentBridge.ts's retrieveWorkspaceEvidence/
//     resolveWorkspaceDocumentTitle (deterministic keyword search, no AI model required — see
//     that file's own header for why that boundary matters);
//   - classification: knowledgeClassification.ts's KnowledgeClassification records (confidence-
//     bearing, user-correctable, already persisted in the store);
//   - taxonomy labels: apfcSyllabusTaxonomy.ts / upscCseKnowledgeTaxonomy.ts.
// Closing the actual gap this phase exists for: there was no single search surface that could
// filter by subject/topic or item type across the whole workspace library at once — search was
// three separate, disconnected keyword filters (question bank, syllabus browser, chat citation).
//
// Semantic search (Phase 2 addition): pass `query.semantic` (a precomputed query embedding plus
// the current embedding index) to rank by cosine similarity instead of keyword overlap — see
// jarvis/documents/embeddingIndex.ts's semanticSearchChunks, which this delegates to, exactly as
// the keyword path delegates to retrieveWorkspaceEvidence. This function itself never calls a
// real embedding model and never computes a vector — that stays entirely in
// jarvis/ai/localEmbeddingProvider.ts (the one real-backend file) and whatever caller orchestrates
// "embed the query, then call searchLibrary" (LibrarySearchPanel.tsx). Every LibrarySearchResult
// carries its own real `mode` ('deterministic_text_search' | 'embedding_similarity') so a caller
// can never mislabel one as the other.
//
// KnowledgeItemType is 'imported_content' ONLY (knowledgeClassification.ts's own type) — a Note
// can never carry a classification. A topic/taxonomy filter therefore always excludes notes from
// the result set entirely; this is the honest behaviour (notes have no topic to match), never a
// silently-broadened fallback.
import type { Note } from '../types';
import type { ImportedContent } from '../contentImport';
import type { WorkspaceKind } from '../workspace';
import { listNotesForWorkspace, listImportedContentForWorkspace } from '../repository';
import {
  retrieveWorkspaceEvidence,
  resolveWorkspaceDocumentTitle,
  toWorkspaceDocumentId,
  buildWorkspaceDocumentChunks,
  type WorkspaceContentItemType,
} from './workspaceContentBridge';
import { citationForChunk } from './documents/documentQuestion';
import { semanticSearchChunks, type JarvisDocumentEmbeddingRecord } from './documents/embeddingIndex';
import type { JarvisRetrievalMode } from './documents/retrieval';
import type { KnowledgeClassification, KnowledgeClassificationStatus, KnowledgeTaxonomyId } from '../knowledgeClassification';
import { listApfcTopicsFlat } from '../apfcSyllabusTaxonomy';
import { listUpscCseTopicsFlat } from '../upscCseKnowledgeTaxonomy';

export interface LibrarySearchFilters {
  /** Narrows to only notes, or only imported content. Omitted searches both. */
  itemType?: WorkspaceContentItemType;
  /** Narrows to items classified under this exact topic. Pairs with `taxonomy` when both
   * taxonomies could plausibly share a topicId spelling (they are versioned independently, so
   * this is a real, not theoretical, disambiguation). Setting this excludes every Note from the
   * result set (see this file's own header). */
  topicId?: string;
  taxonomy?: KnowledgeTaxonomyId;
}

export interface LibrarySearchSemanticOptions {
  queryVector: readonly number[];
  modelId: string;
  dimensions: number;
  embeddingRecords: readonly JarvisDocumentEmbeddingRecord[];
}

export interface LibrarySearchQuery extends LibrarySearchFilters {
  question: string;
  limit?: number;
  /** Omit for the default, always-available keyword mode. When provided, ranks by cosine
   * similarity against this precomputed query embedding (see this file's own header) — the
   * caller is responsible for actually computing `queryVector` via a real
   * JarvisEmbeddingProvider; this function never calls one itself. */
  semantic?: LibrarySearchSemanticOptions;
}

export interface LibrarySearchClassificationTag {
  taxonomy: KnowledgeTaxonomyId;
  topicId: string;
  topicTitle: string;
  subjectTitle: string;
  status: KnowledgeClassificationStatus;
  /** 0..1, verbatim from the underlying KnowledgeClassification — never re-derived here. */
  confidence: number;
}

export interface LibrarySearchResult {
  documentId: string;
  itemType: WorkspaceContentItemType;
  itemId: string;
  title: string;
  /** An exact excerpt from the matched chunk — never paraphrased (mirrors
   * JarvisDocumentCitation's own "quote" contract). Falls back to the chunk's own text only when
   * the citation genuinely captured no quote, exactly like WorkspaceEvidenceSearch's existing
   * `item.citation.quote ?? item.chunk.text` convention. */
  quote: string;
  score: number;
  /** Which retrieval mode actually produced this result — never inferred, always the real mode
   * the underlying chunk search ran in. A UI MUST read this rather than assuming "semantic was
   * requested, so every result is semantic": see searchLibrary's own semantic-mode branch. */
  mode: JarvisRetrievalMode;
  page?: number;
  sectionTitle?: string;
  /** Every non-rejected classification already on this item, for display as badges — empty for
   * a Note (can never have one) or an unclassified/rejected-only imported_content item. */
  classifications: LibrarySearchClassificationTag[];
}

export interface LibraryTopicOption {
  taxonomy: KnowledgeTaxonomyId;
  topicId: string;
  topicTitle: string;
  subjectTitle: string;
}

interface TopicLabel {
  topicTitle: string;
  subjectTitle: string;
}

/** Built once per call from the two real, versioned taxonomies — never cached module-level, so
 * this can never drift from either taxonomy's own source data (same convention listApfcTopicsFlat/
 * listUpscCseTopicsFlat already use for themselves). */
function buildTopicLabelLookup(): Map<string, TopicLabel> {
  const lookup = new Map<string, TopicLabel>();
  for (const entry of listApfcTopicsFlat()) {
    lookup.set(`apfc:${entry.topicId}`, { topicTitle: entry.topicTitle, subjectTitle: entry.subjectTitle });
  }
  for (const entry of listUpscCseTopicsFlat()) {
    lookup.set(`upsc_cse:${entry.topicId}`, { topicTitle: entry.topicTitle, subjectTitle: entry.subjectTitle });
  }
  return lookup;
}

/** Every topic from both taxonomies, flattened for a single filter dropdown — optionally narrowed
 * to one taxonomy. Never fabricates a label: an entry always comes straight from the taxonomy's
 * own listApfcTopicsFlat/listUpscCseTopicsFlat. */
export function listLibraryTopicOptions(taxonomy?: KnowledgeTaxonomyId): LibraryTopicOption[] {
  const options: LibraryTopicOption[] = [];
  if (!taxonomy || taxonomy === 'apfc') {
    for (const entry of listApfcTopicsFlat()) {
      options.push({ taxonomy: 'apfc', topicId: entry.topicId, topicTitle: entry.topicTitle, subjectTitle: entry.subjectTitle });
    }
  }
  if (!taxonomy || taxonomy === 'upsc_cse') {
    for (const entry of listUpscCseTopicsFlat()) {
      options.push({ taxonomy: 'upsc_cse', topicId: entry.topicId, topicTitle: entry.topicTitle, subjectTitle: entry.subjectTitle });
    }
  }
  return options;
}

/**
 * The one entry point this module adds: a cross-category (notes + imported content), filterable
 * (topic, taxonomy, item type) search over the active workspace's real content. By default
 * (`query.semantic` omitted) this is backed entirely by the existing deterministic keyword
 * retrieval — never requires an AI model or embedding provider to return a result. Passing
 * `query.semantic` ranks by cosine similarity instead (see this file's own header) — the caller
 * must have already computed the query embedding and built the embedding index; this function
 * itself never calls a model. Returns `[]` for a blank query, never throws.
 */
export function searchLibrary(
  notes: readonly Note[],
  importedContent: readonly ImportedContent[],
  knowledgeClassifications: readonly KnowledgeClassification[],
  workspaceId: WorkspaceKind,
  query: LibrarySearchQuery,
): LibrarySearchResult[] {
  const question = query.question.trim();
  if (!question) return [];

  const topicFilterActive = query.topicId !== undefined;
  let documentIds: string[] | undefined;

  if (query.itemType !== undefined || topicFilterActive) {
    documentIds = [];

    if (query.itemType !== 'imported_content' && !topicFilterActive) {
      for (const note of listNotesForWorkspace(notes, workspaceId)) {
        documentIds.push(toWorkspaceDocumentId({ itemType: 'note', itemId: note.id }));
      }
    }

    if (query.itemType !== 'note') {
      for (const item of listImportedContentForWorkspace(importedContent, workspaceId)) {
        if (topicFilterActive) {
          const hasMatchingTopic = knowledgeClassifications.some(
            (c) =>
              c.itemType === 'imported_content' &&
              c.itemId === item.id &&
              c.status !== 'rejected' &&
              c.topicId === query.topicId &&
              (query.taxonomy === undefined || c.taxonomy === query.taxonomy),
          );
          if (!hasMatchingTopic) continue;
        }
        documentIds.push(toWorkspaceDocumentId({ itemType: 'imported_content', itemId: item.id }));
      }
    }
  }

  let evidence: Array<{ citation: { documentId: string; quote?: string; page?: number; sectionTitle?: string }; chunk: { text: string }; score: number; mode: JarvisRetrievalMode }>;

  if (query.semantic) {
    const allChunks = buildWorkspaceDocumentChunks(notes, importedContent, workspaceId);
    const scopedChunks = documentIds ? allChunks.filter((c) => documentIds!.includes(c.documentId)) : allChunks;
    const retrieved = semanticSearchChunks(
      scopedChunks,
      query.semantic.embeddingRecords,
      query.semantic.queryVector,
      query.semantic.modelId,
      query.semantic.dimensions,
      query.limit,
    );
    evidence = retrieved.map(({ chunk, score, mode }) => ({ chunk, score, mode, citation: citationForChunk(chunk) }));
  } else {
    const keywordEvidence = retrieveWorkspaceEvidence(notes, importedContent, workspaceId, {
      question,
      documentIds,
      limit: query.limit,
    });
    evidence = keywordEvidence.map((item) => ({ ...item, mode: 'deterministic_text_search' as const }));
  }

  const topicLabels = buildTopicLabelLookup();
  const results: LibrarySearchResult[] = [];

  for (const item of evidence) {
    const resolved = resolveWorkspaceDocumentTitle(item.citation.documentId, notes, importedContent, workspaceId);
    if (!resolved) continue;

    const classifications: LibrarySearchClassificationTag[] =
      resolved.itemType === 'imported_content'
        ? knowledgeClassifications
            .filter((c) => c.itemType === 'imported_content' && c.itemId === resolved.itemId && c.status !== 'rejected')
            .map((c) => {
              const label = topicLabels.get(`${c.taxonomy}:${c.topicId}`);
              return {
                taxonomy: c.taxonomy,
                topicId: c.topicId,
                topicTitle: label?.topicTitle ?? c.topicId,
                subjectTitle: label?.subjectTitle ?? '',
                status: c.status,
                confidence: c.confidence,
              };
            })
        : [];

    results.push({
      documentId: item.citation.documentId,
      itemType: resolved.itemType,
      itemId: resolved.itemId,
      title: resolved.title || 'Untitled source',
      quote: item.citation.quote ?? item.chunk.text,
      score: item.score,
      mode: item.mode,
      page: item.citation.page,
      sectionTitle: item.citation.sectionTitle,
      classifications,
    });
  }

  return results;
}
