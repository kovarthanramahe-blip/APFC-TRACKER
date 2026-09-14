// Unified Question Architecture, Stage 6K — the first real, source-backed APFC research batch.
// This is SOURCE RESEARCH ONLY: no question content, no answer options, no explanations beyond
// factualBasis, and no addition to QUESTION_BANK or PYQ_BANK. Every source and factualBasis below
// was independently verified externally by the user (this session's own network access to
// government domains is blocked by the environment's egress policy, confirmed via WebFetch and raw
// curl) and is reproduced here without alteration beyond light whitespace formatting — no fact,
// date, URL, or authority name in this file was inferred, guessed, or invented.
//
// Fed through generatedQuestionResearchBatch.ts's validateResearchBatch (Stage 6J), which itself
// reuses generatedQuestionSource.ts (Stage 6E) and generatedQuestionResearch.ts (Stage 6I) — no
// validation rule is duplicated here.
import { SYLLABUS } from '../data/syllabus';
import type { AuthoritativeSourceRecord } from './generatedQuestionSource';
import type { ConceptExtractionInput } from './generatedQuestionResearch';
import { validateResearchBatch, type ResearchBatch, type ResearchBatchValidationResult } from './generatedQuestionResearchBatch';

/** Looks up a real syllabus topicId by its exact subject id and topic title, rather than
 * hardcoding a generated id string (topicIds are assigned by position via an incrementing counter
 * in syllabus.ts, so a literal like "ll-93" would silently point at the wrong topic if syllabus.ts
 * is ever reordered). Throws — loudly, at import time — if the title no longer matches, rather than
 * risk this batch silently mis-filing a concept under the wrong topic. */
function requireTopicId(subjectId: string, topicTitle: string): string {
  const topic = SYLLABUS.find((s) => s.id === subjectId)?.topics.find((t) => t.title === topicTitle);
  if (!topic) {
    throw new Error(`apfcSourceResearchBatch: no syllabus topic titled "${topicTitle}" found under subject "${subjectId}".`);
  }
  return topic.id;
}

const CODE_ON_SOCIAL_SECURITY_TOPIC_ID = requireTopicId('labour-law', 'Code on Social Security, 2020');
const EPFO_CURRENT_DEVELOPMENTS_TOPIC_ID = requireTopicId('current-affairs', 'EPFO / Labour Ministry Current Developments');

// ---------------------------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------------------------

const SOURCE_CODE_ON_SOCIAL_SECURITY_2020: AuthoritativeSourceRecord = {
  sourceId: 'src-css-2020-india-code',
  authority: 'Ministry of Law and Justice / India Code',
  title: 'The Code on Social Security, 2020',
  reference: 'https://www.indiacode.nic.in/handle/123456789/16823?view_type=browse',
  sourceType: 'india_code',
  publishedAt: '2020-09-28',
};

const SOURCE_FOUR_LABOUR_CODES_EFFECTIVE: AuthoritativeSourceRecord = {
  sourceId: 'src-four-labour-codes-effective-pib',
  authority: 'Ministry of Labour & Employment / Press Information Bureau',
  title: 'Government Makes the Four Labour Codes effective to Simplify and Streamline Labour Laws',
  reference: 'https://www.pib.gov.in/PressReleasePage.aspx?PRID=2194018&lang=1&reg=1',
  sourceType: 'pib',
  publishedAt: '2025-11-25',
};

const SOURCE_EEC_2026: AuthoritativeSourceRecord = {
  sourceId: 'src-eec-2026-pib',
  authority: "Ministry of Labour & Employment / Employees' Provident Fund Organisation / Press Information Bureau",
  title: "Employees' Enrolment Campaign (EEC), 2026",
  reference: 'https://www.pib.gov.in/PressReleasePage.aspx?PRID=2299045&lang=2&reg=48',
  sourceType: 'pib',
  publishedAt: '2026-08-13',
};

const SOURCE_VISHWAS_2026: AuthoritativeSourceRecord = {
  sourceId: 'src-vishwas-2026-pib',
  authority: "Ministry of Labour & Employment / Employees' Provident Fund Organisation / Press Information Bureau",
  title: 'EPFO Launches "VISHWAS, 2026" for Amicable Settlement of Damages/Penalty-Related Disputes',
  reference: 'https://www.pib.gov.in/PressReleasePage.aspx?PRID=2285666&lang=1&reg=6',
  sourceType: 'pib',
  publishedAt: '2026-07-17',
};

export const APFC_RESEARCH_BATCH_SOURCES: AuthoritativeSourceRecord[] = [
  SOURCE_CODE_ON_SOCIAL_SECURITY_2020,
  SOURCE_FOUR_LABOUR_CODES_EFFECTIVE,
  SOURCE_EEC_2026,
  SOURCE_VISHWAS_2026,
];

// ---------------------------------------------------------------------------------------------
// Concepts — one per source. No PYQ calibration ids are included: PYQ_BANK was searched for
// "Code on Social Security", "Code on Wages", "Industrial Relations Code", "labour code",
// "EPF & MP Act", "Section 14B", "EDLI", and "EPS-95", and the existing matches all test different,
// unrelated specifics (co-operative society employee thresholds, exempted-establishment account
// thresholds, a scope-of-schemes comparison) — none is genuinely calibration-relevant to these four
// 2025/2026 developments, so none is cited.
// ---------------------------------------------------------------------------------------------

const CONCEPT_CODE_ON_SOCIAL_SECURITY_2020: ConceptExtractionInput = {
  conceptId: 'concept-css-2020-act-details',
  sourceId: SOURCE_CODE_ON_SOCIAL_SECURITY_2020.sourceId,
  topicId: CODE_ON_SOCIAL_SECURITY_TOPIC_ID,
  concept: 'Code on Social Security, 2020 — Act number, enactment date & Chapter III',
  factualBasis:
    'India Code identifies the Code on Social Security, 2020 as Act Number 36 of 2020, with enactment date 28 September 2020. ' +
    'Its stated long title concerns amending and consolidating laws relating to social security. India Code lists Chapter III as "Employees’ Provident Fund".',
};

const CONCEPT_FOUR_LABOUR_CODES_EFFECTIVE: ConceptExtractionInput = {
  conceptId: 'concept-four-labour-codes-effective-2025-11-21',
  sourceId: SOURCE_FOUR_LABOUR_CODES_EFFECTIVE.sourceId,
  topicId: EPFO_CURRENT_DEVELOPMENTS_TOPIC_ID,
  concept: 'Commencement of the four Labour Codes (21 November 2025)',
  factualBasis:
    'The Government announced that the four Labour Codes — Code on Wages, 2019; Industrial Relations Code, 2020; Code on Social Security, 2020; ' +
    'and Occupational Safety, Health and Working Conditions Code, 2020 — were made effective from 21 November 2025, rationalising 29 existing labour laws.',
};

const CONCEPT_EEC_2026: ConceptExtractionInput = {
  conceptId: 'concept-eec-2026',
  sourceId: SOURCE_EEC_2026.sourceId,
  topicId: EPFO_CURRENT_DEVELOPMENTS_TOPIC_ID,
  concept: "EPFO Employees' Enrolment Campaign (EEC), 2026",
  factualBasis:
    "EPFO's Employees' Enrolment Campaign (EEC), 2026 is operational from 1 July 2026 to 31 October 2026. " +
    'It provides a special opportunity for employers to voluntarily enrol eligible employees who remained outside EPF coverage between 1 April 2009 and 31 March 2026. ' +
    'The campaign applies to establishments covered or coverable under the EPF & MP Act, 1952 / Code on Social Security.',
};

const CONCEPT_VISHWAS_2026: ConceptExtractionInput = {
  conceptId: 'concept-vishwas-2026',
  sourceId: SOURCE_VISHWAS_2026.sourceId,
  topicId: EPFO_CURRENT_DEVELOPMENTS_TOPIC_ID,
  concept: 'EPFO VISHWAS, 2026 — dispute-resolution scheme (Section 14B / Section 128)',
  factualBasis:
    'EPFO launched VISHWAS, 2026 as a one-time dispute-resolution initiative concerning levy of damages/penalty under Section 14B of the Employees’ Provident Funds ' +
    'and Miscellaneous Provisions Act, 1952 and Section 128 of the Code on Social Security, 2020. The scheme was notified through G.S.R. 525(E) dated 29 June 2026 ' +
    'and came into force on 29 June 2026 for six months.',
};

export const APFC_RESEARCH_BATCH_CONCEPTS: ConceptExtractionInput[] = [
  CONCEPT_CODE_ON_SOCIAL_SECURITY_2020,
  CONCEPT_FOUR_LABOUR_CODES_EFFECTIVE,
  CONCEPT_EEC_2026,
  CONCEPT_VISHWAS_2026,
];

// ---------------------------------------------------------------------------------------------
// Batch
// ---------------------------------------------------------------------------------------------

export const APFC_RESEARCH_BATCH: ResearchBatch = {
  batchId: 'apfc-research-batch-2026-09-labour-codes',
  researchedAt: '2026-09-14T00:00:00.000Z',
  sources: APFC_RESEARCH_BATCH_SOURCES,
  conceptInputs: APFC_RESEARCH_BATCH_CONCEPTS,
};

/** Computed once at module load so any consumer (including this file's own test) can inspect the
 * validation outcome without re-running it — the source of truth is still APFC_RESEARCH_BATCH
 * itself, this is purely a convenience. */
export const APFC_RESEARCH_BATCH_RESULT: ResearchBatchValidationResult = validateResearchBatch(APFC_RESEARCH_BATCH);
