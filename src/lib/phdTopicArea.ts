// PhD Research Topic Areas — a small, user-created, user-editable organisational unit sitting
// between the PhD Research workspace and its actual material (research documents / notes /
// bibliography records, all already modelled by lib/contentImport.ts's ImportedContent and
// lib/types.ts's Note). A Topic Area itself holds no documents directly: a document/note/
// bibliography record LINKS to a Topic Area via its own `metadata.topicAreaId` (ImportedContent —
// see lib/contentImport.ts's ImportedContentMetadata) — reusing the existing repository
// architecture exactly as this stage's own instruction asks, rather than inventing a parallel
// containment/relationship model. Never hard-coded: every Topic Area a user sees is one they
// created themselves.
//
// Same deterministic discipline as lib/upscCseStudyTask.ts / lib/microTarget.ts: no
// Date.now()/new Date().toISOString() calls in here — every timestamp is supplied by the caller.
//
// AI Library — research-document-model strengthening (multi-collection membership): a real item
// can belong to more than one Topic Area (metadata.topicAreaId for the primary one, plus
// metadata.topicAreaIds for any further ones — see contentImport.ts's own doc comment on both
// fields). itemBelongsToTopicArea below is the one place that union is computed, so every caller
// (phdAnalytics.ts's linked-content counts, pages/PhdDashboard.tsx) checks membership identically
// rather than re-deriving the "check both fields" rule itself and risking one call site forgetting
// the new field.

export interface PhdTopicArea {
  id: string;
  title: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export function isValidTopicAreaTitle(title: string): boolean {
  return title.trim().length > 0;
}

export function createPhdTopicArea(input: { title: string; description?: string }, id: string, now: string): PhdTopicArea {
  return {
    id,
    title: input.title.trim(),
    description: input.description?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
}

export interface UpdateTopicAreaFields {
  title?: string;
  description?: string;
}

/** Returns a NEW array with the matching area's title/description updated (title, if supplied,
 * trimmed and never allowed to become blank) and `updatedAt` stamped with `now`. Never mutates
 * `areas`. An id that doesn't exist is a no-op. */
export function updatePhdTopicArea(areas: readonly PhdTopicArea[], id: string, updates: UpdateTopicAreaFields, now: string): PhdTopicArea[] {
  return areas.map((a) => {
    if (a.id !== id) return a;
    const nextTitle = updates.title !== undefined && isValidTopicAreaTitle(updates.title) ? updates.title.trim() : a.title;
    const nextDescription = updates.description !== undefined ? updates.description.trim() || undefined : a.description;
    return { ...a, title: nextTitle, description: nextDescription, updatedAt: now };
  });
}

export function deletePhdTopicArea(areas: readonly PhdTopicArea[], id: string): PhdTopicArea[] {
  return areas.filter((a) => a.id !== id);
}

/** Case-insensitive match on title OR description — a blank query matches everything, same
 * convention as lib/upscCseSyllabusSearch.ts's own matchesMicrosyllabusQuery. */
export function searchPhdTopicAreas(areas: readonly PhdTopicArea[], query: string): PhdTopicArea[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...areas];
  return areas.filter((a) => a.title.toLowerCase().includes(q) || (a.description ?? '').toLowerCase().includes(q));
}

export function getPhdTopicAreaById(areas: readonly PhdTopicArea[], id: string): PhdTopicArea | undefined {
  return areas.find((a) => a.id === id);
}

/** True when `item` belongs to Topic Area `areaId` — via its primary `metadata.topicAreaId` OR any
 * of its further `metadata.topicAreaIds` (see contentImport.ts's own doc comment on both fields).
 * The one place this union is checked, so a caller never needs to remember both fields exist. */
export function itemBelongsToTopicArea(item: { metadata?: { topicAreaId?: string; topicAreaIds?: string[] } }, areaId: string): boolean {
  return item.metadata?.topicAreaId === areaId || (item.metadata?.topicAreaIds?.includes(areaId) ?? false);
}
