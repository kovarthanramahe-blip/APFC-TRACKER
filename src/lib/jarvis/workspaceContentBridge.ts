// Knowledge Librarian / JARVIS — source-grounded retrieval over REAL workspace content.
//
// jarvis/documents/types.ts's own header states that subsystem is deliberately independent of,
// and never imports, lib/contentImport.ts's ImportedContent model or lib/types.ts's Note — "a
// JarvisDocument is a NEW concept for AI-facing document intelligence, not a replacement for or
// extension of the existing Repository content model... avoids coupling JARVIS's own evolution to
// the Repository's, and vice versa." This file honours that boundary at the SOURCE level: it
// never edits, and jarvis/documents/*.ts never imports from, lib/contentImport.ts or lib/types.ts.
// Instead, this is a separate, additive BRIDGE living above both sides — the normal shape of an
// integration layer, not a violation of either subsystem's own purity. jarvis/documents/*'s own
// architectural-boundary tests (phase7ArchitecturalBoundary.test.ts etc.) therefore stay true
// unchanged: this file is not one of the files they assert over.
//
// What this closes: jarvis/documents/retrieval.ts's keywordSearchChunks and
// jarvis/documents/documentQuestion.ts's buildEvidenceForQuestion are real, deterministic,
// provider-free retrieval — but until this file, nothing fed them a real Note or ImportedContent's
// actual text. This module is the missing glue: given the active workspace's own Notes and
// ImportedContent (exactly what useActiveWorkspaceGroundingData.ts / the store already expose),
// chunk each item's own text via the EXISTING jarvis/documents/ingestion.ts chunker (no new
// chunking logic), then retrieve cited evidence via the EXISTING retrieval/evidence pipeline (no
// new ranking logic). No AI provider call anywhere in this file — this is the fully
// provider-independent half of "source-grounded retrieval"; phrasing the retrieved evidence into a
// natural-language answer (jarvis/ai/documentGroundingPrompt.ts's buildDocumentGroundedMessages,
// already built) is a separate, later step this file does not perform.
import type { Note } from '../types';
import type { ImportedContent } from '../contentImport';
import type { WorkspaceKind } from '../workspace';
import { listNotesForWorkspace, listImportedContentForWorkspace } from '../repository';
import { buildDocumentChunks } from './documents/ingestion';
import type { JarvisDocumentChunk } from './documents/types';
import { buildEvidenceForQuestion, type JarvisDocumentEvidence } from './documents/documentQuestion';
import type { JarvisDocumentRetrievalQuery } from './documents/retrieval';

export type WorkspaceContentItemType = 'note' | 'imported_content';

export interface WorkspaceContentRef {
  itemType: WorkspaceContentItemType;
  itemId: string;
}

/** The one place a workspace-content documentId is built — `${itemType}:${itemId}`. A Note's id
 * and an ImportedContent's id are two independently-generated uuids, never guaranteed distinct by
 * construction (the same fact lib/contentRelationships.ts's own header already states); prefixing
 * by type, exactly like that module's own RelationshipEndpoint convention, makes a collision
 * between the two collections structurally impossible rather than merely unlikely. */
export function toWorkspaceDocumentId(ref: WorkspaceContentRef): string {
  return `${ref.itemType}:${ref.itemId}`;
}

/** The exact inverse of toWorkspaceDocumentId — returns `undefined` for a documentId that isn't
 * one of this bridge's own two known-prefix shapes (never guesses, never throws). */
export function fromWorkspaceDocumentId(documentId: string): WorkspaceContentRef | undefined {
  const separatorIndex = documentId.indexOf(':');
  if (separatorIndex === -1) return undefined;
  const itemType = documentId.slice(0, separatorIndex);
  const itemId = documentId.slice(separatorIndex + 1);
  if ((itemType !== 'note' && itemType !== 'imported_content') || !itemId) return undefined;
  return { itemType, itemId };
}

/**
 * Chunks every Note and ImportedContent item belonging to `workspaceId` through the EXISTING
 * jarvis/documents/ingestion.ts chunker (buildDocumentChunks), tagging each resulting chunk's
 * `documentId` with this bridge's own type-prefixed convention. Workspace-scoped via the same
 * listNotesForWorkspace/listImportedContentForWorkspace lib/repository.ts already uses everywhere
 * else — never a second, divergent workspace-filtering rule. An item with empty/whitespace-only
 * text simply yields no chunks for it (buildDocumentChunks' own contract) — never a fabricated
 * chunk. Pure and synchronous: no store access, no I/O, no AI call.
 */
export function buildWorkspaceDocumentChunks(notes: readonly Note[], importedContent: readonly ImportedContent[], workspaceId: WorkspaceKind): JarvisDocumentChunk[] {
  const chunks: JarvisDocumentChunk[] = [];

  for (const note of listNotesForWorkspace(notes, workspaceId)) {
    const documentId = toWorkspaceDocumentId({ itemType: 'note', itemId: note.id });
    chunks.push(...buildDocumentChunks({ documentId, extracted: { text: note.content, format: 'markdown' } }).chunks);
  }

  for (const item of listImportedContentForWorkspace(importedContent, workspaceId)) {
    const documentId = toWorkspaceDocumentId({ itemType: 'imported_content', itemId: item.id });
    chunks.push(...buildDocumentChunks({ documentId, extracted: { text: item.rawContent, format: 'markdown' } }).chunks);
  }

  return chunks;
}

/**
 * The one entry point a caller (a future JarvisChat/RepositoryDetail "ask about this" UI) needs:
 * chunks the active workspace's real content, then delegates straight to the EXISTING
 * buildEvidenceForQuestion (jarvis/documents/documentQuestion.ts) for retrieval + citation — no
 * new ranking/search logic of its own. `documentIds`, if given, must already be this bridge's own
 * prefixed ids (toWorkspaceDocumentId) to scope the search to specific items; omitted searches
 * every chunk in the workspace. Returns `[]` (never throws) for an empty/no-match workspace.
 */
export function retrieveWorkspaceEvidence(
  notes: readonly Note[],
  importedContent: readonly ImportedContent[],
  workspaceId: WorkspaceKind,
  query: Omit<JarvisDocumentRetrievalQuery, 'documentIds'> & { documentIds?: readonly string[] },
): JarvisDocumentEvidence[] {
  const chunks = buildWorkspaceDocumentChunks(notes, importedContent, workspaceId);
  return buildEvidenceForQuestion(chunks, query);
}

export interface WorkspaceDocumentTitle {
  itemType: WorkspaceContentItemType;
  itemId: string;
  title: string;
}

/**
 * Resolves a bridge documentId (as carried on a JarvisDocumentCitation) back to the real item's
 * own title, for display next to a citation — workspace-scoped exactly like resolution everywhere
 * else in this app (lib/wikiLinks.ts's resolveWikiLink, lib/backlinks.ts's getBacklinks). Returns
 * `undefined` (never fabricates a title) for a documentId that doesn't parse, or whose item no
 * longer exists, or belongs to a different workspace.
 */
export function resolveWorkspaceDocumentTitle(documentId: string, notes: readonly Note[], importedContent: readonly ImportedContent[], workspaceId: WorkspaceKind): WorkspaceDocumentTitle | undefined {
  const ref = fromWorkspaceDocumentId(documentId);
  if (!ref) return undefined;

  if (ref.itemType === 'note') {
    const note = listNotesForWorkspace(notes, workspaceId).find((n) => n.id === ref.itemId);
    return note ? { itemType: 'note', itemId: note.id, title: note.title } : undefined;
  }

  const item = listImportedContentForWorkspace(importedContent, workspaceId).find((c) => c.id === ref.itemId);
  return item ? { itemType: 'imported_content', itemId: item.id, title: item.title } : undefined;
}
