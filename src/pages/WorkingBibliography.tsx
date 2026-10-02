import { useMemo, useRef, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { GraduationCap, Upload, Plus, X, BookMarked, Trash2, Eye, Pencil, Search, Tag, SlidersHorizontal, ExternalLink, Link2, Unlink, NotebookPen, Copy, Archive, ArrowRight } from 'lucide-react';
import { MarkdownPreview } from '../components/markdown/MarkdownPreview';
import { useAppStore } from '../lib/store';
import { getWorkspaceMeta } from '../lib/workspace';
import { Card, Badge, Button, PageHeader } from '../components/ui/Primitives';
import { PhdResearchTabs } from '../components/phdResearch/PhdResearchTabs';
import { LinkedNotesModal } from '../components/phdResearch/LinkedNotesModal';
import { RelatedContentSummary } from '../components/phdResearch/RelatedContentSummary';
import { cx } from '../lib/utils';
import {
  extractContentFromFile,
  buildImportPreview,
  confirmImportedContent,
  createManualImportedContent,
  selectImportedContentByType,
  getImportedContentById,
  SUPPORTED_IMPORT_EXTENSIONS,
  IMPORT_FORMAT_LABELS,
  type ImportPreview,
  type ImportedContent,
  type ImportedContentMetadata,
} from '../lib/contentImport';
import { sha256Hex } from '../lib/fileHash';
import { findDuplicates, type DuplicateMatchResult } from '../lib/importDuplicates';
import { collectImportedContentTags, collectImportedContentCategories, getContentTags, getContentCategory, getContentFolderId, parseTagsInput } from '../lib/importedContentRepository';
import { repositoryDetailPathFor } from '../lib/repositoryNavigation';
import { PinToggle } from '../components/organisation/PinToggle';
import { ArchiveToggle } from '../components/organisation/ArchiveToggle';
import { BulkActionBar } from '../components/organisation/BulkActionBar';
import { SelectionCheckbox } from '../components/organisation/SelectionCheckbox';
import { buildFolderTree, flattenFolderTree } from '../lib/folders';
import {
  BIBLIOGRAPHY_PUBLICATION_TYPES,
  BIBLIOGRAPHY_PUBLICATION_TYPE_LABELS,
  BIBLIOGRAPHY_FORMAT_GUIDE,
  parseBibliographyRecords,
  formatBibliographyRecordAsText,
  buildBibliographyMetadata,
  getBibliographyFields,
  isManuallyCreated,
  parseAuthorsInput,
  queryBibliography,
  collectBibliographyAuthors,
  collectBibliographyYears,
  collectBibliographyPublicationTypes,
  type BibliographyFields,
  type BibliographyPublicationType,
  type BibliographyRecordDraft,
} from '../lib/bibliography';
import {
  MANUALLY_ASSIGNABLE_RELATIONSHIP_TYPES,
  RELATIONSHIP_TYPE_LABELS,
  getOutgoingRelationships,
  type RelationshipType,
  type ContentRelationship,
} from '../lib/contentRelationships';
import { countRelatedContent } from '../lib/relatedContentSummary';
import { ReadingStatusPicker } from '../components/phdResearch/ReadingStatusPicker';

// PhD Research — Working Bibliography. A structured, searchable source repository sitting
// alongside the research-document repository (pages/PhdResearch.tsx), reusing the same
// FILE -> EXTRACT -> PREVIEW -> CONFIRM -> SAVE pipeline and the same workspace-scoped
// importedContent store — see lib/bibliography.ts for the domain model and parsing/query logic.
// No AI-generated citations, no automatic extraction from arbitrary PDFs: a file only becomes
// structured records when it matches the documented format; anything else is preserved as a single
// unstructured bibliography document instead (never a guessed record).
//
// Knowledge Workspace Phase 3A: this page still calls extractContentFromFile/buildImportPreview
// directly (unchanged) rather than lib/importPipeline.ts's runFileImport, because ONE imported file
// here can become MANY bibliography records (see parseBibliographyRecords/handleConfirmStructured
// below) or ONE unstructured fallback document — a genuinely different shape than runFileImport's
// single-preview result. What IS reused directly are the same underlying primitives runFileImport
// itself composes: lib/fileHash.ts's sha256Hex and lib/importDuplicates.ts's findDuplicates, run
// once per selected file (all records/the fallback document derived from one file share that
// file's own hash/size — they really are the same source bytes). Duplicate detection is advisory
// only, exactly like the Repository Import Centre and PhD Research: never blocking, never
// auto-overwriting an existing source.

interface BibliographyFormValues {
  title: string;
  authors: string;
  year: string;
  publicationType: BibliographyPublicationType | '';
  containerTitle: string;
  volume: string;
  issue: string;
  pages: string;
  doi: string;
  isbn: string;
  url: string;
  citationKey: string;
  notes: string;
  tags: string;
  category: string;
}

function emptyFormValues(): BibliographyFormValues {
  return {
    title: '',
    authors: '',
    year: '',
    publicationType: '',
    containerTitle: '',
    volume: '',
    issue: '',
    pages: '',
    doi: '',
    isbn: '',
    url: '',
    citationKey: '',
    notes: '',
    tags: '',
    category: '',
  };
}

function formValuesFromItem(item: ImportedContent): BibliographyFormValues {
  const fields = getBibliographyFields(item);
  return {
    title: item.title,
    authors: (fields.authors ?? []).join(', '),
    year: fields.year ?? '',
    publicationType: fields.publicationType ?? '',
    containerTitle: fields.containerTitle ?? '',
    volume: fields.volume ?? '',
    issue: fields.issue ?? '',
    pages: fields.pages ?? '',
    doi: fields.doi ?? '',
    isbn: fields.isbn ?? '',
    url: fields.url ?? '',
    citationKey: fields.citationKey ?? '',
    notes: fields.notes ?? '',
    tags: getContentTags(item).join(', '),
    category: getContentCategory(item) ?? '',
  };
}

function fieldsFromFormValues(values: BibliographyFormValues): BibliographyFields {
  const fields: BibliographyFields = {};
  const authors = parseAuthorsInput(values.authors);
  if (authors.length > 0) fields.authors = authors;
  if (values.year.trim()) fields.year = values.year.trim();
  if (values.publicationType) fields.publicationType = values.publicationType;
  if (values.containerTitle.trim()) fields.containerTitle = values.containerTitle.trim();
  if (values.volume.trim()) fields.volume = values.volume.trim();
  if (values.issue.trim()) fields.issue = values.issue.trim();
  if (values.pages.trim()) fields.pages = values.pages.trim();
  if (values.doi.trim()) fields.doi = values.doi.trim();
  if (values.isbn.trim()) fields.isbn = values.isbn.trim();
  if (values.url.trim()) fields.url = values.url.trim();
  if (values.citationKey.trim()) fields.citationKey = values.citationKey.trim();
  if (values.notes.trim()) fields.notes = values.notes.trim();
  return fields;
}

export default function WorkingBibliography() {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const importedContent = useAppStore((s) => s.importedContent);
  const addImportedContent = useAppStore((s) => s.addImportedContent);
  const updateImportedContent = useAppStore((s) => s.updateImportedContent);
  const deleteImportedContent = useAppStore((s) => s.deleteImportedContent);
  const notes = useAppStore((s) => s.notes);
  const contentRelationships = useAppStore((s) => s.contentRelationships);
  const addContentRelationship = useAppStore((s) => s.addContentRelationship);
  const deleteContentRelationship = useAppStore((s) => s.deleteContentRelationship);
  const folders = useAppStore((s) => s.folders);
  const bulkUpdateImportedContent = useAppStore((s) => s.bulkUpdateImportedContent);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [structuredPreview, setStructuredPreview] = useState<{
    records: BibliographyRecordDraft[];
    skippedBlockCount: number;
    sourceFilename: string;
    originalFormat: ImportPreview['originalFormat'];
  } | null>(null);
  const [fallbackPreview, setFallbackPreview] = useState<ImportPreview | null>(null);
  const [fallbackTitle, setFallbackTitle] = useState('');
  // One hash/size/duplicate-check per SELECTED FILE, shared by every structured record (or the one
  // fallback document) it produces — see this file's own header comment above.
  const [importFileSizeBytes, setImportFileSizeBytes] = useState<number | null>(null);
  const [importSourceHash, setImportSourceHash] = useState<string | undefined>(undefined);
  const [importDuplicates, setImportDuplicates] = useState<DuplicateMatchResult | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [formValues, setFormValues] = useState<BibliographyFormValues>(emptyFormValues());
  const [editingItem, setEditingItem] = useState<ImportedContent | null>(null);

  const [viewing, setViewing] = useState<ImportedContent | null>(null);
  const [linkingRecord, setLinkingRecord] = useState<ImportedContent | null>(null);
  const [notesLinkingRecord, setNotesLinkingRecord] = useState<ImportedContent | null>(null);
  const [showFormatGuide, setShowFormatGuide] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedAuthor, setSelectedAuthor] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedType, setSelectedType] = useState<BibliographyPublicationType | ''>('');
  const [selectedFolderId, setSelectedFolderId] = useState<string | null | undefined>(undefined);
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const bibliographyRecords = useMemo(() => selectImportedContentByType(importedContent, 'bibliography'), [importedContent]);
  const researchDocuments = useMemo(() => selectImportedContentByType(importedContent, 'research_document'), [importedContent]);
  const availableTags = useMemo(() => collectImportedContentTags(bibliographyRecords), [bibliographyRecords]);
  const availableCategories = useMemo(() => collectImportedContentCategories(bibliographyRecords), [bibliographyRecords]);
  const availableAuthors = useMemo(() => collectBibliographyAuthors(bibliographyRecords), [bibliographyRecords]);
  const availableYears = useMemo(() => collectBibliographyYears(bibliographyRecords), [bibliographyRecords]);
  const availableTypes = useMemo(() => collectBibliographyPublicationTypes(bibliographyRecords), [bibliographyRecords]);
  const folderNameById = useMemo(() => new Map(folders.map((f) => [f.id, f.name])), [folders]);

  const filteredRecords = useMemo(
    () =>
      queryBibliography(bibliographyRecords, {
        search: searchQuery,
        tags: selectedTags,
        category: selectedCategory || undefined,
        author: selectedAuthor || undefined,
        year: selectedYear || undefined,
        publicationType: selectedType || undefined,
        folderId: selectedFolderId,
        pinnedOnly,
        archived: showArchived,
      }),
    [bibliographyRecords, searchQuery, selectedTags, selectedCategory, selectedAuthor, selectedYear, selectedType, selectedFolderId, pinnedOnly, showArchived],
  );

  const hasActiveFilters =
    searchQuery.trim() !== '' ||
    selectedTags.length > 0 ||
    selectedCategory !== '' ||
    selectedAuthor !== '' ||
    selectedYear !== '' ||
    selectedType !== '' ||
    selectedFolderId !== undefined ||
    pinnedOnly ||
    showArchived;

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

  function runBulk(patch: Parameters<typeof bulkUpdateImportedContent>[1]) {
    bulkUpdateImportedContent([...selectedIds], patch);
    clearSelection();
  }

  function clearFilters() {
    setSearchQuery('');
    setSelectedTags([]);
    setSelectedCategory('');
    setSelectedAuthor('');
    setSelectedYear('');
    setSelectedType('');
    setSelectedFolderId(undefined);
    setPinnedOnly(false);
    setShowArchived(false);
  }

  function toggleTagFilter(tag: string) {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function linkedDocumentCount(recordId: string) {
    return getOutgoingRelationships(contentRelationships, recordId, 'imported_content').filter((r) => r.targetType === 'imported_content').length;
  }

  function linkedNoteCount(recordId: string) {
    return getOutgoingRelationships(contentRelationships, recordId, 'imported_content').filter((r) => r.targetType === 'note').length;
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportError(null);
    setExtracting(true);
    try {
      const result = await extractContentFromFile(file);
      if (result.status === 'error') {
        setImportError(result.message);
        return;
      }

      // Hash + duplicate check once per selected file — reused by every structured record (or the
      // one fallback document) below, since they all come from these exact same source bytes.
      let sourceHash: string | undefined;
      try {
        sourceHash = await sha256Hex(file);
      } catch {
        sourceHash = undefined;
      }
      setImportFileSizeBytes(file.size);
      setImportSourceHash(sourceHash);
      setImportDuplicates(findDuplicates(importedContent, 'phd_research', { sourceFilename: file.name, sourceHash, sourceFileSize: file.size }));

      const parsed = parseBibliographyRecords(result.content.text);
      if (parsed.records.length > 0) {
        setStructuredPreview({ ...parsed, sourceFilename: file.name, originalFormat: result.content.format });
      } else {
        const nextPreview = buildImportPreview(file, result.content);
        setFallbackPreview(nextPreview);
        setFallbackTitle(nextPreview.title);
      }
    } finally {
      setExtracting(false);
    }
  }

  function handleConfirmStructured() {
    if (!structuredPreview) return;
    for (const record of structuredPreview.records) {
      const preview: ImportPreview = {
        sourceFilename: structuredPreview.sourceFilename,
        originalFormat: structuredPreview.originalFormat,
        suggestedContentType: 'bibliography',
        title: record.title,
        content: record.rawBlock,
      };
      const content = confirmImportedContent(preview, {
        workspaceId: 'phd_research',
        contentType: 'bibliography',
        metadata: buildBibliographyMetadata({ fields: record.fields, tags: record.tags, category: record.category }),
        sourceHash: importSourceHash,
        sourceFileSize: importFileSizeBytes ?? undefined,
      });
      addImportedContent(content);
    }
    setStructuredPreview(null);
    setImportFileSizeBytes(null);
    setImportSourceHash(undefined);
    setImportDuplicates(null);
  }

  function handleConfirmFallback() {
    if (!fallbackPreview) return;
    const content = confirmImportedContent(fallbackPreview, {
      workspaceId: 'phd_research',
      contentType: 'bibliography',
      title: fallbackTitle.trim() || fallbackPreview.title,
      metadata: buildBibliographyMetadata({}),
      sourceHash: importSourceHash,
      sourceFileSize: importFileSizeBytes ?? undefined,
    });
    addImportedContent(content);
    setFallbackPreview(null);
    setFallbackTitle('');
    setImportFileSizeBytes(null);
    setImportSourceHash(undefined);
    setImportDuplicates(null);
  }

  function openManualForm() {
    setEditingItem(null);
    setFormValues(emptyFormValues());
    setFormOpen(true);
  }

  function openEditForm(item: ImportedContent) {
    setEditingItem(item);
    setFormValues(formValuesFromItem(item));
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingItem(null);
  }

  function handleSaveForm() {
    const title = formValues.title.trim();
    if (!title) return;
    const fields = fieldsFromFormValues(formValues);
    const tags = parseTagsInput(formValues.tags);
    const category = formValues.category.trim() || undefined;
    const metadata = buildBibliographyMetadata({ fields, tags, category });

    if (editingItem) {
      // buildBibliographyMetadata builds a FRESH metadata object from this form's own fields
      // (citation fields/tags/category only) — it has no idea folderId/isPinned/isArchived exist,
      // so saving an edit must never silently wipe them. Merged back in from the item's current
      // metadata before this replaces `metadata` wholesale.
      const organisationFields: ImportedContentMetadata = {
        ...(editingItem.metadata?.folderId !== undefined ? { folderId: editingItem.metadata.folderId } : {}),
        ...(editingItem.metadata?.isPinned ? { isPinned: true } : {}),
        ...(editingItem.metadata?.isArchived ? { isArchived: true } : {}),
      };
      const mergedMetadata = metadata || Object.keys(organisationFields).length > 0 ? { ...metadata, ...organisationFields } : metadata;
      const updates: Partial<Omit<ImportedContent, 'id' | 'workspaceId'>> = { title, metadata: mergedMetadata };
      // Never silently overwrite an IMPORTED record's original source text — only a manually
      // created record's own self-generated rawContent is kept in sync with its edited fields.
      if (isManuallyCreated(editingItem)) {
        updates.rawContent = formatBibliographyRecordAsText({ title, fields, tags, category });
      }
      updateImportedContent(editingItem.id, updates);
    } else {
      const rawContent = formatBibliographyRecordAsText({ title, fields, tags, category });
      const content = createManualImportedContent({
        workspaceId: 'phd_research',
        contentType: 'bibliography',
        title,
        content: rawContent,
        metadata,
      });
      addImportedContent(content);
    }
    closeForm();
  }

  if (activeWorkspaceId !== 'phd_research') {
    return (
      <div>
        <PageHeader eyebrow="Research" title="Working Bibliography" />
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 py-20 px-6 text-center">
          <GraduationCap className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
          <h3 className="font-display font-semibold text-slate-700 dark:text-slate-200">This is the PhD Research workspace</h3>
          <p className="mt-1.5 max-w-sm text-sm text-slate-400">
            Switch to PhD Research from the workspace switcher to use the Working Bibliography. You're currently in{' '}
            {getWorkspaceMeta(activeWorkspaceId).shortLabel}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        eyebrow="Research"
        title="Working Bibliography"
        description="Catalogue sources for your research — import a structured bibliography file, or add records by hand."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" disabled={extracting} onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" /> {extracting ? 'Extracting…' : 'Import Bibliography File'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={SUPPORTED_IMPORT_EXTENSIONS.join(',') + ',.doc'}
              className="hidden"
              onChange={handleFileChange}
            />
            <Button onClick={openManualForm}>
              <Plus className="h-4 w-4" /> Add Record Manually
            </Button>
          </div>
        }
      />
      <PhdResearchTabs />

      <button
        onClick={() => setShowFormatGuide((v) => !v)}
        className="mb-5 text-xs font-medium text-brand-600 dark:text-brand-400 hover:underline"
      >
        {showFormatGuide ? 'Hide' : 'Show'} the structured import format
      </button>
      {showFormatGuide && (
        <Card className="mb-5 p-4">
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
            Upload a Markdown or plain-text file with one record per block, in this format. Separate multiple records with a line containing only{' '}
            <code className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-[11px]">---</code>. A file not written this way still imports fine —
            it's saved as a single unstructured bibliography document instead.
          </p>
          <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 font-mono">
            {BIBLIOGRAPHY_FORMAT_GUIDE}
          </pre>
        </Card>
      )}

      {importError && (
        <div className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          <p>{importError}</p>
          <button onClick={() => setImportError(null)} aria-label="Dismiss error" title="Dismiss error" className="shrink-0 text-rose-400 hover:text-rose-600 dark:hover:text-rose-200">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {structuredPreview && (
        <Card className="mb-6 p-5">
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100 mb-1">
            {structuredPreview.records.length} record{structuredPreview.records.length === 1 ? '' : 's'} detected in {structuredPreview.sourceFilename}
          </h3>
          {structuredPreview.skippedBlockCount > 0 && (
            <p className="mb-3 text-xs text-amber-600 dark:text-amber-400">
              {structuredPreview.skippedBlockCount} block{structuredPreview.skippedBlockCount === 1 ? '' : 's'} had no recognised "Title:" line and{' '}
              {structuredPreview.skippedBlockCount === 1 ? 'was' : 'were'} skipped.
            </p>
          )}
          {importDuplicates?.exactMatch && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              <Copy className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                <span className="font-medium">This exact file was already imported</span> as "{importDuplicates.exactMatch.title}". Saving will add a
                separate source — nothing is overwritten or merged automatically.
              </p>
            </div>
          )}
          {!importDuplicates?.exactMatch && importDuplicates && importDuplicates.possibleMatches.length > 0 && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
              <Copy className="h-4 w-4 shrink-0 mt-0.5 text-slate-400" />
              <p>
                <span className="font-medium">Possible duplicate</span> — same filename and size as{' '}
                {importDuplicates.possibleMatches.map((m) => `"${m.title}"`).join(', ')}. This is a filename/size match only, not confirmed.
              </p>
            </div>
          )}
          <div className="mb-4 max-h-80 space-y-2 overflow-y-auto">
            {structuredPreview.records.map((record, i) => (
              <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{record.title}</p>
                <p className="text-xs text-slate-400">
                  {[record.fields.authors?.join(', '), record.fields.year, record.fields.publicationType && BIBLIOGRAPHY_PUBLICATION_TYPE_LABELS[record.fields.publicationType]]
                    .filter(Boolean)
                    .join(' · ') || 'No author/year/type detected'}
                </p>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setStructuredPreview(null);
                setImportFileSizeBytes(null);
                setImportSourceHash(undefined);
                setImportDuplicates(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmStructured}>Confirm &amp; Save {structuredPreview.records.length} Record{structuredPreview.records.length === 1 ? '' : 's'}</Button>
          </div>
        </Card>
      )}

      {fallbackPreview && (
        <Card className="mb-6 p-5">
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100 mb-1">Review before saving</h3>
          <p className="mb-4 text-xs text-slate-400">
            No structured records were detected in this file, so it will be saved as a single unstructured bibliography document — its content is
            preserved exactly as extracted.
          </p>
          {importDuplicates?.exactMatch && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              <Copy className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                <span className="font-medium">This exact file was already imported</span> as "{importDuplicates.exactMatch.title}". Saving will add a
                separate source — nothing is overwritten or merged automatically.
              </p>
            </div>
          )}
          {!importDuplicates?.exactMatch && importDuplicates && importDuplicates.possibleMatches.length > 0 && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
              <Copy className="h-4 w-4 shrink-0 mt-0.5 text-slate-400" />
              <p>
                <span className="font-medium">Possible duplicate</span> — same filename and size as{' '}
                {importDuplicates.possibleMatches.map((m) => `"${m.title}"`).join(', ')}. This is a filename/size match only, not confirmed.
              </p>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 mb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Source file</p>
              <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{fallbackPreview.sourceFilename}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Detected format</p>
              <p className="text-sm text-slate-700 dark:text-slate-200">{IMPORT_FORMAT_LABELS[fallbackPreview.originalFormat]}</p>
            </div>
          </div>
          <div className="mb-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Title</p>
            <input
              value={fallbackTitle}
              onChange={(e) => setFallbackTitle(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>
          <div className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Extracted content preview</p>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 px-3 py-2">
              <pre className="whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-300 font-sans">{fallbackPreview.content || 'No extractable content.'}</pre>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setFallbackPreview(null);
                setFallbackTitle('');
                setImportFileSizeBytes(null);
                setImportSourceHash(undefined);
                setImportDuplicates(null);
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleConfirmFallback}>Confirm &amp; Save</Button>
          </div>
        </Card>
      )}

      {bibliographyRecords.length > 0 && (
        <Card className="mb-5 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="relative flex-1 min-w-[12rem]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search title, content or filename…"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent py-2 pl-9 pr-3 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </div>
            <select
              value={selectedAuthor}
              onChange={(e) => setSelectedAuthor(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            >
              <option value="">All authors</option>
              {availableAuthors.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            >
              <option value="">All years</option>
              {availableYears.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as BibliographyPublicationType | '')}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            >
              <option value="">All types</option>
              {availableTypes.map((t) => (
                <option key={t} value={t}>
                  {BIBLIOGRAPHY_PUBLICATION_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            >
              <option value="">All categories</option>
              {availableCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {folders.length > 0 && (
              <select
                value={selectedFolderId === undefined ? '' : (selectedFolderId ?? '__root__')}
                onChange={(e) => setSelectedFolderId(e.target.value === '' ? undefined : e.target.value === '__root__' ? null : e.target.value)}
                aria-label="Filter by folder"
                className="rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              >
                <option value="">All folders</option>
                <option value="__root__">Unfiled (Root)</option>
                {flattenFolderTree(buildFolderTree(folders, 'phd_research')).map(({ folder, depth }) => (
                  <option key={folder.id} value={folder.id}>
                    {'—'.repeat(depth)} {folder.name}
                  </option>
                ))}
              </select>
            )}
            <Button variant={pinnedOnly ? 'primary' : 'ghost'} size="sm" onClick={() => setPinnedOnly((v) => !v)} aria-pressed={pinnedOnly}>
              Pinned
            </Button>
            <Button variant={showArchived ? 'primary' : 'ghost'} size="sm" onClick={() => setShowArchived((v) => !v)} aria-pressed={showArchived}>
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
              <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400 mr-0.5" />
              {availableTags.map((tag) => {
                const active = selectedTags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTagFilter(tag)}
                    className={cx(
                      'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                      active
                        ? 'bg-brand-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
                    )}
                  >
                    <Tag className="h-3 w-3" /> {tag}
                  </button>
                );
              })}
            </div>
          )}

          <p className="mt-3 text-xs text-slate-400">
            {filteredRecords.length} of {bibliographyRecords.length} record{bibliographyRecords.length === 1 ? '' : 's'}
          </p>
        </Card>
      )}

      {selectedIds.size > 0 && (
        <BulkActionBar
          selectedCount={selectedIds.size}
          folders={folders}
          workspaceId="phd_research"
          onMoveToFolder={(folderId) => runBulk({ folderId })}
          onAddTag={(tag) => runBulk({ addTags: [tag] })}
          onRemoveTag={(tag) => runBulk({ removeTags: [tag] })}
          onPin={() => runBulk({ isPinned: true })}
          onUnpin={() => runBulk({ isPinned: false })}
          onArchive={() => runBulk({ isArchived: true })}
          onUnarchive={() => runBulk({ isArchived: false })}
          onCancel={clearSelection}
        />
      )}

      {bibliographyRecords.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookMarked className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-slate-400 text-sm">No bibliography records yet.</p>
        </div>
      ) : filteredRecords.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Search className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-slate-400 text-sm mb-4">No records match your search or filters.</p>
          <Button variant="secondary" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full min-w-[64rem] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/80">
                {['', 'Title', 'Reading Status', 'Author(s)', 'Year', 'Type', 'Journal / Book / Publisher', 'DOI / URL', 'Tags / Category', 'Notes', 'Actions'].map((h, i) => (
                  <th key={h || `col-${i}`} className="whitespace-normal break-words border-b border-slate-200 dark:border-slate-700 px-3 py-2 text-left font-semibold text-slate-700 dark:text-slate-200">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredRecords.map((record, ri) => {
                const fields = getBibliographyFields(record);
                const tags = getContentTags(record);
                const category = getContentCategory(record);
                const folderName = getContentFolderId(record) ? (folderNameById.get(getContentFolderId(record)!) ?? null) : null;
                const isPinned = record.metadata?.isPinned ?? false;
                const isArchived = record.metadata?.isArchived ?? false;
                const related = countRelatedContent(contentRelationships, record.id, 'imported_content', importedContent, notes);
                return (
                  <tr key={record.id} className={cx(ri % 2 === 1 && 'bg-slate-50/60 dark:bg-slate-800/30')}>
                    <td className="border-b border-slate-100 dark:border-slate-800 px-3 py-2 align-top">
                      <SelectionCheckbox selected={selectedIds.has(record.id)} title={record.title} onToggleSelected={() => toggleSelected(record.id)} />
                    </td>
                    <td className="border-b border-slate-100 dark:border-slate-800 px-3 py-2 align-top">
                      <p className="font-medium text-slate-800 dark:text-slate-100">{record.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <Badge tone={isManuallyCreated(record) ? 'neutral' : 'success'}>
                          {isManuallyCreated(record) ? 'Manually added' : (record.provenance.sourceFilename ?? 'Imported')}
                        </Badge>
                        {folderName && <Badge tone="neutral">{folderName}</Badge>}
                        {isArchived && <Badge tone="neutral">Archived</Badge>}
                      </div>
                      <RelatedContentSummary
                        className="mt-1"
                        segments={[
                          {
                            count: related.researchDocuments,
                            singularLabel: 'Document',
                            pluralLabel: 'Documents',
                            accessibleLabel: `View ${related.researchDocuments} research document${related.researchDocuments === 1 ? '' : 's'} linked to ${record.title}`,
                            onOpen: () => setLinkingRecord(record),
                          },
                          {
                            count: related.notes,
                            singularLabel: 'Note',
                            pluralLabel: 'Notes',
                            accessibleLabel: `View ${related.notes} note${related.notes === 1 ? '' : 's'} linked to ${record.title}`,
                            onOpen: () => setNotesLinkingRecord(record),
                          },
                        ]}
                      />
                    </td>
                    <td className="border-b border-slate-100 dark:border-slate-800 px-3 py-2 align-top">
                      <ReadingStatusPicker
                        item={record}
                        onChange={(status) => updateImportedContent(record.id, { metadata: { ...record.metadata, readingStatus: status } })}
                      />
                    </td>
                    <td className="border-b border-slate-100 dark:border-slate-800 px-3 py-2 align-top text-slate-600 dark:text-slate-300">
                      {fields.authors && fields.authors.length > 0 ? fields.authors.join(', ') : '—'}
                    </td>
                    <td className="border-b border-slate-100 dark:border-slate-800 px-3 py-2 align-top text-slate-600 dark:text-slate-300">{fields.year || '—'}</td>
                    <td className="border-b border-slate-100 dark:border-slate-800 px-3 py-2 align-top text-slate-600 dark:text-slate-300">
                      {fields.publicationType ? BIBLIOGRAPHY_PUBLICATION_TYPE_LABELS[fields.publicationType] : '—'}
                    </td>
                    <td className="border-b border-slate-100 dark:border-slate-800 px-3 py-2 align-top text-slate-600 dark:text-slate-300">{fields.containerTitle || '—'}</td>
                    <td className="border-b border-slate-100 dark:border-slate-800 px-3 py-2 align-top text-slate-600 dark:text-slate-300">
                      {fields.url ? (
                        <a href={fields.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:underline">
                          Link <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : fields.doi ? (
                        fields.doi
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="border-b border-slate-100 dark:border-slate-800 px-3 py-2 align-top">
                      <div className="flex flex-wrap gap-1">
                        {category && <Badge tone="gold">{category}</Badge>}
                        {tags.map((tag) => (
                          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            <Tag className="h-2.5 w-2.5" /> {tag}
                          </span>
                        ))}
                        {!category && tags.length === 0 && <span className="text-slate-300 dark:text-slate-600">—</span>}
                      </div>
                    </td>
                    <td className="max-w-[16rem] truncate border-b border-slate-100 dark:border-slate-800 px-3 py-2 align-top text-slate-500 dark:text-slate-400" title={fields.notes}>
                      {fields.notes || '—'}
                    </td>
                    <td className="border-b border-slate-100 dark:border-slate-800 px-3 py-2 align-top">
                      <div className="flex items-center gap-1.5">
                        <ArchiveToggle archived={isArchived} onToggle={() => bulkUpdateImportedContent([record.id], { isArchived: !isArchived })} size="sm" />
                        <PinToggle pinned={isPinned} onToggle={() => bulkUpdateImportedContent([record.id], { isPinned: !isPinned })} size="sm" />
                        <button
                          onClick={() => setLinkingRecord(record)}
                          aria-label="Linked research documents"
                          title="Linked research documents"
                          className="relative rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          {linkedDocumentCount(record.id) > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-brand-600 text-[9px] font-semibold text-white">
                              {linkedDocumentCount(record.id)}
                            </span>
                          )}
                        </button>
                        <button
                          onClick={() => setNotesLinkingRecord(record)}
                          aria-label="Linked notes"
                          title="Linked notes"
                          className="relative rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <NotebookPen className="h-3.5 w-3.5" />
                          {linkedNoteCount(record.id) > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-brand-600 text-[9px] font-semibold text-white">
                              {linkedNoteCount(record.id)}
                            </span>
                          )}
                        </button>
                        <button
                          onClick={() => setViewing(record)}
                          aria-label="View source"
                          title="View source"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => openEditForm(record)}
                          aria-label="Edit record"
                          title="Edit record"
                          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => deleteImportedContent(record.id)}
                          aria-label="Delete record"
                          title="Delete record"
                          className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {viewing && <ViewSourceModal record={viewing} onClose={() => setViewing(null)} />}
      {formOpen && (
        <BibliographyFormModal
          values={formValues}
          isEditing={!!editingItem}
          onChange={setFormValues}
          onCancel={closeForm}
          onSave={handleSaveForm}
        />
      )}
      {linkingRecord && (
        <LinkedDocumentsModal
          record={linkingRecord}
          researchDocuments={researchDocuments}
          relationships={contentRelationships}
          onLink={(targetId, type) =>
            addContentRelationship({ source: { id: linkingRecord.id, type: 'imported_content' }, target: { id: targetId, type: 'imported_content' }, type })
          }
          onUnlink={(relationshipId) => deleteContentRelationship(relationshipId)}
          onClose={() => setLinkingRecord(null)}
        />
      )}
      {notesLinkingRecord && (
        <LinkedNotesModal
          sourceId={notesLinkingRecord.id}
          sourceLabel={notesLinkingRecord.title}
          notes={notes}
          relationships={contentRelationships}
          onLink={(noteId, type) =>
            addContentRelationship({ source: { id: notesLinkingRecord.id, type: 'imported_content' }, target: { id: noteId, type: 'note' }, type })
          }
          onUnlink={(relationshipId) => deleteContentRelationship(relationshipId)}
          onClose={() => setNotesLinkingRecord(null)}
        />
      )}
    </div>
  );
}

// Phase 5O — was a plain <pre> (rawContent as literal text, so an imported .md file's own
// #/**bold**/lists/etc. showed as raw syntax instead of rendering). Now mirrors
// pages/RepositoryDetail.tsx's ContentView raw/preview toggle exactly: same markdown-to-jsx
// options (disableParsingRawHTML — untrusted imported content is never parsed as HTML), same
// Markdown/monospace class conventions. Defaults to Preview (RepositoryDetail defaults to Raw for
// its own annotation-positioning reasons, which don't apply here — there's no annotation layer on
// this modal). rawContent itself is never touched either way — this is display-only.
function ViewSourceModal({ record, onClose }: { record: ImportedContent; onClose: () => void }) {
  const [mode, setMode] = useState<'raw' | 'preview'>('preview');
  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-2xl rounded-t-2xl sm:inset-0 sm:top-16 sm:bottom-auto sm:h-fit sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100 truncate">{record.title}</h3>
            <p className="text-xs text-slate-400 truncate">
              {isManuallyCreated(record) ? 'Manually added' : (record.provenance.sourceFilename ?? 'Imported')}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-800 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setMode('preview')}
                aria-pressed={mode === 'preview'}
                className={cx(
                  'flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors',
                  mode === 'preview' ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
                )}
              >
                <Eye className="h-3.5 w-3.5" /> Preview
              </button>
              <button
                type="button"
                onClick={() => setMode('raw')}
                aria-pressed={mode === 'raw'}
                className={cx(
                  'flex items-center gap-1 rounded-md px-2.5 py-1 font-medium transition-colors',
                  mode === 'raw' ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
                )}
              >
                <Pencil className="h-3.5 w-3.5" /> Raw
              </button>
            </div>
            <button onClick={onClose} aria-label="Close" title="Close" className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          {!record.rawContent ? (
            <p className="text-sm text-slate-400">No source content.</p>
          ) : mode === 'raw' ? (
            <pre className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200 font-sans">{record.rawContent}</pre>
          ) : (
            <MarkdownPreview content={record.rawContent} />
          )}
        </div>
      </div>
    </>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">{label}</p>
      {children}
    </div>
  );
}

const fieldInputClass =
  'w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40';

function BibliographyFormModal({
  values,
  isEditing,
  onChange,
  onCancel,
  onSave,
}: {
  values: BibliographyFormValues;
  isEditing: boolean;
  onChange: (values: BibliographyFormValues) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  function set<K extends keyof BibliographyFormValues>(key: K, value: BibliographyFormValues[K]) {
    onChange({ ...values, [key]: value });
  }

  const titleValid = values.title.trim().length > 0;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-2xl rounded-t-2xl sm:inset-0 sm:top-10 sm:bottom-10 sm:h-fit sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">{isEditing ? 'Edit Bibliography Record' : 'Add Bibliography Record'}</h3>
          <button onClick={onCancel} aria-label="Close" title="Close" className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-4">
          <FormField label="Title (required)">
            <input value={values.title} onChange={(e) => set('title', e.target.value)} placeholder="Title" className={fieldInputClass} />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Authors">
              <input value={values.authors} onChange={(e) => set('authors', e.target.value)} placeholder="e.g. Jane Smith, John Doe" className={fieldInputClass} />
            </FormField>
            <FormField label="Year">
              <input value={values.year} onChange={(e) => set('year', e.target.value)} placeholder="e.g. 2020" className={fieldInputClass} />
            </FormField>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Publication type">
              <select value={values.publicationType} onChange={(e) => set('publicationType', e.target.value as BibliographyPublicationType | '')} className={fieldInputClass}>
                <option value="">Not specified</option>
                {BIBLIOGRAPHY_PUBLICATION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {BIBLIOGRAPHY_PUBLICATION_TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Journal / Book / Publisher">
              <input value={values.containerTitle} onChange={(e) => set('containerTitle', e.target.value)} className={fieldInputClass} />
            </FormField>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="Volume">
              <input value={values.volume} onChange={(e) => set('volume', e.target.value)} className={fieldInputClass} />
            </FormField>
            <FormField label="Issue">
              <input value={values.issue} onChange={(e) => set('issue', e.target.value)} className={fieldInputClass} />
            </FormField>
            <FormField label="Pages">
              <input value={values.pages} onChange={(e) => set('pages', e.target.value)} className={fieldInputClass} />
            </FormField>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="DOI">
              <input value={values.doi} onChange={(e) => set('doi', e.target.value)} className={fieldInputClass} />
            </FormField>
            <FormField label="ISBN">
              <input value={values.isbn} onChange={(e) => set('isbn', e.target.value)} className={fieldInputClass} />
            </FormField>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="URL">
              <input value={values.url} onChange={(e) => set('url', e.target.value)} className={fieldInputClass} />
            </FormField>
            <FormField label="Citation key">
              <input value={values.citationKey} onChange={(e) => set('citationKey', e.target.value)} placeholder="e.g. Smith2020" className={fieldInputClass} />
            </FormField>
          </div>
          <FormField label="Notes">
            <textarea value={values.notes} onChange={(e) => set('notes', e.target.value)} rows={3} className={cx(fieldInputClass, 'resize-none')} />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Tags">
              <input value={values.tags} onChange={(e) => set('tags', e.target.value)} placeholder="e.g. fieldwork, chapter-1" className={fieldInputClass} />
            </FormField>
            <FormField label="Category">
              <input value={values.category} onChange={(e) => set('category', e.target.value)} placeholder="e.g. Literature Review" className={fieldInputClass} />
            </FormField>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800 px-5 py-4">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={!titleValid}>
            Save Record
          </Button>
        </div>
      </div>
    </>
  );
}

// Source <-> Research Document Linking. Creation is deliberately only offered from the Working
// Bibliography side (this modal) — pages/PhdResearch.tsx's research-document cards can only
// display and unlink, never create a link, matching exactly what the task this was built for
// scoped each page to. The relationship is always created with THIS record as its source and the
// chosen research document as its target — never inferred from filenames/titles/DOI/text, only
// from an explicit pick in the select below.
//
// Phase 13 — each linked row's own "Open" arrow reuses pages/RepositoryDetail.tsx's existing
// /repository/:entityType/:id route (repositoryDetailPathFor), so seeing a cited research document
// also lets you actually go read it, not just unlink it.
function LinkedDocumentsModal({
  record,
  researchDocuments,
  relationships,
  onLink,
  onUnlink,
  onClose,
}: {
  record: ImportedContent;
  researchDocuments: ImportedContent[];
  relationships: ContentRelationship[];
  onLink: (targetId: string, type: RelationshipType) => { status: 'ok' } | { status: 'error'; message: string };
  onUnlink: (relationshipId: string) => void;
  onClose: () => void;
}) {
  const [selectedDocId, setSelectedDocId] = useState('');
  const [selectedType, setSelectedType] = useState<RelationshipType>('cites');
  const [linkError, setLinkError] = useState<string | null>(null);

  const linked = getOutgoingRelationships(relationships, record.id, 'imported_content')
    .filter((r) => r.targetType === 'imported_content')
    .map((relationship) => ({ relationship, document: getImportedContentById(researchDocuments, relationship.targetId) }))
    .filter((entry): entry is { relationship: (typeof relationships)[number]; document: ImportedContent } => !!entry.document);

  const linkedDocIds = new Set(linked.map((entry) => entry.document.id));
  const availableDocuments = researchDocuments.filter((doc) => !linkedDocIds.has(doc.id));

  function handleLink() {
    if (!selectedDocId) return;
    const result = onLink(selectedDocId, selectedType);
    if (result.status === 'error') {
      setLinkError(result.message);
      return;
    }
    setLinkError(null);
    setSelectedDocId('');
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-lg rounded-t-2xl sm:inset-0 sm:top-16 sm:bottom-auto sm:h-fit sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100 truncate">Linked Research Documents — {record.title}</h3>
          <button onClick={onClose} aria-label="Close" title="Close" className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4 space-y-4">
          {linked.length === 0 ? (
            <p className="text-sm text-slate-400">No research documents linked yet.</p>
          ) : (
            <div className="space-y-2">
              {linked.map(({ relationship, document }) => (
                <div key={relationship.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{document.title}</p>
                    <Badge tone="brand" className="mt-1">
                      {RELATIONSHIP_TYPE_LABELS[relationship.type]}
                    </Badge>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <RouterLink
                      to={repositoryDetailPathFor('imported_content', document.id)}
                      aria-label={`Open ${document.title}`}
                      title="Open"
                      className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                    </RouterLink>
                    <button
                      onClick={() => onUnlink(relationship.id)}
                      aria-label="Unlink"
                      title="Unlink"
                      className="rounded-lg p-1.5 text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10"
                    >
                      <Unlink className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {availableDocuments.length === 0 ? (
            <p className="text-xs text-slate-400">
              {researchDocuments.length === 0 ? 'No research documents imported yet.' : 'Every research document is already linked.'}
            </p>
          ) : (
            <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 p-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Link a research document</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  value={selectedDocId}
                  onChange={(e) => setSelectedDocId(e.target.value)}
                  className="flex-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                >
                  <option value="">Select a research document…</option>
                  {availableDocuments.map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.title}
                    </option>
                  ))}
                </select>
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value as RelationshipType)}
                  className="rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                >
                  {MANUALLY_ASSIGNABLE_RELATIONSHIP_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {RELATIONSHIP_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
                <Button onClick={handleLink} disabled={!selectedDocId}>
                  <Link2 className="h-3.5 w-3.5" /> Link
                </Button>
              </div>
              {linkError && <p className="text-xs text-rose-500">{linkError}</p>}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end border-t border-slate-100 dark:border-slate-800 px-5 py-4">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </>
  );
}
