import type { RefObject } from 'react';
import { Bold, Italic, Strikethrough, Code, Code2, Heading1, Heading2, List, ListOrdered, Quote, Link2, Minus, Table2, type LucideIcon } from 'lucide-react';
import { cx } from '../../lib/utils';
import {
  toggleBold,
  toggleItalic,
  toggleStrikethrough,
  toggleInlineCode,
  toggleCodeBlock,
  setHeading,
  toggleBulletList,
  toggleNumberedList,
  toggleBlockquote,
  insertLink,
  insertHorizontalRule,
  insertTable,
  type TextEdit,
} from '../../lib/markdownEditing';
import { applyEditToTextarea } from './textareaEditing';

// Premium Knowledge Editor, Phase 5C — a compact, horizontally-scrollable toolbar over the existing
// plain <textarea> (Notes.tsx's NoteEditor). Every button computes a TextEdit from the CURRENT
// textarea selection (lib/markdownEditing.ts, pure) and applies it via applyEditToTextarea (the one
// DOM-touching step). Deliberately never a floating/permanent full-height panel — a single row that
// wraps to horizontal scroll on narrow/tablet widths rather than growing taller and eating editing
// space (see this component's own layout below).
type Command = (text: string, start: number, end: number) => TextEdit;

const GROUPS: { label: string; icon: LucideIcon; command: Command; shortcut?: string }[][] = [
  [
    { label: 'Bold', icon: Bold, command: toggleBold, shortcut: 'Ctrl+B' },
    { label: 'Italic', icon: Italic, command: toggleItalic, shortcut: 'Ctrl+I' },
    { label: 'Strikethrough', icon: Strikethrough, command: toggleStrikethrough },
    { label: 'Inline code', icon: Code, command: toggleInlineCode },
  ],
  [
    { label: 'Heading', icon: Heading1, command: (t, s, e) => setHeading(t, s, e, 2) },
    { label: 'Subheading', icon: Heading2, command: (t, s, e) => setHeading(t, s, e, 3) },
  ],
  [
    { label: 'Bulleted list', icon: List, command: toggleBulletList },
    { label: 'Numbered list', icon: ListOrdered, command: toggleNumberedList },
    { label: 'Blockquote', icon: Quote, command: toggleBlockquote },
  ],
  [
    { label: 'Link', icon: Link2, command: (t, s, e) => insertLink(t, s, e) },
    { label: 'Code block', icon: Code2, command: toggleCodeBlock },
    { label: 'Table', icon: Table2, command: insertTable },
    { label: 'Divider', icon: Minus, command: insertHorizontalRule },
  ],
];

export function EditorToolbar({ textareaRef, onChange }: { textareaRef: RefObject<HTMLTextAreaElement | null>; onChange: (text: string) => void }) {
  function run(command: Command) {
    const el = textareaRef.current;
    if (!el) return;
    const edit = command(el.value, el.selectionStart, el.selectionEnd);
    onChange(applyEditToTextarea(el, edit));
  }

  return (
    <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/60 p-1">
      {GROUPS.map((group, gi) => (
        <div key={gi} className={cx('flex items-center gap-0.5', gi > 0 && 'border-l border-slate-200 dark:border-slate-700 pl-1 ml-0.5')}>
          {group.map(({ label, icon: Icon, command, shortcut }) => (
            <button
              key={label}
              type="button"
              onClick={() => run(command)}
              // Keeps the textarea focused on tap/click — same reasoning as SlashCommandMenu's own
              // onMouseDown (applyEditToTextarea re-focuses anyway, but this avoids the round-trip
              // and keeps NoteEditor's close-on-blur handler from ever needing to care about this).
              onMouseDown={(e) => e.preventDefault()}
              aria-label={shortcut ? `${label} (${shortcut})` : label}
              title={shortcut ? `${label} (${shortcut})` : label}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Keyboard-shortcut handler shared by NoteEditor's textarea onKeyDown — the exact same `run` logic
 * the toolbar buttons use, so Ctrl+B/Ctrl+I behave identically to clicking the toolbar. Returns
 * true if the key combo was handled (caller should preventDefault). */
export function handleEditorKeyboardShortcut(e: React.KeyboardEvent<HTMLTextAreaElement>, onChange: (text: string) => void): boolean {
  const mod = e.ctrlKey || e.metaKey;
  if (!mod) return false;
  const el = e.currentTarget;
  let command: Command | null = null;
  if (e.key === 'b' || e.key === 'B') command = toggleBold;
  else if (e.key === 'i' || e.key === 'I') command = toggleItalic;
  if (!command) return false;
  const edit = command(el.value, el.selectionStart, el.selectionEnd);
  onChange(applyEditToTextarea(el, edit));
  return true;
}
