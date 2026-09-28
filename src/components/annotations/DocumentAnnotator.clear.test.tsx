// @vitest-environment happy-dom
//
// Premium Study Reader — regression test for a real completeness gap found during review: "Clear
// all annotations on this document" only ever deleted geometry (ink/highlighter/shape/arrow) and
// sticky notes, silently leaving text-anchored markup (highlight/underline/strikethrough/textNote)
// behind. Fixed in DocumentAnnotator's handleClearPage; this test locks the fix in. Uses the
// two-tap confirm the toolbar itself requires (see AnnotationToolbar's own confirmClear state) —
// a real DOM click sequence against a real rendered toolbar, not a mocked callback.
import { describe, it, expect, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useAppStore } from '../../lib/store';
import { DEFAULT_WORKSPACE_ID } from '../../lib/workspace';
import { createTextHighlight, createInkAnnotation, createBookmark } from '../../lib/annotations';
import { createTextAnchor } from '../../lib/textAnchor';
import { DocumentAnnotator } from './DocumentAnnotator';

const DOC_ID = 'note:doc-clear-test';
const FULL_TEXT = 'Once upon a time there was a quick brown fox.';

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

function clickClearTwice(container: HTMLElement) {
  // Matches both the initial label ("Clear all annotations on this document") and the
  // two-tap-confirm label ("Tap again to confirm: clear all annotations on this document") — the
  // toolbar's own confirmClear state changes the wording (and capitalisation) between the two taps.
  const clear = () => Array.from(container.querySelectorAll('button')).find((b) => (b.getAttribute('aria-label') || '').includes('annotations on this document'));
  act(() => {
    clear()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  act(() => {
    clear()!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('handleClearPage — clears text-anchored markup too, not only geometry/sticky notes', () => {
  beforeEach(resetStore);

  it('removes a plain textHighlight along with an ink stroke on the same document/render mode', () => {
    const anchor = createTextAnchor(FULL_TEXT, 4, 8)!; // "upon"
    const highlight = createTextHighlight({ documentId: DOC_ID, renderMode: 'raw', anchor, color: '#facc15' });
    const ink = createInkAnnotation({ documentId: DOC_ID, renderMode: 'raw', color: '#000', thickness: 2, points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] });
    useAppStore.getState().addAnnotation(highlight);
    useAppStore.getState().addAnnotation(ink);

    const { container, cleanup } = renderAnnotator();
    try {
      clickClearTwice(container);
      const remainingIds = useAppStore.getState().annotations.map((a) => a.id);
      expect(remainingIds).not.toContain(highlight.id);
      expect(remainingIds).not.toContain(ink.id);
    } finally {
      cleanup();
    }
  });

  it('leaves the document-level bookmark untouched by Clear', () => {
    const bookmark = createBookmark({ documentId: DOC_ID, renderMode: 'raw' });
    const ink = createInkAnnotation({ documentId: DOC_ID, renderMode: 'raw', color: '#000', thickness: 2, points: [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.2 }] });
    useAppStore.getState().addAnnotation(bookmark);
    useAppStore.getState().addAnnotation(ink);

    const { container, cleanup } = renderAnnotator();
    try {
      clickClearTwice(container);
      const remainingIds = useAppStore.getState().annotations.map((a) => a.id);
      expect(remainingIds).toContain(bookmark.id);
      expect(remainingIds).not.toContain(ink.id);
    } finally {
      cleanup();
    }
  });
});
