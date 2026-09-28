import { describe, it, expect } from 'vitest';
import { detectSlashCommandTrigger, filterSlashCommands, buildSlashCommandEdit, SLASH_COMMANDS } from './slashCommands';
import { applyTextEdit } from './markdownEditing';

describe('detectSlashCommandTrigger', () => {
  it('detects a bare "/" at the start of an empty line', () => {
    const trigger = detectSlashCommandTrigger('/', 1);
    expect(trigger).toEqual({ start: 0, end: 1, query: '' });
  });

  it('detects "/heading" being typed, with the query so far', () => {
    const trigger = detectSlashCommandTrigger('/head', 5);
    expect(trigger).toEqual({ start: 0, end: 5, query: 'head' });
  });

  it('detects a trigger on the second line of a multi-line document', () => {
    const text = 'First line.\n/bul';
    const trigger = detectSlashCommandTrigger(text, text.length);
    expect(trigger).toEqual({ start: 12, end: 16, query: 'bul' });
  });

  it('returns null when "/" is not at the start of the line', () => {
    expect(detectSlashCommandTrigger('some text /not-a-command', 25)).toBeNull();
  });

  it('returns null once a space has been typed after the query', () => {
    expect(detectSlashCommandTrigger('/heading ', 9)).toBeNull();
  });

  it('returns null when there is no "/" at all', () => {
    expect(detectSlashCommandTrigger('plain text', 5)).toBeNull();
  });

  it('returns null for digits/symbols in the query (never a partial guess)', () => {
    expect(detectSlashCommandTrigger('/head1', 6)).toBeNull();
  });
});

describe('filterSlashCommands', () => {
  it('an empty query returns every command, in declared order', () => {
    expect(filterSlashCommands('')).toEqual(SLASH_COMMANDS);
  });

  it('filters by keyword prefix, case-insensitively', () => {
    expect(filterSlashCommands('HEAD').map((c) => c.id)).toEqual(['heading']);
  });

  it('"b" matches every command starting with b (bullet, bookmark)', () => {
    const ids = filterSlashCommands('b').map((c) => c.id);
    expect(ids).toContain('bullet');
    expect(ids).toContain('bookmark');
  });

  it('a query matching nothing returns an empty list, never a fallback guess', () => {
    expect(filterSlashCommands('zzz')).toEqual([]);
  });

  it('never does fuzzy/substring matching — only prefix', () => {
    // "eading" is a substring of "heading" but not a prefix — must not match.
    expect(filterSlashCommands('eading')).toEqual([]);
  });
});

describe('buildSlashCommandEdit', () => {
  it('replaces the trigger span with the heading snippet', () => {
    const trigger = { start: 0, end: 8, query: 'heading' };
    const edit = buildSlashCommandEdit('heading', trigger)!;
    const result = applyTextEdit('/heading', edit);
    expect(result.text).toBe('# ');
  });

  it('works mid-document, only touching the trigger span', () => {
    const text = 'Intro\n/todo';
    const trigger = { start: 6, end: 11, query: 'todo' };
    const edit = buildSlashCommandEdit('todo', trigger)!;
    const result = applyTextEdit(text, edit);
    expect(result.text).toBe('Intro\n- [ ] ');
  });

  it('code block places the cursor between the fences', () => {
    const trigger = { start: 0, end: 5, query: 'code' };
    const edit = buildSlashCommandEdit('code', trigger)!;
    const result = applyTextEdit('/code', edit);
    expect(result.text).toBe('```\n\n```');
    expect(result.selectionStart).toBe(4);
  });

  it('returns null for an unrecognised command id, never fabricating a fallback', () => {
    const trigger = { start: 0, end: 1, query: '' };
    expect(buildSlashCommandEdit('not-a-real-command', trigger)).toBeNull();
  });

  it('every declared SLASH_COMMANDS entry has a working buildSlashCommandEdit implementation', () => {
    const trigger = { start: 0, end: 1, query: '' };
    for (const command of SLASH_COMMANDS) {
      expect(buildSlashCommandEdit(command.id, trigger)).not.toBeNull();
    }
  });
});
