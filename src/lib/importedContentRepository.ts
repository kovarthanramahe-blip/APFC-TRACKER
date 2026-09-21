import type { ImportedContent } from './contentImport';

// Repository-organisation utilities over an ImportedContent[] collection — search, tag/category
// filtering and deterministic sorting. Deliberately generic over `contentType`: every function
// here works the same way for research_document today and for question_bank/bibliography/pyq/etc.
// once those content types get their own persistence UI, so this is the one place that foundation
// needs to be built. Pure functions only, exactly like contentImport.ts's own
// selectImportedContentByType/getImportedContentById — no store access, no side effects.
//
// `metadata` (and therefore `metadata.tags`/`metadata.category`) is optional on ImportedContent —
// items imported before this stage existed have no metadata at all. Every function below treats a
// missing metadata/tags/category exactly like an item with no tags and no category, never throws,
// and never backfills a default onto the item itself.

/** `item.metadata?.tags`, defaulting to an empty array for items with no metadata yet. */
export function getContentTags(item: ImportedContent): string[] {
  return item.metadata?.tags ?? [];
}

/** `item.metadata?.category`, or undefined for items with no metadata/category yet. */
export function getContentCategory(item: ImportedContent): string | undefined {
  return item.metadata?.category;
}

/**
 * Case-insensitive substring search over title, extracted content, and source filename — the
 * three fields a user is most likely to remember something by. An empty/whitespace-only query
 * matches everything (mirrors how "no search typed" should behave in the UI).
 */
export function searchImportedContent(items: readonly ImportedContent[], query: string): ImportedContent[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  return items.filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.rawContent.toLowerCase().includes(q) ||
      item.provenance.sourceFilename.toLowerCase().includes(q),
  );
}

/**
 * Items carrying ANY of the given tags (case-insensitive match) — standard "faceted filter"
 * semantics for a set of toggleable tag chips. An empty `tags` list is a no-op (matches
 * everything), so callers can pass the UI's current selection directly without a separate
 * "is any filter active" branch.
 */
export function filterImportedContentByTags(items: readonly ImportedContent[], tags: readonly string[]): ImportedContent[] {
  if (tags.length === 0) return [...items];
  const wanted = new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean));
  if (wanted.size === 0) return [...items];
  return items.filter((item) => getContentTags(item).some((t) => wanted.has(t.trim().toLowerCase())));
}

/**
 * Items whose category matches (case-insensitive, exact) the given category. An empty/undefined
 * `category` is a no-op (matches everything) — callers filter to "uncategorized" explicitly via
 * `filterImportedContentUncategorized`, never by passing an empty string here.
 */
export function filterImportedContentByCategory(items: readonly ImportedContent[], category: string | undefined): ImportedContent[] {
  const wanted = category?.trim().toLowerCase();
  if (!wanted) return [...items];
  return items.filter((item) => getContentCategory(item)?.trim().toLowerCase() === wanted);
}

/** Items with no category set at all — kept separate from filterImportedContentByCategory so an
 * empty-string category can never be confused with "no filter applied". */
export function filterImportedContentUncategorized(items: readonly ImportedContent[]): ImportedContent[] {
  return items.filter((item) => !getContentCategory(item)?.trim());
}

export type ImportedContentSortOrder = 'newest' | 'oldest' | 'title';

/**
 * Deterministic sort — ties (e.g. two items imported in the same millisecond, or identical
 * titles) always break the same way (by id, ascending) so repeated calls over the same data
 * produce an identical order every time, regardless of the collection's original array order.
 */
export function sortImportedContent(items: readonly ImportedContent[], order: ImportedContentSortOrder = 'newest'): ImportedContent[] {
  const sorted = [...items];
  sorted.sort((a, b) => {
    let primary = 0;
    if (order === 'newest') primary = b.provenance.importedAt.localeCompare(a.provenance.importedAt);
    else if (order === 'oldest') primary = a.provenance.importedAt.localeCompare(b.provenance.importedAt);
    else primary = a.title.toLowerCase().localeCompare(b.title.toLowerCase());
    return primary !== 0 ? primary : a.id.localeCompare(b.id);
  });
  return sorted;
}

export interface ImportedContentQuery {
  search?: string;
  tags?: readonly string[];
  category?: string;
  /** Filters to items with no category set — takes precedence over `category` if both are given. */
  uncategorized?: boolean;
  sort?: ImportedContentSortOrder;
}

/**
 * The single entry point the PhD Research page (and any future content-type repository view)
 * calls: search + tag filter + category filter + deterministic sort, applied in that order. Each
 * step is a no-op when its corresponding option is omitted, so passing `{}` returns every item,
 * deterministically sorted.
 */
export function queryImportedContent(items: readonly ImportedContent[], query: ImportedContentQuery): ImportedContent[] {
  let results = items;
  if (query.search) results = searchImportedContent(results, query.search);
  if (query.tags && query.tags.length > 0) results = filterImportedContentByTags(results, query.tags);
  if (query.uncategorized) results = filterImportedContentUncategorized(results);
  else if (query.category) results = filterImportedContentByCategory(results, query.category);
  return sortImportedContent(results, query.sort ?? 'newest');
}

/** Every distinct tag present across a collection, alphabetically sorted (case-insensitive),
 * de-duplicated case-insensitively while keeping the first-seen casing — used to populate a tag
 * filter's chip list from whatever tags actually exist. */
export function collectImportedContentTags(items: readonly ImportedContent[]): string[] {
  const seen = new Map<string, string>();
  for (const item of items) {
    for (const tag of getContentTags(item)) {
      const trimmed = tag.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (!seen.has(key)) seen.set(key, trimmed);
    }
  }
  return [...seen.values()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

/** Every distinct category present across a collection, alphabetically sorted (case-insensitive),
 * de-duplicated the same way as collectImportedContentTags. */
export function collectImportedContentCategories(items: readonly ImportedContent[]): string[] {
  const seen = new Map<string, string>();
  for (const item of items) {
    const category = getContentCategory(item)?.trim();
    if (!category) continue;
    const key = category.toLowerCase();
    if (!seen.has(key)) seen.set(key, category);
  }
  return [...seen.values()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

/** Parses a comma-separated tags input field into a clean, deduplicated (case-insensitive,
 * first-seen casing kept) tag list — the one place free-text tag entry becomes ImportedContent's
 * `metadata.tags`, used identically by the import preview and the metadata editor so both produce
 * the same shape. */
export function parseTagsInput(input: string): string[] {
  const seen = new Map<string, string>();
  for (const raw of input.split(',')) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  }
  return [...seen.values()];
}
