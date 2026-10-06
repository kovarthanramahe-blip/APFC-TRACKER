// JARVIS Phase 6 — Document Intelligence contracts (foundation only).
//
// The long-term pipeline this phase is laying groundwork for:
//
//   upload -> detection -> text extraction -> OCR when required -> normalisation -> chunking
//   -> indexing -> retrieval -> grounded AI response -> citations/page references
//
// Nothing in this file implements any pipeline stage — these are provider-independent TYPES
// only, deliberately small enough to extend later without a breaking redesign. No parsing
// library, OCR engine, or AI call is referenced anywhere here.
//
// This subsystem is completely independent of, and never imports, the Repository/Knowledge
// Library's existing ImportedContent model (lib/contentImport.ts) or any annotation code
// (components/annotations/*, lib/annotations.ts, lib/strokeRendering.ts) — a JarvisDocument is a
// NEW concept for AI-facing document intelligence, not a replacement for or extension of the
// existing Repository content model. Keeping them separate avoids coupling JARVIS's own
// evolution to the Repository's, and vice versa.

export type JarvisDocumentId = string;

export type JarvisDocumentProcessingState =
  | 'uploaded'
  | 'extracting'
  | 'extracted'
  | 'chunking'
  | 'chunked'
  | 'indexing'
  | 'indexed'
  | 'error';

export interface JarvisDocumentError {
  /** Safe, human-readable reason — never a raw parser/OCR exception or stack trace. */
  message: string;
  /** Which pipeline stage failed, e.g. 'extracting', 'chunking' — one of
   * JarvisDocumentProcessingState's own non-terminal values. */
  stage: JarvisDocumentProcessingState;
}

export interface JarvisDocument {
  id: JarvisDocumentId;
  title: string;
  filename: string;
  mimeType: string;
  /** Total pages, when the format has a page concept (PDF, slides) — undefined for formats that
   * don't (plain text, a single long web page). Never fabricated when unknown. */
  pageCount?: number;
  sizeBytes?: number;
  processingState: JarvisDocumentProcessingState;
  error?: JarvisDocumentError;
  createdAt: string;
  updatedAt: string;
}

/** A structural unit of a document — a chapter, heading, or slide, when the source format
 * exposes one. `order` is the document's own reading order, never re-sorted. */
export interface JarvisDocumentSection {
  id: string;
  documentId: JarvisDocumentId;
  title?: string;
  order: number;
  startPage?: number;
  endPage?: number;
}

/** A retrieval-sized slice of extracted text. `sectionId` is optional: a format with no section
 * structure still produces chunks, just with no section grouping above them. */
export interface JarvisDocumentChunk {
  id: string;
  documentId: JarvisDocumentId;
  sectionId?: string;
  order: number;
  text: string;
  startPage?: number;
  endPage?: number;
  /** A rough estimate only (e.g. text.length / 4) — never presented as an exact provider token
   * count, which depends on the specific model's own tokenizer. */
  tokenCountEstimate?: number;
}

/** Points back at the exact slice of the exact document a claim is grounded in — the unit a
 * JarvisDocumentCitation (groundedAnswer.ts) and a JarvisDocumentSummary both reference. */
export interface JarvisDocumentCitation {
  documentId: JarvisDocumentId;
  chunkId: string;
  page?: number;
  sectionTitle?: string;
  /** A short, exact excerpt from the chunk — never paraphrased or reconstructed; omit rather than
   * invent one when none was captured. */
  quote?: string;
}

export type JarvisDocumentSummaryLevel = 'chunk' | 'section' | 'document';

/** One summary at one level of the hierarchy — see summarizationStrategy.ts for how multiple
 * summaries at increasing levels combine. `targetId` is the id of whatever `level` names (a
 * chunk id, a section id, or the document id itself for level: 'document'). */
export interface JarvisDocumentSummary {
  documentId: JarvisDocumentId;
  level: JarvisDocumentSummaryLevel;
  targetId: string;
  text: string;
  citations: readonly JarvisDocumentCitation[];
  createdAt: string;
}

export interface JarvisDocumentQuery {
  documentIds: readonly JarvisDocumentId[];
  question: string;
  maxCitations?: number;
}
