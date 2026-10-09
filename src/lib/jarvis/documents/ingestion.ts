// JARVIS Phase 7 — document ingestion foundation.
//
// Provider-independent: no AI API, no cloud call, no paid service, no GPU, no Docker, no model
// download anywhere in this file. Every extractor below reads only the bytes it is given and
// returns plain text — the only "intelligence" is a few conservative, deterministic heuristics
// (heading detection, scanned-PDF detection), never an AI call.
//
// Deliberately independent of lib/contentImport.ts (the Repository/Knowledge Library's own
// import pipeline) — see documents/types.ts's own header for why the two subsystems are kept
// separate. This file DOES reuse the same already-installed libraries contentImport.ts uses
// (pdfjs-dist, mammoth, turndown — see package.json; no new dependency was added for this phase),
// because those are the smallest effective tools already proven to work in this exact codebase,
// not because the two subsystems share code.
//
// PDF implementation note: contentImport.ts's own PDF path loads pdfjs-dist's standard (worker-
// based) build via a Vite-only `?url` asset import, which cannot run under this repo's Node-based
// Vitest — confirmed by that module's own test file, which tests only its pure text-to-Markdown
// heuristic (buildMarkdownFromPdfPages), never the full file-extraction path, end to end. This
// file instead uses pdfjs-dist's LEGACY build, whose worker is disabled automatically the moment
// it detects a Node.js environment — verified empirically (see this phase's own report) to run
// correctly under plain Node, which lets PDF ingestion be genuinely tested end-to-end here rather
// than left as an unverified "trust the browser" path.
// The tradeoff (parsing on the main thread/module scope instead of a worker) is deliberately
// accepted for a foundation phase handling occasional, bounded document ingestion, not a
// high-frequency operation.
//
// DOCX implementation note: mammoth genuinely does resolve under plain Node (confirmed
// empirically), but its Node-build API takes `{ path }`/`{ buffer }`, not the browser build's
// `{ arrayBuffer }` — so calling it the same way the browser bundle does would silently exercise
// a DIFFERENT code path under Vitest than the one that actually runs in the shipped app, which
// would be worse than not testing it at all. This file therefore follows contentImport.ts's own
// precedent exactly: the mammoth-dependent extraction call is real, implemented code, verified
// only by manual/browser testing (not by this phase's Vitest suite); the HTML-to-Markdown step
// that follows it (turndown only, no mammoth) IS fully unit-tested, since it has no such split.
import type { JarvisDocumentChunk, JarvisDocumentSection } from './types';
import { buildHierarchicalSummarizationPlan, type JarvisSummarizationPlan } from './summarizationStrategy';

// ================================================================================================
// Source + format detection
// ================================================================================================

export type JarvisDocumentFormat = 'text' | 'markdown' | 'pdf' | 'docx';

/** The ingestion pipeline's input — raw bytes plus the metadata needed to classify them. Never a
 * browser `File` specifically (so this stays testable with a plain ArrayBuffer in Node); a
 * caller with a real `File` passes `await file.arrayBuffer()`. */
export interface JarvisDocumentSource {
  filename: string;
  mimeType: string;
  data: ArrayBuffer;
}

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown', '.mdx']);

/** Detects format from MIME type first, filename extension second — never throws, never guesses
 * past these two signals. Returns `'unsupported'` for anything else (see
 * JarvisDocumentIngestionError's own `'unsupported'` capability). */
export function detectDocumentFormat(source: Pick<JarvisDocumentSource, 'mimeType' | 'filename'>): JarvisDocumentFormat | 'unsupported' {
  const extMatch = source.filename.toLowerCase().match(/\.[a-z0-9]+$/);
  const ext = extMatch?.[0] ?? '';

  if (source.mimeType === 'application/pdf' || ext === '.pdf') return 'pdf';
  if (source.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === '.docx') return 'docx';
  if (source.mimeType === 'text/markdown' || MARKDOWN_EXTENSIONS.has(ext)) return 'markdown';
  if (source.mimeType === 'text/plain' || ext === '.txt') return 'text';
  return 'unsupported';
}

// ================================================================================================
// Extracted document + ingestion result contracts
// ================================================================================================

export interface JarvisExtractedPage {
  pageNumber: number;
  text: string;
}

export interface JarvisExtractedDocument {
  title?: string;
  format: JarvisDocumentFormat;
  /** Full extracted text, concatenated in reading order — NOT yet normalised (see
   * normalizeExtractedText); callers that only need display text should normalise it themselves. */
  text: string;
  /** Present only for a format with a real page concept (PDF) — never fabricated for one that
   * doesn't have pages. */
  pages?: JarvisExtractedPage[];
}

/** The four explicit capability states this phase's brief requires — an unsupported file is
 * NEVER silently treated as successfully processed; it is always one of these four, never a
 * success with empty content standing in for failure. */
export type JarvisIngestionCapability = 'unsupported' | 'needs_ocr' | 'parse_error';

export interface JarvisDocumentIngestionError {
  capability: JarvisIngestionCapability;
  /** Safe, human-readable message — never a raw parser exception/stack trace. */
  message: string;
}

export type JarvisDocumentIngestionResult = { status: 'ok'; document: JarvisExtractedDocument } | { status: 'error'; error: JarvisDocumentIngestionError };

function stripExtension(filename: string): string {
  return filename.replace(/\.[a-z0-9]+$/i, '');
}

function firstMarkdownHeading(text: string): string | undefined {
  const match = text.match(/^#{1,6}\s+(.+)$/m);
  return match?.[1]?.trim();
}

// ================================================================================================
// Plain text / Markdown ingestion (Part 3)
// ================================================================================================

function bytesToUtf8Text(data: ArrayBuffer): string {
  return new TextDecoder('utf-8').decode(data);
}

export async function ingestTextSource(source: JarvisDocumentSource): Promise<JarvisDocumentIngestionResult> {
  const text = bytesToUtf8Text(source.data);
  return { status: 'ok', document: { text, format: 'text', title: stripExtension(source.filename) } };
}

export async function ingestMarkdownSource(source: JarvisDocumentSource): Promise<JarvisDocumentIngestionResult> {
  const text = bytesToUtf8Text(source.data);
  return { status: 'ok', document: { text, format: 'markdown', title: firstMarkdownHeading(text) ?? stripExtension(source.filename) } };
}

// ================================================================================================
// PDF ingestion (Part 4)
// ================================================================================================

/** Below this many non-whitespace characters across the WHOLE document, extracted PDF text is
 * treated as not meaningful — almost certainly a scanned/image-only PDF pdfjs could locate no
 * real text layer for. Mirrors the conservative threshold lib/contentImport.ts's own
 * isNearEmptyContent already uses for the same signal (never OCR — just an honest "needs_ocr"). */
const MEANINGFUL_PDF_TEXT_MIN_LENGTH = 20;

export function isLikelyScannedPdf(pages: readonly JarvisExtractedPage[]): boolean {
  const meaningfulLength = pages.reduce((sum, page) => sum + page.text.replace(/\s+/g, '').length, 0);
  return meaningfulLength < MEANINGFUL_PDF_TEXT_MIN_LENGTH;
}

/**
 * Non-embedded (standard 14) fonts need pdfjs-dist's own bundled font-metrics files to compute
 * glyph widths — without this, extraction throws rather than silently returning wrong text.
 * Resolved dynamically, at runtime, only under Node (where this phase's own tests run): walks up
 * from the already-imported legacy build's own file location to the package root, then into its
 * shipped `standard_fonts/` directory. Returns `undefined` outside Node (e.g. a future browser
 * call site), which is an honest, disclosed limitation — see this file's own header — rather than
 * a guessed URL that would silently fail a real fetch.
 */
async function resolveNodeStandardFontDataUrl(): Promise<string | undefined> {
  if (typeof process === 'undefined' || !process.versions?.node) return undefined;
  try {
    const { fileURLToPath, pathToFileURL } = await import('node:url');
    const path = await import('node:path');
    const pdfEntryPath = fileURLToPath(import.meta.resolve('pdfjs-dist/legacy/build/pdf.mjs'));
    const packageRoot = path.join(path.dirname(pdfEntryPath), '..', '..');
    return pathToFileURL(`${path.join(packageRoot, 'standard_fonts')}${path.sep}`).href;
  } catch {
    return undefined;
  }
}

/**
 * Wave 4A browser-compatibility fix — empirically verified (a real Chromium browser, via
 * Playwright, driving this exact module) to be REQUIRED: pdfjs-dist's PDFWorker only auto-disables
 * itself under Node (see this function's own caller's header). In a genuine browser it instead
 * throws `Error: No "GlobalWorkerOptions.workerSrc" specified.` the moment getDocument() is
 * called — this was never exercised by this phase's own Vitest suite (which only ever runs under
 * Node), so it went undetected until a real browser run. Fixed the same, already-proven way
 * lib/contentImport.ts's own (separate, standard-build) PDF path already resolves its worker: a
 * Vite-only `?url` asset import giving a real, servable URL to pdfjs-dist's own shipped worker
 * file — reused here for the LEGACY build's own worker instead of a new one. Scoped to the
 * non-Node branch only, so the existing, already-passing Node/Vitest path (and every assertion in
 * ingestion.test.ts) is byte-for-byte unchanged.
 */
async function configureBrowserPdfWorkerIfNeeded(pdfjsLib: typeof import('pdfjs-dist/legacy/build/pdf.mjs')): Promise<void> {
  if (typeof process !== 'undefined' && process.versions?.node) return;
  const workerUrl = (await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
}

async function extractPdfPages(data: ArrayBuffer): Promise<JarvisExtractedPage[]> {
  // See this file's own header for why the LEGACY build is used here rather than
  // contentImport.ts's worker-based one. No `disableWorker` option is passed (pdfjs-dist has no
  // such typed parameter) — its own PDFWorker already disables the worker thread automatically
  // whenever it detects a Node.js environment, which is exactly the behaviour this needs.
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  await configureBrowserPdfWorkerIfNeeded(pdfjsLib);
  const standardFontDataUrl = await resolveNodeStandardFontDataUrl();
  const pdf = await pdfjsLib.getDocument({ data, useWorkerFetch: false, standardFontDataUrl }).promise;

  const pages: JarvisExtractedPage[] = [];
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const text = textContent.items.map((item) => ('str' in item ? item.str : '')).join(' ');
    pages.push({ pageNumber: pageNum, text });
  }
  return pages;
}

export async function ingestPdfSource(source: JarvisDocumentSource): Promise<JarvisDocumentIngestionResult> {
  let pages: JarvisExtractedPage[];
  try {
    pages = await extractPdfPages(source.data);
  } catch {
    return { status: 'error', error: { capability: 'parse_error', message: 'Could not parse this PDF file.' } };
  }

  if (isLikelyScannedPdf(pages)) {
    return {
      status: 'error',
      error: { capability: 'needs_ocr', message: 'This PDF has no extractable text layer — it may be a scanned/image-only document. OCR is not performed.' },
    };
  }

  const text = pages.map((page) => `[Page ${page.pageNumber}]\n\n${page.text}`).join('\n\n');
  return { status: 'ok', document: { text, pages, format: 'pdf', title: stripExtension(source.filename) } };
}

// ================================================================================================
// DOCX ingestion (Part 5)
// ================================================================================================

/** mammoth's own default style map already covers Heading 1-6; this small, additive map covers
 * Word's built-in Title/Subtitle styles too — the exact same map contentImport.ts already uses
 * (duplicated rather than imported, per this file's own header on subsystem independence). */
export const DOCX_STYLE_MAP = ["p[style-name='Title'] => h1:fresh", 'p.Title => h1:fresh', "p[style-name='Subtitle'] => h2:fresh", 'p.Subtitle => h2:fresh'];

async function extractDocxHtml(data: ArrayBuffer): Promise<string> {
  const { default: mammoth } = await import('mammoth');
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer: data }, { styleMap: DOCX_STYLE_MAP });
  return html;
}

/** HTML -> Markdown only (turndown) — no mammoth involved, so (unlike extractDocxHtml) this is
 * fully exercised by this phase's own Vitest suite. */
export async function htmlToMarkdownText(html: string): Promise<string> {
  const { default: TurndownService } = await import('turndown');
  const turndownService = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-' });
  return turndownService.turndown(html);
}

export async function ingestDocxSource(source: JarvisDocumentSource): Promise<JarvisDocumentIngestionResult> {
  let html: string;
  try {
    html = await extractDocxHtml(source.data);
  } catch {
    return { status: 'error', error: { capability: 'parse_error', message: 'Could not parse this DOCX file.' } };
  }
  const markdown = await htmlToMarkdownText(html);
  return { status: 'ok', document: { text: markdown, format: 'docx', title: firstMarkdownHeading(markdown) ?? stripExtension(source.filename) } };
}

// ================================================================================================
// Dispatcher + supported-file contract (Part 11)
// ================================================================================================

export async function ingestDocumentSource(source: JarvisDocumentSource): Promise<JarvisDocumentIngestionResult> {
  const format = detectDocumentFormat(source);
  switch (format) {
    case 'text':
      return ingestTextSource(source);
    case 'markdown':
      return ingestMarkdownSource(source);
    case 'pdf':
      return ingestPdfSource(source);
    case 'docx':
      return ingestDocxSource(source);
    case 'unsupported':
      return { status: 'error', error: { capability: 'unsupported', message: `Unsupported file type: ${source.mimeType || source.filename}.` } };
  }
}

// ================================================================================================
// Normalisation (Part 6)
// ================================================================================================

/** Deterministic, whitespace-only normalisation — NEVER alters words or meaning. Collapses
 * Windows/old-Mac line endings to `\n`, strips trailing whitespace per line, collapses 3+
 * consecutive blank lines down to exactly one (preserving the paragraph boundary itself, never
 * removing it entirely), and trims the ends. */
export function normalizeExtractedText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ================================================================================================
// Chunking (Part 7)
// ================================================================================================

/** Bounded for later local-model inference — small enough that several chunks plus a question
 * still fit comfortably in a modest local model's context window, large enough to avoid
 * fragmenting a paragraph's own meaning across many tiny chunks. */
export const DEFAULT_MAX_CHUNK_CHARS = 1200;

/** Splits already-normalised text into bounded, paragraph-respecting chunks. Never splits a
 * paragraph mid-sentence by character count alone — a single paragraph longer than `maxChars`
 * becomes its own (oversized) chunk rather than being cut arbitrarily, since a silent mid-
 * sentence cut would be a worse retrieval unit than an oversized-but-coherent one. Never produces
 * an empty chunk: blank input (or input that is only whitespace) yields `[]`. */
export function chunkText(text: string, maxChars: number = DEFAULT_MAX_CHUNK_CHARS): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: string[] = [];
  let current = '';
  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (current && candidate.length > maxChars) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

interface HeadingSection {
  id: string;
  title?: string;
  text: string;
}

/** Splits normalised text with no page structure into sections by Markdown-style `#`..`######`
 * headings. Text before the first heading (or the whole document, if it has no headings at all)
 * becomes one untitled section — never discarded. An all-blank document produces `[]`. */
function splitByHeadings(documentId: string, text: string): HeadingSection[] {
  if (!text.trim()) return [];

  const sections: HeadingSection[] = [];
  let currentTitle: string | undefined;
  let currentLines: string[] = [];
  let sectionIndex = 0;

  const flush = () => {
    const sectionText = currentLines.join('\n').trim();
    if (sectionText) {
      sections.push({ id: `${documentId}::section-${sectionIndex}`, title: currentTitle, text: sectionText });
      sectionIndex += 1;
    }
  };

  for (const line of text.split('\n')) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flush();
      currentTitle = headingMatch[2].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  flush();

  return sections;
}

export interface BuildDocumentChunksInput {
  documentId: string;
  extracted: JarvisExtractedDocument;
  maxChunkChars?: number;
}

export interface BuildDocumentChunksResult {
  sections: JarvisDocumentSection[];
  chunks: JarvisDocumentChunk[];
}

/**
 * The main chunking entry point: turns one JarvisExtractedDocument into the existing
 * JarvisDocumentSection[]/JarvisDocumentChunk[] model (Phase 6's own contracts — never a
 * competing shape). A document WITH real pages (PDF) gets one section per non-empty page,
 * preserving `startPage`/`endPage` on every chunk; a document with no page concept (text/
 * markdown/docx-as-Markdown) gets sections derived from its own headings instead. Every chunk
 * keeps its `documentId`, a stable `id`, its `sectionId`, and a deterministic `order` — the same
 * input always produces the same sections/chunks, in the same order.
 */
export function buildDocumentChunks(input: BuildDocumentChunksInput): BuildDocumentChunksResult {
  const maxChars = input.maxChunkChars ?? DEFAULT_MAX_CHUNK_CHARS;
  const sections: JarvisDocumentSection[] = [];
  const chunks: JarvisDocumentChunk[] = [];
  let chunkOrder = 0;

  const pushChunksForSection = (sectionId: string, text: string, page?: number) => {
    for (const chunkBody of chunkText(text, maxChars)) {
      chunks.push({
        id: `${input.documentId}::chunk-${chunkOrder}`,
        documentId: input.documentId,
        sectionId,
        order: chunkOrder,
        text: chunkBody,
        startPage: page,
        endPage: page,
        tokenCountEstimate: Math.ceil(chunkBody.length / 4),
      });
      chunkOrder += 1;
    }
  };

  if (input.extracted.pages && input.extracted.pages.length > 0) {
    let sectionOrder = 0;
    for (const page of input.extracted.pages) {
      const normalized = normalizeExtractedText(page.text);
      if (!normalized) continue;
      const sectionId = `${input.documentId}::page-${page.pageNumber}`;
      sections.push({ id: sectionId, documentId: input.documentId, order: sectionOrder, startPage: page.pageNumber, endPage: page.pageNumber });
      sectionOrder += 1;
      pushChunksForSection(sectionId, normalized, page.pageNumber);
    }
    return { sections, chunks };
  }

  const headingSections = splitByHeadings(input.documentId, normalizeExtractedText(input.extracted.text));
  headingSections.forEach((section, index) => {
    sections.push({ id: section.id, documentId: input.documentId, title: section.title, order: index });
    pushChunksForSection(section.id, section.text);
  });

  return { sections, chunks };
}

// ================================================================================================
// Summarisation preparation (Part 10) — thin composition over Phase 6's own planner
// ================================================================================================

/** Ties ingestion output directly to Phase 6's existing buildHierarchicalSummarizationPlan —
 * no new planning logic, per this phase's own "do not generate summaries with an AI model yet;
 * build only the deterministic preparation layer" instruction. */
export function prepareSummarizationPlan(documentId: string, built: BuildDocumentChunksResult): JarvisSummarizationPlan {
  return buildHierarchicalSummarizationPlan(documentId, built.chunks, built.sections);
}
