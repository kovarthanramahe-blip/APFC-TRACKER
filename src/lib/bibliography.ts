import type { ImportedContent, ImportedContentMetadata } from './contentImport';
import { queryImportedContent, parseTagsInput, type ImportedContentSortOrder } from './importedContentRepository';

// PhD Research — Working Bibliography. A bibliography record is just an ImportedContent with
// contentType 'bibliography'; its structured fields (authors, year, DOI, …) live at
// `metadata.bibliography`, never as new top-level fields on ImportedContent (same discipline the
// repository-organisation stage applied to tags/category — see contentImport.ts's
// ImportedContentMetadata doc comment, which anticipated exactly this). No new persistence
// mechanism, no duplicated store: everything here reads/writes the same workspace-scoped
// `importedContent` collection every other content type uses.
//
// Two ways a record comes to exist:
//  - STRUCTURED IMPORT: a user uploads a file written in the documented "Key: value" block format
//    (see BIBLIOGRAPHY_FORMAT_GUIDE below) — parseBibliographyRecords turns it into one
//    BibliographyRecordDraft per block, each becoming its own ImportedContent, with rawContent
//    preserving that record's own original text block verbatim.
//  - MANUAL ENTRY: a user fills in a form (pages/WorkingBibliography.tsx) — no file, no parsing;
//    createManualImportedContent (contentImport.ts) builds the record directly.
// Deliberately NOT implemented here: automatic bibliographic extraction from arbitrary PDFs/DOCX
// prose. A file that isn't written in the documented format simply produces zero parsed records —
// the caller then falls back to importing it as a single, unstructured bibliography document
// (exactly like pages/PhdResearch.tsx's research_document flow), never a guessed/fabricated record.

export const BIBLIOGRAPHY_PUBLICATION_TYPES = [
  'journal-article',
  'book',
  'book-chapter',
  'conference-paper',
  'thesis',
  'report',
  'website',
  'other',
] as const;

export type BibliographyPublicationType = (typeof BIBLIOGRAPHY_PUBLICATION_TYPES)[number];

export const BIBLIOGRAPHY_PUBLICATION_TYPE_LABELS: Record<BibliographyPublicationType, string> = {
  'journal-article': 'Journal Article',
  book: 'Book',
  'book-chapter': 'Book Chapter',
  'conference-paper': 'Conference Paper',
  thesis: 'Thesis / Dissertation',
  report: 'Report',
  website: 'Website',
  other: 'Other',
};

/**
 * The structured fields a bibliography record can carry — every field optional, since a real
 * source (or a user cataloguing one by hand) rarely has all of them, and this module never invents
 * a value for one that wasn't actually given.
 */
export interface BibliographyFields {
  authors?: string[];
  year?: string;
  publicationType?: BibliographyPublicationType;
  /** Journal name, book title, or publisher — whichever the source is published in/by. */
  containerTitle?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  doi?: string;
  isbn?: string;
  url?: string;
  /** A short citation/reference-manager key, e.g. "Smith2020". */
  citationKey?: string;
  notes?: string;
}

/** `item.metadata?.bibliography`, defaulting to `{}` for any item with no bibliography metadata
 * yet (a research_document, a legacy bibliography item saved before this field existed, …) —
 * never throws, never backfills a default onto the item itself. */
export function getBibliographyFields(item: ImportedContent): BibliographyFields {
  return (item.metadata?.bibliography as BibliographyFields | undefined) ?? {};
}

export function isManuallyCreated(item: ImportedContent): boolean {
  return item.provenance.origin === 'manual';
}

/** Splits a comma/semicolon-separated authors input field into a clean list — the one place
 * free-text author entry becomes BibliographyFields.authors, used identically by the structured
 * import parser and the manual-entry/edit form so both produce the same shape. Unlike
 * parseTagsInput, this never de-duplicates (two different people can share a name; that's not this
 * function's call to make). */
export function parseAuthorsInput(input: string): string[] {
  return input
    .split(/[,;]/)
    .map((a) => a.trim())
    .filter(Boolean);
}

/** True for BibliographyFields with at least one real (non-empty) value set. */
function hasAnyField(fields: BibliographyFields): boolean {
  return Object.values(fields).some((v) => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== ''));
}

/**
 * Builds the `metadata` object confirmImportedContent/createManualImportedContent/
 * updateImportedContent should be given for a bibliography record — `undefined` when there is
 * truly nothing to store (matches the shape of a pre-organisation-stage legacy item exactly), so a
 * fallback import with zero parsed fields and no tags/category behaves identically to any other
 * content type's metadata-less item.
 */
export function buildBibliographyMetadata(input: { fields?: BibliographyFields; tags?: string[]; category?: string }): ImportedContentMetadata | undefined {
  const fields = input.fields ?? {};
  const tags = input.tags ?? [];
  const category = input.category?.trim();
  if (!hasAnyField(fields) && tags.length === 0 && !category) return undefined;
  const metadata: ImportedContentMetadata = {};
  if (hasAnyField(fields)) metadata.bibliography = fields;
  if (tags.length > 0) metadata.tags = tags;
  if (category) metadata.category = category;
  return metadata;
}

// ============================================================================================
// Publication-type normalisation — a controlled mapping from freeform text (typed in a form, or
// read from a "Type:" line) onto the fixed BIBLIOGRAPHY_PUBLICATION_TYPES set. This categorises
// what a user/source actually said, it never invents a type for a record that didn't specify one —
// an absent "Type:" line leaves `publicationType` unset, not defaulted to 'other'.
// ============================================================================================

export function normalizePublicationType(rawLabel: string | undefined): BibliographyPublicationType | undefined {
  const label = rawLabel?.trim().toLowerCase();
  if (!label) return undefined;
  if ((BIBLIOGRAPHY_PUBLICATION_TYPES as readonly string[]).includes(label)) return label as BibliographyPublicationType;
  if (/chapter/.test(label)) return 'book-chapter';
  if (/journal|article/.test(label)) return 'journal-article';
  if (/book/.test(label)) return 'book';
  if (/conference|proceedings|symposium/.test(label)) return 'conference-paper';
  if (/thesis|dissertation/.test(label)) return 'thesis';
  if (/report|working paper/.test(label)) return 'report';
  if (/website|web ?page|online/.test(label)) return 'website';
  return 'other';
}

// ============================================================================================
// Structured import format — a plain, explicit "Key: value" block format, documented here and
// shown to the user in the import UI (see WorkingBibliography.tsx). Deliberately simple: one value
// per line, blocks separated by a line containing only "---". No multi-line values, no inference
// from prose — every field either matches a recognised "Key: value" line exactly, or it is left
// unset.
// ============================================================================================

export const BIBLIOGRAPHY_FORMAT_GUIDE = `Title: <required>
Authors: <comma-separated>
Year: <e.g. 2020>
Type: <e.g. Journal Article, Book, Book Chapter, Conference Paper, Thesis, Report, Website>
Journal/Book/Publisher: <container title>
Volume: <...>
Issue: <...>
Pages: <...>
DOI: <...>
ISBN: <...>
URL: <...>
Citation Key: <e.g. Smith2020>
Tags: <comma-separated>
Category: <...>
Notes: <...>

---

Title: <next record...>`;

export interface BibliographyRecordDraft {
  title: string;
  fields: BibliographyFields;
  tags: string[];
  category?: string;
  /** The original raw text block this record was parsed from, trimmed but otherwise verbatim —
   * this becomes the resulting ImportedContent's rawContent unchanged, never rewritten from the
   * parsed fields. */
  rawBlock: string;
}

export interface BibliographyParseResult {
  records: BibliographyRecordDraft[];
  /** Blocks in the source text with no recognisable "Title:" line, so no record could be built
   * from them without fabricating a title — never silently dropped from this count. */
  skippedBlockCount: number;
}

type BibliographyLineKey = keyof BibliographyFields | 'title' | 'tags' | 'category';

const FIELD_KEY_ALIASES: Record<string, BibliographyLineKey> = {
  title: 'title',
  author: 'authors',
  authors: 'authors',
  year: 'year',
  date: 'year',
  type: 'publicationType',
  'publication type': 'publicationType',
  journal: 'containerTitle',
  book: 'containerTitle',
  publisher: 'containerTitle',
  container: 'containerTitle',
  source: 'containerTitle',
  'journal/book/publisher': 'containerTitle',
  volume: 'volume',
  vol: 'volume',
  issue: 'issue',
  no: 'issue',
  pages: 'pages',
  page: 'pages',
  doi: 'doi',
  isbn: 'isbn',
  url: 'url',
  link: 'url',
  'citation key': 'citationKey',
  key: 'citationKey',
  id: 'citationKey',
  tags: 'tags',
  category: 'category',
  notes: 'notes',
  note: 'notes',
};

const LINE_PATTERN = /^([A-Za-z][A-Za-z/ ]*?)\s*:\s*(.*)$/;

function parseBlock(rawBlock: string): BibliographyRecordDraft | null {
  let title: string | undefined;
  const fields: BibliographyFields = {};
  let tags: string[] = [];
  let category: string | undefined;

  for (const rawLine of rawBlock.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    const match = line.match(LINE_PATTERN);
    if (!match) continue;
    const key = FIELD_KEY_ALIASES[match[1].trim().toLowerCase()];
    const value = match[2].trim();
    if (!key || !value) continue;

    switch (key) {
      case 'title':
        title = value;
        break;
      case 'tags':
        tags = parseTagsInput(value);
        break;
      case 'category':
        category = value;
        break;
      case 'authors':
        fields.authors = parseAuthorsInput(value);
        break;
      case 'publicationType':
        fields.publicationType = normalizePublicationType(value);
        break;
      default:
        fields[key] = value;
        break;
    }
  }

  if (!title) return null;
  return { title, fields, tags, category, rawBlock: rawBlock.trim() };
}

/**
 * The one function that turns raw extracted text into structured bibliography records. Blocks are
 * separated by a line containing only "---"; a file with no such separator is treated as a single
 * block. A block only becomes a record if it has a recognised "Title:" line — anything else is
 * counted in `skippedBlockCount` and never becomes a fabricated record. This never attempts to
 * infer structure from unstructured prose (a PDF's extracted text, a freeform note, …) — those
 * files simply parse to zero records, and the caller (pages/WorkingBibliography.tsx) falls back to
 * importing the whole file as one unstructured bibliography document instead.
 */
export function parseBibliographyRecords(rawText: string): BibliographyParseResult {
  const blocks = rawText
    .split(/\n[ \t]*-{3,}[ \t]*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  const records: BibliographyRecordDraft[] = [];
  let skippedBlockCount = 0;
  for (const block of blocks) {
    const record = parseBlock(block);
    if (record) records.push(record);
    else skippedBlockCount++;
  }
  return { records, skippedBlockCount };
}

/**
 * The inverse of parsing: renders a record's fields back into the same documented "Key: value"
 * format. Used to give a manually-created record a readable rawContent (so it stays full-text
 * searchable like an imported one — see lib/importedContentRepository.ts's searchImportedContent)
 * and, when editing a manually-created record, to keep that rawContent in sync with its fields
 * (see pages/WorkingBibliography.tsx — an IMPORTED record's rawContent is never regenerated this
 * way, to never silently overwrite original source content).
 */
export function formatBibliographyRecordAsText(input: { title: string; fields: BibliographyFields; tags?: string[]; category?: string }): string {
  const f = input.fields;
  const lines: string[] = [`Title: ${input.title}`];
  if (f.authors && f.authors.length > 0) lines.push(`Authors: ${f.authors.join(', ')}`);
  if (f.year) lines.push(`Year: ${f.year}`);
  if (f.publicationType) lines.push(`Type: ${BIBLIOGRAPHY_PUBLICATION_TYPE_LABELS[f.publicationType]}`);
  if (f.containerTitle) lines.push(`Journal/Book/Publisher: ${f.containerTitle}`);
  if (f.volume) lines.push(`Volume: ${f.volume}`);
  if (f.issue) lines.push(`Issue: ${f.issue}`);
  if (f.pages) lines.push(`Pages: ${f.pages}`);
  if (f.doi) lines.push(`DOI: ${f.doi}`);
  if (f.isbn) lines.push(`ISBN: ${f.isbn}`);
  if (f.url) lines.push(`URL: ${f.url}`);
  if (f.citationKey) lines.push(`Citation Key: ${f.citationKey}`);
  if (input.tags && input.tags.length > 0) lines.push(`Tags: ${input.tags.join(', ')}`);
  if (input.category) lines.push(`Category: ${input.category}`);
  if (f.notes) lines.push(`Notes: ${f.notes}`);
  return lines.join('\n');
}

// ============================================================================================
// Repository filters specific to bibliography's structured fields — built ON TOP of
// lib/importedContentRepository.ts's generic search/tag/category/sort utilities (queryImportedContent
// handles search/tags/category/sort; this module only adds author/year/publicationType, reusing
// rather than reimplementing everything else).
// ============================================================================================

export function filterBibliographyByAuthor(items: readonly ImportedContent[], author: string): ImportedContent[] {
  const wanted = author.trim().toLowerCase();
  if (!wanted) return [...items];
  return items.filter((item) => getBibliographyFields(item).authors?.some((a) => a.trim().toLowerCase() === wanted));
}

export function filterBibliographyByYear(items: readonly ImportedContent[], year: string): ImportedContent[] {
  const wanted = year.trim();
  if (!wanted) return [...items];
  return items.filter((item) => getBibliographyFields(item).year?.trim() === wanted);
}

export function filterBibliographyByPublicationType(items: readonly ImportedContent[], type: BibliographyPublicationType): ImportedContent[] {
  return items.filter((item) => getBibliographyFields(item).publicationType === type);
}

export interface BibliographyQuery {
  search?: string;
  tags?: readonly string[];
  category?: string;
  author?: string;
  year?: string;
  publicationType?: BibliographyPublicationType;
  sort?: ImportedContentSortOrder;
}

/** The single entry point pages/WorkingBibliography.tsx calls: the generic search/tag/category/
 * sort query (queryImportedContent), then author/year/publicationType filters layered on top. */
export function queryBibliography(items: readonly ImportedContent[], query: BibliographyQuery): ImportedContent[] {
  let results = queryImportedContent(items, {
    search: query.search,
    tags: query.tags,
    category: query.category,
    sort: query.sort,
  });
  if (query.author) results = filterBibliographyByAuthor(results, query.author);
  if (query.year) results = filterBibliographyByYear(results, query.year);
  if (query.publicationType) results = filterBibliographyByPublicationType(results, query.publicationType);
  return results;
}

export function collectBibliographyAuthors(items: readonly ImportedContent[]): string[] {
  const seen = new Map<string, string>();
  for (const item of items) {
    for (const author of getBibliographyFields(item).authors ?? []) {
      const trimmed = author.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (!seen.has(key)) seen.set(key, trimmed);
    }
  }
  return [...seen.values()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
}

/** Distinct years present, newest first (numeric years sort numerically; any non-numeric year,
 * e.g. "n.d.", sorts after by plain string comparison). */
export function collectBibliographyYears(items: readonly ImportedContent[]): string[] {
  const years = new Set<string>();
  for (const item of items) {
    const y = getBibliographyFields(item).year?.trim();
    if (y) years.add(y);
  }
  return [...years].sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    const aIsNum = a !== '' && !Number.isNaN(na);
    const bIsNum = b !== '' && !Number.isNaN(nb);
    if (aIsNum && bIsNum) return nb - na;
    if (aIsNum !== bIsNum) return aIsNum ? -1 : 1;
    return b.localeCompare(a);
  });
}

export function collectBibliographyPublicationTypes(items: readonly ImportedContent[]): BibliographyPublicationType[] {
  const seen = new Set<BibliographyPublicationType>();
  for (const item of items) {
    const t = getBibliographyFields(item).publicationType;
    if (t) seen.add(t);
  }
  return BIBLIOGRAPHY_PUBLICATION_TYPES.filter((t) => seen.has(t));
}
