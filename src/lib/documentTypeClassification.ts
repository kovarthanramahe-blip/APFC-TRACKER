// Smart Document Upload — document-TYPE classification (lecture notes / transcript / official
// notification / statute / report / PYQ / book or chapter / research paper / other), distinct from
// and additive to lib/knowledgeClassification.ts's existing SYLLABUS-TOPIC classification.
//
// Why a separate module rather than extending KnowledgeClassification: that type's `taxonomy`
// field means "which workspace's syllabus this item maps against" (`taxonomyForWorkspace` is a
// strict 1:1 workspace->syllabus mapping, and a workspace with no syllabus yet — today:
// phd_research — gets NO topic classification at all, by design). Document type is a completely
// different, workspace-INDEPENDENT question ("what kind of document is this?") that applies
// equally to every workspace, including PhD research material that has no syllabus to classify
// against. Shoehorning it into KnowledgeClassification's taxonomy model would mean inventing a
// fake "document_type taxonomy" and teaching taxonomyForWorkspace to return more than one
// taxonomy per workspace — a real, risky change to an already-tested contract for no real benefit.
// This module is the same proven PATTERN (deterministic, dependency-free lexical scoring; never
// fabricates; never silently overwrites a user's own decision) applied to a genuinely separate
// classification axis, stored as plain metadata fields on the ImportedContent item itself (see
// contentImport.ts's ImportedContentMetadata) rather than as a second append-only collection.
//
// No AI provider call anywhere in this file — same "deterministic fallback, clearly identified,
// never pretends to be an LLM" discipline as classifyTextLexically.

export const DOCUMENT_TYPES = [
  'lecture_notes',
  'transcript',
  'official_notification',
  'statute',
  'report',
  'pyq',
  'book_chapter',
  'research_paper',
  'other',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const DOCUMENT_TYPE_LABELS: Readonly<Record<DocumentType, string>> = {
  lecture_notes: 'Lecture Notes',
  transcript: 'Transcript',
  official_notification: 'Official Notification',
  statute: 'Statute / Act',
  report: 'Report',
  pyq: 'Previous Year Question Paper',
  book_chapter: 'Book / Chapter',
  research_paper: 'Research Paper',
  other: 'Other',
};

/** The status this module's proposal is given before a human reviews it, and what a human's own
 * decision becomes afterwards — four states, matching the vocabulary this feature was specified
 * with. Deliberately NOT reusing KnowledgeClassification's own 'proposed'/'confirmed'/'rejected'
 * (a different concern, see this module's header) — 'needs_review' additionally distinguishes "we
 * found conflicting signals" from 'unclassified' ("we found no signal at all"), a distinction that
 * concern never needed. */
export type DocumentTypeStatus = 'predicted' | 'confirmed' | 'needs_review' | 'unclassified';

export interface DocumentTypeClassification {
  documentType: DocumentType;
  /** 0..1 — the SAME weighted evidence-ratio scoring classifyTextLexically uses (matched signal
   * weight / total candidate signal weight), never a fabricated or borrowed number. */
  confidence: number;
  /** The actual matched signal phrases — never invented, same discipline as
   * LexicalClassificationCandidate.rationale. */
  rationale: string;
  status: DocumentTypeStatus;
}

/** Curated, deliberately small per-type signal phrases — the same "short, specific, topic-
 * distinctive rather than exhaustive" discipline APFC_TOPIC_KEYWORD_ALIASES documents, applied to
 * document TYPE instead of syllabus topic. Every phrase here is checked against the document's own
 * tokenised text using the exact bag-of-words, order-independent matching classifyTextLexically
 * already uses (imported, not reimplemented) — a multi-word phrase only counts as matched when
 * every one of its words appears somewhere in the text. 'other' intentionally has no entry: it is
 * never scored for, only ever the status-level fallback when nothing else clears the floor. */
const DOCUMENT_TYPE_SIGNALS: Readonly<Record<Exclude<DocumentType, 'other'>, readonly string[]>> = {
  lecture_notes: ['lecture notes', 'class notes', 'today we will discuss', 'as discussed in class', 'recap of last lecture', 'lecture', 'unit'],
  transcript: ['transcript', 'speaker', 'video transcript', 'audio transcript', 'webinar transcript', 'q and a session'],
  official_notification: ['notification', 'office memorandum', 'in pursuance of', 'the following is notified', 'f no', 'government of india', 'ministry of', 'circular no'],
  statute: ['act', 'section', 'whereas', 'be it enacted', 'short title and commencement', 'amendment act', 'provided that', 'sub section'],
  report: ['executive summary', 'findings of the report', 'annual report', 'survey report', 'committee report', 'recommendations'],
  pyq: ['previous year question', 'question paper', 'answer the following', 'marks each', 'time allowed', 'maximum marks', 'attempt any', 'instructions to candidates'],
  book_chapter: ['chapter', 'table of contents', 'isbn', 'published by', 'edition', 'preface'],
  research_paper: ['abstract', 'references', 'doi', 'literature review', 'methodology', 'conclusion and future work', 'peer reviewed', 'keywords'],
};

/** Minimum weighted-evidence ratio for a candidate type to be proposed at all — same role and
 * default as classifyTextLexically's own minConfidence, kept separate (a different vocabulary of
 * signals has a different realistic score distribution) rather than shared, so tuning one never
 * silently retunes the other. */
const MIN_CONFIDENCE = 0.34;

/** How close the TOP TWO candidates' confidences must be before this is reported as "needs_review"
 * (conflicting signals) instead of "predicted" (one clear winner) — e.g. a document that scores
 * similarly as both a report and a research paper (both use "findings"/"conclusion"-style prose)
 * genuinely needs a human's judgement, which a single best-guess label would hide. */
const NEEDS_REVIEW_MARGIN = 0.1;

function tokenizeForMatch(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 0),
  );
}

/**
 * Scores `text` (optionally combined with `filename`, since a filename like
 * "EPFO_Notification_2024.pdf" or "Lecture12_Transcript.docx" is itself real, non-fabricated
 * evidence) against every document type's own curated signal phrases, using the same
 * weighted-evidence-ratio approach as classifyTextLexically: each phrase counts as matched only
 * when every one of its words appears in the text, weighted by its own word count, confidence =
 * matched weight / total weight for that type. Returns a `DocumentTypeClassification` for EVERY
 * call (never `undefined`) — an empty/unreadable document or one with no recognisable signal still
 * gets an honest `status: 'unclassified'` result (documentType: 'other', confidence 0) rather than
 * no result at all, so callers always have something consistent to persist and display.
 */
export function classifyDocumentType(text: string, filename: string = ''): DocumentTypeClassification {
  const combinedText = `${filename}\n${text}`;
  const textTerms = tokenizeForMatch(combinedText);

  if (textTerms.size === 0) {
    return { documentType: 'other', confidence: 0, rationale: 'No extractable text to classify.', status: 'unclassified' };
  }

  const scored: { documentType: Exclude<DocumentType, 'other'>; confidence: number; matchedPhrases: string[] }[] = [];

  for (const [type, phrases] of Object.entries(DOCUMENT_TYPE_SIGNALS) as [Exclude<DocumentType, 'other'>, readonly string[]][]) {
    const units = phrases.map((phrase) => phrase.split(/\s+/)).filter((unit) => unit.length > 0);
    const totalWeight = units.reduce((sum, unit) => sum + unit.length, 0);
    if (totalWeight === 0) continue;

    const matchedUnits = units.filter((unit) => unit.every((word) => textTerms.has(word)));
    if (matchedUnits.length === 0) continue;
    const matchedWeight = matchedUnits.reduce((sum, unit) => sum + unit.length, 0);
    const confidence = matchedWeight / totalWeight;
    if (confidence < MIN_CONFIDENCE) continue;

    scored.push({ documentType: type, confidence, matchedPhrases: matchedUnits.map((u) => u.join(' ')) });
  }

  if (scored.length === 0) {
    return { documentType: 'other', confidence: 0, rationale: 'No document-type signal phrases matched.', status: 'unclassified' };
  }

  scored.sort((a, b) => b.confidence - a.confidence || a.documentType.localeCompare(b.documentType));
  const top = scored[0];
  const runnerUp = scored[1];
  const needsReview = runnerUp !== undefined && top.confidence - runnerUp.confidence < NEEDS_REVIEW_MARGIN;

  const rationale = needsReview
    ? `Matched both "${DOCUMENT_TYPE_LABELS[top.documentType]}" (${top.matchedPhrases.join(', ')}) and "${DOCUMENT_TYPE_LABELS[runnerUp.documentType]}" (${runnerUp.matchedPhrases.join(', ')}) with similar confidence.`
    : `Matched: ${top.matchedPhrases.join(', ')}`;

  return {
    documentType: top.documentType,
    confidence: Math.min(1, Math.max(0, top.confidence)),
    rationale,
    status: needsReview ? 'needs_review' : 'predicted',
  };
}

/** Conservative, regex-based "Lecture N" / "Unit N" / "Chapter N" extraction — deliberately NOT a
 * general number extractor: only a small, explicit set of labelled patterns immediately followed
 * by a number, case-insensitive, so a stray number elsewhere in the text (a year, a page number, a
 * statute section) is never misread as a lecture/unit number. Returns `undefined` (never a guessed
 * 0 or 1) when no such labelled pattern appears at all. */
export function extractLectureOrUnitNumber(text: string): number | undefined {
  const match = /\b(?:lecture|unit|chapter|module|session)\s*[-:#]?\s*(\d{1,3})\b/i.exec(text);
  if (!match) return undefined;
  const value = Number.parseInt(match[1], 10);
  return Number.isFinite(value) ? value : undefined;
}

/** Equally conservative year extraction — only a 4-digit number (1850-2099; wide enough to cover
 * real historical statute years like "Factories Act, 1948" or "Indian Penal Code, 1860", which a
 * document-type classifier covering statutes must not arbitrarily exclude) immediately preceded by
 * one of a small set of explicit labels ("year", "dated", "published", "copyright", "act"). Never
 * scans for a bare floating 4-digit number anywhere in the text, which would just as easily match a
 * statute section number, a phone number fragment, or a page count. */
export function extractDocumentYear(text: string): number | undefined {
  const match = /\b(?:year|dated|published|copyright|act)[,:\s]*\(?((?:18|19|20)\d{2})\)?/i.exec(text);
  if (!match) return undefined;
  const value = Number.parseInt(match[1], 10);
  return value >= 1850 && value <= 2099 ? value : undefined;
}

/** The ONE place a freshly-computed classification is checked against an item's existing metadata
 * before being applied — mirrors mergeProposedClassifications' own "confirmed is never silently
 * overwritten" rule, applied to this module's own metadata-field shape instead of a
 * KnowledgeClassification array. `existingStatus` is the item's CURRENT
 * `metadata.documentTypeStatus` (undefined for a brand-new item, which behaves exactly like
 * 'predicted'/'unclassified'/'needs_review' — anything other than 'confirmed' is always safe to
 * refresh). Returns the proposal to apply, or `undefined` when the item already has a
 * human-confirmed document type — the caller (knowledgeIngestion.ts, ImportToRepositoryModal.tsx,
 * or a future reclassify action) must then leave `documentType`/`documentTypeConfidence`/
 * `documentTypeRationale`/`documentTypeStatus` on the existing metadata exactly as they are. */
export function applyDocumentTypeClassification(
  existingStatus: DocumentTypeStatus | undefined,
  proposal: DocumentTypeClassification,
): DocumentTypeClassification | undefined {
  if (existingStatus === 'confirmed') return undefined;
  return proposal;
}
