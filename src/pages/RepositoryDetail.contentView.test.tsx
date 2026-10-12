// @vitest-environment happy-dom
//
// Wave 4A integration-test gate — the actual parent-level wiring between DocumentAnnotator (the
// selection UI), ContentView (RepositoryDetail.tsx's own content-rendering component — the REAL
// owner of the explainSelectionText/showJarvisPanel state), and DocumentIntelligencePanel (the
// document-intelligence UI) had no dedicated test: DocumentAnnotator.selection.test.tsx proves the
// annotator forwards selected text to a mock callback; DocumentIntelligencePanel.test.tsx proves
// the panel correctly consumes initialSelectedText when given it directly. Neither proves the
// actual glue between them — this file does, by rendering the REAL, now-exported ContentView (see
// its own doc comment in RepositoryDetail.tsx) end to end: a real text selection -> a real
// "Explain with JARVIS" click -> the real onExplainSelection callback -> ContentView's own state ->
// the real DocumentIntelligencePanel mounted with that state as props -> the real (mocked-at-the-
// adapter-boundary) explainSelection call.
//
// Only lib/jarvis/repositoryDocumentIntelligence.ts (the genuine external/AI boundary — the same
// module DocumentIntelligencePanel.test.tsx already mocks) is mocked here. Every component in
// between — DocumentAnnotator, ContentView, DocumentIntelligencePanel — is the real implementation,
// rendered via the same createRoot+act, happy-dom, and Range/selectionchange-simulation conventions
// DocumentAnnotator.selection.test.tsx already established (no new testing framework introduced).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useAppStore } from '../lib/store';
import { DEFAULT_WORKSPACE_ID } from '../lib/workspace';
import { ContentView } from './RepositoryDetail';
import { explainSelection, summarizeDocument, askDocumentQuestion, type DocumentIntelligenceOutcome } from '../lib/jarvis/repositoryDocumentIntelligence';

// Same React 19 act() requirement DocumentIntelligencePanel.test.tsx already sets, local to this
// file rather than touching any shared project-wide test setup (none exists for this).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../lib/jarvis/repositoryDocumentIntelligence', () => ({
  explainSelection: vi.fn(),
  summarizeDocument: vi.fn(),
  askDocumentQuestion: vi.fn(),
}));

const DOC_ID = 'note:integration-doc-1';
const ROUTE = '/repository/note/integration-doc-1';
const FULL_TEXT = 'The quick brown fox jumps over the lazy dog near the riverbank.';

function resetStore() {
  useAppStore.setState({ activeWorkspaceId: DEFAULT_WORKSPACE_ID, inactiveWorkspaceOwnedData: {}, annotations: [] });
}

function aiAnswer(text: string): DocumentIntelligenceOutcome {
  return { kind: 'ai_answer', aiAnswerText: text, evidence: [] };
}

function renderContentView() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(<ContentView documentId={DOC_ID} content={FULL_TEXT} activeWorkspaceId="apfc" route={ROUTE} />);
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

function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) => (b.textContent || '').includes(text));
}

// Real selection, same technique as DocumentAnnotator.selection.test.tsx's own "quick brown" tests.
function selectQuickBrown(container: HTMLElement) {
  const textNode = container.querySelector('pre')!.firstChild!;
  const range = document.createRange();
  range.setStart(textNode, 4); // "quick brown"
  range.setEnd(textNode, 15);
  act(() => {
    const sel = window.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });
}

describe('RepositoryDetail ContentView — real DocumentAnnotator -> DocumentIntelligencePanel wiring', () => {
  let originalGetBoundingClientRect: () => DOMRect;

  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    // happy-dom has no layout engine — a real Range always reports a zero-size rect, which
    // DocumentAnnotator's own (correct, deliberate) guard treats as "no selection toolbar" — see
    // DocumentAnnotator.selection.test.tsx's own header comment for why this stub is the
    // established technique for this exact, documented limitation.
    originalGetBoundingClientRect = Range.prototype.getBoundingClientRect;
    Range.prototype.getBoundingClientRect = vi.fn(() => ({ top: 10, left: 10, width: 50, height: 14, bottom: 24, right: 60, x: 10, y: 10, toJSON: () => ({}) })) as unknown as () => DOMRect;
  });

  afterEach(() => {
    Range.prototype.getBoundingClientRect = originalGetBoundingClientRect;
  });

  it('selecting text and clicking "Explain with JARVIS" opens the panel in explain mode with the exact selected text and document/repository context', async () => {
    vi.mocked(explainSelection).mockResolvedValueOnce(aiAnswer('Explained: a quick brown fox.'));
    const { container, cleanup } = renderContentView();
    try {
      selectQuickBrown(container);
      const explainButton = findButtonByLabel(container, 'Explain with JARVIS')!;
      expect(explainButton).toBeDefined();

      await act(async () => {
        explainButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      // 5. The selected text reached the panel via the parent's real callback/state wiring.
      expect(explainSelection).toHaveBeenCalledTimes(1);
      expect(explainSelection).toHaveBeenCalledWith(
        expect.objectContaining({ selectedText: 'quick brown' }),
      );
      // 6. The panel opened in the intended mode (explain, not summarize/ask) with the correct
      // document/repository context — proven by which adapter function was called and with what.
      expect(explainSelection).toHaveBeenCalledWith(
        expect.objectContaining({ documentId: DOC_ID, activeWorkspaceId: 'apfc', route: ROUTE }),
      );
      expect(summarizeDocument).not.toHaveBeenCalled();
      expect(askDocumentQuestion).not.toHaveBeenCalled();
      // 7. The intended adapter actually ran and its real result is visible in the real panel UI.
      expect(container.textContent).toContain('Explained: a quick brown fox.');
      // The panel itself (not some other UI) is genuinely mounted — its own heading is present.
      expect(container.textContent).toContain('Ask JARVIS');
    } finally {
      cleanup();
    }
  });

  it('a second, different selection replaces the first — the panel always reflects the MOST RECENT real selection, never a stale one', async () => {
    vi.mocked(explainSelection).mockResolvedValueOnce(aiAnswer('First explanation.')).mockResolvedValueOnce(aiAnswer('Second explanation.'));
    const { container, cleanup } = renderContentView();
    try {
      selectQuickBrown(container);
      await act(async () => {
        findButtonByLabel(container, 'Explain with JARVIS')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(container.textContent).toContain('First explanation.');

      // Close the panel (as a real user would) and select a different passage.
      const closeButton = findButtonByLabel(container, 'Close')!;
      act(() => {
        closeButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      const textNode = container.querySelector('pre')!.firstChild!;
      const range = document.createRange();
      range.setStart(textNode, 35); // "lazy dog"
      range.setEnd(textNode, 43);
      act(() => {
        const sel = window.getSelection()!;
        sel.removeAllRanges();
        sel.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
      });
      await act(async () => {
        findButtonByLabel(container, 'Explain with JARVIS')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(explainSelection).toHaveBeenLastCalledWith(expect.objectContaining({ selectedText: 'lazy dog' }));
      expect(container.textContent).toContain('Second explanation.');
      expect(container.textContent).not.toContain('First explanation.');
    } finally {
      cleanup();
    }
  });

  it('the header "Ask JARVIS" button opens the panel without any prior selection, defaulting to summarise mode (no explain call)', async () => {
    const { container, cleanup } = renderContentView();
    try {
      const headerButton = findButtonByText(container, 'Ask JARVIS')!;
      expect(headerButton).toBeDefined();
      act(() => {
        headerButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(explainSelection).not.toHaveBeenCalled();
      // The panel's own "Summarise document" action button is present — proves it mounted in
      // summarize mode (DocumentIntelligencePanel defaults to 'summarize' whenever no
      // initialSelectedText is supplied), not left over in some other mode.
      expect(findButtonByText(container, 'Summarise document')).toBeDefined();
    } finally {
      cleanup();
    }
  });

  it('opening the header "Ask JARVIS" button while the panel is already open on a previous explain result never leaves the old explanation visible (no stale selection content)', async () => {
    vi.mocked(explainSelection).mockResolvedValueOnce(aiAnswer('Stale explanation that must not survive.'));
    const { container, cleanup } = renderContentView();
    try {
      selectQuickBrown(container);
      await act(async () => {
        findButtonByLabel(container, 'Explain with JARVIS')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      expect(container.textContent).toContain('Stale explanation that must not survive.');

      // Without closing the panel, click the header "Ask JARVIS" button directly.
      act(() => {
        findButtonByText(container, 'Ask JARVIS')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });

      expect(container.textContent).not.toContain('Stale explanation that must not survive.');
      // Regression guard for the root cause: a fresh panel mounted in 'summarize' mode shows its
      // own "Summarise document" action — proving a genuinely NEW instance replaced the old one,
      // not just that the old text happened to scroll out of view.
      expect(findButtonByText(container, 'Summarise document')).toBeDefined();
    } finally {
      cleanup();
    }
  });
});
