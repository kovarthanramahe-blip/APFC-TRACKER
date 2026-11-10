// AI Library — unified cross-category search panel.
//
// Deliberately separate from the existing "Search repository" input further down this page: that
// one filters the VISIBLE LIST of items by title/content substring; this one searches INSIDE every
// note's and document's actual text via the existing deterministic retrieval pipeline
// (lib/jarvis/librarySearch.ts -> workspaceContentBridge.ts), returning cited passages a user can
// open directly.
//
// Semantic search (Phase 2): an explicit, separate mode — never silently blended with keyword
// search, never claimed as "AI-powered" when it's actually just keyword matching. Keyword search
// stays live-as-you-type (useMemo, synchronous, unchanged); semantic search is an explicit,
// on-demand action (its own button) because it requires an async call to a real local embedding
// model (lib/jarvis/ai/localEmbeddingProvider.ts) that should never fire on every keystroke.
// Building the semantic index is a SEPARATE, explicit action too (never automatic on mount/typing)
// — see handleIndexLibrary below — exactly matching this app's existing "AI involvement is always
// visible and opt-in, never silently triggered" convention (the Android local LLM's own "Load
// model" button follows the same rule).
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, X, Sparkles, Loader2 } from 'lucide-react';
import { Card, Badge, Button } from '../ui/Primitives';
import type { Note } from '../../lib/types';
import type { ImportedContent } from '../../lib/contentImport';
import type { KnowledgeClassification } from '../../lib/knowledgeClassification';
import type { WorkspaceKind } from '../../lib/workspace';
import { searchLibrary, listLibraryTopicOptions, type LibrarySearchResult } from '../../lib/jarvis/librarySearch';
import { buildWorkspaceDocumentChunks, type WorkspaceContentItemType } from '../../lib/jarvis/workspaceContentBridge';
import { planEmbeddingIndexing, hashChunkText, type JarvisDocumentEmbeddingRecord } from '../../lib/jarvis/documents/embeddingIndex';
import { createLocalEmbeddingProvider, LOCAL_EMBEDDING_MODEL_ID, LOCAL_EMBEDDING_DIMENSIONS } from '../../lib/jarvis/ai/localEmbeddingProvider';
import { repositoryDetailPathFor } from '../../lib/repositoryNavigation';

interface LibrarySearchPanelProps {
  notes: readonly Note[];
  importedContent: readonly ImportedContent[];
  knowledgeClassifications: readonly KnowledgeClassification[];
  documentEmbeddings: readonly JarvisDocumentEmbeddingRecord[];
  onSetDocumentEmbeddings: (records: JarvisDocumentEmbeddingRecord[]) => void;
  workspaceId: WorkspaceKind;
}

const RESULT_LIMIT = 20;
const EMBED_BATCH_SIZE = 8;

type IndexStatus = 'idle' | 'indexing' | 'error';
type SemanticSearchStatus = 'idle' | 'searching' | 'error';

export function LibrarySearchPanel({ notes, importedContent, knowledgeClassifications, documentEmbeddings, onSetDocumentEmbeddings, workspaceId }: LibrarySearchPanelProps) {
  const [query, setQuery] = useState('');
  const [itemTypeFilter, setItemTypeFilter] = useState<WorkspaceContentItemType | ''>('');
  const [topicFilter, setTopicFilter] = useState('');
  const [semanticMode, setSemanticMode] = useState(false);

  const [indexStatus, setIndexStatus] = useState<IndexStatus>('idle');
  const [indexProgress, setIndexProgress] = useState<{ done: number; total: number } | null>(null);

  const [semanticStatus, setSemanticStatus] = useState<SemanticSearchStatus>('idle');
  const [semanticResults, setSemanticResults] = useState<LibrarySearchResult[] | null>(null);
  const [semanticQueryRun, setSemanticQueryRun] = useState('');

  // Built once per mount from the real taxonomies (lib/apfcSyllabusTaxonomy.ts /
  // lib/upscCseKnowledgeTaxonomy.ts) — never a hand-maintained duplicate list.
  const topicOptions = useMemo(() => listLibraryTopicOptions(), []);

  const trimmedQuery = query.trim();
  const hasFiltersActive = itemTypeFilter !== '' || topicFilter !== '';

  const keywordResults = useMemo<LibrarySearchResult[]>(() => {
    if (semanticMode || !trimmedQuery) return [];
    return searchLibrary(notes, importedContent, knowledgeClassifications, workspaceId, {
      question: trimmedQuery,
      itemType: itemTypeFilter || undefined,
      topicId: topicFilter || undefined,
      limit: RESULT_LIMIT,
    });
  }, [semanticMode, notes, importedContent, knowledgeClassifications, workspaceId, trimmedQuery, itemTypeFilter, topicFilter]);

  // Whether a current index already exists for the model this build actually uses — never
  // assumed true just because SOME embeddings exist (a stale, different-model index doesn't
  // count; semanticSearchChunks would silently skip every one of those chunks anyway, but the UI
  // should be honest about "not indexed for this model" rather than offering a search that would
  // quietly return nothing).
  const hasCurrentModelIndex = useMemo(() => documentEmbeddings.some((r) => r.modelId === LOCAL_EMBEDDING_MODEL_ID && r.dimensions === LOCAL_EMBEDDING_DIMENSIONS), [documentEmbeddings]);

  // Integration with ingestion/updates (requirement: new/edited content must be tracked, not just
  // a one-off manual index): planEmbeddingIndexing is pure and synchronous (content-hash
  // comparison only, no model call — see embeddingIndex.ts), so it's safe to recompute on every
  // notes/importedContent change purely to COUNT what has drifted since the last index. This never
  // invokes the real embedding model itself; it only makes the drift visible, honestly, the moment
  // a document is imported, edited, or deleted — handleIndexLibrary (the explicit, user-triggered
  // action) is still the only thing that ever actually computes a new vector.
  const pendingIndexCount = useMemo(() => {
    const chunks = buildWorkspaceDocumentChunks(notes, importedContent, workspaceId);
    return planEmbeddingIndexing(chunks, documentEmbeddings, LOCAL_EMBEDDING_MODEL_ID, LOCAL_EMBEDDING_DIMENSIONS).toCompute.length;
  }, [notes, importedContent, workspaceId, documentEmbeddings]);

  async function handleIndexLibrary() {
    setIndexStatus('indexing');
    setIndexProgress({ done: 0, total: 0 });
    try {
      const chunks = buildWorkspaceDocumentChunks(notes, importedContent, workspaceId);
      const plan = planEmbeddingIndexing(chunks, documentEmbeddings, LOCAL_EMBEDDING_MODEL_ID, LOCAL_EMBEDDING_DIMENSIONS);
      setIndexProgress({ done: 0, total: plan.toCompute.length });

      if (plan.toCompute.length === 0) {
        onSetDocumentEmbeddings([...plan.toKeep]);
        setIndexStatus('idle');
        return;
      }

      const provider = createLocalEmbeddingProvider();
      const newRecords: JarvisDocumentEmbeddingRecord[] = [];

      for (let i = 0; i < plan.toCompute.length; i += EMBED_BATCH_SIZE) {
        const batch = plan.toCompute.slice(i, i + EMBED_BATCH_SIZE);
        const vectors = await provider.embed(batch.map((c) => c.text));
        batch.forEach((chunk, idx) => {
          newRecords.push({
            documentId: chunk.documentId,
            chunkId: chunk.id,
            modelId: LOCAL_EMBEDDING_MODEL_ID,
            dimensions: LOCAL_EMBEDDING_DIMENSIONS,
            vector: vectors[idx],
            contentHash: hashChunkText(chunk.text),
            computedAt: new Date().toISOString(),
          });
        });
        setIndexProgress({ done: Math.min(i + EMBED_BATCH_SIZE, plan.toCompute.length), total: plan.toCompute.length });
      }

      onSetDocumentEmbeddings([...plan.toKeep, ...newRecords]);
      setIndexStatus('idle');
    } catch {
      // Honest failure, never a silent partial index presented as complete — the real local
      // model could not be loaded (e.g. no network for its first-use download). Whatever was
      // already indexed before this run stays untouched (onSetDocumentEmbeddings is never
      // called on this path), so a retry later never redoes work that already succeeded.
      setIndexStatus('error');
    }
  }

  async function handleSemanticSearch() {
    if (!trimmedQuery) {
      setSemanticResults(null);
      return;
    }
    setSemanticStatus('searching');
    setSemanticQueryRun(trimmedQuery);
    try {
      const provider = createLocalEmbeddingProvider();
      const [queryVector] = await provider.embed([trimmedQuery]);
      const results = searchLibrary(notes, importedContent, knowledgeClassifications, workspaceId, {
        question: trimmedQuery,
        itemType: itemTypeFilter || undefined,
        topicId: topicFilter || undefined,
        limit: RESULT_LIMIT,
        semantic: { queryVector, modelId: LOCAL_EMBEDDING_MODEL_ID, dimensions: LOCAL_EMBEDDING_DIMENSIONS, embeddingRecords: documentEmbeddings },
      });
      setSemanticResults(results);
      setSemanticStatus('idle');
    } catch {
      setSemanticResults(null);
      setSemanticStatus('error');
    }
  }

  const displayedResults = semanticMode ? (semanticResults ?? []) : keywordResults;
  const isSemanticBusy = semanticMode && semanticStatus === 'searching';

  function renderResultList(items: LibrarySearchResult[]) {
    return (
      <ul className="space-y-2">
        {items.map((r) => (
          <li key={`${r.documentId}-${r.score}`}>
            <Link
              to={repositoryDetailPathFor(r.itemType, r.itemId)}
              className="block rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate font-medium text-slate-700 dark:text-slate-200">{r.title}</span>
                <span className="shrink-0 text-xs text-slate-400">{r.itemType === 'note' ? 'Note' : 'Document'}</span>
              </div>
              <p className="line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{r.quote}</p>
              {r.classifications.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {r.classifications.map((c) => (
                    <Badge key={`${c.taxonomy}:${c.topicId}`} tone={c.status === 'confirmed' ? 'success' : 'neutral'} className="text-[10px]">
                      {c.topicTitle}
                    </Badge>
                  ))}
                </div>
              )}
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Card className="mb-5 p-4">
      <div className="mb-3 flex items-center gap-1.5">
        <Search className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Library search</p>
        <button
          type="button"
          onClick={() => setSemanticMode((v) => !v)}
          aria-pressed={semanticMode}
          aria-label="Toggle semantic search"
          className="ml-auto flex items-center gap-1"
        >
          <Badge tone={semanticMode ? 'jarvis' : 'neutral'} className="gap-1">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            {semanticMode ? 'Semantic search (meaning-based)' : 'Keyword search · works without AI'}
          </Badge>
        </button>
      </div>

      {semanticMode && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-slate-200 dark:border-slate-800 p-2.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex-1">
            {!hasCurrentModelIndex
              ? 'Semantic search needs a one-time local index. This downloads a small AI model the first time and runs entirely on this device.'
              : pendingIndexCount > 0
                ? `${pendingIndexCount} new or changed ${pendingIndexCount === 1 ? 'passage needs' : 'passages need'} indexing (tracked automatically as you import, edit, or delete content).`
                : 'Your library is fully indexed for semantic search — every note and document is accounted for.'}
          </span>
          <Button type="button" variant="secondary" size="sm" onClick={handleIndexLibrary} disabled={indexStatus === 'indexing'}>
            {indexStatus === 'indexing' ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
            {indexStatus === 'indexing' && indexProgress
              ? indexProgress.total > 0
                ? `Indexing ${indexProgress.done}/${indexProgress.total}…`
                : 'Preparing…'
              : hasCurrentModelIndex
                ? pendingIndexCount > 0
                  ? `Index ${pendingIndexCount} new`
                  : 'Re-index library'
                : 'Index library'}
          </Button>
          {indexStatus === 'error' && (
            <span className="w-full text-rose-500 dark:text-rose-400">Could not load the local embedding model (likely no network on first use). Keyword search still works normally.</span>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative flex-1 min-w-[200px]">
          <label htmlFor="library-search-query" className="sr-only">
            Search your notes and documents
          </label>
          <input
            id="library-search-query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (semanticMode && e.key === 'Enter') {
                e.preventDefault();
                void handleSemanticSearch();
              }
            }}
            placeholder={semanticMode ? 'Describe what you’re looking for, then press Enter…' : 'Search your notes and documents…'}
            aria-label="Search your notes and documents"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent py-2 pl-3 pr-9 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSemanticResults(null);
              }}
              aria-label="Clear library search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {semanticMode && (
          <Button type="button" variant="secondary" size="sm" onClick={handleSemanticSearch} disabled={isSemanticBusy || !trimmedQuery}>
            {isSemanticBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Search className="h-3.5 w-3.5" aria-hidden="true" />}
            {isSemanticBusy ? 'Searching…' : 'Search'}
          </Button>
        )}

        <label htmlFor="library-search-item-type" className="sr-only">
          Filter by item type
        </label>
        <select
          id="library-search-item-type"
          value={itemTypeFilter}
          onChange={(e) => setItemTypeFilter(e.target.value as WorkspaceContentItemType | '')}
          aria-label="Filter by item type"
          className="rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
        >
          <option value="">All item types</option>
          <option value="note">Notes</option>
          <option value="imported_content">Documents</option>
        </select>

        <label htmlFor="library-search-topic" className="sr-only">
          Filter by topic
        </label>
        <select
          id="library-search-topic"
          value={topicFilter}
          onChange={(e) => setTopicFilter(e.target.value)}
          aria-label="Filter by topic"
          className="max-w-[220px] rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
        >
          <option value="">All topics</option>
          {topicOptions.map((t) => (
            <option key={`${t.taxonomy}:${t.topicId}`} value={t.topicId}>
              {t.subjectTitle} · {t.topicTitle}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-3" role="log" aria-live="polite" aria-label="Library search results">
        {semanticMode && semanticStatus === 'error' ? (
          <p className="py-6 text-center text-xs text-rose-500 dark:text-rose-400">
            Semantic search is unavailable right now (the local model could not be loaded). Turn off semantic search above to use keyword search instead.
          </p>
        ) : trimmedQuery === '' ? (
          <p className="py-6 text-center text-xs text-slate-400">Type a question above to search your notes and documents.</p>
        ) : semanticMode && semanticQueryRun !== trimmedQuery ? (
          <p className="py-6 text-center text-xs text-slate-400">Press Enter or Search to run a semantic search for this query.</p>
        ) : isSemanticBusy ? (
          <p className="py-6 text-center text-xs text-slate-400">Searching by meaning…</p>
        ) : displayedResults.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">
            {hasFiltersActive ? 'No matching passages found with the current filters. Try clearing a filter.' : 'No matching passages found in your notes or documents.'}
          </p>
        ) : (
          renderResultList(displayedResults)
        )}
      </div>
    </Card>
  );
}
