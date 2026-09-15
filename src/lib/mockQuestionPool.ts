// Unified Question Architecture, Stage 5C — the Mock Test selection boundary, made explicit and
// extensible over CatalogQuestion (lib/questionCatalog.ts) instead of implicitly assuming its
// input is "whatever the caller happened to build from QUESTION_BANK" (Stage 5B's approach: safe
// today only because MockTestRunner.tsx never mapped a PYQ into the pool, not because anything
// here enforced it). This module makes that boundary a real, testable policy: which provenance
// kinds a blueprint is allowed to draw from, explicit at the call site, defaulting to exactly
// today's practice-bank-only pool. It does not add PYQs or generated questions to any existing
// mock — the default policy still excludes both — it only gives a future stage a place to pass a
// different, explicit policy without touching this selection logic again.
import type { MockTestBlueprint, QuestionProvenance } from './types';
import type { CatalogQuestion } from './questionCatalog';
import { shuffle } from '../data/mockTests';

export type ProvenanceKind = QuestionProvenance['kind'];

/** Today's — and until a future stage explicitly opts in otherwise, every existing blueprint's —
 * Mock Test pool: practice-bank questions only. Never includes 'pyq' or 'generated' unless a
 * caller explicitly passes a wider policy to selectMockQuestionPool. */
export const DEFAULT_MOCK_PROVENANCE_POLICY: readonly ProvenanceKind[] = ['practice_bank'];

/**
 * The policy a caller opts into when generated questions should also be eligible for Mock Test,
 * on top of the existing practice-bank default. Safe to use unconditionally — never re-checks
 * verificationStatus itself, because it doesn't need to: the only way a generated question ever
 * reaches a catalog built with data/generatedQuestionBank.ts's GENERATED_QUESTION_BANK is by first
 * clearing the Stage 6M approveGeneratedQuestion gate (verified/published only) via
 * selectApprovedGeneratedQuestions — a 'draft' generated question can never be a member of that
 * array, so it can never reach this filter in the first place. This policy is additive to (not a
 * replacement for) DEFAULT_MOCK_PROVENANCE_POLICY; the default itself is left untouched. */
export const APPROVED_GENERATED_INCLUSIVE_POLICY: readonly ProvenanceKind[] = [...DEFAULT_MOCK_PROVENANCE_POLICY, 'generated'];

/**
 * Selects the question pool for a blueprint from a CatalogQuestion catalog: filters by the
 * blueprint's own subject constraint (identical semantics to data/mockTests.ts's
 * pickQuestionsForBlueprint, which this supersedes as Mock Test's actual selection path — that
 * function itself is untouched and still exported for any other caller), then by an EXPLICIT
 * allowed-provenance policy (defaulting to practice-bank-only), then shuffles and caps at
 * questionCount using the exact same shuffle() data/mockTests.ts already exports — never a second
 * shuffle implementation.
 *
 * Passing `catalog` as the full PYQ+practice-bank catalog and leaving `allowedProvenance` at its
 * default reproduces today's 131-question practice-bank pool exactly, regardless of how many PYQs
 * are also present in `catalog` — they're filtered out by policy, not by the caller having to
 * remember to only pass a pre-filtered array.
 */
export function selectMockQuestionPool(
  catalog: CatalogQuestion[],
  blueprint: MockTestBlueprint,
  allowedProvenance: readonly ProvenanceKind[] = DEFAULT_MOCK_PROVENANCE_POLICY,
): CatalogQuestion[] {
  const bySubject = blueprint.subjects === 'all' ? catalog : catalog.filter((entry) => blueprint.subjects.includes(entry.subject));
  const byProvenance = bySubject.filter((entry) => allowedProvenance.includes(entry.provenance.kind));
  const shuffled = shuffle(byProvenance);
  return shuffled.slice(0, Math.min(blueprint.questionCount, shuffled.length));
}
