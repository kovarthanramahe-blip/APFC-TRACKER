import { UPSC_CSE_PRELIMS_SYLLABUS } from './upscCsePrelimsSyllabus';
import { UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50 } from './upscCsePrelimsPyqBatch2026Q1Q50Raw';
import { UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q51_Q100 } from './upscCsePrelimsPyqBatch2026Q51Q100Raw';
import { UPSC_CSE_PRELIMS_ANSWER_KEY_2026_SET_A } from './upscCsePrelimsAnswerKey2026SetARaw';
import { UPSC_CSE_PRELIMS_PYQ_BATCH_2025_Q1_Q100 } from './upscCsePrelimsPyqBatch2025Q1Q100Raw';
import { UPSC_CSE_PRELIMS_ANSWER_KEY_2025_SET_A } from './upscCsePrelimsAnswerKey2025SetARaw';
import { UPSC_CSE_PRELIMS_PYQ_BATCH_2024_Q1_Q100 } from './upscCsePrelimsPyqBatch2024Q1Q100Raw';
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
// text, options, or provenance on any record.
//
// UPSC CSE Prelims 2025, GS Paper I, Set A (Q1-100) is a separate, later-added exam sitting, chained
// onto the already-answer-keyed 2026 bank via the exact same MERGE + ATTACH steps — appended, never
// replacing or editing anything from the 2026 batches. Its own question batch and answer key were
// pasted directly by the user into this Claude Code session (see
// data/upscCsePrelimsPyqBatch2025Q1Q100Raw.ts / data/upscCsePrelimsAnswerKey2025SetARaw.ts). Its 100
// records originally carried no subject/microsyllabusHint at all; a later classification pass (see
// the 2025/2026 Q51-100 SUMMARY exports below) populated subject/microsyllabusHint directly on that
// batch's own raw file, against the existing UPSC_CSE_PRELIMS_SYLLABUS taxonomy — 9 of its 100
// records are pure finance/fiscal-arithmetic content with no defensible microsyllabus match, so
// those keep subject "Economic & Social Development" with microsyllabusHint left unresolved
// (needs_review), never forced into a misleading item. Only the Set A answer key (the user also
// supplied SET B/C/D answer-key columns, but not those sets' own question/option text, so those
// columns are never attached — attaching them would require guessing which option each letter
// refers to).
//
// UPSC CSE Prelims 2024, GS Paper I (Q1-100) is a third, later-added exam sitting, chained onto the
// already-merged 2025+2026 bank the exact same way (see data/upscCsePrelimsPyqBatch2024Q1Q100Raw.ts
// for its own full provenance/classification notes). No answer key is attached for 2024: only a
// screenshot covering Q1-15 of its 100-entry key was supplied (page 1 of a 4-page key), and
// attaching a 15%-complete key would leave the batch inconsistently keyed — so correctOptionId stays
// null throughout this batch, same as every batch looked like on its own first import.
//
// UPSC_CSE_PRELIMS_PYQ_BANK below is always the FINAL, fully merged state — there is no separate
// "before 2024" or "2026-only" export, since nothing outside this file ever needs that intermediate
// state.

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

/** How the 2026 Set A attachment itself went — attached count and any skipped entries (expected to
 * be empty for this exact 1:1 Q1-100 answer key). Exported for direct testing/reporting, not read by
 * any UI this stage (see this task's own "no new importer UI" instruction). */
export const UPSC_CSE_PRELIMS_ANSWER_KEY_2026_SET_A_ATTACH_RESULT: AttachAnswerKeyResult = answerKeyAttachResult;

const batch2025Q1Q100Conversion = buildUpscCsePrelimsBatchRecords(UPSC_CSE_PRELIMS_PYQ_BATCH_2025_Q1_Q100, UPSC_CSE_PRELIMS_SYLLABUS);
const batch2025Q1Q100Merge = mergeUpscCsePrelimsPyqRecords(answerKeyAttachResult.updated, batch2025Q1Q100Conversion.records);

/** Structural validation of the 2025 Set A answer-key file itself — same checks as the 2026 one
 * above, against the 2025 batch's own Q1-Q100 range. Expected to be empty. */
export const UPSC_CSE_PRELIMS_ANSWER_KEY_2025_SET_A_STRUCTURE_ISSUES: AnswerKeyStructureIssue[] = validateAnswerKeyStructure(
  UPSC_CSE_PRELIMS_ANSWER_KEY_2025_SET_A,
  { min: 1, max: 100 },
);

const answerKeyAttachResult2025: AttachAnswerKeyResult = attachUpscCsePrelimsAnswerKey(batch2025Q1Q100Merge.merged, UPSC_CSE_PRELIMS_ANSWER_KEY_2025_SET_A);

const batch2024Q1Q100Conversion = buildUpscCsePrelimsBatchRecords(UPSC_CSE_PRELIMS_PYQ_BATCH_2024_Q1_Q100, UPSC_CSE_PRELIMS_SYLLABUS);
const batch2024Q1Q100Merge = mergeUpscCsePrelimsPyqRecords(answerKeyAttachResult2025.updated, batch2024Q1Q100Conversion.records);

/** The combined UPSC CSE Prelims dataset — every question batch merged (2026 Q1-100, then 2025
 * Q1-100, then 2024 Q1-100) and each earlier batch's own Set A answer key attached (see this
 * module's own header). No answer key is attached for 2024 (see header). */
export const UPSC_CSE_PRELIMS_PYQ_BANK: UpscCsePrelimsBatchPyq[] = batch2024Q1Q100Merge.merged;

/** How the 2025 Set A attachment itself went — attached count and any skipped entries (expected to
 * be empty for this exact 1:1 Q1-100 answer key). Exported for direct testing/reporting, not read by
 * any UI this stage. */
export const UPSC_CSE_PRELIMS_ANSWER_KEY_2025_SET_A_ATTACH_RESULT: AttachAnswerKeyResult = answerKeyAttachResult2025;

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

/** Same as above, for the 2025 Q1-100 batch — `duplicates` here reflects merging THIS batch onto the
 * already-populated (2026, 100-record) bank. */
export const UPSC_CSE_PRELIMS_PYQ_BATCH_2025_Q1_Q100_SUMMARY: UpscCsePrelimsPyqBatchValidationSummary = summarizeUpscCsePrelimsPyqBatch(
  UPSC_CSE_PRELIMS_PYQ_BATCH_2025_Q1_Q100,
  batch2025Q1Q100Conversion,
  batch2025Q1Q100Merge,
  'data/pyqUpscCsePrelims.ts :: UPSC_CSE_PRELIMS_PYQ_BANK',
);

/** Same as above, for the 2024 Q1-100 batch — `duplicates` here reflects merging THIS batch onto the
 * already-populated (2026+2025, 200-record) bank. */
export const UPSC_CSE_PRELIMS_PYQ_BATCH_2024_Q1_Q100_SUMMARY: UpscCsePrelimsPyqBatchValidationSummary = summarizeUpscCsePrelimsPyqBatch(
  UPSC_CSE_PRELIMS_PYQ_BATCH_2024_Q1_Q100,
  batch2024Q1Q100Conversion,
  batch2024Q1Q100Merge,
  'data/pyqUpscCsePrelims.ts :: UPSC_CSE_PRELIMS_PYQ_BANK',
);
