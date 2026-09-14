// Unified Question Architecture, Stage 6J — the official-source research batch interface: the
// typed boundary a future real-research submission (multiple AuthoritativeSourceRecords and the
// ConceptExtractionInputs drawn from them) will pass through before anything downstream ever sees
// it. Pure and deterministic: no network access, no LLM call, no question generation. This is the
// final boundary before real official research material starts flowing through the pipeline — it
// still only validates structure; it invents nothing.
//
// Reuse, not re-implementation: per-source structural validation is validateSourceRecord (Stage
// 6E). Per-concept structural/topic/PYQ-existence/source-association validation is delegated to
// runSourceResearchWorkflow (Stage 6I), called once per concept against the specific source it
// names — Stage 6I's own per-concept checks are all independent of what else is in the array passed
// to it, so calling it with a single-element concepts array yields identical results to calling it
// with a larger one. The two checks genuinely new to this stage — because they only make sense at
// whole-batch scope, spanning possibly many sources — are: (a) whether a concept's sourceId
// resolves to any source actually present in this batch at all (Stage 6I's association check
// assumes you already have one specific source to compare against; this stage's question is
// different — "does that sourceId exist in the batch"), and (b) duplicate-id detection across the
// *entire* batch for both sourceIds and conceptIds (Stage 6I's own duplicate-conceptId check is
// scoped to a single workflow call, not a multi-source batch).
import {
  validateSourceRecord,
  type AuthoritativeSourceRecord,
  type SourceConcept,
} from './generatedQuestionSource';
import { runSourceResearchWorkflow, type ConceptExtractionInput, type ConceptResearchResult } from './generatedQuestionResearch';

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export interface ResearchBatch {
  batchId: string;
  researchedAt: string;
  sources: AuthoritativeSourceRecord[];
  conceptInputs: ConceptExtractionInput[];
}

/** One source's outcome, reported individually — an invalid source is never dropped, only flagged,
 * and it does not stop its concepts from being checked against it. */
export type SourceValidationResult =
  | { status: 'valid'; source: AuthoritativeSourceRecord }
  | { status: 'invalid'; source: AuthoritativeSourceRecord; errors: string[] };

export interface ResearchBatchValidationResult {
  batchId: string;
  sources: SourceValidationResult[];
  concepts: ConceptResearchResult[];
}

/**
 * Validates an entire ResearchBatch: every source record, every concept-extraction input, and the
 * cross-references between them. Nothing is silently discarded — every source and every concept
 * gets its own reported outcome, in the same order supplied. Never mutates `batch` or any of its
 * nested objects.
 */
export function validateResearchBatch(batch: ResearchBatch): ResearchBatchValidationResult {
  // Steps 1-2: validate every source record (Stage 6E, reused) and detect duplicate sourceIds
  // within the batch — new to this stage, since a single AuthoritativeSourceRecord has no notion
  // of "batch."
  const seenSourceIds = new Set<string>();
  const sources: SourceValidationResult[] = batch.sources.map((source) => {
    const errors = [...validateSourceRecord(source)];
    if (isNonEmptyString(source.sourceId)) {
      if (seenSourceIds.has(source.sourceId)) {
        errors.push(`sourceId "${source.sourceId}" is a duplicate within this research batch.`);
      } else {
        seenSourceIds.add(source.sourceId);
      }
    }
    return errors.length > 0 ? { status: 'invalid' as const, source, errors } : { status: 'valid' as const, source };
  });

  // Presence, not validity: a concept naming a structurally-invalid source still "references a
  // source present in this batch" — that source's own problems are reported separately, above.
  const sourcesById = new Map(batch.sources.map((s) => [s.sourceId, s] as const));

  // Steps 3-4: per-concept validation, reusing runSourceResearchWorkflow (Stage 6I) against the
  // concept's own referenced source when that source exists in the batch; when it doesn't, report
  // that directly rather than calling into a workflow that needs a real source to validate against.
  const seenConceptIds = new Set<string>();
  const concepts: ConceptResearchResult[] = batch.conceptInputs.map((extracted) => {
    const referencedSource = sourcesById.get(extracted.sourceId);
    const base: ConceptResearchResult = referencedSource
      ? runSourceResearchWorkflow({ source: referencedSource, sourceContent: '', concepts: [extracted] }).concepts[0]
      : {
          status: 'invalid',
          conceptId: extracted.conceptId,
          errors: [`concept.sourceId "${extracted.sourceId}" does not reference a source present in this batch.`],
        };

    // Duplicate-conceptId detection across the whole batch (new to this stage — Stage 6I's own
    // duplicate check only sees the single-element array passed to it above).
    if (!isNonEmptyString(extracted.conceptId)) return base;
    if (seenConceptIds.has(extracted.conceptId)) {
      const duplicateError = `conceptId "${extracted.conceptId}" is a duplicate within this research batch.`;
      return base.status === 'invalid'
        ? { status: 'invalid', conceptId: base.conceptId, errors: [...base.errors, duplicateError] }
        : { status: 'invalid', conceptId: base.concept.conceptId, errors: [duplicateError] };
    }
    seenConceptIds.add(extracted.conceptId);
    return base;
  });

  return { batchId: batch.batchId, sources, concepts };
}

/** Convenience extraction of just the successfully validated SourceConcept records across the
 * whole batch — the set a later stage would actually consume. */
export function getValidBatchConcepts(result: ResearchBatchValidationResult): SourceConcept[] {
  return result.concepts.flatMap((c) => (c.status === 'valid' ? [c.concept] : []));
}
