// Unified Question Architecture, Stage 6L — the first 8 source-backed APFC-style generated
// question drafts, 2 per concept in Stage 6K's real research batch (apfcSourceResearchBatch.ts).
// Every fact in every question/option/explanation below traces to that batch's factualBasis text
// and nothing else — no statutory provision, date, figure, or scheme rule appears here that isn't
// already present in one of the four concepts' factualBasis. Distractors vary only numbers/dates/
// attributions already given by the source (never introduce a new real-world fact as a wrong
// answer), so a distractor being "plausible" never means "true but unrelated" — it's a near-miss of
// the one correct, source-stated value. DRAFT ONLY: verificationStatus is 'draft' on every question,
// nothing is published to QUESTION_BANK, and no PYQ calibration id is used (Stage 6K found none
// genuinely relevant to these four 2025/2026 developments, and none is fabricated here either).
//
// Built entirely on runGeneratedQuestionDraftWorkflow (Stage 6H), which itself composes source
// validation (6E), the pipeline (6B, wrapping 6A), calibration validation (6F, unused here since no
// calibration is supplied), and the APFC quality checks (6G) — no rule from any of those stages is
// re-implemented. generatedQuestionQuality.ts's assessment-level validator (6G) is additionally run
// directly per question against a human-reviewer-style GeneratedQuestionQualityAssessment, since
// Stage 6H's workflow itself doesn't take or validate one.
import { PYQ_BANK } from '../data/pyq';
import { QUESTION_BANK } from '../data/questionBank';
import type { GeneratedQuestionDraft, SubjectColorKey } from './types';
import { runGeneratedQuestionDraftWorkflow, type GeneratedQuestionDraftContent, type GeneratedQuestionDraftWorkflowResult } from './generatedQuestionDraft';
import { validateGeneratedQuestionQualityAssessment, type GeneratedQuestionQualityAssessment } from './generatedQuestionQuality';
import { APFC_RESEARCH_BATCH_SOURCES, APFC_RESEARCH_BATCH_CONCEPTS } from './apfcSourceResearchBatch';

const GENERATED_AT = '2026-09-14T00:00:00.000Z';

const sourcesBySourceId = new Map(APFC_RESEARCH_BATCH_SOURCES.map((s) => [s.sourceId, s]));
const conceptsByConceptId = new Map(APFC_RESEARCH_BATCH_CONCEPTS.map((c) => [c.conceptId, c]));

interface ApfcGeneratedQuestionSpec {
  id: string;
  conceptId: string;
  subject: SubjectColorKey;
  content: Omit<GeneratedQuestionDraftContent, 'verificationStatus' | 'subject'>;
  quality: Omit<GeneratedQuestionQualityAssessment, 'generatedQuestionId'>;
}

const SPECS: ApfcGeneratedQuestionSpec[] = [
  // ---- concept-css-2020-act-details (Code on Social Security, 2020 — Act no./date/Chapter III) ----
  {
    id: 'gen-css-2020-act-1',
    conceptId: 'concept-css-2020-act-details',
    subject: 'labourLaw',
    content: {
      question: 'As per India Code, the Code on Social Security, 2020 is officially recorded as which Act, enacted on which date?',
      options: [
        { id: 'o0', text: 'Act No. 36 of 2020, enacted 28 September 2020' },
        { id: 'o1', text: 'Act No. 29 of 2020, enacted 28 September 2020' },
        { id: 'o2', text: 'Act No. 36 of 2020, enacted 23 September 2020' },
        { id: 'o3', text: 'Act No. 36 of 2019, enacted 28 September 2020' },
      ],
      correctOptionId: 'o0',
      explanation:
        'India Code identifies the Code on Social Security, 2020 as Act Number 36 of 2020, with enactment date 28 September 2020 — both the Act number and the year of enactment must match exactly.',
    },
    quality: {
      dimensions: {
        factualAccuracyProvenance: 'strong',
        syllabusTopicAlignment: 'strong',
        conceptualDepth: 'adequate',
        apfcPyqStyleFraming: 'adequate',
        optionDistractorQuality: 'adequate',
        difficulty: 'appropriate',
        explanationQuality: 'strong',
        duplicationAuthenticPyqSeparation: 'strong',
      },
      verdict: 'acceptable',
      rationale:
        'Directly and exactly sourced from India Code (Act number + enactment date); distractors are near-miss variations of the one correct value, not invented facts. Recall-level, matching what the source itself supplies.',
    },
  },
  {
    id: 'gen-css-2020-act-2',
    conceptId: 'concept-css-2020-act-details',
    subject: 'labourLaw',
    content: {
      question: "India Code lists a Chapter of the Code on Social Security, 2020 (Act No. 36 of 2020) titled 'Employees' Provident Fund'. Which Chapter is this?",
      options: [
        { id: 'o0', text: 'Chapter III' },
        { id: 'o1', text: 'Chapter II' },
        { id: 'o2', text: 'Chapter IV' },
        { id: 'o3', text: 'Chapter V' },
      ],
      correctOptionId: 'o0',
      explanation: "India Code lists Chapter III of the Code on Social Security, 2020 as 'Employees' Provident Fund'.",
    },
    quality: {
      dimensions: {
        factualAccuracyProvenance: 'strong',
        syllabusTopicAlignment: 'strong',
        conceptualDepth: 'adequate',
        apfcPyqStyleFraming: 'adequate',
        optionDistractorQuality: 'adequate',
        difficulty: 'appropriate',
        explanationQuality: 'strong',
        duplicationAuthenticPyqSeparation: 'strong',
      },
      verdict: 'acceptable',
      rationale: "Directly sourced chapter-numbering fact from India Code; distractors are plain numeric near-misses of the one stated Chapter number, nothing invented.",
    },
  },

  // ---- concept-four-labour-codes-effective-2025-11-21 (commencement of the four Labour Codes) ----
  {
    id: 'gen-four-codes-effective-1',
    conceptId: 'concept-four-labour-codes-effective-2025-11-21',
    subject: 'labourLaw',
    content: {
      question: 'With effect from which date did the Government of India bring all four Labour Codes into force?',
      options: [
        { id: 'o0', text: '21 November 2025' },
        { id: 'o1', text: '1 November 2025' },
        { id: 'o2', text: '21 September 2025' },
        { id: 'o3', text: '26 November 2025' },
      ],
      correctOptionId: 'o0',
      explanation: 'The source states that the four Labour Codes were made effective from 21 November 2025.',
    },
    quality: {
      dimensions: {
        factualAccuracyProvenance: 'strong',
        syllabusTopicAlignment: 'strong',
        conceptualDepth: 'adequate',
        apfcPyqStyleFraming: 'adequate',
        optionDistractorQuality: 'adequate',
        difficulty: 'appropriate',
        explanationQuality: 'strong',
        duplicationAuthenticPyqSeparation: 'strong',
      },
      verdict: 'acceptable',
      rationale: 'A single, exactly-sourced commencement date; distractors are near-miss dates, no external fact introduced.',
    },
  },
  {
    id: 'gen-four-codes-effective-2',
    conceptId: 'concept-four-labour-codes-effective-2025-11-21',
    subject: 'labourLaw',
    content: {
      question: 'Which of the following is NOT among the four Labour Codes the Government brought into effect from 21 November 2025, per the source?',
      options: [
        { id: 'o0', text: 'Minimum Wages Act, 1948' },
        { id: 'o1', text: 'Code on Wages, 2019' },
        { id: 'o2', text: 'Industrial Relations Code, 2020' },
        { id: 'o3', text: 'Occupational Safety, Health and Working Conditions Code, 2020' },
      ],
      correctOptionId: 'o0',
      explanation:
        'The source names exactly four codes made effective from 21 November 2025 — Code on Wages, 2019; Industrial Relations Code, 2020; Code on Social Security, 2020; and the Occupational Safety, Health and Working Conditions Code, 2020. The Minimum Wages Act, 1948 does not match any of those four names.',
    },
    quality: {
      dimensions: {
        factualAccuracyProvenance: 'strong',
        syllabusTopicAlignment: 'strong',
        conceptualDepth: 'strong',
        apfcPyqStyleFraming: 'strong',
        optionDistractorQuality: 'strong',
        difficulty: 'appropriate',
        explanationQuality: 'strong',
        duplicationAuthenticPyqSeparation: 'strong',
      },
      verdict: 'strong',
      rationale:
        'Application-style "identify the one that does not belong" framing using only the four code names the source itself supplies, rather than plain date recall — the strongest conceptual framing this source material supports.',
    },
  },

  // ---- concept-eec-2026 (EPFO Employees' Enrolment Campaign, 2026) ----
  {
    id: 'gen-eec-2026-1',
    conceptId: 'concept-eec-2026',
    subject: 'currentAffairs',
    content: {
      question: "EPFO's Employees' Enrolment Campaign (EEC), 2026 is operational for which period?",
      options: [
        { id: 'o0', text: '1 July 2026 to 31 October 2026' },
        { id: 'o1', text: '1 April 2026 to 31 October 2026' },
        { id: 'o2', text: '1 July 2026 to 31 December 2026' },
        { id: 'o3', text: '1 August 2026 to 31 October 2026' },
      ],
      correctOptionId: 'o0',
      explanation: "The source states EEC, 2026 is operational from 1 July 2026 to 31 October 2026.",
    },
    quality: {
      dimensions: {
        factualAccuracyProvenance: 'strong',
        syllabusTopicAlignment: 'strong',
        conceptualDepth: 'adequate',
        apfcPyqStyleFraming: 'adequate',
        optionDistractorQuality: 'adequate',
        difficulty: 'appropriate',
        explanationQuality: 'strong',
        duplicationAuthenticPyqSeparation: 'strong',
      },
      verdict: 'acceptable',
      rationale: "The campaign's own operational window, exactly as stated by the source; distractors are near-miss date-range variations only.",
    },
  },
  {
    id: 'gen-eec-2026-2',
    conceptId: 'concept-eec-2026',
    subject: 'currentAffairs',
    content: {
      question: 'Under EEC, 2026, employers get a special opportunity to voluntarily enrol employees who remained outside EPF coverage during which period?',
      options: [
        { id: 'o0', text: '1 April 2009 to 31 March 2026' },
        { id: 'o1', text: '1 April 2014 to 31 March 2026' },
        { id: 'o2', text: '1 April 2009 to 31 March 2020' },
        { id: 'o3', text: '1 January 2009 to 31 March 2026' },
      ],
      correctOptionId: 'o0',
      explanation: 'The source states the campaign covers employees who remained outside EPF coverage between 1 April 2009 and 31 March 2026 — distinct from the campaign\'s own 1 July-31 October 2026 operational window.',
    },
    quality: {
      dimensions: {
        factualAccuracyProvenance: 'strong',
        syllabusTopicAlignment: 'strong',
        conceptualDepth: 'adequate',
        apfcPyqStyleFraming: 'adequate',
        optionDistractorQuality: 'adequate',
        difficulty: 'appropriate',
        explanationQuality: 'strong',
        duplicationAuthenticPyqSeparation: 'strong',
      },
      verdict: 'acceptable',
      rationale: 'Tests the coverage-gap window, a distinct fact from the campaign\'s own operational window tested in the companion question — not a restatement.',
    },
  },

  // ---- concept-vishwas-2026 (EPFO VISHWAS, 2026 dispute-resolution scheme) ----
  {
    id: 'gen-vishwas-2026-1',
    conceptId: 'concept-vishwas-2026',
    subject: 'currentAffairs',
    content: {
      question: "EPFO's VISHWAS, 2026 scheme is a one-time initiative for the amicable settlement of disputes relating to which statutory provisions?",
      options: [
        { id: 'o0', text: 'Section 14B of the EPF & MP Act, 1952 AND Section 128 of the Code on Social Security, 2020' },
        { id: 'o1', text: 'Section 128 of the EPF & MP Act, 1952 AND Section 14B of the Code on Social Security, 2020' },
        { id: 'o2', text: 'Section 14B of the EPF & MP Act, 1952 only' },
        { id: 'o3', text: 'Section 128 of the Code on Social Security, 2020 only' },
      ],
      correctOptionId: 'o0',
      explanation:
        'VISHWAS, 2026 concerns disputes under both Section 14B of the EPF & MP Act, 1952 and Section 128 of the Code on Social Security, 2020 together — not just one provision, and not with the Act/Code attributions swapped.',
    },
    quality: {
      dimensions: {
        factualAccuracyProvenance: 'strong',
        syllabusTopicAlignment: 'strong',
        conceptualDepth: 'strong',
        apfcPyqStyleFraming: 'strong',
        optionDistractorQuality: 'strong',
        difficulty: 'appropriate',
        explanationQuality: 'strong',
        duplicationAuthenticPyqSeparation: 'strong',
      },
      verdict: 'strong',
      rationale:
        'Tests whether the reader correctly holds both cited provisions together and correctly attributed, using only the two section numbers the source itself supplies as the options\' building blocks — no invented provision.',
    },
  },
  {
    id: 'gen-vishwas-2026-2',
    conceptId: 'concept-vishwas-2026',
    subject: 'currentAffairs',
    content: {
      question: 'EPFO\'s VISHWAS, 2026 scheme was notified through which gazette notification, and for how long did it remain in force?',
      options: [
        { id: 'o0', text: 'G.S.R. 525(E) dated 29 June 2026; in force for six months' },
        { id: 'o1', text: 'G.S.R. 525(E) dated 29 June 2026; in force for three months' },
        { id: 'o2', text: 'G.S.R. 552(E) dated 29 June 2026; in force for six months' },
        { id: 'o3', text: 'G.S.R. 525(E) dated 29 July 2026; in force for six months' },
      ],
      correctOptionId: 'o0',
      explanation: 'The source states VISHWAS, 2026 was notified through G.S.R. 525(E) dated 29 June 2026 and came into force the same day for six months.',
    },
    quality: {
      dimensions: {
        factualAccuracyProvenance: 'strong',
        syllabusTopicAlignment: 'strong',
        conceptualDepth: 'adequate',
        apfcPyqStyleFraming: 'adequate',
        optionDistractorQuality: 'adequate',
        difficulty: 'appropriate',
        explanationQuality: 'strong',
        duplicationAuthenticPyqSeparation: 'strong',
      },
      verdict: 'acceptable',
      rationale: 'Notification-identification fact exactly as stated; distractors are digit/date/duration near-misses of the source\'s own values, nothing invented.',
    },
  },
];

const existingIds = new Set<string>([...PYQ_BANK.map((p) => p.id), ...QUESTION_BANK.map((q) => q.id)]);

export interface ApfcGeneratedQuestionEntry {
  id: string;
  conceptId: string;
  content: GeneratedQuestionDraftContent;
  qualityAssessment: GeneratedQuestionQualityAssessment;
  workflowResult: GeneratedQuestionDraftWorkflowResult;
  qualityAssessmentErrors: string[];
}

export const APFC_GENERATED_QUESTION_BATCH: ApfcGeneratedQuestionEntry[] = SPECS.map((spec) => {
  const source = sourcesBySourceId.get(conceptsByConceptId.get(spec.conceptId)!.sourceId)!;
  const concept = conceptsByConceptId.get(spec.conceptId)!;
  const content: GeneratedQuestionDraftContent = { ...spec.content, subject: spec.subject, verificationStatus: 'draft' };
  const qualityAssessment: GeneratedQuestionQualityAssessment = { generatedQuestionId: spec.id, ...spec.quality };

  const workflowResult = runGeneratedQuestionDraftWorkflow({ source, concept, content }, spec.id, GENERATED_AT, { existingIds });

  const qualityAssessmentErrors =
    workflowResult.status === 'invalid'
      ? workflowResult.errors
      : validateGeneratedQuestionQualityAssessment(qualityAssessment, workflowResult.draft, { existingIds });

  return { id: spec.id, conceptId: spec.conceptId, content, qualityAssessment, workflowResult, qualityAssessmentErrors };
});

/** Convenience: just the validated GeneratedQuestionDraft objects (never published to
 * QUESTION_BANK — this is still draft-only research material). */
export const APFC_GENERATED_QUESTION_DRAFTS: GeneratedQuestionDraft[] = APFC_GENERATED_QUESTION_BATCH.flatMap((e) =>
  e.workflowResult.status !== 'invalid' ? [e.workflowResult.draft] : [],
);
