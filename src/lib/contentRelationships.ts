import type { WorkspaceKind } from './workspace';
import { uuid } from './utils';

// PhD Research — Source <-> Research Document Linking. A minimal, generic relationship model over
// ImportedContent records (lib/contentImport.ts): connects any two content items by their STABLE
// IDS, never by title or filename (those change; ids don't, and two different items can share a
// title/filename anyway). Built for linking Working Bibliography records to research documents
// first, but deliberately not specific to either content type — the same model can later connect
// two research documents, or a bibliography record to another, without a redesign. Nothing here
// ever infers a relationship from filenames, titles, DOI, or text — every relationship is the
// direct result of an explicit user action (see pages/WorkingBibliography.tsx's "link" UI).
//
// Workspace isolation is enforced at the one place that actually matters: createRelationship takes
// a CALLER-supplied set of ids that are valid within the relationship's own workspace (see
// lib/store.ts's addContentRelationship, which passes `state.importedContent`'s own ids —
// `importedContent` only ever holds the ACTIVE workspace's items, the same invariant every other
// workspace-owned collection already relies on). A sourceId/targetId belonging to a different,
// currently-archived-away workspace's content is therefore never a member of that set and is
// rejected — this module itself never needs to know about workspaces beyond stamping the id it was
// given onto the result.

export const RELATIONSHIP_TYPES = ['cites', 'supports', 'related_to'] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const RELATIONSHIP_TYPE_LABELS: Record<RelationshipType, string> = {
  cites: 'Cites',
  supports: 'Supports',
  related_to: 'Related to',
};

export interface ContentRelationship {
  id: string;
  workspaceId: WorkspaceKind;
  /** The content item this relationship points FROM — a stable ImportedContent id (see the module
   * header — never a title or filename). */
  sourceId: string;
  /** The content item this relationship points TO — same rule. */
  targetId: string;
  type: RelationshipType;
  createdAt: string;
}

export type CreateRelationshipRejectionReason = 'self_link' | 'duplicate' | 'invalid_source' | 'invalid_target';

export type CreateRelationshipResult =
  | { status: 'ok'; relationship: ContentRelationship }
  | { status: 'error'; reason: CreateRelationshipRejectionReason; message: string };

const REJECTION_MESSAGES: Record<CreateRelationshipRejectionReason, string> = {
  self_link: 'A content item cannot be linked to itself.',
  duplicate: 'This relationship already exists.',
  invalid_source: 'The source content does not exist in this workspace.',
  invalid_target: 'The target content does not exist in this workspace.',
};

export function isDuplicateRelationship(existing: readonly ContentRelationship[], sourceId: string, targetId: string, type: RelationshipType): boolean {
  return existing.some((r) => r.sourceId === sourceId && r.targetId === targetId && r.type === type);
}

/**
 * The one place a ContentRelationship is ever constructed. `validContentIds` must be exactly the
 * set of ImportedContent ids that genuinely belong to `input.workspaceId` — see the module header
 * for why this is how cross-workspace relationships are rejected, rather than this module
 * inspecting workspaces itself. Checks, in order: self-link, source existence, target existence,
 * duplicate. Never throws — every rejection is a typed result a caller can show to a user.
 */
export function createRelationship(
  existing: readonly ContentRelationship[],
  validContentIds: ReadonlySet<string>,
  input: { workspaceId: WorkspaceKind; sourceId: string; targetId: string; type: RelationshipType; createdAt?: string },
): CreateRelationshipResult {
  function reject(reason: CreateRelationshipRejectionReason): CreateRelationshipResult {
    return { status: 'error', reason, message: REJECTION_MESSAGES[reason] };
  }

  if (input.sourceId === input.targetId) return reject('self_link');
  if (!validContentIds.has(input.sourceId)) return reject('invalid_source');
  if (!validContentIds.has(input.targetId)) return reject('invalid_target');
  if (isDuplicateRelationship(existing, input.sourceId, input.targetId, input.type)) return reject('duplicate');

  return {
    status: 'ok',
    relationship: {
      id: uuid(),
      workspaceId: input.workspaceId,
      sourceId: input.sourceId,
      targetId: input.targetId,
      type: input.type,
      createdAt: input.createdAt ?? new Date().toISOString(),
    },
  };
}

export function deleteRelationship(existing: readonly ContentRelationship[], id: string): ContentRelationship[] {
  return existing.filter((r) => r.id !== id);
}

export function getOutgoingRelationships(existing: readonly ContentRelationship[], contentId: string): ContentRelationship[] {
  return existing.filter((r) => r.sourceId === contentId);
}

export function getIncomingRelationships(existing: readonly ContentRelationship[], contentId: string): ContentRelationship[] {
  return existing.filter((r) => r.targetId === contentId);
}

export interface RelatedContentEntry {
  relationship: ContentRelationship;
  direction: 'outgoing' | 'incoming';
  /** The OTHER content item's id — the relationship's targetId for an outgoing entry, its sourceId
   * for an incoming one — exactly what a UI needs to look the related item up by. */
  relatedId: string;
}

/** Every relationship touching `contentId`, in either direction, paired with which direction it is
 * and the id of the OTHER content item — the one lookup pages/WorkingBibliography.tsx and
 * pages/PhdResearch.tsx both build their "Linked ..." sections on. */
export function getRelatedContent(existing: readonly ContentRelationship[], contentId: string): RelatedContentEntry[] {
  const outgoing = getOutgoingRelationships(existing, contentId).map((relationship) => ({
    relationship,
    direction: 'outgoing' as const,
    relatedId: relationship.targetId,
  }));
  const incoming = getIncomingRelationships(existing, contentId).map((relationship) => ({
    relationship,
    direction: 'incoming' as const,
    relatedId: relationship.sourceId,
  }));
  return [...outgoing, ...incoming];
}
