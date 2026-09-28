// Premium Knowledge Editor, Phase 5D — lightweight slash commands over the plain <textarea> editor.
// Typing "/" at the START of a line, followed by letters with no space, is an active trigger;
// selecting a command replaces that "/query" span with the command's own snippet.
//
// Deliberately NOT built by composing lib/markdownEditing.ts's selection-based toggle functions
// (toggleBulletList, setHeading, etc.) — those operate on whatever the CURRENT line already
// contains via lineBounds, which is the right behaviour for a toolbar button pressed over existing
// text, but would need fragile coordinate remapping to handle "remove the '/query' span, then also
// account for anything the user already typed after the cursor on that same line" correctly. A
// slash command's trigger span IS the known, exact thing being replaced — so each command here just
// states the literal snippet it inserts in place of "/query", full stop. Simpler and more honest
// than generalizing the toolbar commands for an edge case that barely arises in real typing.
import type { TextEdit } from './markdownEditing';

export interface SlashCommandDefinition {
  id: string;
  /** Matched against the text typed after "/", case-insensitively, by prefix (never fuzzy). */
  keyword: string;
  label: string;
  description: string;
}

export const SLASH_COMMANDS: readonly SlashCommandDefinition[] = [
  { id: 'heading', keyword: 'heading', label: 'Heading', description: 'Large section heading' },
  { id: 'subheading', keyword: 'subheading', label: 'Subheading', description: 'Smaller section heading' },
  { id: 'bullet', keyword: 'bullet', label: 'Bulleted list', description: 'Simple bulleted list' },
  { id: 'numbered', keyword: 'numbered', label: 'Numbered list', description: 'Ordered list' },
  { id: 'todo', keyword: 'todo', label: 'To-do checklist', description: 'A checkbox item' },
  { id: 'quote', keyword: 'quote', label: 'Quote', description: 'Blockquote' },
  { id: 'callout', keyword: 'callout', label: 'Callout', description: 'A highlighted note-style block' },
  { id: 'code', keyword: 'code', label: 'Code block', description: 'Fenced code block' },
  { id: 'divider', keyword: 'divider', label: 'Divider', description: 'Horizontal rule' },
  { id: 'table', keyword: 'table', label: 'Table', description: '2x2 table skeleton' },
  { id: 'link', keyword: 'link', label: 'Link', description: 'Markdown link' },
  { id: 'note', keyword: 'note', label: 'Note callout', description: 'A labelled note block' },
  { id: 'bookmark', keyword: 'bookmark', label: 'Bookmark callout', description: 'A labelled bookmark block' },
  { id: 'flashcard', keyword: 'flashcard', label: 'Flashcard (Q/A)', description: 'Question/answer pair' },
  { id: 'doubt', keyword: 'doubt', label: 'Doubt callout', description: 'A labelled doubt block' },
] as const;

export interface SlashCommandTrigger {
  /** Index of the "/" itself. */
  start: number;
  /** Index of the cursor — the end of the query typed so far. */
  end: number;
  /** Text typed after "/", lowercased. */
  query: string;
}

/** Detects an ACTIVE trigger ending exactly at `cursor` — a "/" at the very start of the current
 * line, followed by zero or more letters, with nothing else on the line up to the cursor. Returns
 * null the moment that's no longer true (a space was typed, the "/" isn't at line-start, etc.) —
 * never guesses which trigger the user "probably" means. */
export function detectSlashCommandTrigger(text: string, cursor: number): SlashCommandTrigger | null {
  const beforeCursor = text.slice(0, cursor);
  const lineStart = beforeCursor.lastIndexOf('\n') + 1;
  const linePrefix = beforeCursor.slice(lineStart);
  const match = /^\/([a-zA-Z]*)$/.exec(linePrefix);
  if (!match) return null;
  return { start: lineStart, end: cursor, query: match[1].toLowerCase() };
}

/** Commands whose keyword starts with `query` (case-insensitive prefix match, no fuzzy scoring) —
 * an empty query matches every command, in their declared order. */
export function filterSlashCommands(query: string): SlashCommandDefinition[] {
  const q = query.toLowerCase();
  return SLASH_COMMANDS.filter((c) => c.keyword.startsWith(q));
}

/** Replaces `trigger`'s own span with `insertText`, placing the cursor `cursorOffset` characters
 * into the inserted text (defaulting to its end). */
function slashInsert(trigger: SlashCommandTrigger, insertText: string, cursorOffset: number = insertText.length): TextEdit {
  const selection = trigger.start + cursorOffset;
  return { replaceStart: trigger.start, replaceEnd: trigger.end, insertText, selectionStart: selection, selectionEnd: selection };
}

/** Builds the TextEdit for `commandId` at `trigger` — the one function the slash-command popup
 * calls when a command is chosen. Returns null for an unknown id (never fabricates a fallback). */
export function buildSlashCommandEdit(commandId: string, trigger: SlashCommandTrigger): TextEdit | null {
  switch (commandId) {
    case 'heading':
      return slashInsert(trigger, '# ');
    case 'subheading':
      return slashInsert(trigger, '## ');
    case 'bullet':
      return slashInsert(trigger, '- ');
    case 'numbered':
      return slashInsert(trigger, '1. ');
    case 'todo':
      return slashInsert(trigger, '- [ ] ');
    case 'quote':
      return slashInsert(trigger, '> ');
    case 'callout':
      return slashInsert(trigger, '> **Note:** ');
    case 'code':
      return slashInsert(trigger, '```\n\n```', 4);
    case 'divider':
      return slashInsert(trigger, '---\n');
    case 'table':
      return slashInsert(trigger, '| Column 1 | Column 2 |\n| --- | --- |\n| Cell | Cell |\n', 2);
    case 'link':
      return slashInsert(trigger, '[link text]()', 12);
    case 'note':
      return slashInsert(trigger, '> **Note:** ');
    case 'bookmark':
      return slashInsert(trigger, '> **Bookmark:** ');
    case 'flashcard':
      return slashInsert(trigger, '**Q:** \n**A:** ', 7);
    case 'doubt':
      return slashInsert(trigger, '> **Doubt:** ');
    default:
      return null;
  }
}
