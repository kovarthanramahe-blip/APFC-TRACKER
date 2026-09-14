// Unified Question Architecture, Stage 4 — the minimal common catalog/view-model layer this app
// has been building toward since Stage 1: one flat, provenance-tagged list spanning both existing
// question sources (PYQ_BANK and QUESTION_BANK), with nothing about either source touched or
// duplicated. This is a pure, read-only mapping layer only — no page wires it up yet (that's later,
// unrequested UI work); its job here is just to prove the two sources CAN be viewed uniformly and
// driven through the existing shared session engine (lib/questionSessionEngine.ts /
// lib/useQuestionSession.ts) without a third session implementation and without either source
// pretending to be something it isn't (an authentic PYQ vs a hand-authored practice-bank question
// stay explicitly distinguishable via `provenance.kind`, never merged into one flavor).
import type { PYQ, Question, QuestionOption, QuestionProvenance, GeneratedQuestionDraft } from './types';
import { toPyqProvenance, isPyqProvenance } from './practiceQuestion';
import { TOPIC_TITLES } from './pyqPerformance';

/** The common shape both question sources are mapped into. Deliberately minimal — just what a
 * catalog listing/session screen needs regardless of source; anything else source-specific (e.g. a
 * PYQ's subtopic) is left on the original record for whichever later stage renders per-source
 * detail. `difficulty` is the one exception: it's optional (present only for practice-bank
 * entries, which is all Question ever had) rather than omitted entirely, so an existing
 * difficulty filter/display can keep working over the unified list without fabricating a
 * difficulty for PYQs, which never had one. */
export interface CatalogQuestion {
  id: string;
  subject: PYQ['subject'];
  /** Human-readable topic — a PYQ's real syllabus topic title (via lib/pyqPerformance's
   * TOPIC_TITLES, the same lookup PYQTest.tsx already uses) or a Question's own free-text topic,
   * whichever source this entry came from. Never a syllabus topic FK for Question entries — it
   * doesn't have one (see lib/types.ts's Question vs PracticeQuestion). */
  topicLabel: string;
  question: string;
  options: QuestionOption[];
  correctOptionId: string;
  explanation: string;
  difficulty?: Question['difficulty'];
  provenance: QuestionProvenance;
}

/** Maps a single authentic PYQ into the catalog shape. Reuses toPyqProvenance (Stage 1) verbatim —
 * never a second PYQ-provenance derivation. */
export function pyqToCatalogQuestion(pyq: PYQ): CatalogQuestion {
  return {
    id: pyq.id,
    subject: pyq.subject,
    topicLabel: TOPIC_TITLES[pyq.topicId] ?? pyq.topicId,
    question: pyq.question,
    options: pyq.options,
    correctOptionId: pyq.correctOptionId,
    explanation: pyq.explanation,
    provenance: toPyqProvenance(pyq),
  };
}

/** Maps a single hand-authored practice-bank question (data/questionBank.ts) into the catalog
 * shape, tagged with PracticeBankProvenance — never PyqProvenance or GeneratedProvenance, since
 * this question is neither an authentic PYQ nor calibrated against a cited official source. */
export function questionToCatalogQuestion(q: Question): CatalogQuestion {
  return {
    id: q.id,
    subject: q.subject,
    topicLabel: q.topic,
    question: q.question,
    options: q.options,
    correctOptionId: q.correctOptionId,
    explanation: q.explanation,
    difficulty: q.difficulty,
    provenance: { kind: 'practice_bank', tag: q.tag },
  };
}

/** Maps a single APPROVED source-backed generated question draft (lib/generatedQuestionDraft.ts,
 * lib/generatedQuestionReview.ts) into the catalog shape. `generatedPool` (buildQuestionCatalog's
 * third argument) is expected to already contain only drafts that cleared the Stage 6M approval
 * gate — this function does no gating itself, it only maps; see
 * data/generatedQuestionBank.ts's selectApprovedGeneratedQuestions for the one place that gate is
 * actually enforced. The draft's own GeneratedProvenance is carried through completely
 * unchanged — never rewritten into PyqProvenance or any other shape — so source authority/title/
 * reference/date, factualBasis linkage (via provenance.topicId), calibratedAgainstPyqIds, and
 * verificationStatus all survive exactly as the draft had them. */
export function generatedQuestionToCatalogQuestion(draft: GeneratedQuestionDraft): CatalogQuestion {
  return {
    id: draft.id,
    subject: draft.subject,
    topicLabel: TOPIC_TITLES[draft.topicId] ?? draft.topicId,
    question: draft.question,
    options: draft.options,
    correctOptionId: draft.correctOptionId,
    explanation: draft.explanation,
    provenance: draft.provenance,
  };
}

/** The unified catalog: every PYQ, then every practice-bank question, then every approved
 * generated question — each still carrying its own honest provenance. `generatedPool` is optional
 * and defaults to an empty array, so every existing two-argument call site (QuestionBank.tsx,
 * MockTestRunner.tsx, and every prior test) is unaffected and keeps producing exactly the same
 * PYQ_BANK.length + QUESTION_BANK.length entries it always has. No source array is mutated,
 * reordered within itself, or filtered — this is a pure concatenation of three independently-mapped
 * lists. */
export function buildQuestionCatalog(
  pyqBank: PYQ[],
  questionBank: Question[],
  generatedPool: GeneratedQuestionDraft[] = [],
): CatalogQuestion[] {
  return [...pyqBank.map(pyqToCatalogQuestion), ...questionBank.map(questionToCatalogQuestion), ...generatedPool.map(generatedQuestionToCatalogQuestion)];
}

/** The one predicate "preserve provenance... explicitly distinguishable" actually requires:
 * is this catalog entry an authentic PYQ? Delegates to isPyqProvenance (Stage 1) — never a second
 * provenance check. */
export function isAuthenticPyq(entry: CatalogQuestion): boolean {
  return isPyqProvenance(entry.provenance);
}

/** The generated-entry counterpart to isAuthenticPyq: is this catalog entry a source-backed
 * generated question (as opposed to an authentic PYQ or a hand-authored practice-bank question)? A
 * plain provenance.kind narrowing, kept here rather than added to lib/practiceQuestion.ts since
 * that module's own scope is specifically the PYQ/PracticeQuestion bridge. */
export function isGeneratedQuestion(entry: CatalogQuestion): boolean {
  return entry.provenance.kind === 'generated';
}
