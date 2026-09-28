import { ChevronDown } from 'lucide-react';
import { FolderPicker } from '../organisation/FolderPicker';
import { PinToggle } from '../organisation/PinToggle';
import { ArchiveToggle } from '../organisation/ArchiveToggle';
import type { Folder } from '../../lib/folders';
import type { WorkspaceKind } from '../../lib/workspace';

// Premium Knowledge Editor, Phase 5H — a compact properties area for the note editor, built
// entirely from the EXISTING organisation components (Phase 4E: FolderPicker/PinToggle/
// ArchiveToggle) rather than duplicating folder/pin/archive controls. A native <details> disclosure
// — zero extra JS/state for the collapse behaviour, keyboard- and touch-accessible for free, closed
// by default everywhere (not just tablet) so it never overwhelms the editor, matching this
// feature's own "do not overwhelm" instruction.
export function NotePropertiesPanel({
  folderId,
  tagsInput,
  pinned,
  isArchived,
  createdAt,
  updatedAt,
  folders,
  workspaceId,
  onFolderChange,
  onTagsInputChange,
  onPinnedChange,
  onArchivedChange,
}: {
  folderId: string | null;
  tagsInput: string;
  pinned: boolean;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  folders: readonly Folder[];
  workspaceId: WorkspaceKind;
  onFolderChange: (folderId: string | null) => void;
  onTagsInputChange: (tags: string) => void;
  onPinnedChange: (pinned: boolean) => void;
  onArchivedChange: (archived: boolean) => void;
}) {
  const createdLabel = new Date(createdAt).toLocaleString('en-IN');
  const updatedLabel = new Date(updatedAt).toLocaleString('en-IN');

  return (
    <details className="rounded-lg border border-slate-200 dark:border-slate-800">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400 [&::-webkit-details-marker]:hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500">
        Properties
        <ChevronDown className="h-3.5 w-3.5 transition-transform [details[open]>summary_&]:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-slate-100 dark:border-slate-800 px-3 py-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <FolderPicker folders={folders} workspaceId={workspaceId} value={folderId} onChange={onFolderChange} label="Folder" />
          <div>
            <label htmlFor="note-properties-tags" className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Tags
            </label>
            <input
              id="note-properties-tags"
              value={tagsInput}
              onChange={(e) => onTagsInputChange(e.target.value)}
              placeholder="e.g. Revision, Important"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60">
            <PinToggle pinned={pinned} onToggle={() => onPinnedChange(!pinned)} size="sm" />
            Pinned
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60">
            <ArchiveToggle archived={isArchived} onToggle={() => onArchivedChange(!isArchived)} size="sm" />
            Archived
          </label>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400">
          <span>Created {createdLabel}</span>
          <span>Updated {updatedLabel}</span>
        </div>
      </div>
    </details>
  );
}
