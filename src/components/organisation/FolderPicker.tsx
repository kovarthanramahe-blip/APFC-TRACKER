import { useMemo } from 'react';
import { buildFolderTree, flattenFolderTree, type Folder } from '../../lib/folders';
import type { WorkspaceKind } from '../../lib/workspace';

// Premium Note Organisation (Phase 4E) — a reusable folder <select>, shared by every page that
// lets a user file a Note/ImportedContent into a folder (pages/Notes.tsx, pages/PhdResearch.tsx,
// pages/WorkingBibliography.tsx, components/repository/*, the import flow). A native <select> is
// deliberately used rather than a custom dropdown — large touch targets and zero extra JS on every
// platform (desktop mouse, Xiaomi Pad 6, Galaxy S24 Ultra) for free, matching this codebase's
// existing convention (every other filter/sort control in this app is a plain <select>).
export function FolderPicker({
  id,
  label,
  folders,
  workspaceId,
  value,
  onChange,
  rootLabel = 'Unfiled (Root)',
  className,
}: {
  id?: string;
  label?: string;
  folders: readonly Folder[];
  workspaceId: WorkspaceKind;
  /** `null` = root/unfiled. */
  value: string | null;
  onChange: (folderId: string | null) => void;
  rootLabel?: string;
  className?: string;
}) {
  const options = useMemo(() => flattenFolderTree(buildFolderTree(folders, workspaceId)), [folders, workspaceId]);

  return (
    <div className={className}>
      {label && (
        <label htmlFor={id} className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          {label}
        </label>
      )}
      <select
        id={id}
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500/40"
      >
        <option value="">{rootLabel}</option>
        {options.map(({ folder, depth }) => (
          <option key={folder.id} value={folder.id}>
            {'—'.repeat(depth)} {folder.name}
          </option>
        ))}
      </select>
    </div>
  );
}
