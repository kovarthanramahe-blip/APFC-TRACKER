// @vitest-environment happy-dom
//
// Premium Study Reader (Phase E) — component-level tests for the Annotation Index panel's empty
// states (per-category and whole-panel) and its basic item rendering, against a REAL rendered DOM.
// This panel has no dependency on browser Selection/Range at all (see
// DocumentAnnotator.navigation.test.tsx's own header for why THAT area's live-selection flow can't
// be simulated in happy-dom) — it only reads the store's `annotations` field — so it renders fully
// here.
import { describe, it, expect, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useAppStore } from '../../lib/store';
import { DEFAULT_WORKSPACE_ID } from '../../lib/workspace';
import { createTextHighlight, createBookmark } from '../../lib/annotations';
import { createTextAnchor } from '../../lib/textAnchor';
import { AnnotationIndex } from './AnnotationIndex';

const DOC_ID = 'note:doc-index-test';

function resetStore() {
  useAppStore.setState({ activeWorkspaceId: DEFAULT_WORKSPACE_ID, inactiveWorkspaceOwnedData: {}, annotations: [] });
}

function renderIndex() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(<AnnotationIndex documentId={DOC_ID} onNavigate={() => {}} onClose={() => {}} />);
  });
  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('AnnotationIndex — empty states', () => {
  beforeEach(resetStore);

  it('shows the whole-panel empty state when the document has no annotations at all', () => {
    const { container, cleanup } = renderIndex();
    try {
      expect(container.textContent).toContain('No annotations yet');
    } finally {
      cleanup();
    }
  });

  it("shows a category-specific empty state for a category with nothing in it, while the panel overall has annotations", () => {
    const anchor = createTextAnchor('some source text here', 0, 4)!;
    useAppStore.getState().addAnnotation(createTextHighlight({ documentId: DOC_ID, renderMode: 'raw', anchor, color: '#facc15' }));
    const { container, cleanup } = renderIndex();
    try {
      // Only a Highlights-category annotation exists — switch to the Bookmarks tab.
      const bookmarksTab = Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Bookmarks');
      expect(bookmarksTab).toBeTruthy();
      act(() => {
        bookmarksTab!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(container.textContent).toContain('No bookmarks match here yet');
    } finally {
      cleanup();
    }
  });
});

describe('AnnotationIndex — rendering real annotations', () => {
  beforeEach(resetStore);

  it("renders a highlight's quote as its preview text", () => {
    const anchor = createTextAnchor('The mitochondria is the powerhouse of the cell', 4, 16)!; // "mitochondria"
    useAppStore.getState().addAnnotation(createTextHighlight({ documentId: DOC_ID, renderMode: 'raw', anchor, color: '#facc15' }));
    const { container, cleanup } = renderIndex();
    try {
      expect(container.textContent).toContain('mitochondria');
    } finally {
      cleanup();
    }
  });

  it('shows a bookmark item and the document annotation count in the header', () => {
    useAppStore.getState().addAnnotation(createBookmark({ documentId: DOC_ID, renderMode: 'raw' }));
    const { container, cleanup } = renderIndex();
    try {
      expect(container.textContent).toContain('Annotations (1)');
      expect(container.textContent).toContain('Bookmarked');
    } finally {
      cleanup();
    }
  });
});
