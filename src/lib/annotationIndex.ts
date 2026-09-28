// Premium Study Reader — Annotation Index (Phase E). Pure, framework-free query/filter logic for
// the sidebar/panel that lists every annotation on a document, grouped by category. Deliberately
// separate from lib/annotations.ts's own generic queries (annotationsFor/annotationsForDocument
// etc.) — those answer "which annotations belong to this document/mode", this module answers "how
// should the Index present them" (category membership, search matching, preview text, timestamp
// formatting). No new anchoring/coordinate system here: navigation back to source reuses the
// existing TextAnchor (lib/textAnchor.ts) and normalized-point (lib/annotations.ts) models exactly
// as they already are — see components/annotations/DocumentAnnotator.tsx's navigateToAnnotation.
import type { Annotation, StudyTag } from './annotations';

export type IndexCategory = 'highlights' | 'notes' | 'bookmarks' | 'handwriting' | 'revision' | 'flashcard' | 'important' | 'doubt';

export const ALL_INDEX_CATEGORIES: readonly IndexCategory[] = ['highlights', 'notes', 'bookmarks', 'handwriting', 'revision', 'flashcard', 'important', 'doubt'];

const STUDY_TAG_CATEGORY: Record<StudyTag, IndexCategory> = {
  revision: 'revision',
  flashcard: 'flashcard',
  important: 'important',
  doubt: 'doubt',
};

/**
 * Every category an annotation belongs to. Membership is ADDITIVE, not exclusive: a highlight
 * tagged "Add to Revision" appears under BOTH Highlights (by its underlying markup type) and
 * Revision Notes (by its study tag) — letting the reader browse "everything highlighted" or "just
 * what's queued for revision" without picking one home for it.
 */
export function categoriesForAnnotation(a: Annotation): IndexCategory[] {
  const categories: IndexCategory[] = [];
  switch (a.type) {
    case 'textHighlight':
    case 'underline':
    case 'strikethrough':
      categories.push('highlights');
      break;
    case 'textNote':
    case 'stickyNote':
      categories.push('notes');
      break;
    case 'bookmark':
      categories.push('bookmarks');
      break;
    case 'ink':
    case 'highlighterInk':
    case 'shape':
    case 'arrow':
      categories.push('handwriting');
      break;
  }
  for (const tag of a.studyTags) categories.push(STUDY_TAG_CATEGORY[tag]);
  return categories;
}

/** Groups a document's annotations by every category they belong to (an annotation with two study
 * tags appears in both groups' arrays) — used to render per-category counts/badges. */
export function groupAnnotationsByCategory(annotations: readonly Annotation[]): Record<IndexCategory, Annotation[]> {
  const groups = Object.fromEntries(ALL_INDEX_CATEGORIES.map((c) => [c, [] as Annotation[]])) as Record<IndexCategory, Annotation[]>;
  for (const a of annotations) {
    for (const category of categoriesForAnnotation(a)) groups[category].push(a);
  }
  return groups;
}

const PREVIEW_MAX_LENGTH = 140;

export function truncatePreview(text: string, maxLength: number = PREVIEW_MAX_LENGTH): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength).trimEnd()}…`;
}

/** The text an annotation is matched against for search — the underlying quote for text-anchored
 * markup, the written text for a note, or a short fixed label for anything with no text of its own
 * (a plain highlight/underline/strikethrough with no note, a handwritten stroke, a bookmark). */
export function searchableTextFor(a: Annotation): string {
  switch (a.type) {
    case 'textHighlight':
    case 'underline':
    case 'strikethrough':
      return a.anchor.quote;
    case 'textNote':
      return `${a.anchor.quote} ${a.text}`.trim();
    case 'stickyNote':
      return a.text;
    case 'bookmark':
      return 'Bookmark';
    case 'ink':
      return 'Handwritten note';
    case 'highlighterInk':
      return 'Highlighter stroke';
    case 'shape':
      return `${a.shapeKind} shape`;
    case 'arrow':
      return 'Arrow';
  }
}

/** The short line shown in the Index for one annotation — the source quote for text-anchored
 * markup (so the reader recognises WHAT was highlighted without reopening the document), the
 * written note text for a note, or a plain type label for geometry annotations (which have no text
 * of their own to preview). */
export function previewTextFor(a: Annotation): string {
  switch (a.type) {
    case 'textHighlight':
    case 'underline':
    case 'strikethrough':
      return truncatePreview(a.anchor.quote);
    case 'textNote':
      return truncatePreview(a.text || a.anchor.quote);
    case 'stickyNote':
      return truncatePreview(a.text) || (a.noteKind === 'freehand' ? 'Handwritten note' : 'Untitled note');
    case 'bookmark':
      return 'Bookmarked';
    case 'ink':
      return 'Handwritten note';
    case 'highlighterInk':
      return 'Highlighter stroke';
    case 'shape':
      return `${a.shapeKind[0].toUpperCase()}${a.shapeKind.slice(1)}`;
    case 'arrow':
      return 'Arrow';
  }
}

/**
 * Filters a document's annotations to one category (or 'all') and an optional free-text search
 * query, newest-first — the exact list the Index panel renders for a given tab. Returns [] (never
 * throws/undefined) when nothing matches, which is what drives each category's empty state.
 */
export function filterAnnotationIndex(annotations: readonly Annotation[], category: IndexCategory | 'all', query: string): Annotation[] {
  const q = query.trim().toLowerCase();
  return annotations
    .filter((a) => (category === 'all' ? true : categoriesForAnnotation(a).includes(category)))
    .filter((a) => (q === '' ? true : searchableTextFor(a).toLowerCase().includes(q)))
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** `createdAt`/`updatedAt` are full ISO instants (see lib/annotations.ts's `baseFields`) — NOT the
 * calendar-only yyyy-mm-dd strings lib/utils.ts's own `formatDate` expects, so that helper isn't
 * reused here; this formats a real instant with both date and time. */
export function formatAnnotationTimestamp(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
