import { describe, it, expect } from 'vitest';
import { parseBlocks, splitCellLines } from './FormattedText';
import { PYQ_BANK } from '../../data/pyq';

describe('parseBlocks — plain text (non-table) content', () => {
  it('renders ordinary text as a single text block, unchanged', () => {
    const text = 'What is the capital of India?';
    const blocks = parseBlocks(text);
    expect(blocks).toEqual([{ type: 'text', content: text }]);
  });

  it('does not mistake a single pipe-delimited line (no separator row) for a table', () => {
    const text = 'The ratio | is 2:3 | in this problem.';
    const blocks = parseBlocks(text);
    expect(blocks.every((b) => b.type === 'text')).toBe(true);
  });

  it('does not treat multi-line prose as a table even if some lines start with a word containing "|" nowhere', () => {
    const text = 'Line one of the question.\nLine two continues here.\n\nLine three, a new paragraph.';
    const blocks = parseBlocks(text);
    expect(blocks.every((b) => b.type === 'text')).toBe(true);
  });
});

describe('parseBlocks — well-formed markdown tables', () => {
  const table = '| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |';

  it('parses a standalone table into header + rows', () => {
    const blocks = parseBlocks(table);
    expect(blocks).toEqual([
      {
        type: 'table',
        header: ['A', 'B'],
        rows: [
          ['1', '2'],
          ['3', '4'],
        ],
      },
    ]);
  });

  it('parses text before and after a table into separate text blocks (text, table, text)', () => {
    const text = `Intro paragraph.\n\n${table}\n\nClosing paragraph.`;
    const blocks = parseBlocks(text);
    expect(blocks.map((b) => b.type)).toEqual(['text', 'table', 'text']);
    expect(blocks[0]).toEqual({ type: 'text', content: 'Intro paragraph.' });
    expect(blocks[2]).toEqual({ type: 'text', content: 'Closing paragraph.' });
  });

  it('accepts alignment markers in the separator row (:---, ---:, :---:)', () => {
    const aligned = '| Left | Center | Right |\n|:---|:---:|---:|\n| a | b | c |';
    const blocks = parseBlocks(aligned);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('table');
  });

  it('handles a wide table (5+ columns) without dropping any column', () => {
    const wide = '| Year | X | Y | Z | W |\n|---|---|---|---|---|\n| 2020 | 1 | 2 | 3 | 4 |';
    const blocks = parseBlocks(wide);
    expect(blocks[0]).toMatchObject({ header: ['Year', 'X', 'Y', 'Z', 'W'] });
    expect((blocks[0] as { rows: string[][] }).rows[0]).toHaveLength(5);
  });
});

describe('parseBlocks — malformed / ambiguous pipe content is not falsely rendered as a table', () => {
  it('a pipe-started line with no separator row on the next line stays plain text', () => {
    const text = '| A | B |\nSome ordinary follow-up line, not a table row.';
    const blocks = parseBlocks(text);
    expect(blocks.every((b) => b.type === 'text')).toBe(true);
  });
});

describe('splitCellLines — multiline text inside a table cell', () => {
  it('returns the original text unsplit when there is no <br>', () => {
    expect(splitCellLines('Plain cell')).toEqual(['Plain cell']);
  });

  it('splits a cell on <br> into multiple lines', () => {
    expect(splitCellLines('Line one<br>Line two')).toEqual(['Line one', 'Line two']);
  });

  it('splits on <br/> and <br /> case-insensitively too', () => {
    expect(splitCellLines('A<BR/>B<br />C')).toEqual(['A', 'B', 'C']);
  });

  it('a table with a multiline cell parses with the raw <br> preserved in the cell string', () => {
    const table = '| Note |\n|---|\n| First line<br>Second line |';
    const blocks = parseBlocks(table);
    expect(blocks[0]).toMatchObject({ rows: [['First line<br>Second line']] });
    expect(splitCellLines((blocks[0] as { rows: string[][] }).rows[0][0])).toEqual(['First line', 'Second line']);
  });
});

// ---------------------------------------------------------------------------
// Representative real PYQ questions — one from each year that has a table,
// plus a normal (non-table) 2016 question as a regression guard, since 2016
// has zero table-containing questions in the audited 458-question bank.
// ---------------------------------------------------------------------------
describe('parseBlocks against representative real PYQ_BANK questions', () => {
  function find(id: string) {
    const q = PYQ_BANK.find((p) => p.id === id);
    if (!q) throw new Error(`fixture question ${id} not found in PYQ_BANK`);
    return q;
  }

  it('2012 table question (pyq-2012-4, three-dataset mean table) renders as a table', () => {
    const blocks = parseBlocks(find('pyq-2012-4').question);
    expect(blocks.some((b) => b.type === 'table')).toBe(true);
  });

  it('2023 wide table question (pyq-2023-104, five-column company data) renders as a table with all columns', () => {
    const blocks = parseBlocks(find('pyq-2023-104').question);
    const table = blocks.find((b) => b.type === 'table');
    expect(table).toBeDefined();
    expect((table as { header: string[] }).header.length).toBeGreaterThanOrEqual(5);
  });

  it('2023 converted list-match question (pyq-2023-67) renders as a clean 2-column table', () => {
    const blocks = parseBlocks(find('pyq-2023-67').question);
    const table = blocks.find((b) => b.type === 'table') as { header: string[]; rows: string[][] } | undefined;
    expect(table).toBeDefined();
    expect(table?.header).toEqual(['List-I (Central Trade Union Federation)', 'List-II (Political Party)']);
    expect(table?.rows).toHaveLength(4);
  });

  it('2025 converted list-match question (pyq-45) renders as a clean 2-column table', () => {
    const blocks = parseBlocks(find('pyq-45').question);
    const table = blocks.find((b) => b.type === 'table') as { header: string[]; rows: string[][] } | undefined;
    expect(table).toBeDefined();
    expect(table?.rows).toHaveLength(4);
  });

  it('a normal 2016 question (no table in the bank for that year) renders as plain text only', () => {
    const q2016 = find('pyq-2016-1');
    const blocks = parseBlocks(q2016.question);
    expect(blocks.every((b) => b.type === 'text')).toBe(true);
  });

  it('every table-containing question in the real bank parses without throwing and yields at least one table block', () => {
    // Cross-check against the same detection the audit script used: any question field
    // containing a markdown pipe-table block must parse into a real table block.
    const tableIds = [
      'pyq-45',
      'pyq-2023-67',
      'pyq-2023-78',
      'pyq-2023-80',
      'pyq-2023-104',
      'pyq-2023-105',
      'pyq-2023-106',
      'pyq-2012-4',
      'pyq-2012-24',
      'pyq-2012-25',
      'pyq-2012-29',
      'pyq-2012-40',
      'pyq-2012-41',
      'pyq-2012-59',
      'pyq-2012-99',
    ];
    for (const id of tableIds) {
      const blocks = parseBlocks(find(id).question);
      expect(blocks.some((b) => b.type === 'table'), `expected ${id} to contain a table block`).toBe(true);
    }
  });
});
