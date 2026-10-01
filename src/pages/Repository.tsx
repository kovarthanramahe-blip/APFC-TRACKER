import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Tag, X, Library, ArrowRight, SlidersHorizontal, Upload, Pencil, Trash2, AlertTriangle, Eye, Download, UploadCloud, FileQuestion, Archive, Newspaper } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { getWorkspaceMeta } from '../lib/workspace';
import { getWorkspaceAccent } from '../lib/workspaceAccent';
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
  KNOWLEDGE_LIBRARY_VIEWS,
  contentTypesForLibraryView,
  type RepositoryEntry,
  type RepositoryContentType,
  type KnowledgeLibraryView,
} from '../lib/repository';
import { collectImportedContentTags, collectImportedContentCategories, parseTagsInput, type ImportedContentSortOrder } from '../lib/importedContentRepository';
import type { ImportedContent, ImportedContentMetadata } from '../lib/contentImport';
import { navigationTargetFor, repositoryDetailPathFor } from '../lib/repositoryNavigation';
import { ImportToRepositoryModal } from '../components/repository/ImportToRepositoryModal';
import { ExportRepositoryModal } from '../components/repository/ExportRepositoryModal';
import { ImportRepositoryBackupModal } from '../components/repository/ImportRepositoryBackupModal';
import { UpscCsePyqImportModal } from '../components/upscCse/UpscCsePyqImportModal';
import { CreateCurrentAffairsModal } from '../components/repository/CreateCurrentAffairsModal';
import { PinToggle } from '../components/organisation/PinToggle';
import { ArchiveToggle } from '../components/organisation/ArchiveToggle';
import { BulkActionBar } from '../components/organisation/BulkActionBar';
import { SelectionCheckbox } from '../components/organisation/SelectionCheckbox';
import { buildFolderTree, flattenFolderTree } from '../lib/folders';

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
  { value: 'updated', label: 'Recently updated' },
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
  folderName,
  selected,
  onToggleSelected,
  onTogglePin,
  onToggleArchive,
  onEdit,
  onDelete,
}: {
  entry: RepositoryEntry;
  folderName: string | null;
  selected: boolean;
  onToggleSelected: () => void;
  onTogglePin: () => void;
  onToggleArchive: () => void;
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
      <div className="mb-2 flex items-center justify-between gap-2">
        <SelectionCheckbox selected={selected} title={title} onToggleSelected={onToggleSelected} />
        <div className="flex items-center gap-0.5">
          <ArchiveToggle archived={entry.isArchived} onToggle={onToggleArchive} size="sm" />
          <PinToggle pinned={entry.isPinned} onToggle={onTogglePin} size="sm" />
        </div>
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <Badge tone="brand">{meta.label}</Badge>
        <Badge tone="neutral">{workspaceLabel}</Badge>
        {entry.category && <Badge tone="gold">{entry.category}</Badge>}
        {folderName && <Badge tone="neutral">{folderName}</Badge>}
        {entry.isArchived && <Badge tone="neutral">Archived</Badge>}
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
      {entry.description && <p className="mt-1.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">{entry.description}</p>}
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

function buildEditedMetadata(tagsInput: string, categoryInput: string, descriptionInput: string): ImportedContentMetadata | undefined {
  const tags = parseTagsInput(tagsInput);
  const category = categoryInput.trim();
  const description = descriptionInput.trim();
  if (tags.length === 0 && !category && !description) return undefined;
  const metadata: ImportedContentMetadata = {};
  if (tags.length > 0) metadata.tags = tags;
  if (category) metadata.category = category;
  if (description) metadata.description = description;
  return metadata;
}

/**
 * EditMetadataModal's own form only has fields for title/contentType/tags/category/description —
 * it builds `metadata` fresh from those, with no idea folderId/isPinned/isArchived (Premium Note
 * Organisation) or eventDate/source/syllabusNodeId (UPSC CSE Current Affairs) exist. A plain
 * metadata edit must never silently wipe any of them, so they're carried over from the item's own
 * current state before `metadata` is replaced wholesale (updateImportedContent does a shallow
 * replace of the whole metadata object, not a deep merge — see lib/store.ts's updateImportedContent).
 * `original` is the item's real, pre-edit ImportedContent (only place eventDate/source/
 * syllabusNodeId live); a field genuinely absent on it stays absent here too — never defaulted.
 * Shared by both pages/Repository.tsx and pages/RepositoryDetail.tsx's own handleEditSave.
 */
export function preserveUneditedMetadata(
  editedMetadata: ImportedContentMetadata | undefined,
  original: ImportedContent | undefined,
  organisation: { folderId: string | null; isPinned: boolean; isArchived: boolean },
): ImportedContentMetadata | undefined {
  const merged: ImportedContentMetadata = {
    ...editedMetadata,
    ...(organisation.folderId !== null ? { folderId: organisation.folderId } : {}),
    ...(organisation.isPinned ? { isPinned: true } : {}),
    ...(organisation.isArchived ? { isArchived: true } : {}),
    ...(original?.metadata?.eventDate !== undefined ? { eventDate: original.metadata.eventDate } : {}),
    ...(original?.metadata?.source !== undefined ? { source: original.metadata.source } : {}),
    ...(original?.metadata?.syllabusNodeId !== undefined ? { syllabusNodeId: original.metadata.syllabusNodeId } : {}),
    ...(original?.metadata?.apfcTopicId !== undefined ? { apfcTopicId: original.metadata.apfcTopicId } : {}),
  };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

/** Every registered content type EXCEPT 'note' — this modal only ever edits an existing
 * ImportedContent item (a Note entry never reaches it; see handleEditRequest's own
 * navigate('/notes') branch in both pages/Repository.tsx and pages/RepositoryDetail.tsx), and
 * ImportToRepositoryModal.tsx's own SAVE logic shows 'note' is not really an ImportedContent
 * content type in practice — choosing it there routes to the separate Notes store (upsertNote),
 * never to an ImportedContent record. Offering it here would let a real, already-persisted
 * ImportedContent item be retyped to a value nothing in this app ever actually saves as
 * ImportedContent, so it is excluded rather than offered as a dead-end choice. */
const EDITABLE_CONTENT_TYPES = REPOSITORY_CONTENT_TYPE_REGISTRY.filter((meta) => meta.type !== 'note');

/**
 * Metadata edit for a non-Note repository entry — title, content type, description, tags,
 * category. Never touches rawContent, sourceFilename, originalFormat, or import origin: those
 * simply aren't fields this form has any input for, so onSave's payload can never carry them.
 * Saves through the EXISTING updateImportedContent store action (the same one
 * pages/PhdResearch.tsx's own metadata editor calls) — no second persistence path.
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
  onSave: (title: string, contentType: RepositoryContentType, metadata: ImportedContentMetadata | undefined) => void;
}) {
  const [titleInput, setTitleInput] = useState(entry.title);
  const [contentTypeInput, setContentTypeInput] = useState<RepositoryContentType>(entry.contentType);
  const [tagsInput, setTagsInput] = useState(entry.tags.join(', '));
  const [categoryInput, setCategoryInput] = useState(entry.category ?? '');
  const [descriptionInput, setDescriptionInput] = useState(entry.description ?? '');
  // Derived from the CURRENTLY SELECTED content type, not entry.contentType, so switching the
  // dropdown live-updates which fields are shown — matching capabilitiesForContentType exactly
  // (lib/repository.ts), the same registry every other capability check in this app reads from.
  const showTags = repositoryContentTypeSupports(contentTypeInput, 'taggable');
  const showCategory = repositoryContentTypeSupports(contentTypeInput, 'categorisable');
  // Description is a freeform metadata field like tags/category, so it shares their same
  // capability gate — 'note' has no metadata bag at all (see lib/repository.ts's own header on
  // why 'note' is never taggable/categorisable), so it's never description-able either.
  const showDescription = showTags;

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
          <div>
            <label htmlFor="edit-content-type" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Content type
            </label>
            <select
              id="edit-content-type"
              value={contentTypeInput}
              onChange={(e) => setContentTypeInput(e.target.value as RepositoryContentType)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            >
              {EDITABLE_CONTENT_TYPES.map((meta) => (
                <option key={meta.type} value={meta.type}>
                  {meta.label}
                </option>
              ))}
            </select>
          </div>
          {showDescription && (
            <div>
              <label htmlFor="edit-description" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                Description
              </label>
              <textarea
                id="edit-description"
                value={descriptionInput}
                onChange={(e) => setDescriptionInput(e.target.value)}
                placeholder="A short summary shown on the repository card…"
                rows={2}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </div>
          )}
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
          <Button
            onClick={() => onSave(titleInput.trim() || entry.title, contentTypeInput, buildEditedMetadata(tagsInput, categoryInput, descriptionInput))}
            disabled={!titleInput.trim()}
          >
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
  const accent = getWorkspaceAccent(activeWorkspaceId);
  const importedContent = useAppStore((s) => s.importedContent);
  const notes = useAppStore((s) => s.notes);
  const addImportedContent = useAppStore((s) => s.addImportedContent);
  const updateImportedContent = useAppStore((s) => s.updateImportedContent);
  const deleteImportedContent = useAppStore((s) => s.deleteImportedContent);
  const deleteNote = useAppStore((s) => s.deleteNote);
  const folders = useAppStore((s) => s.folders);
  const bulkUpdateNotes = useAppStore((s) => s.bulkUpdateNotes);
  const bulkUpdateImportedContent = useAppStore((s) => s.bulkUpdateImportedContent);

  const [searchQuery, setSearchQuery] = useState('');
  // Knowledge Library (Phase 2) — a compact primary view, read alongside (never replacing) the
  // existing detailed content-type dropdown below: selecting a specific type there always narrows
  // further/overrides the view (see RepositoryQuery's own doc comment on why contentType wins).
  const [libraryView, setLibraryView] = useState<KnowledgeLibraryView>('all');
  const [selectedContentType, setSelectedContentType] = useState<RepositoryContentType | ''>('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null | undefined>(undefined);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [sortOrder, setSortOrder] = useState<ImportedContentSortOrder>('newest');
  const [showImportModal, setShowImportModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportBackupModal, setShowImportBackupModal] = useState(false);
  const [showUpscPyqImportModal, setShowUpscPyqImportModal] = useState(false);
  const [showCreateCurrentAffairsModal, setShowCreateCurrentAffairsModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState<RepositoryEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<RepositoryEntry | null>(null);
  // Keyed by `${entityType}:${entityId}` — a note and an ImportedContent item can share the same
  // raw id space, so entityType disambiguates which store action a bulk change routes through.
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

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
        contentTypes: selectedContentType ? undefined : (contentTypesForLibraryView(libraryView) ?? undefined),
        search: searchQuery,
        tags: selectedTags,
        category: selectedCategory || undefined,
        folderId: selectedFolderId,
        pinnedOnly,
        archived: showArchived,
        sort: sortOrder,
      }),
    [importedContent, notes, activeWorkspaceId, libraryView, selectedContentType, searchQuery, selectedTags, selectedCategory, selectedFolderId, pinnedOnly, showArchived, sortOrder],
  );

  const folderNameById = useMemo(() => new Map(folders.map((f) => [f.id, f.name])), [folders]);

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    libraryView !== 'all' ||
    selectedContentType !== '' ||
    selectedCategory !== '' ||
    selectedTags.length > 0 ||
    selectedFolderId !== undefined ||
    pinnedOnly ||
    showArchived;

  function clearFilters() {
    setSearchQuery('');
    setLibraryView('all');
    setSelectedContentType('');
    setSelectedCategory('');
    setSelectedTags([]);
    setSelectedFolderId(undefined);
    setPinnedOnly(false);
    setShowArchived(false);
  }

  function toggleTagFilter(tag: string) {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function entryKey(entry: RepositoryEntry) {
    return `${entry.entityType}:${entry.entityId}`;
  }

  function toggleSelected(entry: RepositoryEntry) {
    const key = entryKey(entry);
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function clearSelection() {
    setSelectedKeys(new Set());
  }

  // Bulk changes are routed per entityType — a note and an ImportedContent item go through their
  // own store action (bulkUpdateNotes / bulkUpdateImportedContent), never a shared one, since the
  // two collections are genuinely separate (see lib/store.ts's own header on why).
  function runBulk(notePatch: Parameters<typeof bulkUpdateNotes>[1], contentPatch: Parameters<typeof bulkUpdateImportedContent>[1]) {
    const noteIds: string[] = [];
    const contentIds: string[] = [];
    for (const key of selectedKeys) {
      const [entityType, entityId] = key.split(':');
      if (entityType === 'note') noteIds.push(entityId);
      else contentIds.push(entityId);
    }
    if (noteIds.length > 0) bulkUpdateNotes(noteIds, notePatch);
    if (contentIds.length > 0) bulkUpdateImportedContent(contentIds, contentPatch);
    clearSelection();
  }

  function toggleEntryPin(entry: RepositoryEntry) {
    if (entry.entityType === 'note') bulkUpdateNotes([entry.entityId], { pinned: !entry.isPinned });
    else bulkUpdateImportedContent([entry.entityId], { isPinned: !entry.isPinned });
  }

  function toggleEntryArchive(entry: RepositoryEntry) {
    if (entry.entityType === 'note') bulkUpdateNotes([entry.entityId], { isArchived: !entry.isArchived });
    else bulkUpdateImportedContent([entry.entityId], { isArchived: !entry.isArchived });
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

  function handleEditSave(title: string, contentType: RepositoryContentType, metadata: ImportedContentMetadata | undefined) {
    if (!editingEntry) return;
    const original = importedContent.find((c) => c.id === editingEntry.entityId);
    const mergedMetadata = preserveUneditedMetadata(metadata, original, {
      folderId: editingEntry.folderId,
      isPinned: editingEntry.isPinned,
      isArchived: editingEntry.isArchived,
    });
    updateImportedContent(editingEntry.entityId, { title, contentType, metadata: mergedMetadata });
    setEditingEntry(null);
  }

  function handleCreateCurrentAffairsSave(item: ImportedContent) {
    addImportedContent(item);
    setShowCreateCurrentAffairsModal(false);
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
              <Upload className="h-4 w-4" /> Import Centre
            </Button>
            {activeWorkspaceId === 'upsc_cse' && (
              <Button variant="secondary" onClick={() => setShowUpscPyqImportModal(true)}>
                <FileQuestion className="h-4 w-4" /> Import UPSC Prelims PYQ Source
              </Button>
            )}
            {activeWorkspaceId === 'upsc_cse' && (
              <Button variant="secondary" onClick={() => setShowCreateCurrentAffairsModal(true)}>
                <Newspaper className="h-4 w-4" /> Create Manually — Current Affairs
              </Button>
            )}
          </div>
        }
      />

      {showImportModal && <ImportToRepositoryModal onClose={() => setShowImportModal(false)} />}
      {showExportModal && <ExportRepositoryModal onClose={() => setShowExportModal(false)} />}
      {showImportBackupModal && <ImportRepositoryBackupModal onClose={() => setShowImportBackupModal(false)} />}
      {showUpscPyqImportModal && <UpscCsePyqImportModal onClose={() => setShowUpscPyqImportModal(false)} />}
      {showCreateCurrentAffairsModal && (
        <CreateCurrentAffairsModal
          workspaceId={activeWorkspaceId}
          onClose={() => setShowCreateCurrentAffairsModal(false)}
          onSave={handleCreateCurrentAffairsSave}
        />
      )}

      {/* Knowledge Library (Phase 2) — a compact, fixed set of primary views over the SAME
          content the detailed filters below already expose (lib/repository.ts's own
          KNOWLEDGE_LIBRARY_VIEWS), never a second categorisation system. Progressive disclosure:
          this is the first, broad choice; the detailed Card below (search, content-type dropdown,
          category, tags, folder, pinned/archived) stays available for finer filtering. */}
      <div className="mb-5 flex flex-wrap items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 p-1 self-start">
        {KNOWLEDGE_LIBRARY_VIEWS.map((v) => (
          <button
            key={v.view}
            type="button"
            onClick={() => setLibraryView(v.view)}
            aria-pressed={libraryView === v.view}
            className={cx(
              'rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors',
              libraryView === v.view
                ? cx(accent.bg, 'text-white shadow-sm', accent.shadow)
                : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            {v.label}
          </button>
        ))}
      </div>

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

              {folders.length > 0 && (
                <>
                  <label htmlFor="repository-folder" className="sr-only">
                    Filter by folder
                  </label>
                  <select
                    id="repository-folder"
                    value={selectedFolderId === undefined ? '' : (selectedFolderId ?? '__root__')}
                    onChange={(e) => setSelectedFolderId(e.target.value === '' ? undefined : e.target.value === '__root__' ? null : e.target.value)}
                    aria-label="Filter by folder"
                    className="rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  >
                    <option value="">All folders</option>
                    <option value="__root__">Unfiled (Root)</option>
                    {flattenFolderTree(buildFolderTree(folders, activeWorkspaceId)).map(({ folder, depth }) => (
                      <option key={folder.id} value={folder.id}>
                        {'—'.repeat(depth)} {folder.name}
                      </option>
                    ))}
                  </select>
                </>
              )}

              <Button
                variant={pinnedOnly ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setPinnedOnly((v) => !v)}
                aria-pressed={pinnedOnly}
              >
                Pinned
              </Button>
              <Button
                variant={showArchived ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setShowArchived((v) => !v)}
                aria-pressed={showArchived}
              >
                <Archive className="h-3.5 w-3.5" /> Archived
              </Button>

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
                        active ? cx(accent.bg, 'text-white') : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
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

          {selectedKeys.size > 0 && (
            <BulkActionBar
              selectedCount={selectedKeys.size}
              folders={folders}
              workspaceId={activeWorkspaceId}
              onMoveToFolder={(folderId) => runBulk({ folderId }, { folderId })}
              onAddTag={(tag) => runBulk({ addTags: [tag] }, { addTags: [tag] })}
              onRemoveTag={(tag) => runBulk({ removeTags: [tag] }, { removeTags: [tag] })}
              onPin={() => runBulk({ pinned: true }, { isPinned: true })}
              onUnpin={() => runBulk({ pinned: false }, { isPinned: false })}
              onArchive={() => runBulk({ isArchived: true }, { isArchived: true })}
              onUnarchive={() => runBulk({ isArchived: false }, { isArchived: false })}
              onCancel={clearSelection}
            />
          )}

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
                <ResultCard
                  key={entryKey(entry)}
                  entry={entry}
                  folderName={entry.folderId ? (folderNameById.get(entry.folderId) ?? null) : null}
                  selected={selectedKeys.has(entryKey(entry))}
                  onToggleSelected={() => toggleSelected(entry)}
                  onTogglePin={() => toggleEntryPin(entry)}
                  onToggleArchive={() => toggleEntryArchive(entry)}
                  onEdit={handleEditRequest}
                  onDelete={setDeletingEntry}
                />
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
