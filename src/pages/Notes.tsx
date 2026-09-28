import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { MarkdownPreview } from '../components/markdown/MarkdownPreview';
import {
  Plus,
  Search,
  Pin,
  Trash2,
  X,
  NotebookPen,
  ChevronRight,
  ChevronLeft,
  FolderOpen,
  FolderPlus,
  Folder as FolderIcon,
  Upload,
  Eye,
  Pencil,
  Unlink,
  Link2,
  Copy,
  Archive,
  ArchiveRestore,
  Tag,
  Clock,
  LayoutGrid,
  ListChecks,
} from 'lucide-react';
import { useAppStore } from '../lib/store';
import { SelectionCheckbox } from '../components/organisation/SelectionCheckbox';
import { SYLLABUS } from '../data/syllabus';
import { getWorkspaceMeta, type WorkspaceKind } from '../lib/workspace';
import { SUBJECT_COLORS, cx, uuid } from '../lib/utils';
import { Card, Badge, Button, PageHeader } from '../components/ui/Primitives';
import type { Note, SubjectColorKey } from '../lib/types';
import { importNoteFile, SUPPORTED_IMPORT_EXTENSIONS } from '../lib/noteImport';
import { sha256Hex } from '../lib/fileHash';
import { findNoteDuplicates, type NoteDuplicateMatchResult } from '../lib/importDuplicates';
import { getImportedContentById, type ImportedContent } from '../lib/contentImport';
import { getIncomingRelationships, RELATIONSHIP_TYPE_LABELS, type ContentRelationship } from '../lib/contentRelationships';
import { countRelatedContent } from '../lib/relatedContentSummary';
import { RelatedContentSummary } from '../components/phdResearch/RelatedContentSummary';
import { createFolder, buildFolderTree, flattenFolderTree, getFolderSubtreeIds, type Folder, type FolderTreeNode } from '../lib/folders';
import { queryNotes, searchNotes, filterNotesByArchived, collectNoteTags, getNoteFolderId, getNoteTags, isNoteArchived, type NoteSortOrder } from '../lib/noteOrganization';
import { parseTagsInput } from '../lib/importedContentRepository';
import { EditorToolbar, handleEditorKeyboardShortcut } from '../components/editor/EditorToolbar';
import { SlashCommandMenu } from '../components/editor/SlashCommandMenu';
import { WikiLinkAutocomplete } from '../components/editor/WikiLinkAutocomplete';
import { NotePropertiesPanel } from '../components/editor/NotePropertiesPanel';
import { BacklinksPanel } from '../components/editor/BacklinksPanel';
import { applyEditToTextarea } from '../components/editor/textareaEditing';
import { detectSlashCommandTrigger, filterSlashCommands, buildSlashCommandEdit, type SlashCommandTrigger } from '../lib/slashCommands';
import {
  detectWikiLinkAutocompleteTrigger,
  buildWikiLinkInsertEdit,
  buildWikiLinkCandidatePool,
  filterWikiLinkCandidates,
  extractWikiLinks,
  type WikiLinkAutocompleteTrigger,
  type WikiLinkCandidate,
} from '../lib/wikiLinks';
import { diffWikiLinkRelationships, getBacklinks } from '../lib/backlinks';
import { NOTE_TEMPLATES, getNoteTemplate } from '../lib/noteTemplates';

const TOPIC_TITLES: Record<string, string> = Object.fromEntries(SYLLABUS.flatMap((s) => s.topics.map((t) => [t.id, t.title])));
const TOPIC_SUBJECTS: Record<string, SubjectColorKey> = Object.fromEntries(
  SYLLABUS.flatMap((s) => s.topics.map((t) => [t.id, s.colorKey])),
);

// Navigation is a simple drill-down: pick a subject, then (for real subjects) a topic, then see its notes.
// "General" notes have no topic level, matching the pre-Phase-2E behaviour for uncategorised notes.
type Nav =
  | { level: 'subjects' }
  | { level: 'topics'; subject: SubjectColorKey }
  | { level: 'notes'; subject: SubjectColorKey | 'general'; topicId?: string; uncategorized?: boolean };

// Deep-link support: arriving from a syllabus topic (or a PYQ review's "Study this topic")
// as /notes?topicId=... should open straight at that topic's note list.
function navFromSearchParams(params: URLSearchParams): Nav {
  const topicId = params.get('topicId');
  const subject = topicId ? TOPIC_SUBJECTS[topicId] : undefined;
  if (topicId && subject) return { level: 'notes', subject, topicId };
  return { level: 'subjects' };
}

export default function Notes() {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  // Multi-Workspace OS, Stage 3A — SYLLABUS is APFC's own subject/topic tree; a non-APFC
  // workspace has no syllabus to organise notes by yet, so it skips the subject/topic drill-down
  // entirely and works as a single flat "General" notes list instead (notes themselves are
  // already correctly workspace-isolated by the store — see lib/store.ts's Stage 2 design).
  const isApfc = activeWorkspaceId === 'apfc';
  const notes = useAppStore((s) => s.notes);
  const upsertNote = useAppStore((s) => s.upsertNote);
  const deleteNote = useAppStore((s) => s.deleteNote);
  const togglePinNote = useAppStore((s) => s.togglePinNote);
  const folders = useAppStore((s) => s.folders);

  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Note | null>(null);
  const [creating, setCreating] = useState(false);
  const [nav, setNav] = useState<Nav>(() => navFromSearchParams(searchParams));
  // Premium Note Organisation (Phase 3B) — a second, additive view alongside the existing
  // subject/topic drill-down above (Browse, unchanged, still the default). Organise adds folders,
  // tags, pinning, archiving, search/sort/filter and bulk actions — see OrganiseView below. Never
  // replaces Browse; a user who never opens Organise sees no change at all.
  const [viewMode, setViewMode] = useState<'browse' | 'organise'>('browse');

  // File import (Markdown/DOCX/PDF -> a normal, editable Note) — lib/noteImport.ts owns all
  // parsing/validation; this page only wires the file picker to it and opens the result in the
  // existing NoteEditor, exactly like startNew does for a blank note.
  const importInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  // Set alongside `editing` only when it was just opened from a file import (never for a blank new
  // note or an existing note being reopened) — cleared whenever the editor closes so a later blank
  // note never inherits a stale notice. See lib/importDuplicates.ts's findNoteDuplicates.
  const [importDuplicateNotice, setImportDuplicateNotice] = useState<NoteDuplicateMatchResult | null>(null);

  // React to a fresh deep link (e.g. navigating here again from another topic) after the page is already mounted.
  useEffect(() => {
    const next = navFromSearchParams(searchParams);
    if (next.level === 'notes') setNav(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const sortedNotes = useMemo(
    () => [...notes].sort((a, b) => Number(b.pinned) - Number(a.pinned) || +new Date(b.updatedAt) - +new Date(a.updatedAt)),
    [notes],
  );

  // Phase 5L — reuses the same searchNotes engine the Organise view runs through queryNotes
  // (lib/noteOrganization.ts), instead of a second, hand-rolled title/content filter. Composed from
  // filterNotesByArchived + searchNotes directly (rather than calling queryNotes itself, which also
  // re-sorts by updatedAt alone) so this quick-search bar keeps its existing pinned-first ordering
  // from `sortedNotes` — neither of those two filters reorders its input. Also fixes a real gap:
  // the old inline filter never excluded archived notes from this bar, unlike every other note
  // listing in this app; now covers tags/folder name too, for free.
  const searchResults = useMemo(() => {
    if (!query.trim()) return null;
    return searchNotes(filterNotesByArchived(sortedNotes, false), query, folders);
  }, [sortedNotes, query, folders]);

  const notesInView = useMemo(() => {
    if (nav.level !== 'notes') return [];
    if (nav.subject === 'general') return sortedNotes.filter((n) => n.subject === 'general');
    if (nav.uncategorized) return sortedNotes.filter((n) => n.subject === nav.subject && !n.topicId);
    return sortedNotes.filter((n) => n.subject === nav.subject && n.topicId === nav.topicId);
  }, [nav, sortedNotes]);

  function startNew(subject: SubjectColorKey | 'general', topicId?: string) {
    setImportDuplicateNotice(null);
    setEditing({
      id: uuid(),
      subject,
      topicId,
      title: '',
      content: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pinned: false,
    });
    setCreating(true);
  }

  const quickNewTarget: { subject: SubjectColorKey | 'general'; topicId?: string } =
    isApfc && nav.level === 'notes' ? { subject: nav.subject, topicId: nav.uncategorized ? undefined : nav.topicId } : { subject: 'general' };

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file after an error
    if (!file) return;
    setImportError(null);
    setImporting(true);
    try {
      // Unchanged extraction — the same lib/noteImport.ts pipeline as before this stage; its return
      // shape is never altered (existing tests pin an exact toEqual on it). Hashing/duplicate
      // detection is computed separately, alongside it, using the same lib/fileHash.ts +
      // lib/importDuplicates.ts primitives Phase 1/2 already ship for ImportedContent.
      const result = await importNoteFile(file);
      if (result.status === 'error') {
        setImportError(result.message);
        return;
      }
      let sourceHash: string | undefined;
      try {
        sourceHash = await sha256Hex(file);
      } catch {
        sourceHash = undefined;
      }
      setImportDuplicateNotice(findNoteDuplicates(notes, activeWorkspaceId, { sourceFilename: file.name, sourceHash, sourceFileSize: file.size }));
      setEditing({
        id: uuid(),
        subject: quickNewTarget.subject,
        topicId: quickNewTarget.topicId,
        title: result.title,
        content: result.content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        pinned: false,
        sourceHash,
        sourceFileSize: file.size,
        sourceFilename: file.name,
      });
      setCreating(true);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Revision"
        title="Notes"
        description="Capture quick notes, formulas and mnemonics — organised by subject and syllabus topic."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" disabled={importing} onClick={() => importInputRef.current?.click()}>
              <Upload className="h-4 w-4" /> {importing ? 'Importing…' : 'Import File'}
            </Button>
            <input
              ref={importInputRef}
              type="file"
              accept={SUPPORTED_IMPORT_EXTENSIONS.join(',') + ',.doc'}
              className="hidden"
              onChange={handleImportFile}
            />
            <Button onClick={() => startNew(quickNewTarget.subject, quickNewTarget.topicId)}>
              <Plus className="h-4 w-4" /> New Note
            </Button>
          </div>
        }
      />

      {importError && (
        <div className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          <p>{importError}</p>
          <button onClick={() => setImportError(null)} className="shrink-0 text-rose-400 hover:text-rose-600 dark:hover:text-rose-200">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="mb-5 inline-flex rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 text-xs">
        <button
          type="button"
          onClick={() => setViewMode('browse')}
          className={cx(
            'flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors',
            viewMode === 'browse' ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
          )}
        >
          <LayoutGrid className="h-3.5 w-3.5" /> Browse
        </button>
        <button
          type="button"
          onClick={() => setViewMode('organise')}
          className={cx(
            'flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition-colors',
            viewMode === 'organise' ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
          )}
        >
          <ListChecks className="h-3.5 w-3.5" /> Organise
        </button>
      </div>

      {viewMode === 'organise' ? (
        <OrganiseView notes={notes} folders={folders} workspaceId={activeWorkspaceId} onOpenNote={setEditing} onStartNew={() => startNew('general')} />
      ) : (
        <>
      <div className="mb-5 relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search all notes…"
          className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 py-2.5 pl-10 pr-4 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        />
      </div>

      {searchResults ? (
        <NoteGrid notes={searchResults} onOpen={setEditing} onTogglePin={togglePinNote} emptyText={`No notes match "${query}".`} showLocation />
      ) : !isApfc ? (
        // Multi-Workspace OS, Stage 3A — no syllabus to drill into yet, so this workspace's notes
        // are just one flat list. `notes` is already this workspace's own notes only (Stage 2).
        <NoteGrid
          notes={notes}
          onOpen={setEditing}
          onTogglePin={togglePinNote}
          emptyText={`No ${getWorkspaceMeta(activeWorkspaceId).shortLabel} notes yet.`}
          emptyAction={
            <Button onClick={() => startNew('general')}>
              <Plus className="h-4 w-4" /> Add a note
            </Button>
          }
        />
      ) : (
        <>
          <Breadcrumb nav={nav} onNavigate={setNav} />

          {nav.level === 'subjects' && <SubjectList notes={notes} onSelectGeneral={() => setNav({ level: 'notes', subject: 'general' })} onSelectSubject={(s) => setNav({ level: 'topics', subject: s })} />}

          {nav.level === 'topics' && (
            <TopicList subject={nav.subject} notes={notes} onSelectTopic={(topicId) => setNav({ level: 'notes', subject: nav.subject, topicId })} onSelectUncategorized={() => setNav({ level: 'notes', subject: nav.subject, uncategorized: true })} />
          )}

          {nav.level === 'notes' && (
            <NoteGrid
              notes={notesInView}
              onOpen={setEditing}
              onTogglePin={togglePinNote}
              emptyText="No notes for this topic yet."
              emptyAction={<Button onClick={() => startNew(nav.subject, nav.uncategorized ? undefined : nav.topicId)}><Plus className="h-4 w-4" /> Add a note</Button>}
            />
          )}
        </>
      )}
        </>
      )}

      <AnimatePresence>
        {editing && (
          <NoteEditor
            note={editing}
            isNew={creating}
            folders={folders}
            workspaceId={activeWorkspaceId}
            duplicateNotice={importDuplicateNotice}
            onClose={() => {
              setEditing(null);
              setCreating(false);
              setImportDuplicateNotice(null);
            }}
            onSave={(n) => {
              upsertNote({ ...n, updatedAt: new Date().toISOString() });
              setEditing(null);
              setCreating(false);
              setImportDuplicateNotice(null);
            }}
            onDelete={(id) => {
              deleteNote(id);
              setEditing(null);
              setCreating(false);
              setImportDuplicateNotice(null);
            }}
            onNavigateToNote={(n) => {
              setEditing(n);
              setCreating(false);
              setImportDuplicateNotice(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// Premium Note Organisation (Phase 3B) — sidebar scope, mirrors lib/noteOrganization.ts's NoteQuery
// but as a single discriminated value the sidebar can highlight "currently active" against, rather
// than several independent filter booleans that could disagree with each other.
type OrganiseScope =
  | { kind: 'all' }
  | { kind: 'recent' }
  | { kind: 'pinned' }
  | { kind: 'archived' }
  | { kind: 'folder'; folderId: string | null }
  | { kind: 'tag'; tag: string };

function scopeEquals(a: OrganiseScope, b: OrganiseScope): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'folder' && b.kind === 'folder') return a.folderId === b.folderId;
  if (a.kind === 'tag' && b.kind === 'tag') return a.tag === b.tag;
  return true;
}

const RECENT_NOTES_LIMIT = 20;

function OrganiseView({
  notes,
  folders,
  workspaceId,
  onOpenNote,
  onStartNew,
}: {
  notes: Note[];
  folders: Folder[];
  workspaceId: WorkspaceKind;
  onOpenNote: (note: Note) => void;
  onStartNew: () => void;
}) {
  const addFolder = useAppStore((s) => s.addFolder);
  const renameFolder = useAppStore((s) => s.renameFolder);
  const deleteFolder = useAppStore((s) => s.deleteFolder);
  const bulkUpdateNotes = useAppStore((s) => s.bulkUpdateNotes);
  const togglePinNote = useAppStore((s) => s.togglePinNote);

  const [scope, setScope] = useState<OrganiseScope>({ kind: 'all' });
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<NoteSortOrder>('updated');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTagInput, setBulkTagInput] = useState('');

  const [creatingFolderParentId, setCreatingFolderParentId] = useState<string | null | undefined>(undefined);
  const [renamingFolder, setRenamingFolder] = useState<Folder | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<Folder | null>(null);

  const folderTree = useMemo(() => buildFolderTree(folders, workspaceId), [folders, workspaceId]);
  const allTags = useMemo(() => collectNoteTags(notes), [notes]);

  const scopedResults = useMemo(() => {
    if (scope.kind === 'pinned') return queryNotes(notes, { search, sort, folders, pinnedOnly: true });
    if (scope.kind === 'archived') return queryNotes(notes, { search, sort, folders, archived: true });
    if (scope.kind === 'folder') return queryNotes(notes, { search, sort, folders, folderId: scope.folderId });
    if (scope.kind === 'tag') return queryNotes(notes, { search, sort, folders, tags: [scope.tag] });
    const results = queryNotes(notes, { search, sort, folders });
    return scope.kind === 'recent' ? results.slice(0, RECENT_NOTES_LIMIT) : results;
  }, [notes, scope, search, sort, folders]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function runBulk(patch: Parameters<typeof bulkUpdateNotes>[1]) {
    bulkUpdateNotes([...selectedIds], patch);
    clearSelection();
  }

  function handleCreateFolder(name: string, parentId: string | null) {
    if (!name.trim()) return;
    addFolder(createFolder(workspaceId, name, parentId));
    setCreatingFolderParentId(undefined);
  }

  function handleRenameFolder(name: string) {
    if (!renamingFolder || !name.trim()) return;
    renameFolder(renamingFolder.id, name);
    setRenamingFolder(null);
  }

  function handleConfirmDeleteFolder() {
    if (!deletingFolder) return;
    deleteFolder(deletingFolder.id, 'moveToParent');
    if (scope.kind === 'folder' && scope.folderId === deletingFolder.id) setScope({ kind: 'all' });
    setDeletingFolder(null);
  }

  const emptyText =
    scope.kind === 'pinned'
      ? 'No pinned notes yet.'
      : scope.kind === 'archived'
        ? 'No archived notes.'
        : scope.kind === 'folder'
          ? 'No notes in this folder yet.'
          : scope.kind === 'tag'
            ? `No notes tagged "${scope.tag}".`
            : search.trim()
              ? `No notes match "${search}".`
              : 'No notes yet.';

  return (
    <div className="flex flex-col gap-4 md:flex-row">
      <aside className="flex shrink-0 gap-2 overflow-x-auto pb-1 md:w-56 md:flex-col md:overflow-visible md:pb-0">
        <div className="flex shrink-0 gap-1.5 md:flex-col md:gap-1">
          <SidebarItem label="All Notes" icon={LayoutGrid} active={scopeEquals(scope, { kind: 'all' })} onClick={() => setScope({ kind: 'all' })} />
          <SidebarItem label="Recent" icon={Clock} active={scopeEquals(scope, { kind: 'recent' })} onClick={() => setScope({ kind: 'recent' })} />
          <SidebarItem label="Pinned" icon={Pin} active={scopeEquals(scope, { kind: 'pinned' })} onClick={() => setScope({ kind: 'pinned' })} />
          <SidebarItem label="Archived" icon={Archive} active={scopeEquals(scope, { kind: 'archived' })} onClick={() => setScope({ kind: 'archived' })} />
        </div>

        <div className="hidden md:block md:mt-3">
          <div className="mb-1 flex items-center justify-between px-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Folders</p>
            <button
              onClick={() => setCreatingFolderParentId(null)}
              aria-label="New root folder"
              title="New folder"
              className="rounded p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          </div>
          <SidebarItem label="Unfiled" icon={FolderIcon} active={scopeEquals(scope, { kind: 'folder', folderId: null })} onClick={() => setScope({ kind: 'folder', folderId: null })} />
          <FolderTreeList
            nodes={folderTree}
            scope={scope}
            onSelect={(folderId) => setScope({ kind: 'folder', folderId })}
            onAddChild={(parentId) => setCreatingFolderParentId(parentId)}
            onRename={setRenamingFolder}
            onDelete={setDeletingFolder}
          />
        </div>

        {allTags.length > 0 && (
          <div className="hidden md:block md:mt-3">
            <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Tags</p>
            <div className="flex flex-wrap gap-1 px-1">
              {allTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => setScope({ kind: 'tag', tag })}
                  className={cx(
                    'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium transition-colors',
                    scopeEquals(scope, { kind: 'tag', tag })
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
                  )}
                >
                  <Tag className="h-2.5 w-2.5" /> {tag}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      <div className="min-w-0 flex-1">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search…"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent py-2 pl-9 pr-3 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as NoteSortOrder)}
            className="rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          >
            <option value="updated">Recently updated</option>
            <option value="created">Recently created</option>
            <option value="title-asc">Title A–Z</option>
            <option value="title-desc">Title Z–A</option>
          </select>
        </div>

        {selectedIds.size > 0 && (
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5 dark:border-brand-500/30 dark:bg-brand-500/10">
            <span className="text-xs font-medium text-brand-700 dark:text-brand-300">{selectedIds.size} selected</span>
            <select
              onChange={(e) => {
                if (!e.target.value) return;
                runBulk({ folderId: e.target.value === '__root__' ? null : e.target.value });
                e.target.value = '';
              }}
              defaultValue=""
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-700 dark:text-slate-200"
            >
              <option value="" disabled>
                Move to…
              </option>
              <option value="__root__">Root (Unfiled)</option>
              {flattenFolderTree(folderTree).map(({ folder, depth }) => (
                <option key={folder.id} value={folder.id}>
                  {'—'.repeat(depth)} {folder.name}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-1">
              <input
                value={bulkTagInput}
                onChange={(e) => setBulkTagInput(e.target.value)}
                placeholder="Tag name"
                className="w-28 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-700 dark:text-slate-200"
              />
              <Button
                variant="secondary"
                disabled={!bulkTagInput.trim()}
                onClick={() => {
                  runBulk({ addTags: [bulkTagInput] });
                  setBulkTagInput('');
                }}
              >
                Add tag
              </Button>
              <Button
                variant="secondary"
                disabled={!bulkTagInput.trim()}
                onClick={() => {
                  runBulk({ removeTags: [bulkTagInput] });
                  setBulkTagInput('');
                }}
              >
                Remove tag
              </Button>
            </div>
            <Button variant="secondary" onClick={() => runBulk({ pinned: true })}>
              <Pin className="h-3.5 w-3.5" /> Pin
            </Button>
            <Button variant="secondary" onClick={() => runBulk({ pinned: false })}>
              Unpin
            </Button>
            <Button variant="secondary" onClick={() => runBulk({ isArchived: true })}>
              <Archive className="h-3.5 w-3.5" /> Archive
            </Button>
            <Button variant="secondary" onClick={() => runBulk({ isArchived: false })}>
              <ArchiveRestore className="h-3.5 w-3.5" /> Unarchive
            </Button>
            <Button variant="ghost" onClick={clearSelection}>
              Cancel
            </Button>
          </div>
        )}

        {scopedResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <NotebookPen className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
            <p className="text-slate-400 text-sm mb-4">{emptyText}</p>
            {scope.kind === 'all' && (
              <Button onClick={onStartNew}>
                <Plus className="h-4 w-4" /> Add a note
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {scopedResults.map((note) => (
              <OrganiseNoteCard
                key={note.id}
                note={note}
                folders={folders}
                selected={selectedIds.has(note.id)}
                onToggleSelected={() => toggleSelected(note.id)}
                onOpen={() => onOpenNote(note)}
                onTogglePin={() => togglePinNote(note.id)}
                onToggleArchive={() => bulkUpdateNotes([note.id], { isArchived: !isNoteArchived(note) })}
              />
            ))}
          </div>
        )}
      </div>

      {creatingFolderParentId !== undefined && (
        <FolderNameDialog
          title={creatingFolderParentId === null ? 'New Folder' : 'New Subfolder'}
          initialName=""
          confirmLabel="Create"
          onCancel={() => setCreatingFolderParentId(undefined)}
          onConfirm={(name) => handleCreateFolder(name, creatingFolderParentId)}
        />
      )}
      {renamingFolder && (
        <FolderNameDialog
          title="Rename Folder"
          initialName={renamingFolder.name}
          confirmLabel="Rename"
          onCancel={() => setRenamingFolder(null)}
          onConfirm={handleRenameFolder}
        />
      )}
      {deletingFolder && (
        <DeleteFolderDialog
          folder={deletingFolder}
          directNoteCount={notes.filter((n) => getNoteFolderId(n) === deletingFolder.id).length}
          subfolderCount={getFolderSubtreeIds(folders, deletingFolder.id).length - 1}
          onCancel={() => setDeletingFolder(null)}
          onConfirm={handleConfirmDeleteFolder}
        />
      )}
    </div>
  );
}

function SidebarItem({ label, icon: Icon, active, onClick }: { label: string; icon: typeof LayoutGrid; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500',
        active ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" /> {label}
    </button>
  );
}

function FolderTreeList({
  nodes,
  scope,
  depth = 0,
  onSelect,
  onAddChild,
  onRename,
  onDelete,
}: {
  nodes: FolderTreeNode[];
  scope: OrganiseScope;
  depth?: number;
  onSelect: (folderId: string) => void;
  onAddChild: (parentId: string) => void;
  onRename: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
}) {
  return (
    <div style={{ paddingLeft: depth > 0 ? 12 : 0 }}>
      {nodes.map((node) => (
        <div key={node.folder.id}>
          <div
            className={cx(
              'group flex items-center justify-between gap-1 rounded-lg px-2 py-1',
              scopeEquals(scope, { kind: 'folder', folderId: node.folder.id })
                ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400'
                : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
            )}
          >
            <button onClick={() => onSelect(node.folder.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm font-medium">
              <FolderIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{node.folder.name}</span>
            </button>
            <div className="flex shrink-0 items-center gap-0.5">
              <button onClick={() => onAddChild(node.folder.id)} aria-label="New subfolder" title="New subfolder" className="rounded p-2 hover:bg-slate-200 dark:hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500">
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => onRename(node.folder)} aria-label="Rename folder" title="Rename" className="rounded p-2 hover:bg-slate-200 dark:hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => onDelete(node.folder)} aria-label="Delete folder" title="Delete" className="rounded p-2 text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          {node.children.length > 0 && <FolderTreeList nodes={node.children} scope={scope} depth={depth + 1} onSelect={onSelect} onAddChild={onAddChild} onRename={onRename} onDelete={onDelete} />}
        </div>
      ))}
    </div>
  );
}

function OrganiseNoteCard({
  note,
  folders,
  selected,
  onToggleSelected,
  onOpen,
  onTogglePin,
  onToggleArchive,
}: {
  note: Note;
  folders: Folder[];
  selected: boolean;
  onToggleSelected: () => void;
  onOpen: () => void;
  onTogglePin: () => void;
  onToggleArchive: () => void;
}) {
  const folderName = note.folderId ? (folders.find((f) => f.id === note.folderId)?.name ?? null) : null;
  const tags = getNoteTags(note);
  const archived = isNoteArchived(note);

  return (
    <Card className="flex h-full flex-col p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <SelectionCheckbox selected={selected} title="note" onToggleSelected={onToggleSelected} />
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleArchive}
            aria-label={archived ? 'Unarchive' : 'Archive'}
            title={archived ? 'Unarchive' : 'Archive'}
            className="flex h-11 w-11 items-center justify-center rounded text-slate-300 hover:bg-slate-100 hover:text-slate-500 dark:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
          >
            {archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
          </button>
          <button
            onClick={onTogglePin}
            aria-label={note.pinned ? 'Unpin' : 'Pin'}
            className={cx(
              'flex h-11 w-11 items-center justify-center rounded text-slate-300 hover:bg-slate-100 dark:text-slate-600 dark:hover:bg-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500',
              note.pinned && 'text-gold-500',
            )}
          >
            <Pin className={cx('h-4 w-4', note.pinned && 'fill-gold-400')} />
          </button>
        </div>
      </div>
      <button onClick={onOpen} className="flex flex-1 flex-col text-left">
        <h4 className="font-display font-semibold text-slate-800 dark:text-slate-100 truncate">{note.title || 'Untitled note'}</h4>
        <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 line-clamp-3 whitespace-pre-wrap flex-1">{note.content || 'No content yet…'}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {folderName && <Badge tone="neutral">{folderName}</Badge>}
          {note.sourceFilename && <Badge tone="success">Imported</Badge>}
          {archived && <Badge tone="neutral">Archived</Badge>}
          {tags.map((tag) => (
            <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              <Tag className="h-2.5 w-2.5" /> {tag}
            </span>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-slate-300 dark:text-slate-600">{new Date(note.updatedAt).toLocaleDateString('en-IN')}</p>
      </button>
    </Card>
  );
}

function FolderNameDialog({
  title,
  initialName,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  title: string;
  initialName: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: (name: string) => void;
}) {
  const [name, setName] = useState(initialName);
  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-sm rounded-t-2xl sm:inset-0 sm:top-1/3 sm:bottom-auto sm:h-fit sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
          <button onClick={onCancel} className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && name.trim()) onConfirm(name);
            }}
            placeholder="Folder name"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800 px-5 py-4">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(name)} disabled={!name.trim()}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </>
  );
}

function DeleteFolderDialog({
  folder,
  directNoteCount,
  subfolderCount,
  onCancel,
  onConfirm,
}: {
  folder: Folder;
  directNoteCount: number;
  subfolderCount: number;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const hasContent = directNoteCount > 0 || subfolderCount > 0;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-sm rounded-t-2xl sm:inset-0 sm:top-1/3 sm:bottom-auto sm:h-fit sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Delete "{folder.name}"?</h3>
          <button onClick={onCancel} className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">
          {hasContent ? (
            <p>
              This folder contains {directNoteCount} note{directNoteCount === 1 ? '' : 's'}
              {subfolderCount > 0 ? ` and ${subfolderCount} subfolder${subfolderCount === 1 ? '' : 's'}` : ''}. Nothing will be deleted — everything inside
              will move up to this folder's own parent (or the root).
            </p>
          ) : (
            <p>This folder is empty. It will be removed.</p>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800 px-5 py-4">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm}>
            Delete Folder
          </Button>
        </div>
      </div>
    </>
  );
}

function Breadcrumb({ nav, onNavigate }: { nav: Nav; onNavigate: (n: Nav) => void }) {
  if (nav.level === 'subjects') return null;

  const crumbs: { label: string; onClick: () => void }[] = [{ label: 'Notes', onClick: () => onNavigate({ level: 'subjects' }) }];

  if (nav.level === 'topics') {
    const s = SYLLABUS.find((s) => s.colorKey === nav.subject);
    crumbs.push({ label: s?.shortTitle ?? nav.subject, onClick: () => onNavigate({ level: 'topics', subject: nav.subject }) });
  } else if (nav.level === 'notes') {
    if (nav.subject === 'general') {
      crumbs.push({ label: 'General', onClick: () => onNavigate({ level: 'notes', subject: 'general' }) });
    } else {
      const subjectKey = nav.subject;
      const s = SYLLABUS.find((s) => s.colorKey === subjectKey);
      crumbs.push({ label: s?.shortTitle ?? subjectKey, onClick: () => onNavigate({ level: 'topics', subject: subjectKey }) });
      const topicLabel = nav.uncategorized ? 'Uncategorized' : (nav.topicId && TOPIC_TITLES[nav.topicId]) || 'Topic';
      crumbs.push({ label: topicLabel, onClick: () => onNavigate(nav) });
    }
  }

  return (
    <div className="mb-4 flex items-center gap-1.5 text-sm">
      <button
        onClick={() => {
          if (nav.level === 'notes' && nav.subject !== 'general') onNavigate({ level: 'topics', subject: nav.subject });
          else onNavigate({ level: 'subjects' });
        }}
        className="mr-1 flex items-center gap-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
      >
        <ChevronLeft className="h-4 w-4" /> Back
      </button>
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />}
          <button
            onClick={c.onClick}
            className={cx(
              'font-medium hover:underline',
              i === crumbs.length - 1 ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500',
            )}
          >
            {c.label}
          </button>
        </span>
      ))}
    </div>
  );
}

function SubjectList({
  notes,
  onSelectGeneral,
  onSelectSubject,
}: {
  notes: Note[];
  onSelectGeneral: () => void;
  onSelectSubject: (s: SubjectColorKey) => void;
}) {
  const generalCount = notes.filter((n) => n.subject === 'general').length;
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <NavCard label="General" hint="Not tied to a subject" count={generalCount} onClick={onSelectGeneral} />
      {SYLLABUS.map((s) => {
        const count = notes.filter((n) => n.subject === s.colorKey).length;
        const colors = SUBJECT_COLORS[s.colorKey];
        return (
          <NavCard
            key={s.id}
            label={s.shortTitle}
            hint={`${s.topics.length} topics`}
            count={count}
            colorClass={cx(colors.bg, colors.text)}
            onClick={() => onSelectSubject(s.colorKey)}
          />
        );
      })}
    </div>
  );
}

function TopicList({
  subject,
  notes,
  onSelectTopic,
  onSelectUncategorized,
}: {
  subject: SubjectColorKey;
  notes: Note[];
  onSelectTopic: (topicId: string) => void;
  onSelectUncategorized: () => void;
}) {
  const subj = SYLLABUS.find((s) => s.colorKey === subject);
  const colors = SUBJECT_COLORS[subject];
  const uncategorizedCount = notes.filter((n) => n.subject === subject && !n.topicId).length;

  if (!subj) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {subj.topics.map((t) => {
        const count = notes.filter((n) => n.subject === subject && n.topicId === t.id).length;
        return <NavCard key={t.id} label={t.title} count={count} colorClass={cx(colors.bg, colors.text)} onClick={() => onSelectTopic(t.id)} />;
      })}
      {uncategorizedCount > 0 && (
        <NavCard
          label="Uncategorized"
          hint="Notes saved before topics were tracked"
          count={uncategorizedCount}
          colorClass="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
          onClick={onSelectUncategorized}
        />
      )}
    </div>
  );
}

function NavCard({
  label,
  hint,
  count,
  colorClass = 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  onClick,
}: {
  label: string;
  hint?: string;
  count: number;
  colorClass?: string;
  onClick: () => void;
}) {
  return (
    <button onClick={onClick} className="text-left">
      <Card className="flex items-center gap-3 p-4 h-full hover:border-brand-300 dark:hover:border-brand-500/40 transition-colors">
        <span className={cx('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', colorClass)}>
          <FolderOpen className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{label}</p>
          {hint && <p className="text-xs text-slate-400 mt-0.5 truncate">{hint}</p>}
        </div>
        <Badge tone="neutral">{count}</Badge>
      </Card>
    </button>
  );
}

function NoteGrid({
  notes,
  onOpen,
  onTogglePin,
  emptyText,
  emptyAction,
  showLocation = false,
}: {
  notes: Note[];
  onOpen: (n: Note) => void;
  onTogglePin: (id: string) => void;
  emptyText: string;
  emptyAction?: React.ReactNode;
  showLocation?: boolean;
}) {
  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <NotebookPen className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
        <p className="text-slate-400 text-sm mb-4">{emptyText}</p>
        {emptyAction}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {notes.map((note) => {
        const colors = note.subject !== 'general' ? SUBJECT_COLORS[note.subject] : null;
        const subjTitle = note.subject !== 'general' ? SYLLABUS.find((s) => s.colorKey === note.subject)?.shortTitle : 'General';
        const topicTitle = note.topicId ? TOPIC_TITLES[note.topicId] : null;
        return (
          <motion.div key={note.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="flex h-full flex-col p-4 cursor-pointer" onClick={() => onOpen(note)}>
              <div className="mb-2 flex items-center justify-between">
                <Badge className={colors ? cx(colors.bg, colors.text) : ''} tone={colors ? undefined : 'neutral'}>
                  {subjTitle}
                </Badge>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onTogglePin(note.id);
                  }}
                  className={cx('text-slate-300 dark:text-slate-600', note.pinned && 'text-gold-500')}
                >
                  <Pin className={cx('h-4 w-4', note.pinned && 'fill-gold-400')} />
                </button>
              </div>
              {showLocation && topicTitle && <p className="mb-1 text-[11px] text-slate-400 truncate">{topicTitle}</p>}
              <h4 className="font-display font-semibold text-slate-800 dark:text-slate-100 truncate">{note.title || 'Untitled note'}</h4>
              <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400 line-clamp-4 whitespace-pre-wrap flex-1">{note.content || 'No content yet…'}</p>
              <p className="mt-3 text-[11px] text-slate-300 dark:text-slate-600">{new Date(note.updatedAt).toLocaleDateString('en-IN')}</p>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}

function NoteEditor({
  note,
  isNew,
  folders,
  workspaceId,
  duplicateNotice,
  onClose,
  onSave,
  onDelete,
  onNavigateToNote,
}: {
  note: Note;
  isNew: boolean;
  folders: Folder[];
  workspaceId: WorkspaceKind;
  /** Only ever set for a freshly imported, not-yet-saved note (see Notes.tsx's handleImportFile) —
   * always undefined/null for a blank new note or an existing note being reopened. Advisory only:
   * Save stays enabled either way, matching the same non-blocking duplicate UX as the Repository
   * Import Centre (components/repository/ImportToRepositoryModal.tsx). */
  duplicateNotice?: NoteDuplicateMatchResult | null;
  onClose: () => void;
  onSave: (n: Note) => void;
  onDelete: (id: string) => void;
  /** Backlinks panel (Phase 5F/5I) — switches the editor to a note that links here. Only ever
   * called for a note-type backlink source; an imported-content source isn't navigable from this
   * modal (that lives on Repository/PhdResearch/WorkingBibliography's own pages instead). */
  onNavigateToNote: (note: Note) => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [subject, setSubject] = useState<SubjectColorKey | 'general'>(note.subject);
  const [topicId, setTopicId] = useState<string | undefined>(note.topicId);
  // Premium Note Organisation (Phase 3B) — folder/tags/archive, editable from the same editor a
  // note is already opened in, alongside its title/content/subject. folderId uses '' as the
  // <select>'s own "Root" sentinel (native <select> values are always strings); translated back to
  // `null` only at save time, never stored as the literal string '' on the Note itself.
  const [folderId, setFolderId] = useState<string>(note.folderId ?? '');
  const [tagsInput, setTagsInput] = useState(getNoteTags(note).join(', '));
  const [isArchived, setIsArchived] = useState(isNoteArchived(note));
  const [pinned, setPinned] = useState(note.pinned);
  // Raw-Markdown edit vs. safe rendered preview — the note is always stored/edited as plain
  // Markdown text; preview mode only changes how it's displayed, via markdown-to-jsx (never
  // dangerouslySetInnerHTML), with disableParsingRawHTML so any HTML/script tags in imported or
  // typed content render as inert literal text instead of being parsed.
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');

  // Premium Knowledge Editor, Phase 5B-5G — the editor toolbar/slash-commands/wiki-links all act on
  // the textarea's own DOM selection (components/editor/textareaEditing.ts), so a ref is required
  // alongside the controlled `content` state. Both popups are docked, controlled-by-parent
  // components (see their own file headers) — only one can be open at a time, since a wiki-link
  // trigger and a slash-command trigger can never both match the same cursor position.
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [slashTrigger, setSlashTrigger] = useState<SlashCommandTrigger | null>(null);
  const [slashActiveIndex, setSlashActiveIndex] = useState(0);
  const [wikiLinkTrigger, setWikiLinkTrigger] = useState<WikiLinkAutocompleteTrigger | null>(null);
  const [wikiLinkActiveIndex, setWikiLinkActiveIndex] = useState(0);

  const notesForLinks = useAppStore((s) => s.notes);
  const importedContentForLinks = useAppStore((s) => s.importedContent);
  const contentRelationships = useAppStore((s) => s.contentRelationships);
  const addContentRelationship = useAppStore((s) => s.addContentRelationship);
  const deleteContentRelationship = useAppStore((s) => s.deleteContentRelationship);

  const slashMatches = slashTrigger ? filterSlashCommands(slashTrigger.query) : [];
  // Phase 5L — the expensive scan+map+sort over every note/document in the workspace only re-runs
  // when the underlying data actually changes, never per keystroke; typing in the [[ autocomplete
  // only re-runs the cheap substring filter below against this already-built pool.
  const wikiLinkCandidatePool = useMemo(
    () => buildWikiLinkCandidatePool(notesForLinks, importedContentForLinks, workspaceId, note.id),
    [notesForLinks, importedContentForLinks, workspaceId, note.id],
  );
  const wikiLinkMatches = wikiLinkTrigger ? filterWikiLinkCandidates(wikiLinkCandidatePool, wikiLinkTrigger.query) : [];
  const backlinks = useMemo(
    () => (isNew ? [] : getBacklinks(note.id, 'note', contentRelationships, notesForLinks, importedContentForLinks, workspaceId)),
    [isNew, note.id, contentRelationships, notesForLinks, importedContentForLinks, workspaceId],
  );

  const subj = subject !== 'general' ? SYLLABUS.find((s) => s.colorKey === subject) : undefined;

  function handleSubjectChange(next: SubjectColorKey | 'general') {
    setSubject(next);
    // The old topic doesn't necessarily belong to the newly chosen subject — reset it.
    setTopicId(undefined);
  }

  // Recomputes both docked-popup triggers from the textarea's OWN current value/cursor — called
  // after every content change (typing, toolbar button, template/slash/wiki-link insertion alike),
  // so the popups never depend on a second, potentially stale copy of the cursor position.
  function recomputeTriggers(text: string, cursor: number) {
    const slash = detectSlashCommandTrigger(text, cursor);
    setSlashTrigger(slash);
    setSlashActiveIndex(0);
    // A "/" trigger and a "[[" trigger can never both be active for the same cursor position, but
    // guarding explicitly (rather than relying on that) keeps this function honest on its own.
    const wiki = slash ? null : detectWikiLinkAutocompleteTrigger(text, cursor);
    setWikiLinkTrigger(wiki);
    setWikiLinkActiveIndex(0);
  }

  function handleContentChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setContent(e.target.value);
    recomputeTriggers(e.target.value, e.target.selectionStart);
  }

  function applySlashCommand(commandId: string) {
    const el = textareaRef.current;
    if (!el || !slashTrigger) return;
    const edit = buildSlashCommandEdit(commandId, slashTrigger);
    if (!edit) return;
    const next = applyEditToTextarea(el, edit);
    setContent(next);
    setSlashTrigger(null);
    recomputeTriggers(next, el.selectionStart);
  }

  function applyWikiLinkSelection(candidate: WikiLinkCandidate) {
    const el = textareaRef.current;
    if (!el || !wikiLinkTrigger) return;
    const edit = buildWikiLinkInsertEdit(wikiLinkTrigger, candidate.id, candidate.title);
    const next = applyEditToTextarea(el, edit);
    setContent(next);
    setWikiLinkTrigger(null);
    recomputeTriggers(next, el.selectionStart);
  }

  function handleTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const activeMenu = slashTrigger ? { matches: slashMatches, onSelect: (i: number) => applySlashCommand(slashMatches[i].id) } : wikiLinkTrigger ? { matches: wikiLinkMatches, onSelect: (i: number) => applyWikiLinkSelection(wikiLinkMatches[i]) } : null;

    if (activeMenu) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const setIndex = slashTrigger ? setSlashActiveIndex : setWikiLinkActiveIndex;
        setIndex((i) => (activeMenu.matches.length ? (i + 1) % activeMenu.matches.length : 0));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        const setIndex = slashTrigger ? setSlashActiveIndex : setWikiLinkActiveIndex;
        setIndex((i) => (activeMenu.matches.length ? (i - 1 + activeMenu.matches.length) % activeMenu.matches.length : 0));
        return;
      }
      if (e.key === 'Enter') {
        if (activeMenu.matches.length > 0) {
          e.preventDefault();
          const activeIndex = slashTrigger ? slashActiveIndex : wikiLinkActiveIndex;
          activeMenu.onSelect(Math.min(activeIndex, activeMenu.matches.length - 1));
        }
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashTrigger(null);
        setWikiLinkTrigger(null);
        return;
      }
    }

    if (handleEditorKeyboardShortcut(e, (next) => { setContent(next); recomputeTriggers(next, textareaRef.current?.selectionStart ?? next.length); })) {
      e.preventDefault();
    }
  }

  function applyTemplate(template: ReturnType<typeof getNoteTemplate>) {
    if (!template) return;
    setContent(template.content);
  }

  function handleSaveClick() {
    const savedNote: Note = {
      ...note,
      title: title.trim() || 'Untitled note',
      content,
      subject,
      topicId,
      folderId: folderId || null,
      tags: parseTagsInput(tagsInput),
      isArchived,
      pinned,
    };
    onSave(savedNote);

    // Wiki-link relationships sync only on explicit Save, never per keystroke (decision #11) — read
    // FRESH post-save state via getState() rather than this closure's own (pre-save) hook values,
    // since onSave's synchronous store mutation doesn't re-run this function body.
    const state = useAppStore.getState();
    const resolved = extractWikiLinks(savedNote.content, {
      notes: state.notes,
      importedContent: state.importedContent,
      workspaceId,
    });
    const diff = diffWikiLinkRelationships(savedNote.id, 'note', resolved, state.contentRelationships, workspaceId);
    for (const addition of diff.toAdd) {
      addContentRelationship({ source: { id: savedNote.id, type: 'note' }, target: { id: addition.targetId, type: addition.targetType }, type: 'links_to' });
    }
    for (const id of diff.toRemoveIds) {
      deleteContentRelationship(id);
    }
  }

  return (
    <>
      <motion.div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
      <motion.div
        className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-2xl rounded-t-2xl sm:inset-0 sm:top-16 sm:bottom-auto sm:h-fit sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      >
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">{isNew ? 'New Note' : 'Edit Note'}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-4">
          {isNew && duplicateNotice?.exactMatch && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              <Copy className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                <span className="font-medium">This exact file was already imported</span> as "{duplicateNotice.exactMatch.title}". Saving will add a
                separate note — nothing is overwritten or merged automatically.
              </p>
            </div>
          )}
          {isNew && !duplicateNotice?.exactMatch && duplicateNotice && duplicateNotice.possibleMatches.length > 0 && (
            <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
              <Copy className="h-4 w-4 shrink-0 mt-0.5 text-slate-400" />
              <p>
                <span className="font-medium">Possible duplicate</span> — same filename and size as{' '}
                {duplicateNotice.possibleMatches.map((n) => `"${n.title}"`).join(', ')}. This is a filename/size match only, not confirmed.
              </p>
            </div>
          )}
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Note title"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
          {isNew && (
            <div>
              <label htmlFor="note-template" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                Start from a template
              </label>
              <select
                id="note-template"
                defaultValue=""
                onChange={(e) => {
                  applyTemplate(getNoteTemplate(e.target.value));
                  e.target.value = '';
                }}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              >
                <option value="" disabled>
                  Choose a template… (replaces current content)
                </option>
                {NOTE_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {t.description}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <select
              value={subject}
              onChange={(e) => handleSubjectChange(e.target.value as SubjectColorKey | 'general')}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            >
              <option value="general">General</option>
              {SYLLABUS.map((s) => (
                <option key={s.id} value={s.colorKey}>
                  {s.shortTitle}
                </option>
              ))}
            </select>
            <select
              value={topicId ?? ''}
              onChange={(e) => setTopicId(e.target.value || undefined)}
              disabled={!subj}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40 disabled:opacity-50"
            >
              <option value="">{subj ? 'No specific topic' : 'Topics need a subject'}</option>
              {subj?.topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </div>
          <NotePropertiesPanel
            folderId={folderId || null}
            tagsInput={tagsInput}
            pinned={pinned}
            isArchived={isArchived}
            createdAt={note.createdAt}
            updatedAt={note.updatedAt}
            folders={folders}
            workspaceId={workspaceId}
            onFolderChange={(next) => setFolderId(next ?? '')}
            onTagsInputChange={setTagsInput}
            onPinnedChange={setPinned}
            onArchivedChange={setIsArchived}
          />
          <div className="flex items-center justify-end">
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setMode('edit')}
                className={cx(
                  'flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors',
                  mode === 'edit' ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
                )}
              >
                <Pencil className="h-3.5 w-3.5" /> Edit
              </button>
              <button
                type="button"
                onClick={() => setMode('preview')}
                className={cx(
                  'flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors',
                  mode === 'preview' ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
                )}
              >
                <Eye className="h-3.5 w-3.5" /> Preview
              </button>
            </div>
          </div>
          {mode === 'edit' ? (
            <div className="space-y-2">
              <EditorToolbar textareaRef={textareaRef} onChange={(next) => { setContent(next); recomputeTriggers(next, textareaRef.current?.selectionStart ?? next.length); }} />
              {slashTrigger && <SlashCommandMenu commands={slashMatches} activeIndex={slashActiveIndex} onSelect={applySlashCommand} onHover={setSlashActiveIndex} />}
              {wikiLinkTrigger && <WikiLinkAutocomplete candidates={wikiLinkMatches} activeIndex={wikiLinkActiveIndex} onSelect={applyWikiLinkSelection} onHover={setWikiLinkActiveIndex} />}
              <textarea
                ref={textareaRef}
                value={content}
                onChange={handleContentChange}
                onKeyDown={handleTextareaKeyDown}
                // Phase 5M — closes a stale slash/wiki-link popup when the user taps/tabs away to
                // another field (Folder, Save, …) instead of leaving it visibly open. Never races
                // an in-popup selection: every popup button preempts blur via its own onMouseDown.
                onBlur={() => { setSlashTrigger(null); setWikiLinkTrigger(null); }}
                placeholder="Write your notes here… Type / for commands, [[ to link a note or document."
                rows={10}
                className="w-full resize-none rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </div>
          ) : (
            <MarkdownPreview
              content={content}
              className="min-h-[15rem] rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2"
              emptyText="Nothing to preview yet."
            />
          )}
          {!isNew && <BacklinksPanel backlinks={backlinks} onOpen={(sourceId, sourceType) => { if (sourceType === 'note') { const target = notesForLinks.find((n) => n.id === sourceId); if (target) onNavigateToNote(target); } }} />}
          {!isNew && <LinkedResearchSection noteId={note.id} />}
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 px-5 py-4">
          {!isNew ? (
            <button onClick={() => onDelete(note.id)} className="flex items-center gap-1.5 text-sm font-medium text-rose-500 hover:text-rose-600">
              <Trash2 className="h-4 w-4" /> Delete
            </button>
          ) : (
            <span />
          )}
          <Button onClick={handleSaveClick}>Save Note</Button>
        </div>
      </motion.div>
    </>
  );
}

// Notes <-> Research Repository Linking — read-only display + unlink only. A note never creates a
// link itself; that always happens from the research document's or bibliography record's own
// "Linked Notes" modal (see components/phdResearch/LinkedNotesModal.tsx), where an existing note is
// explicitly selected — never inferred from this note's title, tags, or content. Only shown for a
// PhD Research workspace note (research documents/bibliography only exist there), and only once the
// note has been saved at least once (a brand-new, not-yet-saved note cannot have anything already
// linked to it).
function LinkedResearchSection({ noteId }: { noteId: string }) {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const importedContent = useAppStore((s) => s.importedContent);
  const notes = useAppStore((s) => s.notes);
  const contentRelationships = useAppStore((s) => s.contentRelationships);
  const deleteContentRelationship = useAppStore((s) => s.deleteContentRelationship);

  if (activeWorkspaceId !== 'phd_research') return null;

  const linked = getIncomingRelationships(contentRelationships, noteId, 'note')
    .map((relationship) => ({ relationship, source: getImportedContentById(importedContent, relationship.sourceId) }))
    .filter((entry): entry is { relationship: ContentRelationship; source: ImportedContent } => !!entry.source);

  // Non-interactive — the full detail already renders directly below this summary (no separate
  // modal to open for a note, unlike the document/bibliography sides — see RelatedContentSummary's
  // own doc comment).
  const related = countRelatedContent(contentRelationships, noteId, 'note', importedContent, notes);

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <Link2 className="h-3.5 w-3.5" /> Linked Research
        </p>
        <RelatedContentSummary
          prefix=""
          segments={[
            { count: related.researchDocuments, singularLabel: 'Document', pluralLabel: 'Documents' },
            { count: related.bibliographyRecords, singularLabel: 'Source', pluralLabel: 'Sources' },
          ]}
        />
      </div>
      {linked.length === 0 ? (
        <p className="text-xs text-slate-400">Link this note from a document's or record's own "Linked Notes" action.</p>
      ) : (
        <div className="space-y-1.5">
          {linked.map(({ relationship, source }) => (
            <div key={relationship.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1.5">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">{source.title}</p>
                <div className="mt-0.5 flex items-center gap-1">
                  <Badge tone="neutral">{source.contentType === 'bibliography' ? 'Bibliography' : 'Research Document'}</Badge>
                  <Badge tone="brand">{RELATIONSHIP_TYPE_LABELS[relationship.type]}</Badge>
                </div>
              </div>
              <button
                onClick={() => deleteContentRelationship(relationship.id)}
                aria-label="Unlink"
                title="Unlink"
                className="shrink-0 rounded-lg p-1.5 text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
              >
                <Unlink className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
