import type { TextEdit } from '../../lib/markdownEditing';

// Premium Knowledge Editor, Phase 5B/C — the one place a pure TextEdit (lib/markdownEditing.ts,
// lib/slashCommands.ts) gets applied to a REAL textarea element. Deliberately DOM-dependent (and so
// deliberately outside lib/, which stays pure/unit-testable) — this repo has no RTL/DOM test
// environment anywhere (see every *.test.ts file's own header), so this function is exercised by
// manual verification, matching the same split every other DOM-touching piece of this app already
// uses (e.g. AnnotationLayer.tsx's own pointer handling).
//
// Prefers document.execCommand('insertText', ...) specifically so the browser's OWN undo/redo stack
// keeps working — Ctrl+Z after a toolbar click undoes it exactly like a normal keystroke would.
// There is no non-deprecated replacement with equivalent undo-stack integration for a plain
// <textarea>; execCommand for insertText is still broadly supported across current Chrome/Firefox/
// Safari despite the API being formally deprecated for browser chrome, and it's the only thing that
// gives us this specific property without a rich-text engine. Falls back to direct value assignment
// (functionally correct, but breaks native undo for that one edit) ONLY when execCommand is
// genuinely unavailable — feature-detected, never assumed.
export function applyEditToTextarea(textarea: HTMLTextAreaElement, edit: TextEdit): string {
  textarea.focus();
  textarea.setSelectionRange(edit.replaceStart, edit.replaceEnd);

  let applied = false;
  try {
    if (typeof document.execCommand === 'function') {
      applied = document.execCommand('insertText', false, edit.insertText);
    }
  } catch {
    applied = false;
  }

  if (!applied) {
    const value = textarea.value;
    textarea.value = value.slice(0, edit.replaceStart) + edit.insertText + value.slice(edit.replaceEnd);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd);
  return textarea.value;
}
