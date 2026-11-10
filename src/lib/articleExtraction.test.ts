import { describe, it, expect, afterEach } from 'vitest';
import { splitMarkdownIntoArticles, tryParseEventDate } from './articleExtraction';

describe('tryParseEventDate', () => {
  it('parses an ISO yyyy-mm-dd date exactly', () => {
    expect(tryParseEventDate('2026-03-14')).toBe('2026-03-14');
  });

  it('parses a common human-readable date', () => {
    expect(tryParseEventDate('14 March 2026')).toBe('2026-03-14');
    expect(tryParseEventDate('March 14, 2026')).toBe('2026-03-14');
  });

  it('rejects an invalid ISO-shaped date (e.g. month 13)', () => {
    expect(tryParseEventDate('2026-13-40')).toBeUndefined();
  });

  it('rejects a bare year with no day-level signal, rather than guessing', () => {
    expect(tryParseEventDate('2026')).toBeUndefined();
  });

  it('rejects garbage text', () => {
    expect(tryParseEventDate('not a date')).toBeUndefined();
  });

  it('rejects an empty string', () => {
    expect(tryParseEventDate('')).toBeUndefined();
    expect(tryParseEventDate('   ')).toBeUndefined();
  });
});

// The non-ISO branch previously did Date.parse('14 March 2026'), which gives LOCAL midnight, then
// read the result back with getUTCFullYear/getUTCMonth/getUTCDate. In a positive-offset timezone
// (e.g. IST, UTC+5:30) local midnight on the 14th is still the 13th in UTC, so the date silently
// rolled back a day. The fix reads the non-ISO branch back with the local getters instead — pinning
// process.env.TZ, as gamification.test.ts:187-206 does, rather than relying on the runner's own zone.
describe('tryParseEventDate — timezone independence (non-ISO branch)', () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    process.env.TZ = originalTz;
  });

  for (const tz of ['Asia/Kolkata', 'UTC', 'America/Los_Angeles']) {
    it(`parses a human-readable date to the same calendar day under ${tz}`, () => {
      process.env.TZ = tz;
      expect(tryParseEventDate('14 March 2026')).toBe('2026-03-14');
      expect(tryParseEventDate('March 14, 2026')).toBe('2026-03-14');
    });

    it(`leaves an ISO date unaffected by the timezone under ${tz}`, () => {
      process.env.TZ = tz;
      expect(tryParseEventDate('2026-03-14')).toBe('2026-03-14');
    });
  }
});

describe('splitMarkdownIntoArticles', () => {
  it('splits a file with multiple H2 headings into separate articles, preserving each heading as the title', () => {
    const md = ['## First Article', 'Some body text about topic one.', '', '## Second Article', 'Some body text about topic two.'].join('\n');

    const result = splitMarkdownIntoArticles('clippings.md', md);

    expect(result.articles).toHaveLength(2);
    expect(result.articles[0].heading).toBe('First Article');
    expect(result.articles[0].content).toContain('topic one');
    expect(result.articles[1].heading).toBe('Second Article');
    expect(result.articles[1].content).toContain('topic two');
    expect(result.articles[0].index).toBe(1);
    expect(result.articles[1].index).toBe(2);
    expect(result.warnings).toEqual([]);
  });

  it('never loses any of the original text — every extracted article content is a verbatim slice', () => {
    const md = '## Alpha\nAlpha body.\n\n## Beta\nBeta body.';
    const result = splitMarkdownIntoArticles('f.md', md);
    const combined = result.articles.map((a) => a.content).join('\n');
    expect(combined).toContain('Alpha body.');
    expect(combined).toContain('Beta body.');
  });

  it('extracts Date: and Source: metadata lines right under a heading', () => {
    const md = ['# Budget Announcement', 'Date: 2026-02-01', 'Source: The Hindu, 1 Feb 2026', '', 'Full article text goes here.'].join('\n');

    const result = splitMarkdownIntoArticles('f.md', md);

    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].eventDate).toBe('2026-02-01');
    expect(result.articles[0].source).toBe('The Hindu, 1 Feb 2026');
    // The metadata lines are never stripped from the content — nothing is silently removed.
    expect(result.articles[0].content).toContain('Date: 2026-02-01');
  });

  it('accepts bold-wrapped metadata labels ("**Date:**")', () => {
    const md = ['# Headline', '**Date:** 14 March 2026', 'Body.'].join('\n');
    const result = splitMarkdownIntoArticles('f.md', md);
    expect(result.articles[0].eventDate).toBe('2026-03-14');
  });

  it('folds a Section: line into source when no explicit Source: line is present', () => {
    const md = ['# Headline', 'Section: Economy', 'Body.'].join('\n');
    const result = splitMarkdownIntoArticles('f.md', md);
    expect(result.articles[0].source).toBe('Section: Economy');
  });

  it('warns but does not throw when a Date: line cannot be parsed, and keeps the raw text visible', () => {
    const md = ['# Headline', 'Date: sometime next week', 'Body.'].join('\n');
    const result = splitMarkdownIntoArticles('f.md', md);
    expect(result.articles[0].eventDate).toBeUndefined();
    expect(result.articles[0].content).toContain('Date: sometime next week');
    expect(result.warnings.some((w) => w.includes('could not parse'))).toBe(true);
  });

  it('treats a file with no headings at all as a single article, with a warning', () => {
    const md = 'Just some plain text with no heading at all, spanning a full paragraph of real content.';
    const result = splitMarkdownIntoArticles('plain.md', md);
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].content).toContain('Just some plain text');
    expect(result.warnings.some((w) => w.includes('No headings were found'))).toBe(true);
  });

  it('derives a fallback heading from the first real line when there is no heading', () => {
    const md = 'A clean one-line summary.\nMore detail follows.';
    const result = splitMarkdownIntoArticles('plain.md', md);
    expect(result.articles[0].heading).toBe('A clean one-line summary.');
  });

  it('promotes real preamble content before the first heading into its own article', () => {
    const md = ['An introductory paragraph with real content before any heading appears here.', '', '## Real Article', 'Body.'].join('\n');
    const result = splitMarkdownIntoArticles('f.md', md);
    expect(result.articles).toHaveLength(2);
    expect(result.articles[0].content).toContain('introductory paragraph');
    expect(result.articles[1].heading).toBe('Real Article');
  });

  it('drops a blank/trivial preamble before the first heading without creating an empty article', () => {
    const md = ['', '   ', '## Real Article', 'A full paragraph of real article body text, long enough to be meaningful.'].join('\n');
    const result = splitMarkdownIntoArticles('f.md', md);
    expect(result.articles).toHaveLength(1);
    expect(result.articles[0].heading).toBe('Real Article');
  });

  it('handles two headings back to back (no body between them) without crashing, keeping both', () => {
    const md = ['## First', '## Second', 'Body for second.'].join('\n');
    const result = splitMarkdownIntoArticles('f.md', md);
    expect(result.articles).toHaveLength(2);
    expect(result.articles[0].heading).toBe('First');
    expect(result.articles[1].heading).toBe('Second');
  });

  it('disambiguates duplicate headings within the same file rather than merging or dropping either', () => {
    const md = ['## Market Update', 'First version.', '', '## Market Update', 'Second, different version.'].join('\n');
    const result = splitMarkdownIntoArticles('f.md', md);
    expect(result.articles).toHaveLength(2);
    expect(result.articles[0].heading).toBe('Market Update');
    expect(result.articles[1].heading).toBe('Market Update (2)');
    expect(result.articles[0].content).toContain('First version.');
    expect(result.articles[1].content).toContain('Second, different version.');
  });

  it('returns zero articles with a clear warning for a completely empty file', () => {
    const result = splitMarkdownIntoArticles('empty.md', '');
    expect(result.articles).toEqual([]);
    expect(result.warnings.some((w) => w.toLowerCase().includes('empty'))).toBe(true);
  });

  it('returns zero articles with a clear warning for a whitespace-only file', () => {
    const result = splitMarkdownIntoArticles('whitespace.md', '   \n\n   \n');
    expect(result.articles).toEqual([]);
    expect(result.warnings.some((w) => w.toLowerCase().includes('empty'))).toBe(true);
  });

  it('never throws on malformed/garbage markdown', () => {
    const malformed = '### \n#\n##\n**Date:**\nSource:\n```broken fence with no close';
    expect(() => splitMarkdownIntoArticles('garbage.md', malformed)).not.toThrow();
  });

  it('handles H1/H2/H3 headings uniformly, never a deeper heading level', () => {
    const md = ['# One', 'a', '## Two', 'b', '### Three', 'c', '#### Four (not a split point)', 'd'].join('\n');
    const result = splitMarkdownIntoArticles('f.md', md);
    expect(result.articles.map((a) => a.heading)).toEqual(['One', 'Two', 'Three']);
    // The H4 line and its body stay inside the "Three" article's own content, verbatim.
    expect(result.articles[2].content).toContain('#### Four (not a split point)');
    expect(result.articles[2].content).toContain('d');
  });
});
