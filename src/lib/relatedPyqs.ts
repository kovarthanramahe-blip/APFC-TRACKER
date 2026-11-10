import { PYQ_BANK } from '../data/pyq';
import { UPSC_CSE_PRELIMS_PYQ_BANK } from '../data/pyqUpscCsePrelims';
import { granularNodeIdForPyq } from './upscCseGranularPyqMapping';
import type { KnowledgeClassification } from './knowledgeClassification';

// P1.5 Part B — "Related PYQs" for a CONFIRMED Knowledge Librarian classification, using ONLY
// existing, real topic-id foreign keys — never a new mapping, never inferred/fuzzy-matched:
//  - apfc: lib/types.ts's PracticeQuestion.topicId (an APFC syllabus topic id), matched against
//    data/pyq.ts's PYQ_BANK.
//  - upsc_cse: lib/upscCseGranularPyqMapping.ts's hand-curated, deliberately small
//    granularNodeIdForPyq lookup, matched against data/pyqUpscCsePrelims.ts's
//    UPSC_CSE_PRELIMS_PYQ_BANK (Prelims only — there is no CSE Mains/descriptive PYQ bank; see
//    lib/types.ts's DescriptiveExamQuestion header for why one isn't fabricated here either).
// A topic with no mapped PYQs returns [] — the caller renders an honest empty state, never a
// fabricated "no PYQs found yet" guess dressed up as a real result vs a genuinely absent mapping.
//
// Workspace/taxonomy restriction falls out of this dispatch by construction: `classification.taxonomy`
// is itself derived from the trusted active workspace at classification-creation time (see
// lib/knowledgeClassification.ts's taxonomyForWorkspace) — an apfc classification can structurally
// never reach UPSC_CSE_PRELIMS_PYQ_BANK and vice versa, so there is no separate workspace check to
// get wrong here.
//
// `status !== 'confirmed'` (proposed or rejected) always returns [] — a classification the user
// hasn't decided on (or has explicitly rejected) is not yet a fact about the item, so it never
// drives a "these PYQs are about this item" claim.

export interface RelatedPyqSummary {
  id: string;
  question: string;
  year?: number;
}

export function relatedPyqsForClassification(
  classification: Pick<KnowledgeClassification, 'taxonomy' | 'topicId' | 'status'>,
): RelatedPyqSummary[] {
  if (classification.status !== 'confirmed') return [];

  if (classification.taxonomy === 'apfc') {
    return PYQ_BANK.filter((q) => q.topicId === classification.topicId).map((q) => ({ id: q.id, question: q.question, year: q.year }));
  }

  if (classification.taxonomy === 'upsc_cse') {
    return UPSC_CSE_PRELIMS_PYQ_BANK.filter((q) => granularNodeIdForPyq(q.id) === classification.topicId).map((q) => ({
      id: q.id,
      question: q.question,
      year: q.year,
    }));
  }

  return [];
}
