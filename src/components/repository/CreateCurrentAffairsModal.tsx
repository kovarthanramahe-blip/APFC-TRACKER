import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../ui/Primitives';
import { createManualImportedContent, type ImportedContent } from '../../lib/contentImport';
import { buildMetadata, buildSyllabusNodeOptions } from './ImportToRepositoryModal';
import type { WorkspaceKind } from '../../lib/workspace';

// UPSC CSE Current Affairs — manual capture. The generic Repository has no existing "create
// manually, no file" shell: EditMetadataModal (pages/Repository.tsx) only EDITS an already-saved
// entry (no content/body field, saves via updateImportedContent) and ImportToRepositoryModal.tsx
// requires a file to start its FILE -> EXTRACT -> PREVIEW -> CONFIRM pipeline. Rather than
// generalising either of those, or inventing a second creation function, this is the smallest new
// modal: it builds its metadata with the EXACT SAME buildMetadata() ImportToRepositoryModal.tsx
// already exports and uses, reuses that same file's buildSyllabusNodeOptions() for the syllabus
// selector (never a duplicated dataset/search), and saves through the EXISTING
// createManualImportedContent() + the store's addImportedContent — the identical path
// pages/WorkingBibliography.tsx's own manual-entry flow already uses for 'bibliography'. No new
// store, no new CRUD module, no new persistence path, no fake File is ever created.
//
// This modal is intentionally scoped to contentType: 'current_affairs' only — generalising to every
// ImportedContentType is explicitly out of scope for this stage (see the task this was built for).

export function buildCurrentAffairsManualContent(
  workspaceId: WorkspaceKind,
  title: string,
  rawContent: string,
  eventDateInput: string,
  sourceInput: string,
  syllabusNodeIdInput: string,
): ImportedContent {
  const metadata = buildMetadata('', '', '', null, false, false, eventDateInput, sourceInput, syllabusNodeIdInput);
  return createManualImportedContent({
    workspaceId,
    contentType: 'current_affairs',
    title: title.trim(),
    content: rawContent,
    metadata,
  });
}

export function CreateCurrentAffairsModal({
  workspaceId,
  onClose,
  onSave,
}: {
  workspaceId: WorkspaceKind;
  onClose: () => void;
  onSave: (item: ImportedContent) => void;
}) {
  const [titleInput, setTitleInput] = useState('');
  const [contentInput, setContentInput] = useState('');
  const [eventDateInput, setEventDateInput] = useState('');
  const [sourceInput, setSourceInput] = useState('');
  const [syllabusNodeIdInput, setSyllabusNodeIdInput] = useState('');

  const syllabusNodeOptions = useMemo(buildSyllabusNodeOptions, []);

  function handleSave() {
    if (!titleInput.trim()) return;
    const item = buildCurrentAffairsManualContent(workspaceId, titleInput, contentInput, eventDateInput, sourceInput, syllabusNodeIdInput);
    onSave(item);
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-xl rounded-t-2xl sm:inset-0 sm:top-16 sm:bottom-auto sm:h-fit sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Add Current Affairs Entry</h3>
          <button onClick={onClose} aria-label="Close" className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-4">
          <div>
            <label htmlFor="ca-manual-title" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Title
            </label>
            <input
              id="ca-manual-title"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              placeholder="Title"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>

          <div>
            <label htmlFor="ca-manual-content" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Content
            </label>
            <textarea
              id="ca-manual-content"
              value={contentInput}
              onChange={(e) => setContentInput(e.target.value)}
              placeholder="What happened, why it matters…"
              rows={5}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>

          <div>
            <label htmlFor="ca-manual-event-date" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Event Date
            </label>
            <input
              id="ca-manual-event-date"
              type="date"
              value={eventDateInput}
              onChange={(e) => setEventDateInput(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
            <p className="mt-1 text-[11px] text-slate-400">The date of the event/article itself — not today's date.</p>
          </div>

          <div>
            <label htmlFor="ca-manual-source" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              Source
            </label>
            <input
              id="ca-manual-source"
              value={sourceInput}
              onChange={(e) => setSourceInput(e.target.value)}
              placeholder="e.g. The Hindu, 14 Mar 2026"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>

          <div>
            <label htmlFor="ca-manual-syllabus-node" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">
              UPSC Syllabus Topic
            </label>
            <select
              id="ca-manual-syllabus-node"
              value={syllabusNodeIdInput}
              onChange={(e) => setSyllabusNodeIdInput(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            >
              <option value="">No topic selected</option>
              <optgroup label="Microsyllabus Topics">
                {syllabusNodeOptions.microsyllabusOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Granular Topics">
                {syllabusNodeOptions.granularOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
            </select>
            <p className="mt-1 text-[11px] text-slate-400">Optional — links this item to its real UPSC CSE syllabus topic.</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800 px-5 py-4">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!titleInput.trim()}>
            Save
          </Button>
        </div>
      </div>
    </>
  );
}
