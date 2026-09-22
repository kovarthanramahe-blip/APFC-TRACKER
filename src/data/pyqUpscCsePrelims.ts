import { UPSC_CSE_PRELIMS_SYLLABUS } from './upscCsePrelimsSyllabus';
import { UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50 } from './upscCsePrelimsPyqBatch2026Q1Q50Raw';
import { UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q51_Q100 } from './upscCsePrelimsPyqBatch2026Q51Q100Raw';
import {
  buildUpscCsePrelimsBatchRecords,
  mergeUpscCsePrelimsPyqRecords,
  summarizeUpscCsePrelimsPyqBatch,
  type UpscCsePrelimsBatchPyq,
  type UpscCsePrelimsPyqBatchValidationSummary,
} from '../lib/upscCsePrelimsPyqBatchImport';

// UPSC CSE Prelims PYQ Bank — the ONE destination for pre-structured, already-classified UPSC CSE
// Prelims PYQ batches (see lib/upscCsePrelimsPyqBatchImport.ts's own header for why this is a
// separate type/array from data/pyqUpscCse.ts's UPSC_CSE_PYQ_BANK: PYQ mandates a correctOptionId,
// which a batch with no supplied answer key can never honestly satisfy). Belongs exclusively to the
// upsc_cse workspace by construction — no per-record workspaceId field, same convention as every
// other UPSC CSE data file in this app.
//
// Each batch is VALIDATEd + RESOLVEd (against data/upscCsePrelimsSyllabus.ts's real, stable
// microsyllabus ids — never invented, never a new node) via buildUpscCsePrelimsBatchRecords, then
// folded into the bank via mergeUpscCsePrelimsPyqRecords, which dedupes by each record's own stable
// id (derived from year+paper+questionNumber) — so re-running this exact same build twice, or a
// future batch that happens to overlap an already-imported one, can never produce duplicate
// records. Adding a further batch later means adding one more buildUpscCsePrelimsBatchRecords +
// mergeUpscCsePrelimsPyqRecords step in this same chain, never editing an already-merged batch's
// own records.
//
// Q1-50 and Q51-100 are two separately-prepared batches of the SAME 2026 GS Paper I paper (Q51-100
// arrived with no subject/microsyllabusHint at all — its own preparation step didn't classify them
// — so every one of those 50 is necessarily needs_review; see this module's own per-batch summary
// exports below). Chaining their merges (Q1-50 into [], then Q51-100 into that result) produces the
// single combined Q1-100 UPSC_CSE_PRELIMS_PYQ_BANK below — question numbers never collide between
// the two batches, so nothing from either is ever treated as a duplicate of the other.

const batch2026Q1Q50Conversion = buildUpscCsePrelimsBatchRecords(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50, UPSC_CSE_PRELIMS_SYLLABUS);
const batch2026Q1Q50Merge = mergeUpscCsePrelimsPyqRecords([], batch2026Q1Q50Conversion.records);

const batch2026Q51Q100Conversion = buildUpscCsePrelimsBatchRecords(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q51_Q100, UPSC_CSE_PRELIMS_SYLLABUS);
const batch2026Q51Q100Merge = mergeUpscCsePrelimsPyqRecords(batch2026Q1Q50Merge.merged, batch2026Q51Q100Conversion.records);

/** The combined UPSC CSE Prelims 2026 GS Paper I dataset — Q1-100, from both batches merged
 * together in one chain (see this module's own header). */
export const UPSC_CSE_PRELIMS_PYQ_BANK: UpscCsePrelimsBatchPyq[] = batch2026Q51Q100Merge.merged;

/** The validation summary for the 2026 Q1-50 batch specifically — produced by the same pure
 * pipeline the data above was built through, not recomputed by hand, so it can never drift from
 * what was actually persisted. Exported for direct testing/reporting, not read by any UI this
 * stage (see this task's own "no new importer UI" instruction). */
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
