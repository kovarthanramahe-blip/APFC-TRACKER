import type { WorkspaceKind } from './workspace';
import { uuid } from './utils';

// PhD Research — repository relationships. A minimal, generic relationship model connecting any
// two entities in the PhD Research repository by their STABLE IDS, never by title, filename, tag,
// DOI, or text similarity (those change, or can coincide between two different items; ids don't —
// every relationship is the direct result of an explicit user action, never inferred).
//
// Originally built for ImportedContent <-> ImportedContent (bibliography <-> research document —
// see the Working Bibliography / Source <-> Research Document Linking stages). This stage extends
// it to also connect Notes (lib/types.ts's Note, a SEPARATE collection from ImportedContent — see
// lib/store.ts's `notes` field) WITHOUT converting a Note into an ImportedContent and WITHOUT a
// second relationship model: each relationship endpoint now explicitly carries an entity TYPE
// ('imported_content' | 'note') alongside its id, so the exact same ContentRelationship shape,
// store fields, persistence, and query functions serve both kinds of link. A bare id is never
// enough to know which collection to look it up in — two independently-generated uuids (a Note's
// and an ImportedContent's) are never guaranteed distinct by construction, so every lookup here
// takes id+type together, never id alone.
//
// Workspace isolation is enforced at the one place that actually matters: createRelationship takes
// CALLER-supplied pools of ids that are valid within the relationship's own workspace, one pool per
// entity type (see lib/store.ts's addContentRelationship, which passes `state.importedContent`'s
// and `state.notes`' own ids — both only ever hold the ACTIVE workspace's items, the same invariant
// every workspace-owned collection already relies on). An id belonging to a different, currently
// archived-away workspace's content is therefore never a member of the relevant pool and is
// rejected — this module itself never needs to know about workspaces beyond stamping the id it was
// given onto the result.

export const RELATIONSHIP_TYPES = ['cites', 'supports', 'related_to'] as const;
export type RelationshipType = (typeof RELATIONSHIP_TYPES)[number];

export const RELATIONSHIP_TYPE_LABELS: Record<RelationshipType, string> = {
  cites: 'Cites',
  supports: 'Supports',
  related_to: 'Related to',
};

/** Which collection an endpoint's id belongs to — 'imported_content' for lib/contentImport.ts's
 * ImportedContent (research documents, bibliography records, …), 'note' for lib/types.ts's Note. */
export const RELATIONSHIP_ENTITY_TYPES = ['imported_content', 'note'] as const;
export type RelationshipEntityType = (typeof RELATIONSHIP_ENTITY_TYPES)[number];

export interface RelationshipEndpoint {
  id: string;
  type: RelationshipEntityType;
}

export interface ContentRelationship {
  id: string;
  workspaceId: WorkspaceKind;
  /** The entity this relationship points FROM — a stable id plus which collection it belongs to
   * (see the module header — never a title or filename, and never id alone). */
  sourceId: string;
  sourceType: RelationshipEntityType;
  /** The entity this relationship points TO — same rule. */
  targetId: string;
  targetType: RelationshipEntityType;
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

/** The caller-supplied pools createRelationship validates endpoints against — one id set per
 * entity type, each already scoped to the relationship's own workspace by the caller (see the
 * module header and lib/store.ts's addContentRelationship). */
export interface ValidRelationshipEndpoints {
  importedContentIds: ReadonlySet<string>;
  noteIds: ReadonlySet<string>;
}

function poolFor(pools: ValidRelationshipEndpoints, type: RelationshipEntityType): ReadonlySet<string> {
  return type === 'note' ? pools.noteIds : pools.importedContentIds;
}

function endpointsMatch(a: RelationshipEndpoint, b: RelationshipEndpoint): boolean {
  return a.id === b.id && a.type === b.type;
}

export function isDuplicateRelationship(
  existing: readonly ContentRelationship[],
  source: RelationshipEndpoint,
  target: RelationshipEndpoint,
  type: RelationshipType,
): boolean {
  return existing.some(
    (r) => r.sourceId === source.id && r.sourceType === source.type && r.targetId === target.id && r.targetType === target.type && r.type === type,
  );
}

/**
 * The one place a ContentRelationship is ever constructed. `pools` must contain exactly the ids
 * that genuinely belong to `input.workspaceId`, one set per entity type — see the module header for
 * why this is how cross-workspace relationships are rejected, rather than this module inspecting
 * workspaces itself. Checks, in order: self-link (same id AND same type — an id that merely
 * coincides across a Note and an ImportedContent is NOT a self-link, since they are different
 * entities), source existence, target existence, duplicate. Never throws — every rejection is a
 * typed result a caller can show to a user.
 */
export function createRelationship(
  existing: readonly ContentRelationship[],
  pools: ValidRelationshipEndpoints,
  input: { workspaceId: WorkspaceKind; source: RelationshipEndpoint; target: RelationshipEndpoint; type: RelationshipType; createdAt?: string },
): CreateRelationshipResult {
  function reject(reason: CreateRelationshipRejectionReason): CreateRelationshipResult {
    return { status: 'error', reason, message: REJECTION_MESSAGES[reason] };
  }

  if (endpointsMatch(input.source, input.target)) return reject('self_link');
  if (!poolFor(pools, input.source.type).has(input.source.id)) return reject('invalid_source');
  if (!poolFor(pools, input.target.type).has(input.target.id)) return reject('invalid_target');
  if (isDuplicateRelationship(existing, input.source, input.target, input.type)) return reject('duplicate');

  return {
    status: 'ok',
    relationship: {
      id: uuid(),
      workspaceId: input.workspaceId,
      sourceId: input.source.id,
      sourceType: input.source.type,
      targetId: input.target.id,
      targetType: input.target.type,
      type: input.type,
      createdAt: input.createdAt ?? new Date().toISOString(),
    },
  };
}

export function deleteRelationship(existing: readonly ContentRelationship[], id: string): ContentRelationship[] {
  return existing.filter((r) => r.id !== id);
}

export function getOutgoingRelationships(existing: readonly ContentRelationship[], entityId: string, entityType: RelationshipEntityType): ContentRelationship[] {
  return existing.filter((r) => r.sourceId === entityId && r.sourceType === entityType);
}

export function getIncomingRelationships(existing: readonly ContentRelationship[], entityId: string, entityType: RelationshipEntityType): ContentRelationship[] {
  return existing.filter((r) => r.targetId === entityId && r.targetType === entityType);
}

export interface RelatedContentEntry {
  relationship: ContentRelationship;
  direction: 'outgoing' | 'incoming';
  /** The OTHER entity's id — the relationship's targetId for an outgoing entry, its sourceId for
   * an incoming one — exactly what a UI needs to look the related item up by. */
  relatedId: string;
  /** Which collection `relatedId` belongs to — needed to know whether to resolve it against
   * importedContent or notes. */
  relatedType: RelationshipEntityType;
}

/** Every relationship touching `(entityId, entityType)`, in either direction, paired with which
 * direction it is and the OTHER entity's id+type — the one lookup every "Linked ..." section in
 * pages/WorkingBibliography.tsx, pages/PhdResearch.tsx and pages/Notes.tsx builds on. */
export function getRelatedContent(existing: readonly ContentRelationship[], entityId: string, entityType: RelationshipEntityType): RelatedContentEntry[] {
  const outgoing = getOutgoingRelationships(existing, entityId, entityType).map((relationship) => ({
    relationship,
    direction: 'outgoing' as const,
    relatedId: relationship.targetId,
    relatedType: relationship.targetType,
  }));
  const incoming = getIncomingRelationships(existing, entityId, entityType).map((relationship) => ({
    relationship,
    direction: 'incoming' as const,
    relatedId: relationship.sourceId,
    relatedType: relationship.sourceType,
  }));
  return [...outgoing, ...incoming];
}
