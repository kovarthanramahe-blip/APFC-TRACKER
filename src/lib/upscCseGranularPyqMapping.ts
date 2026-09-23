// UPSC CSE 2026 PYQ -> Granular Node mapping — a hand-curated, deliberately SHORT lookup, never a
// bulk auto-resolver. Purely additive: it does not touch data/pyqUpscCsePrelims.ts, the raw batch
// files, or the Set-A answer key in any way — it only joins an EXISTING PYQ's stable `id` (see
// data/pyqUpscCsePrelims.ts's UPSC_CSE_PRELIMS_PYQ_BANK) to a granular node id (see
// lib/upscCseGranularSyllabus.ts / data/upscCseGranularTopics.ts) by reference.
//
// Every entry here was decided by reading the actual question text against the granular topics
// this stage authored (see data/upscCseGranularTopics.ts), keeping ONLY the ones a specific study
// unit can honestly claim:
//
//  - upsc-cse-pyq-2026-gs-paper-i-34 ("...Peninsular Block of India? 1. Submergence of parts of the
//    western coast... 2. Presence of residual mountain ranges... 3. Deep, V-shaped river valleys...")
//    is squarely about India's physiographic divisions — mapped to the "Physiography of India"
//    TOPIC under Physical Geography (prelims-gs1-geography-physical). No single subtopic/micro-topic
//    below it (Himalayan system, plains/plateau) is a closer, more specific fit than the topic
//    itself, so this is mapped at the topic level rather than forcing a false micro-topic match.
//
// Every OTHER question under a granularized microsyllabus item (e.g.
// upsc-cse-pyq-2026-gs-paper-i-31, about a volcano in Ecuador — not an India-specific physiography
// question, so it does not reliably fit either "Physiography of India" or "Climatology") is
// deliberately left unmapped here: absence from this lookup means "not yet classified at the
// granular level", the same honest default every other unmapped PYQ already uses at the
// microsyllabus level (see lib/upscCsePrelimsPyqFilters.ts's UNMAPPED_MICROSYLLABUS convention).
export const UPSC_CSE_GRANULAR_PYQ_MAPPING: Readonly<Record<string, string>> = {
  'upsc-cse-pyq-2026-gs-paper-i-34': 'prelims-gs1-geography-physical__t-physiography',
};

export function granularNodeIdForPyq(pyqId: string): string | undefined {
  return UPSC_CSE_GRANULAR_PYQ_MAPPING[pyqId];
}
