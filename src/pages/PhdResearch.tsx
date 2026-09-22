import { useMemo, useRef, useState } from 'react';
import { GraduationCap, Upload, X, FileText, Trash2, Eye, Search, Tag, Pencil, SlidersHorizontal, Link2, Unlink, NotebookPen } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { getWorkspaceMeta } from '../lib/workspace';
import { Card, Badge, Button, PageHeader } from '../components/ui/Primitives';
import { cx } from '../lib/utils';
import {
  extractContentFromFile,
  buildImportPreview,
  confirmImportedContent,
  selectImportedContentByType,
  getImportedContentById,
  SUPPORTED_IMPORT_EXTENSIONS,
  IMPORT_FORMAT_LABELS,
  type ImportPreview,
  type ImportedContent,
  type ImportedContentMetadata,
} from '../lib/contentImport';
import { PhdResearchTabs } from '../components/phdResearch/PhdResearchTabs';
import { LinkedNotesModal } from '../components/phdResearch/LinkedNotesModal';
import { RelatedContentSummary } from '../components/phdResearch/RelatedContentSummary';
import {
  queryImportedContent,
  collectImportedContentTags,
  collectImportedContentCategories,
  getContentTags,
  getContentCategory,
  parseTagsInput,
} from '../lib/importedContentRepository';
import { RELATIONSHIP_TYPE_LABELS, getIncomingRelationships, getOutgoingRelationships, type ContentRelationship } from '../lib/contentRelationships';
import { countRelatedContent } from '../lib/relatedContentSummary';

// PhD Research workspace repository — the import-first FILE -> EXTRACT -> PREVIEW -> CONFIRM ->
// SAVE -> DISPLAY pipeline (lib/contentImport.ts), plus repository organisation (search, tags,
// category — lib/importedContentRepository.ts) so imported documents stay findable as the
// collection grows. Content type is still hardcoded to 'research_document' (no picker), and raw
// imported content is still not editable — only organisation metadata (tags/category) is. No AI
// features. A separate, structured Working Bibliography repository (source records with
// author/year/DOI/etc.) lives at pages/WorkingBibliography.tsx — see the tab switcher below.
function buildMetadata(tagsInput: string, categoryInput: string): ImportedContentMetadata | undefined {
  const tags = parseTagsInput(tagsInput);
  const category = categoryInput.trim();
  if (tags.length === 0 && !category) return undefined;
  const metadata: ImportedContentMetadata = {};
  if (tags.length > 0) metadata.tags = tags;
  if (category) metadata.category = category;
  return metadata;
}

export default function PhdResearch() {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const importedContent = useAppStore((s) => s.importedContent);
  const addImportedContent = useAppStore((s) => s.addImportedContent);
  const updateImportedContent = useAppStore((s) => s.updateImportedContent);
  const deleteImportedContent = useAppStore((s) => s.deleteImportedContent);
  const notes = useAppStore((s) => s.notes);
  const contentRelationships = useAppStore((s) => s.contentRelationships);
  const addContentRelationship = useAppStore((s) => s.addContentRelationship);
  const deleteContentRelationship = useAppStore((s) => s.deleteContentRelationship);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');
  const [previewTags, setPreviewTags] = useState('');
  const [previewCategory, setPreviewCategory] = useState('');
  const [viewing, setViewing] = useState<ImportedContent | null>(null);
  const [editing, setEditing] = useState<ImportedContent | null>(null);
  const [linksDoc, setLinksDoc] = useState<ImportedContent | null>(null);
  const [notesLinkingDoc, setNotesLinkingDoc] = useState<ImportedContent | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('');

  const researchDocuments = useMemo(() => selectImportedContentByType(importedContent, 'research_document'), [importedContent]);
  const bibliographyRecords = useMemo(() => selectImportedContentByType(importedContent, 'bibliography'), [importedContent]);
  const availableTags = useMemo(() => collectImportedContentTags(researchDocuments), [researchDocuments]);
  const availableCategories = useMemo(() => collectImportedContentCategories(researchDocuments), [researchDocuments]);
  const filteredDocuments = useMemo(
    () => queryImportedContent(researchDocuments, { search: searchQuery, tags: selectedTags, category: selectedCategory || undefined }),
    [researchDocuments, searchQuery, selectedTags, selectedCategory],
  );
  const hasActiveFilters = searchQuery.trim() !== '' || selectedTags.length > 0 || selectedCategory !== '';

  function clearFilters() {
    setSearchQuery('');
    setSelectedTags([]);
    setSelectedCategory('');
  }

  function toggleTagFilter(tag: string) {
    setSelectedTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  // A bibliography record links TO a document (source = bibliography, target = document — see
  // WorkingBibliography.tsx's LinkedDocumentsModal), so a document's own linked sources are its
  // INCOMING relationships from other imported_content items.
  function linkedSourceCount(docId: string) {
    return getIncomingRelationships(contentRelationships, docId, 'imported_content').filter((r) => r.sourceType === 'imported_content').length;
  }

  // A document links TO a note (source = document, target = note — see LinkedNotesModal), so a
  // document's own linked notes are its OUTGOING relationships whose target is a note.
  function linkedNoteCount(docId: string) {
    return getOutgoingRelationships(contentRelationships, docId, 'imported_content').filter((r) => r.targetType === 'note').length;
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file after an error
    if (!file) return;
    setImportError(null);
    setExtracting(true);
    try {
      const result = await extractContentFromFile(file);
      if (result.status === 'error') {
        setImportError(result.message);
        return;
      }
      const nextPreview = buildImportPreview(file, result.content);
      setPreview(nextPreview);
      setPreviewTitle(nextPreview.title);
      setPreviewTags('');
      setPreviewCategory('');
    } finally {
      setExtracting(false);
    }
  }

  function handleConfirm() {
    if (!preview) return;
    const content = confirmImportedContent(preview, {
      workspaceId: 'phd_research',
      contentType: 'research_document',
      title: previewTitle.trim() || preview.title,
      metadata: buildMetadata(previewTags, previewCategory),
    });
    addImportedContent(content);
    setPreview(null);
    setPreviewTitle('');
    setPreviewTags('');
    setPreviewCategory('');
  }

  function handleCancel() {
    setPreview(null);
    setPreviewTitle('');
    setPreviewTags('');
    setPreviewCategory('');
  }

  function handleSaveMetadata(tagsInput: string, categoryInput: string) {
    if (!editing) return;
    updateImportedContent(editing.id, { metadata: buildMetadata(tagsInput, categoryInput) });
    setEditing(null);
  }

  if (activeWorkspaceId !== 'phd_research') {
    return (
      <div>
        <PageHeader eyebrow="Research" title="PhD Research" />
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 py-20 px-6 text-center">
          <GraduationCap className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
          <h3 className="font-display font-semibold text-slate-700 dark:text-slate-200">This is the PhD Research workspace</h3>
          <p className="mt-1.5 max-w-sm text-sm text-slate-400">
            Switch to PhD Research from the workspace switcher to import and view research documents. You're currently in{' '}
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
        title="PhD Research"
        description="Import your own research documents (Markdown, DOCX, PDF, TXT) into your PhD Research repository."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" disabled={extracting} onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4" /> {extracting ? 'Extracting…' : 'Import Research Document'}
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept={SUPPORTED_IMPORT_EXTENSIONS.join(',') + ',.doc'}
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        }
      />
      <PhdResearchTabs />

      {importError && (
        <div className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
          <p>{importError}</p>
          <button onClick={() => setImportError(null)} className="shrink-0 text-rose-400 hover:text-rose-600 dark:hover:text-rose-200">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {preview && (
        <ImportPreviewPanel
          preview={preview}
          title={previewTitle}
          tagsInput={previewTags}
          categoryInput={previewCategory}
          existingCategories={availableCategories}
          onTitleChange={setPreviewTitle}
          onTagsInputChange={setPreviewTags}
          onCategoryInputChange={setPreviewCategory}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}

      {researchDocuments.length > 0 && (
        <Card className="mb-5 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search title, content or filename…"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent py-2 pl-9 pr-3 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
              />
            </div>
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
            {filteredDocuments.length} of {researchDocuments.length} document{researchDocuments.length === 1 ? '' : 's'}
          </p>
        </Card>
      )}

      {researchDocuments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-slate-400 text-sm">No research documents imported yet.</p>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Search className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-slate-400 text-sm mb-4">No documents match your search or filters.</p>
          <Button variant="secondary" onClick={clearFilters}>
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDocuments.map((doc) => {
            const tags = getContentTags(doc);
            const category = getContentCategory(doc);
            const related = countRelatedContent(contentRelationships, doc.id, 'imported_content', importedContent, notes);
            return (
              <Card key={doc.id} className="flex h-full flex-col p-4">
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <Badge tone="brand">Research Document</Badge>
                  {category && <Badge tone="gold">{category}</Badge>}
                </div>
                <h4 className="font-display font-semibold text-slate-800 dark:text-slate-100 truncate">{doc.title}</h4>
                <p className="mt-1 text-xs text-slate-400 truncate">{doc.provenance.sourceFilename ?? 'Manually added'}</p>
                <p className="mt-1 text-[11px] text-slate-300 dark:text-slate-600">
                  Imported {new Date(doc.provenance.importedAt).toLocaleDateString('en-IN')}
                </p>
                {tags.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[11px] text-slate-500 dark:text-slate-400"
                      >
                        <Tag className="h-2.5 w-2.5" /> {tag}
                      </span>
                    ))}
                  </div>
                )}
                <RelatedContentSummary
                  className="mt-2"
                  segments={[
                    {
                      count: related.notes,
                      singularLabel: 'Note',
                      pluralLabel: 'Notes',
                      accessibleLabel: `View ${related.notes} note${related.notes === 1 ? '' : 's'} linked to ${doc.title}`,
                      onOpen: () => setNotesLinkingDoc(doc),
                    },
                    {
                      count: related.bibliographyRecords,
                      singularLabel: 'Source',
                      pluralLabel: 'Sources',
                      accessibleLabel: `View ${related.bibliographyRecords} bibliography source${related.bibliographyRecords === 1 ? '' : 's'} linked to ${doc.title}`,
                      onOpen: () => setLinksDoc(doc),
                    },
                  ]}
                />
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setViewing(doc)}>
                    <Eye className="h-3.5 w-3.5" /> View
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setEditing(doc)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit tags
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setLinksDoc(doc)}>
                    <Link2 className="h-3.5 w-3.5" /> Sources
                    {linkedSourceCount(doc.id) > 0 && (
                      <span className="ml-0.5 rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold text-white">{linkedSourceCount(doc.id)}</span>
                    )}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setNotesLinkingDoc(doc)}>
                    <NotebookPen className="h-3.5 w-3.5" /> Notes
                    {linkedNoteCount(doc.id) > 0 && (
                      <span className="ml-0.5 rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold text-white">{linkedNoteCount(doc.id)}</span>
                    )}
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => deleteImportedContent(doc.id)}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {viewing && <ViewDocumentModal document={viewing} onClose={() => setViewing(null)} />}
      {editing && (
        <EditMetadataModal
          document={editing}
          existingCategories={availableCategories}
          onCancel={() => setEditing(null)}
          onSave={handleSaveMetadata}
        />
      )}
      {linksDoc && (
        <LinkedSourcesModal
          document={linksDoc}
          bibliographyRecords={bibliographyRecords}
          relationships={contentRelationships}
          onUnlink={(relationshipId) => deleteContentRelationship(relationshipId)}
          onClose={() => setLinksDoc(null)}
        />
      )}
      {notesLinkingDoc && (
        <LinkedNotesModal
          sourceId={notesLinkingDoc.id}
          sourceLabel={notesLinkingDoc.title}
          notes={notes}
          relationships={contentRelationships}
          onLink={(noteId, type) =>
            addContentRelationship({ source: { id: notesLinkingDoc.id, type: 'imported_content' }, target: { id: noteId, type: 'note' }, type })
          }
          onUnlink={(relationshipId) => deleteContentRelationship(relationshipId)}
          onClose={() => setNotesLinkingDoc(null)}
        />
      )}
    </div>
  );
}

function ImportPreviewPanel({
  preview,
  title,
  tagsInput,
  categoryInput,
  existingCategories,
  onTitleChange,
  onTagsInputChange,
  onCategoryInputChange,
  onConfirm,
  onCancel,
}: {
  preview: ImportPreview;
  title: string;
  tagsInput: string;
  categoryInput: string;
  existingCategories: string[];
  onTitleChange: (title: string) => void;
  onTagsInputChange: (tags: string) => void;
  onCategoryInputChange: (category: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const parsedTags = useMemo(() => parseTagsInput(tagsInput), [tagsInput]);

  return (
    <Card className="mb-6 p-5">
      <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100 mb-4">Review before saving</h3>

      <div className="grid gap-3 sm:grid-cols-2 mb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Source file</p>
          <p className="text-sm text-slate-700 dark:text-slate-200 truncate">{preview.sourceFilename}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Detected format</p>
          <p className="text-sm text-slate-700 dark:text-slate-200">{IMPORT_FORMAT_LABELS[preview.originalFormat]}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Content type</p>
          <Badge tone="brand">Research Document</Badge>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Imported into</p>
          <p className="text-sm text-slate-700 dark:text-slate-200">{getWorkspaceMeta('phd_research').label}</p>
        </div>
      </div>

      <div className="mb-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Title</p>
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Document title"
          className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 mb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Tags (optional)</p>
          <input
            value={tagsInput}
            onChange={(e) => onTagsInputChange(e.target.value)}
            placeholder="e.g. fieldwork, chapter-1"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
          {parsedTags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {parsedTags.map((tag) => (
                <Badge key={tag} tone="neutral">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Category (optional)</p>
          <input
            list="phd-category-suggestions"
            value={categoryInput}
            onChange={(e) => onCategoryInputChange(e.target.value)}
            placeholder="e.g. Literature Review"
            className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
          />
          <datalist id="phd-category-suggestions">
            {existingCategories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Extracted content preview</p>
        <div className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 px-3 py-2">
          <pre className="whitespace-pre-wrap text-xs text-slate-600 dark:text-slate-300 font-sans">{preview.content || 'No extractable content.'}</pre>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={onConfirm}>Confirm &amp; Save</Button>
      </div>
    </Card>
  );
}

function ViewDocumentModal({ document, onClose }: { document: ImportedContent; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-2xl rounded-t-2xl sm:inset-0 sm:top-16 sm:bottom-auto sm:h-fit sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100 truncate">{document.title}</h3>
            <p className="text-xs text-slate-400 truncate">{document.provenance.sourceFilename ?? 'Manually added'}</p>
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          <pre className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200 font-sans">{document.rawContent}</pre>
        </div>
      </div>
    </>
  );
}

function EditMetadataModal({
  document,
  existingCategories,
  onCancel,
  onSave,
}: {
  document: ImportedContent;
  existingCategories: string[];
  onCancel: () => void;
  onSave: (tagsInput: string, categoryInput: string) => void;
}) {
  const [tagsInput, setTagsInput] = useState(() => getContentTags(document).join(', '));
  const [categoryInput, setCategoryInput] = useState(() => getContentCategory(document) ?? '');
  const parsedTags = useMemo(() => parseTagsInput(tagsInput), [tagsInput]);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm" onClick={onCancel} />
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-2xl sm:inset-0 sm:top-24 sm:bottom-auto sm:h-fit sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100 truncate">Edit organisation — {document.title}</h3>
          <button onClick={onCancel} className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Tags</p>
            <input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="e.g. fieldwork, chapter-1"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
            {parsedTags.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {parsedTags.map((tag) => (
                  <Badge key={tag} tone="neutral">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-1">Category</p>
            <input
              list="phd-edit-category-suggestions"
              value={categoryInput}
              onChange={(e) => setCategoryInput(e.target.value)}
              placeholder="e.g. Literature Review"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
            <datalist id="phd-edit-category-suggestions">
              {existingCategories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800 px-5 py-4">
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={() => onSave(tagsInput, categoryInput)}>Save</Button>
        </div>
      </div>
    </>
  );
}

// Source <-> Research Document Linking, display side. Read-only + unlink only — creating a link
// happens exclusively from the Working Bibliography record's own "Linked Research Documents"
// modal (pages/WorkingBibliography.tsx), matching exactly what this stage scoped each page to.
function LinkedSourcesModal({
  document,
  bibliographyRecords,
  relationships,
  onUnlink,
  onClose,
}: {
  document: ImportedContent;
  bibliographyRecords: ImportedContent[];
  relationships: ContentRelationship[];
  onUnlink: (relationshipId: string) => void;
  onClose: () => void;
}) {
  const linked = getIncomingRelationships(relationships, document.id, 'imported_content')
    .filter((r) => r.sourceType === 'imported_content')
    .map((relationship) => ({ relationship, source: getImportedContentById(bibliographyRecords, relationship.sourceId) }))
    .filter((entry): entry is { relationship: (typeof relationships)[number]; source: ImportedContent } => !!entry.source);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-lg rounded-t-2xl sm:inset-0 sm:top-16 sm:bottom-auto sm:h-fit sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100 truncate">Linked Sources / Bibliography — {document.title}</h3>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {linked.length === 0 ? (
            <p className="text-sm text-slate-400">
              No bibliography records linked yet. Open a record in Working Bibliography and use "Linked Research Documents" to link it here.
            </p>
          ) : (
            <div className="space-y-2">
              {linked.map(({ relationship, source }) => (
                <div key={relationship.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{source.title}</p>
                    <Badge tone="brand" className="mt-1">
                      {RELATIONSHIP_TYPE_LABELS[relationship.type]}
                    </Badge>
                  </div>
                  <button
                    onClick={() => onUnlink(relationship.id)}
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
        <div className="flex items-center justify-end border-t border-slate-100 dark:border-slate-800 px-5 py-4">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </>
  );
}
