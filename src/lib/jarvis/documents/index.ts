// JARVIS Phase 6 — Document Intelligence public API (foundation only — see types.ts's own
// header for the full long-term pipeline this phase lays groundwork for, and groundedAnswer.ts
// for the mandatory grounding rule).

export type {
  JarvisDocumentId,
  JarvisDocumentProcessingState,
  JarvisDocumentError,
  JarvisDocument,
  JarvisDocumentSection,
  JarvisDocumentChunk,
  JarvisDocumentCitation,
  JarvisDocumentSummaryLevel,
  JarvisDocumentSummary,
  JarvisDocumentQuery,
} from './types';

export type { JarvisGroundingLabel, JarvisGroundedAnswerSegment, JarvisGroundedAnswer } from './groundedAnswer';
export { buildUnsupportedAnswer, isWellGroundedAnswer } from './groundedAnswer';

export type { JarvisSummarizationPlanStepLevel, JarvisSummarizationPlanStep, JarvisSummarizationPlan } from './summarizationStrategy';
export { buildHierarchicalSummarizationPlan } from './summarizationStrategy';

export type { JarvisEmbeddingVector, JarvisEmbeddingProvider, JarvisRetrievalMode, JarvisRetrievedChunk } from './retrieval';
export { keywordSearchChunks } from './retrieval';

// Phase 7 — Document Intelligence Ingestion Foundation (real text/markdown/PDF/DOCX ingestion,
// normalisation, chunking, scoped retrieval, and an evidence/citation foundation for a future
// local-model question-answering step — see ingestion.ts and documentQuestion.ts's own headers).
export type {
  JarvisDocumentFormat,
  JarvisDocumentSource,
  JarvisExtractedPage,
  JarvisExtractedDocument,
  JarvisIngestionCapability,
  JarvisDocumentIngestionError,
  JarvisDocumentIngestionResult,
  BuildDocumentChunksInput,
  BuildDocumentChunksResult,
} from './ingestion';
export {
  detectDocumentFormat,
  ingestTextSource,
  ingestMarkdownSource,
  ingestPdfSource,
  isLikelyScannedPdf,
  DOCX_STYLE_MAP,
  htmlToMarkdownText,
  ingestDocxSource,
  ingestDocumentSource,
  normalizeExtractedText,
  DEFAULT_MAX_CHUNK_CHARS,
  chunkText,
  buildDocumentChunks,
  prepareSummarizationPlan,
} from './ingestion';

export type { JarvisDocumentRetrievalQuery } from './retrieval';
export { retrieveChunksForQuery } from './retrieval';

export type { JarvisDocumentEvidence } from './documentQuestion';
export { buildEvidenceForQuestion, isEvidenceWellFormed } from './documentQuestion';
