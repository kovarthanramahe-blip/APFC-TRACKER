import { useState } from 'react';
import { X, Download, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { getWorkspaceMeta, type WorkspaceKind } from '../../lib/workspace';
import { Badge, Button } from '../ui/Primitives';
import { buildRepositoryExportSnapshot, serializeRepositoryExportSnapshot } from '../../lib/repository';

// Repository Export / Backup — a thin UI layer over lib/repository.ts's own
// buildRepositoryExportSnapshot/serializeRepositoryExportSnapshot (built two stages ago,
// unmodified, unused by any UI until now). This is deliberately NOT a second export format: every
// byte of the downloaded file is exactly serializeRepositoryExportSnapshot's own output, and every
// count shown in the summary below is read directly off the SAME snapshot object that gets
// downloaded — never a separately-computed number that could drift from what's actually exported.
//
// EXPORT ONLY. No import/restore path exists here or anywhere yet; nothing this stage does can
// overwrite, merge into, or migrate existing data. This is also completely separate from
// lib/store.ts's own exportAllData/importAllData (pages/Settings.tsx's whole-app backup) — neither
// reads, calls, or changes the other.

/** `<workspace>-repository-YYYY-MM-DD.json`, using the actual current date at export time (or an
 * explicit override, for deterministic testing). Exported so it's directly testable without
 * needing to trigger a real download. */
export function repositoryExportFilename(workspaceId: WorkspaceKind, at: Date = new Date()): string {
  return `${workspaceId}-repository-${at.toISOString().slice(0, 10)}.json`;
}

export function ExportRepositoryModal({ onClose }: { onClose: () => void }) {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const importedContent = useAppStore((s) => s.importedContent);
  const notes = useAppStore((s) => s.notes);
  const contentRelationships = useAppStore((s) => s.contentRelationships);
  const workspaceLabel = getWorkspaceMeta(activeWorkspaceId).label;

  const [error, setError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  // Built once, from the raw store fields only — never from this page's own search/filter/sort UI
  // state (which is transient, view-only, and must never affect what gets exported) — so the
  // summary below and the file actually downloaded on Export are guaranteed to match exactly.
  const [snapshot] = useState(() => buildRepositoryExportSnapshot(importedContent, notes, contentRelationships, activeWorkspaceId));

  const totalItems = snapshot.notes.length + snapshot.importedContent.length;

  function handleExport() {
    setError(null);
    try {
      const json = serializeRepositoryExportSnapshot(snapshot);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = repositoryExportFilename(activeWorkspaceId);
      a.click();
      URL.revokeObjectURL(url);
      setDownloaded(true);
    } catch {
      // Never silently produce an incomplete backup — if generation fails for any reason, no
      // download is triggered and the user sees exactly that, with the option to retry.
      setError('Could not generate the export — please try again.');
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-md rounded-t-2xl sm:inset-0 sm:top-24 sm:bottom-auto sm:h-fit sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Export Repository</h3>
          <button onClick={onClose} aria-label="Close" className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-4 space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            This exports everything stored in <span className="font-medium text-slate-700 dark:text-slate-200">{workspaceLabel}</span> as a single, self-contained
            JSON backup file. Only {workspaceLabel} is included — no other workspace's data.
          </p>
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-1.5 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">Workspace</span>
              <Badge tone="neutral">{workspaceLabel}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">Total items</span>
              <span className="font-semibold text-slate-700 dark:text-slate-200">{totalItems}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">Notes</span>
              <span className="font-semibold text-slate-700 dark:text-slate-200">{snapshot.notes.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">Imported content</span>
              <span className="font-semibold text-slate-700 dark:text-slate-200">{snapshot.importedContent.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">Relationships</span>
              <span className="font-semibold text-slate-700 dark:text-slate-200">{snapshot.relationships.length}</span>
            </div>
          </div>

          {totalItems === 0 && (
            <p className="text-xs text-slate-400">This workspace has no repository content yet — the export will still be a valid, empty backup.</p>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          {downloaded && !error && (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <p>Export downloaded as {repositoryExportFilename(activeWorkspaceId)}.</p>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800 px-5 py-4">
          <Button variant="secondary" onClick={onClose}>
            {downloaded ? 'Close' : 'Cancel'}
          </Button>
          <Button onClick={handleExport}>
            <Download className="h-4 w-4" /> {downloaded ? 'Export Again' : 'Export Repository'}
          </Button>
        </div>
      </div>
    </>
  );
}
