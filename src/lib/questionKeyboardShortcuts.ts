// Keyboard shortcuts for the PYQ practice testing screen (pages/PYQTest.tsx). Pure and
// deterministic: a plain function from (the pressed key, how many options this question has) to
// what should happen — no DOM access, no React, no store. The page wires this to a `keydown`
// listener; this module only decides the mapping, so it's testable without mounting anything.
export type TestingKeyAction = { type: 'selectOption'; index: number } | { type: 'next' } | { type: 'previous' } | { type: 'none' };

/**
 * Maps one keyboard key to a testing-screen action:
 * - '1'-'9' or 'a'-'z' (case-insensitive) select the option at that position (1st, 2nd, ...),
 *   only when the question actually has that many options — never selects an out-of-range index.
 * - ArrowRight -> next question, ArrowLeft -> previous question.
 * - Anything else -> no action. Deliberately excludes Enter/Space (already the browser's own
 *   activation keys for the focused option button) and excludes any submit shortcut entirely —
 *   submitting the test is a one-way, confirmed action and must stay a deliberate click.
 */
export function resolveTestingKeyAction(key: string, optionCount: number): TestingKeyAction {
  if (key.length === 1) {
    const lower = key.toLowerCase();
    let index = -1;
    if (lower >= '1' && lower <= '9') index = lower.charCodeAt(0) - '1'.charCodeAt(0);
    else if (lower >= 'a' && lower <= 'z') index = lower.charCodeAt(0) - 'a'.charCodeAt(0);
    if (index >= 0 && index < optionCount) return { type: 'selectOption', index };
    return { type: 'none' };
  }
  if (key === 'ArrowRight') return { type: 'next' };
  if (key === 'ArrowLeft') return { type: 'previous' };
  return { type: 'none' };
}
