import { describe, it, expect } from 'vitest';
import {
  parseWikiLinks,
  resolveWikiLink,
  extractWikiLinks,
  formatWikiLink,
  detectWikiLinkAutocompleteTrigger,
  buildWikiLinkInsertEdit,
  searchWikiLinkCandidates,
  buildWikiLinkCandidatePool,
  filterWikiLinkCandidates,
  type WikiLinkResolutionContext,
} from './wikiLinks';
import { applyTextEdit } from './markdownEditing';
import type { Note } from './types';
import type { ImportedContent } from './contentImport';

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: overrides.id ?? 'n1',
    subject: 'general',
    title: overrides.title ?? 'Untitled',
    content: overrides.content ?? '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    pinned: false,
    workspaceId: overrides.workspaceId ?? 'phd_research',
  };
}

function content(overrides: Partial<ImportedContent> = {}): ImportedContent {
  return {
    id: overrides.id ?? 'c1',
    workspaceId: overrides.workspaceId ?? 'phd_research',
    contentType: overrides.contentType ?? 'research_document',
    title: overrides.title ?? 'Untitled Document',
    rawContent: overrides.rawContent ?? '',
    provenance: overrides.provenance ?? { importedAt: '2026-01-01T00:00:00.000Z' },
  };
}

describe('parseWikiLinks', () => {
  it('parses a plain [[Target]] link', () => {
    const tokens = parseWikiLinks('See [[Coromandel]] for details.');
    expect(tokens).toHaveLength(1);
    expect(tokens[0]).toMatchObject({ raw: '[[Coromandel]]', target: 'Coromandel', display: 'Coromandel' });
  });

  it('parses [[Target|Display Text]] with a custom display', () => {
    const tokens = parseWikiLinks('See [[coromandel-doc-id|the Coromandel notes]] here.');
    expect(tokens[0]).toMatchObject({ target: 'coromandel-doc-id', display: 'the Coromandel notes' });
  });

  it('finds multiple links in source order with correct offsets', () => {
    const text = '[[A]] and [[B]]';
    const tokens = parseWikiLinks(text);
    expect(tokens).toHaveLength(2);
    expect(text.slice(tokens[0].start, tokens[0].end)).toBe('[[A]]');
    expect(text.slice(tokens[1].start, tokens[1].end)).toBe('[[B]]');
  });

  it('trims whitespace inside the brackets', () => {
    const tokens = parseWikiLinks('[[  Coromandel  |  Display  ]]');
    expect(tokens[0]).toMatchObject({ target: 'Coromandel', display: 'Display' });
  });

  it('ignores an empty [[]] — names nothing, never a link', () => {
    expect(parseWikiLinks('[[]]')).toEqual([]);
  });

  it('returns an empty array for text with no wiki-links', () => {
    expect(parseWikiLinks('Just plain text.')).toEqual([]);
  });

  it('never throws on malformed/unterminated brackets', () => {
    expect(() => parseWikiLinks('[[unterminated')).not.toThrow();
    expect(parseWikiLinks('[[unterminated')).toEqual([]);
  });
});

describe('resolveWikiLink — resolution order', () => {
  function ctx(overrides: Partial<WikiLinkResolutionContext> = {}): WikiLinkResolutionContext {
    return { notes: [], importedContent: [], workspaceId: 'phd_research', ...overrides };
  }

  it('Tier 1: resolves by stable id, even if the title differs from the link text', () => {
    const target = note({ id: 'note-abc', title: 'Renamed Title' });
    const tokens = parseWikiLinks('[[note-abc|Old Title]]');
    const resolution = resolveWikiLink(tokens[0], ctx({ notes: [target] }));
    expect(resolution).toEqual({ status: 'resolved', targetType: 'note', targetId: 'note-abc', targetTitle: 'Renamed Title' });
  });

  it('Tier 1 resolves an ImportedContent id too', () => {
    const target = content({ id: 'doc-1', title: 'A Document' });
    const tokens = parseWikiLinks('[[doc-1]]');
    const resolution = resolveWikiLink(tokens[0], ctx({ importedContent: [target] }));
    expect(resolution).toEqual({ status: 'resolved', targetType: 'imported_content', targetId: 'doc-1', targetTitle: 'A Document' });
  });

  it('Tier 2: resolves by exact, case-sensitive title when no id matches', () => {
    const target = note({ id: 'n1', title: 'Coromandel Sources' });
    const tokens = parseWikiLinks('[[Coromandel Sources]]');
    const resolution = resolveWikiLink(tokens[0], ctx({ notes: [target] }));
    expect(resolution).toEqual({ status: 'resolved', targetType: 'note', targetId: 'n1', targetTitle: 'Coromandel Sources' });
  });

  it('Tier 2 is case-sensitive — a differently-cased title does not match at this tier', () => {
    const target = note({ id: 'n1', title: 'Coromandel Sources' });
    const tokens = parseWikiLinks('[[coromandel sources]]');
    // falls through to Tier 3 (normalized) instead, which still resolves it
    const resolution = resolveWikiLink(tokens[0], ctx({ notes: [target] }));
    expect(resolution).toEqual({ status: 'resolved', targetType: 'note', targetId: 'n1', targetTitle: 'Coromandel Sources' });
  });

  it('Tier 3: resolves via normalized (trimmed/collapsed-whitespace/lowercased) title when unambiguous', () => {
    const target = note({ id: 'n1', title: 'Coromandel   Sources' });
    const tokens = parseWikiLinks('[[ coromandel sources ]]');
    const resolution = resolveWikiLink(tokens[0], ctx({ notes: [target] }));
    expect(resolution).toEqual({ status: 'resolved', targetType: 'note', targetId: 'n1', targetTitle: 'Coromandel   Sources' });
  });

  it('ambiguous: two items share the exact same title — never guesses, reports ambiguous', () => {
    const a = note({ id: 'n1', title: 'Duplicate Title' });
    const b = content({ id: 'c1', title: 'Duplicate Title' });
    const tokens = parseWikiLinks('[[Duplicate Title]]');
    const resolution = resolveWikiLink(tokens[0], ctx({ notes: [a], importedContent: [b] }));
    expect(resolution).toEqual({ status: 'ambiguous' });
  });

  it('ambiguous: two items share only the NORMALIZED title — still reported ambiguous, never guessed', () => {
    const a = note({ id: 'n1', title: 'Coromandel Sources' });
    const b = note({ id: 'n2', title: 'coromandel   sources' });
    const tokens = parseWikiLinks('[[COROMANDEL SOURCES]]');
    const resolution = resolveWikiLink(tokens[0], ctx({ notes: [a, b] }));
    expect(resolution).toEqual({ status: 'ambiguous' });
  });

  it('unresolved: no id, no exact title, no normalized title match at all', () => {
    const tokens = parseWikiLinks('[[Nonexistent Note]]');
    const resolution = resolveWikiLink(tokens[0], ctx({ notes: [note({ title: 'Something Else' })] }));
    expect(resolution).toEqual({ status: 'unresolved' });
  });

  it('never resolves across workspaces — a matching title in another workspace is invisible', () => {
    const otherWorkspaceNote = note({ id: 'n1', title: 'Coromandel Sources', workspaceId: 'upsc_cse' });
    const tokens = parseWikiLinks('[[Coromandel Sources]]');
    const resolution = resolveWikiLink(tokens[0], ctx({ notes: [otherWorkspaceNote], workspaceId: 'phd_research' }));
    expect(resolution).toEqual({ status: 'unresolved' });
  });

  it('an id from another workspace is never matched by id either', () => {
    const otherWorkspaceNote = note({ id: 'shared-id', workspaceId: 'upsc_cse' });
    const tokens = parseWikiLinks('[[shared-id]]');
    const resolution = resolveWikiLink(tokens[0], ctx({ notes: [otherWorkspaceNote], workspaceId: 'phd_research' }));
    expect(resolution).toEqual({ status: 'unresolved' });
  });
});

describe('extractWikiLinks', () => {
  it('parses and resolves every link in one pass', () => {
    const resolvableNote = note({ id: 'n1', title: 'Resolvable' });
    const text = '[[Resolvable]] and [[Missing]]';
    const results = extractWikiLinks(text, { notes: [resolvableNote], importedContent: [], workspaceId: 'phd_research' });
    expect(results).toHaveLength(2);
    expect(results[0].resolution.status).toBe('resolved');
    expect(results[1].resolution.status).toBe('unresolved');
  });

  it('returns an empty array for text with no links', () => {
    expect(extractWikiLinks('plain text', { notes: [], importedContent: [], workspaceId: 'apfc' })).toEqual([]);
  });
});

describe('formatWikiLink', () => {
  it('produces the exact id-anchored syntax the autocomplete inserts', () => {
    expect(formatWikiLink('note-123', 'My Note')).toBe('[[note-123|My Note]]');
  });

  it('round-trips through parseWikiLinks', () => {
    const formatted = formatWikiLink('abc', 'Some Title');
    const tokens = parseWikiLinks(formatted);
    expect(tokens[0]).toMatchObject({ target: 'abc', display: 'Some Title' });
  });
});

describe('detectWikiLinkAutocompleteTrigger', () => {
  it('detects a bare "[[" trigger', () => {
    const trigger = detectWikiLinkAutocompleteTrigger('[[', 2);
    expect(trigger).toEqual({ start: 2, end: 2, query: '' });
  });

  it('detects "[[Coro" being typed, with the query so far', () => {
    const trigger = detectWikiLinkAutocompleteTrigger('[[Coro', 6);
    expect(trigger).toEqual({ start: 2, end: 6, query: 'Coro' });
  });

  it('triggers mid-sentence, not only at line start', () => {
    const text = 'See [[Coro';
    const trigger = detectWikiLinkAutocompleteTrigger(text, text.length);
    expect(trigger).toEqual({ start: 6, end: 10, query: 'Coro' });
  });

  it('returns null once the link has already been closed with "]]"', () => {
    expect(detectWikiLinkAutocompleteTrigger('[[Done]] more text', 18)).toBeNull();
  });

  it('returns null when there is no "[[" at all', () => {
    expect(detectWikiLinkAutocompleteTrigger('plain text', 5)).toBeNull();
  });

  it('returns null once a newline separates the trigger from the cursor', () => {
    expect(detectWikiLinkAutocompleteTrigger('[[Title\nnext line', 18)).toBeNull();
  });

  it('the nearest unterminated "[[" wins when there are two on the same line', () => {
    const text = '[[First]] and [[Second';
    const trigger = detectWikiLinkAutocompleteTrigger(text, text.length);
    expect(trigger?.query).toBe('Second');
  });
});

describe('buildWikiLinkInsertEdit', () => {
  it('replaces the full "[[query" span (including the opening brackets) with the formatted link', () => {
    const text = 'See [[Coro';
    const trigger = detectWikiLinkAutocompleteTrigger(text, text.length)!;
    const edit = buildWikiLinkInsertEdit(trigger, 'note-1', 'Coromandel Sources');
    const result = applyTextEdit(text, edit);
    expect(result.text).toBe('See [[note-1|Coromandel Sources]]');
  });

  it('places the cursor right after the inserted link', () => {
    const text = '[[Co';
    const trigger = detectWikiLinkAutocompleteTrigger(text, text.length)!;
    const edit = buildWikiLinkInsertEdit(trigger, 'note-1', 'Coromandel');
    const result = applyTextEdit(text, edit);
    expect(result.selectionStart).toBe(result.text.length);
    expect(result.selectionEnd).toBe(result.text.length);
  });
});

describe('searchWikiLinkCandidates', () => {
  it('returns both Notes and ImportedContent from the workspace, sorted by title', () => {
    const n = note({ id: 'n1', title: 'Zebra Note' });
    const c = content({ id: 'c1', title: 'Alpha Document' });
    const results = searchWikiLinkCandidates('', [n], [c], 'phd_research');
    expect(results.map((r) => r.title)).toEqual(['Alpha Document', 'Zebra Note']);
    expect(results.find((r) => r.id === 'n1')?.type).toBe('note');
    expect(results.find((r) => r.id === 'c1')?.type).toBe('imported_content');
  });

  it('filters by case-insensitive substring', () => {
    const n = note({ id: 'n1', title: 'Coromandel Sources' });
    const other = note({ id: 'n2', title: 'Unrelated' });
    const results = searchWikiLinkCandidates('coro', [n, other], [], 'phd_research');
    expect(results.map((r) => r.id)).toEqual(['n1']);
  });

  it('never returns items from another workspace', () => {
    const n = note({ id: 'n1', title: 'Elsewhere', workspaceId: 'upsc_cse' });
    expect(searchWikiLinkCandidates('', [n], [], 'phd_research')).toEqual([]);
  });

  it('excludes the given id — a note never suggests linking to itself', () => {
    const n = note({ id: 'n1', title: 'Self' });
    const results = searchWikiLinkCandidates('', [n], [], 'phd_research', 'n1');
    expect(results).toEqual([]);
  });

  it('an empty query returns every candidate in the workspace', () => {
    const a = note({ id: 'n1', title: 'A' });
    const b = note({ id: 'n2', title: 'B' });
    expect(searchWikiLinkCandidates('', [a, b], [], 'phd_research')).toHaveLength(2);
  });
});

// Phase 5L — buildWikiLinkCandidatePool/filterWikiLinkCandidates split lets a caller (Notes.tsx's
// NoteEditor) memoize the expensive scan+sort once and re-run only the cheap filter per keystroke.
// Verifies the split composes back to exactly what searchWikiLinkCandidates itself returns.
describe('buildWikiLinkCandidatePool / filterWikiLinkCandidates', () => {
  it('composing the two halves matches searchWikiLinkCandidates exactly', () => {
    const n = note({ id: 'n1', title: 'Coromandel Sources' });
    const other = note({ id: 'n2', title: 'Unrelated' });
    const c = content({ id: 'c1', title: 'Coromandel Coast Document' });

    const pool = buildWikiLinkCandidatePool([n, other], [c], 'phd_research');
    expect(filterWikiLinkCandidates(pool, 'coro')).toEqual(searchWikiLinkCandidates('coro', [n, other], [c], 'phd_research'));
  });

  it('the same pool can be filtered by different queries without rebuilding it', () => {
    const a = note({ id: 'n1', title: 'Alpha' });
    const b = note({ id: 'n2', title: 'Beta' });
    const pool = buildWikiLinkCandidatePool([a, b], [], 'phd_research');

    expect(filterWikiLinkCandidates(pool, 'alpha').map((c) => c.id)).toEqual(['n1']);
    expect(filterWikiLinkCandidates(pool, 'beta').map((c) => c.id)).toEqual(['n2']);
    expect(filterWikiLinkCandidates(pool, '').map((c) => c.id).sort()).toEqual(['n1', 'n2']);
  });

  it('the pool itself is already workspace-scoped and self-excluded, exactly like searchWikiLinkCandidates', () => {
    const inWorkspace = note({ id: 'n1', title: 'Here' });
    const elsewhere = note({ id: 'n2', title: 'Elsewhere', workspaceId: 'upsc_cse' });
    const self = note({ id: 'n3', title: 'Self' });
    const pool = buildWikiLinkCandidatePool([inWorkspace, elsewhere, self], [], 'phd_research', 'n3');
    expect(pool.map((c) => c.id)).toEqual(['n1']);
  });
});
