import { describe, it, expect } from 'vitest';
import {
  RELATIONSHIP_TYPES,
  createRelationship,
  deleteRelationship,
  getOutgoingRelationships,
  getIncomingRelationships,
  getRelatedContent,
  isDuplicateRelationship,
  type ContentRelationship,
} from './contentRelationships';

function relationship(overrides: Partial<ContentRelationship> = {}): ContentRelationship {
  return {
    id: overrides.id ?? 'r1',
    workspaceId: overrides.workspaceId ?? 'phd_research',
    sourceId: overrides.sourceId ?? 'a',
    targetId: overrides.targetId ?? 'b',
    type: overrides.type ?? 'cites',
    createdAt: overrides.createdAt ?? '2026-01-01T00:00:00.000Z',
  };
}

describe('RELATIONSHIP_TYPES', () => {
  it('supports at least cites, supports, related_to', () => {
    expect(RELATIONSHIP_TYPES).toContain('cites');
    expect(RELATIONSHIP_TYPES).toContain('supports');
    expect(RELATIONSHIP_TYPES).toContain('related_to');
  });
});

describe('createRelationship', () => {
  const validIds = new Set(['a', 'b', 'c']);

  it('creates a relationship with a stable id, the given workspaceId, and a createdAt timestamp', () => {
    const result = createRelationship([], validIds, { workspaceId: 'phd_research', sourceId: 'a', targetId: 'b', type: 'cites' });
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.relationship.sourceId).toBe('a');
    expect(result.relationship.targetId).toBe('b');
    expect(result.relationship.type).toBe('cites');
    expect(result.relationship.workspaceId).toBe('phd_research');
    expect(typeof result.relationship.id).toBe('string');
    expect(result.relationship.id.length).toBeGreaterThan(0);
    expect(result.relationship.createdAt).toBeTruthy();
  });

  it('accepts an explicit createdAt override', () => {
    const result = createRelationship([], validIds, { workspaceId: 'phd_research', sourceId: 'a', targetId: 'b', type: 'cites', createdAt: '2020-01-01T00:00:00.000Z' });
    expect(result.status).toBe('ok');
    if (result.status === 'ok') expect(result.relationship.createdAt).toBe('2020-01-01T00:00:00.000Z');
  });

  it('rejects a self-link (sourceId === targetId)', () => {
    const result = createRelationship([], validIds, { workspaceId: 'phd_research', sourceId: 'a', targetId: 'a', type: 'cites' });
    expect(result).toEqual({ status: 'error', reason: 'self_link', message: expect.any(String) });
  });

  it('rejects an unknown sourceId not present in validContentIds', () => {
    const result = createRelationship([], validIds, { workspaceId: 'phd_research', sourceId: 'ghost', targetId: 'b', type: 'cites' });
    expect(result).toMatchObject({ status: 'error', reason: 'invalid_source' });
  });

  it('rejects an unknown targetId not present in validContentIds', () => {
    const result = createRelationship([], validIds, { workspaceId: 'phd_research', sourceId: 'a', targetId: 'ghost', type: 'cites' });
    expect(result).toMatchObject({ status: 'error', reason: 'invalid_target' });
  });

  it('rejects an exact duplicate (same sourceId, targetId and type)', () => {
    const existing = [relationship({ id: 'r1', sourceId: 'a', targetId: 'b', type: 'cites' })];
    const result = createRelationship(existing, validIds, { workspaceId: 'phd_research', sourceId: 'a', targetId: 'b', type: 'cites' });
    expect(result).toMatchObject({ status: 'error', reason: 'duplicate' });
  });

  it('allows a different relationship TYPE between the same source and target (not treated as a duplicate)', () => {
    const existing = [relationship({ id: 'r1', sourceId: 'a', targetId: 'b', type: 'cites' })];
    const result = createRelationship(existing, validIds, { workspaceId: 'phd_research', sourceId: 'a', targetId: 'b', type: 'supports' });
    expect(result.status).toBe('ok');
  });

  it('allows the reverse direction between the same two ids (a different relationship, not a duplicate)', () => {
    const existing = [relationship({ id: 'r1', sourceId: 'a', targetId: 'b', type: 'cites' })];
    const result = createRelationship(existing, validIds, { workspaceId: 'phd_research', sourceId: 'b', targetId: 'a', type: 'cites' });
    expect(result.status).toBe('ok');
  });

  it('checks self-link before existence, so a self-link on an unknown id is still rejected as self_link', () => {
    const result = createRelationship([], validIds, { workspaceId: 'phd_research', sourceId: 'ghost', targetId: 'ghost', type: 'cites' });
    expect(result).toMatchObject({ status: 'error', reason: 'self_link' });
  });
});

describe('isDuplicateRelationship', () => {
  it('is true only for an exact (sourceId, targetId, type) match', () => {
    const existing = [relationship({ sourceId: 'a', targetId: 'b', type: 'cites' })];
    expect(isDuplicateRelationship(existing, 'a', 'b', 'cites')).toBe(true);
    expect(isDuplicateRelationship(existing, 'a', 'b', 'supports')).toBe(false);
    expect(isDuplicateRelationship(existing, 'b', 'a', 'cites')).toBe(false);
  });
});

describe('deleteRelationship', () => {
  it('removes exactly the matching relationship, leaving the rest untouched', () => {
    const existing = [relationship({ id: 'r1' }), relationship({ id: 'r2', sourceId: 'c', targetId: 'd' })];
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

describe('getOutgoingRelationships / getIncomingRelationships', () => {
  const existing = [
    relationship({ id: 'r1', sourceId: 'a', targetId: 'b', type: 'cites' }),
    relationship({ id: 'r2', sourceId: 'a', targetId: 'c', type: 'supports' }),
    relationship({ id: 'r3', sourceId: 'c', targetId: 'a', type: 'related_to' }),
  ];

  it('getOutgoingRelationships returns only relationships where the id is the source', () => {
    expect(getOutgoingRelationships(existing, 'a').map((r) => r.id).sort()).toEqual(['r1', 'r2']);
  });

  it('getIncomingRelationships returns only relationships where the id is the target', () => {
    expect(getIncomingRelationships(existing, 'a').map((r) => r.id)).toEqual(['r3']);
  });

  it('an id with no relationships at all returns an empty array for both', () => {
    expect(getOutgoingRelationships(existing, 'z')).toEqual([]);
    expect(getIncomingRelationships(existing, 'z')).toEqual([]);
  });
});

describe('getRelatedContent', () => {
  it('combines outgoing and incoming relationships, each with the correct direction and relatedId', () => {
    const existing = [
      relationship({ id: 'r1', sourceId: 'a', targetId: 'b', type: 'cites' }),
      relationship({ id: 'r2', sourceId: 'c', targetId: 'a', type: 'supports' }),
    ];
    const related = getRelatedContent(existing, 'a');
    expect(related).toHaveLength(2);
    const outgoing = related.find((r) => r.direction === 'outgoing');
    const incoming = related.find((r) => r.direction === 'incoming');
    expect(outgoing?.relatedId).toBe('b');
    expect(outgoing?.relationship.id).toBe('r1');
    expect(incoming?.relatedId).toBe('c');
    expect(incoming?.relationship.id).toBe('r2');
  });

  it('an id with no relationships returns an empty array', () => {
    expect(getRelatedContent([], 'a')).toEqual([]);
  });
});
