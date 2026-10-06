// JARVIS Phase 6 — grounded document answering contract.
//
// The mandatory rule this file exists to encode (see this phase's own brief, Part E): a JARVIS
// answer about a document must always let the reader tell apart what the source ACTUALLY says
// from what JARVIS is inferring/synthesising from it, and from anything pulled in from outside
// the document entirely. Never silently blend the three, and never fabricate an answer the source
// doesn't support — "the uploaded source does not establish this" must always be an available,
// first-class response, not a fallback this contract makes awkward to express.
//
// This file defines the CONTRACT only — no retrieval, no AI call. `buildUnsupportedAnswer` is the
// one real piece of logic: a pure, deterministic constructor for the "not established" case, so
// every caller produces that response in exactly the same shape rather than improvising one.
import type { JarvisDocumentCitation } from './types';

export type JarvisGroundingLabel =
  /** Directly supported by the uploaded document(s) — must carry at least one citation. */
  | 'source'
  /** JARVIS's own synthesis/inference drawn from retrieved source material — not a verbatim claim
   * from the document, but still grounded in it. May carry citations to the material it draws on. */
  | 'jarvis_analysis'
  /** External information — only ever present when web research was explicitly requested or
   * enabled; never silently mixed in otherwise. */
  | 'web_research';

export interface JarvisGroundedAnswerSegment {
  label: JarvisGroundingLabel;
  text: string;
  citations?: readonly JarvisDocumentCitation[];
}

export interface JarvisGroundedAnswer {
  segments: readonly JarvisGroundedAnswerSegment[];
  /** True when the uploaded source(s) do not establish an answer to the question asked — when
   * true, `segments` holds only the explanation of that, never a fabricated best-guess. */
  unsupported: boolean;
  unsupportedReason?: string;
}

/**
 * The one correct way to construct the "source does not establish this" response (Part E's
 * mandatory grounding rule) — every caller that reaches this conclusion must go through this
 * function, so the shape is always identical and `unsupported` is never left `false` by mistake
 * alongside an apologetic-sounding segment.
 */
export function buildUnsupportedAnswer(reason: string): JarvisGroundedAnswer {
  return {
    segments: [{ label: 'jarvis_analysis', text: `The uploaded source does not establish this. ${reason}`.trim() }],
    unsupported: true,
    unsupportedReason: reason,
  };
}

/** True only when every 'source'-labelled segment actually carries at least one citation — a
 * grounded answer claiming direct source support without pointing at WHERE is treated as
 * malformed, not merely unfortunate. 'jarvis_analysis'/'web_research' segments are not required to
 * carry one (a synthesis may reasonably draw on several already-cited 'source' segments instead),
 * but when a citation IS present on any segment, it must be a well-formed, non-empty reference. */
export function isWellGroundedAnswer(answer: JarvisGroundedAnswer): boolean {
  if (answer.unsupported) return true;
  return answer.segments.every((segment) => {
    if (segment.label === 'source' && (!segment.citations || segment.citations.length === 0)) return false;
    return (segment.citations ?? []).every((citation) => citation.documentId.length > 0 && citation.chunkId.length > 0);
  });
}
