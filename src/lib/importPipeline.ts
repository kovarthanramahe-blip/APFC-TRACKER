// Premium Knowledge Workspace — Phase 1: the reusable import ABSTRACTION a future import UI can
// call as a single step, composing pieces that already exist and are unchanged by this module:
//   - extractContentFromFile / buildImportPreview (lib/contentImport.ts) — unchanged PARSE+PREVIEW.
//   - sha256Hex (lib/fileHash.ts) — new, deterministic source-byte hashing.
//   - findDuplicates (lib/importDuplicates.ts) — new, workspace-scoped duplicate detection.
//
// runFileImport's job is to hide those implementation details (pdfjs/mammoth/turndown, hashing,
// duplicate matching) behind one small result shape a UI layer can act on, without that UI layer
// needing to know HOW extraction or hashing work. It never persists anything and never calls
// confirmImportedContent itself — saving remains an explicit, separate step a caller takes once a
// human has reviewed this outcome (preview + any duplicate warning), matching "never silently
// overwrite an existing document" and "no import modal redesign yet" for this phase: this module
// is deliberately not wired into any .tsx file yet.

import { extractContentFromFile, buildImportPreview, type ImportPreview, type ImportedContent } from './contentImport';
import { sha256Hex } from './fileHash';
import { findDuplicates, type DuplicateMatchResult } from './importDuplicates';
import type { WorkspaceKind } from './workspace';

export interface ImportOutcome {
  status: 'ok' | 'error';
  filename: string;
  mimeType: string;
  size: number;
  /** Present only when status is 'error' — the same user-facing message extractContentFromFile
   * itself produces (unsupported type, oversized, malformed/corrupted, empty, etc). */
  error?: string;
  /** The extracted preview (title/content/suggested type) — present only when status is 'ok'. A
   * caller wanting to save this must still call confirmImportedContent explicitly, passing this
   * preview plus `sourceHash`/`size` below through its own sourceHash/sourceFileSize options. */
  preview?: ImportPreview;
  /** SHA-256 of the file's own raw bytes (see lib/fileHash.ts), when it could be computed. Absent
   * (never fabricated) if hashing itself failed for some reason — duplicate detection below simply
   * falls back to its filename+size comparison in that case. */
  sourceHash?: string;
  /** Duplicate-detection result against `existing`, scoped to `workspaceId` — present only when
   * status is 'ok'. Always non-blocking information for the caller to act on; this module never
   * blocks or skips an import on its own. */
  duplicates?: DuplicateMatchResult;
}

/**
 * Runs a file through PARSE -> PREVIEW -> HASH -> DUPLICATE-CHECK as one step. `existing` is the
 * caller's full set of already-imported items (any workspace) — this function scopes duplicate
 * comparison to `workspaceId` itself, so callers never need to pre-filter by workspace.
 */
export async function runFileImport(
  file: File,
  existing: readonly ImportedContent[],
  workspaceId: WorkspaceKind,
  maxBytes?: number,
): Promise<ImportOutcome> {
  const extraction = await extractContentFromFile(file, maxBytes);
  if (extraction.status === 'error') {
    return { status: 'error', filename: file.name, mimeType: file.type, size: file.size, error: extraction.message };
  }

  const preview = buildImportPreview(file, extraction.content);

  // Hashing is best-effort and never blocks the import: a rare read failure just means duplicate
  // detection falls back to the filename+size check instead of the stronger hash comparison (see
  // lib/importDuplicates.ts's own handling of a missing sourceHash).
  let sourceHash: string | undefined;
  try {
    sourceHash = await sha256Hex(file);
  } catch {
    sourceHash = undefined;
  }

  const duplicates = findDuplicates(existing, workspaceId, {
    sourceFilename: file.name,
    sourceHash,
    sourceFileSize: file.size,
  });

  return {
    status: 'ok',
    filename: file.name,
    mimeType: file.type,
    size: file.size,
    preview,
    sourceHash,
    duplicates,
  };
}
