// @vitest-environment happy-dom
//
// Phase 6-7A — regression tests for the "I cannot highlight a file in Repository" fix. Root cause
// (see the diagnosis this phase implements): the active drawing canvas used to become the pointer
// hit-test target (pointer-events: auto) whenever ANY drawing tool was armed, including the
// toolbar's "Highlighter" tool — so dragging/long-pressing over text never reached the text at all,
// and DocumentAnnotator's own selectionchange handler additionally discarded any selection outright
// whenever activeTool was truthy. Two independent regressions, tested separately below:
//
//   1. Structural: the active canvas must never capture pointer events itself any more — it's a
//      pure render target now; the wrapper (which also contains the real text) owns pointer
//      handling instead. See AnnotationLayer.tsx's own header comment for the full mechanism.
//   2. Behavioural: a genuine text selection must still be picked up (and offered via
//      ContextualSelectionToolbar) even while a drawing tool is armed, and the armed tool must be
//      cleared automatically — the user should never need to deactivate it themselves.
//
// Test 2 needs a non-zero Range.getBoundingClientRect() to pass DocumentAnnotator's own (correct,
// deliberate) zero-size-rect guard — happy-dom has no real layout engine and always returns a
// zero-size rect for a live Range (see DocumentAnnotator.navigation.test.tsx's own header for why a
// REAL selectionchange-driven test can't be written here), so this test stubs
// Range.prototype.getBoundingClientRect for its own duration only, the standard technique for this
// exact limitation — it does not contradict that file's documented constraint, it works around it
// for a case that file explicitly said would need this.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useAppStore } from '../../lib/store';
import { DEFAULT_WORKSPACE_ID } from '../../lib/workspace';
import { createTextHighlight } from '../../lib/annotations';
import { createTextAnchor } from '../../lib/textAnchor';
import { DocumentAnnotator } from './DocumentAnnotator';

const DOC_ID = 'note:doc-selection-test';
const FULL_TEXT = 'The quick brown fox jumps over the lazy dog near the riverbank.';

function resetStore() {
  useAppStore.setState({ activeWorkspaceId: DEFAULT_WORKSPACE_ID, inactiveWorkspaceOwnedData: {}, annotations: [] });
}

function renderAnnotator() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(
      <DocumentAnnotator documentId={DOC_ID} renderMode="raw" scrollBoxClassName="test-scroll-box">
        <pre>{FULL_TEXT}</pre>
      </DocumentAnnotator>,
    );
  });
  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function findButtonByLabel(container: HTMLElement, labelSubstring: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) => (b.getAttribute('aria-label') || '').includes(labelSubstring));
}

describe('AnnotationLayer — active canvas never captures pointer events itself', () => {
  beforeEach(resetStore);

  it('the active drawing canvas is pointer-events:none whether or not a drawing tool is armed', () => {
    const { container, cleanup } = renderAnnotator();
    try {
      const canvases = Array.from(container.querySelectorAll('canvas'));
      expect(canvases.length).toBeGreaterThan(0);
      for (const canvas of canvases) {
        expect(canvas.className).toContain('pointer-events-none');
        expect(canvas.style.pointerEvents).toBe(''); // no inline override reintroducing 'auto'
      }

      // Arm a drawing tool — this used to flip the active canvas's inline pointer-events to 'auto'.
      const highlighterButton = findButtonByLabel(container, 'Highlighter —');
      expect(highlighterButton).toBeDefined();
      act(() => {
        highlighterButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      for (const canvas of Array.from(container.querySelectorAll('canvas'))) {
        expect(canvas.className).toContain('pointer-events-none');
        expect(canvas.style.pointerEvents).toBe('');
      }
    } finally {
      cleanup();
    }
  });
});

describe('DocumentAnnotator — text selection is honoured even while a drawing tool is armed', () => {
  let originalGetBoundingClientRect: () => DOMRect;

  beforeEach(() => {
    resetStore();
    originalGetBoundingClientRect = Range.prototype.getBoundingClientRect;
    Range.prototype.getBoundingClientRect = vi.fn(() => ({ top: 10, left: 10, width: 50, height: 14, bottom: 24, right: 60, x: 10, y: 10, toJSON: () => ({}) })) as unknown as () => DOMRect;
  });

  afterEach(() => {
    Range.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });

  it('a selection made while the Highlighter tool is armed still surfaces ContextualSelectionToolbar and clears the armed tool', () => {
    const { container, cleanup } = renderAnnotator();
    try {
      const highlighterButton = findButtonByLabel(container, 'Highlighter —')!;
      act(() => {
        highlighterButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(highlighterButton.getAttribute('aria-pressed')).toBe('true');

      const textNode = container.querySelector('pre')!.firstChild!;
      const range = document.createRange();
      range.setStart(textNode, 4); // "quick"
      range.setEnd(textNode, 9);
      act(() => {
        const sel = window.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
      });

      expect(findButtonByLabel(container, 'Text Highlight —')).toBeDefined();
      expect(highlighterButton.getAttribute('aria-pressed')).toBe('false');
    } finally {
      cleanup();
    }
  });

  it('a selection made with no tool armed still works exactly as before (baseline, unaffected by the fix)', () => {
    const { container, cleanup } = renderAnnotator();
    try {
      const textNode = container.querySelector('pre')!.firstChild!;
      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, 3); // "The"
      act(() => {
        const sel = window.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
      });

      expect(findButtonByLabel(container, 'Text Highlight —')).toBeDefined();
    } finally {
      cleanup();
    }
  });
});

describe('AnnotationLayer — drawing/lasso/eraser still work after moving pointer capture to the wrapper', () => {
  let originalGetBoundingClientRect: () => DOMRect;

  beforeEach(() => {
    resetStore();
    // Same technique as the selection tests above, applied to the wrapper div (which now owns
    // pointer capture) rather than Range — happy-dom gives every element a zero-size rect, which
    // relativePointFromClient degrades to {x:0,y:0} for, producing a degenerate (never "meaningful")
    // stroke. A real rect is needed to prove an actual stroke gets committed.
    originalGetBoundingClientRect = HTMLDivElement.prototype.getBoundingClientRect;
    HTMLDivElement.prototype.getBoundingClientRect = vi.fn(() => ({ top: 0, left: 0, width: 200, height: 100, bottom: 100, right: 200, x: 0, y: 0, toJSON: () => ({}) })) as unknown as () => DOMRect;
  });

  afterEach(() => {
    HTMLDivElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });

  function findWrapper(container: HTMLElement): HTMLDivElement {
    // The wrapper is the relatively-positioned div directly containing the <pre> content and the
    // two canvases — see AnnotationLayer.tsx's own root div.
    return container.querySelector('pre')!.parentElement as HTMLDivElement;
  }

  function pointerEvent(type: string, x: number, y: number, pointerType: string, pressure = 0.5) {
    return new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerType, pressure, pointerId: 1 });
  }

  it('a pen drag with the Pen tool armed commits a real ink stroke', () => {
    const { container, cleanup } = renderAnnotator();
    try {
      const penButton = findButtonByLabel(container, 'Pen (')!;
      act(() => {
        penButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      const wrapper = findWrapper(container);
      act(() => {
        wrapper.dispatchEvent(pointerEvent('pointerdown', 10, 10, 'pen'));
        wrapper.dispatchEvent(pointerEvent('pointermove', 60, 60, 'pen'));
        wrapper.dispatchEvent(pointerEvent('pointerup', 60, 60, 'pen'));
      });
      const strokes = useAppStore.getState().annotations.filter((a) => a.type === 'ink');
      expect(strokes.length).toBe(1);
      expect(strokes[0].points.some((p) => p.pressure === 0.5)).toBe(true); // pressure passed through
    } finally {
      cleanup();
    }
  });

  it('a touch drag with the Pen tool armed never draws a stroke', () => {
    const { container, cleanup } = renderAnnotator();
    try {
      const penButton = findButtonByLabel(container, 'Pen (')!;
      act(() => {
        penButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      const wrapper = findWrapper(container);
      act(() => {
        wrapper.dispatchEvent(pointerEvent('pointerdown', 10, 10, 'touch'));
        wrapper.dispatchEvent(pointerEvent('pointermove', 60, 60, 'touch'));
        wrapper.dispatchEvent(pointerEvent('pointerup', 60, 60, 'touch'));
      });
      expect(useAppStore.getState().annotations.filter((a) => a.type === 'ink')).toHaveLength(0);
    } finally {
      cleanup();
    }
  });

  it('a lasso drag with the Lasso tool armed still selects geometry (no crash / no stray annotation created)', () => {
    const { container, cleanup } = renderAnnotator();
    try {
      const lassoButton = findButtonByLabel(container, 'Lasso select')!;
      act(() => {
        lassoButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      const wrapper = findWrapper(container);
      expect(() => {
        act(() => {
          wrapper.dispatchEvent(pointerEvent('pointerdown', 5, 5, 'mouse'));
          wrapper.dispatchEvent(pointerEvent('pointermove', 150, 90, 'mouse'));
          wrapper.dispatchEvent(pointerEvent('pointerup', 150, 90, 'mouse'));
        });
      }).not.toThrow();
      expect(useAppStore.getState().annotations).toHaveLength(0); // lasso only selects, never creates
    } finally {
      cleanup();
    }
  });

  // Regression test (Phase 7) — handlePointerDown used to unconditionally reassign
  // drawingPointerIdRef to WHATEVER pointer fired pointerdown, even mid-gesture. A stray second
  // pointer (e.g. a mouse click landing while a pen stroke was still being dragged) would silently
  // steal capture, discard the first stroke's in-progress points, and orphan its eventual pointerup
  // (which would then fail the pointerId check and never commit) — the first stroke was simply lost.
  it('a second pointerdown from a different pointer while a pen stroke is in progress is ignored, and the original stroke still commits on its own pointerup', () => {
    const { container, cleanup } = renderAnnotator();
    try {
      const penButton = findButtonByLabel(container, 'Pen (')!;
      act(() => {
        penButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      const wrapper = findWrapper(container);
      act(() => {
        wrapper.dispatchEvent(pointerEvent('pointerdown', 10, 10, 'pen'));
        wrapper.dispatchEvent(pointerEvent('pointermove', 40, 40, 'pen'));
        // A second, unrelated pointer (a different pointerId) goes down mid-stroke — must be ignored.
        const strayDown = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 90, clientY: 90, pointerType: 'mouse', pressure: 0.5, pointerId: 2 });
        wrapper.dispatchEvent(strayDown);
        wrapper.dispatchEvent(pointerEvent('pointermove', 60, 60, 'pen'));
        wrapper.dispatchEvent(pointerEvent('pointerup', 60, 60, 'pen'));
      });
      const strokes = useAppStore.getState().annotations.filter((a) => a.type === 'ink');
      expect(strokes.length).toBe(1); // the original pen stroke still committed, not discarded
    } finally {
      cleanup();
    }
  });

  // Regression test (Phase 7) — the highlighter used to share ONE `thickness` state with the pen,
  // floored to DEFAULT_HIGHLIGHTER_THICKNESS only at commit time (never at preview time), so: (a)
  // the live drag preview and the persisted stroke visibly disagreed on width, and (b) a user could
  // never actually make the highlighter thinner than that floor via the toolbar slider — every
  // value below it was silently overridden back up on commit. Splitting inkThickness/
  // highlighterThickness (mirroring the pre-existing inkColor/highlighterColor split) fixes both.
  it('the highlighter has its own thickness independent of the pen, and commits exactly what its slider shows (no hidden floor)', () => {
    const { container, cleanup } = renderAnnotator();
    try {
      const highlighterButton = findButtonByLabel(container, 'Highlighter')!;
      act(() => {
        highlighterButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      const thicknessButton = findButtonByLabel(container, 'Thickness')!;
      act(() => {
        thicknessButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      const slider = container.querySelector('input[aria-label="Stroke thickness"]') as HTMLInputElement;
      expect(slider.value).toBe('14'); // DEFAULT_HIGHLIGHTER_THICKNESS, untouched
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      act(() => {
        nativeSetter.call(slider, '6');
        slider.dispatchEvent(new Event('input', { bubbles: true }));
      });

      const wrapper = findWrapper(container);
      act(() => {
        wrapper.dispatchEvent(pointerEvent('pointerdown', 10, 10, 'pen'));
        wrapper.dispatchEvent(pointerEvent('pointermove', 60, 60, 'pen'));
        wrapper.dispatchEvent(pointerEvent('pointerup', 60, 60, 'pen'));
      });
      const strokes = useAppStore.getState().annotations.filter((a) => a.type === 'highlighterInk');
      expect(strokes).toHaveLength(1);
      expect((strokes[0] as { thickness: number }).thickness).toBe(6); // not floored back up to 14
    } finally {
      cleanup();
    }
  });

  // Regression test (Phase 8B) — a stylus's physical eraser tip (W3C Pointer Events' standard
  // `button === 5`) must erase an existing stroke regardless of which tool is currently armed on
  // the toolbar — here the Pen tool stays armed throughout, proving the eraser-tip gesture doesn't
  // require (or change) the toolbar's own selection.
  it('a stylus eraser-tip drag (pointerType pen, button 5) erases an existing stroke while the Pen tool stays armed', () => {
    const { container, cleanup } = renderAnnotator();
    try {
      const penButton = findButtonByLabel(container, 'Pen (')!;
      act(() => {
        penButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      const wrapper = findWrapper(container);
      act(() => {
        wrapper.dispatchEvent(pointerEvent('pointerdown', 10, 10, 'pen'));
        wrapper.dispatchEvent(pointerEvent('pointermove', 60, 10, 'pen'));
        wrapper.dispatchEvent(pointerEvent('pointerup', 60, 10, 'pen'));
      });
      expect(useAppStore.getState().annotations.filter((a) => a.type === 'ink')).toHaveLength(1);

      // Target the stroke's own start point (10,10) exactly — findInkNear tests distance to each
      // STORED point, not to the interpolated line between them, and this drag only ever captured
      // its two endpoints (one pointerdown + one pointermove sample), so anywhere else along the
      // visual line is outside ERASER_RADIUS of either stored point.
      const eraserTipDown = new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 10, clientY: 10, pointerType: 'pen', pressure: 0.5, pointerId: 2, button: 5 });
      const eraserTipUp = new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: 10, clientY: 10, pointerType: 'pen', pressure: 0.5, pointerId: 2, button: 5 });
      act(() => {
        wrapper.dispatchEvent(eraserTipDown);
        wrapper.dispatchEvent(eraserTipUp);
      });
      expect(useAppStore.getState().annotations.filter((a) => a.type === 'ink')).toHaveLength(0);

      // Pen tool still armed (unaffected by the eraser-tip gesture) — a normal pen drag right after
      // still draws, proving the toolbar's own tool selection was never touched.
      act(() => {
        wrapper.dispatchEvent(pointerEvent('pointerdown', 10, 80, 'pen'));
        wrapper.dispatchEvent(pointerEvent('pointermove', 60, 80, 'pen'));
        wrapper.dispatchEvent(pointerEvent('pointerup', 60, 80, 'pen'));
      });
      expect(useAppStore.getState().annotations.filter((a) => a.type === 'ink')).toHaveLength(1);
    } finally {
      cleanup();
    }
  });

  // Regression test (Phase 8B) — pointer capture must be explicitly released at gesture end
  // (never left "orphaned" relying solely on implicit browser release, which some Android WebView
  // builds have been known to mishandle across gesture boundaries).
  it('releases pointer capture explicitly on pointerup', () => {
    const { container, cleanup } = renderAnnotator();
    try {
      const penButton = findButtonByLabel(container, 'Pen (')!;
      act(() => {
        penButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      const wrapper = findWrapper(container);
      const hasPointerCaptureSpy = vi.fn(() => true);
      const releasePointerCaptureSpy = vi.fn();
      wrapper.hasPointerCapture = hasPointerCaptureSpy as unknown as typeof wrapper.hasPointerCapture;
      wrapper.releasePointerCapture = releasePointerCaptureSpy as unknown as typeof wrapper.releasePointerCapture;

      act(() => {
        wrapper.dispatchEvent(pointerEvent('pointerdown', 10, 10, 'pen'));
        wrapper.dispatchEvent(pointerEvent('pointerup', 10, 10, 'pen'));
      });
      expect(releasePointerCaptureSpy).toHaveBeenCalledWith(1);
    } finally {
      cleanup();
    }
  });

  it('releases pointer capture explicitly on pointercancel', () => {
    const { container, cleanup } = renderAnnotator();
    try {
      const penButton = findButtonByLabel(container, 'Pen (')!;
      act(() => {
        penButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      const wrapper = findWrapper(container);
      const hasPointerCaptureSpy = vi.fn(() => true);
      const releasePointerCaptureSpy = vi.fn();
      wrapper.hasPointerCapture = hasPointerCaptureSpy as unknown as typeof wrapper.hasPointerCapture;
      wrapper.releasePointerCapture = releasePointerCaptureSpy as unknown as typeof wrapper.releasePointerCapture;

      act(() => {
        wrapper.dispatchEvent(pointerEvent('pointerdown', 10, 10, 'pen'));
        wrapper.dispatchEvent(pointerEvent('pointercancel', 10, 10, 'pen'));
      });
      expect(releasePointerCaptureSpy).toHaveBeenCalledWith(1);
    } finally {
      cleanup();
    }
  });
});

// Regression test (Phase 7B) — root cause of "cannot select ANY text in a Repository document"
// once that document already has an existing text-anchored annotation (highlight/underline/
// strikethrough/note): AnnotationLayer's text-markup overlay div (`textRects.length > 0`) covered
// the FULL content box (`absolute inset-0`) but never set `pointer-events-none` on itself, unlike
// the sticky-notes overlay a few lines below it in the same file (which correctly does). A plain
// div's default `pointer-events: auto` makes its whole box hit-testable regardless of visible
// content, so once this container rendered it silently intercepted mouse/pointer hit-testing
// (including the mousedown-drag a browser needs to START a selection) across the ENTIRE document,
// not just near its own child marks — invisible to every other test in this file, since those
// dispatch PointerEvents directly at a target element and never go through real CSS-based
// hit-testing. This test instead asserts the actual rendered DOM structure real hit-testing would
// see: the overlay container must carry pointer-events-none once it renders.
describe('AnnotationLayer — text-markup overlay never blocks selection elsewhere in the document', () => {
  let originalGetClientRects: () => DOMRectList;
  let originalResizeObserver: typeof ResizeObserver;

  beforeEach(() => {
    resetStore();
    // Same technique as this file's own pointer-capture tests above, applied to Range instead of
    // the wrapper div: happy-dom has no real layout engine, so Range.getClientRects() always
    // returns an empty list, which AnnotationLayer's own textRects effect (correctly) treats as "not
    // resolvable" and skips — a real (non-empty) rect list is needed to prove the overlay renders at
    // all (see DocumentAnnotator.navigation.test.tsx's own header for the same documented limitation).
    originalGetClientRects = Range.prototype.getClientRects;
    Range.prototype.getClientRects = vi.fn(
      () => [{ left: 10, top: 10, width: 50, height: 16, bottom: 26, right: 60, x: 10, y: 10, toJSON: () => ({}) }] as unknown as DOMRectList,
    );
    // AnnotationLayer also gates the SAME textRects effect on its own `size` state, populated only
    // by a ResizeObserver callback — happy-dom's real one reports (and fires) unpredictably outside
    // React's act() tracking. A synchronous fake, invoked at .observe() time (itself called from the
    // component's mount effect, which act() DOES flush), makes this deterministic without touching
    // any non-test code.
    originalResizeObserver = globalThis.ResizeObserver;
    class SyncResizeObserver {
      #callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.#callback = callback;
      }
      observe(target: Element) {
        this.#callback([{ target, contentRect: { width: 200, height: 100 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }
      unobserve() {}
      disconnect() {}
    }
    globalThis.ResizeObserver = SyncResizeObserver as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    Range.prototype.getClientRects = originalGetClientRects;
    globalThis.ResizeObserver = originalResizeObserver;
  });

  it('the text-markup overlay container has pointer-events-none once an existing highlight renders it', () => {
    const anchor = createTextAnchor(FULL_TEXT, FULL_TEXT.indexOf('brown fox'), FULL_TEXT.indexOf('brown fox') + 'brown fox'.length)!;
    const highlight = createTextHighlight({ documentId: DOC_ID, renderMode: 'raw', anchor, color: '#facc15' });
    useAppStore.setState({ annotations: [highlight] });

    const { container, cleanup } = renderAnnotator();
    try {
      const overlay = container.querySelector('div.absolute.inset-0');
      expect(overlay).not.toBeNull(); // proves the overlay actually rendered (textRects resolved)
      expect(overlay!.className).toContain('pointer-events-none');
    } finally {
      cleanup();
    }
  });
});
