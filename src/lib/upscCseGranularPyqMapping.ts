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
// P1.8 — seven further entries, each independently verified against its own full question/option
// text (P1.7's read-only audit; re-verified against the live bank immediately before this edit):
//  - upsc-cse-pyq-2026-gs-paper-i-5 ("Among the four main forms of existence of life recognized in
//    Jainism...") is exclusively Jain doctrine — mapped to "Buddhism & Jainism".
//  - upsc-cse-pyq-2026-gs-paper-i-21 (India's LT-LEDS net-zero-2070 strategy, BUR-4 GHG reporting)
//    cites India-specific UNFCCC policy instruments, not generic climate science — mapped to
//    "India's Climate Policy", distinct from #23 below under the SAME microsyllabus item.
//  - upsc-cse-pyq-2026-gs-paper-i-23 (mangrove ecosystems' bio-shield/tidal-energy rationale) is a
//    pure ecological-mechanism question with no policy instrument named — mapped to "Climate Change
//    Science", not "India's Climate Policy" (see #21 above for the contrast).
//  - upsc-cse-pyq-2026-gs-paper-i-27 (Amur Falcons at Doyang Lake — correct statement is literally
//    about "local conservation efforts") — mapped to "Wildlife Conservation".
//  - upsc-cse-pyq-2026-gs-paper-i-32 (Madhav National Park — Tiger Reserve/Ramsar-site facts, no
//    conservation-effort narrative) — mapped to "Protected Areas", distinct from #27 above (same
//    microsyllabus item, different granular topic, by design: a named-park-facts question is not a
//    conservation-effort question).
//  - upsc-cse-pyq-2026-gs-paper-i-54 (Article 13's definition of "law" — ordinances/custom/usage) is
//    about interpreting a substantive constitutional provision, not the Constitution's drafting/
//    adoption history — mapped to "Salient Features & Basic Structure".
//  - upsc-cse-pyq-2026-gs-paper-i-74 (Revamped RGSA) explicitly targets Panchayati Raj Institutions'
//    governance capacity — mapped to "Panchayati Raj Structure", distinct from the amendment-
//    provisions/urban-body/decentralization topics in the same microsyllabus item.
//
// Every OTHER question under a granularized microsyllabus item (e.g.
// upsc-cse-pyq-2026-gs-paper-i-31, about a volcano in Ecuador — not an India-specific physiography
// question, so it does not reliably fit either "Physiography of India" or "Climatology";
// upsc-cse-pyq-2026-gs-paper-i-22, Western Hoolock Gibbons — mostly species biology/locomotion
// facts, not conservation effort/status, so it does not reliably fit "Biodiversity Hotspots" /
// "Protected Areas" / "Wildlife Conservation"; upsc-cse-pyq-2026-gs-paper-i-55, Constitution-naming/
// commencement-date trivia — a genuine toss-up between "Historical Underpinnings & Evolution" and
// "Salient Features & Basic Structure" that fits neither cleanly) is deliberately left unmapped
// here: absence from this lookup means "not yet classified at the granular level", the same honest
// default every other unmapped PYQ already uses at the microsyllabus level (see
// lib/upscCsePrelimsPyqFilters.ts's UNMAPPED_MICROSYLLABUS convention).
export const UPSC_CSE_GRANULAR_PYQ_MAPPING: Readonly<Record<string, string>> = {
  'upsc-cse-pyq-2026-gs-paper-i-34': 'prelims-gs1-geography-physical__t-physiography',
  'upsc-cse-pyq-2026-gs-paper-i-5': 'prelims-gs1-history-ancient__t-buddhism-jainism',
  'upsc-cse-pyq-2026-gs-paper-i-21': 'prelims-gs1-environment-ecology-climate-change__t-india-s-climate-policy',
  'upsc-cse-pyq-2026-gs-paper-i-23': 'prelims-gs1-environment-ecology-climate-change__t-climate-change-science',
  'upsc-cse-pyq-2026-gs-paper-i-27': 'prelims-gs1-environment-ecology-biodiversity__t-wildlife-conservation',
  'upsc-cse-pyq-2026-gs-paper-i-32': 'prelims-gs1-environment-ecology-biodiversity__t-protected-areas',
  'upsc-cse-pyq-2026-gs-paper-i-54': 'prelims-gs1-polity-constitution__t-salient-features',
  'upsc-cse-pyq-2026-gs-paper-i-74': 'prelims-gs1-polity-panchayati-raj__t-panchayati-raj-structure',
};

export function granularNodeIdForPyq(pyqId: string): string | undefined {
  return UPSC_CSE_GRANULAR_PYQ_MAPPING[pyqId];
}

// P2.0 — a granular node id -> curated PYQ count lookup, derived purely from the mapping object
// above (never a hardcoded number): each key of `mapping` is a distinct PYQ id by construction (it
// is a plain object), so every mapped question is counted exactly once, under whichever granular
// node its own entry points to. Defaults to the real curated mapping but accepts an override so a
// test can exercise the empty-mapping case without reaching for a cast against the real, non-empty
// production constant. Consumed by pages/UpscCseSyllabus.tsx to show a "N curated PYQs" indicator on
// a granular row — deliberately separate from lib/upscCsePrelimsPyqFilters.ts's
// getMicrosyllabusCounts, which counts ALL PYQs under a microsyllabus item regardless of whether
// any of them have a granular-level mapping; the two must never be conflated.
export function countCuratedPyqsByGranularNode(mapping: Readonly<Record<string, string>> = UPSC_CSE_GRANULAR_PYQ_MAPPING): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const nodeId of Object.values(mapping)) {
    counts[nodeId] = (counts[nodeId] ?? 0) + 1;
  }
  return counts;
}
