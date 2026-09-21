import { useMemo, useRef, useState } from 'react';
import { GraduationCap, Upload, X, FileText, Trash2, Eye } from 'lucide-react';
import { useAppStore } from '../lib/store';
import { getWorkspaceMeta } from '../lib/workspace';
import { Card, Badge, Button, PageHeader } from '../components/ui/Primitives';
import {
  extractContentFromFile,
  buildImportPreview,
  confirmImportedContent,
  selectImportedContentByType,
  SUPPORTED_IMPORT_EXTENSIONS,
  type ImportPreview,
  type ImportedContent,
  type ImportFileFormat,
} from '../lib/contentImport';

// PhD Research workspace, first repository UI slice — a minimal, import-first document repository
// exercising the existing FILE -> EXTRACT -> PREVIEW -> CONFIRM -> SAVE -> DISPLAY pipeline
// (lib/contentImport.ts) end to end for the 'research_document' content type. Content type is
// deliberately NOT user-selectable here (this page always imports as 'research_document') — a
// content-type picker, richer editing, bibliography/citation handling and any AI features are all
// explicitly out of scope for this slice. Persistence goes through the same workspace-scoped
// `importedContent` store every other content type will eventually use — no separate storage.
const FORMAT_LABELS: Record<ImportFileFormat, string> = {
  markdown: 'Markdown (.md)',
  docx: 'Word Document (.docx)',
  pdf: 'PDF',
  text: 'Plain Text (.txt)',
  doc: 'Legacy Word Document (.doc)',
  unsupported: 'Unsupported',
};

export default function PhdResearch() {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const importedContent = useAppStore((s) => s.importedContent);
  const addImportedContent = useAppStore((s) => s.addImportedContent);
  const deleteImportedContent = useAppStore((s) => s.deleteImportedContent);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [previewTitle, setPreviewTitle] = useState('');
  const [viewing, setViewing] = useState<ImportedContent | null>(null);

  const researchDocuments = useMemo(() => selectImportedContentByType(importedContent, 'research_document'), [importedContent]);

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
    });
    addImportedContent(content);
    setPreview(null);
    setPreviewTitle('');
  }

  function handleCancel() {
    setPreview(null);
    setPreviewTitle('');
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
          onTitleChange={setPreviewTitle}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      )}

      {researchDocuments.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FileText className="h-10 w-10 text-slate-300 dark:text-slate-700 mb-3" />
          <p className="text-slate-400 text-sm">No research documents imported yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {researchDocuments.map((doc) => (
            <Card key={doc.id} className="flex h-full flex-col p-4">
              <div className="mb-2 flex items-center justify-between">
                <Badge tone="brand">Research Document</Badge>
              </div>
              <h4 className="font-display font-semibold text-slate-800 dark:text-slate-100 truncate">{doc.title}</h4>
              <p className="mt-1 text-xs text-slate-400 truncate">{doc.provenance.sourceFilename}</p>
              <p className="mt-1 text-[11px] text-slate-300 dark:text-slate-600">
                Imported {new Date(doc.provenance.importedAt).toLocaleDateString('en-IN')}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => setViewing(doc)}>
                  <Eye className="h-3.5 w-3.5" /> View
                </Button>
                <Button variant="danger" size="sm" onClick={() => deleteImportedContent(doc.id)}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {viewing && <ViewDocumentModal document={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function ImportPreviewPanel({
  preview,
  title,
  onTitleChange,
  onConfirm,
  onCancel,
}: {
  preview: ImportPreview;
  title: string;
  onTitleChange: (title: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
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
          <p className="text-sm text-slate-700 dark:text-slate-200">{FORMAT_LABELS[preview.originalFormat]}</p>
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
            <p className="text-xs text-slate-400 truncate">{document.provenance.sourceFilename}</p>
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
