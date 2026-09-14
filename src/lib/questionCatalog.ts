// Unified Question Architecture, Stage 4 — the minimal common catalog/view-model layer this app
// has been building toward since Stage 1: one flat, provenance-tagged list spanning both existing
// question sources (PYQ_BANK and QUESTION_BANK), with nothing about either source touched or
// duplicated. This is a pure, read-only mapping layer only — no page wires it up yet (that's later,
// unrequested UI work); its job here is just to prove the two sources CAN be viewed uniformly and
// driven through the existing shared session engine (lib/questionSessionEngine.ts /
// lib/useQuestionSession.ts) without a third session implementation and without either source
// pretending to be something it isn't (an authentic PYQ vs a hand-authored practice-bank question
// stay explicitly distinguishable via `provenance.kind`, never merged into one flavor).
import type { PYQ, Question, QuestionOption, QuestionProvenance } from './types';
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

/** The unified catalog: every PYQ followed by every practice-bank question, each still carrying
 * its own honest provenance. Neither source array is mutated, reordered within itself, or
 * filtered — this is a pure concatenation of two independently-mapped lists. */
export function buildQuestionCatalog(pyqBank: PYQ[], questionBank: Question[]): CatalogQuestion[] {
  return [...pyqBank.map(pyqToCatalogQuestion), ...questionBank.map(questionToCatalogQuestion)];
}

/** The one predicate "preserve provenance... explicitly distinguishable" actually requires:
 * is this catalog entry an authentic PYQ? Delegates to isPyqProvenance (Stage 1) — never a second
 * provenance check. */
export function isAuthenticPyq(entry: CatalogQuestion): boolean {
  return isPyqProvenance(entry.provenance);
}
