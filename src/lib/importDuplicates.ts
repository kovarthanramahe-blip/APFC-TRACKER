// Premium Knowledge Workspace — Phase 1: workspace-scoped duplicate detection for the file import
// pipeline. Two confidence tiers only, per explicit product decision — no fuzzy/ranking matching:
//
//   - EXACT duplicate: another ImportedContent in the SAME workspace whose provenance.sourceHash
//     (see lib/fileHash.ts) equals the file being imported's own hash. Byte-for-byte identical
//     source file — the highest possible confidence.
//   - POSSIBLE duplicate: another ImportedContent in the SAME workspace with the same
//     provenance.sourceFilename AND the same provenance.sourceFileSize, surfaced ONLY when no hash
//     comparison was possible (i.e. no exact match was found) — a same-name/same-size file is
//     circumstantial evidence, not proof, so this is always a non-blocking warning, never a block.
//
// Never compares across workspaces — apfc/upsc_cse/phd_research each have their own bibliography
// and repository, and a document imported into one workspace is never "the same document" as one
// in another for this purpose, matching this app's existing workspace-isolation discipline
// throughout lib/store.ts. Never mutates anything: this module only reads `existing` and returns a
// plain result for the caller to act on (warn, block, or let the user decide).

import type { ImportedContent } from './contentImport';
import type { Note } from './types';

export interface DuplicateMatchResult {
  /** The single existing item whose sourceHash exactly matches, or null if none. When present, the
   * caller should treat this as a confirmed duplicate (never silently overwritten — see
   * lib/importPipeline.ts). */
  exactMatch: ImportedContent | null;
  /** Existing items sharing the same filename + file size, surfaced only when `exactMatch` is null
   * (a confirmed exact match makes a "possible" match redundant noise). Always a non-blocking
   * warning — never used to block or auto-merge an import. */
  possibleMatches: ImportedContent[];
}

/**
 * Finds duplicate candidates for a file being imported into `workspaceId`, among `existing` items
 * already in that same workspace. `existing` may safely contain items from OTHER workspaces too
 * (e.g. the caller's full store slice) — this function filters to `workspaceId` itself before
 * comparing, so callers never need to pre-filter.
 *
 * `sourceHash`/`sourceFileSize` are the NEW file's own hash (see lib/fileHash.ts's sha256Hex) and
 * byte size — both optional because a hash is only available when a real File's bytes were
 * actually read (never fabricated). Passing neither always yields an empty result: with nothing to
 * compare, there is nothing to warn about.
 */
export function findDuplicates(
  existing: readonly ImportedContent[],
  workspaceId: ImportedContent['workspaceId'],
  candidate: { sourceFilename?: string; sourceHash?: string; sourceFileSize?: number },
): DuplicateMatchResult {
  const sameWorkspace = existing.filter((item) => item.workspaceId === workspaceId);

  const exactMatch = candidate.sourceHash
    ? (sameWorkspace.find((item) => item.provenance.sourceHash === candidate.sourceHash) ?? null)
    : null;

  if (exactMatch) {
    return { exactMatch, possibleMatches: [] };
  }

  const possibleMatches =
    candidate.sourceFilename !== undefined && candidate.sourceFileSize !== undefined
      ? sameWorkspace.filter(
          (item) =>
            item.provenance.sourceFilename === candidate.sourceFilename &&
            item.provenance.sourceFileSize === candidate.sourceFileSize,
        )
      : [];

  return { exactMatch: null, possibleMatches };
}

export interface NoteDuplicateMatchResult {
  exactMatch: Note | null;
  possibleMatches: Note[];
}

/**
 * The same exact/possible duplicate model as findDuplicates above, for pages/Notes.tsx's own file
 * import (lib/noteImport.ts) — a SEPARATE function rather than a generic one shared with
 * findDuplicates because Note carries sourceHash/sourceFileSize/sourceFilename as flat, additive
 * fields (see lib/types.ts's Note) rather than ImportedContent's nested `provenance` object; the
 * comparison logic itself is identical. Scoped to `workspaceId` exactly like findDuplicates — a
 * note with no workspaceId at all (created before Multi-Workspace OS Stage 2) never matches here,
 * which only means its duplicate goes undetected, never a false positive.
 */
export function findNoteDuplicates(
  existingNotes: readonly Note[],
  workspaceId: Note['workspaceId'],
  candidate: { sourceFilename?: string; sourceHash?: string; sourceFileSize?: number },
): NoteDuplicateMatchResult {
  const sameWorkspace = existingNotes.filter((note) => note.workspaceId === workspaceId);

  const exactMatch = candidate.sourceHash ? (sameWorkspace.find((note) => note.sourceHash === candidate.sourceHash) ?? null) : null;

  if (exactMatch) {
    return { exactMatch, possibleMatches: [] };
  }

  const possibleMatches =
    candidate.sourceFilename !== undefined && candidate.sourceFileSize !== undefined
      ? sameWorkspace.filter((note) => note.sourceFilename === candidate.sourceFilename && note.sourceFileSize === candidate.sourceFileSize)
      : [];

  return { exactMatch: null, possibleMatches };
}
