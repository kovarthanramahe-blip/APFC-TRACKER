import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, X, AlertTriangle, CheckCircle2, ArrowRight, ShieldAlert, Copy } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { getWorkspaceMeta } from '../../lib/workspace';
import { Badge, Button } from '../ui/Primitives';
import { uuid } from '../../lib/utils';
import type { Note } from '../../lib/types';
import {
  isNearEmptyContent,
  formatFileSizeBytes,
  truncateForPreview,
  SUPPORTED_IMPORT_EXTENSIONS,
  IMPORT_FORMAT_LABELS,
  confirmImportedContent,
  type ImportPreview,
  type ImportedContentMetadata,
} from '../../lib/contentImport';
import { runFileImport } from '../../lib/importPipeline';
import type { DuplicateMatchResult } from '../../lib/importDuplicates';
import {
  REPOSITORY_CONTENT_TYPE_REGISTRY,
  getRepositoryContentTypeMeta,
  repositoryContentTypeSupports,
  repositoryEntryFromImportedContent,
  repositoryEntryFromNote,
  type RepositoryContentType,
  type RepositoryEntry,
} from '../../lib/repository';
import { parseTagsInput } from '../../lib/importedContentRepository';
import { navigationTargetFor } from '../../lib/repositoryNavigation';
import { FolderPicker } from '../organisation/FolderPicker';

// Global Repository Import — one reusable modal, wired only into pages/Repository.tsx's own
// "Import to Repository" action. It follows the exact pipeline lib/contentImport.ts already
// defines (FILE -> EXTRACT -> SELECT CONTENT TYPE -> PREVIEW -> USER CONFIRMS -> SAVE), now run
// through lib/importPipeline.ts's runFileImport — a thin composition of the SAME, unchanged
// extractContentFromFile/buildImportPreview this modal always called, plus the Knowledge Workspace
// foundation's file hashing (lib/fileHash.ts) and duplicate detection (lib/importDuplicates.ts).
// pages/PhdResearch.tsx and pages/WorkingBibliography.tsx still call extractContentFromFile/
// buildImportPreview directly for their own hardcoded content types and are UNCHANGED by this
// stage. The one thing genuinely new here is an EXPLICIT, user-facing content-type selector — those
// two existing pages hardcode their type (research_document / bibliography); this modal is the
// first place a user picks the type themselves.
//
// Content-type selection is never silent: buildImportPreview's suggestedContentType (a filename
// keyword guess — see contentImport.ts's suggestContentType) only pre-fills the dropdown's initial
// value. The save call always uses whatever the dropdown currently holds at the moment Confirm is
// clicked, never the suggestion directly.
//
// SAVE destination depends on the selected type: 'note' goes through the existing Notes
// persistence path (upsertNote — the same store action pages/Notes.tsx's own editor calls), never
// a second Note storage mechanism. Every other type goes through confirmImportedContent + the
// store's addImportedContent, exactly like PhdResearch.tsx/WorkingBibliography.tsx already do — now
// also passing the file's sourceHash/sourceFileSize through to confirmImportedContent (Phase 1's
// additive provenance fields), so a LATER import of the same file can be hash-matched against this
// one. A 'note' save never carries this — Note has no provenance/sourceHash field, matching its
// existing, separate persistence model.
//
// Duplicate detection is advisory only, never blocking: findDuplicates runs against the active
// workspace's own existing importedContent as soon as a file is picked, and any match (exact or
// possible) is shown as a dismissable-in-spirit informational banner in the preview stage — Confirm
// stays enabled either way, and nothing is ever auto-merged, overwritten, or silently skipped (see
// lib/importDuplicates.ts's own header for the exact/possible distinction).
//
// Question safety: question_bank / descriptive_questions / pyq are never parsed into structured
// questions here (or anywhere in this codebase yet — see contentImport.ts's own header). The
// extracted text is saved verbatim as ImportedContent.rawContent under the user's explicitly
// chosen contentType, identically to every other non-note type — there is no special-case
// "extraction" branch for these three because confirmImportedContent already never interprets
// rawContent, for any type. The banner shown for these three types exists purely to make that
// guarantee visible to the user, not to change what actually happens on save.

type Stage = 'pick' | 'extracting' | 'error' | 'preview' | 'success';

function buildMetadata(
  tagsInput: string,
  categoryInput: string,
  descriptionInput: string,
  folderId: string | null,
  isPinned: boolean,
  isArchived: boolean,
): ImportedContentMetadata | undefined {
  const tags = parseTagsInput(tagsInput);
  const category = categoryInput.trim();
  const description = descriptionInput.trim();
  if (tags.length === 0 && !category && !description && folderId === null && !isPinned && !isArchived) return undefined;
  const metadata: ImportedContentMetadata = {};
  if (tags.length > 0) metadata.tags = tags;
  if (category) metadata.category = category;
  if (description) metadata.description = description;
  if (folderId !== null) metadata.folderId = folderId;
  if (isPinned) metadata.isPinned = true;
  if (isArchived) metadata.isArchived = true;
  return metadata;
}

const QUESTION_LIKE_TYPES: ReadonlySet<RepositoryContentType> = new Set(['question_bank', 'descriptive_questions', 'pyq']);

export function ImportToRepositoryModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const addImportedContent = useAppStore((s) => s.addImportedContent);
  const upsertNote = useAppStore((s) => s.upsertNote);
  const importedContent = useAppStore((s) => s.importedContent);
  const folders = useAppStore((s) => s.folders);
  const workspaceLabel = getWorkspaceMeta(activeWorkspaceId).label;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('pick');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Captured immediately on file selection, before extraction even starts — so a file that fails
  // to parse can still show its own real name/size/type in the error stage (requirement: never
  // just a bare error, always the file's own metadata alongside a clear "preview unavailable"
  // state — see the error-stage JSX below).
  const [pendingFile, setPendingFile] = useState<{ name: string; sizeBytes: number } | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileSizeBytes, setFileSizeBytes] = useState<number | null>(null);
  // Both come from runFileImport alongside the preview — sourceHash is undefined only if hashing
  // itself failed (never fabricated); duplicates is always computed, even when both fields inside
  // it are empty (see lib/importDuplicates.ts).
  const [sourceHash, setSourceHash] = useState<string | undefined>(undefined);
  const [duplicates, setDuplicates] = useState<DuplicateMatchResult | null>(null);
  const [selectedType, setSelectedType] = useState<RepositoryContentType>('note');
  const [titleInput, setTitleInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [categoryInput, setCategoryInput] = useState('');
  // Premium Note Organisation (Phase 4B) — optional destination folder/pin/archive, assignable at
  // import time so a newly imported item can land already-organised. Default behaviour (nothing
  // touched here) is unchanged: folderId stays root/null, isPinned/isArchived stay false, exactly
  // matching every import before this stage.
  const [folderId, setFolderId] = useState<string | null>(null);
  const [isPinned, setIsPinned] = useState(false);
  const [isArchived, setIsArchived] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedEntry, setSavedEntry] = useState<RepositoryEntry | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file after an error
    if (!file) return;
    setStage('extracting');
    setErrorMessage(null);
    setPendingFile({ name: file.name, sizeBytes: file.size });
    // Same extraction as before (extractContentFromFile/buildImportPreview, unchanged) plus the
    // Knowledge Workspace foundation's hash + duplicate check, in one composed call.
    const outcome = await runFileImport(file, importedContent, activeWorkspaceId);
    if (outcome.status === 'error') {
      setErrorMessage(outcome.error ?? 'This file could not be imported.');
      setStage('error');
      return;
    }
    const nextPreview = outcome.preview!;
    if (isNearEmptyContent(nextPreview.content)) {
      setErrorMessage('This file appears to be empty or contains no extractable text — please choose a different file.');
      setStage('error');
      return;
    }
    setPreview(nextPreview);
    setFileSizeBytes(file.size);
    setSourceHash(outcome.sourceHash);
    setDuplicates(outcome.duplicates ?? null);
    setSelectedType(nextPreview.suggestedContentType);
    setTitleInput(nextPreview.title);
    setDescriptionInput('');
    setTagsInput('');
    setCategoryInput('');
    setFolderId(null);
    setIsPinned(false);
    setIsArchived(false);
    setSaveError(null);
    setStage('preview');
  }

  function handleConfirm() {
    if (!preview) return;
    setSaveError(null);
    try {
      if (selectedType === 'note') {
        const newNote: Note = {
          id: uuid(),
          subject: 'general',
          title: titleInput.trim() || preview.title,
          content: preview.content,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          pinned: isPinned,
          workspaceId: activeWorkspaceId,
          folderId,
          isArchived,
        };
        upsertNote(newNote);
        setSavedEntry(repositoryEntryFromNote(newNote));
      } else {
        const metadata = buildMetadata(tagsInput, categoryInput, descriptionInput, folderId, isPinned, isArchived);
        const savedItem = confirmImportedContent(preview, {
          workspaceId: activeWorkspaceId,
          contentType: selectedType,
          title: titleInput.trim() || preview.title,
          metadata,
          sourceHash,
          sourceFileSize: fileSizeBytes ?? undefined,
        });
        addImportedContent(savedItem);
        setSavedEntry(repositoryEntryFromImportedContent(savedItem));
      }
      setStage('success');
    } catch {
      // Never silently discard the file — the preview stays exactly as it was so the user can
      // retry Confirm without re-uploading or re-entering anything.
      setSaveError('Could not save this item — please try again.');
    }
  }

  function resetToPick() {
    setStage('pick');
    setErrorMessage(null);
    setPendingFile(null);
    setPreview(null);
    setFileSizeBytes(null);
    setSourceHash(undefined);
    setDuplicates(null);
    setFolderId(null);
    setIsPinned(false);
    setIsArchived(false);
    setSaveError(null);
    setSavedEntry(null);
  }

  const typeMeta = getRepositoryContentTypeMeta(selectedType);
  const target = savedEntry ? navigationTargetFor(savedEntry) : undefined;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-xl rounded-t-2xl sm:inset-0 sm:top-16 sm:bottom-auto sm:h-fit sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Import Centre</h3>
          <button onClick={onClose} aria-label="Close" className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-4">
          <p className="text-xs text-slate-400">
            Importing into <span className="font-medium text-slate-600 dark:text-slate-300">{workspaceLabel}</span> — the currently active workspace.
          </p>

          {stage === 'pick' && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 py-12 px-6 text-center">
              <Upload className="h-8 w-8 text-slate-300 dark:text-slate-700" />
              <p className="text-sm text-slate-500 dark:text-slate-400">Choose a file to import — Markdown, DOCX, PDF, plain text, CSV, or JSON.</p>
              <Button onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4" /> Choose File
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept={SUPPORTED_IMPORT_EXTENSIONS.join(',') + ',.doc'}
                className="hidden"
                onChange={handleFileChange}
                aria-label="Choose a file to import"
              />
            </div>
          )}

          {stage === 'extracting' && (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <p className="text-sm text-slate-400">Extracting file contents…</p>
            </div>
          )}

          {stage === 'error' && (
            <div className="space-y-3">
              {pendingFile && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 text-xs text-slate-500 dark:text-slate-400 space-y-1">
                  <p>
                    <span className="font-medium text-slate-600 dark:text-slate-300">File:</span> {pendingFile.name}
                  </p>
                  <p>
                    <span className="font-medium text-slate-600 dark:text-slate-300">File size:</span> {formatFileSizeBytes(pendingFile.sizeBytes)}
                  </p>
                  <p className="text-slate-400">Preview unavailable — this file could not be parsed.</p>
                </div>
              )}
              <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>{errorMessage}</p>
              </div>
              <Button variant="secondary" onClick={resetToPick}>
                Choose a different file
              </Button>
            </div>
          )}

          {stage === 'preview' && preview && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 text-xs text-slate-500 dark:text-slate-400 space-y-1">
                <p>
                  <span className="font-medium text-slate-600 dark:text-slate-300">File:</span> {preview.sourceFilename}
                </p>
                <p>
                  <span className="font-medium text-slate-600 dark:text-slate-300">Detected format:</span> {IMPORT_FORMAT_LABELS[preview.originalFormat]}
                </p>
                {fileSizeBytes !== null && (
                  <p>
                    <span className="font-medium text-slate-600 dark:text-slate-300">File size:</span> {formatFileSizeBytes(fileSizeBytes)}
                  </p>
                )}
                <p>
                  <span className="font-medium text-slate-600 dark:text-slate-300">Workspace:</span> {workspaceLabel}
                </p>
                <p>
                  <span className="font-medium text-slate-600 dark:text-slate-300">Provenance:</span> Imported file, not yet saved
                </p>
              </div>

              {duplicates?.exactMatch && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                  <Copy className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>
                    <span className="font-medium">This exact file was already imported</span> as "{duplicates.exactMatch.title}". Saving will add a separate
                    copy — nothing is overwritten or merged automatically.
                  </p>
                </div>
              )}
              {!duplicates?.exactMatch && duplicates && duplicates.possibleMatches.length > 0 && (
                <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-300">
                  <Copy className="h-4 w-4 shrink-0 mt-0.5 text-slate-400" />
                  <p>
                    <span className="font-medium">Possible duplicate</span> — same filename and size as{' '}
                    {duplicates.possibleMatches.map((m) => `"${m.title}"`).join(', ')}. This is a filename/size match only, not confirmed — saving is still
                    fine if this is genuinely a different file.
                  </p>
                </div>
              )}

              <div>
                <label htmlFor="import-content-type" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Content type
                </label>
                <select
                  id="import-content-type"
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value as RepositoryContentType)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                >
                  {REPOSITORY_CONTENT_TYPE_REGISTRY.map((meta) => (
                    <option key={meta.type} value={meta.type}>
                      {meta.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-slate-400">
                  Suggested from the filename: {getRepositoryContentTypeMeta(preview.suggestedContentType).label}. Change it above if it's not right — nothing is
                  saved until you confirm.
                </p>
              </div>

              {QUESTION_LIKE_TYPES.has(selectedType) && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                  <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>This file will be saved exactly as extracted, as raw {typeMeta.label.toLowerCase()} content. No questions are automatically detected, generated, or extracted.</p>
                </div>
              )}

              <div>
                <label htmlFor="import-title" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Title
                </label>
                <input
                  id="import-title"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  placeholder="Title"
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                />
              </div>

              {repositoryContentTypeSupports(selectedType, 'taggable') && (
                <div>
                  <label htmlFor="import-description" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Description (optional)
                  </label>
                  <textarea
                    id="import-description"
                    value={descriptionInput}
                    onChange={(e) => setDescriptionInput(e.target.value)}
                    placeholder="A short summary shown on the repository card…"
                    rows={2}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  />
                </div>
              )}

              {repositoryContentTypeSupports(selectedType, 'taggable') && (
                <div>
                  <label htmlFor="import-tags" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Tags (comma-separated)
                  </label>
                  <input
                    id="import-tags"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="e.g. fieldwork, chapter-1"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  />
                </div>
              )}

              {repositoryContentTypeSupports(selectedType, 'categorisable') && (
                <div>
                  <label htmlFor="import-category" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Category
                  </label>
                  <input
                    id="import-category"
                    value={categoryInput}
                    onChange={(e) => setCategoryInput(e.target.value)}
                    placeholder="e.g. Literature Review"
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                  />
                </div>
              )}

              {folders.length > 0 && (
                <FolderPicker id="import-folder" label="Folder (optional)" folders={folders} workspaceId={activeWorkspaceId} value={folderId} onChange={setFolderId} />
              )}
              <div className="flex items-center gap-4 text-xs font-medium text-slate-500 dark:text-slate-400">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} className="rounded border-slate-300 dark:border-slate-700" />
                  Pin
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={isArchived} onChange={(e) => setIsArchived(e.target.checked)} className="rounded border-slate-300 dark:border-slate-700" />
                  Archive immediately
                </label>
              </div>

              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Content preview</p>
                {(() => {
                  const truncated = truncateForPreview(preview.content);
                  return (
                    <>
                      <div className="max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-3 text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                        {truncated.text}
                      </div>
                      {truncated.truncated && (
                        <p className="mt-1 text-[11px] text-slate-400">
                          Showing the first {truncated.text.length.toLocaleString()} of {truncated.totalLength.toLocaleString()} characters — the full text will
                          still be saved when you confirm.
                        </p>
                      )}
                    </>
                  );
                })()}
              </div>

              {saveError && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>{saveError}</p>
                </div>
              )}
            </div>
          )}

          {stage === 'success' && savedEntry && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                <p>Saved to your repository.</p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-2">
                <p className="font-display font-semibold text-slate-800 dark:text-slate-100">{savedEntry.title}</p>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone="brand">{getRepositoryContentTypeMeta(savedEntry.contentType).label}</Badge>
                  <Badge tone="neutral">{workspaceLabel}</Badge>
                </div>
                {target && (
                  <button
                    onClick={() => {
                      onClose();
                      navigate(target.to);
                    }}
                    className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 dark:text-brand-400 hover:underline"
                  >
                    {target.label} <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800 px-5 py-4">
          {stage === 'preview' && (
            <>
              <Button variant="secondary" onClick={resetToPick}>
                Cancel
              </Button>
              <Button onClick={handleConfirm} disabled={!titleInput.trim()}>
                Confirm &amp; Save
              </Button>
            </>
          )}
          {stage === 'success' && (
            <>
              <Button variant="secondary" onClick={resetToPick}>
                Import another
              </Button>
              <Button onClick={onClose}>Done</Button>
            </>
          )}
          {(stage === 'pick' || stage === 'extracting' || stage === 'error') && (
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
