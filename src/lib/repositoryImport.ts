import { uuid } from './utils';
import { WORKSPACES, type WorkspaceKind } from './workspace';
import { IMPORTED_CONTENT_TYPES, type ImportedContent, type ImportedContentType, type ImportedContentMetadata, type ImportedContentProvenance } from './contentImport';
import { RELATIONSHIP_TYPES, RELATIONSHIP_ENTITY_TYPES, type ContentRelationship, type RelationshipEntityType, type RelationshipType } from './contentRelationships';
import type { Note } from './types';
import { REPOSITORY_EXPORT_KIND, REPOSITORY_EXPORT_SCHEMA_VERSION, type RepositoryExportSnapshot } from './repository';

// Repository Import / Restore.
//
// BACKUP JSON -> READ -> VALIDATE -> PREVIEW -> USER CONFIRMS -> ADD TO CURRENT WORKSPACE.
//
// This module is the READ/VALIDATE/PREVIEW pipeline, entirely pure functions — no store access,
// no side effects, nothing here mutates anything. It consumes exactly the shape
// lib/repository.ts's own buildRepositoryExportSnapshot/serializeRepositoryExportSnapshot already
// produce (REPOSITORY_EXPORT_KIND + REPOSITORY_EXPORT_SCHEMA_VERSION, added in that module for
// exactly this purpose) — there is no second export format here, only a reader for the existing one.
//
// This is an ADDITIVE restore only: nothing here ever removes, overwrites, or merges into an
// existing record. A colliding id gets a freshly generated one instead (see buildRepositoryImportPlan
// below); the existing destination record is never read for its content, only for its id, so it is
// never at risk of being touched.
//
// The actual store mutation (lib/store.ts's applyRepositoryImportPlan) is a single, dumb merge of
// the arrays this module prepares — "prepare the complete result first, then apply it as one store
// update" per this stage's own requirement. Every piece of decision-making (validation, collision
// detection, id remapping, which relationships to skip) happens here, in testable pure functions,
// never in the store action itself.

// ============================================================================================
// VALIDATE
// ============================================================================================

export type RepositoryBackupValidationErrorReason =
  | 'invalid_json'
  | 'not_repository_export'
  | 'unsupported_schema_version'
  | 'invalid_workspace'
  | 'invalid_metadata'
  | 'invalid_notes'
  | 'invalid_imported_content'
  | 'invalid_relationships';

export type ValidateRepositoryBackupResult = { status: 'ok'; snapshot: RepositoryExportSnapshot } | { status: 'error'; reason: RepositoryBackupValidationErrorReason; message: string };

const VALIDATION_MESSAGES: Record<RepositoryBackupValidationErrorReason, string> = {
  invalid_json: 'This file is not valid JSON.',
  not_repository_export: 'This file was not produced by a Repository export — it is missing the expected format marker.',
  unsupported_schema_version: 'This backup was exported by a newer or otherwise unsupported version of the Repository export format.',
  invalid_workspace: 'This backup does not name a valid workspace.',
  invalid_metadata: 'This backup is missing required export metadata (such as when it was created).',
  invalid_notes: 'This backup contains malformed Note records.',
  invalid_imported_content: 'This backup contains malformed imported-content records.',
  invalid_relationships: 'This backup contains malformed relationship records.',
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isValidWorkspaceId(value: unknown): value is WorkspaceKind {
  return typeof value === 'string' && WORKSPACES.some((w) => w.id === value);
}

function isValidContentType(value: unknown): value is ImportedContentType {
  return typeof value === 'string' && (IMPORTED_CONTENT_TYPES as readonly string[]).includes(value);
}

function isValidRelationshipEntityType(value: unknown): value is RelationshipEntityType {
  return typeof value === 'string' && (RELATIONSHIP_ENTITY_TYPES as readonly string[]).includes(value);
}

function isValidRelationshipType(value: unknown): value is RelationshipType {
  return typeof value === 'string' && (RELATIONSHIP_TYPES as readonly string[]).includes(value);
}

function hasDuplicateIds(records: readonly { id: string }[]): boolean {
  const seen = new Set<string>();
  for (const r of records) {
    if (seen.has(r.id)) return true;
    seen.add(r.id);
  }
  return false;
}

/** Structural validation only — the same discipline lib/contentImport.ts's own validators use
 * (never inspects/interprets content, only checks shape). Every existing field the Note model
 * carries; `subject`/`topicId`/`workspaceId` are intentionally checked loosely (any non-empty
 * string for `subject`, since Note.subject spans multiple syllabi and this module has no business
 * enumerating them) rather than re-deriving lib/types.ts's own subject registry here. */
function isValidRawNote(value: unknown): value is Note {
  if (!isPlainObject(value)) return false;
  if (!isNonEmptyString(value.id)) return false;
  if (typeof value.title !== 'string') return false;
  if (typeof value.content !== 'string') return false;
  if (!isNonEmptyString(value.subject)) return false;
  if (typeof value.createdAt !== 'string' || typeof value.updatedAt !== 'string') return false;
  if (typeof value.pinned !== 'boolean') return false;
  if (value.topicId !== undefined && typeof value.topicId !== 'string') return false;
  if (value.workspaceId !== undefined && !isValidWorkspaceId(value.workspaceId)) return false;
  return true;
}

function isValidProvenance(value: unknown): value is ImportedContentProvenance {
  if (!isPlainObject(value)) return false;
  if (typeof value.importedAt !== 'string') return false;
  if (value.sourceFilename !== undefined && typeof value.sourceFilename !== 'string') return false;
  if (value.originalFormat !== undefined && typeof value.originalFormat !== 'string') return false;
  if (value.sourceNote !== undefined && typeof value.sourceNote !== 'string') return false;
  if (value.origin !== undefined && value.origin !== 'import' && value.origin !== 'manual') return false;
  return true;
}

function isValidMetadata(value: unknown): value is ImportedContentMetadata {
  if (value === undefined) return true;
  if (!isPlainObject(value)) return false;
  if (value.tags !== undefined && !(Array.isArray(value.tags) && value.tags.every((t) => typeof t === 'string'))) return false;
  if (value.category !== undefined && typeof value.category !== 'string') return false;
  return true;
}

function isValidRawImportedContent(value: unknown): value is ImportedContent {
  if (!isPlainObject(value)) return false;
  if (!isNonEmptyString(value.id)) return false;
  if (!isValidWorkspaceId(value.workspaceId)) return false;
  if (!isValidContentType(value.contentType)) return false;
  if (typeof value.title !== 'string') return false;
  if (typeof value.rawContent !== 'string') return false;
  if (!isValidProvenance(value.provenance)) return false;
  if (!isValidMetadata(value.metadata)) return false;
  return true;
}

function isValidRawRelationship(value: unknown): value is ContentRelationship {
  if (!isPlainObject(value)) return false;
  if (!isNonEmptyString(value.id)) return false;
  if (!isValidWorkspaceId(value.workspaceId)) return false;
  if (!isNonEmptyString(value.sourceId)) return false;
  if (!isValidRelationshipEntityType(value.sourceType)) return false;
  if (!isNonEmptyString(value.targetId)) return false;
  if (!isValidRelationshipEntityType(value.targetType)) return false;
  if (!isValidRelationshipType(value.type)) return false;
  if (typeof value.createdAt !== 'string') return false;
  return true;
}

/**
 * The one entry point that turns raw file text into a trusted RepositoryExportSnapshot, or a
 * typed rejection — never throws. Checked in order: valid JSON, the export format marker (`kind`),
 * a supported schema version, a valid workspace identity, then every Note/ImportedContent/
 * relationship record's own structural shape, then no duplicate ids within any one collection (a
 * well-formed export can never have one — lib/repository.ts's own buildRepositoryExportSnapshot
 * only ever emits unique-by-id arrays — so a duplicate here means the file was hand-edited or
 * corrupted, and the whole file is rejected rather than guessing which copy to keep). Relationship
 * ENDPOINT resolution (does sourceId/targetId actually name a record in this same backup) is
 * deliberately NOT checked here — that is a per-relationship business rule handled by
 * buildRepositoryImportPlan below, which skips just the offending relationship rather than
 * rejecting the entire backup over it (see this module's header).
 */
export function validateRepositoryBackupJson(json: string): ValidateRepositoryBackupResult {
  function reject(reason: RepositoryBackupValidationErrorReason): ValidateRepositoryBackupResult {
    return { status: 'error', reason, message: VALIDATION_MESSAGES[reason] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return reject('invalid_json');
  }

  if (!isPlainObject(parsed)) return reject('not_repository_export');
  if (parsed.kind !== REPOSITORY_EXPORT_KIND) return reject('not_repository_export');
  if (parsed.schemaVersion !== REPOSITORY_EXPORT_SCHEMA_VERSION) return reject('unsupported_schema_version');
  if (!isValidWorkspaceId(parsed.workspaceId)) return reject('invalid_workspace');
  if (typeof parsed.exportedAt !== 'string' || Number.isNaN(Date.parse(parsed.exportedAt))) return reject('invalid_metadata');

  if (!Array.isArray(parsed.notes) || !parsed.notes.every(isValidRawNote)) return reject('invalid_notes');
  if (hasDuplicateIds(parsed.notes)) return reject('invalid_notes');

  if (!Array.isArray(parsed.importedContent) || !parsed.importedContent.every(isValidRawImportedContent)) return reject('invalid_imported_content');
  if (hasDuplicateIds(parsed.importedContent)) return reject('invalid_imported_content');

  if (!Array.isArray(parsed.relationships) || !parsed.relationships.every(isValidRawRelationship)) return reject('invalid_relationships');
  if (hasDuplicateIds(parsed.relationships)) return reject('invalid_relationships');

  return {
    status: 'ok',
    snapshot: {
      kind: REPOSITORY_EXPORT_KIND,
      schemaVersion: REPOSITORY_EXPORT_SCHEMA_VERSION,
      workspaceId: parsed.workspaceId,
      exportedAt: parsed.exportedAt,
      notes: parsed.notes,
      importedContent: parsed.importedContent,
      relationships: parsed.relationships,
    },
  };
}

// ============================================================================================
// PREVIEW / PLAN — collision detection, id remapping, relationship endpoint rewriting. Produces
// the exact arrays lib/store.ts's applyRepositoryImportPlan will append, so preview and apply can
// never disagree with each other (there is only ever one plan object, read in both places).
// ============================================================================================

export type SkippedRelationshipReason = 'self_link' | 'endpoint_not_in_backup';

export interface SkippedRelationship {
  relationship: ContentRelationship;
  reason: SkippedRelationshipReason;
}

export interface RepositoryImportPlan {
  sourceWorkspaceId: WorkspaceKind;
  destinationWorkspaceId: WorkspaceKind;
  /** Ready to append exactly as-is — ids already remapped where they collided, workspaceId already
   * stamped to the destination, every other field (content, timestamps, provenance, metadata)
   * preserved unchanged from the backup. */
  notesToAdd: Note[];
  importedContentToAdd: ImportedContent[];
  relationshipsToAdd: ContentRelationship[];
  noteCollisionCount: number;
  importedContentCollisionCount: number;
  relationshipCollisionCount: number;
  skippedRelationships: SkippedRelationship[];
}

export interface RepositoryImportDestination {
  workspaceId: WorkspaceKind;
  existingNotes: readonly Note[];
  existingImportedContent: readonly ImportedContent[];
  existingRelationships: readonly ContentRelationship[];
}

function endpointKey(type: RelationshipEntityType, id: string): string {
  return `${type}:${id}`;
}

/**
 * Builds the complete, ready-to-apply import plan from a validated snapshot — pure, deterministic
 * given the same inputs (aside from the fresh ids it must generate for genuine collisions, which
 * are never re-derivable and never need to be: a fresh id is correct precisely because it is new).
 *
 * ID collision handling (this stage's own rule): an item whose id ALREADY exists among the
 * destination's own records (by id, within its own collection — notes vs notes, imported content
 * vs imported content, relationships vs relationships) gets a freshly generated id instead of ever
 * touching the existing record; every relationship endpoint referencing a remapped id is rewritten
 * to point at the new one. An item whose id does not collide keeps its original id — restoring the
 * SAME backup into an EMPTY destination therefore reproduces the original ids exactly.
 *
 * Relationships are only ever added when BOTH endpoints resolve to a record actually present in
 * this backup (never a dangling reference) and the relationship is not a self-link; anything else
 * is recorded in `skippedRelationships` with why, never silently dropped.
 */
export function buildRepositoryImportPlan(snapshot: RepositoryExportSnapshot, destination: RepositoryImportDestination): RepositoryImportPlan {
  const existingNoteIds = new Set(destination.existingNotes.map((n) => n.id));
  const existingImportedContentIds = new Set(destination.existingImportedContent.map((c) => c.id));
  const existingRelationshipIds = new Set(destination.existingRelationships.map((r) => r.id));

  const idRemap = new Map<string, string>(); // endpointKey(type, oldId) -> newId, for collided items only

  let noteCollisionCount = 0;
  const notesToAdd: Note[] = snapshot.notes.map((note) => {
    const collided = existingNoteIds.has(note.id);
    if (!collided) return { ...note, workspaceId: destination.workspaceId };
    noteCollisionCount++;
    const newId = uuid();
    idRemap.set(endpointKey('note', note.id), newId);
    return { ...note, id: newId, workspaceId: destination.workspaceId };
  });

  let importedContentCollisionCount = 0;
  const importedContentToAdd: ImportedContent[] = snapshot.importedContent.map((item) => {
    const collided = existingImportedContentIds.has(item.id);
    if (!collided) return { ...item, workspaceId: destination.workspaceId };
    importedContentCollisionCount++;
    const newId = uuid();
    idRemap.set(endpointKey('imported_content', item.id), newId);
    return { ...item, id: newId, workspaceId: destination.workspaceId };
  });

  // Endpoints are validated against what the BACKUP itself contains (never against the live
  // destination, which is a different, larger universe of ids that happens to overlap only by
  // coincidence — see the module header on why that overlap is exactly what "collision" means).
  const backupNoteIds = new Set(snapshot.notes.map((n) => n.id));
  const backupImportedContentIds = new Set(snapshot.importedContent.map((c) => c.id));

  function resolvesInBackup(type: RelationshipEntityType, id: string): boolean {
    return type === 'note' ? backupNoteIds.has(id) : backupImportedContentIds.has(id);
  }

  let relationshipCollisionCount = 0;
  const relationshipsToAdd: ContentRelationship[] = [];
  const skippedRelationships: SkippedRelationship[] = [];

  for (const relationship of snapshot.relationships) {
    if (relationship.sourceId === relationship.targetId && relationship.sourceType === relationship.targetType) {
      skippedRelationships.push({ relationship, reason: 'self_link' });
      continue;
    }
    if (!resolvesInBackup(relationship.sourceType, relationship.sourceId) || !resolvesInBackup(relationship.targetType, relationship.targetId)) {
      skippedRelationships.push({ relationship, reason: 'endpoint_not_in_backup' });
      continue;
    }

    const newSourceId = idRemap.get(endpointKey(relationship.sourceType, relationship.sourceId)) ?? relationship.sourceId;
    const newTargetId = idRemap.get(endpointKey(relationship.targetType, relationship.targetId)) ?? relationship.targetId;

    const idCollides = existingRelationshipIds.has(relationship.id);
    if (idCollides) relationshipCollisionCount++;
    const finalId = idCollides ? uuid() : relationship.id;

    relationshipsToAdd.push({
      ...relationship,
      id: finalId,
      workspaceId: destination.workspaceId,
      sourceId: newSourceId,
      targetId: newTargetId,
    });
  }

  return {
    sourceWorkspaceId: snapshot.workspaceId,
    destinationWorkspaceId: destination.workspaceId,
    notesToAdd,
    importedContentToAdd,
    relationshipsToAdd,
    noteCollisionCount,
    importedContentCollisionCount,
    relationshipCollisionCount,
    skippedRelationships,
  };
}
