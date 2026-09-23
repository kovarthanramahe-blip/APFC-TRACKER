import type { WorkspaceKind } from './workspace';
import { uuid } from './utils';

// Multi-Workspace OS — Import-First Content Repository FOUNDATION.
//
// This is the reusable core the Notes file-importer (lib/noteImport.ts) already proved out —
// generalised so future content (question banks, PYQs, research documents, bibliographies, …) can
// also be IMPORTED FROM FILES rather than hard-coded into source files, the same way Notes import
// already works. Nothing here is wired to any new UI or persisted anywhere new yet — see the
// module-by-module notes below for exactly what stops where.
//
// The pipeline this module models:
//   FILE -> PARSE -> DETECT/SELECT CONTENT TYPE -> CONVERT TO DOMAIN STRUCTURE -> PREVIEW -> USER CONFIRMS -> SAVE
// PARSE is extractContentFromFile. DETECT is suggestContentType (a SUGGESTION only — see its own
// doc comment). CONVERT/PREVIEW is buildImportPreview. CONFIRM is confirmImportedContent, which
// requires an explicit, caller-supplied contentType/workspaceId — nothing here ever silently
// decides content type or writes to a store on its own. SAVE has no implementation here at all:
// only 'note' has an existing persistence destination (lib/store.ts's `notes`, via
// lib/noteImport.ts -> pages/Notes.tsx, unchanged by this file); every other content type is
// represented in full by the types below, with nowhere yet to persist an instance — that is a
// deliberate stop, not an oversight (see the task this was built for).
//
// Entirely client-side, exactly like the existing Notes importer: no upload, no server-side
// processing, no Supabase Storage. Nothing here ever renders raw HTML — DOCX is converted to HTML
// internally by mammoth, then immediately turned into plain Markdown via turndown and discarded;
// only that Markdown string is ever returned. No uploaded content is ever eval'd, executed, or
// otherwise trusted as anything but inert text.

// ============================================================================================
// Content-type foundation
// ============================================================================================

/**
 * What KIND of thing an imported file becomes — deliberately open-ended so this repository can
 * grow into APFC/UPSC CSE/PhD Research's different needs without another type redesign. Only
 * 'note' has a real conversion + persistence path today (see the module header); the rest exist
 * so the shape is ready, are never auto-selected, and are never populated with fabricated content.
 *
 * 'document' and 'study_material' (Personal Content Repository foundation) are generic, freeform
 * content types with no narrower classification — a general document or study material that isn't
 * specifically a note, a question bank, a PYQ, or research/bibliography material. `question_bank`
 * and `descriptive_questions` already cover exactly what a repository vocabulary would otherwise
 * call "objective_question_bank"/"descriptive_question_bank" (see OBJECTIVE_QUESTION_CONTENT_TYPES/
 * DESCRIPTIVE_CONTENT_TYPES below, which already group them that way) — kept under their existing
 * names rather than renamed, since a rename would ripple through every existing consumer (the
 * Repository UI, import modal, relationship/statistics code, and their tests) for a cosmetic
 * difference only, not a functional one.
 */
export type ImportedContentType =
  | 'note'
  | 'document'
  | 'study_material'
  | 'question_bank'
  | 'descriptive_questions'
  | 'pyq'
  | 'research_document'
  | 'bibliography'
  | 'other';

export const IMPORTED_CONTENT_TYPES: readonly ImportedContentType[] = [
  'note',
  'document',
  'study_material',
  'question_bank',
  'descriptive_questions',
  'pyq',
  'research_document',
  'bibliography',
  'other',
];

/**
 * Objective (single-correct-answer) question-like content — mirrors lib/types.ts's `PYQ` shape
 * (Stage 3B-2A). Kept as a SEPARATE, non-overlapping set from DESCRIPTIVE_CONTENT_TYPES below so
 * an eventual extraction step can never be pointed at the wrong target schema: a descriptive Mains
 * question has no correctOptionId to extract, and forcing one would mean fabricating an answer
 * key (see lib/types.ts's DescriptiveExamQuestion, proposed for exactly this reason).
 */
export const OBJECTIVE_QUESTION_CONTENT_TYPES: readonly ImportedContentType[] = ['question_bank', 'pyq'];

/** Descriptive (no single objective answer) question-like content — mirrors lib/types.ts's
 * proposed `DescriptiveExamQuestion` shape. Never overlaps with OBJECTIVE_QUESTION_CONTENT_TYPES. */
export const DESCRIPTIVE_CONTENT_TYPES: readonly ImportedContentType[] = ['descriptive_questions'];

export function isObjectiveQuestionContentType(type: ImportedContentType): boolean {
  return (OBJECTIVE_QUESTION_CONTENT_TYPES as readonly ImportedContentType[]).includes(type);
}

export function isDescriptiveContentType(type: ImportedContentType): boolean {
  return (DESCRIPTIVE_CONTENT_TYPES as readonly ImportedContentType[]).includes(type);
}

// ============================================================================================
// File format + extraction (generalised from lib/noteImport.ts — behaviour preserved exactly for
// every format Notes already supports; lib/noteImport.ts now delegates here rather than
// duplicating this logic)
// ============================================================================================

export const SUPPORTED_IMPORT_EXTENSIONS = ['.md', '.markdown', '.docx', '.pdf', '.txt', '.csv', '.json'] as const;

/** A conservative initial cap — large files are slow to parse in a mobile WebView and a single
 * huge imported item risks blowing the app's localStorage persistence quota (see lib/store.ts's
 * zustand `persist`, which is shared across every piece of app data, not just notes). */
export const MAX_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export type ImportFileFormat = 'markdown' | 'docx' | 'pdf' | 'text' | 'csv' | 'json' | 'doc' | 'unsupported';

/** Human-readable labels for ImportFileFormat, shared by every import-preview UI (Notes, PhD
 * Research documents, Working Bibliography, …) so the wording stays consistent in one place. */
export const IMPORT_FORMAT_LABELS: Record<ImportFileFormat, string> = {
  markdown: 'Markdown (.md)',
  docx: 'Word Document (.docx)',
  pdf: 'PDF',
  text: 'Plain Text (.txt)',
  csv: 'CSV (.csv)',
  json: 'JSON (.json)',
  doc: 'Legacy Word Document (.doc)',
  unsupported: 'Unsupported',
};

const LEGACY_DOC_MESSAGE = "Legacy .doc files aren't supported yet. Please save the document as .docx or PDF and upload it again.";
const NEAR_EMPTY_PDF_MESSAGE = 'This PDF may be scanned/image-based and does not contain extractable text.';
const UNSUPPORTED_TYPE_MESSAGE = 'Unsupported file type. Please upload a .md, .markdown, .docx, .pdf, .txt, .csv, or .json file.';
const UNREADABLE_FILE_MESSAGE = "Could not read this file — please check it isn't corrupted and try again.";
const INVALID_JSON_MESSAGE = "This file doesn't contain valid JSON — please check it isn't corrupted and try again.";

function oversizedMessage(maxBytes: number): string {
  return `This file is larger than the ${Math.round(maxBytes / (1024 * 1024))} MB import limit.`;
}

/** Human-readable file size (B/KB/MB) for the Import Centre preview — display only, never
 * persisted (see ImportedContentProvenance's own header: this module preserves only the source
 * metadata fields the existing architecture already models). */
export function formatFileSizeBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** A generous cap on how much text the Import Centre's PREVIEW panel renders — large documents
 * (a multi-hundred-page PDF, a long DOCX) can extract to hundreds of thousands of characters, and
 * rendering all of it into one DOM text node is exactly the "unbounded giant text block" this
 * limit exists to avoid. Preview-only: it never affects what gets saved (see confirmImportedContent,
 * which always saves the full, untruncated extracted text — this limit is read by the UI layer
 * alone, via truncateForPreview below). */
export const PREVIEW_TRUNCATION_LIMIT_CHARS = 8000;

export interface TruncatedPreview {
  /** The (possibly shortened) text to actually render. */
  text: string;
  truncated: boolean;
  /** The real, full length of the untouched text — shown in the "N of TOTAL characters" notice so
   * truncation is always visible, never silent. */
  totalLength: number;
}

/** Pure, deterministic truncation for display — never invents or summarises anything; it is
 * exactly the first `limit` characters of the real extracted text, verbatim. */
export function truncateForPreview(text: string, limit: number = PREVIEW_TRUNCATION_LIMIT_CHARS): TruncatedPreview {
  if (text.length <= limit) return { text, truncated: false, totalLength: text.length };
  return { text: text.slice(0, limit), truncated: true, totalLength: text.length };
}

/** Extension-only classification — deliberately not MIME-sniffed: a locally-picked file's
 * `File.type` is unreliable (often empty for .md, inconsistent across OSes for .docx/.pdf), so the
 * extension is the one signal actually worth trusting here, same as this app's existing JSON
 * backup import (pages/Settings.tsx) trusts the file picker's `accept` filter rather than sniffing
 * content type. */
export function getImportFileFormat(filename: string): ImportFileFormat {
  const lower = filename.trim().toLowerCase();
  if (lower.endsWith('.md') || lower.endsWith('.markdown')) return 'markdown';
  if (lower.endsWith('.docx')) return 'docx';
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.txt')) return 'text';
  if (lower.endsWith('.csv')) return 'csv';
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.doc')) return 'doc';
  return 'unsupported';
}

export interface FileValidationResult {
  valid: boolean;
  format: ImportFileFormat;
  error?: string;
}

/** Structural validation only (extension + size) — takes just the two File fields it actually
 * needs, so it's usable with a real File and trivially testable without constructing one. */
export function validateImportFile(file: { name: string; size: number }, maxBytes: number = MAX_IMPORT_FILE_SIZE_BYTES): FileValidationResult {
  const format = getImportFileFormat(file.name);
  if (format === 'doc') return { valid: false, format, error: LEGACY_DOC_MESSAGE };
  if (format === 'unsupported') return { valid: false, format, error: UNSUPPORTED_TYPE_MESSAGE };
  if (file.size <= 0) return { valid: false, format, error: UNREADABLE_FILE_MESSAGE };
  if (file.size > maxBytes) return { valid: false, format, error: oversizedMessage(maxBytes) };
  return { valid: true, format };
}

/** Markdown/plain text are already storable as-is — just normalise line endings and trim trailing
 * whitespace, never reinterpret the content. */
export function normalizeText(text: string): string {
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
 * title"); falls back to the filename with its extension stripped, or `fallbackTitle` if even that
 * is unusable. `fallbackTitle` lets callers (e.g. lib/noteImport.ts) keep their own existing,
 * domain-appropriate wording instead of this module's generic default. */
export function deriveContentTitle(filename: string, content: string, fallbackTitle: string = 'Imported content'): string {
  const headingMatch = content.match(/^#{1,6}\s+(.+)$/m);
  if (headingMatch) return headingMatch[1].trim();
  const base = filename.replace(/\.[^./\\]+$/, '').trim();
  return base || fallbackTitle;
}

/**
 * A small, dependency-free CSV parser (RFC 4180-ish): handles quoted fields (including embedded
 * commas, newlines, and escaped `""` quotes) and both `\n`/`\r\n` line endings. Deliberately not a
 * full spec implementation or an added parsing library — just enough to read the kind of CSV a
 * spreadsheet export actually produces, matching this module's "minimal additions, no large
 * parsing framework" discipline (see buildMarkdownFromPdfPages's own equally hand-rolled heuristic
 * below). A trailing blank line never produces a spurious empty trailing row.
 */
export function parseCsvRows(text: string): string[][] {
  const s = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }
    field += c;
    i++;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Renders parsed CSV rows as a Markdown table — a faithful reformatting of the exact same cell
 * values (never invented, never summarised), which is what makes this a legitimate "structured
 * preview" rather than fabricated content. The first row is treated as the header. Ragged rows
 * (fewer/more cells than the header) are padded/handled per-row rather than dropped or guessed at;
 * a literal `|` inside a cell is escaped so it can never be mistaken for a column boundary. Returns
 * an empty string for an empty file (zero rows).
 */
export function csvRowsToMarkdownTable(rows: readonly string[][]): string {
  if (rows.length === 0) return '';
  const escapeCell = (cell: string | undefined) => (cell ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ').trim();
  const [header, ...body] = rows;
  const columnCount = header.length;
  const renderRow = (row: readonly string[]) => `| ${Array.from({ length: columnCount }, (_, i) => escapeCell(row[i])).join(' | ')} |`;
  const lines = [renderRow(header), `| ${Array.from({ length: columnCount }, () => '---').join(' | ')} |`, ...body.map(renderRow)];
  return lines.join('\n');
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
 * everything else is a plain paragraph. Each page that contributes real text is preceded by a
 * `[Page N]` marker (N is the page's real 1-based position, exactly as pdfjs-dist enumerated it —
 * never renumbered or guessed) so page boundaries/numbers survive into the extracted text, per this
 * module's page-boundary-preservation requirement. A page with no extractable text (blank or
 * image-only) contributes no marker and no content — never a fabricated "[Page N]" for a page with
 * nothing real to show under it, and never a change to the existing "an all-blank document produces
 * an empty string" behaviour.
 */
export function buildMarkdownFromPdfPages(pages: PdfPageTextItem[][]): string {
  const pageBlocks: string[] = [];
  pages.forEach((page, pageIndex) => {
    const blocks: string[] = [];
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
    if (blocks.length > 0) {
      pageBlocks.push([`[Page ${pageIndex + 1}]`, ...blocks].join('\n\n'));
    }
  });
  return pageBlocks
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** mammoth already maps Word's built-in Heading 1-6 styles to h1-h6 by default (matched by raw
 * style id, e.g. `p.Heading1 => h1:fresh` — see mammoth's own default style map), so that
 * structure is preserved with no configuration needed. Title/Subtitle are NOT in mammoth's default
 * map, even though they're just as common a real document's own heading structure (e.g. a cover
 * page), so this small, additive styleMap (mammoth merges it with the default map, never replaces
 * it) covers those two extra built-in Word styles — nothing invented, just recognising more of the
 * document's own real structure. Exported so a test can verify it directly against mammoth's own
 * (Node-compatible) buffer-input API — see this module's own test file for why DOCX extraction is
 * tested at this boundary rather than through extractMarkdownFromDocx/extractContentFromFile
 * end-to-end (mammoth's package.json splits Node vs. browser builds via the legacy `browser` field,
 * which this app's Vite-bundled browser build correctly resolves but this repo's Node-based Vitest
 * runner structurally cannot — a real environment limitation, not a defect in this code; the Import
 * Centre's browser smoke test is the actual end-to-end coverage for the real File → mammoth path). */
export const DOCX_STYLE_MAP = ["p[style-name='Title'] => h1:fresh", 'p.Title => h1:fresh', "p[style-name='Subtitle'] => h2:fresh", 'p.Subtitle => h2:fresh'];

/** HTML -> Markdown (turndown) — split out from extractMarkdownFromDocx as its own function so
 * it's directly testable on a raw HTML string, with no mammoth or File involved at all. The
 * intermediate HTML a caller passes in is never rendered anywhere — only the resulting plain
 * Markdown string is ever returned or stored. */
export async function htmlToMarkdown(html: string): Promise<string> {
  const { default: TurndownService } = await import('turndown');
  const turndownService = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
  return normalizeText(turndownService.turndown(html));
}

/** DOCX -> HTML (mammoth) -> Markdown (htmlToMarkdown). */
async function extractMarkdownFromDocx(file: File): Promise<string> {
  const { default: mammoth } = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer }, { styleMap: DOCX_STYLE_MAP });
  return htmlToMarkdown(html);
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
  return normalizeText(buildMarkdownFromPdfPages(pages));
}

export interface ExtractedFileContent {
  format: ImportFileFormat;
  /** Markdown for markdown/docx/pdf; raw normalised text for .txt; a Markdown table for .csv
   * (see csvRowsToMarkdownTable); pretty-printed JSON text for .json (see JSON.stringify(parsed,
   * null, 2) below) — never reinterpreted beyond that reformatting. */
  text: string;
}

export type ExtractionOutcome = { status: 'ok'; content: ExtractedFileContent } | { status: 'error'; message: string };

/**
 * The PARSE pipeline stage and the whole module's one entry point that actually touches a `File`:
 * validates it, dispatches to the right extractor by extension, and returns either the extracted
 * {format, text} or a user-facing error message — never throws. Every extraction path is wrapped
 * in try/catch so a malformed/corrupted file degrades to a friendly error instead of an unhandled
 * exception. This is content-type-agnostic on purpose: it has no idea whether the caller intends
 * a note, a question bank, or anything else — that decision happens later, explicitly (see
 * suggestContentType / confirmImportedContent below).
 */
export async function extractContentFromFile(file: File, maxBytes: number = MAX_IMPORT_FILE_SIZE_BYTES): Promise<ExtractionOutcome> {
  const validation = validateImportFile(file, maxBytes);
  if (!validation.valid) return { status: 'error', message: validation.error! };

  try {
    let text: string;
    if (validation.format === 'markdown' || validation.format === 'text') {
      text = normalizeText(await file.text());
    } else if (validation.format === 'docx') {
      text = await extractMarkdownFromDocx(file);
    } else if (validation.format === 'csv') {
      text = csvRowsToMarkdownTable(parseCsvRows(await file.text()));
      if (isNearEmptyContent(text)) {
        return { status: 'error', message: 'This CSV file appears to be empty — please choose a different file.' };
      }
    } else if (validation.format === 'json') {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        return { status: 'error', message: INVALID_JSON_MESSAGE };
      }
      text = JSON.stringify(parsed, null, 2);
    } else {
      text = await extractMarkdownFromPdf(file);
      if (isNearEmptyContent(text)) {
        return { status: 'error', message: NEAR_EMPTY_PDF_MESSAGE };
      }
    }
    return { status: 'ok', content: { format: validation.format, text } };
  } catch {
    return { status: 'error', message: UNREADABLE_FILE_MESSAGE };
  }
}

// ============================================================================================
// Generic imported-content representation
// ============================================================================================

export interface ImportedContentProvenance {
  /** Present for file-derived items (`origin: 'import'`); absent for manually created ones
   * (`origin: 'manual'`) — there is no real file to name. */
  sourceFilename?: string;
  originalFormat?: ImportFileFormat;
  /** ISO timestamp of when this file was imported (not the source document's own date, if any). */
  importedAt: string;
  /** Freeform, user-supplied attribution/citation (e.g. "Official UPSC PDF, 2023 GS Paper I") —
   * NEVER auto-filled, inferred, or guessed: this app only ever claims a source it was actually
   * told, matching the same discipline the PYQ/generated-question architecture already applies
   * (see lib/types.ts's PyqProvenance/GeneratedProvenance). */
  sourceNote?: string;
  /** Distinguishes a real file import from a manually typed-in record (see
   * createManualImportedContent below) — added for the Working Bibliography stage, where a user
   * can either import a source file or catalogue a source by hand. A record saved before this
   * field existed has no `origin` at all; every reader treats that exactly like 'import', since
   * every item before this stage really did come from a file (see confirmImportedContent, the only
   * way to create an ImportedContent before createManualImportedContent existed). */
  origin?: 'import' | 'manual';
}

/**
 * The generic, content-type-agnostic slice of an item's metadata — organisation fields every
 * imported item can carry regardless of contentType (a research_document today; question banks,
 * bibliographies and other content types later — see the repository-organisation stage this was
 * added for). Never auto-filled, inferred, or guessed: both fields are only ever what a user
 * actually typed. The index signature keeps this a strict superset of the old
 * `Record<string, unknown>` shape, so any future content-type-specific field (e.g. a 'pyq'
 * import's {year, paper}) still fits here without another type redesign.
 */
export interface ImportedContentMetadata {
  /** User-assigned organisation tags. Matched case-insensitively by the repository search/filter
   * utilities (lib/importedContentRepository.ts) but stored/displayed exactly as typed. */
  tags?: string[];
  /** A single user-assigned organisation category (e.g. "Literature Review", "Fieldwork") —
   * freeform text, not a fixed enum. */
  category?: string;
  /** Optional link to a PhD Research Topic Area (lib/phdTopicArea.ts's PhdTopicArea.id) — reuses
   * this EXISTING metadata mechanism rather than a new relationship type, satisfying "Research ->
   * Topic Area -> Research Document/Notes/Bibliography" navigation directly: a Topic Area's linked
   * material is simply every ImportedContent item whose metadata.topicAreaId matches it. Never
   * auto-filled — set only when a user explicitly assigns a document to a Topic Area. */
  topicAreaId?: string;
  /** A short, user-written summary distinct from `rawContent` (the full body) — e.g. what a
   * repository card/table shows without opening the item. Never auto-filled, never derived from
   * rawContent. Lives in `metadata` (rather than a new top-level ImportedContent field) so it's
   * optional-by-construction and every existing reader that already treats a missing metadata as
   * "no extra info" continues to work unchanged. */
  description?: string;
  [key: string]: unknown;
}

/**
 * A single imported item, workspace-scoped and typed by ImportedContentType. This is a
 * REPRESENTATION only — nothing in this module persists an ImportedContent anywhere; see the
 * module header for exactly what stops where.
 */
export interface ImportedContent {
  id: string;
  workspaceId: WorkspaceKind;
  contentType: ImportedContentType;
  title: string;
  /** The extracted text exactly as extractContentFromFile produced it — never re-parsed or
   * silently restructured into questions, citations, etc. by this module. A future content-type-
   * specific conversion step would read this field, not replace how it got here. */
  rawContent: string;
  provenance: ImportedContentProvenance;
  /** ISO timestamp of the last real change to this item (title/content/metadata) — stamped fresh
   * on creation (equal to provenance.importedAt) and re-stamped by lib/store.ts's
   * updateImportedContent on every edit. Optional on the TYPE (not every existing item/fixture
   * carries one) so this addition never breaks an older record or test fixture; every reader
   * should fall back to provenance.importedAt for an item that predates this field — see
   * lib/importedContentRepository.ts's getContentUpdatedAt, the one place that fallback lives. */
  updatedAt?: string;
  /** Organisation metadata (tags/category) plus any future content-type-specific fields — see
   * ImportedContentMetadata. Optional so existing items imported before this field existed
   * continue to work unchanged: every reader here treats a missing `metadata` exactly like
   * `{ tags: [], category: undefined }` (see lib/importedContentRepository.ts). */
  metadata?: ImportedContentMetadata;
}

// ============================================================================================
// Pipeline: DETECT/SELECT CONTENT TYPE -> CONVERT -> PREVIEW -> CONFIRM
// ============================================================================================

/**
 * A conservative, filename-based SUGGESTION for which content type a file might be — nothing
 * more. This is the DETECT step, but it never silently decides: the result is meant to pre-select
 * an option a human still sees and can change (see ImportPreview.suggestedContentType), never to
 * skip straight to conversion. Defaults to 'note', the only content type with a real destination
 * today (see the module header). Keyword matching only — it never inspects file CONTENT to guess
 * (that would risk quietly reclassifying prose as "questions" from its wording alone, which is
 * exactly what this stage's own instructions rule out).
 */
export function suggestContentType(filename: string): ImportedContentType {
  const lower = filename.toLowerCase();
  if (/\bpyq\b|previous[\s_-]?year/.test(lower)) return 'pyq';
  if (/question[\s_-]?bank|\bmcq\b/.test(lower)) return 'question_bank';
  if (/descriptive|\bmains\b|\bessay\b/.test(lower)) return 'descriptive_questions';
  if (/bibliograph|citation|reference/.test(lower)) return 'bibliography';
  if (/research|thesis|literature[\s_-]?review/.test(lower)) return 'research_document';
  return 'note';
}

/**
 * The PREVIEW pipeline stage: what a future UI would show a user before they confirm anything —
 * extracted title/content plus a suggested (not yet final) content type. Producing a preview has
 * no side effects and persists nothing.
 */
export interface ImportPreview {
  sourceFilename: string;
  originalFormat: ImportFileFormat;
  suggestedContentType: ImportedContentType;
  title: string;
  content: string;
}

export function buildImportPreview(file: { name: string }, extracted: ExtractedFileContent): ImportPreview {
  return {
    sourceFilename: file.name,
    originalFormat: extracted.format,
    suggestedContentType: suggestContentType(file.name),
    title: deriveContentTitle(file.name, extracted.text),
    content: extracted.text,
  };
}

/**
 * The CONFIRM + CONVERT-TO-DOMAIN-STRUCTURE pipeline stage: turns a preview into a real
 * ImportedContent record — but ONLY given an explicit, caller-supplied `contentType` and
 * `workspaceId`. There is no default content type here and the preview's own suggestion is never
 * applied automatically: whatever calls this must have gotten an explicit confirmation (from a
 * user, in any future UI) for the exact `contentType` it passes in. `title`/`rawContent` can be
 * overridden too, since a user reviewing the preview should be able to edit them before saving —
 * exactly like Notes import already lets someone edit the pre-filled note before clicking Save.
 */
export function confirmImportedContent(
  preview: ImportPreview,
  options: {
    workspaceId: WorkspaceKind;
    contentType: ImportedContentType;
    title?: string;
    content?: string;
    sourceNote?: string;
    metadata?: ImportedContentMetadata;
    importedAt?: string;
  },
): ImportedContent {
  const now = options.importedAt ?? new Date().toISOString();
  return {
    id: uuid(),
    workspaceId: options.workspaceId,
    contentType: options.contentType,
    title: options.title ?? preview.title,
    rawContent: options.content ?? preview.content,
    provenance: {
      sourceFilename: preview.sourceFilename,
      originalFormat: preview.originalFormat,
      importedAt: now,
      sourceNote: options.sourceNote,
      origin: 'import',
    },
    metadata: options.metadata,
    updatedAt: now,
  };
}

/**
 * The other way an ImportedContent can come to exist: typed in by hand, with no source file at
 * all (e.g. manually cataloguing a bibliography record — see the Working Bibliography stage this
 * was added for). Mirrors confirmImportedContent's construction exactly (same id/provenance/
 * metadata shape, same "caller must explicitly supply workspaceId/contentType/title" discipline —
 * still nothing here invents a title or content), but stamps `provenance.origin: 'manual'` and
 * leaves sourceFilename/originalFormat unset, since there is no file to name.
 */
export function createManualImportedContent(options: {
  workspaceId: WorkspaceKind;
  contentType: ImportedContentType;
  title: string;
  content?: string;
  metadata?: ImportedContentMetadata;
  sourceNote?: string;
  createdAt?: string;
}): ImportedContent {
  const now = options.createdAt ?? new Date().toISOString();
  return {
    id: uuid(),
    workspaceId: options.workspaceId,
    contentType: options.contentType,
    title: options.title,
    rawContent: options.content ?? '',
    provenance: {
      importedAt: now,
      sourceNote: options.sourceNote,
      origin: 'manual',
    },
    metadata: options.metadata,
    updatedAt: now,
  };
}

// ============================================================================================
// Retrieval helpers over an ImportedContent[] collection (see lib/store.ts's `importedContent`
// field — already workspace-scoped by construction, so these never need a workspace parameter:
// whatever array a caller has is already that workspace's own content, exactly like `notes`).
// ============================================================================================

export function selectImportedContentByType(items: readonly ImportedContent[], contentType: ImportedContentType): ImportedContent[] {
  return items.filter((item) => item.contentType === contentType);
}

export function getImportedContentById(items: readonly ImportedContent[], id: string): ImportedContent | undefined {
  return items.find((item) => item.id === id);
}
