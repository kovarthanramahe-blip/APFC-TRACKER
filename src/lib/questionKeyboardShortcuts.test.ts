import { describe, it, expect } from 'vitest';
import { resolveTestingKeyAction } from './questionKeyboardShortcuts';

describe('resolveTestingKeyAction', () => {
  it('selects option 0 for "1"', () => {
    expect(resolveTestingKeyAction('1', 4)).toEqual({ type: 'selectOption', index: 0 });
  });

  it('selects option 3 for "4" on a 4-option question', () => {
    expect(resolveTestingKeyAction('4', 4)).toEqual({ type: 'selectOption', index: 3 });
  });

  it('does not select an out-of-range option ("4" on a 2-option question)', () => {
    expect(resolveTestingKeyAction('4', 2)).toEqual({ type: 'none' });
  });

  it('supports letter keys as an alternative to digits (a/b/c/d)', () => {
    expect(resolveTestingKeyAction('a', 4)).toEqual({ type: 'selectOption', index: 0 });
    expect(resolveTestingKeyAction('b', 4)).toEqual({ type: 'selectOption', index: 1 });
    expect(resolveTestingKeyAction('d', 4)).toEqual({ type: 'selectOption', index: 3 });
  });

  it('letter keys are case-insensitive', () => {
    expect(resolveTestingKeyAction('B', 4)).toEqual({ type: 'selectOption', index: 1 });
  });

  it('does not select an out-of-range letter option ("e" on a 4-option question)', () => {
    expect(resolveTestingKeyAction('e', 4)).toEqual({ type: 'none' });
  });

  it('maps ArrowRight to "next"', () => {
    expect(resolveTestingKeyAction('ArrowRight', 4)).toEqual({ type: 'next' });
  });

  it('maps ArrowLeft to "previous"', () => {
    expect(resolveTestingKeyAction('ArrowLeft', 4)).toEqual({ type: 'previous' });
  });

  it('never maps Enter, Space, or any submit-like key to an action', () => {
    expect(resolveTestingKeyAction('Enter', 4)).toEqual({ type: 'none' });
    expect(resolveTestingKeyAction(' ', 4)).toEqual({ type: 'none' });
  });

  it('ignores unrelated keys', () => {
    expect(resolveTestingKeyAction('Escape', 4)).toEqual({ type: 'none' });
    expect(resolveTestingKeyAction('Tab', 4)).toEqual({ type: 'none' });
    expect(resolveTestingKeyAction('ArrowUp', 4)).toEqual({ type: 'none' });
  });

  it('handles zero-option questions gracefully (no crash, no selection)', () => {
    expect(resolveTestingKeyAction('1', 0)).toEqual({ type: 'none' });
  });
});
