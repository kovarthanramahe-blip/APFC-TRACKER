import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Tag, X, Library, ArrowRight, SlidersHorizontal, Upload, Pencil, Trash2, AlertTriangle, Eye, Download, UploadCloud } from 'lucide-react';
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
  repositoryContentTypeSupports,
  type RepositoryEntry,
  type RepositoryContentType,
} from '../lib/repository';
import { collectImportedContentTags, collectImportedContentCategories, parseTagsInput, type ImportedContentSortOrder } from '../lib/importedContentRepository';
import type { ImportedContentMetadata } from '../lib/contentImport';
import { navigationTargetFor, repositoryDetailPathFor } from '../lib/repositoryNavigation';
import { ImportToRepositoryModal } from '../components/repository/ImportToRepositoryModal';
import { ExportRepositoryModal } from '../components/repository/ExportRepositoryModal';
import { ImportRepositoryBackupModal } from '../components/repository/ImportRepositoryBackupModal';

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
//
// Repository Item Management (this stage) — Edit and Delete actions, both gated on the existing
// repository capability registry (repositoryContentTypeSupports), never hardcoded per type. Edit
// on a Note never opens a second Note editor here — it navigates to the existing Notes page (the
// only place a Note's content is ever edited); Edit on any other type opens a small metadata-only
// form (title/tags/category) that calls the SAME updateImportedContent store action
// pages/PhdResearch.tsx's own metadata editor calls — rawContent/provenance are never touched by
// it. Delete calls the existing deleteImportedContent/deleteNote store actions directly (the exact
// cascade-over-contentRelationships behaviour those actions already implement, unchanged by this
// stage), behind a confirmation modal (never window.confirm) that names the item, its content
// type, and its workspace.

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

/** Whether a repository result should show an Edit action at all — always read from the registry,
 * never hardcoded, so a future capability change is reflected automatically. */
export function canEditEntry(entry: RepositoryEntry): boolean {
  return repositoryContentTypeSupports(entry.contentType, 'editable');
}

/** The Delete equivalent of canEditEntry. */
export function canDeleteEntry(entry: RepositoryEntry): boolean {
  return repositoryContentTypeSupports(entry.contentType, 'deletable');
}

function ResultCard({
  entry,
  onEdit,
  onDelete,
}: {
  entry: RepositoryEntry;
  onEdit: (entry: RepositoryEntry) => void;
  onDelete: (entry: RepositoryEntry) => void;
}) {
  const meta = getRepositoryContentTypeMeta(entry.contentType);
  const target = navigationTargetFor(entry);
  const workspaceLabel = getWorkspaceMeta(entry.workspaceId).shortLabel;
  const date = new Date(entry.createdAt);
  const dateLabel = Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('en-IN');
  const title = entry.title || 'Untitled';

  return (
    <Card className="h-full p-4 flex flex-col">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Badge tone="brand">{meta.label}</Badge>
        <Badge tone="neutral">{workspaceLabel}</Badge>
        {entry.category && <Badge tone="gold">{entry.category}</Badge>}
      </div>
      <Link
        to={repositoryDetailPathFor(entry.entityType, entry.entityId)}
        className="font-display font-semibold text-slate-800 dark:text-slate-100 truncate hover:text-brand-600 dark:hover:text-brand-400 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60 rounded"
      >
        {title}
      </Link>
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
      <div className="mt-3 flex flex-1 items-end">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to={repositoryDetailPathFor(entry.entityType, entry.entityId)}
            aria-label={`View details: ${title} (${meta.label})`}
            className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
          >
            <Eye className="h-3 w-3" /> View
          </Link>
          {target && (
            <Link
              to={target.to}
              aria-label={`${target.label}: ${title} (${meta.label})`}
              className="inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-medium text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-500/10 hover:bg-brand-100 dark:hover:bg-brand-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/60"
            >
              {target.label} <ArrowRight className="h-3 w-3" />
            </Link>
          )}
          {canEditEntry(entry) && (
            <Button variant="secondary" size="sm" onClick={() => onEdit(entry)} aria-label={`Edit ${title} (${meta.label})`}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          )}
          {canDeleteEntry(entry) && (
            <Button variant="danger" size="sm" onClick={() => onDelete(entry)} aria-label={`Delete ${title} (${meta.label})`}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function buildEditedMetadata(tagsInput: string, categoryInput: string): ImportedContentMetadata | undefined {
  const tags = parseTagsInput(tagsInput);
  const category = categoryInput.trim();
  if (tags.length === 0 && !category) return undefined;
  const metadata: ImportedContentMetadata = {};
  if (tags.length > 0) metadata.tags = tags;
  if (category) metadata.category = category;
  return metadata;
}

/**
 * Metadata-only edit for a non-Note repository entry — title, tags, category. Never touches
 * rawContent, sourceFilename, originalFormat, or import origin: those simply aren't fields this
 * form has any input for, so onSave's payload can never carry them. Saves through the EXISTING
 * updateImportedContent store action (the same one pages/PhdResearch.tsx's own metadata editor
 * calls) — no second persistence path.
 */
export function EditMetadataModal({
  entry,
  existingCategories,
  onCancel,
  onSave,
}: {
  entry: RepositoryEntry;
  existingCategories: string[];
  onCancel: () => void;
  onSave: (title: string, metadata: ImportedContentMetadata | undefined) => void;
}) {
  const [titleInput, setTitleInput] = useState(entry.title);
  const [tagsInput, setTagsInput] = useState(entry.tags.join(', '));
  const [categoryInput, setCategoryInput] = useState(entry.category ?? '');
  const showTags = repositoryContentTypeSupports(entry.contentType, 'taggable');
  const showCategory = repositoryContentTypeSupports(entry.contentType, 'categorisable');

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-2xl sm:inset-0 sm:top-24 sm:bottom-auto sm:h-fit sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100 truncate">Edit — {entry.title || 'Untitled'}</h3>
          <button onClick={onCancel} aria-label="Close" className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <label htmlFor="edit-title" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Title
            </label>
            <input
              id="edit-title"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder="Title"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>
          {showTags && (
            <div>
              <label htmlFor="edit-tags" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Tags (comma-separated)
              </label>
              <input
                id="edit-tags"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                placeholder="e.g. fieldwork, chapter-1"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </div>
          )}
          {showCategory && (
            <div>
              <label htmlFor="edit-category" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Category
              </label>
              <input
                id="edit-category"
                list="repository-edit-category-suggestions"
                value={categoryInput}
                onChange={(e) => setCategoryInput(e.target.value)}
                placeholder="e.g. Literature Review"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
              <datalist id="repository-edit-category-suggestions">
                {existingCategories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800 px-5 py-4">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => onSave(titleInput.trim() || entry.title, buildEditedMetadata(tagsInput, categoryInput))} disabled={!titleInput.trim()}>
            Save Changes
          </Button>
        </div>
      </div>
    </>
  );
}

/** Delete confirmation — the app's own modal styling (backdrop + panel + header/footer), never
 * window.confirm(). Names the item's title, content type, and workspace explicitly, per this
 * stage's own requirement. */
export function DeleteConfirmModal({ entry, onCancel, onConfirm }: { entry: RepositoryEntry; onCancel: () => void; onConfirm: () => void }) {
  const meta = getRepositoryContentTypeMeta(entry.contentType);
  const workspaceLabel = getWorkspaceMeta(entry.workspaceId).label;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-sm rounded-t-2xl sm:inset-0 sm:top-24 sm:bottom-auto sm:h-fit sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Delete item</h3>
          <button onClick={onCancel} aria-label="Close" className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <p>This cannot be undone. Any relationships linking this item to other repository content will also be removed.</p>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
            <p className="font-display font-semibold text-slate-800 dark:text-slate-100 truncate">{entry.title || 'Untitled'}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge tone="brand">{meta.label}</Badge>
              <Badge tone="neutral">{workspaceLabel}</Badge>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800 px-5 py-4">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </div>
    </>
  );
}

export default function Repository() {
  const navigate = useNavigate();
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const importedContent = useAppStore((s) => s.importedContent);
  const notes = useAppStore((s) => s.notes);
  const updateImportedContent = useAppStore((s) => s.updateImportedContent);
  const deleteImportedContent = useAppStore((s) => s.deleteImportedContent);
  const deleteNote = useAppStore((s) => s.deleteNote);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContentType, setSelectedContentType] = useState<RepositoryContentType | ''>('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [sortOrder, setSortOrder] = useState<ImportedContentSortOrder>('newest');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportBackupModal, setShowImportBackupModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<RepositoryEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<RepositoryEntry | null>(null);

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

  // Edit on a Note never opens a second Note editor here — the existing Notes page is the only
  // place a Note's content is ever edited (see components/repository/ImportToRepositoryModal.tsx's
  // own header note on the same rule for import).
  function handleEditRequest(entry: RepositoryEntry) {
    if (entry.entityType === 'note') {
      navigate('/notes');
      return;
    }
    setEditingEntry(entry);
  }

  function handleEditSave(title: string, metadata: ImportedContentMetadata | undefined) {
    if (!editingEntry) return;
    updateImportedContent(editingEntry.entityId, { title, metadata });
    setEditingEntry(null);
  }

  function handleDeleteConfirm() {
    if (!deletingEntry) return;
    if (deletingEntry.entityType === 'note') deleteNote(deletingEntry.entityId);
    else deleteImportedContent(deletingEntry.entityId);
    setDeletingEntry(null);
  }

  const workspaceLabel = getWorkspaceMeta(activeWorkspaceId).label;

  return (
    <div>
      <PageHeader
        eyebrow="Repository"
        title="Repository"
        description={`Browse and search everything stored in your ${workspaceLabel} workspace — notes, research documents, bibliography records, and more as they're added.`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setShowExportModal(true)}>
              <Download className="h-4 w-4" /> Export Repository
            </Button>
            <Button variant="secondary" onClick={() => setShowImportBackupModal(true)}>
              <UploadCloud className="h-4 w-4" /> Import Repository Backup
            </Button>
            <Button onClick={() => setShowImportModal(true)}>
              <Upload className="h-4 w-4" /> Import to Repository
            </Button>
          </div>
        }
      />

      {showImportModal && <ImportToRepositoryModal onClose={() => setShowImportModal(false)} />}
      {showExportModal && <ExportRepositoryModal onClose={() => setShowExportModal(false)} />}
      {showImportBackupModal && <ImportRepositoryBackupModal onClose={() => setShowImportBackupModal(false)} />}

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
                <ResultCard key={`${entry.entityType}:${entry.entityId}`} entry={entry} onEdit={handleEditRequest} onDelete={setDeletingEntry} />
              ))}
            </div>
          )}
        </>
      )}

      {editingEntry && (
        <EditMetadataModal entry={editingEntry} existingCategories={availableCategories} onCancel={() => setEditingEntry(null)} onSave={handleEditSave} />
      )}
      {deletingEntry && <DeleteConfirmModal entry={deletingEntry} onCancel={() => setDeletingEntry(null)} onConfirm={handleDeleteConfirm} />}
    </div>
  );
}
