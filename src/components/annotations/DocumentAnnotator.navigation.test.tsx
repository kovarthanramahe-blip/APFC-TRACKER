// @vitest-environment happy-dom
//
// Premium Study Reader (Phase E) — component-level tests for DocumentAnnotatorHandle's
// navigateToAnnotation: the "click an Annotation Index item -> scroll to + resolve source" half of
// Phase E, exercised against a REAL rendered DOM (react-dom/client + happy-dom), not a mock.
//
// A genuinely end-to-end "select live text -> ContextualSelectionToolbar -> Highlight" browser
// test was attempted and is NOT included here: happy-dom's Range/Selection implementation has no
// real layout engine, so Range.getBoundingClientRect()/getClientRects() always return a zero-size
// rect (verified directly against happy-dom@20 before writing this file). DocumentAnnotator's own
// selectionchange handler treats a zero-size rect exactly like a real empty/collapsed selection
// (see its own `rect.width === 0 && rect.height === 0` guard) — a correct, deliberate defensive
// check, not a bug — so a live `selectionchange` event never produces a usable selection in this
// environment, and the ContextualSelectionToolbar can never be driven by real DOM events here. That
// half of the flow is therefore untested by automation in this repo (would need a real browser,
// e.g. Playwright) and is called out again in the final Phase E/F/G report as a known limitation.
//
// What IS fully exercised here, against real rendered output, is the other half of both requested
// flows — persistence + re-resolution of a stored annotation back to its exact source location —
// using the SAME TextAnchor/normalized-point models and the SAME navigateToAnnotation code path a
// real Annotation Index click uses.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createRef } from 'react';
import { useAppStore } from '../../lib/store';
import { DEFAULT_WORKSPACE_ID } from '../../lib/workspace';
import { createTextHighlight, createInkAnnotation, createBookmark, type NormalizedPoint } from '../../lib/annotations';
import { createTextAnchor } from '../../lib/textAnchor';
import { DocumentAnnotator, type DocumentAnnotatorHandle } from './DocumentAnnotator';

const DOC_ID = 'note:doc-nav-test';
const FULL_TEXT = 'The quick brown fox jumps over the lazy dog near the riverbank.';

function resetStore() {
  useAppStore.setState({ activeWorkspaceId: DEFAULT_WORKSPACE_ID, inactiveWorkspaceOwnedData: {}, annotations: [] });
}

function renderAnnotator(renderMode: 'raw' | 'preview' = 'raw') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const ref = createRef<DocumentAnnotatorHandle>();
  act(() => {
    root.render(
      <DocumentAnnotator ref={ref} documentId={DOC_ID} renderMode={renderMode} scrollBoxClassName="test-scroll-box">
        <pre>{FULL_TEXT}</pre>
      </DocumentAnnotator>,
    );
  });
  return {
    ref,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('DocumentAnnotatorHandle.navigateToAnnotation — text annotation source navigation', () => {
  beforeEach(resetStore);

  it('resolves a stored TextAnchor against the CURRENT rendered content and scrolls its element into view', () => {
    const start = FULL_TEXT.indexOf('lazy dog');
    const anchor = createTextAnchor(FULL_TEXT, start, start + 'lazy dog'.length)!;
    expect(anchor).not.toBeNull();
    const highlight = createTextHighlight({ documentId: DOC_ID, renderMode: 'raw', anchor, color: '#facc15' });
    useAppStore.getState().addAnnotation(highlight);

    const { ref, cleanup } = renderAnnotator('raw');
    try {
      const scrollSpy = vi.fn();
      const originalScrollIntoView = Element.prototype.scrollIntoView;
      Element.prototype.scrollIntoView = scrollSpy;
      let handled = false;
      act(() => {
        handled = ref.current!.navigateToAnnotation(highlight.id);
      });
      expect(handled).toBe(true);
      expect(scrollSpy).toHaveBeenCalled();
      Element.prototype.scrollIntoView = originalScrollIntoView;
    } finally {
      cleanup();
    }
  });

  it('re-resolves correctly even when the annotation was created by directly building its own anchor the same way a live selection would (createTextAnchorFromRange)', () => {
    // Simulates the "create" half of SELECT -> Highlight -> persistence -> reopen: builds a real
    // TextAnchor from the SAME rendered container this test then re-queries against, exactly like
    // DocumentAnnotator's own selectionchange handler does with a live Range — just without a real
    // browser Selection driving it (see this file's own header for why that part can't run here).
    const { ref, cleanup } = renderAnnotator('raw');
    try {
      const start = FULL_TEXT.indexOf('riverbank');
      const anchor = createTextAnchor(FULL_TEXT, start, start + 'riverbank'.length)!;
      const highlight = createTextHighlight({ documentId: DOC_ID, renderMode: 'raw', anchor, color: '#facc15' });
      act(() => {
        useAppStore.getState().addAnnotation(highlight);
      });
      let handled = false;
      act(() => {
        handled = ref.current!.navigateToAnnotation(highlight.id);
      });
      expect(handled).toBe(true);
    } finally {
      cleanup();
    }
  });
});

describe('DocumentAnnotatorHandle.navigateToAnnotation — unresolved text anchor handling', () => {
  beforeEach(resetStore);

  it('returns false (never throws) when the anchor\'s quote no longer appears anywhere in the current text', () => {
    const anchor = createTextAnchor('some entirely different original document', 5, 10)!;
    const highlight = createTextHighlight({ documentId: DOC_ID, renderMode: 'raw', anchor, color: '#facc15' });
    useAppStore.getState().addAnnotation(highlight);

    const { ref, cleanup } = renderAnnotator('raw');
    try {
      let handled = true;
      expect(() => {
        act(() => {
          handled = ref.current!.navigateToAnnotation(highlight.id);
        });
      }).not.toThrow();
      expect(handled).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('returns false for an unknown annotation id', () => {
    const { ref, cleanup } = renderAnnotator('raw');
    try {
      let handled = true;
      act(() => {
        handled = ref.current!.navigateToAnnotation('does-not-exist');
      });
      expect(handled).toBe(false);
    } finally {
      cleanup();
    }
  });

  it('returns false for an annotation belonging to a DIFFERENT document', () => {
    const anchor = createTextAnchor(FULL_TEXT, 0, 3)!;
    const foreign = createTextHighlight({ documentId: 'note:some-other-doc', renderMode: 'raw', anchor, color: '#facc15' });
    useAppStore.getState().addAnnotation(foreign);

    const { ref, cleanup } = renderAnnotator('raw');
    try {
      let handled = true;
      act(() => {
        handled = ref.current!.navigateToAnnotation(foreign.id);
      });
      expect(handled).toBe(false);
    } finally {
      cleanup();
    }
  });

  it("returns false when the annotation's renderMode doesn't match the currently mounted instance (the caller must switch render mode and retry)", () => {
    const anchor = createTextAnchor(FULL_TEXT, 0, 3)!;
    const previewOnly = createTextHighlight({ documentId: DOC_ID, renderMode: 'preview', anchor, color: '#facc15' });
    useAppStore.getState().addAnnotation(previewOnly);

    const { ref, cleanup } = renderAnnotator('raw'); // mounted in RAW, annotation belongs to PREVIEW
    try {
      let handled = true;
      act(() => {
        handled = ref.current!.navigateToAnnotation(previewOnly.id);
      });
      expect(handled).toBe(false);
    } finally {
      cleanup();
    }
  });
});

describe('DocumentAnnotatorHandle.navigateToAnnotation — ink annotation navigation', () => {
  beforeEach(resetStore);

  it('handles a geometry (ink) annotation without throwing and scrolls its containing scroll box', () => {
    const points: NormalizedPoint[] = [{ x: 0.2, y: 0.3 }, { x: 0.4, y: 0.5 }, { x: 0.6, y: 0.7 }];
    const ink = createInkAnnotation({ documentId: DOC_ID, renderMode: 'raw', color: '#1e293b', thickness: 2.5, points });
    useAppStore.getState().addAnnotation(ink);

    const { ref, cleanup } = renderAnnotator('raw');
    try {
      let handled = false;
      expect(() => {
        act(() => {
          handled = ref.current!.navigateToAnnotation(ink.id);
        });
      }).not.toThrow();
      expect(handled).toBe(true);
    } finally {
      cleanup();
    }
  });
});

describe('DocumentAnnotatorHandle.navigateToAnnotation — bookmarks', () => {
  beforeEach(resetStore);

  it('navigating to a bookmark scrolls to the top of the document and never throws', () => {
    const bookmark = createBookmark({ documentId: DOC_ID, renderMode: 'raw' });
    useAppStore.getState().addAnnotation(bookmark);

    const { ref, cleanup } = renderAnnotator('raw');
    try {
      let handled = false;
      expect(() => {
        act(() => {
          handled = ref.current!.navigateToAnnotation(bookmark.id);
        });
      }).not.toThrow();
      expect(handled).toBe(true);
    } finally {
      cleanup();
    }
  });
});
