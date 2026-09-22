import { UPSC_CSE_PRELIMS_SYLLABUS } from './upscCsePrelimsSyllabus';
import { UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50 } from './upscCsePrelimsPyqBatch2026Q1Q50Raw';
import { UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q51_Q100 } from './upscCsePrelimsPyqBatch2026Q51Q100Raw';
import { UPSC_CSE_PRELIMS_ANSWER_KEY_2026_SET_A } from './upscCsePrelimsAnswerKey2026SetARaw';
import {
  buildUpscCsePrelimsBatchRecords,
  mergeUpscCsePrelimsPyqRecords,
  summarizeUpscCsePrelimsPyqBatch,
  type UpscCsePrelimsBatchPyq,
  type UpscCsePrelimsPyqBatchValidationSummary,
} from '../lib/upscCsePrelimsPyqBatchImport';
import {
  validateAnswerKeyStructure,
  attachUpscCsePrelimsAnswerKey,
  type AnswerKeyStructureIssue,
  type AttachAnswerKeyResult,
} from '../lib/upscCsePrelimsAnswerKeyAttach';

// UPSC CSE Prelims PYQ Bank — the ONE destination for pre-structured, already-classified UPSC CSE
// Prelims PYQ batches (see lib/upscCsePrelimsPyqBatchImport.ts's own header for why this is a
// separate type/array from data/pyqUpscCse.ts's UPSC_CSE_PYQ_BANK: PYQ mandates a correctOptionId,
// which a batch with no supplied answer key can never honestly satisfy). Belongs exclusively to the
// upsc_cse workspace by construction — no per-record workspaceId field, same convention as every
// other UPSC CSE data file in this app.
//
// Each question batch is VALIDATEd + RESOLVEd (against data/upscCsePrelimsSyllabus.ts's real,
// stable microsyllabus ids — never invented, never a new node) via buildUpscCsePrelimsBatchRecords,
// then folded into the bank via mergeUpscCsePrelimsPyqRecords, which dedupes by each record's own
// stable id (derived from year+paper+questionNumber) — so re-running this exact same build twice,
// or a future batch that happens to overlap an already-imported one, can never produce duplicate
// records. Adding a further QUESTION batch later means adding one more
// buildUpscCsePrelimsBatchRecords + mergeUpscCsePrelimsPyqRecords step in this same chain, never
// editing an already-merged batch's own records.
//
// Q1-50 and Q51-100 are two separately-prepared batches of the SAME 2026 GS Paper I paper (Q51-100
// arrived with no subject/microsyllabusHint at all — its own preparation step didn't classify them
// — so every one of those 50 is necessarily needs_review; see this module's own per-batch summary
// exports below). Chaining their merges (Q1-50 into [], then Q51-100 into that result) produces the
// combined Q1-100 question set — question numbers never collide between the two batches, so nothing
// from either is ever treated as a duplicate of the other.
//
// An ANSWER KEY (Set A) is then ATTACHed on top via attachUpscCsePrelimsAnswerKey — a separate,
// later step that only ever sets correctOptionId/answerKeySet on records the key actually covers
// with a letter matching one of that record's own real options (see
// lib/upscCsePrelimsAnswerKeyAttach.ts). It never touches mappingStatus, microsyllabusId, question
// text, options, or provenance on any record. UPSC_CSE_PRELIMS_PYQ_BANK below is always the FINAL,
// answer-key-attached state — there is no separate "before answers" export, since nothing outside
// this file ever needs that intermediate state.

const batch2026Q1Q50Conversion = buildUpscCsePrelimsBatchRecords(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50, UPSC_CSE_PRELIMS_SYLLABUS);
const batch2026Q1Q50Merge = mergeUpscCsePrelimsPyqRecords([], batch2026Q1Q50Conversion.records);

const batch2026Q51Q100Conversion = buildUpscCsePrelimsBatchRecords(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q51_Q100, UPSC_CSE_PRELIMS_SYLLABUS);
const batch2026Q51Q100Merge = mergeUpscCsePrelimsPyqRecords(batch2026Q1Q50Merge.merged, batch2026Q51Q100Conversion.records);

/** Structural validation of the Set A answer-key file itself (entry count, question-number
 * range/uniqueness, option-letter validity) — independent of the question bank. Expected to be
 * empty; asserted so by a test, never thrown on here (a data file must never throw at import
 * time). */
export const UPSC_CSE_PRELIMS_ANSWER_KEY_2026_SET_A_STRUCTURE_ISSUES: AnswerKeyStructureIssue[] = validateAnswerKeyStructure(
  UPSC_CSE_PRELIMS_ANSWER_KEY_2026_SET_A,
  { min: 1, max: 100 },
);

const answerKeyAttachResult: AttachAnswerKeyResult = attachUpscCsePrelimsAnswerKey(batch2026Q51Q100Merge.merged, UPSC_CSE_PRELIMS_ANSWER_KEY_2026_SET_A);

/** The combined UPSC CSE Prelims 2026 GS Paper I dataset — Q1-100, both question batches merged and
 * Set A's answer key attached (see this module's own header). */
export const UPSC_CSE_PRELIMS_PYQ_BANK: UpscCsePrelimsBatchPyq[] = answerKeyAttachResult.updated;

/** How the Set A attachment itself went — attached count and any skipped entries (expected to be
 * empty for this exact 1:1 Q1-100 answer key). Exported for direct testing/reporting, not read by
 * any UI this stage (see this task's own "no new importer UI" instruction). */
export const UPSC_CSE_PRELIMS_ANSWER_KEY_2026_SET_A_ATTACH_RESULT: AttachAnswerKeyResult = answerKeyAttachResult;

/** The validation summary for the 2026 Q1-50 batch specifically — produced by the same pure
 * pipeline the data above was built through, not recomputed by hand, so it can never drift from
 * what was actually persisted. Exported for direct testing/reporting, not read by any UI this
 * stage (see this task's own "no new importer UI" instruction). Reflects mapping status only —
 * unaffected by the later answer-key attach step. */
export const UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50_SUMMARY: UpscCsePrelimsPyqBatchValidationSummary = summarizeUpscCsePrelimsPyqBatch(
  UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50,
  batch2026Q1Q50Conversion,
  batch2026Q1Q50Merge,
  'data/pyqUpscCsePrelims.ts :: UPSC_CSE_PRELIMS_PYQ_BANK',
);

/** Same as above, for the 2026 Q51-100 batch — `duplicates` here reflects merging THIS batch onto
 * the already-populated (Q1-50) bank, so a genuine re-run of just this batch is still caught. */
export const UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q51_Q100_SUMMARY: UpscCsePrelimsPyqBatchValidationSummary = summarizeUpscCsePrelimsPyqBatch(
  UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q51_Q100,
  batch2026Q51Q100Conversion,
  batch2026Q51Q100Merge,
  'data/pyqUpscCsePrelims.ts :: UPSC_CSE_PRELIMS_PYQ_BANK',
);
