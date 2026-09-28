import { cx } from '../../lib/utils';
import type { SlashCommandDefinition } from '../../lib/slashCommands';

// Premium Knowledge Editor, Phase 5D — a DOCKED popup (never positioned at the text caret — see
// lib/slashCommands.ts's own header and this feature's approved design: caret-pixel positioning in
// a plain <textarea> has no reliable native API and would need a fragile mirror-div measurement
// trick for no functional benefit). Sits just below the toolbar, inside the editor's own layout —
// never covers the textarea itself. A purely presentational, controlled component: NoteEditor owns
// the active trigger/query/highlighted-index state and all keyboard handling (the textarea keeps
// focus throughout — this menu never steals it, so typing/arrow keys/Escape all keep working
// exactly where the user's cursor already is).
export function SlashCommandMenu({
  commands,
  activeIndex,
  onSelect,
  onHover,
}: {
  commands: readonly SlashCommandDefinition[];
  activeIndex: number;
  onSelect: (commandId: string) => void;
  onHover: (index: number) => void;
}) {
  return (
    <div className="mb-2 max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg">
      {commands.length === 0 ? (
        <p className="px-3 py-3 text-xs text-slate-400">No matching commands.</p>
      ) : (
        commands.map((command, i) => (
          <button
            key={command.id}
            type="button"
            onClick={() => onSelect(command.id)}
            onMouseEnter={() => onHover(i)}
            // Keeps the textarea focused (no blur) on tap/click, so NoteEditor's onBlur-driven
            // close-on-tap-away never races this selection closed before onClick fires.
            onMouseDown={(e) => e.preventDefault()}
            className={cx(
              'flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm',
              i === activeIndex ? 'bg-brand-500/10 text-brand-700 dark:text-brand-300' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800',
            )}
          >
            <span className="shrink-0 font-mono text-xs text-slate-400">/{command.keyword}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{command.label}</span>
              <span className="block truncate text-xs text-slate-400">{command.description}</span>
            </span>
          </button>
        ))
      )}
    </div>
  );
}
