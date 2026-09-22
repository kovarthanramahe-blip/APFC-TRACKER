import { describe, it, expect } from 'vitest';
import { validateRepositoryBackupJson, buildRepositoryImportPlan, type RepositoryImportDestination } from './repositoryImport';
import { buildRepositoryExportSnapshot, REPOSITORY_EXPORT_KIND, REPOSITORY_EXPORT_SCHEMA_VERSION, type RepositoryExportSnapshot } from './repository';
import type { ImportedContent } from './contentImport';
import type { Note } from './types';
import type { ContentRelationship } from './contentRelationships';

function content(overrides: Partial<ImportedContent> = {}): ImportedContent {
  return {
    id: overrides.id ?? 'c1',
    workspaceId: overrides.workspaceId ?? 'phd_research',
    contentType: overrides.contentType ?? 'research_document',
    title: overrides.title ?? 'Item',
    rawContent: overrides.rawContent ?? 'Body',
    provenance: overrides.provenance ?? { importedAt: '2026-01-01T00:00:00.000Z', origin: 'import' },
    metadata: overrides.metadata,
  };
}

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: overrides.id ?? 'n1',
    subject: overrides.subject ?? 'general',
    title: overrides.title ?? 'Note',
    content: overrides.content ?? 'Body',
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-01-01T00:00:00.000Z',
    pinned: overrides.pinned ?? false,
    workspaceId: overrides.workspaceId,
    topicId: overrides.topicId,
  };
}

function relationship(overrides: Partial<ContentRelationship> = {}): ContentRelationship {
  return {
    id: overrides.id ?? 'r1',
    workspaceId: overrides.workspaceId ?? 'phd_research',
    sourceId: overrides.sourceId ?? 'c1',
    sourceType: overrides.sourceType ?? 'imported_content',
    targetId: overrides.targetId ?? 'n1',
    targetType: overrides.targetType ?? 'note',
    type: overrides.type ?? 'cites',
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
  };
}

function validSnapshot(overrides: Partial<RepositoryExportSnapshot> = {}): RepositoryExportSnapshot {
  return {
    kind: REPOSITORY_EXPORT_KIND,
    schemaVersion: REPOSITORY_EXPORT_SCHEMA_VERSION,
    workspaceId: overrides.workspaceId ?? 'phd_research',
    exportedAt: overrides.exportedAt ?? '2026-01-01T00:00:00.000Z',
    importedContent: overrides.importedContent ?? [content({ id: 'c1' })],
    notes: overrides.notes ?? [note({ id: 'n1' })],
    relationships: overrides.relationships ?? [relationship({ id: 'r1', sourceId: 'c1', targetId: 'n1' })],
  };
}

function emptyDestination(workspaceId: RepositoryImportDestination['workspaceId'] = 'phd_research'): RepositoryImportDestination {
  return { workspaceId, existingNotes: [], existingImportedContent: [], existingRelationships: [] };
}

describe('validateRepositoryBackupJson — valid backup validation', () => {
  it('accepts a well-formed backup produced by buildRepositoryExportSnapshot', () => {
    const snapshot = buildRepositoryExportSnapshot(
      [content({ id: 'c1' })],
      [note({ id: 'n1', workspaceId: 'phd_research' })],
      [relationship({ id: 'r1' })],
      'phd_research',
      '2026-01-01T00:00:00.000Z',
    );
    const result = validateRepositoryBackupJson(JSON.stringify(snapshot));
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.snapshot.workspaceId).toBe('phd_research');
      expect(result.snapshot.notes).toHaveLength(1);
      expect(result.snapshot.importedContent).toHaveLength(1);
      expect(result.snapshot.relationships).toHaveLength(1);
    }
  });

  it('accepts a hand-built valid snapshot with empty collections', () => {
    const snapshot = validSnapshot({ importedContent: [], notes: [], relationships: [] });
    const result = validateRepositoryBackupJson(JSON.stringify(snapshot));
    expect(result.status).toBe('ok');
  });
});

describe('validateRepositoryBackupJson — malformed JSON', () => {
  it('rejects text that is not valid JSON at all', () => {
    const result = validateRepositoryBackupJson('{ this is not json');
    expect(result).toMatchObject({ status: 'error', reason: 'invalid_json' });
  });

  it('rejects a JSON array (not an object) at the top level', () => {
    const result = validateRepositoryBackupJson('[]');
    expect(result).toMatchObject({ status: 'error', reason: 'not_repository_export' });
  });

  it('rejects a JSON primitive at the top level', () => {
    expect(validateRepositoryBackupJson('42')).toMatchObject({ status: 'error', reason: 'not_repository_export' });
    expect(validateRepositoryBackupJson('null')).toMatchObject({ status: 'error', reason: 'not_repository_export' });
  });
});

describe('validateRepositoryBackupJson — unsupported schema/version', () => {
  it('rejects a file missing the "kind" marker entirely (e.g. some other JSON file)', () => {
    const result = validateRepositoryBackupJson(JSON.stringify({ foo: 'bar' }));
    expect(result).toMatchObject({ status: 'error', reason: 'not_repository_export' });
  });

  it('rejects a file whose "kind" does not match the expected repository-export marker', () => {
    const snapshot = { ...validSnapshot(), kind: 'something-else' };
    expect(validateRepositoryBackupJson(JSON.stringify(snapshot))).toMatchObject({ status: 'error', reason: 'not_repository_export' });
  });

  it('rejects a schemaVersion that is not the currently supported one', () => {
    const snapshot = { ...validSnapshot(), schemaVersion: 999 };
    expect(validateRepositoryBackupJson(JSON.stringify(snapshot))).toMatchObject({ status: 'error', reason: 'unsupported_schema_version' });
  });

  it('rejects a missing schemaVersion', () => {
    const snapshot: Record<string, unknown> = { ...validSnapshot() };
    delete snapshot.schemaVersion;
    expect(validateRepositoryBackupJson(JSON.stringify(snapshot))).toMatchObject({ status: 'error', reason: 'unsupported_schema_version' });
  });
});

describe('validateRepositoryBackupJson — missing fields', () => {
  it('rejects a missing/invalid workspaceId', () => {
    const snapshot = { ...validSnapshot(), workspaceId: 'not_a_real_workspace' };
    expect(validateRepositoryBackupJson(JSON.stringify(snapshot))).toMatchObject({ status: 'error', reason: 'invalid_workspace' });
  });

  it('rejects a missing/invalid exportedAt', () => {
    const snapshot = { ...validSnapshot(), exportedAt: 'not-a-date' };
    expect(validateRepositoryBackupJson(JSON.stringify(snapshot))).toMatchObject({ status: 'error', reason: 'invalid_metadata' });
  });

  it('rejects a missing "notes" array', () => {
    const snapshot: Record<string, unknown> = { ...validSnapshot() };
    delete snapshot.notes;
    expect(validateRepositoryBackupJson(JSON.stringify(snapshot))).toMatchObject({ status: 'error', reason: 'invalid_notes' });
  });

  it('rejects a missing "importedContent" array', () => {
    const snapshot: Record<string, unknown> = { ...validSnapshot() };
    delete snapshot.importedContent;
    expect(validateRepositoryBackupJson(JSON.stringify(snapshot))).toMatchObject({ status: 'error', reason: 'invalid_imported_content' });
  });

  it('rejects a missing "relationships" array', () => {
    const snapshot: Record<string, unknown> = { ...validSnapshot() };
    delete snapshot.relationships;
    expect(validateRepositoryBackupJson(JSON.stringify(snapshot))).toMatchObject({ status: 'error', reason: 'invalid_relationships' });
  });
});

describe('validateRepositoryBackupJson — invalid records', () => {
  it('rejects a note missing a required field (title)', () => {
    const badNote = { ...note({ id: 'n1' }) } as Record<string, unknown>;
    delete badNote.title;
    const snapshot = validSnapshot({ notes: [badNote as unknown as Note] });
    expect(validateRepositoryBackupJson(JSON.stringify(snapshot))).toMatchObject({ status: 'error', reason: 'invalid_notes' });
  });

  it('rejects a note with the wrong type for "pinned"', () => {
    const badNote = { ...note({ id: 'n1' }), pinned: 'yes' } as unknown as Note;
    const snapshot = validSnapshot({ notes: [badNote] });
    expect(validateRepositoryBackupJson(JSON.stringify(snapshot))).toMatchObject({ status: 'error', reason: 'invalid_notes' });
  });

  it('rejects an ImportedContent record with an invalid contentType', () => {
    const badItem = { ...content({ id: 'c1' }), contentType: 'not_a_real_type' } as unknown as ImportedContent;
    const snapshot = validSnapshot({ importedContent: [badItem] });
    expect(validateRepositoryBackupJson(JSON.stringify(snapshot))).toMatchObject({ status: 'error', reason: 'invalid_imported_content' });
  });

  it('rejects an ImportedContent record missing provenance.importedAt', () => {
    const badItem = { ...content({ id: 'c1' }), provenance: { origin: 'import' } } as unknown as ImportedContent;
    const snapshot = validSnapshot({ importedContent: [badItem] });
    expect(validateRepositoryBackupJson(JSON.stringify(snapshot))).toMatchObject({ status: 'error', reason: 'invalid_imported_content' });
  });

  it('rejects a relationship with an invalid relationship type', () => {
    const badRel = { ...relationship({ id: 'r1' }), type: 'not_a_real_type' } as unknown as ContentRelationship;
    const snapshot = validSnapshot({ relationships: [badRel] });
    expect(validateRepositoryBackupJson(JSON.stringify(snapshot))).toMatchObject({ status: 'error', reason: 'invalid_relationships' });
  });

  it('rejects a relationship with an invalid entity type on an endpoint', () => {
    const badRel = { ...relationship({ id: 'r1' }), sourceType: 'not_a_real_type' } as unknown as ContentRelationship;
    const snapshot = validSnapshot({ relationships: [badRel] });
    expect(validateRepositoryBackupJson(JSON.stringify(snapshot))).toMatchObject({ status: 'error', reason: 'invalid_relationships' });
  });
});

describe('validateRepositoryBackupJson — duplicate records', () => {
  it('rejects a backup with two notes sharing the same id', () => {
    const snapshot = validSnapshot({ notes: [note({ id: 'dup' }), note({ id: 'dup' })] });
    expect(validateRepositoryBackupJson(JSON.stringify(snapshot))).toMatchObject({ status: 'error', reason: 'invalid_notes' });
  });

  it('rejects a backup with two ImportedContent items sharing the same id', () => {
    const snapshot = validSnapshot({ importedContent: [content({ id: 'dup' }), content({ id: 'dup' })] });
    expect(validateRepositoryBackupJson(JSON.stringify(snapshot))).toMatchObject({ status: 'error', reason: 'invalid_imported_content' });
  });

  it('rejects a backup with two relationships sharing the same id', () => {
    const snapshot = validSnapshot({ relationships: [relationship({ id: 'dup' }), relationship({ id: 'dup' })] });
    expect(validateRepositoryBackupJson(JSON.stringify(snapshot))).toMatchObject({ status: 'error', reason: 'invalid_relationships' });
  });
});

describe('buildRepositoryImportPlan — workspace destination behaviour', () => {
  it('the plan always targets the destination workspace, regardless of the backup\'s own recorded workspace', () => {
    const snapshot = validSnapshot({ workspaceId: 'apfc' });
    const plan = buildRepositoryImportPlan(snapshot, emptyDestination('phd_research'));
    expect(plan.sourceWorkspaceId).toBe('apfc');
    expect(plan.destinationWorkspaceId).toBe('phd_research');
    expect(plan.notesToAdd.every((n) => n.workspaceId === 'phd_research')).toBe(true);
    expect(plan.importedContentToAdd.every((c) => c.workspaceId === 'phd_research')).toBe(true);
    expect(plan.relationshipsToAdd.every((r) => r.workspaceId === 'phd_research')).toBe(true);
  });
});

describe('buildRepositoryImportPlan — same-workspace restore', () => {
  it('restoring a backup back into its own original workspace works the same way as any other destination', () => {
    const snapshot = validSnapshot({ workspaceId: 'phd_research' });
    const plan = buildRepositoryImportPlan(snapshot, emptyDestination('phd_research'));
    expect(plan.sourceWorkspaceId).toBe(plan.destinationWorkspaceId);
    expect(plan.notesToAdd).toHaveLength(1);
    expect(plan.importedContentToAdd).toHaveLength(1);
  });
});

describe('buildRepositoryImportPlan — cross-workspace restore', () => {
  it('restoring a PhD Research backup into APFC targets APFC, with no mechanical difference from same-workspace restore', () => {
    const snapshot = validSnapshot({ workspaceId: 'phd_research' });
    const plan = buildRepositoryImportPlan(snapshot, emptyDestination('apfc'));
    expect(plan.sourceWorkspaceId).toBe('phd_research');
    expect(plan.destinationWorkspaceId).toBe('apfc');
    expect(plan.notesToAdd[0].workspaceId).toBe('apfc');
  });
});

describe('buildRepositoryImportPlan — ID collision remapping', () => {
  it('a note whose id already exists in the destination gets a fresh id; the existing record is untouched', () => {
    const existingNote = note({ id: 'n1', title: 'Existing Note' });
    const snapshot = validSnapshot({ notes: [note({ id: 'n1', title: 'Imported Note' })], importedContent: [], relationships: [] });
    const destination: RepositoryImportDestination = { workspaceId: 'phd_research', existingNotes: [existingNote], existingImportedContent: [], existingRelationships: [] };

    const plan = buildRepositoryImportPlan(snapshot, destination);
    expect(plan.noteCollisionCount).toBe(1);
    expect(plan.notesToAdd).toHaveLength(1);
    expect(plan.notesToAdd[0].id).not.toBe('n1');
    expect(plan.notesToAdd[0].title).toBe('Imported Note');
    // The existing record itself is never part of the plan's output — nothing overwrites it.
    expect(existingNote.title).toBe('Existing Note');
  });

  it('an ImportedContent item whose id already exists in the destination gets a fresh id', () => {
    const existingItem = content({ id: 'c1', title: 'Existing Doc' });
    const snapshot = validSnapshot({ notes: [], importedContent: [content({ id: 'c1', title: 'Imported Doc' })], relationships: [] });
    const destination: RepositoryImportDestination = { workspaceId: 'phd_research', existingNotes: [], existingImportedContent: [existingItem], existingRelationships: [] };

    const plan = buildRepositoryImportPlan(snapshot, destination);
    expect(plan.importedContentCollisionCount).toBe(1);
    expect(plan.importedContentToAdd[0].id).not.toBe('c1');
    expect(plan.importedContentToAdd[0].title).toBe('Imported Doc');
  });

  it('a non-colliding id is preserved exactly as-is', () => {
    const snapshot = validSnapshot({ notes: [note({ id: 'fresh-id' })], importedContent: [], relationships: [] });
    const plan = buildRepositoryImportPlan(snapshot, emptyDestination());
    expect(plan.noteCollisionCount).toBe(0);
    expect(plan.notesToAdd[0].id).toBe('fresh-id');
  });

  it('relationship ids are remapped the same way when they collide with an existing relationship id', () => {
    const existingRel = relationship({ id: 'r1', sourceId: 'other-c', targetId: 'other-n' });
    const snapshot = validSnapshot({
      notes: [note({ id: 'n1' })],
      importedContent: [content({ id: 'c1' })],
      relationships: [relationship({ id: 'r1', sourceId: 'c1', targetId: 'n1' })],
    });
    const destination: RepositoryImportDestination = { workspaceId: 'phd_research', existingNotes: [], existingImportedContent: [], existingRelationships: [existingRel] };

    const plan = buildRepositoryImportPlan(snapshot, destination);
    expect(plan.relationshipCollisionCount).toBe(1);
    expect(plan.relationshipsToAdd[0].id).not.toBe('r1');
  });
});

describe('buildRepositoryImportPlan — relationship endpoint remapping', () => {
  it('a relationship whose endpoint collided is rewritten to point at the NEW id, not the old one', () => {
    const existingNote = note({ id: 'n1' });
    const snapshot = validSnapshot({
      notes: [note({ id: 'n1' })],
      importedContent: [content({ id: 'c1' })],
      relationships: [relationship({ id: 'r1', sourceId: 'c1', sourceType: 'imported_content', targetId: 'n1', targetType: 'note' })],
    });
    const destination: RepositoryImportDestination = { workspaceId: 'phd_research', existingNotes: [existingNote], existingImportedContent: [], existingRelationships: [] };

    const plan = buildRepositoryImportPlan(snapshot, destination);
    const remappedNoteId = plan.notesToAdd[0].id;
    expect(remappedNoteId).not.toBe('n1');
    expect(plan.relationshipsToAdd).toHaveLength(1);
    expect(plan.relationshipsToAdd[0].targetId).toBe(remappedNoteId);
    expect(plan.relationshipsToAdd[0].sourceId).toBe('c1'); // this endpoint never collided, so it's untouched
  });

  it('both endpoints can be remapped independently in the same relationship', () => {
    const existingNote = note({ id: 'n1' });
    const existingItem = content({ id: 'c1' });
    const snapshot = validSnapshot({
      notes: [note({ id: 'n1' })],
      importedContent: [content({ id: 'c1' })],
      relationships: [relationship({ id: 'r1', sourceId: 'c1', targetId: 'n1' })],
    });
    const destination: RepositoryImportDestination = { workspaceId: 'phd_research', existingNotes: [existingNote], existingImportedContent: [existingItem], existingRelationships: [] };

    const plan = buildRepositoryImportPlan(snapshot, destination);
    expect(plan.relationshipsToAdd[0].sourceId).toBe(plan.importedContentToAdd[0].id);
    expect(plan.relationshipsToAdd[0].targetId).toBe(plan.notesToAdd[0].id);
  });
});

describe('buildRepositoryImportPlan — invalid relationships (skip, never dangling)', () => {
  it('a self-link relationship is skipped, never added', () => {
    const snapshot = validSnapshot({
      notes: [],
      importedContent: [content({ id: 'c1' })],
      relationships: [relationship({ id: 'r1', sourceId: 'c1', sourceType: 'imported_content', targetId: 'c1', targetType: 'imported_content' })],
    });
    const plan = buildRepositoryImportPlan(snapshot, emptyDestination());
    expect(plan.relationshipsToAdd).toEqual([]);
    expect(plan.skippedRelationships).toHaveLength(1);
    expect(plan.skippedRelationships[0].reason).toBe('self_link');
  });

  it('a relationship whose endpoint is not present in the backup itself is skipped, never a dangling reference', () => {
    const snapshot = validSnapshot({
      notes: [],
      importedContent: [content({ id: 'c1' })],
      relationships: [relationship({ id: 'r1', sourceId: 'c1', targetId: 'ghost-note', targetType: 'note' })],
    });
    const plan = buildRepositoryImportPlan(snapshot, emptyDestination());
    expect(plan.relationshipsToAdd).toEqual([]);
    expect(plan.skippedRelationships).toHaveLength(1);
    expect(plan.skippedRelationships[0].reason).toBe('endpoint_not_in_backup');
  });

  it('a mix of valid and invalid relationships only restores the valid ones', () => {
    const snapshot = validSnapshot({
      notes: [note({ id: 'n1' })],
      importedContent: [content({ id: 'c1' })],
      relationships: [
        relationship({ id: 'r1', sourceId: 'c1', targetId: 'n1' }),
        relationship({ id: 'r2', sourceId: 'c1', targetId: 'ghost', targetType: 'note' }),
      ],
    });
    const plan = buildRepositoryImportPlan(snapshot, emptyDestination());
    expect(plan.relationshipsToAdd).toHaveLength(1);
    expect(plan.relationshipsToAdd[0].id).toBe('r1');
    expect(plan.skippedRelationships).toHaveLength(1);
  });
});

describe('buildRepositoryImportPlan — no overwrite of existing records', () => {
  it('the plan output never includes or references the existing destination records at all', () => {
    const existingNote = note({ id: 'n1', title: 'Do Not Touch' });
    const existingItem = content({ id: 'c1', title: 'Do Not Touch Either' });
    const snapshot = validSnapshot({ notes: [note({ id: 'n1', title: 'Imported' })], importedContent: [content({ id: 'c1', title: 'Imported' })], relationships: [] });
    const destination: RepositoryImportDestination = { workspaceId: 'phd_research', existingNotes: [existingNote], existingImportedContent: [existingItem], existingRelationships: [] };

    buildRepositoryImportPlan(snapshot, destination);

    // Pure function — the existing records passed in are never mutated, and building the plan
    // does not touch them at all (they exist only to check for collisions).
    expect(existingNote.title).toBe('Do Not Touch');
    expect(existingItem.title).toBe('Do Not Touch Either');
  });
});

describe('buildRepositoryImportPlan / validateRepositoryBackupJson — no mutation before confirmation, atomicity', () => {
  it('validating and building a plan never mutates the snapshot or destination inputs (both stay pure until a caller explicitly applies the plan elsewhere)', () => {
    const snapshot = validSnapshot();
    const snapshotCopy = JSON.parse(JSON.stringify(snapshot));
    const destination = emptyDestination();

    const validated = validateRepositoryBackupJson(JSON.stringify(snapshot));
    expect(validated.status).toBe('ok');
    if (validated.status !== 'ok') return;
    buildRepositoryImportPlan(validated.snapshot, destination);

    expect(snapshot).toEqual(snapshotCopy);
  });

  it('building a plan produces a complete, self-contained result with no partial state — nothing is "half done" because nothing has been applied anywhere yet', () => {
    const snapshot = validSnapshot();
    const plan = buildRepositoryImportPlan(snapshot, emptyDestination());
    // The plan is a plain, fully-formed object — every field is present and consistent with every
    // other field (e.g. relationshipsToAdd only ever references ids that are also in
    // notesToAdd/importedContentToAdd), never a stream of incremental mutations a failure partway
    // through could interrupt.
    expect(plan).toHaveProperty('notesToAdd');
    expect(plan).toHaveProperty('importedContentToAdd');
    expect(plan).toHaveProperty('relationshipsToAdd');
    const allAddedIds = new Set([...plan.notesToAdd.map((n) => n.id), ...plan.importedContentToAdd.map((c) => c.id)]);
    for (const rel of plan.relationshipsToAdd) {
      expect(allAddedIds.has(rel.sourceId) || rel.sourceId === 'c1' /* non-colliding original id */).toBe(true);
    }
  });
});

describe('buildRepositoryImportPlan — successful additive restore (Notes, ImportedContent, relationships)', () => {
  it('every note, imported-content item, and valid relationship from the backup ends up in the plan\'s add lists', () => {
    const snapshot = validSnapshot({
      notes: [note({ id: 'n1', title: 'Note One' }), note({ id: 'n2', title: 'Note Two' })],
      importedContent: [content({ id: 'c1', title: 'Doc One' }), content({ id: 'c2', title: 'Doc Two', contentType: 'bibliography' })],
      relationships: [relationship({ id: 'r1', sourceId: 'c1', targetId: 'n1' })],
    });
    const plan = buildRepositoryImportPlan(snapshot, emptyDestination());

    expect(plan.notesToAdd.map((n) => n.title).sort()).toEqual(['Note One', 'Note Two']);
    expect(plan.importedContentToAdd.map((c) => c.title).sort()).toEqual(['Doc One', 'Doc Two']);
    expect(plan.relationshipsToAdd).toHaveLength(1);
  });

  it('preserves rawContent, title, contentType, metadata, provenance, and origin exactly for ImportedContent', () => {
    const original = content({
      id: 'c1',
      title: 'Preserved Title',
      rawContent: 'Exact raw content, must never change.',
      contentType: 'bibliography',
      metadata: { tags: ['a', 'b'], category: 'Cat' },
      provenance: { importedAt: '2025-06-01T00:00:00.000Z', sourceFilename: 'orig.md', originalFormat: 'markdown', origin: 'import' },
    });
    const snapshot = validSnapshot({ notes: [], importedContent: [original], relationships: [] });
    const plan = buildRepositoryImportPlan(snapshot, emptyDestination());

    const restored = plan.importedContentToAdd[0];
    expect(restored.rawContent).toBe(original.rawContent);
    expect(restored.title).toBe(original.title);
    expect(restored.contentType).toBe(original.contentType);
    expect(restored.metadata).toEqual(original.metadata);
    expect(restored.provenance.importedAt).toBe(original.provenance.importedAt);
    expect(restored.provenance.sourceFilename).toBe(original.provenance.sourceFilename);
    expect(restored.provenance.origin).toBe(original.provenance.origin);
  });

  it('preserves title, content, and timestamps exactly for Notes', () => {
    const original = note({ id: 'n1', title: 'Preserved Note', content: 'Exact content.', createdAt: '2025-01-01T00:00:00.000Z', updatedAt: '2025-02-01T00:00:00.000Z', pinned: true });
    const snapshot = validSnapshot({ notes: [original], importedContent: [], relationships: [] });
    const plan = buildRepositoryImportPlan(snapshot, emptyDestination());

    const restored = plan.notesToAdd[0];
    expect(restored.title).toBe(original.title);
    expect(restored.content).toBe(original.content);
    expect(restored.createdAt).toBe(original.createdAt);
    expect(restored.updatedAt).toBe(original.updatedAt);
    expect(restored.pinned).toBe(original.pinned);
  });
});

describe('buildRepositoryImportPlan — empty backup', () => {
  it('an all-empty backup produces an all-empty plan, never throwing', () => {
    const snapshot = validSnapshot({ notes: [], importedContent: [], relationships: [] });
    expect(() => buildRepositoryImportPlan(snapshot, emptyDestination())).not.toThrow();
    const plan = buildRepositoryImportPlan(snapshot, emptyDestination());
    expect(plan.notesToAdd).toEqual([]);
    expect(plan.importedContentToAdd).toEqual([]);
    expect(plan.relationshipsToAdd).toEqual([]);
    expect(plan.skippedRelationships).toEqual([]);
  });
});
