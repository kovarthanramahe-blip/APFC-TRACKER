import { describe, it, expect } from 'vitest';
import { NOTE_TEMPLATES, getNoteTemplate } from './noteTemplates';

describe('NOTE_TEMPLATES', () => {
  it('includes all 9 required templates', () => {
    const ids = NOTE_TEMPLATES.map((t) => t.id);
    expect(ids).toEqual([
      'blank',
      'upsc-topic',
      'upsc-revision',
      'pyq-analysis',
      'current-affairs',
      'research-note',
      'source-citation',
      'doubt',
      'flashcard',
    ]);
  });

  it('every template has a unique id', () => {
    const ids = NOTE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every template (except blank) has non-empty structured content', () => {
    for (const t of NOTE_TEMPLATES) {
      if (t.id === 'blank') continue;
      expect(t.content.trim().length).toBeGreaterThan(0);
    }
  });

  it('the blank template has genuinely empty content — never fabricates a structure', () => {
    expect(getNoteTemplate('blank')?.content).toBe('');
  });

  it('every template has a name and description', () => {
    for (const t of NOTE_TEMPLATES) {
      expect(t.name.trim().length).toBeGreaterThan(0);
      expect(t.description.trim().length).toBeGreaterThan(0);
    }
  });

  it('no template content contains raw HTML tags — stays safe under disableParsingRawHTML', () => {
    for (const t of NOTE_TEMPLATES) {
      expect(t.content).not.toMatch(/<[a-z][\s\S]*>/i);
    }
  });
});

describe('getNoteTemplate', () => {
  it('returns the matching template by id', () => {
    expect(getNoteTemplate('doubt')?.name).toBe('Doubt Note');
  });

  it('returns undefined for an unknown id, never fabricating one', () => {
    expect(getNoteTemplate('does-not-exist')).toBeUndefined();
  });
});
