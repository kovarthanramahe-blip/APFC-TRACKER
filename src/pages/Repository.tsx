import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Tag, X, Library, ArrowRight, SlidersHorizontal, Upload } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { getWorkspaceMeta } from '../lib/workspace';
import { Card, Badge, Button, PageHeader } from '../components/ui/Primitives';
import { cx } from '../lib/utils';
import {
  queryRepository,
  listRepositoryEntries,
  listImportedContentForWorkspace,
  listNotesForWorkspace,
  computeRepositoryStatistics,
  REPOSITORY_CONTENT_TYPE_REGISTRY,
  getRepositoryContentTypeMeta,
  type RepositoryEntry,
  type RepositoryContentType,
} from '../lib/repository';
import { collectImportedContentTags, collectImportedContentCategories, type ImportedContentSortOrder } from '../lib/importedContentRepository';
import { navigationTargetFor } from '../lib/repositoryNavigation';
import { ImportToRepositoryModal } from '../components/repository/ImportToRepositoryModal';

// Global Repository UI — a single, read-only browse/search surface across everything
// lib/repository.ts's foundation already knows how to discover (Notes + every registered
// ImportedContentType), scoped to the ACTIVE workspace only. This is deliberately NOT a second
// storage or search system: every entry shown here is produced by queryRepository (this module's
// own query engine, built entirely on the existing importedContent/notes store fields), and
// clicking a result navigates to the existing page that already owns that content
// (pages/Notes.tsx, pages/PhdResearch.tsx, pages/WorkingBibliography.tsx) rather than opening any
// new editor here. Content types with no dedicated page yet (question_bank, descriptive_questions,
// pyq, other — see lib/repository.ts's own registry notes) are still listed and searchable, just
// without a navigation target, since there is nowhere real to send the user yet.

const SORT_OPTIONS: { value: ImportedContentSortOrder; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'title', label: 'Title (A–Z)' },
];

const ORIGIN_LABELS: Record<RepositoryEntry['origin'], string> = {
  import: 'Imported',
  manual: 'Manually added',
  created: 'Created',
};

function ResultCard({ entry }: { entry: RepositoryEntry }) {
  const meta = getRepositoryContentTypeMeta(entry.contentType);
  const target = navigationTargetFor(entry);
  const workspaceLabel = getWorkspaceMeta(entry.workspaceId).shortLabel;
  const date = new Date(entry.createdAt);
  const dateLabel = Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('en-IN');

  const body = (
    <>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Badge tone="brand">{meta.label}</Badge>
        <Badge tone="neutral">{workspaceLabel}</Badge>
        {entry.category && <Badge tone="gold">{entry.category}</Badge>}
      </div>
      <h4 className="font-display font-semibold text-slate-800 dark:text-slate-100 truncate">{entry.title || 'Untitled'}</h4>
      <p className="mt-1 text-xs text-slate-400">
        {ORIGIN_LABELS[entry.origin]}
        {dateLabel && <> · {dateLabel}</>}
      </p>
      {entry.tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {entry.tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              <Tag className="h-2.5 w-2.5" /> {tag}
            </span>
          ))}
        </div>
      )}
      {target && (
        <p className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand-600 dark:text-brand-400">
          {target.label} <ArrowRight className="h-3 w-3" />
        </p>
      )}
    </>
  );

  if (target) {
    return (
      <Link
        to={target.to}
        aria-label={`${target.label}: ${entry.title || 'Untitled'} (${meta.label})`}
        className="block h-full rounded-2xl surface p-4 shadow-sm shadow-slate-900/5 transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
      >
        {body}
      </Link>
    );
  }

  return <Card className="h-full p-4">{body}</Card>;
}

export default function Repository() {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const importedContent = useAppStore((s) => s.importedContent);
  const notes = useAppStore((s) => s.notes);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContentType, setSelectedContentType] = useState<RepositoryContentType | ''>('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<ImportedContentSortOrder>('newest');
  const [showImportModal, setShowImportModal] = useState(false);

  // The store's importedContent/notes fields already only ever hold the ACTIVE workspace's own
  // data (see lib/store.ts's setActiveWorkspaceId swap) — queryRepository/listRepositoryEntries
  // scope explicitly by workspaceId anyway (defense in depth, and what makes them safely testable
  // with fixtures spanning more than one workspace), so this page never needs to filter twice.
  const workspaceContent = useMemo(() => listImportedContentForWorkspace(importedContent, activeWorkspaceId), [importedContent, activeWorkspaceId]);
  const workspaceNotes = useMemo(() => listNotesForWorkspace(notes, activeWorkspaceId), [notes, activeWorkspaceId]);
  const allEntries = useMemo(() => listRepositoryEntries(workspaceContent, workspaceNotes), [workspaceContent, workspaceNotes]);
  const statistics = useMemo(() => computeRepositoryStatistics(allEntries), [allEntries]);

  const availableCategories = useMemo(() => collectImportedContentCategories(workspaceContent), [workspaceContent]);
  const availableTags = useMemo(() => collectImportedContentTags(workspaceContent), [workspaceContent]);

  const results = useMemo(
    () =>
      queryRepository(importedContent, notes, {
        workspaceId: activeWorkspaceId,
        contentType: selectedContentType || undefined,
        search: searchQuery,
        tags: selectedTags,
        category: selectedCategory || undefined,
        sort: sortOrder,
      }),
    [importedContent, notes, activeWorkspaceId, selectedContentType, searchQuery, selectedTags, selectedCategory, sortOrder],
  );

  const hasActiveFilters = searchQuery.trim() !== '' || selectedContentType !== '' || selectedCategory !== '' || selectedTags.length > 0;

  function clearFilters() {
    setSearchQuery('');
    setSelectedContentType('');
    setSelectedCategory('');
    setSelectedTags([]);
  }

  function toggleTagFilter(tag: string) {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  const workspaceLabel = getWorkspaceMeta(activeWorkspaceId).label;

  return (
    <div>
      <PageHeader
        eyebrow="Repository"
        title="Repository"
        description={`Browse and search everything stored in your ${workspaceLabel} workspace — notes, research documents, bibliography records, and more as they're added.`}
        action={
          <Button onClick={() => setShowImportModal(true)}>
            <Upload className="h-4 w-4" /> Import to Repository
          </Button>
        }
      />

      {showImportModal && <ImportToRepositoryModal onClose={() => setShowImportModal(false)} />}

      <Card className="mb-5 p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <p className="text-slate-600 dark:text-slate-300">
            <span className="font-display text-lg font-semibold text-slate-800 dark:text-slate-100">{statistics.totalItems}</span>{' '}
            total item{statistics.totalItems === 1 ? '' : 's'} in {workspaceLabel}
          </p>
          {Object.entries(statistics.countsByContentType).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {Object.entries(statistics.countsByContentType).map(([type, count]) => (
                <Badge key={type} tone="neutral">
                  {count} {getRepositoryContentTypeMeta(type as RepositoryContentType).label}
                  {count === 1 ? '' : 's'}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </Card>

      {allEntries.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Library className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-slate-400 text-sm">No repository content yet in {workspaceLabel}.</p>
          <p className="mt-1 max-w-sm text-xs text-slate-400">
            Notes, research documents, and bibliography records you create or import will show up here automatically.
          </p>
        </div>
      ) : (
        <>
          <Card className="mb-5 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" aria-hidden="true" />
                <label htmlFor="repository-search" className="sr-only">
                  Search repository
                </label>
                <input
                  id="repository-search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search title or content…"
                  aria-label="Search repository"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent py-2 pl-9 pr-3 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
              </div>

              <label htmlFor="repository-content-type" className="sr-only">
                Filter by content type
              </label>
              <select
                id="repository-content-type"
                value={selectedContentType}
                onChange={(e) => setSelectedContentType(e.target.value as RepositoryContentType | '')}
                aria-label="Filter by content type"
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              >
                <option value="">All content types</option>
                {REPOSITORY_CONTENT_TYPE_REGISTRY.map((meta) => (
                  <option key={meta.type} value={meta.type}>
                    {meta.label}
                  </option>
                ))}
              </select>

              {availableCategories.length > 0 && (
                <>
                  <label htmlFor="repository-category" className="sr-only">
                    Filter by category
                  </label>
                  <select
                    id="repository-category"
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    aria-label="Filter by category"
                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  >
                    <option value="">All categories</option>
                    {availableCategories.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </>
              )}

              <label htmlFor="repository-sort" className="sr-only">
                Sort by
              </label>
              <select
                id="repository-sort"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as ImportedContentSortOrder)}
                aria-label="Sort by"
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-3.5 w-3.5" /> Clear filters
                </Button>
              )}
            </div>

            {availableTags.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400 mr-0.5" aria-hidden="true" />
                {availableTags.map((tag) => {
                  const active = selectedTags.includes(tag);
                  return (
                    <button
                      key={tag}
                      onClick={() => toggleTagFilter(tag)}
                      aria-pressed={active}
                      aria-label={`Filter by tag: ${tag}`}
                      className={cx(
                        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                        active
                          ? 'bg-brand-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
                      )}
                    >
                      <Tag className="h-3 w-3" aria-hidden="true" /> {tag}
                    </button>
                  );
                })}
              </div>
            )}

            <p className="mt-3 text-xs text-slate-400">
              {results.length} of {allEntries.length} item{allEntries.length === 1 ? '' : 's'}
            </p>
          </Card>

          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Search className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
              <p className="text-slate-400 text-sm mb-4">
                {selectedContentType && searchQuery.trim() === '' && selectedTags.length === 0 && !selectedCategory
                  ? `No ${getRepositoryContentTypeMeta(selectedContentType).label} records yet in ${workspaceLabel}.`
                  : 'No results match your search or filters.'}
              </p>
              <Button variant="secondary" onClick={clearFilters}>
                Clear filters
              </Button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((entry) => (
                <ResultCard key={`${entry.entityType}:${entry.entityId}`} entry={entry} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
