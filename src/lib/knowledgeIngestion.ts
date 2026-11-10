import type { WorkspaceKind } from './workspace';
import { uuid } from './utils';
import { confirmImportedContent, type ImportedContent, type ImportedContentMetadata, type ImportFileFormat, type ImportPreview } from './contentImport';
import type { ContentRelationship } from './contentRelationships';
import { splitMarkdownIntoArticles } from './articleExtraction';
import { createLexicalClassifications, type KnowledgeClassification, type KnowledgeTopicTaxonomyEntry } from './knowledgeClassification';
import { listApfcTopicsFlat } from './apfcSyllabusTaxonomy';
import { listUpscCseTopicsFlat } from './upscCseKnowledgeTaxonomy';
import { classifyDocumentType, extractLectureOrUnitNumber, extractDocumentYear, applyDocumentTypeClassification } from './documentTypeClassification';

/** P1.1 — the active workspace decides which real taxonomy's topics are offered as classification
 * candidates by default: APFC's own syllabus for `apfc`, the granular CSE syllabus for `upsc_cse`,
 * and an empty list for any workspace with no taxonomy yet (today: `phd_research`) — an empty
 * candidate list simply means classifyTextLexically finds nothing to match, never an error; the
 * original document and extracted articles are still always saved regardless (see this module's
 * own header). Callers that want a different candidate set (tests, a future taxonomy) still just
 * pass `candidateTopics` explicitly, which always wins over this default. */
function defaultCandidateTopicsForWorkspace(workspaceId: WorkspaceKind): readonly KnowledgeTopicTaxonomyEntry[] {
  if (workspaceId === 'apfc') return listApfcTopicsFlat();
  if (workspaceId === 'upsc_cse') return listUpscCseTopicsFlat();
  return [];
}

// Knowledge Librarian (P0), Phase 2 — the orchestration layer tying together the three pieces that
// each already exist on their own (lib/contentImport.ts's confirmImportedContent, lib/
// articleExtraction.ts's splitMarkdownIntoArticles, lib/knowledgeClassification.ts's
// createLexicalClassifications) into ONE atomic batch: upload a Markdown file once, get back
// everything the app needs to persist, in a single typed value. This module touches NO store and
// does NO I/O — it is pure and synchronous given already-extracted file text (the caller is
// expected to have already run lib/contentImport.ts's extractContentFromFile on the real File),
// which is what makes the whole pipeline directly testable without a File/FileReader at all.
//
// "Never silently lose source content" (this feature's own hard requirement) is enforced
// structurally here, not just by convention: `originalDocument` always carries the FULL, unedited
// `rawContent` the caller passed in, and is always built FIRST and returned regardless of whether
// extraction finds any articles at all (an empty file still produces a `originalDocument` with
// empty content plus a warning — it is never dropped because extraction found nothing to split).

export interface KnowledgeIngestionInput {
  workspaceId: WorkspaceKind;
  filename: string;
  /** The FULL extracted text — already run through contentImport.ts's own extraction/normalisation
   * for this file's format; this module never re-parses or re-extracts anything from a raw file. */
  rawContent: string;
  originalFormat: ImportFileFormat;
  importedAt?: string;
  /** SHA-256 of the ORIGINAL file's bytes (lib/fileHash.ts) — stamped onto `originalDocument`'s own
   * provenance only (an extracted article has no separate underlying file of its own to hash). */
  sourceHash?: string;
  sourceFileSize?: number;
  /** Defaults to the real, live taxonomy for `workspaceId` (see defaultCandidateTopicsForWorkspace
   * above) — overridable so tests can pass a small fixture set instead. */
  candidateTopics?: readonly KnowledgeTopicTaxonomyEntry[];
}

export interface KnowledgeIngestionBatch {
  /** The complete, unedited original upload — ALWAYS present, regardless of how many (if any)
   * articles were extracted from it. contentType: 'document' (a generic, already-existing content
   * type — see contentImport.ts's own header — not a new one invented for this feature). */
  originalDocument: ImportedContent;
  /** One ImportedContent per extracted article (contentType: 'current_affairs', reusing the
   * EXISTING current-affairs foundation's eventDate/source metadata fields — see
   * contentImport.ts's ImportedContentMetadata). Empty when extraction found nothing to split
   * (e.g. an empty file) — `originalDocument` above is still saved either way. */
  articles: ImportedContent[];
  /** A lexical-classifier proposal per (article, matched topic) pair — `status: 'proposed'`,
   * never auto-confirmed. Empty for an article whose text matches no syllabus topic well enough
   * (see lib/knowledgeClassification.ts's own confidence floor) — that article is still saved and
   * simply starts with an empty review queue entry, awaiting manual classification. */
  classifications: KnowledgeClassification[];
  /** One 'related_to' link per extracted article, from `originalDocument` to that article —
   * constructed directly (NOT via lib/contentRelationships.ts's createRelationship) because both
   * endpoints are freshly minted within this SAME batch and are therefore valid and non-duplicate
   * by construction; createRelationship's existence-pool/duplicate checks exist for user-facing
   * manual linking against already-persisted state, which this isn't. */
  relationships: ContentRelationship[];
  /** Every extraction warning (lib/articleExtraction.ts) plus any ingestion-level notice — always
   * shown to the user (see components/repository/ImportToRepositoryModal.tsx), never swallowed. */
  warnings: string[];
}

/** The original document's title is deliberately the FILENAME (never deriveContentTitle's own
 * heading-sniffing — see contentImport.ts), because the file's first heading is also, by
 * construction, the first extracted article's own title: using the same heading-derived title for
 * both would make the original document and its first article indistinguishable in any list that
 * shows title + content type (e.g. pages/Repository.tsx's cards) even though they are two
 * genuinely different records. The filename is unambiguous and already shown in both items'
 * provenance.sourceFilename regardless, so this loses no information. */
function deriveOriginalDocumentTitle(filename: string): string {
  const base = filename.replace(/\.[^./\\]+$/, '').trim();
  return base || 'Imported document';
}

function buildArticleMetadata(eventDate: string | undefined, source: string | undefined): ImportedContentMetadata | undefined {
  if (!eventDate && !source) return undefined;
  const metadata: ImportedContentMetadata = {};
  if (eventDate) metadata.eventDate = eventDate;
  if (source) metadata.source = source;
  return metadata;
}

/** Smart Document Upload — every item this module creates is BRAND NEW (there is no existing
 * metadata.documentTypeStatus to protect yet, so applyDocumentTypeClassification's guard always
 * passes here; it still runs through that same function, not a shortcut, so this stays the single
 * place "confirmed is never overwritten" could ever matter if this function were ever reused for
 * re-ingestion). lectureOrUnitNumber/documentYear are omitted entirely from the returned object
 * when not found — never written as `undefined` onto a real metadata object. */
export function buildDocumentTypeMetadata(text: string, filename: string): ImportedContentMetadata {
  const classification = applyDocumentTypeClassification(undefined, classifyDocumentType(text, filename));
  const metadata: ImportedContentMetadata = {
    documentType: classification?.documentType,
    documentTypeConfidence: classification?.confidence,
    documentTypeRationale: classification?.rationale,
    documentTypeStatus: classification?.status,
  };
  const lectureOrUnitNumber = extractLectureOrUnitNumber(text);
  if (lectureOrUnitNumber !== undefined) metadata.lectureOrUnitNumber = lectureOrUnitNumber;
  const documentYear = extractDocumentYear(text);
  if (documentYear !== undefined) metadata.documentYear = documentYear;
  return metadata;
}

/**
 * The one entry point: given one Markdown file's already-extracted text, builds the full,
 * ready-to-persist batch described above. Never throws — every internal step (extraction,
 * classification) is itself already failure-tolerant (see their own module headers), so this
 * function's only remaining job is composition and id/timestamp wiring.
 */
export function ingestMarkdownAsArticles(input: KnowledgeIngestionInput): KnowledgeIngestionBatch {
  const now = input.importedAt ?? new Date().toISOString();
  const candidateTopics = input.candidateTopics ?? defaultCandidateTopicsForWorkspace(input.workspaceId);

  const originalPreview: ImportPreview = {
    sourceFilename: input.filename,
    originalFormat: input.originalFormat,
    suggestedContentType: 'document',
    title: deriveOriginalDocumentTitle(input.filename),
    content: input.rawContent,
  };
  const originalDocument = confirmImportedContent(originalPreview, {
    workspaceId: input.workspaceId,
    contentType: 'document',
    metadata: buildDocumentTypeMetadata(input.rawContent, input.filename),
    sourceHash: input.sourceHash,
    sourceFileSize: input.sourceFileSize,
    importedAt: now,
    sourceNote: 'Original upload, preserved unchanged — see its linked articles for the extracted, individually classifiable items.',
  });

  const extraction = splitMarkdownIntoArticles(input.filename, input.rawContent);
  const warnings = [...extraction.warnings];

  const articles: ImportedContent[] = [];
  const classifications: KnowledgeClassification[] = [];
  const relationships: ContentRelationship[] = [];

  extraction.articles.forEach((draft) => {
    const articlePreview: ImportPreview = {
      sourceFilename: input.filename,
      originalFormat: input.originalFormat,
      suggestedContentType: 'current_affairs',
      title: draft.heading,
      content: draft.content,
    };
    // Each extracted article gets its own real uuid (via confirmImportedContent) — sharing `now`
    // as importedAt across the whole batch is fine; nothing here relies on articles within one
    // batch sorting relative to each other by timestamp.
    const article = confirmImportedContent(articlePreview, {
      workspaceId: input.workspaceId,
      contentType: 'current_affairs',
      metadata: { ...buildDocumentTypeMetadata(`${draft.heading}\n${draft.content}`, input.filename), ...buildArticleMetadata(draft.eventDate, draft.source) },
      sourceHash: input.sourceHash,
      sourceFileSize: input.sourceFileSize,
      importedAt: now,
      sourceNote: `Article ${draft.index} of ${extraction.articles.length}, extracted from "${input.filename}".`,
    });
    articles.push(article);

    relationships.push({
      id: uuid(),
      workspaceId: input.workspaceId,
      sourceId: originalDocument.id,
      sourceType: 'imported_content',
      targetId: article.id,
      targetType: 'imported_content',
      type: 'related_to',
      createdAt: now,
    });

    classifications.push(
      ...createLexicalClassifications({
        workspaceId: input.workspaceId,
        itemId: article.id,
        itemType: 'imported_content',
        text: `${draft.heading}\n${draft.content}`,
        candidateTopics,
        createdAt: now,
      }),
    );
  });

  if (extraction.articles.length === 0) {
    warnings.push('No articles were extracted — the original document has still been saved in full and can be reviewed or re-processed later.');
  }

  return { originalDocument, articles, classifications, relationships, warnings };
}
