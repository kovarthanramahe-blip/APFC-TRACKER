import { cx } from '../../lib/utils';

// Renders question/option/explanation text that may contain a GitHub-flavoured-markdown
// pipe table embedded in an otherwise plain-text string (the PYQ data format already used
// throughout src/data/pyq.ts, e.g. `| Year | Company X | ... |\n|---|---|...`). Plain text
// with no table in it renders exactly as before (a whitespace-preserving paragraph), so this
// is a drop-in replacement for `<p className="whitespace-pre-line">{text}</p>` wherever PYQ
// content is shown — question text, options, and explanations, across every phase.

export interface TableBlock {
  type: 'table';
  header: string[];
  rows: string[][];
}
export interface TextBlock {
  type: 'text';
  content: string;
}
export type Block = TableBlock | TextBlock;

function isPipeRow(line: string): boolean {
  const t = line.trim();
  return t.startsWith('|') && t.endsWith('|') && t.length > 1;
}

// Matches a markdown table separator row, e.g. |---|---|  or  | :--- | ---: | :---: |
function isSeparatorRow(line: string): boolean {
  return /^\|(\s*:?-+:?\s*\|)+$/.test(line.trim());
}

function splitCells(line: string): string[] {
  const inner = line.trim().slice(1, -1);
  return inner.split('|').map((c) => c.trim());
}

export function parseBlocks(text: string): Block[] {
  const lines = text.split('\n');
  const blocks: Block[] = [];
  let buffer: string[] = [];
  let i = 0;

  function flushText() {
    const content = buffer.join('\n').trim();
    if (content) blocks.push({ type: 'text', content });
    buffer = [];
  }

  while (i < lines.length) {
    const line = lines[i];
    if (isPipeRow(line) && i + 1 < lines.length && isSeparatorRow(lines[i + 1])) {
      flushText();
      const header = splitCells(line);
      let j = i + 2;
      const rows: string[][] = [];
      while (j < lines.length && isPipeRow(lines[j])) {
        rows.push(splitCells(lines[j]));
        j++;
      }
      blocks.push({ type: 'table', header, rows });
      i = j;
    } else {
      buffer.push(line);
      i++;
    }
  }
  flushText();
  return blocks;
}

// A table cell can carry a literal `<br>` (there's no other way to put a line break inside a
// single-physical-line pipe-table row) — split on it and render as real line breaks.
export function splitCellLines(text: string): string[] {
  return text.split(/<br\s*\/?>/i);
}

function CellContent({ text }: { text: string }) {
  const parts = splitCellLines(text);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {part}
        </span>
      ))}
    </>
  );
}

export function FormattedText({ text, className }: { text: string; className?: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className={className}>
      {blocks.map((block, idx) =>
        block.type === 'table' ? (
          <div key={idx} className="my-3 max-w-full overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/80">
                  {block.header.map((cell, ci) => (
                    <th
                      key={ci}
                      className="whitespace-normal break-words border-b border-slate-200 px-3 py-2 text-left font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
                    >
                      <CellContent text={cell} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, ri) => (
                  <tr key={ri} className={cx(ri % 2 === 1 && 'bg-slate-50/60 dark:bg-slate-800/30')}>
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className="whitespace-normal break-words border-b border-slate-100 px-3 py-2 align-top text-slate-600 dark:border-slate-800 dark:text-slate-300"
                      >
                        <CellContent text={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p key={idx} className="whitespace-pre-line">
            {block.content}
          </p>
        ),
      )}
    </div>
  );
}
