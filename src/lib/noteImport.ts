// Notes file-import: turns an uploaded .md/.markdown/.docx/.pdf file into Markdown text ready to
// drop into the existing Note model (lib/types.ts's Note.content is already a plain string — no
// schema change). Entirely client-side: no upload, no server-side processing, no Supabase Storage,
// so this works identically in a desktop/mobile browser and inside the Capacitor Android WebView
// (which is a real Chromium engine, same as any other browser this runs in) — see the module's own
// header rationale in earlier project notes. Legacy .doc is deliberately never parsed — there is no
// reliable client-side library for the old binary format, so it's rejected with a clear message
// rather than attempted.
//
// Security/robustness: every extractor is wrapped by importNoteFile's own try/catch, so a
// malformed or hostile file produces a friendly error, never an unhandled exception that could
// break the Notes page. Nothing here ever renders raw HTML — DOCX is converted to HTML internally
// by mammoth, then immediately turned into plain Markdown text via turndown and discarded; only
// that Markdown string is ever stored or displayed (and only through the safe React-based
// markdown-to-jsx renderer, never dangerouslySetInnerHTML). No uploaded content is ever eval'd,
// executed, or otherwise trusted as anything but inert text.
export const SUPPORTED_IMPORT_EXTENSIONS = ['.md', '.markdown', '.docx', '.pdf'] as const;

/** A conservative initial cap — large files are slow to parse in a mobile WebView and a single
 * huge imported note risks blowing the app's localStorage persistence quota (see lib/store.ts's
 * zustand `persist`, which is shared across every piece of app data, not just notes). */
export const MAX_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export type ImportFileKind = 'markdown' | 'docx' | 'pdf' | 'doc' | 'unsupported';

const LEGACY_DOC_MESSAGE = "Legacy .doc files aren't supported yet. Please save the document as .docx or PDF and upload it again.";
const NEAR_EMPTY_PDF_MESSAGE = 'This PDF may be scanned/image-based and does not contain extractable text.';
const UNSUPPORTED_TYPE_MESSAGE = 'Unsupported file type. Please upload a .md, .markdown, .docx, or .pdf file.';
const UNREADABLE_FILE_MESSAGE = "Could not read this file — please check it isn't corrupted and try again.";

function oversizedMessage(maxBytes: number): string {
  return `This file is larger than the ${Math.round(maxBytes / (1024 * 1024))} MB import limit.`;
}

/** Extension-only classification — deliberately not MIME-sniffed: a locally-picked file's
 * `File.type` is unreliable (often empty for .md, inconsistent across OSes for .docx/.pdf), so the
 * extension is the one signal actually worth trusting here, same as this app's existing JSON
 * backup import (pages/Settings.tsx) trusts the file picker's `accept` filter rather than sniffing
 * content type. */
export function getImportFileKind(filename: string): ImportFileKind {
  const lower = filename.trim().toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown';
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.doc')) return 'doc';
  return 'unsupported';
}

export interface FileValidationResult {
  valid: boolean;
  kind: ImportFileKind;
  error?: string;
}

/** Structural validation only (extension + size) — takes just the two File fields it actually
 * needs, so it's usable with a real File and trivially testable without constructing one. */
export function validateImportFile(file: { name: string; size: number }, maxBytes: number = MAX_IMPORT_FILE_SIZE_BYTES): FileValidationResult {
  const kind = getImportFileKind(file.name);
  if (kind === 'doc') return { valid: false, kind, error: LEGACY_DOC_MESSAGE };
  if (kind === 'unsupported') return { valid: false, kind, error: UNSUPPORTED_TYPE_MESSAGE };
  if (file.size <= 0) return { valid: false, kind, error: UNREADABLE_FILE_MESSAGE };
  if (file.size > maxBytes) return { valid: false, kind, error: oversizedMessage(maxBytes) };
  return { valid: true, kind };
}

/** Markdown is already the note's native storage format — just normalise line endings and trim
 * trailing whitespace, never reinterpret the content. */
export function normalizeMarkdownText(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
}

const MEANINGFUL_CONTENT_MIN_LENGTH = 20;

/** True when, after stripping Markdown punctuation/whitespace, fewer than a handful of real
 * characters remain — the signal used to detect a PDF with no usable extractable text (most likely
 * scanned/image-based) without attempting any OCR. */
export function isNearEmptyContent(text: string): boolean {
  return text.replace(/[#*_\-\s>`[\]()]/g, '').trim().length < MEANINGFUL_CONTENT_MIN_LENGTH;
}

/** Prefers the first Markdown heading in the extracted content (what a human would call "the
 * title"); falls back to the filename with its extension stripped. */
export function deriveNoteTitle(filename: string, content: string): string {
  const headingMatch = content.match(/^#{1,6}\s+(.+)$/m);
  if (headingMatch) return headingMatch[1].trim();
  const base = filename.replace(/\.[^./\\]+$/, '').trim();
  return base || 'Imported note';
}

export interface PdfPageTextItem {
  text: string;
  fontSize: number;
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Pure, conservative heuristic turning pdfjs-dist's per-page text runs into best-effort Markdown.
 * PDF carries no semantic structure to recover exactly, so this never claims perfect fidelity: a
 * run whose font size is notably larger than that page's typical (median) size becomes a heading;
 * a run already starting with a bullet-like character or a "1. "/"1) " ordinal becomes a list item;
 * everything else is a plain paragraph. Each page is separated by a blank line.
 */
export function buildMarkdownFromPdfPages(pages: PdfPageTextItem[][]): string {
  const blocks: string[] = [];
  for (const page of pages) {
    const sizes = page.map((item) => item.fontSize).filter((s) => s > 0);
    const bodySize = sizes.length > 0 ? median(sizes) : 0;
    for (const item of page) {
      const text = item.text.trim();
      if (!text) continue;
      if (bodySize > 0 && item.fontSize >= bodySize * 1.3) {
        blocks.push(`## ${text}`);
      } else if (/^[-•*]\s+/.test(text)) {
        blocks.push(`- ${text.replace(/^[-•*]\s+/, '')}`);
      } else if (/^\d+[.)]\s+/.test(text)) {
        blocks.push(text);
      } else {
        blocks.push(text);
      }
    }
  }
  return blocks
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export type ImportOutcome = { status: 'ok'; title: string; content: string } | { status: 'error'; message: string };

/** DOCX -> HTML (mammoth) -> Markdown (turndown). The intermediate HTML never leaves this
 * function and is never rendered — only the resulting plain Markdown string is returned. */
async function extractMarkdownFromDocx(file: File): Promise<string> {
  const [{ default: mammoth }, { default: TurndownService }] = await Promise.all([import('mammoth'), import('turndown')]);
  const arrayBuffer = await file.arrayBuffer();
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
  const turndownService = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
  return normalizeMarkdownText(turndownService.turndown(html));
}

/** PDF -> per-page text runs (pdfjs-dist) -> best-effort Markdown (buildMarkdownFromPdfPages). */
async function extractMarkdownFromPdf(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: PdfPageTextItem[][] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const items: PdfPageTextItem[] = textContent.items.map((item) =>
      'str' in item ? { text: item.str, fontSize: Math.abs(item.transform[0]) } : { text: '', fontSize: 0 },
    );
    pages.push(items);
  }
  return normalizeMarkdownText(buildMarkdownFromPdfPages(pages));
}

/**
 * The single entry point pages/Notes.tsx calls: validates the file, dispatches to the right
 * extractor by extension, and returns either a ready-to-edit {title, content} pair or a
 * user-facing error message — never throws. Every extraction path is wrapped in try/catch so a
 * malformed/corrupted file degrades to a friendly error instead of an unhandled exception.
 */
export async function importNoteFile(file: File, maxBytes: number = MAX_IMPORT_FILE_SIZE_BYTES): Promise<ImportOutcome> {
  const validation = validateImportFile(file, maxBytes);
  if (!validation.valid) return { status: 'error', message: validation.error! };

  try {
    let content: string;
    if (validation.kind === 'markdown') {
      content = normalizeMarkdownText(await file.text());
    } else if (validation.kind === 'docx') {
      content = await extractMarkdownFromDocx(file);
    } else {
      content = await extractMarkdownFromPdf(file);
      if (isNearEmptyContent(content)) {
        return { status: 'error', message: NEAR_EMPTY_PDF_MESSAGE };
      }
    }
    return { status: 'ok', title: deriveNoteTitle(file.name, content), content };
  } catch {
    return { status: 'error', message: UNREADABLE_FILE_MESSAGE };
  }
}
