import { useRef, useState } from 'react';
import { Upload, X, AlertTriangle, CheckCircle2, ShieldAlert, FileWarning } from 'lucide-react';
import { useAppStore } from '../../lib/store';
import { getWorkspaceMeta } from '../../lib/workspace';
import { Badge, Button } from '../ui/Primitives';
import { extractContentFromFile, buildImportPreview, confirmImportedContent, isNearEmptyContent } from '../../lib/contentImport';
import { buildUpscCsePrelimsImportPreview, type UpscCsePrelimsImportPreview } from '../../lib/upscCsePyqImport';

// UPSC CSE Prelims PYQ Import — the minimal Repository-area entry point for this stage's
// FILE -> EXTRACT -> DETECT -> PREVIEW -> VALIDATE -> USER CONFIRMS pipeline
// (lib/upscCsePyqImport.ts). EXTRACT reuses lib/contentImport.ts's extractContentFromFile
// unchanged — the same function pages/PhdResearch.tsx and components/repository/
// ImportToRepositoryModal.tsx already call. DETECT/VALIDATE/PREVIEW is
// buildUpscCsePrelimsImportPreview, entirely pure — see that module's own header for exactly why a
// new UpscCsePrelimsPyq type exists instead of reusing lib/types.ts's PYQ.
//
// data/pyqUpscCse.ts's UPSC_CSE_PYQ_BANK is compile-time data — there is no runtime store field a
// browser session could append a structured PYQ into, and this stage's own instructions require it
// to stay empty regardless. So "Confirm" here does the one thing this stage's browser UI actually
// CAN safely persist: it saves the RAW uploaded file as ImportedContent (contentType 'pyq',
// workspace-scoped to upsc_cse) through the existing repository import pipeline — exactly the
// "preserve it as imported source material" fallback this stage's own instructions describe,
// applied unconditionally so the user's real source is never lost, regardless of how many
// questions the structured preview below was able to confidently parse. The structured
// accepted/rejected breakdown is shown for review only; nothing about it is written anywhere yet.
//
// Only ever offered when upsc_cse is the active workspace (see pages/Repository.tsx) — this modal
// has no workspace picker of its own, matching every other repository import modal's discipline of
// always targeting whatever the CURRENT active workspace is, never a chosen one.

type Stage = 'pick' | 'extracting' | 'error' | 'preview' | 'success';

export function UpscCsePyqImportModal({ onClose }: { onClose: () => void }) {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const addImportedContent = useAppStore((s) => s.addImportedContent);
  const workspaceLabel = getWorkspaceMeta(activeWorkspaceId).label;

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>('pick');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<UpscCsePrelimsImportPreview | null>(null);
  const [rawFile, setRawFile] = useState<{ name: string; text: string; format: 'markdown' | 'docx' | 'pdf' | 'text' | 'doc' | 'unsupported' } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setStage('extracting');
    setErrorMessage(null);

    const result = await extractContentFromFile(file);
    if (result.status === 'error') {
      setErrorMessage(result.message);
      setStage('error');
      return;
    }
    if (isNearEmptyContent(result.content.text)) {
      setErrorMessage('This file appears to be empty or contains no extractable text — please choose a different file.');
      setStage('error');
      return;
    }

    setRawFile({ name: file.name, text: result.content.text, format: result.content.format });
    setPreview(buildUpscCsePrelimsImportPreview(result.content.text, file.name));
    setSaveError(null);
    setStage('preview');
  }

  function handleConfirm() {
    if (!rawFile) return;
    setSaveError(null);
    try {
      const importPreview = buildImportPreview({ name: rawFile.name }, { format: rawFile.format, text: rawFile.text });
      const savedItem = confirmImportedContent(importPreview, {
        workspaceId: activeWorkspaceId,
        contentType: 'pyq',
        sourceNote: 'UPSC CSE Prelims PYQ source — preserved verbatim; see lib/upscCsePyqImport.ts for what structured parsing found.',
      });
      addImportedContent(savedItem);
      setStage('success');
    } catch {
      setSaveError('Could not save this source — please try again.');
    }
  }

  function resetToPick() {
    setStage('pick');
    setErrorMessage(null);
    setPreview(null);
    setRawFile(null);
    setSaveError(null);
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-xl rounded-t-2xl sm:inset-0 sm:top-16 sm:bottom-auto sm:h-fit sm:rounded-2xl bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <h3 className="font-display font-semibold text-slate-800 dark:text-slate-100">Import UPSC CSE Prelims PYQ Source</h3>
          <button onClick={onClose} aria-label="Close" className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4 space-y-4">
          <p className="text-xs text-slate-400">
            Destination workspace: <span className="font-medium text-slate-600 dark:text-slate-300">{workspaceLabel}</span> — UPSC CSE Prelims PYQs never leave this
            workspace.
          </p>

          {stage === 'pick' && (
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 py-12 px-6 text-center">
              <Upload className="h-8 w-8 text-slate-300 dark:text-slate-700" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Choose a UPSC CSE Prelims PYQ source file — Markdown, DOCX, PDF, or plain text. Only genuine, user-supplied source material is ever used — nothing is
                fabricated.
              </p>
              <Button onClick={() => fileInputRef.current?.click()}>
                <Upload className="h-4 w-4" /> Choose File
              </Button>
              <input ref={fileInputRef} type="file" accept=".md,.markdown,.docx,.pdf,.txt" className="hidden" onChange={handleFileChange} aria-label="Choose a UPSC CSE Prelims PYQ source file" />
            </div>
          )}

          {stage === 'extracting' && (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
              <p className="text-sm text-slate-400">Extracting file contents…</p>
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

          {stage === 'preview' && preview && (
            <div className="space-y-4">
              {!preview.structured ? (
                <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
                  <FileWarning className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Could not be confidently converted into structured questions.</p>
                    <p className="mt-1 text-xs">{preview.unstructuredReason}</p>
                    <p className="mt-1 text-xs">The file itself will still be preserved as source material — nothing is discarded, and nothing is guessed.</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 space-y-1.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Detected year</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{preview.year ?? 'Not stated in source'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Detected paper</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{preview.paper ?? 'Not stated in source'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Question count</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{preview.accepted.length + preview.rejected.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Passed validation</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{preview.accepted.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Rejected</span>
                    <span className="font-semibold text-rose-600 dark:text-rose-400">{preview.rejected.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Answer key</span>
                    <Badge tone={preview.hasAnswerKey ? 'success' : 'neutral'}>{preview.hasAnswerKey ? 'Present (unverified)' : 'Not found in source'}</Badge>
                  </div>
                </div>
              )}

              {preview.structured && preview.rejected.length > 0 && (
                <div>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Rejected questions</p>
                  <div className="max-h-40 overflow-y-auto space-y-1.5">
                    {preview.rejected.map((r, i) => (
                      <div key={i} className="rounded-lg border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs">
                        <p className="truncate text-slate-600 dark:text-slate-300">{r.candidate.question || '(no question text)'}</p>
                        <p className="mt-0.5 text-rose-500">{r.issues.map((issue) => issue.message).join(' ')}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3 text-xs text-slate-500 dark:text-slate-400 space-y-1">
                <p>
                  <span className="font-medium text-slate-600 dark:text-slate-300">Source file:</span> {rawFile?.name}
                </p>
                <p>
                  <span className="font-medium text-slate-600 dark:text-slate-300">Destination:</span> {workspaceLabel}
                </p>
              </div>

              <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <p>
                  Confirming saves your source file exactly as uploaded into the {workspaceLabel} repository — nothing is fabricated, and no question, answer, or
                  metadata is invented for fields your source doesn't state.
                </p>
              </div>

              {saveError && (
                <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <p>{saveError}</p>
                </div>
              )}
            </div>
          )}

          {stage === 'success' && (
            <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <p>Source saved to your {workspaceLabel} repository.</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-100 dark:border-slate-800 px-5 py-4">
          {stage === 'preview' && (
            <>
              <Button variant="secondary" onClick={resetToPick}>
                Cancel
              </Button>
              <Button onClick={handleConfirm}>Confirm</Button>
            </>
          )}
          {stage === 'success' && <Button onClick={onClose}>Done</Button>}
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
