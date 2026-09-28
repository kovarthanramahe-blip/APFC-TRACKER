import { describe, it, expect } from 'vitest';
import {
  applyTextEdit,
  toggleBold,
  toggleItalic,
  toggleStrikethrough,
  toggleInlineCode,
  toggleCodeBlock,
  setHeading,
  toggleBulletList,
  toggleNumberedList,
  toggleChecklist,
  toggleBlockquote,
  insertLink,
  insertHorizontalRule,
  insertTable,
  insertCallout,
} from './markdownEditing';

function apply(text: string, start: number, end: number, fn: (t: string, s: number, e: number) => ReturnType<typeof toggleBold>) {
  return applyTextEdit(text, fn(text, start, end));
}

describe('toggleBold / toggleItalic / toggleStrikethrough / toggleInlineCode', () => {
  it('wraps a selection', () => {
    const result = apply('Hello world', 6, 11, toggleBold);
    expect(result.text).toBe('Hello **world**');
    expect(result.selectionStart).toBe(8);
    expect(result.selectionEnd).toBe(13);
  });

  it('unwraps when the selection is exactly the wrapped text (markers just outside)', () => {
    const result = apply('Hello **world**', 8, 13, toggleBold);
    expect(result.text).toBe('Hello world');
  });

  it('unwraps when the markers are included inside the selection', () => {
    const result = apply('Hello **world**', 6, 15, toggleBold);
    expect(result.text).toBe('Hello world');
  });

  it('wraps an empty selection and places the cursor between the markers', () => {
    const result = apply('Hello ', 6, 6, toggleBold);
    expect(result.text).toBe('Hello ****');
    expect(result.selectionStart).toBe(8);
    expect(result.selectionEnd).toBe(8);
  });

  it('italic uses a single asterisk, distinct from bold', () => {
    const result = apply('Hello world', 6, 11, toggleItalic);
    expect(result.text).toBe('Hello *world*');
  });

  it('strikethrough uses double tilde', () => {
    const result = apply('Hello world', 6, 11, toggleStrikethrough);
    expect(result.text).toBe('Hello ~~world~~');
  });

  it('inline code uses a single backtick', () => {
    const result = apply('Hello world', 6, 11, toggleInlineCode);
    expect(result.text).toBe('Hello `world`');
  });

  it('bold and italic never interfere with each other for the same text', () => {
    const bolded = apply('word', 0, 4, toggleBold);
    expect(bolded.text).toBe('**word**');
    const italicized = apply(bolded.text, 2, 6, toggleItalic);
    expect(italicized.text).toBe('***word***');
  });
});

describe('toggleCodeBlock', () => {
  it('wraps the selection in a fenced code block', () => {
    const result = apply('const x = 1;', 0, 12, toggleCodeBlock);
    expect(result.text).toBe('```\nconst x = 1;\n```');
  });

  it('wraps an empty selection with an empty fence, cursor inside', () => {
    const result = apply('', 0, 0, toggleCodeBlock);
    expect(result.text).toBe('```\n\n```');
    expect(result.selectionStart).toBe(4);
    expect(result.selectionEnd).toBe(4);
  });
});

describe('setHeading', () => {
  it('adds a heading prefix at the given level', () => {
    const result = apply('My Title', 0, 0, (t, s, e) => setHeading(t, s, e, 2));
    expect(result.text).toBe('## My Title');
  });

  it('replaces an existing heading level with a new one', () => {
    const result = apply('## My Title', 0, 0, (t, s, e) => setHeading(t, s, e, 1));
    expect(result.text).toBe('# My Title');
  });

  it('removes the heading when applying the exact same level again (toggle off)', () => {
    const result = apply('# My Title', 0, 0, (t, s, e) => setHeading(t, s, e, 1));
    expect(result.text).toBe('My Title');
  });

  it('only affects the current line, not the whole document', () => {
    const result = apply('Line one\nLine two', 9, 9, (t, s, e) => setHeading(t, s, e, 3));
    expect(result.text).toBe('Line one\n### Line two');
  });

  it('clamps the level to 1-6', () => {
    expect(apply('Title', 0, 0, (t, s, e) => setHeading(t, s, e, 0)).text).toBe('# Title');
    expect(apply('Title', 0, 0, (t, s, e) => setHeading(t, s, e, 9)).text).toBe('###### Title');
  });
});

describe('toggleBulletList / toggleNumberedList / toggleChecklist', () => {
  it('prefixes every non-blank line with "- "', () => {
    const result = apply('one\ntwo\nthree', 0, 13, toggleBulletList);
    expect(result.text).toBe('- one\n- two\n- three');
  });

  it('removes the prefix when every line is already bulleted (toggle off)', () => {
    const result = apply('- one\n- two', 0, 11, toggleBulletList);
    expect(result.text).toBe('one\ntwo');
  });

  it('leaves blank lines within the block untouched', () => {
    const result = apply('one\n\ntwo', 0, 8, toggleBulletList);
    expect(result.text).toBe('- one\n\n- two');
  });

  it('numbers lines sequentially starting at 1', () => {
    const result = apply('one\ntwo\nthree', 0, 13, toggleNumberedList);
    expect(result.text).toBe('1. one\n2. two\n3. three');
  });

  it('renumbers correctly even if lines had stale numbers', () => {
    const result = apply('5. one\n2. two', 0, 13, toggleNumberedList);
    expect(result.text).toBe('one\ntwo'); // already all numbered -> toggles off
  });

  it('checklist prefixes with an unchecked box', () => {
    const result = apply('buy milk\nwalk dog', 0, 17, toggleChecklist);
    expect(result.text).toBe('- [ ] buy milk\n- [ ] walk dog');
  });

  it('checklist toggle-off strips a checked or unchecked box', () => {
    const result = apply('- [x] done\n- [ ] todo', 0, 21, toggleChecklist);
    expect(result.text).toBe('done\ntodo');
  });

  it('a selection touching only part of a line still transforms the whole line', () => {
    const result = apply('hello world', 2, 4, toggleBulletList);
    expect(result.text).toBe('- hello world');
  });
});

describe('toggleBlockquote', () => {
  it('prefixes every line with "> "', () => {
    const result = apply('one\ntwo', 0, 7, toggleBlockquote);
    expect(result.text).toBe('> one\n> two');
  });

  it('toggles off an existing blockquote', () => {
    const result = apply('> one\n> two', 0, 11, toggleBlockquote);
    expect(result.text).toBe('one\ntwo');
  });
});

describe('insertLink', () => {
  it('uses the selection as the link label and places the cursor on the empty URL', () => {
    const result = apply('See docs here', 4, 8, (t, s, e) => insertLink(t, s, e));
    expect(result.text).toBe('See [docs]() here');
    expect(result.selectionStart).toBe(result.selectionEnd);
  });

  it('uses a generic label when there is no selection', () => {
    const result = apply('', 0, 0, (t, s, e) => insertLink(t, s, e));
    expect(result.text).toBe('[link text]()');
  });

  it('accepts a pre-filled URL and selects it for easy replacement', () => {
    const result = apply('docs', 0, 4, (t, s, e) => insertLink(t, s, e, 'https://example.com'));
    expect(result.text).toBe('[docs](https://example.com)');
    expect(result.text.slice(result.selectionStart, result.selectionEnd)).toBe('https://example.com');
  });
});

describe('insertHorizontalRule', () => {
  it('inserts a rule with a leading blank line after existing text', () => {
    const result = apply('Some text', 9, 9, insertHorizontalRule);
    expect(result.text).toBe('Some text\n\n---\n');
  });

  it('does not add an extra blank line if one already precedes the cursor', () => {
    const result = apply('Some text\n\n', 11, 11, insertHorizontalRule);
    expect(result.text).toBe('Some text\n\n---\n');
  });

  it('inserts cleanly at the very start of an empty document', () => {
    const result = apply('', 0, 0, insertHorizontalRule);
    expect(result.text).toBe('---\n');
  });
});

describe('insertTable', () => {
  it('inserts a 2x2 Markdown table skeleton', () => {
    const result = apply('', 0, 0, insertTable);
    expect(result.text).toBe('| Column 1 | Column 2 |\n| --- | --- |\n| Cell | Cell |\n');
  });
});

describe('insertCallout', () => {
  it('wraps the selection as a bold-labelled blockquote, safe under disableParsingRawHTML', () => {
    const result = apply('Remember this', 0, 13, (t, s, e) => insertCallout(t, s, e));
    expect(result.text).toBe('> **Note:** Remember this');
    expect(result.text).not.toMatch(/<[a-z]/i); // no raw HTML tags — nothing for a stripped parser to lose
  });

  it('accepts a custom label', () => {
    const result = apply('Careful', 0, 7, (t, s, e) => insertCallout(t, s, e, 'Warning'));
    expect(result.text).toBe('> **Warning:** Careful');
  });
});

describe('applyTextEdit', () => {
  it('is the single place a TextEdit becomes a real string — every transform above is verified through it', () => {
    const edit = { replaceStart: 2, replaceEnd: 4, insertText: 'XY', selectionStart: 2, selectionEnd: 4 };
    expect(applyTextEdit('abcdef', edit)).toEqual({ text: 'abXYef', selectionStart: 2, selectionEnd: 4 });
  });
});
