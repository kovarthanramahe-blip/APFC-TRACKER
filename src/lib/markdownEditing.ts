// Premium Note Organisation, Phase 5B — pure Markdown-syntax text transforms for the toolbar/
// slash-command layer over Notes.tsx's existing plain <textarea> editor. Deliberately NOT a
// rich-text/WYSIWYG engine (no TipTap/ProseMirror/Slate/CodeMirror) — every function here takes the
// textarea's current text + selection and returns a TextEdit (a minimal replace-range + the text to
// insert + where the selection should land afterwards), which the UI layer applies to the REAL
// textarea element via document.execCommand('insertText', ...) so the browser's native undo/redo
// stack keeps working exactly as if the user had typed it (see components/editor/EditorToolbar.tsx
// for that apply step — pure text computation lives here, DOM application lives there, on purpose,
// since this module has no DOM dependency and is fully unit-testable without one).
//
// Every transform is a pure function of (text, selectionStart, selectionEnd) -> TextEdit. None of
// them mutate anything or touch React/DOM state — Notes.tsx's NoteEditor is the only caller that
// turns a TextEdit into an actual textarea change.

export interface TextEdit {
  /** Start index (in the ORIGINAL text) of the range being replaced. */
  replaceStart: number;
  /** End index (in the ORIGINAL text) of the range being replaced. */
  replaceEnd: number;
  /** Text to insert in place of that range. */
  insertText: string;
  /** Selection to apply after the edit, as offsets into the RESULT text. */
  selectionStart: number;
  selectionEnd: number;
}

/** Applies a TextEdit to `text`, returning the resulting full text + selection — used directly by
 * tests (so a test only has to assert the final text, not reconstruct it from replaceStart/End
 * itself) and as the non-execCommand fallback path in the UI layer. */
export function applyTextEdit(text: string, edit: TextEdit): { text: string; selectionStart: number; selectionEnd: number } {
  return {
    text: text.slice(0, edit.replaceStart) + edit.insertText + text.slice(edit.replaceEnd),
    selectionStart: edit.selectionStart,
    selectionEnd: edit.selectionEnd,
  };
}

/** Wraps (or unwraps, if already wrapped) the selection with `marker` on both sides — the shared
 * primitive behind bold/italic/strikethrough/inline code. An empty selection wraps an empty string
 * and places the cursor between the two markers, ready to type. */
function toggleWrap(text: string, start: number, end: number, marker: string): TextEdit {
  const selected = text.slice(start, end);
  const before = text.slice(Math.max(0, start - marker.length), start);
  const after = text.slice(end, end + marker.length);
  // For a single-character marker (italic's `*`), a run of TWO markers (bold's `**`) must never be
  // mistaken for one italic boundary — checking the character just outside the matched marker rules
  // that out, so toggling italic on text already wrapped in `**bold**` never eats one asterisk off
  // a bold marker.
  const charBeforeMarker = text.slice(Math.max(0, start - marker.length - 1), Math.max(0, start - marker.length));
  const charAfterMarker = text.slice(end + marker.length, end + marker.length + 1);
  const boundaryIsExact = charBeforeMarker !== marker[0] && charAfterMarker !== marker[marker.length - 1];

  // Case 1: the markers sit just OUTSIDE the current selection (selected the inner text only).
  if (before === marker && after === marker && marker.length > 0 && boundaryIsExact) {
    return {
      replaceStart: start - marker.length,
      replaceEnd: end + marker.length,
      insertText: selected,
      selectionStart: start - marker.length,
      selectionEnd: start - marker.length + selected.length,
    };
  }

  // Case 2: the markers are INSIDE the current selection (selected the whole "**text**").
  if (marker.length > 0 && selected.length >= marker.length * 2 && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(marker.length, selected.length - marker.length);
    return { replaceStart: start, replaceEnd: end, insertText: inner, selectionStart: start, selectionEnd: start + inner.length };
  }

  // Case 3: not wrapped yet — wrap it.
  const insertText = marker + selected + marker;
  return {
    replaceStart: start,
    replaceEnd: end,
    insertText,
    selectionStart: start + marker.length,
    selectionEnd: start + marker.length + selected.length,
  };
}

export function toggleBold(text: string, start: number, end: number): TextEdit {
  return toggleWrap(text, start, end, '**');
}

export function toggleItalic(text: string, start: number, end: number): TextEdit {
  return toggleWrap(text, start, end, '*');
}

export function toggleStrikethrough(text: string, start: number, end: number): TextEdit {
  return toggleWrap(text, start, end, '~~');
}

export function toggleInlineCode(text: string, start: number, end: number): TextEdit {
  return toggleWrap(text, start, end, '`');
}

/** Wraps the selection (or, for an empty selection, inserts an empty fenced block with the cursor
 * inside) in a fenced code block on its own lines. Always wraps — never toggles off — a multi-line
 * fence is ambiguous to reliably detect and remove, so this stays a simple, predictable insert. */
export function toggleCodeBlock(text: string, start: number, end: number): TextEdit {
  const selected = text.slice(start, end);
  const insertText = '```\n' + selected + '\n```';
  const cursorAfterFence = start + 4; // after "```\n"
  return { replaceStart: start, replaceEnd: end, insertText, selectionStart: cursorAfterFence, selectionEnd: cursorAfterFence + selected.length };
}

/** Finds the line(s) touched by [start, end) — used by every line-prefix transform below (heading,
 * lists, blockquote) so selecting mid-word still affects the WHOLE line(s) it's part of. */
function lineBounds(text: string, start: number, end: number): { lineStart: number; lineEnd: number } {
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const nextNewline = text.indexOf('\n', end);
  const lineEnd = nextNewline === -1 ? text.length : nextNewline;
  return { lineStart, lineEnd };
}

/** Sets (or, if the line already has exactly this level, removes) a Markdown heading prefix on the
 * current line — 1-6 for #-######, matching CommonMark's own limit. */
export function setHeading(text: string, start: number, end: number, level: number): TextEdit {
  const clampedLevel = Math.min(6, Math.max(1, level));
  const { lineStart, lineEnd } = lineBounds(text, start, end);
  const line = text.slice(lineStart, lineEnd);
  const stripped = line.replace(/^#{1,6}\s+/, '');
  const prefix = '#'.repeat(clampedLevel) + ' ';
  const newLine = line.startsWith(prefix) ? stripped : prefix + stripped;
  return { replaceStart: lineStart, replaceEnd: lineEnd, insertText: newLine, selectionStart: lineStart, selectionEnd: lineStart + newLine.length };
}

/** Applies (or removes) a per-line prefix across every line touched by the selection — the shared
 * primitive behind bullet/numbered/checklist lists and blockquotes. Blank lines are left alone (no
 * prefix added to them), matching how these lists look in real Markdown. `makePrefix` receives the
 * 0-based index of the line WITHIN the block (for numbered lists' "1. ", "2. ", ...). */
function toggleLinePrefix(
  text: string,
  start: number,
  end: number,
  makePrefix: (indexInBlock: number) => string,
  stripPattern: RegExp,
): TextEdit {
  const { lineStart, lineEnd } = lineBounds(text, start, end);
  const block = text.slice(lineStart, lineEnd);
  const lines = block.split('\n');
  const nonBlankLines = lines.filter((l) => l.trim() !== '');
  const allPrefixed = nonBlankLines.length > 0 && nonBlankLines.every((l) => stripPattern.test(l));

  let blockIndex = 0;
  const newLines = lines.map((line) => {
    if (line.trim() === '') return line;
    const stripped = line.replace(stripPattern, '');
    const result = allPrefixed ? stripped : makePrefix(blockIndex) + stripped;
    blockIndex++;
    return result;
  });
  const newBlock = newLines.join('\n');
  return { replaceStart: lineStart, replaceEnd: lineEnd, insertText: newBlock, selectionStart: lineStart, selectionEnd: lineStart + newBlock.length };
}

export function toggleBulletList(text: string, start: number, end: number): TextEdit {
  return toggleLinePrefix(text, start, end, () => '- ', /^-\s+/);
}

export function toggleNumberedList(text: string, start: number, end: number): TextEdit {
  return toggleLinePrefix(text, start, end, (i) => `${i + 1}. `, /^\d+\.\s+/);
}

export function toggleChecklist(text: string, start: number, end: number): TextEdit {
  return toggleLinePrefix(text, start, end, () => '- [ ] ', /^-\s+\[[ xX]\]\s+/);
}

export function toggleBlockquote(text: string, start: number, end: number): TextEdit {
  return toggleLinePrefix(text, start, end, () => '> ', /^>\s?/);
}

/** Inserts a Markdown link. With a real selection, that text becomes the link label; otherwise a
 * generic placeholder label is used. The cursor lands on the (empty, unless `url` is given) URL
 * portion so the user can type the target immediately. */
export function insertLink(text: string, start: number, end: number, url = ''): TextEdit {
  const selected = text.slice(start, end);
  const label = selected || 'link text';
  const insertText = `[${label}](${url})`;
  const urlStart = start + `[${label}](`.length;
  return { replaceStart: start, replaceEnd: end, insertText, selectionStart: urlStart, selectionEnd: urlStart + url.length };
}

/** Inserts a horizontal rule on its own blank-line-separated line — never merges into adjacent
 * text (a bare `---` immediately after a line of text is CommonMark setext-heading syntax, not a
 * rule, so this always ensures a blank line precedes it when there is preceding text). */
export function insertHorizontalRule(text: string, start: number, end: number): TextEdit {
  const before = text.slice(0, start);
  const needsBlankLine = before.length > 0 && !before.endsWith('\n\n');
  const prefix = before.length === 0 ? '' : needsBlankLine ? (before.endsWith('\n') ? '\n' : '\n\n') : '';
  const insertText = `${prefix}---\n`;
  const cursor = start + insertText.length;
  return { replaceStart: start, replaceEnd: end, insertText, selectionStart: cursor, selectionEnd: cursor };
}

/** Inserts a minimal 2x2 Markdown table skeleton — a starting point a user fills in, never
 * fabricated data. */
export function insertTable(_text: string, start: number, end: number): TextEdit {
  const insertText = '| Column 1 | Column 2 |\n| --- | --- |\n| Cell | Cell |\n';
  return { replaceStart: start, replaceEnd: end, insertText, selectionStart: start + 2, selectionEnd: start + 10 };
}

/** Inserts a callout — Markdown has no native admonition syntax, and markdown-to-jsx's preview
 * here deliberately runs with disableParsingRawHTML: true (a security choice, not an oversight —
 * see Notes.tsx's own NoteEditor), so this never reaches for a raw-HTML admonition. A bold-labelled
 * blockquote renders correctly with plain CommonMark, no special plugin required. */
export function insertCallout(text: string, start: number, end: number, label = 'Note'): TextEdit {
  const selected = text.slice(start, end);
  const insertText = `> **${label}:** ${selected}`;
  const cursor = start + `> **${label}:** `.length;
  return { replaceStart: start, replaceEnd: end, insertText, selectionStart: cursor, selectionEnd: cursor + selected.length };
}
