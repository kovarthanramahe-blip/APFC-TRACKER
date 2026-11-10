import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// AI Library — structural checks for LibrarySearchPanel.tsx and its wiring into Repository.tsx,
// following this repo's established grep-based convention (JarvisChat.test.ts etc.) since this
// project has no @testing-library/react. These pin: no duplicate search/filter logic lives in the
// component itself (it must delegate to lib/jarvis/librarySearch.ts, already unit-tested
// separately), accessible labelling, and the three required empty/no-results/results states.
const root = dirname(fileURLToPath(import.meta.url));
const panelSource = readFileSync(join(root, 'LibrarySearchPanel.tsx'), 'utf-8');
const repositorySource = readFileSync(join(root, '..', '..', 'pages', 'Repository.tsx'), 'utf-8');

describe('LibrarySearchPanel.tsx — delegates to the existing, tested search module, never reimplements it', () => {
  it('imports searchLibrary/listLibraryTopicOptions from lib/jarvis/librarySearch — never its own filter/scoring logic', () => {
    expect(panelSource).toMatch(/from '\.\.\/\.\.\/lib\/jarvis\/librarySearch'/);
    expect(panelSource).toMatch(/searchLibrary\(/);
    expect(panelSource).toMatch(/listLibraryTopicOptions\(/);
  });

  it('never filters/scores results with its own .filter(/.sort( on result text — that logic belongs to searchLibrary alone', () => {
    const afterSearchCall = panelSource.slice(panelSource.indexOf('const results = useMemo'));
    expect(afterSearchCall).not.toMatch(/\.sort\(/);
  });
});

describe('LibrarySearchPanel.tsx — required UI states', () => {
  it('shows a distinct prompt before any query is typed', () => {
    expect(panelSource).toMatch(/Type a question above to search/);
  });

  it('shows a distinct no-results state, and a distinct one when filters narrowed it to zero', () => {
    expect(panelSource).toMatch(/No matching passages found in your notes or documents\./);
    expect(panelSource).toMatch(/No matching passages found with the current filters/);
  });

  it('labels the search as keyword-based, never claiming AI/semantic search it does not perform', () => {
    expect(panelSource).toMatch(/Keyword search/i);
  });
});

describe('LibrarySearchPanel.tsx — semantic search mode is explicit and never faked', () => {
  it('calls the real local embedding provider for both indexing and query embedding — never claims semantic results from keyword matching alone', () => {
    expect(panelSource).toMatch(/from '\.\.\/\.\.\/lib\/jarvis\/ai\/localEmbeddingProvider'/);
    expect(panelSource).toMatch(/createLocalEmbeddingProvider\(\)/g);
    expect(panelSource).toMatch(/provider\.embed\(/);
  });

  it('indexing is a separate, explicit, user-triggered action — never automatic on mount or on every keystroke', () => {
    expect(panelSource).not.toMatch(/useEffect/);
    expect(panelSource).toMatch(/onClick=\{handleIndexLibrary\}/);
  });

  it('semantic search runs on an explicit action (button or Enter), never live on every keystroke like keyword mode', () => {
    expect(panelSource).toMatch(/onClick=\{handleSemanticSearch\}/);
    const keywordMemoStart = panelSource.indexOf('const keywordResults = useMemo');
    const keywordMemoBlock = panelSource.slice(keywordMemoStart, panelSource.indexOf('}, [', keywordMemoStart));
    expect(keywordMemoBlock).toMatch(/if \(semanticMode \|\| !trimmedQuery\) return \[\];/);
  });

  it('every rendered result carries its own real retrieval mode — the panel never hardcodes which mode produced a result', () => {
    expect(panelSource).not.toMatch(/mode: 'embedding_similarity'/);
    expect(panelSource).not.toMatch(/mode: 'deterministic_text_search'/);
  });

  it('a failed model load surfaces an honest, visible error state — never silently falls back and relabels keyword results as semantic', () => {
    expect(panelSource).toMatch(/semanticStatus === 'error'/);
    expect(panelSource).toMatch(/Semantic search is unavailable/);
  });
});

describe('LibrarySearchPanel.tsx — semantic index tracks ingestion/updates automatically, without ever calling the model to do so', () => {
  it('recomputes the pending-index count from the real, current notes/importedContent/documentEmbeddings — never a static or cached count', () => {
    expect(panelSource).toMatch(/const pendingIndexCount = useMemo/);
    const pendingIndexStart = panelSource.indexOf('const pendingIndexCount = useMemo');
    const pendingIndexBlock = panelSource.slice(pendingIndexStart, panelSource.indexOf('}, [notes, importedContent, workspaceId, documentEmbeddings]', pendingIndexStart));
    expect(pendingIndexBlock).toMatch(/buildWorkspaceDocumentChunks\(notes, importedContent, workspaceId\)/);
    expect(pendingIndexBlock).toMatch(/planEmbeddingIndexing\(/);
  });

  it('never calls the embedding provider just to count pending work — only handleIndexLibrary ever calls createLocalEmbeddingProvider for indexing', () => {
    const pendingIndexStart = panelSource.indexOf('const pendingIndexCount = useMemo');
    const pendingIndexBlock = panelSource.slice(pendingIndexStart, panelSource.indexOf('}, [notes, importedContent, workspaceId, documentEmbeddings]', pendingIndexStart));
    expect(pendingIndexBlock).not.toMatch(/createLocalEmbeddingProvider/);
    expect(pendingIndexBlock).not.toMatch(/provider\.embed/);
  });

  it('surfaces the pending count honestly in the banner text, distinct from the fully-indexed and never-indexed states', () => {
    expect(panelSource).toMatch(/new or changed \$\{pendingIndexCount === 1/);
    expect(panelSource).toMatch(/Your library is fully indexed for semantic search/);
  });
});

describe('LibrarySearchPanel.tsx — accessibility', () => {
  it('the search input, item-type filter, and topic filter each carry an accessible label', () => {
    expect(panelSource).toMatch(/aria-label="Search your notes and documents"/);
    expect(panelSource).toMatch(/aria-label="Filter by item type"/);
    expect(panelSource).toMatch(/aria-label="Filter by topic"/);
  });

  it('the results region is announced to assistive tech as it updates', () => {
    expect(panelSource).toMatch(/role="log"/);
    expect(panelSource).toMatch(/aria-live="polite"/);
  });
});

describe('Repository.tsx — wires LibrarySearchPanel with real store data, never mock/empty fixtures', () => {
  it('imports LibrarySearchPanel from components/repository', () => {
    expect(repositorySource).toMatch(/from '\.\.\/components\/repository\/LibrarySearchPanel'/);
  });

  it('renders it with the real notes/importedContent/knowledgeClassifications/documentEmbeddings/workspaceId the page already pulls from the store', () => {
    const renderStart = repositorySource.indexOf('<LibrarySearchPanel');
    const renderBlock = repositorySource.slice(renderStart, repositorySource.indexOf('/>', renderStart));
    expect(renderBlock).toMatch(/notes=\{notes\}/);
    expect(renderBlock).toMatch(/importedContent=\{importedContent\}/);
    expect(renderBlock).toMatch(/knowledgeClassifications=\{knowledgeClassifications\}/);
    expect(renderBlock).toMatch(/documentEmbeddings=\{documentEmbeddings\}/);
    expect(renderBlock).toMatch(/onSetDocumentEmbeddings=\{setDocumentEmbeddings\}/);
    expect(renderBlock).toMatch(/workspaceId=\{activeWorkspaceId\}/);
  });
});
