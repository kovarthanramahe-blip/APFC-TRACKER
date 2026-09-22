import { describe, it, expect } from 'vitest';
import {
  RELATIONSHIP_TYPES,
  RELATIONSHIP_ENTITY_TYPES,
  createRelationship,
  deleteRelationship,
  getOutgoingRelationships,
  getIncomingRelationships,
  getRelatedContent,
  isDuplicateRelationship,
  type ContentRelationship,
  type RelationshipEndpoint,
  type ValidRelationshipEndpoints,
} from './contentRelationships';

function endpoint(id: string, type: RelationshipEndpoint['type'] = 'imported_content'): RelationshipEndpoint {
  return { id, type };
}

function relationship(overrides: Partial<ContentRelationship> = {}): ContentRelationship {
  return {
    id: overrides.id ?? 'r1',
    workspaceId: overrides.workspaceId ?? 'phd_research',
    sourceId: overrides.sourceId ?? 'a',
    sourceType: overrides.sourceType ?? 'imported_content',
    targetId: overrides.targetId ?? 'b',
    targetType: overrides.targetType ?? 'imported_content',
    type: overrides.type ?? 'cites',
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
  };
}

const pools: ValidRelationshipEndpoints = {
  importedContentIds: new Set(['a', 'b', 'c']),
  noteIds: new Set(['n1', 'n2']),
};

describe('RELATIONSHIP_TYPES / RELATIONSHIP_ENTITY_TYPES', () => {
  it('supports at least cites, supports, related_to', () => {
    expect(RELATIONSHIP_TYPES).toContain('cites');
    expect(RELATIONSHIP_TYPES).toContain('supports');
    expect(RELATIONSHIP_TYPES).toContain('related_to');
  });

  it('supports imported_content and note entity types', () => {
    expect(RELATIONSHIP_ENTITY_TYPES).toContain('imported_content');
    expect(RELATIONSHIP_ENTITY_TYPES).toContain('note');
  });
});

describe('createRelationship — imported-content <-> imported-content (existing behaviour)', () => {
  it('creates a relationship with stamped ids, types, workspaceId and a createdAt timestamp', () => {
    const result = createRelationship([], pools, { workspaceId: 'phd_research', source: endpoint('a'), target: endpoint('b'), type: 'cites' });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.relationship.sourceId).toBe('a');
    expect(result.relationship.sourceType).toBe('imported_content');
    expect(result.relationship.targetId).toBe('b');
    expect(result.relationship.targetType).toBe('imported_content');
    expect(result.relationship.type).toBe('cites');
    expect(result.relationship.workspaceId).toBe('phd_research');
    expect(typeof result.relationship.id).toBe('string');
    expect(result.relationship.id.length).toBeGreaterThan(0);
    expect(result.relationship.createdAt).toBeTruthy();
  });

  it('accepts an explicit createdAt override', () => {
    const result = createRelationship([], pools, {
      workspaceId: 'phd_research',
      source: endpoint('a'),
      target: endpoint('b'),
      type: 'cites',
      createdAt: '2020-01-01T00:00:00.000Z',
    });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.relationship.createdAt).toBe('2020-01-01T00:00:00.000Z');
  });
});

describe('imported-content endpoint validation', () => {
  it('rejects an unknown imported_content sourceId not present in the pool', () => {
    const result = createRelationship([], pools, { workspaceId: 'phd_research', source: endpoint('ghost'), target: endpoint('b'), type: 'cites' });
    expect(result).toMatchObject({ status: 'error', reason: 'invalid_source' });
  });

  it('rejects an unknown imported_content targetId not present in the pool', () => {
    const result = createRelationship([], pools, { workspaceId: 'phd_research', source: endpoint('a'), target: endpoint('ghost'), type: 'cites' });
    expect(result).toMatchObject({ status: 'error', reason: 'invalid_target' });
  });

  it('a valid imported_content id in the pool is accepted', () => {
    const result = createRelationship([], pools, { workspaceId: 'phd_research', source: endpoint('a'), target: endpoint('c'), type: 'related_to' });
    expect(result.status).toBe('ok');
  });
});

describe('note endpoint validation', () => {
  it('accepts a valid note id present in noteIds as a target', () => {
    const result = createRelationship([], pools, { workspaceId: 'phd_research', source: endpoint('a'), target: endpoint('n1', 'note'), type: 'cites' });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.relationship.targetType).toBe('note');
      expect(result.relationship.targetId).toBe('n1');
    }
  });

  it('accepts a valid note id present in noteIds as a source', () => {
    const result = createRelationship([], pools, { workspaceId: 'phd_research', source: endpoint('n1', 'note'), target: endpoint('a'), type: 'related_to' });
    expect(result.status).toBe('ok');
  });

  it('rejects an unknown note id not present in noteIds, even if that id exists in importedContentIds', () => {
    // 'a' is a valid imported_content id but not a valid NOTE id — a bare id is never enough.
    const result = createRelationship([], pools, { workspaceId: 'phd_research', source: endpoint('c'), target: endpoint('a', 'note'), type: 'cites' });
    expect(result).toMatchObject({ status: 'error', reason: 'invalid_target' });
  });

  it('an id valid as imported_content is never treated as valid for note (pools are type-specific)', () => {
    const result = createRelationship([], pools, { workspaceId: 'phd_research', source: endpoint('a', 'note'), target: endpoint('b'), type: 'cites' });
    expect(result).toMatchObject({ status: 'error', reason: 'invalid_source' });
  });

  it('a note linking to a note is valid (the model does not restrict which types may pair)', () => {
    const result = createRelationship([], pools, { workspaceId: 'phd_research', source: endpoint('n1', 'note'), target: endpoint('n2', 'note'), type: 'related_to' });
    expect(result.status).toBe('ok');
  });
});

describe('self-link prevention', () => {
  it('rejects a self-link (same id AND same type)', () => {
    const result = createRelationship([], pools, { workspaceId: 'phd_research', source: endpoint('a'), target: endpoint('a'), type: 'cites' });
    expect(result).toMatchObject({ status: 'error', reason: 'self_link' });
  });

  it('rejects a note self-link the same way', () => {
    const result = createRelationship([], pools, { workspaceId: 'phd_research', source: endpoint('n1', 'note'), target: endpoint('n1', 'note'), type: 'cites' });
    expect(result).toMatchObject({ status: 'error', reason: 'self_link' });
  });

  it('the same id but DIFFERENT types is never a self-link — they are different entities (Note ids and ImportedContent ids stay unambiguous)', () => {
    // pools.importedContentIds has 'a'; give noteIds an id that happens to equal 'a' too, to prove
    // the check is genuinely type-aware and not just id-aware.
    const poolsWithCollision: ValidRelationshipEndpoints = { importedContentIds: new Set(['a']), noteIds: new Set(['a']) };
    const result = createRelationship([], poolsWithCollision, {
      workspaceId: 'phd_research',
      source: endpoint('a', 'imported_content'),
      target: endpoint('a', 'note'),
      type: 'cites',
    });
    expect(result.status).toBe('ok');
  });

  it('checks self-link before existence, so a self-link on an unknown id/type is still rejected as self_link', () => {
    const result = createRelationship([], pools, { workspaceId: 'phd_research', source: endpoint('ghost'), target: endpoint('ghost'), type: 'cites' });
    expect(result).toMatchObject({ status: 'error', reason: 'self_link' });
  });
});

describe('duplicate prevention', () => {
  it('rejects an exact duplicate (same source id+type, target id+type, and relationship type)', () => {
    const existing = [relationship({ id: 'r1', sourceId: 'a', sourceType: 'imported_content', targetId: 'b', targetType: 'imported_content', type: 'cites' })];
    const result = createRelationship(existing, pools, { workspaceId: 'phd_research', source: endpoint('a'), target: endpoint('b'), type: 'cites' });
    expect(result).toMatchObject({ status: 'error', reason: 'duplicate' });
  });

  it('allows a different relationship type between the same two endpoints', () => {
    const existing = [relationship({ id: 'r1', sourceId: 'a', targetId: 'b', type: 'cites' })];
    const result = createRelationship(existing, pools, { workspaceId: 'phd_research', source: endpoint('a'), target: endpoint('b'), type: 'supports' });
    expect(result.status).toBe('ok');
  });

  it('allows the reverse direction between the same two ids (a different relationship)', () => {
    const existing = [relationship({ id: 'r1', sourceId: 'a', targetId: 'b', type: 'cites' })];
    const result = createRelationship(existing, pools, { workspaceId: 'phd_research', source: endpoint('b'), target: endpoint('a'), type: 'cites' });
    expect(result.status).toBe('ok');
  });

  it('a duplicate check is type-aware: an imported_content<->b relationship does not block a note<->b relationship sharing the same id string', () => {
    const poolsWithCollision: ValidRelationshipEndpoints = { importedContentIds: new Set(['x', 'b']), noteIds: new Set(['x']) };
    const existing = [relationship({ id: 'r1', sourceId: 'x', sourceType: 'imported_content', targetId: 'b', targetType: 'imported_content', type: 'cites' })];
    const result = createRelationship(existing, poolsWithCollision, {
      workspaceId: 'phd_research',
      source: endpoint('x', 'note'),
      target: endpoint('b'),
      type: 'cites',
    });
    expect(result.status).toBe('ok');
  });
});

describe('isDuplicateRelationship', () => {
  it('is true only for an exact (sourceId, sourceType, targetId, targetType, type) match', () => {
    const existing = [relationship({ sourceId: 'a', sourceType: 'imported_content', targetId: 'b', targetType: 'imported_content', type: 'cites' })];
    expect(isDuplicateRelationship(existing, endpoint('a'), endpoint('b'), 'cites')).toBe(true);
    expect(isDuplicateRelationship(existing, endpoint('a'), endpoint('b'), 'supports')).toBe(false);
    expect(isDuplicateRelationship(existing, endpoint('b'), endpoint('a'), 'cites')).toBe(false);
    expect(isDuplicateRelationship(existing, endpoint('a', 'note'), endpoint('b'), 'cites')).toBe(false);
  });
});

describe('relationship creation (general)', () => {
  it('produces a persistable ContentRelationship object with every required field', () => {
    const result = createRelationship([], pools, { workspaceId: 'phd_research', source: endpoint('n1', 'note'), target: endpoint('a'), type: 'supports' });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.relationship).toEqual({
      id: expect.any(String),
      workspaceId: 'phd_research',
      sourceId: 'n1',
      sourceType: 'note',
      targetId: 'a',
      targetType: 'imported_content',
      type: 'supports',
      createdAt: expect.any(String),
    });
  });
});

describe('relationship deletion', () => {
  it('removes exactly the matching relationship, leaving the rest untouched', () => {
    const existing = [relationship({ id: 'r1' }), relationship({ id: 'r2', sourceId: 'c', targetId: 'n1', targetType: 'note' })];
    const result = deleteRelationship(existing, 'r1');
    expect(result.map((r) => r.id)).toEqual(['r2']);
  });

  it('deleting an unknown id is a safe no-op', () => {
    const existing = [relationship({ id: 'r1' })];
    expect(deleteRelationship(existing, 'does-not-exist')).toEqual(existing);
  });

  it('does not mutate the input array', () => {
    const existing = [relationship({ id: 'r1' })];
    const snapshot = [...existing];
    deleteRelationship(existing, 'r1');
    expect(existing).toEqual(snapshot);
  });
});

describe('incoming/outgoing lookup — entity-type aware', () => {
  const existing = [
    relationship({ id: 'r1', sourceId: 'a', sourceType: 'imported_content', targetId: 'b', targetType: 'imported_content', type: 'cites' }),
    relationship({ id: 'r2', sourceId: 'a', sourceType: 'imported_content', targetId: 'n1', targetType: 'note', type: 'supports' }),
    relationship({ id: 'r3', sourceId: 'c', sourceType: 'imported_content', targetId: 'a', targetType: 'imported_content', type: 'related_to' }),
  ];

  it('getOutgoingRelationships returns only relationships where the (id, type) is the source', () => {
    expect(getOutgoingRelationships(existing, 'a', 'imported_content').map((r) => r.id).sort()).toEqual(['r1', 'r2']);
  });

  it('getIncomingRelationships returns only relationships where the (id, type) is the target', () => {
    expect(getIncomingRelationships(existing, 'a', 'imported_content').map((r) => r.id)).toEqual(['r3']);
  });

  it('an id with the WRONG type never matches, even if the same id string appears as the other type', () => {
    expect(getOutgoingRelationships(existing, 'a', 'note')).toEqual([]);
    expect(getIncomingRelationships(existing, 'n1', 'imported_content')).toEqual([]);
  });

  it('a note endpoint is looked up correctly', () => {
    expect(getIncomingRelationships(existing, 'n1', 'note').map((r) => r.id)).toEqual(['r2']);
  });

  it('an id with no relationships at all returns an empty array for both', () => {
    expect(getOutgoingRelationships(existing, 'z', 'imported_content')).toEqual([]);
    expect(getIncomingRelationships(existing, 'z', 'imported_content')).toEqual([]);
  });
});

describe('getRelatedContent', () => {
  it('combines outgoing and incoming relationships, each with the correct direction, relatedId and relatedType', () => {
    const existing = [
      relationship({ id: 'r1', sourceId: 'a', sourceType: 'imported_content', targetId: 'n1', targetType: 'note', type: 'cites' }),
      relationship({ id: 'r2', sourceId: 'c', sourceType: 'imported_content', targetId: 'a', targetType: 'imported_content', type: 'supports' }),
    ];
    const related = getRelatedContent(existing, 'a', 'imported_content');
    expect(related).toHaveLength(2);
    const outgoing = related.find((r) => r.direction === 'outgoing');
    const incoming = related.find((r) => r.direction === 'incoming');
    expect(outgoing?.relatedId).toBe('n1');
    expect(outgoing?.relatedType).toBe('note');
    expect(outgoing?.relationship.id).toBe('r1');
    expect(incoming?.relatedId).toBe('c');
    expect(incoming?.relatedType).toBe('imported_content');
    expect(incoming?.relationship.id).toBe('r2');
  });

  it('an id with no relationships returns an empty array', () => {
    expect(getRelatedContent([], 'a', 'imported_content')).toEqual([]);
  });
});
