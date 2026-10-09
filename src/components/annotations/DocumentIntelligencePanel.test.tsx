// @vitest-environment happy-dom
//
// Wave 4A targeted hardening — component-level tests for DocumentIntelligencePanel, against a REAL
// rendered DOM (same convention as AnnotationIndex.test.tsx: createRoot + act, no Selection/Range
// dependency here since this panel never reads window.getSelection() itself). Two concerns:
//
//   1. The stale-response race fix (request-generation counter in the panel's own run()) — proven
//      with DETERMINISTIC deferred promises (never arbitrary timeouts/sleeps), so "B resolves
//      before A" is a real, controlled ordering rather than a timing guess.
//   2. The new document-intelligence UI wiring itself: the panel calls the real adapter functions
//      (mocked here) with the expected arguments, and correctly renders ai_answer/source_fallback/
//      no_evidence/coverage-truncation outcomes.
//
// lib/jarvis/repositoryDocumentIntelligence.ts is mocked wholesale — this file is a UI test, not a
// re-test of that module's own already-covered grounding/retrieval/promptOverride logic (see its
// own test file for that).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DocumentIntelligencePanel, type DocumentIntelligencePanelProps } from './DocumentIntelligencePanel';
import { explainSelection, summarizeDocument, askDocumentQuestion, type DocumentIntelligenceOutcome } from '../../lib/jarvis/repositoryDocumentIntelligence';

// React 19's `act` (imported from 'react', not 'react-dom/test-utils') requires this flag
// explicitly set in a non-browser test environment, including for the ASYNC act() usage this file
// needs around deferred-promise resolution — set once, locally, here rather than touching any
// shared project-wide test setup (none currently exists for this).
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('../../lib/jarvis/repositoryDocumentIntelligence', () => ({
  explainSelection: vi.fn(),
  summarizeDocument: vi.fn(),
  askDocumentQuestion: vi.fn(),
}));

/** A real, controllable promise this test resolves/rejects on its own schedule — never an
 * arbitrary setTimeout/sleep. `run()` inside the panel awaits exactly this promise, so awaiting it
 * again here (after resolving it) ties the test's wait to the SAME microtask the component itself
 * is waiting on, rather than guessing how many ticks React needs. */
function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function aiAnswer(text: string): DocumentIntelligenceOutcome {
  return { kind: 'ai_answer', aiAnswerText: text, evidence: [{ chunk: { id: 'c1', documentId: 'note:doc-1', order: 0, text }, score: 1, citation: { documentId: 'note:doc-1', chunkId: 'c1', quote: text } }] };
}

function renderPanel(props: Partial<DocumentIntelligencePanelProps> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const onClose = vi.fn();
  act(() => {
    root.render(
      <DocumentIntelligencePanel documentId="note:doc-1" rawText="Some real document text about constitutional law." activeWorkspaceId="apfc" onClose={onClose} {...props} />,
    );
  });
  return {
    container,
    root,
    onClose,
    rerender: (next: Partial<DocumentIntelligencePanelProps>) => {
      act(() => {
        root.render(
          <DocumentIntelligencePanel documentId="note:doc-1" rawText="Some real document text about constitutional law." activeWorkspaceId="apfc" onClose={onClose} {...props} {...next} />,
        );
      });
    },
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll('button')).find((b) => (b.textContent || '').includes(text));
}

async function clickSummarise(container: HTMLElement) {
  const button = findButtonByText(container, 'Summarise document')!;
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

// React patches HTMLInputElement's own `value` setter to track changes; setting `.value` directly
// never registers as a real change, so a subsequent native 'input' event is silently ignored and
// the controlled `question` state never updates. Going through the ORIGINAL native setter (the
// standard technique for this) makes React's own change-detection see a genuine value change.
const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;

async function askQuestion(container: HTMLElement, question: string) {
  const input = container.querySelector('#jarvis-document-question') as HTMLInputElement;
  await act(async () => {
    nativeInputValueSetter.call(input, question);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const askButton = findButtonByText(container, 'Ask')!;
  await act(async () => {
    askButton.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('DocumentIntelligencePanel — stale-response race fix', () => {
  beforeEach(() => vi.clearAllMocks());

  it('1) Request A starts, request B starts afterwards, B resolves first, A resolves last: B remains visible', async () => {
    const deferredA = createDeferred<DocumentIntelligenceOutcome>();
    const deferredB = createDeferred<DocumentIntelligenceOutcome>();
    vi.mocked(summarizeDocument).mockReturnValueOnce(deferredA.promise);
    vi.mocked(askDocumentQuestion).mockReturnValueOnce(deferredB.promise);

    const { container, cleanup } = renderPanel();
    try {
      await clickSummarise(container); // request A starts
      await askQuestion(container, 'What preceded industrial capital formation?'); // request B starts afterwards

      // B resolves first.
      await act(async () => {
        deferredB.resolve(aiAnswer('B answer'));
        await deferredB.promise;
      });
      expect(container.textContent).toContain('B answer');

      // A resolves last (stale) — must NOT overwrite B's already-visible result.
      await act(async () => {
        deferredA.resolve(aiAnswer('A answer (stale)'));
        await deferredA.promise;
      });
      expect(container.textContent).toContain('B answer');
      expect(container.textContent).not.toContain('A answer (stale)');
    } finally {
      cleanup();
    }
  });

  it('2) A stale request\'s finally cannot clear a newer, still-pending request\'s loading state', async () => {
    const deferredA = createDeferred<DocumentIntelligenceOutcome>();
    const deferredB = createDeferred<DocumentIntelligenceOutcome>();
    vi.mocked(summarizeDocument).mockReturnValueOnce(deferredA.promise);
    vi.mocked(askDocumentQuestion).mockReturnValueOnce(deferredB.promise);

    const { container, cleanup } = renderPanel();
    try {
      await clickSummarise(container); // A starts
      await askQuestion(container, 'What preceded industrial capital formation?'); // B starts, supersedes A
      expect(container.textContent).toContain('Thinking…');

      // A (stale) resolves first — B is still pending, so loading must remain true.
      await act(async () => {
        deferredA.resolve(aiAnswer('A answer (stale)'));
        await deferredA.promise;
      });
      expect(container.textContent).toContain('Thinking…'); // still loading — A's finally did not clear it
      expect(container.textContent).not.toContain('A answer (stale)');

      // Now B resolves — loading clears, B's answer shows.
      await act(async () => {
        deferredB.resolve(aiAnswer('B answer'));
        await deferredB.promise;
      });
      expect(container.textContent).not.toContain('Thinking…');
      expect(container.textContent).toContain('B answer');
    } finally {
      cleanup();
    }
  });

  it('3a) a request resolving after unmount never touches state (no stray update, no throw)', async () => {
    const deferred = createDeferred<DocumentIntelligenceOutcome>();
    vi.mocked(summarizeDocument).mockReturnValueOnce(deferred.promise);

    const { container, cleanup } = renderPanel();
    await clickSummarise(container);
    cleanup(); // unmount while the request is still in flight

    // Resolving after unmount must not throw and must not attempt a React state update.
    await expect(
      act(async () => {
        deferred.resolve(aiAnswer('too late'));
        await deferred.promise;
      }),
    ).resolves.not.toThrow();
  });

  it('3b) a request resolving after the panel\'s document/context has changed never updates the visible result', async () => {
    const deferredForDocA = createDeferred<DocumentIntelligenceOutcome>();
    vi.mocked(summarizeDocument).mockReturnValueOnce(deferredForDocA.promise);

    const { container, rerender, cleanup } = renderPanel({ documentId: 'note:doc-a' });
    try {
      await clickSummarise(container); // request for doc-a starts, still pending
      expect(container.textContent).toContain('Thinking…');

      // Context changes to a different document before the request resolves.
      rerender({ documentId: 'note:doc-b' });
      expect(container.textContent).not.toContain('Thinking…'); // reset, not left "stuck loading"

      await act(async () => {
        deferredForDocA.resolve(aiAnswer('doc-a answer'));
        await deferredForDocA.promise;
      });
      expect(container.textContent).not.toContain('doc-a answer'); // stale result for the old context never lands
    } finally {
      cleanup();
    }
  });

  it('4a) ordinary single-request success is unaffected by the generation guard', async () => {
    vi.mocked(summarizeDocument).mockResolvedValueOnce(aiAnswer('A clean summary.'));
    const { container, cleanup } = renderPanel();
    try {
      await clickSummarise(container);
      expect(container.textContent).toContain('A clean summary.');
      expect(container.textContent).not.toContain('Thinking…');
    } finally {
      cleanup();
    }
  });

  it('4b) ordinary single-request error/fallback behaviour is unaffected by the generation guard', async () => {
    vi.mocked(summarizeDocument).mockRejectedValueOnce(new Error('boom'));
    const { container, cleanup } = renderPanel();
    try {
      await clickSummarise(container);
      expect(container.textContent).toContain('Something went wrong while asking JARVIS');
      expect(container.textContent).not.toContain('Thinking…');
    } finally {
      cleanup();
    }
  });
});

describe('DocumentIntelligencePanel — new UI wiring reaches the intended adapter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opening with a selected passage calls explainSelection with the real selected text, documentId and workspace', async () => {
    vi.mocked(explainSelection).mockResolvedValueOnce(aiAnswer('Explained.'));
    const { container, cleanup } = renderPanel({ initialSelectedText: 'Merchant capitalism preceded industrial capital formation.' });
    try {
      await act(async () => {
        await Promise.resolve();
      });
      expect(explainSelection).toHaveBeenCalledWith(
        expect.objectContaining({ documentId: 'note:doc-1', activeWorkspaceId: 'apfc', selectedText: 'Merchant capitalism preceded industrial capital formation.' }),
      );
      expect(container.textContent).toContain('Explained.');
    } finally {
      cleanup();
    }
  });

  it('"Summarise document" calls summarizeDocument with the real rawText and documentId', async () => {
    vi.mocked(summarizeDocument).mockResolvedValueOnce(aiAnswer('Summary.'));
    const { container, cleanup } = renderPanel({ rawText: 'The actual document body.' });
    try {
      await clickSummarise(container);
      expect(summarizeDocument).toHaveBeenCalledWith(expect.objectContaining({ documentId: 'note:doc-1', rawText: 'The actual document body.' }));
    } finally {
      cleanup();
    }
  });

  it('typing a question and clicking Ask calls askDocumentQuestion with the real question text', async () => {
    vi.mocked(askDocumentQuestion).mockResolvedValueOnce(aiAnswer('Answer.'));
    const { container, cleanup } = renderPanel();
    try {
      await askQuestion(container, 'What does due process require?');
      expect(askDocumentQuestion).toHaveBeenCalledWith(expect.objectContaining({ question: 'What does due process require?' }));
      expect(container.textContent).toContain('Answer.');
    } finally {
      cleanup();
    }
  });

  it('renders the honest source_fallback outcome (no AI provider) without claiming a fabricated answer', async () => {
    vi.mocked(summarizeDocument).mockResolvedValueOnce({
      kind: 'source_fallback',
      reason: 'AI is not available right now — showing the matching source passage instead.',
      evidence: [{ chunk: { id: 'c1', documentId: 'note:doc-1', order: 0, text: 'Real source text.' }, score: 1, citation: { documentId: 'note:doc-1', chunkId: 'c1', quote: 'Real source text.' } }],
    });
    const { container, cleanup } = renderPanel();
    try {
      await clickSummarise(container);
      expect(container.textContent).toContain('AI is not available right now');
      expect(container.textContent).toContain('Real source text.');
    } finally {
      cleanup();
    }
  });

  it('renders the no_evidence outcome honestly, with no source passages shown', async () => {
    vi.mocked(askDocumentQuestion).mockResolvedValueOnce({ kind: 'no_evidence', evidence: [], reason: 'Nothing in this document matches that yet.' });
    const { container, cleanup } = renderPanel();
    try {
      await askQuestion(container, 'xenobiology quasar telemetry');
      expect(container.textContent).toContain('Nothing in this document matches that yet.');
    } finally {
      cleanup();
    }
  });

  it('discloses truncated coverage visibly when summarizeDocument reports it', async () => {
    vi.mocked(summarizeDocument).mockResolvedValueOnce({ ...aiAnswer('Bounded summary.'), coverage: { coveredChunks: 4, totalChunks: 20, truncated: true } });
    const { container, cleanup } = renderPanel();
    try {
      await clickSummarise(container);
      expect(container.textContent).toContain('only the first 4 of 20 sections');
    } finally {
      cleanup();
    }
  });
});
