// @vitest-environment happy-dom
// The DOM-facing half of this module (textOffsetWithin/createTextAnchorFromRange/
// rangeFromOffsets) genuinely needs a real Range/TreeWalker implementation to test meaningfully —
// happy-dom (already a dependency of vitest itself, confirmed installed; see this repo's own
// contentImport.test.ts comment for prior precedent using this exact override) provides one with
// zero new project dependencies. The pure resolution algorithm (resolveTextAnchor) doesn't need
// the DOM at all and would pass identically under the default Node environment — it's tested here
// too, in the same file, for one coherent suite.
import { describe, it, expect } from 'vitest';
import { createTextAnchor, resolveTextAnchor, createTextAnchorFromRange, textOffsetWithin, rangeFromOffsets, TEXT_ANCHOR_CONTEXT_LENGTH, type TextAnchor } from './textAnchor';

// ============================================================================================
// Pure resolution algorithm
// ============================================================================================

describe('createTextAnchor — text-anchor creation', () => {
  const fullText = 'The quick brown fox jumps over the lazy dog.';

  it('captures the exact quote plus prefix/suffix context and the given offsets', () => {
    const anchor = createTextAnchor(fullText, 4, 19); // "quick brown fox"
    expect(anchor).toEqual({
      quote: 'quick brown fox',
      prefix: 'The ',
      suffix: ' jumps over the lazy dog.'.slice(0, TEXT_ANCHOR_CONTEXT_LENGTH),
      start: 4,
      end: 19,
    });
  });

  it('clips prefix/suffix at the string boundaries rather than throwing', () => {
    const anchor = createTextAnchor(fullText, 0, 3); // "The", right at the start
    expect(anchor?.prefix).toBe('');
    const nearEnd = createTextAnchor(fullText, fullText.length - 3, fullText.length);
    expect(nearEnd?.suffix).toBe('');
  });

  it('returns null for an invalid range (end <= start, or out of bounds)', () => {
    expect(createTextAnchor(fullText, 10, 10)).toBeNull();
    expect(createTextAnchor(fullText, 10, 5)).toBeNull();
    expect(createTextAnchor(fullText, 0, fullText.length + 5)).toBeNull();
    expect(createTextAnchor(fullText, -1, 5)).toBeNull();
  });

  it('returns null for a whitespace-only quote — not a meaningful thing to anchor to', () => {
    const anchor = createTextAnchor('a    b', 1, 5); // the 4 spaces between a and b
    expect(anchor).toBeNull();
  });
});

describe('resolveTextAnchor — tier 1: exact offset match', () => {
  it('resolves instantly when the stored offset still points at the quote (the common case: text unchanged)', () => {
    const fullText = 'The quick brown fox jumps over the lazy dog.';
    const anchor = createTextAnchor(fullText, 4, 19)!;
    const result = resolveTextAnchor(fullText, anchor);
    expect(result).toEqual({ status: 'resolved', start: 4, end: 19, method: 'exact' });
  });
});

describe('resolveTextAnchor — tier 2: prefix+quote+suffix context match', () => {
  it('re-anchors correctly when text was inserted BEFORE the quote, shifting its offset', () => {
    const original = 'The quick brown fox jumps over the lazy dog.';
    const anchor = createTextAnchor(original, 4, 19)!; // "quick brown fox"
    const edited = 'Yesterday, ' + original; // 11 chars inserted before everything
    const result = resolveTextAnchor(edited, anchor);
    expect(result.status).toBe('resolved');
    if (result.status === 'resolved') {
      expect(result.method).toBe('context');
      expect(edited.slice(result.start, result.end)).toBe('quick brown fox');
    }
  });

  it('disambiguates a REPEATED quote using context, even when the stored offset is adversarially closer to the WRONG occurrence', () => {
    // "cat" appears twice, with different surrounding context each time. The anchor's own
    // prefix/suffix only matches the SECOND occurrence — but its stored `start` is deliberately set
    // near the FIRST (wrong) one, and end is deliberately 1 short of the quote's real length so
    // tier 1's exact-slice check is guaranteed to fail (never coincidentally "succeeds" on the
    // wrong text). A naive "just find the nearest occurrence to the stored offset" (tier 3's own
    // strategy) would wrongly pick the first "cat" here — tier 2's context match must win instead.
    const text = 'ALPHA cat BETA middle padding text here GAMMA cat DELTA';
    const firstCatIndex = text.indexOf('cat');
    const secondCatIndex = text.indexOf('cat', firstCatIndex + 1);
    const anchor = { quote: 'cat', prefix: 'GAMMA ', suffix: ' DELTA', start: firstCatIndex, end: firstCatIndex + 2 };
    const result = resolveTextAnchor(text, anchor);
    expect(result).toEqual({ status: 'resolved', start: secondCatIndex, end: secondCatIndex + 3, method: 'context' });
  });
});

describe('resolveTextAnchor — tier 3: quote-only match, nearest to original offset', () => {
  it('falls back to a quote-only search when the surrounding context itself changed too', () => {
    const original = 'Section A: the cat sat quietly. Section B: unrelated text here.';
    const catIndex = original.indexOf('the cat sat');
    const anchor = createTextAnchor(original, catIndex, catIndex + 'the cat sat'.length)!;
    // Replace the immediate prefix AND suffix (so tier 2's compound search can't match), but keep
    // the quote itself present, once, elsewhere.
    const edited = 'Totally different opening. the cat sat totally different closing.';
    const result = resolveTextAnchor(edited, anchor);
    expect(result.status).toBe('resolved');
    if (result.status === 'resolved') {
      expect(result.method).toBe('quote-nearest');
      expect(edited.slice(result.start, result.end)).toBe('the cat sat');
    }
  });

  it('prefers the occurrence CLOSEST to the original offset when the quote appears multiple times and context matches none', () => {
    // "cat" appears 3 times; context around each differs from the anchor's stored prefix/suffix,
    // forcing tier 3. The anchor's original offset (5) is closest to the FIRST "cat".
    const edited = 'A cat, another cat, and a third cat far away.';
    const anchor: TextAnchor = { quote: 'cat', prefix: 'XXX ', suffix: ' YYY', start: 5, end: 8 };
    const result = resolveTextAnchor(edited, anchor);
    expect(result.status).toBe('resolved');
    if (result.status === 'resolved') {
      expect(result.start).toBe(edited.indexOf('cat')); // the first, nearest occurrence
    }
  });
});

describe('resolveTextAnchor — tier 4: unresolved, never silently attaches to the wrong text', () => {
  it('reports unresolved when the quote no longer appears anywhere', () => {
    const anchor = createTextAnchor('The quick brown fox.', 4, 9)!; // "quick"
    const result = resolveTextAnchor('This text has been completely rewritten.', anchor);
    expect(result).toEqual({ status: 'unresolved' });
  });

  it('reports unresolved for a malformed anchor object (missing fields, wrong types) rather than throwing', () => {
    expect(resolveTextAnchor('some text', null)).toEqual({ status: 'unresolved' });
    expect(resolveTextAnchor('some text', {})).toEqual({ status: 'unresolved' });
    expect(resolveTextAnchor('some text', { quote: '', prefix: '', suffix: '', start: 0, end: 0 })).toEqual({ status: 'unresolved' });
    expect(resolveTextAnchor('some text', { quote: 'some', prefix: '', suffix: '', start: 5, end: 2 })).toEqual({ status: 'unresolved' }); // end < start
  });

  it('reports unresolved for an empty document', () => {
    const anchor = createTextAnchor('The quick brown fox.', 4, 9)!;
    expect(resolveTextAnchor('', anchor)).toEqual({ status: 'unresolved' });
  });
});

describe('resolveTextAnchor — determinism', () => {
  it('produces the identical result across repeated calls with identical inputs', () => {
    const fullText = 'Repeatable resolution must be deterministic, always.';
    const anchor = createTextAnchor(fullText, 11, 21)!;
    const first = resolveTextAnchor(fullText, anchor);
    const second = resolveTextAnchor(fullText, anchor);
    expect(second).toEqual(first);
  });
});

// ============================================================================================
// DOM-facing helpers (happy-dom)
// ============================================================================================

function makeContainer(html: string): HTMLDivElement {
  const div = document.createElement('div');
  div.innerHTML = html;
  document.body.appendChild(div);
  return div;
}

describe('textOffsetWithin — plain-text offset from a DOM (node, offset) point', () => {
  it('computes the correct offset across nested inline elements (Markdown-rendered content shape)', () => {
    const container = makeContainer('<p>Hello <b>bold</b> and <i>italic</i> world.</p>');
    const boldText = container.querySelector('b')!.firstChild!;
    // Offset 2 within "bold" ("bo|ld") should be "Hello bo" = 8 characters in.
    const offset = textOffsetWithin(container, boldText, 2);
    expect(offset).toBe('Hello bo'.length);
  });

  it('the offset at the very start of the container is 0', () => {
    const container = makeContainer('<p>Hello world.</p>');
    const textNode = container.querySelector('p')!.firstChild!;
    expect(textOffsetWithin(container, textNode, 0)).toBe(0);
  });
});

describe('createTextAnchorFromRange — building an anchor from a live Selection Range', () => {
  it('creates a correct anchor for a selection spanning a single text node', () => {
    const container = makeContainer('<p>The quick brown fox jumps.</p>');
    const textNode = container.querySelector('p')!.firstChild!;
    const range = document.createRange();
    range.setStart(textNode, 4); // "quick brown fox"
    range.setEnd(textNode, 19);
    const anchor = createTextAnchorFromRange(container, range);
    expect(anchor).toEqual({ quote: 'quick brown fox', prefix: 'The ', suffix: ' jumps.', start: 4, end: 19 });
  });

  it('creates a correct anchor for a selection spanning MULTIPLE nested elements', () => {
    const container = makeContainer('<p>Start <b>bold middle</b> end.</p>');
    const startNode = container.querySelector('p')!.firstChild!; // "Start "
    const boldNode = container.querySelector('b')!.firstChild!; // "bold middle"
    const range = document.createRange();
    range.setStart(startNode, 3); // "rt " within "Start "
    range.setEnd(boldNode, 4); // "bold" within "bold middle"
    const anchor = createTextAnchorFromRange(container, range);
    expect(anchor?.quote).toBe('rt bold');
  });

  it('returns null for a collapsed selection (no real range chosen)', () => {
    const container = makeContainer('<p>Hello world.</p>');
    const textNode = container.querySelector('p')!.firstChild!;
    const range = document.createRange();
    range.setStart(textNode, 3);
    range.setEnd(textNode, 3);
    expect(createTextAnchorFromRange(container, range)).toBeNull();
  });
});

describe('rangeFromOffsets — the inverse of textOffsetWithin, round-tripping through a real Range', () => {
  it('round-trips: an anchor created from a Range, converted back to a Range, selects the identical text', () => {
    const container = makeContainer('<p>The quick brown fox jumps over the lazy dog.</p>');
    const textNode = container.querySelector('p')!.firstChild!;
    const originalRange = document.createRange();
    originalRange.setStart(textNode, 4);
    originalRange.setEnd(textNode, 19);
    const anchor = createTextAnchorFromRange(container, originalRange)!;

    const rebuilt = rangeFromOffsets(container, anchor.start, anchor.end);
    expect(rebuilt).not.toBeNull();
    expect(rebuilt!.toString()).toBe(anchor.quote);
  });

  it('round-trips correctly across nested elements too', () => {
    const container = makeContainer('<p>Start <b>bold middle</b> end.</p>');
    const resolved = resolveTextAnchor(container.textContent ?? '', { quote: 'bold middle', prefix: 'Start ', suffix: ' end.', start: 6, end: 17 });
    expect(resolved.status).toBe('resolved');
    if (resolved.status !== 'resolved') return;
    const range = rangeFromOffsets(container, resolved.start, resolved.end);
    expect(range?.toString()).toBe('bold middle');
  });

  it('returns null when the requested offsets exceed the container\'s actual text length', () => {
    const container = makeContainer('<p>Short.</p>');
    expect(rangeFromOffsets(container, 0, 500)).toBeNull();
  });

  it('returns null for an inverted range', () => {
    const container = makeContainer('<p>Short.</p>');
    expect(rangeFromOffsets(container, 5, 2)).toBeNull();
  });
});

describe('end-to-end: create in one render, resolve after the container is rebuilt (simulating a reload)', () => {
  it('an anchor created against one DOM instance resolves correctly against a FRESH, independently-built DOM with the same text', () => {
    const html = '<p>Once upon a time, the quick fox jumped over the lazy dog.</p>';
    const containerA = makeContainer(html);
    const textNodeA = containerA.querySelector('p')!.firstChild!;
    const rangeA = document.createRange();
    const quoteStart = 'Once upon a time, '.length;
    rangeA.setStart(textNodeA, quoteStart);
    rangeA.setEnd(textNodeA, quoteStart + 'the quick fox'.length);
    const anchor = createTextAnchorFromRange(containerA, rangeA)!;
    expect(anchor.quote).toBe('the quick fox');

    // A brand-new container, never touched by the code above — simulates a page reload.
    const containerB = makeContainer(html);
    const resolved = resolveTextAnchor(containerB.textContent ?? '', anchor);
    expect(resolved).toEqual({ status: 'resolved', start: anchor.start, end: anchor.end, method: 'exact' });
    const rangeB = rangeFromOffsets(containerB, resolved.status === 'resolved' ? resolved.start : -1, resolved.status === 'resolved' ? resolved.end : -1);
    expect(rangeB?.toString()).toBe('the quick fox');
  });
});
