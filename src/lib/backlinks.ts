// Premium Knowledge Editor, Phase 5F — backlinks, built entirely on the EXISTING
// lib/contentRelationships.ts model (a 'links_to' relationship per resolved wiki-link — see that
// module's own header for why it's a distinct type from 'cites'/'supports'/'related_to'). Nothing
// here is a second relationship store: this module only (a) computes what 'links_to' relationships
// a note/document's CURRENT wiki-links imply (diffWikiLinkRelationships, called once on explicit
// Save — never per keystroke, see lib/wikiLinks.ts's own header on why) and (b) reads them back out
// as a display-ready Backlink list (getBacklinks), with a snippet computed on the fly from the
// source's own live text — never stored, never cached, so it can never go stale.
import type { ContentRelationship, RelationshipEntityType } from './contentRelationships';
import type { Note } from './types';
import type { ImportedContent } from './contentImport';
import type { WorkspaceKind } from './workspace';
import { extractWikiLinks, type ResolvedWikiLink } from './wikiLinks';
import { effectiveImportedContentWorkspaceId, effectiveNoteWorkspaceId } from './repository';

export interface WikiLinkRelationshipDiff {
  /** New 'links_to' relationships to create (one per resolved target this source doesn't already
   * point at). Deduplicated by (targetId, targetType) — a wiki-link repeated twice in the same note
   * only ever produces one relationship, matching addContentRelationship's own dedup discipline. */
  toAdd: { targetId: string; targetType: RelationshipEntityType }[];
  /** Ids of existing 'links_to' relationships FROM this source that no longer match any resolved
   * link in the current text — safe to delete (the link was removed or edited away). */
  toRemoveIds: string[];
}

/**
 * Pure diff between a note/document's CURRENTLY resolved wiki-links and its EXISTING 'links_to'
 * relationships — the one function Notes.tsx's Save handler calls to know exactly what to add/
 * remove via the store's existing addContentRelationship/deleteContentRelationship actions. Only
 * ever touches relationships whose source is (sourceId, sourceType) in `workspaceId` — never
 * another item's relationships, never another workspace's.
 */
export function diffWikiLinkRelationships(
  sourceId: string,
  sourceType: RelationshipEntityType,
  resolvedLinks: readonly ResolvedWikiLink[],
  existingRelationships: readonly ContentRelationship[],
  workspaceId: WorkspaceKind,
): WikiLinkRelationshipDiff {
  const desired = new Map<string, { targetId: string; targetType: RelationshipEntityType }>();
  for (const link of resolvedLinks) {
    if (link.resolution.status !== 'resolved') continue; // ambiguous/unresolved links create nothing
    const key = `${link.resolution.targetType}:${link.resolution.targetId}`;
    desired.set(key, { targetId: link.resolution.targetId, targetType: link.resolution.targetType });
  }

  const existingLinksFromSource = existingRelationships.filter(
    (r) => r.workspaceId === workspaceId && r.sourceId === sourceId && r.sourceType === sourceType && r.type === 'links_to',
  );
  const existingKeys = new Set(existingLinksFromSource.map((r) => `${r.targetType}:${r.targetId}`));

  const toAdd = [...desired.entries()].filter(([key]) => !existingKeys.has(key)).map(([, value]) => value);
  const toRemoveIds = existingLinksFromSource.filter((r) => !desired.has(`${r.targetType}:${r.targetId}`)).map((r) => r.id);

  return { toAdd, toRemoveIds };
}

export interface Backlink {
  relationshipId: string;
  sourceId: string;
  sourceType: RelationshipEntityType;
  sourceTitle: string;
  /** A short excerpt of the source's own text around the wiki-link, computed fresh every call —
   * undefined only if the source's own text no longer contains a resolvable link to this target
   * (e.g. it was just deleted and the relationship hasn't been cleaned up yet). */
  snippet?: string;
}

function extractSnippet(text: string, tokenStart: number, tokenEnd: number, radius = 40): string {
  const start = Math.max(0, tokenStart - radius);
  const end = Math.min(text.length, tokenEnd + radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`;
}

/**
 * Every 'links_to' relationship pointing AT (targetId, targetType) within `workspaceId` — what
 * Notes.tsx / RepositoryDetail.tsx's BacklinksPanel renders. Workspace-scoped exactly like every
 * other relationship query in this app; a relationship from a different (archived-away) workspace
 * is never returned even if ids happened to coincide.
 */
export function getBacklinks(
  targetId: string,
  targetType: RelationshipEntityType,
  relationships: readonly ContentRelationship[],
  notes: readonly Note[],
  importedContent: readonly ImportedContent[],
  workspaceId: WorkspaceKind,
): Backlink[] {
  const incoming = relationships.filter(
    (r) => r.workspaceId === workspaceId && r.targetId === targetId && r.targetType === targetType && r.type === 'links_to',
  );

  return incoming
    .map((r): Backlink | null => {
      const sourceNote = r.sourceType === 'note' ? notes.find((n) => n.id === r.sourceId && effectiveNoteWorkspaceId(n) === workspaceId) : undefined;
      const sourceContent =
        r.sourceType === 'imported_content'
          ? importedContent.find((c) => c.id === r.sourceId && effectiveImportedContentWorkspaceId(c) === workspaceId)
          : undefined;
      const sourceTitle = sourceNote?.title ?? sourceContent?.title;
      if (sourceTitle === undefined) return null; // the source no longer exists — nothing honest to show

      const sourceText = sourceNote?.content ?? sourceContent?.rawContent ?? '';
      const resolved = extractWikiLinks(sourceText, { notes, importedContent, workspaceId });
      const match = resolved.find(
        (link) => link.resolution.status === 'resolved' && link.resolution.targetId === targetId && link.resolution.targetType === targetType,
      );
      const snippet = match ? extractSnippet(sourceText, match.token.start, match.token.end) : undefined;

      return { relationshipId: r.id, sourceId: r.sourceId, sourceType: r.sourceType, sourceTitle, snippet };
    })
    .filter((b): b is Backlink => b !== null);
}
