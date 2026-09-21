// Notes file-import: turns an uploaded .md/.markdown/.docx/.pdf/.txt file into Markdown/plain text
// ready to drop into the existing Note model (lib/types.ts's Note.content is already a plain
// string — no schema change). This module is now a thin, Notes-specific wrapper around the
// reusable import foundation (lib/contentImport.ts) — every extraction/validation rule below is
// exactly the one defined there; nothing is duplicated. `deriveNoteTitle`'s only difference from
// the foundation's own `deriveContentTitle` is Notes' existing fallback wording ("Imported note"
// vs. the foundation's generic "Imported content") — everything else is a direct pass-through, so
// existing Notes import behaviour (and every test pinning it) is unchanged.
//
// Legacy .doc is deliberately never parsed — there is no reliable client-side library for the old
// binary format, so it's rejected with a clear message rather than attempted.
import {
  extractContentFromFile,
  validateImportFile as validateImportFileGeneric,
  getImportFileFormat,
  normalizeText,
  isNearEmptyContent,
  deriveContentTitle,
  buildMarkdownFromPdfPages,
  SUPPORTED_IMPORT_EXTENSIONS,
  MAX_IMPORT_FILE_SIZE_BYTES,
  type ImportFileFormat,
  type PdfPageTextItem,
} from './contentImport';

export { SUPPORTED_IMPORT_EXTENSIONS, MAX_IMPORT_FILE_SIZE_BYTES, isNearEmptyContent, buildMarkdownFromPdfPages, type PdfPageTextItem };

/** Kept as its own name for backward compatibility with existing callers/tests — identical values
 * to lib/contentImport.ts's ImportFileFormat (including 'text' for .txt). */
export type ImportFileKind = ImportFileFormat;
export const getImportFileKind = getImportFileFormat;

/** Normalises line endings/trailing whitespace — kept as its own name for backward compatibility;
 * identical to lib/contentImport.ts's normalizeText. */
export const normalizeMarkdownText = normalizeText;

export interface FileValidationResult {
  valid: boolean;
  kind: ImportFileKind;
  error?: string;
}

/** Same validation lib/contentImport.ts's validateImportFile performs — only the field name
 * differs (`kind`, not `format`), preserved for backward compatibility with existing callers. */
export function validateImportFile(file: { name: string; size: number }, maxBytes: number = MAX_IMPORT_FILE_SIZE_BYTES): FileValidationResult {
  const result = validateImportFileGeneric(file, maxBytes);
  return { valid: result.valid, kind: result.format, error: result.error };
}

/** Prefers the first Markdown heading in the extracted content; falls back to the filename with
 * its extension stripped, or "Imported note" if even that is unusable. */
export function deriveNoteTitle(filename: string, content: string): string {
  return deriveContentTitle(filename, content, 'Imported note');
}

export type ImportOutcome = { status: 'ok'; title: string; content: string } | { status: 'error'; message: string };

/**
 * The single entry point pages/Notes.tsx calls: extracts the file's content via the shared
 * foundation (lib/contentImport.ts), then derives a Notes-appropriate title — returning either a
 * ready-to-edit {title, content} pair or a user-facing error message. Never throws.
 */
export async function importNoteFile(file: File, maxBytes: number = MAX_IMPORT_FILE_SIZE_BYTES): Promise<ImportOutcome> {
  const result = await extractContentFromFile(file, maxBytes);
  if (result.status === 'error') return result;
  return { status: 'ok', title: deriveNoteTitle(file.name, result.content.text), content: result.content.text };
}
