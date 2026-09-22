import { useRef, useState } from 'react';
import { Upload, X, AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { getWorkspaceMeta } from '../../lib/workspace';
import { Badge, Button } from '../ui/Primitives';
import { validateRepositoryBackupJson, buildRepositoryImportPlan, type RepositoryImportPlan } from '../../lib/repositoryImport';

// Repository Import / Restore — the UI layer over lib/repositoryImport.ts's pure
// VALIDATE/PREVIEW pipeline. BACKUP JSON -> READ -> VALIDATE -> PREVIEW -> USER CONFIRMS -> ADD TO
// CURRENT WORKSPACE. No store mutation happens before the user clicks the explicit Confirm action
// on the preview screen — reading the file and building the plan are both pure; only handleConfirm
// ever calls the store.
//
// The import ALWAYS targets the current active workspace, never the backup's own recorded
// workspace — that is shown explicitly in the preview (Source vs Destination) so it is never
// silent. This is additive-only: an id that collides with an existing destination record gets a
// freshly generated id instead (see lib/repositoryImport.ts's buildRepositoryImportPlan), so the
// existing record is never read for its content and never at risk of being overwritten.

type Stage = 'pick' | 'error' | 'preview' | 'success';

export function ImportRepositoryBackupModal({ onClose }: { onClose: () => void }) {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const importedContent = useAppStore((s) => s.importedContent);
  const notes = useAppStore((s) => s.notes);
  const contentRelationships = useAppStore((s) => s.contentRelationships);
  const applyRepositoryImportPlan = useAppStore((s) => s.applyRepositoryImportPlan);
  const workspaceLabel = getWorkspaceMeta(activeWorkspaceId).label;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('pick');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [plan, setPlan] = useState<RepositoryImportPlan | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file after an error
    if (!file) return;
    setErrorMessage(null);

    let text: string;
    try {
      text = await file.text();
    } catch {
      setErrorMessage("Could not read this file — please check it isn't corrupted and try again.");
      setStage('error');
      return;
    }

    const validated = validateRepositoryBackupJson(text);
    if (validated.status === 'error') {
      setErrorMessage(validated.message);
      setStage('error');
      return;
    }

    // Build the COMPLETE import result now, before any confirmation — the preview and the
    // eventual apply both read from this exact same plan object, so they can never disagree.
    const builtPlan = buildRepositoryImportPlan(validated.snapshot, {
      workspaceId: activeWorkspaceId,
      existingNotes: notes,
      existingImportedContent: importedContent,
      existingRelationships: contentRelationships,
    });
    setPlan(builtPlan);
    setStage('preview');
  }

  function handleConfirm() {
    if (!plan) return;
    try {
      applyRepositoryImportPlan(plan);
      setStage('success');
    } catch {
      // Never leave a half-imported state visible as if it succeeded — if the single merge
      // somehow fails, show an error rather than a false success.
      setErrorMessage('Could not complete the import — please try again.');
      setStage('error');
    }
  }

  function resetToPick() {
    setStage('pick');
    setErrorMessage(null);
    setPlan(null);
  }

  const totalCollisions = plan ? plan.noteCollisionCount + plan.importedContentCollisionCount + plan.relationshipCollisionCount : 0;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-xl rounded-t-2xl sm:inset-0 sm:top-16 sm:bottom-auto sm:h-fit sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Import Repository Backup</h3>
          <button onClick={onClose} aria-label="Close" className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-4">
          {stage === 'pick' && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 py-12 px-6 text-center">
              <Upload className="h-8 w-8 text-slate-300 dark:text-slate-700" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Choose a Repository backup JSON file (from Export Repository). It will be added to your current workspace,{' '}
                <span className="font-medium text-slate-700 dark:text-slate-200">{workspaceLabel}</span>.
              </p>
              <Button onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4" /> Choose Backup File
              </Button>
              <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} aria-label="Choose a repository backup file to import" />
            </div>
          )}

          {stage === 'error' && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>{errorMessage}</p>
              </div>
              <Button variant="secondary" onClick={resetToPick}>
                Choose a different file
              </Button>
            </div>
          )}

          {stage === 'preview' && plan && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 text-sm space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Source backup workspace</span>
                  <Badge tone="neutral">{getWorkspaceMeta(plan.sourceWorkspaceId).label}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Import destination</span>
                  <Badge tone="brand">{getWorkspaceMeta(plan.destinationWorkspaceId).label}</Badge>
                </div>
                {plan.sourceWorkspaceId !== plan.destinationWorkspaceId && (
                  <p className="pt-1 text-xs text-slate-400">
                    This backup was exported from {getWorkspaceMeta(plan.sourceWorkspaceId).label}. It will be added to {getWorkspaceMeta(plan.destinationWorkspaceId).label} — the
                    workspace you have open now, not the one it came from.
                  </p>
                )}
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Notes to import</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{plan.notesToAdd.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Imported content to import</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{plan.importedContentToAdd.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Relationships to restore</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{plan.relationshipsToAdd.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">ID collisions (will get new IDs)</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{totalCollisions}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Skipped/invalid relationships</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{plan.skippedRelationships.length}</span>
                </div>
              </div>

              <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <p>
                  This is additive only — nothing in {workspaceLabel} will be overwritten or deleted. Any imported record whose ID already exists here gets a new ID
                  automatically; the existing record is left exactly as it is.
                </p>
              </div>

              {errorMessage && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>{errorMessage}</p>
                </div>
              )}
            </div>
          )}

          {stage === 'success' && plan && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                <p>Import complete — added to {workspaceLabel}.</p>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Notes imported</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{plan.notesToAdd.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Imported content imported</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{plan.importedContentToAdd.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Relationships restored</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{plan.relationshipsToAdd.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">IDs remapped</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{totalCollisions}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 dark:text-slate-400">Invalid/skipped relationships</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-200">{plan.skippedRelationships.length}</span>
                </div>
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
              <Button onClick={handleConfirm}>Confirm Import</Button>
            </>
          )}
          {stage === 'success' && <Button onClick={onClose}>Done</Button>}
          {(stage === 'pick' || stage === 'error') && (
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
