import { getMicrosyllabusForSubject, type UpscCseSyllabusTree, type UpscCseMicrosyllabusItem } from './upscCseSyllabus';

// UPSC CSE Syllabus UI's search/filter — pulled out as pure functions (rather than left inline in
// pages/UpscCseSyllabus.tsx) so the matching rule is directly unit-testable without a DOM/rendering
// environment, matching this repo's established testing convention. Matches on the microsyllabus
// item's title OR its stored syllabus wording (description) — a blank/whitespace-only query matches
// everything, so "search cleared" and "no query yet" behave identically.

export function matchesMicrosyllabusQuery(item: UpscCseMicrosyllabusItem, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q);
}

/** A subject's microsyllabus items, filtered by query — unfiltered (full list) when the query is
 * blank. Always resolved through getMicrosyllabusForSubject, so results stay in deterministic
 * `order`. */
export function filterMicrosyllabusBySubject(tree: UpscCseSyllabusTree, subjectId: string, query: string): UpscCseMicrosyllabusItem[] {
  const items = getMicrosyllabusForSubject(tree, subjectId);
  if (!query.trim()) return items;
  return items.filter((item) => matchesMicrosyllabusQuery(item, query));
}

/** Whether a subject has at least one microsyllabus item matching the query — used to decide
 * whether a subject (and, transitively, its paper) should stay visible while searching. Always true
 * for a blank query. */
export function subjectHasMicrosyllabusMatch(tree: UpscCseSyllabusTree, subjectId: string, query: string): boolean {
  if (!query.trim()) return true;
  return getMicrosyllabusForSubject(tree, subjectId).some((item) => matchesMicrosyllabusQuery(item, query));
}
