import { UPSC_CSE_PRELIMS_SYLLABUS } from './upscCsePrelimsSyllabus';
import { UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50 } from './upscCsePrelimsPyqBatch2026Q1Q50Raw';
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
// mergeUpscCsePrelimsPyqRecords step here, never editing an already-merged batch's own records.

const batch2026Q1Q50Conversion = buildUpscCsePrelimsBatchRecords(UPSC_CSE_PRELIMS_PYQ_BATCH_2026_Q1_Q50, UPSC_CSE_PRELIMS_SYLLABUS);
const batch2026Q1Q50Merge = mergeUpscCsePrelimsPyqRecords([], batch2026Q1Q50Conversion.records);

export const UPSC_CSE_PRELIMS_PYQ_BANK: UpscCsePrelimsBatchPyq[] = batch2026Q1Q50Merge.merged;

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
