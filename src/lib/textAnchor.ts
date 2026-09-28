// Premium Study Reader — Durable Text-Anchor System (Phase B). A TextAnchor identifies a piece of
// SOURCE TEXT by quote + surrounding context, never by a live DOM Range (a Range cannot be
// persisted — it is destroyed the instant the document re-renders) and never by raw pixel
// coordinates (which the continuous-scroll reader cannot promise to keep stable). This is the
// anchor type every text-anchored annotation (textHighlight/underline/strikethrough/textNote —
// see lib/annotations.ts) stores.
//
// Resolution runs a fixed, explicit hierarchy against the reading container's CURRENT textContent
// at read time, and is designed to fail closed: it either resolves to a real, confirmed location,
// or reports 'unresolved' — it never silently attaches to the wrong text.
//
//   1. EXACT offset match       — the stored `start`/`end` still points at exactly `quote`. True
//                                  whenever the underlying text hasn't changed since the anchor
//                                  was made (the overwhelmingly common case).
//   2. prefix+quote+suffix      — the quote's own immediate surroundings still appear together
//                                  somewhere in the text, even if its offset moved (content added/
//                                  removed elsewhere). Disambiguates a quote that appears more than
//                                  once.
//   3. quote-only, nearest      — only the quote itself is found (its surroundings changed too),
//                                  possibly more than once; the occurrence closest to the original
//                                  offset is preferred as the most likely intended one.
//   4. unresolved                — the quote no longer appears anywhere; callers must degrade
//                                  gracefully (e.g. list the annotation without a "go to source"
//                                  action), never guess.
//
// The DOM-facing helpers at the bottom (textOffsetWithin / createTextAnchorFromRange /
// rangeFromOffsets) are the ONLY functions in this module that touch the DOM, and they read it
// exactly once per call — nothing here holds a Range or Node across renders.

export interface TextAnchor {
  quote: string;
  prefix: string;
  suffix: string;
  /** Best-known offset into the container's plain text at the moment the anchor was created — a
   * HINT for resolution (tier 1's fast path, and tier 2/3's disambiguation target), never treated
   * as authoritative on its own. */
  start: number;
  end: number;
}

export type TextAnchorResolution =
  | { status: 'resolved'; start: number; end: number; method: 'exact' | 'context' | 'quote-nearest' }
  | { status: 'unresolved' };

/** Characters of surrounding context captured on each side of the quote — enough to disambiguate
 * a short, commonly-repeated quote without ballooning every anchor's stored size. */
export const TEXT_ANCHOR_CONTEXT_LENGTH = 32;

/**
 * Builds a TextAnchor from already-known plain-text offsets into `fullText`. Returns null for an
 * invalid range (end <= start, out of bounds) or a whitespace-only quote — neither is a meaningful
 * thing to anchor an annotation to.
 */
export function createTextAnchor(fullText: string, start: number, end: number, contextLength: number = TEXT_ANCHOR_CONTEXT_LENGTH): TextAnchor | null {
  if (start < 0 || end <= start || end > fullText.length) return null;
  const quote = fullText.slice(start, end);
  if (quote.trim().length === 0) return null;
  const prefix = fullText.slice(Math.max(0, start - contextLength), start);
  const suffix = fullText.slice(end, Math.min(fullText.length, end + contextLength));
  return { quote, prefix, suffix, start, end };
}

function isValidAnchorShape(anchor: unknown): anchor is TextAnchor {
  if (!anchor || typeof anchor !== 'object') return false;
  const a = anchor as Record<string, unknown>;
  return typeof a.quote === 'string' && a.quote.length > 0 && typeof a.prefix === 'string' && typeof a.suffix === 'string' && typeof a.start === 'number' && typeof a.end === 'number' && a.end > a.start;
}

function allIndicesOf(haystack: string, needle: string): number[] {
  if (needle.length === 0) return [];
  const indices: number[] = [];
  let from = 0;
  for (;;) {
    const i = haystack.indexOf(needle, from);
    if (i === -1) break;
    indices.push(i);
    from = i + 1;
  }
  return indices;
}

function nearest(candidates: readonly number[], target: number): number {
  let best = candidates[0];
  let bestDist = Math.abs(candidates[0] - target);
  for (const c of candidates.slice(1)) {
    const d = Math.abs(c - target);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}

/** Resolves a TextAnchor against `fullText` (the reading container's CURRENT plain text) using the
 * fixed 4-tier hierarchy documented in this module's header. Malformed input (wrong shape, empty
 * quote, inverted range) resolves to 'unresolved' rather than throwing — a corrupt/legacy record
 * degrades gracefully, exactly like any other resolution failure. */
export function resolveTextAnchor(fullText: string, anchor: unknown): TextAnchorResolution {
  if (!isValidAnchorShape(anchor)) return { status: 'unresolved' };

  if (anchor.end <= fullText.length && fullText.slice(anchor.start, anchor.end) === anchor.quote) {
    return { status: 'resolved', start: anchor.start, end: anchor.end, method: 'exact' };
  }

  const compound = anchor.prefix + anchor.quote + anchor.suffix;
  const compoundIndices = allIndicesOf(fullText, compound);
  if (compoundIndices.length > 0) {
    const bestCompoundStart = nearest(compoundIndices, anchor.start - anchor.prefix.length);
    const start = bestCompoundStart + anchor.prefix.length;
    return { status: 'resolved', start, end: start + anchor.quote.length, method: 'context' };
  }

  const quoteIndices = allIndicesOf(fullText, anchor.quote);
  if (quoteIndices.length > 0) {
    const start = nearest(quoteIndices, anchor.start);
    return { status: 'resolved', start, end: start + anchor.quote.length, method: 'quote-nearest' };
  }

  return { status: 'unresolved' };
}

// ---- DOM-facing helpers (browser Range <-> plain-text offset) --------------------------------

/** The character offset of the point (node, offset) within `container`'s OWN text content —
 * computed via a "pre-range" (container-start -> the given point) and that range's own
 * `.toString().length`, which walks nested elements the identical way Selection/Range APIs already
 * do, without any hand-rolled DOM TreeWalker code of our own for this half of the job. */
export function textOffsetWithin(container: Node, node: Node, offset: number): number {
  const doc = container.ownerDocument ?? (container as unknown as Document);
  const preRange = doc.createRange();
  preRange.selectNodeContents(container);
  preRange.setEnd(node, offset);
  return preRange.toString().length;
}

/**
 * Builds a TextAnchor from a live DOM Range, relative to `container`'s own text content. The Range
 * is read exactly once, right here — it is never stored. Returns null for a collapsed or
 * whitespace-only selection.
 */
export function createTextAnchorFromRange(container: HTMLElement, range: Range, contextLength: number = TEXT_ANCHOR_CONTEXT_LENGTH): TextAnchor | null {
  const start = textOffsetWithin(container, range.startContainer, range.startOffset);
  const end = textOffsetWithin(container, range.endContainer, range.endOffset);
  if (end <= start) return null;
  return createTextAnchor(container.textContent ?? '', start, end, contextLength);
}

/**
 * The inverse of textOffsetWithin: walks `container`'s own text nodes to build a real DOM Range
 * spanning the plain-text offsets [start, end) — used to scroll to / visually resolve an
 * annotation's source location. Returns null if the container doesn't have that much text.
 */
export function rangeFromOffsets(container: HTMLElement, start: number, end: number): Range | null {
  const doc = container.ownerDocument;
  if (!doc || start < 0 || end < start) return null;
  const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  let consumed = 0;
  let startNode: Node | null = null;
  let startOffset = 0;
  let endNode: Node | null = null;
  let endOffset = 0;
  let node: Node | null;
  // eslint-disable-next-line no-cond-assign
  while ((node = walker.nextNode())) {
    const length = node.textContent?.length ?? 0;
    const nodeStart = consumed;
    const nodeEnd = consumed + length;
    if (startNode === null && start >= nodeStart && start <= nodeEnd) {
      startNode = node;
      startOffset = start - nodeStart;
    }
    if (end >= nodeStart && end <= nodeEnd) {
      endNode = node;
      endOffset = end - nodeStart;
      break;
    }
    consumed = nodeEnd;
  }
  if (!startNode || !endNode) return null;
  const range = doc.createRange();
  range.setStart(startNode, startOffset);
  range.setEnd(endNode, endOffset);
  return range;
}
