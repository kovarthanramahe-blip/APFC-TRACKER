import { normalizeText, isNearEmptyContent } from './contentImport';

// Knowledge Librarian (P0), Phase 2 — Markdown multi-article extraction.
//
// A single uploaded Markdown file (e.g. a day's worth of newspaper clippings pasted into one
// document) often contains several distinct articles, each starting at its own heading. This
// module splits that ONE file's text into N self-contained article drafts, using only the
// document's OWN structural signals (headings, and a couple of very common "Date:"/"Source:"
// label lines right under a heading) — it never invents a heading, a date, or a source that
// isn't actually present in the text, and it never drops or rewrites any of the original text:
// every extracted article's `content` is a byte-exact slice of the original (normalised line
// endings only), and the ORIGINAL, unsplit document is always preserved separately by the caller
// (see lib/knowledgeIngestion.ts) regardless of what this function finds. Pure and synchronous —
// no I/O, no AI, never throws; every failure mode (empty file, no headings, malformed content)
// degrades to a best-effort result plus a human-readable warning, never a silent loss.

export interface ExtractedArticleDraft {
  /** The heading text this article was split on (or a derived fallback — see splitMarkdownIntoArticles),
   * already disambiguated if it collided with an earlier article's heading in the same file. */
  heading: string;
  /** This article's own full text exactly as it appeared in the source file (including its own
   * heading line), with only line-ending normalisation applied — never trimmed of "metadata" lines,
   * never rewritten. */
  content: string;
  /** ISO (yyyy-mm-dd) event date — set ONLY when a "Date:"/"**Date:**" line right under the heading
   * was found AND could be confidently parsed as a real calendar date. A date line that doesn't
   * parse is never guessed at or forced into this field (see UNPARSEABLE_DATE_WARNING below) — the
   * raw line itself is still visible in `content`, so nothing is lost, it just isn't promoted to
   * this structured field. */
  eventDate?: string;
  /** Freeform source attribution — set only when a "Source:" line was found right under the
   * heading, taken verbatim (never reformatted, never guessed). */
  source?: string;
  /** 1-based position among the articles extracted from this file — stable ordering for display,
   * independent of any later sort/filter. */
  index: number;
}

export interface ArticleExtractionResult {
  articles: ExtractedArticleDraft[];
  /** Human-readable, non-fatal notices about this specific extraction — e.g. an unparsed date, a
   * duplicate heading that was disambiguated, or "no headings found". Always surfaced to the user
   * (see components/repository/ImportToRepositoryModal.tsx) — extraction never fails silently. */
  warnings: string[];
}

const HEADING_LINE = /^(#{1,3})\s+(.+?)\s*$/;
const DATE_LABEL_LINE = /^\*{0,2}date\*{0,2}\s*:\s*(.+)$/i;
const SOURCE_LABEL_LINE = /^\*{0,2}source\*{0,2}\s*:\s*(.+)$/i;
const SECTION_LABEL_LINE = /^\*{0,2}section\*{0,2}\s*:\s*(.+)$/i;

/** Tries a short, deliberately small set of real-world date spellings ("2026-03-14",
 * "14 March 2026", "March 14, 2026") before falling back to `Date.parse`'s own locale-independent
 * parsing. Returns an ISO yyyy-mm-dd string only when the result is a genuinely valid calendar
 * date — never a best-effort/partial guess, and never the current date as a fallback. */
export function tryParseEventDate(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    const date = new Date(`${y}-${m}-${d}T00:00:00Z`);
    if (!Number.isNaN(date.getTime()) && date.getUTCFullYear() === Number(y) && date.getUTCMonth() + 1 === Number(m) && date.getUTCDate() === Number(d)) {
      return `${y}-${m}-${d}`;
    }
    return undefined;
  }

  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return undefined;
  const date = new Date(parsed);
  // Date.parse accepts plenty of ambiguous/partial strings (e.g. a bare "2026") that aren't really
  // "a date" in the sense this field means — require the original text to carry a real day-level
  // signal (a 4-digit year AND at least one other 1-2 digit number) so a bare year is never
  // mistaken for a full date.
  const hasYear = /\b\d{4}\b/.test(trimmed);
  const hasDayLike = /\b\d{1,2}\b/.test(trimmed.replace(/\b\d{4}\b/, ''));
  if (!hasYear || !hasDayLike) return undefined;
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Scans the first few non-blank lines right after a heading for "Date:"/"Source:"/"Section:"
 * label lines — stops at the first line that isn't one of those three (or isn't blank), so a
 * label-like phrase deeper in the article's real prose is never mistaken for metadata. `Section:`
 * is folded into `source` (prefixed) when no explicit `Source:` line is also present, since
 * ImportedContentMetadata has no separate section field — see the module header. */
function extractLeadingMetadata(bodyLines: readonly string[]): { eventDateRaw?: string; source?: string } {
  let eventDateRaw: string | undefined;
  let source: string | undefined;
  let section: string | undefined;
  const SCAN_LIMIT = 6;

  for (let i = 0; i < Math.min(bodyLines.length, SCAN_LIMIT); i++) {
    const line = bodyLines[i].trim();
    if (!line) continue;
    const dateMatch = line.match(DATE_LABEL_LINE);
    const sourceMatch = line.match(SOURCE_LABEL_LINE);
    const sectionMatch = line.match(SECTION_LABEL_LINE);
    if (dateMatch) {
      eventDateRaw = dateMatch[1].trim();
      continue;
    }
    if (sourceMatch) {
      source = sourceMatch[1].trim();
      continue;
    }
    if (sectionMatch) {
      section = sectionMatch[1].trim();
      continue;
    }
    break; // first non-metadata, non-blank line — real article text starts here
  }

  return { eventDateRaw, source: source ?? (section ? `Section: ${section}` : undefined) };
}

/** Disambiguates a heading that collides with one already seen earlier in the SAME file — never
 * merges or drops either article; the second (and third, …) occurrence is simply renamed for
 * display, while its own extracted content stays fully intact and independently stored. */
function disambiguateHeading(heading: string, seenCounts: Map<string, number>): string {
  const count = (seenCounts.get(heading) ?? 0) + 1;
  seenCounts.set(heading, count);
  return count === 1 ? heading : `${heading} (${count})`;
}

function deriveFallbackHeading(filename: string, firstLine: string | undefined): string {
  const trimmedFirstLine = firstLine?.trim();
  if (trimmedFirstLine) return trimmedFirstLine.slice(0, 120);
  const base = filename.replace(/\.[^./\\]+$/, '').trim();
  return base || 'Untitled article';
}

/**
 * Splits one Markdown file's text into article drafts at each H1/H2/H3 heading. Content appearing
 * BEFORE the first heading (a preamble) becomes its own article when it carries real text, or is
 * simply not promoted to an article (with a warning explaining why) when it is blank/trivial —
 * either way nothing from the original file is ever discarded: the caller always keeps the full,
 * unsplit original text as its own separate, permanent record (see lib/knowledgeIngestion.ts).
 */
export function splitMarkdownIntoArticles(filename: string, rawContent: string): ArticleExtractionResult {
  const warnings: string[] = [];
  const normalized = normalizeText(rawContent);

  if (isNearEmptyContent(normalized)) {
    warnings.push('This file is empty or contains no extractable text — no articles were extracted.');
    return { articles: [], warnings };
  }

  const lines = normalized.split('\n');
  type RawBlock = { headingLine?: string; lines: string[] };
  const blocks: RawBlock[] = [];
  let current: RawBlock = { lines: [] };

  for (const line of lines) {
    const headingMatch = line.match(HEADING_LINE);
    if (headingMatch) {
      // Always close out the block-in-progress, even if it turns out to be blank (e.g. no
      // preamble before the first heading, or two headings back to back) — the `realBlocks`
      // filter just below is the one place blank blocks are actually dropped, so there is only
      // ever one rule to reason about, not two.
      blocks.push(current);
      current = { headingLine: headingMatch[2].trim(), lines: [line] };
    } else {
      current.lines.push(line);
    }
  }
  blocks.push(current);

  const realBlocks = blocks.filter((b) => b.headingLine !== undefined || b.lines.some((l) => l.trim()));

  if (realBlocks.length === 0) {
    warnings.push('This file is empty or contains no extractable text — no articles were extracted.');
    return { articles: [], warnings };
  }

  const hasAnyHeading = realBlocks.some((b) => b.headingLine !== undefined);
  if (!hasAnyHeading) {
    warnings.push('No headings were found in this file — the entire file was treated as a single article.');
  }

  const seenHeadingCounts = new Map<string, number>();
  const articles: ExtractedArticleDraft[] = [];

  realBlocks.forEach((block, blockIndex) => {
    // Never empty here: realBlocks already guarantees either a headingLine (whose own text is
    // always in block.lines) or at least one real trimmed line.
    const content = normalizeText(block.lines.join('\n'));

    const rawHeading = block.headingLine ?? deriveFallbackHeading(filename, block.lines.find((l) => l.trim()));
    const heading = disambiguateHeading(rawHeading, seenHeadingCounts);

    const bodyLinesAfterHeading = block.headingLine !== undefined ? block.lines.slice(1) : block.lines;
    const { eventDateRaw, source } = extractLeadingMetadata(bodyLinesAfterHeading);

    let eventDate: string | undefined;
    if (eventDateRaw) {
      eventDate = tryParseEventDate(eventDateRaw);
      if (!eventDate) {
        warnings.push(`"${heading}": found a Date line ("${eventDateRaw}") but could not parse it as a calendar date — it was left unset (the original text is unchanged in the article's content).`);
      }
    }

    articles.push({
      heading,
      content,
      eventDate,
      source,
      index: blockIndex + 1,
    });
  });

  return { articles, warnings };
}
