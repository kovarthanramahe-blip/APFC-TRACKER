// Premium Knowledge Editor, Phase 5E — Obsidian-style internal links: `[[Target]]` and
// `[[Target|Display Text]]`, parsed out of plain Markdown text (Note.content or
// ImportedContent.rawContent — read-only, never mutated by this module) and resolved against the
// ACTIVE workspace's own Notes + ImportedContent. A pure module, no store/DOM access — Notes.tsx
// (rendering/autocomplete) and lib/backlinks.ts (relationship sync on save) are the only callers.
//
// Resolution order, exactly as specified — no fuzzy matching, ever:
//   1. Stable id — `target` is literally an existing Note/ImportedContent id in this workspace
//      (this is what the autocomplete, Phase 5G, actually inserts: `[[<id>|<title>]]`, so a link
//      survives the target being renamed later).
//   2. Exact title match, case-sensitive.
//   3. Exact NORMALIZED title match (trim + collapse whitespace + lowercase) — only when it
//      resolves to exactly ONE item.
//   4. Otherwise unresolved. An exact-tier or normalized-tier match to MORE than one item is
//      'ambiguous', never silently resolved to either — the whole point of this ordering is to
//      never guess.
// Never resolves across workspaces, never invents a match, never throws on malformed input.
import type { ImportedContent } from './contentImport';
import type { Note } from './types';
import type { WorkspaceKind } from './workspace';
import { effectiveImportedContentWorkspaceId, effectiveNoteWorkspaceId } from './repository';
import type { TextEdit } from './markdownEditing';

export interface WikiLinkToken {
  /** The full `[[...]]` match, verbatim, as it appears in the source text. */
  raw: string;
  /** The part before `|` (or the whole inner text if there's no `|`) — an id or a title, not yet
   * resolved to either. */
  target: string;
  /** The part after `|`, or `target` itself when there's no `|` — what a reader actually sees. */
  display: string;
  /** Index into the source text where `raw` starts/ends (end is exclusive). */
  start: number;
  end: number;
}

const WIKI_LINK_PATTERN = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

/** Extracts every `[[...]]` occurrence from `text`, in source order. A malformed/unterminated
 * `[[` (no matching `]]`) simply produces no token for it — never a partial or guessed one. Purely
 * a parse step: nothing here is resolved against any document yet. */
export function parseWikiLinks(text: string): WikiLinkToken[] {
  const tokens: WikiLinkToken[] = [];
  for (const match of text.matchAll(WIKI_LINK_PATTERN)) {
    const target = match[1].trim();
    if (!target) continue; // "[[]]" or "[[|Display]]" names nothing — not a real link
    const display = (match[2] ?? match[1]).trim() || target;
    tokens.push({ raw: match[0], target, display, start: match.index, end: match.index + match[0].length });
  }
  return tokens;
}

export type WikiLinkTargetType = 'note' | 'imported_content';

export type WikiLinkResolution =
  | { status: 'resolved'; targetType: WikiLinkTargetType; targetId: string; targetTitle: string }
  | { status: 'ambiguous' }
  | { status: 'unresolved' };

export interface ResolvedWikiLink {
  token: WikiLinkToken;
  resolution: WikiLinkResolution;
}

export interface WikiLinkResolutionContext {
  notes: readonly Note[];
  importedContent: readonly ImportedContent[];
  workspaceId: WorkspaceKind;
}

/** trim + collapse internal whitespace + lowercase — deliberately NOT fuzzy (no typo-tolerance, no
 * partial matching): two titles differing only in case/spacing are treated as "the same", nothing
 * looser than that. */
function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ').toLowerCase();
}

interface Candidate {
  type: WikiLinkTargetType;
  id: string;
  title: string;
}

export function resolveWikiLink(token: WikiLinkToken, ctx: WikiLinkResolutionContext): WikiLinkResolution {
  const notes = ctx.notes.filter((n) => effectiveNoteWorkspaceId(n) === ctx.workspaceId);
  const content = ctx.importedContent.filter((c) => effectiveImportedContentWorkspaceId(c) === ctx.workspaceId);

  // Tier 1 — stable id. An id is unique by construction, so a match here is always unambiguous.
  const noteById = notes.find((n) => n.id === token.target);
  if (noteById) return { status: 'resolved', targetType: 'note', targetId: noteById.id, targetTitle: noteById.title };
  const contentById = content.find((c) => c.id === token.target);
  if (contentById) return { status: 'resolved', targetType: 'imported_content', targetId: contentById.id, targetTitle: contentById.title };

  const allCandidates: Candidate[] = [
    ...notes.map((n) => ({ type: 'note' as const, id: n.id, title: n.title })),
    ...content.map((c) => ({ type: 'imported_content' as const, id: c.id, title: c.title })),
  ];

  // Tier 2 — exact title, case-sensitive.
  const exactMatches = allCandidates.filter((c) => c.title === token.target);
  if (exactMatches.length === 1) return toResolved(exactMatches[0]);
  if (exactMatches.length > 1) return { status: 'ambiguous' };

  // Tier 3 — exact normalized title, only when it narrows to exactly one candidate.
  const normalizedTarget = normalizeTitle(token.target);
  const normalizedMatches = allCandidates.filter((c) => normalizeTitle(c.title) === normalizedTarget);
  if (normalizedMatches.length === 1) return toResolved(normalizedMatches[0]);
  if (normalizedMatches.length > 1) return { status: 'ambiguous' };

  return { status: 'unresolved' };
}

function toResolved(candidate: Candidate): WikiLinkResolution {
  return { status: 'resolved', targetType: candidate.type, targetId: candidate.id, targetTitle: candidate.title };
}

/** Parses AND resolves every wiki-link in `text` in one call — the one function Notes.tsx and
 * lib/backlinks.ts actually call. */
export function extractWikiLinks(text: string, ctx: WikiLinkResolutionContext): ResolvedWikiLink[] {
  return parseWikiLinks(text).map((token) => ({ token, resolution: resolveWikiLink(token, ctx) }));
}

/** Builds the exact `[[id|Display]]` syntax the autocomplete (Phase 5G) inserts — id-anchored so
 * the link keeps resolving even if the target is later renamed (Tier 1 above). */
export function formatWikiLink(targetId: string, displayTitle: string): string {
  return `[[${targetId}|${displayTitle}]]`;
}

export interface WikiLinkAutocompleteTrigger {
  /** Index right after the opening "[[". */
  start: number;
  /** Cursor position — the end of whatever's been typed since "[[". */
  end: number;
  query: string;
}

/** Detects an ACTIVE "start typing a link" trigger ending at `cursor` — the nearest "[[" before the
 * cursor with no "]" or newline in between (so `[[already closed]] more text` never re-triggers,
 * and a link never spans a line break). Unlike lib/slashCommands.ts's trigger, this one is NOT
 * restricted to the start of a line — a wiki-link can start mid-sentence. */
export function detectWikiLinkAutocompleteTrigger(text: string, cursor: number): WikiLinkAutocompleteTrigger | null {
  const beforeCursor = text.slice(0, cursor);
  const match = /\[\[([^\]\n]*)$/.exec(beforeCursor);
  if (!match) return null;
  return { start: match.index + 2, end: cursor, query: match[1] };
}

/** Builds the TextEdit that replaces an active autocomplete trigger's "[[query" span (including
 * the opening brackets) with the fully-formed `[[id|title]]` link — the one function
 * WikiLinkAutocomplete's onSelect calls. */
export function buildWikiLinkInsertEdit(trigger: WikiLinkAutocompleteTrigger, targetId: string, targetTitle: string): TextEdit {
  const insertText = formatWikiLink(targetId, targetTitle);
  const replaceStart = trigger.start - 2; // include the "[[" itself
  const selection = replaceStart + insertText.length;
  return { replaceStart, replaceEnd: trigger.end, insertText, selectionStart: selection, selectionEnd: selection };
}

export interface WikiLinkCandidate {
  id: string;
  title: string;
  type: WikiLinkTargetType;
}

/**
 * Phase 5L — the expensive half of building autocomplete candidates: scan + map + sort every Note
 * and ImportedContent item down to `workspaceId`'s own workspace, excluding `excludeId` (a note
 * editing itself should never suggest linking to itself). Deliberately split out of
 * searchWikiLinkCandidates below so a caller (Notes.tsx's NoteEditor) can memoize this pool once per
 * notes/importedContent/workspace change, rather than re-scanning the entire repository on every
 * keystroke of the autocomplete query — only the cheap substring filter (filterWikiLinkCandidates)
 * needs to re-run per keystroke.
 */
export function buildWikiLinkCandidatePool(
  notes: readonly Note[],
  importedContent: readonly ImportedContent[],
  workspaceId: WorkspaceKind,
  excludeId?: string,
): WikiLinkCandidate[] {
  const noteCandidates: WikiLinkCandidate[] = notes
    .filter((n) => effectiveNoteWorkspaceId(n) === workspaceId && n.id !== excludeId)
    .map((n) => ({ id: n.id, title: n.title, type: 'note' as const }));
  const contentCandidates: WikiLinkCandidate[] = importedContent
    .filter((c) => effectiveImportedContentWorkspaceId(c) === workspaceId && c.id !== excludeId)
    .map((c) => ({ id: c.id, title: c.title, type: 'imported_content' as const }));
  return [...noteCandidates, ...contentCandidates].sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()));
}

/** The cheap half: case-insensitive SUBSTRING match of `query` against an already-built candidate
 * pool (deliberately more lenient than resolveWikiLink's own strict resolution tiers above: this is
 * a human picking from a visible list, not the parser silently guessing a target, so a looser
 * search here is safe — whatever gets picked is inserted as a Tier-1 stable-id link, which then
 * always resolves exactly). An empty query returns the whole pool, already sorted. */
export function filterWikiLinkCandidates(pool: readonly WikiLinkCandidate[], query: string): WikiLinkCandidate[] {
  const q = query.trim().toLowerCase();
  return q ? pool.filter((c) => c.title.toLowerCase().includes(q)) : [...pool];
}

/** Convenience wrapper composing the two functions above in one call — kept for callers (and
 * existing tests) that don't need per-keystroke memoization of the pool. Notes.tsx's NoteEditor
 * calls the two halves separately instead (see buildWikiLinkCandidatePool's own header). */
export function searchWikiLinkCandidates(
  query: string,
  notes: readonly Note[],
  importedContent: readonly ImportedContent[],
  workspaceId: WorkspaceKind,
  excludeId?: string,
): WikiLinkCandidate[] {
  return filterWikiLinkCandidates(buildWikiLinkCandidatePool(notes, importedContent, workspaceId, excludeId), query);
}
