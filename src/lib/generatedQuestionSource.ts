// Unified Question Architecture, Stage 6E — a pure, typed layer for authoritative source material
// and the concepts extracted from it, ahead of any question generation. Pure and deterministic: no
// network access, no scraping, no LLM call, no question generation, and it never touches
// QUESTION_BANK or PYQ_BANK — this stage records SOURCE -> CONCEPT only. It reads SYLLABUS and
// PYQ_BANK strictly as read-only reference data (to check a topicId or a PYQ id is real) and
// modifies neither.
import { PYQ_BANK } from '../data/pyq';
import { TOPIC_TITLES } from './pyqPerformance';

export const SOURCE_TYPES = ['pib', 'india_code', 'ministry', 'epfo', 'official_statistics', 'other_official'] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

/** One piece of authoritative source material a question could eventually be built from. Holds
 * only what the source itself says — no summarisation, no rewriting, no invented fields. */
export interface AuthoritativeSourceRecord {
  sourceId: string;
  authority: string;
  title: string;
  /** The official URL or document reference (Gazette notification number, circular number, etc.) —
   * never fabricated when the source doesn't have one online. */
  reference: string;
  /** The source's own publication date, when available. Omit entirely when unknown. */
  publishedAt?: string;
  /** The date the source's content takes/took legal or administrative effect, when this differs
   * from publishedAt and is known. Omit entirely when unknown. */
  effectiveAt?: string;
  sourceType: SourceType;
  notes?: string;
}

/** One fact or idea extracted from a source, tied to the syllabus topic it belongs under. This is
 * still not a question — `concept` and `factualBasis` describe what the source establishes, not
 * how to test it. */
export interface SourceConcept {
  conceptId: string;
  sourceId: string;
  topicId: string;
  concept: string;
  factualBasis: string;
  relevantPyqIds?: string[];
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidIsoDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

/**
 * Deterministic factory: returns a fresh copy of exactly the fields given, never adding, dropping,
 * or defaulting any of them. Use validateSourceRecord separately to check the result.
 */
export function createSourceRecord(record: AuthoritativeSourceRecord): AuthoritativeSourceRecord {
  return { ...record };
}

/** Structural validation only: required fields present, sourceType recognised, and any date field
 * that is present parses as a real date. Never invents a missing value — an absent optional field
 * simply produces no error. */
export function validateSourceRecord(source: AuthoritativeSourceRecord): string[] {
  const errors: string[] = [];
  if (!isNonEmptyString(source.sourceId)) errors.push('sourceId is required.');
  if (!isNonEmptyString(source.authority)) errors.push('authority is required.');
  if (!isNonEmptyString(source.title)) errors.push('title is required.');
  if (!isNonEmptyString(source.reference)) errors.push('reference is required (an official URL or document reference).');
  if (!SOURCE_TYPES.includes(source.sourceType)) errors.push(`sourceType must be one of: ${SOURCE_TYPES.join(', ')}.`);
  if (source.publishedAt !== undefined && !isValidIsoDate(source.publishedAt)) {
    errors.push('publishedAt, if present, must be a valid date.');
  }
  if (source.effectiveAt !== undefined && !isValidIsoDate(source.effectiveAt)) {
    errors.push('effectiveAt, if present, must be a valid date.');
  }
  return errors;
}

/**
 * Deterministic factory: returns a fresh copy of exactly the fields given, never adding, dropping,
 * or defaulting any of them. Use validateSourceConcept separately to check the result.
 */
export function createSourceConcept(concept: SourceConcept): SourceConcept {
  return { ...concept };
}

/** Structural validation only: required fields present, and relevantPyqIds (if present) is an
 * array of non-empty strings. Does not check that topicId or relevantPyqIds refer to anything
 * real — see verifyConceptTopicExists / verifyRelevantPyqIdsExist for that. */
export function validateSourceConcept(concept: SourceConcept): string[] {
  const errors: string[] = [];
  if (!isNonEmptyString(concept.conceptId)) errors.push('conceptId is required.');
  if (!isNonEmptyString(concept.sourceId)) errors.push('sourceId is required.');
  if (!isNonEmptyString(concept.topicId)) errors.push('topicId is required.');
  if (!isNonEmptyString(concept.concept)) errors.push('concept is required.');
  if (!isNonEmptyString(concept.factualBasis)) errors.push('factualBasis is required.');
  if (concept.relevantPyqIds !== undefined) {
    if (!Array.isArray(concept.relevantPyqIds)) {
      errors.push('relevantPyqIds, if present, must be an array of PYQ ids.');
    } else if (concept.relevantPyqIds.some((id) => !isNonEmptyString(id))) {
      errors.push('relevantPyqIds must not contain empty ids.');
    }
  }
  return errors;
}

/** Confirms concept.topicId names a real syllabus topic, via the same TOPIC_TITLES lookup the rest
 * of the app (and Stage 6A/6B) already use — SYLLABUS itself is read-only reference data here. */
export function verifyConceptTopicExists(concept: SourceConcept): string[] {
  if (!isNonEmptyString(concept.topicId) || !(concept.topicId in TOPIC_TITLES)) {
    return [`topicId "${concept.topicId}" does not match a known syllabus topic.`];
  }
  return [];
}

/** Confirms every id in concept.relevantPyqIds (when present) actually exists in PYQ_BANK.
 * PYQ_BANK is read, never written. An id that doesn't resolve is reported, never silently dropped
 * or swapped for a real one. */
export function verifyRelevantPyqIdsExist(concept: SourceConcept): string[] {
  if (concept.relevantPyqIds === undefined) return [];
  const knownIds = new Set(PYQ_BANK.map((p) => p.id));
  return concept.relevantPyqIds
    .filter((id) => !knownIds.has(id))
    .map((id) => `relevantPyqIds references unknown PYQ id "${id}".`);
}

/** The result of associating a batch of concepts with one source: concepts whose own `sourceId`
 * actually matches the source's `sourceId` are separated from any that don't, rather than silently
 * dropping the mismatches — every concept object passes through unchanged either way. */
export interface SourceConceptAssociation {
  source: AuthoritativeSourceRecord;
  matched: SourceConcept[];
  mismatched: SourceConcept[];
}

/**
 * Associates `concepts` with `source` by checking each concept's own sourceId against
 * source.sourceId. Never rewrites a concept's sourceId to make it match — a mismatch is reported
 * back in `mismatched`, untouched, so the caller can see exactly what didn't belong.
 */
export function associateConceptsWithSource(source: AuthoritativeSourceRecord, concepts: SourceConcept[]): SourceConceptAssociation {
  const matched: SourceConcept[] = [];
  const mismatched: SourceConcept[] = [];
  for (const concept of concepts) {
    (concept.sourceId === source.sourceId ? matched : mismatched).push(concept);
  }
  return { source, matched, mismatched };
}

