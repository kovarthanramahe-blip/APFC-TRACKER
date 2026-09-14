// Unified Question Architecture, Stage 6I — the official-source research workflow foundation:
// registering one AuthoritativeSourceRecord together with caller-supplied source content and
// extracting a batch of SourceConcept records from it. Pure and deterministic: no network access,
// no scraping, no LLM call, and no question generation — this stage is SOURCE RESEARCH ONLY, one
// step earlier than Stage 6H's draft-generation workflow, which is where a SourceConcept eventually
// gets used. It never touches QUESTION_BANK, PYQ_BANK, syllabus, store, Supabase, routes, or UI.
//
// This module extends generatedQuestionSource.ts's (Stage 6E) architecture only by composing it —
// it adds no new exports to that file, because everything a multi-concept research batch needs
// already exists there: validateSourceRecord, validateSourceConcept, verifyConceptTopicExists,
// verifyRelevantPyqIdsExist, associateConceptsWithSource, and createSourceConcept are all reused
// verbatim, never re-implemented. The only genuinely new behaviour here is batch-level: running
// those same per-concept checks over an array, and detecting duplicate conceptIds within one batch
// (a concern that doesn't exist for a single concept).
import {
  validateSourceRecord,
  validateSourceConcept,
  verifyConceptTopicExists,
  verifyRelevantPyqIdsExist,
  associateConceptsWithSource,
  createSourceConcept,
  type AuthoritativeSourceRecord,
  type SourceConcept,
} from './generatedQuestionSource';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Exactly what a human researcher supplies for one extracted concept — conceptId and sourceId are
 * both required explicitly (never auto-derived from the source record) so an association mismatch
 * is a real, checkable condition rather than one this module makes structurally impossible. topicId
 * and factualBasis are likewise always caller-supplied: this module never infers a topic from the
 * source content and never invents a missing fact. */
export interface ConceptExtractionInput {
  conceptId: string;
  sourceId: string;
  topicId: string;
  concept: string;
  factualBasis: string;
  relevantPyqIds?: string[];
}

export interface SourceResearchWorkflowInput {
  source: AuthoritativeSourceRecord;
  /** The raw source text/content supplied by the caller. Carried through to the result completely
   * unparsed and unaltered — this module never summarises, rewrites, or extracts from it itself;
   * extraction is the caller's job, expressed as `concepts` below. */
  sourceContent: string;
  concepts: ConceptExtractionInput[];
}

/** One concept's outcome, reported individually so a batch never silently drops a failure: either
 * the fully validated SourceConcept, or the exact conceptId supplied (even if empty/invalid) paired
 * with every violation found for that entry. */
export type ConceptResearchResult =
  | { status: 'valid'; concept: SourceConcept }
  | { status: 'invalid'; conceptId: string; errors: string[] };

export interface SourceResearchWorkflowResult {
  source: AuthoritativeSourceRecord;
  sourceErrors: string[];
  sourceContent: string;
  concepts: ConceptResearchResult[];
}

/**
 * Validates one AuthoritativeSourceRecord and a batch of concept-extraction inputs against it.
 * Every concept is checked independently — structural validity (validateSourceConcept), topic
 * existence (verifyConceptTopicExists), referenced-PYQ existence (verifyRelevantPyqIdsExist), and
 * source association (associateConceptsWithSource, run per-concept so a mismatch is attributable to
 * exactly the concept that caused it) — plus a duplicate-conceptId check across the batch, which is
 * the one rule genuinely new to this stage. Never mutates `input` or any of its nested objects;
 * every SourceConcept in the result is a fresh object from createSourceConcept.
 */
export function runSourceResearchWorkflow(input: SourceResearchWorkflowInput): SourceResearchWorkflowResult {
  const sourceErrors = validateSourceRecord(input.source);

  const seenConceptIds = new Set<string>();
  const concepts: ConceptResearchResult[] = input.concepts.map((extracted) => {
    const concept = createSourceConcept({
      conceptId: extracted.conceptId,
      sourceId: extracted.sourceId,
      topicId: extracted.topicId,
      concept: extracted.concept,
      factualBasis: extracted.factualBasis,
      relevantPyqIds: extracted.relevantPyqIds,
    });

    const association = associateConceptsWithSource(input.source, [concept]);
    const associationErrors =
      association.mismatched.length > 0
        ? [`concept.sourceId "${concept.sourceId}" does not match source.sourceId "${input.source.sourceId}".`]
        : [];

    const duplicateErrors: string[] = [];
    if (isNonEmptyString(concept.conceptId)) {
      if (seenConceptIds.has(concept.conceptId)) {
        duplicateErrors.push(`conceptId "${concept.conceptId}" is a duplicate within this source-research batch.`);
      } else {
        seenConceptIds.add(concept.conceptId);
      }
    }

    const errors = [
      ...validateSourceConcept(concept),
      ...verifyConceptTopicExists(concept),
      ...verifyRelevantPyqIdsExist(concept),
      ...associationErrors,
      ...duplicateErrors,
    ];

    return errors.length > 0 ? { status: 'invalid' as const, conceptId: concept.conceptId, errors } : { status: 'valid' as const, concept };
  });

  return { source: input.source, sourceErrors, sourceContent: input.sourceContent, concepts };
}

/** Convenience extraction of just the successfully validated SourceConcept records — the set a
 * later stage (e.g. Stage 6H's draft-generation workflow) would actually consume. */
export function getValidSourceConcepts(result: SourceResearchWorkflowResult): SourceConcept[] {
  return result.concepts.flatMap((c) => (c.status === 'valid' ? [c.concept] : []));
}
