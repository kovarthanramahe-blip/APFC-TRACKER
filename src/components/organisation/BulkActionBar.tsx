import { useState } from 'react';
import { Pin, Archive, ArchiveRestore } from 'lucide-react';
import { Button } from '../ui/Primitives';
import { FolderPicker } from './FolderPicker';
import type { Folder } from '../../lib/folders';
import type { WorkspaceKind } from '../../lib/workspace';

// Premium Note Organisation (Phase 4E) — one reusable bulk-action bar, shown whenever 1+ items are
// multi-selected. Shared across Notes/Repository/PhD Research/Working Bibliography rather than
// each page hand-rolling its own (see pages/Notes.tsx's own OrganiseView, built in Phase 3B before
// this component existed — kept as-is rather than retrofitted, to avoid regressing its already-
// covered behaviour; every Phase 4 surface uses this shared one instead). Every action here is
// non-destructive except nothing here ever deletes — move/tag/pin/archive only.
export function BulkActionBar({
  selectedCount,
  folders,
  workspaceId,
  onMoveToFolder,
  onAddTag,
  onRemoveTag,
  onPin,
  onUnpin,
  onArchive,
  onUnarchive,
  onCancel,
}: {
  selectedCount: number;
  folders: readonly Folder[];
  workspaceId: WorkspaceKind;
  onMoveToFolder: (folderId: string | null) => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onPin: () => void;
  onUnpin: () => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onCancel: () => void;
}) {
  const [tagInput, setTagInput] = useState('');

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2.5 dark:border-brand-500/30 dark:bg-brand-500/10">
      <span className="text-xs font-medium text-brand-700 dark:text-brand-300">{selectedCount} selected</span>

      <FolderPicker
        folders={folders}
        workspaceId={workspaceId}
        value={null}
        onChange={(folderId) => onMoveToFolder(folderId)}
        rootLabel="Move to…"
        className="w-40"
      />

      <div className="flex items-center gap-1">
        <input
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          placeholder="Tag name"
          className="w-28 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs text-slate-700 dark:text-slate-200"
        />
        <Button
          variant="secondary"
          disabled={!tagInput.trim()}
          onClick={() => {
            onAddTag(tagInput);
            setTagInput('');
          }}
        >
          Add tag
        </Button>
        <Button
          variant="secondary"
          disabled={!tagInput.trim()}
          onClick={() => {
            onRemoveTag(tagInput);
            setTagInput('');
          }}
        >
          Remove tag
        </Button>
      </div>

      <Button variant="secondary" onClick={onPin}>
        <Pin className="h-3.5 w-3.5" /> Pin
      </Button>
      <Button variant="secondary" onClick={onUnpin}>
        Unpin
      </Button>
      <Button variant="secondary" onClick={onArchive}>
        <Archive className="h-3.5 w-3.5" /> Archive
      </Button>
      <Button variant="secondary" onClick={onUnarchive}>
        <ArchiveRestore className="h-3.5 w-3.5" /> Unarchive
      </Button>
      <Button variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </div>
  );
}
