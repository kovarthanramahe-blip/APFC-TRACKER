import { describe, it, expect } from 'vitest';
import { runFileImport } from './importPipeline';
import { confirmImportedContent, isSourceEditable, type ImportPreview } from './contentImport';

function preview(overrides: Partial<ImportPreview> = {}): ImportPreview {
  return {
    sourceFilename: 'notes.md',
    originalFormat: 'markdown',
    suggestedContentType: 'note',
    title: 'Notes',
    content: 'Body',
    ...overrides,
  };
}

describe('runFileImport', () => {
  it('imports a supported Markdown file unchanged from the existing extraction behaviour', async () => {
    const file = new File(['# Heading\n\nSome body text.'], 'notes.md');
    const outcome = await runFileImport(file, [], 'phd_research');

    expect(outcome.status).toBe('ok');
    expect(outcome.filename).toBe('notes.md');
    expect(outcome.size).toBe(file.size);
    expect(outcome.preview?.content).toBe('# Heading\n\nSome body text.');
    expect(outcome.preview?.originalFormat).toBe('markdown');
    expect(outcome.sourceHash).toMatch(/^[0-9a-f]{64}$/);
    expect(outcome.duplicates).toEqual({ exactMatch: null, possibleMatches: [] });
  });

  it('imports a supported .txt file unchanged from the existing extraction behaviour', async () => {
    const file = new File(['Plain text notes.'], 'plain.txt');
    const outcome = await runFileImport(file, [], 'phd_research');
    expect(outcome.status).toBe('ok');
    expect(outcome.preview?.content).toBe('Plain text notes.');
  });

  it('imports a supported .csv file unchanged from the existing extraction behaviour', async () => {
    const file = new File(['Name,Score\nAlice,90'], 'scores.csv');
    const outcome = await runFileImport(file, [], 'phd_research');
    expect(outcome.status).toBe('ok');
    expect(outcome.preview?.content).toBe('| Name | Score |\n| --- | --- |\n| Alice | 90 |');
  });

  it('imports a supported .json file unchanged from the existing extraction behaviour', async () => {
    const file = new File(['{"a":1}'], 'data.json');
    const outcome = await runFileImport(file, [], 'phd_research');
    expect(outcome.status).toBe('ok');
    expect(outcome.preview?.content).toBe('{\n  "a": 1\n}');
  });

  it('still rejects a .doc file with the existing legacy-format error, unchanged', async () => {
    const file = new File(['ignored'], 'legacy.doc');
    const outcome = await runFileImport(file, [], 'phd_research');
    expect(outcome.status).toBe('error');
    expect(outcome.error).toMatch(/\.doc/i);
    expect(outcome.sourceHash).toBeUndefined();
    expect(outcome.preview).toBeUndefined();
  });

  it('still rejects an unsupported extension with the existing error, unchanged', async () => {
    const file = new File(['irrelevant'], 'photo.jpg');
    const outcome = await runFileImport(file, [], 'phd_research');
    expect(outcome.status).toBe('error');
    expect(outcome.error).toMatch(/Unsupported file type/i);
  });

  it('never crashes on a malformed file — an empty CSV degrades to a friendly error', async () => {
    const file = new File([''], 'empty.csv');
    const outcome = await runFileImport(file, [], 'phd_research');
    expect(outcome.status).toBe('error');
    expect(typeof outcome.error).toBe('string');
  });

  it('never crashes on malformed JSON — degrades to a friendly error, not a thrown exception', async () => {
    const file = new File(['{not valid json'], 'broken.json');
    const outcome = await runFileImport(file, [], 'phd_research');
    expect(outcome.status).toBe('error');
    expect(typeof outcome.error).toBe('string');
  });

  it('is deterministic: importing the same bytes twice produces the same hash and preview content', async () => {
    const first = await runFileImport(new File(['Same content'], 'dup.md'), [], 'phd_research');
    const second = await runFileImport(new File(['Same content'], 'dup.md'), [], 'phd_research');
    expect(first.sourceHash).toBe(second.sourceHash);
    expect(first.preview?.content).toBe(second.preview?.content);
  });

  it('surfaces an exact duplicate against an existing item in the same workspace', async () => {
    const file = new File(['Same bytes every time'], 'thesis.md');
    const firstOutcome = await runFileImport(file, [], 'phd_research');
    const savedItem = confirmImportedContent(firstOutcome.preview!, {
      workspaceId: 'phd_research',
      contentType: 'research_document',
      sourceHash: firstOutcome.sourceHash,
      sourceFileSize: firstOutcome.size,
    });

    const secondOutcome = await runFileImport(new File(['Same bytes every time'], 'thesis.md'), [savedItem], 'phd_research');
    expect(secondOutcome.duplicates?.exactMatch).toBe(savedItem);
  });

  it('does not treat an existing item in a different workspace as a duplicate', async () => {
    const file = new File(['Cross workspace bytes'], 'cross.md');
    const firstOutcome = await runFileImport(file, [], 'upsc_cse');
    const savedItem = confirmImportedContent(firstOutcome.preview!, {
      workspaceId: 'upsc_cse',
      contentType: 'note',
      sourceHash: firstOutcome.sourceHash,
      sourceFileSize: firstOutcome.size,
    });

    const secondOutcome = await runFileImport(new File(['Cross workspace bytes'], 'cross.md'), [savedItem], 'phd_research');
    expect(secondOutcome.duplicates?.exactMatch).toBeNull();
    expect(secondOutcome.duplicates?.possibleMatches).toEqual([]);
  });

  it('never mutates the original ImportedContent passed in via `existing`', async () => {
    const savedItem = confirmImportedContent(preview(), {
      workspaceId: 'phd_research',
      contentType: 'research_document',
      sourceHash: 'existing-hash',
      sourceFileSize: 42,
    });
    const snapshot = JSON.parse(JSON.stringify(savedItem));

    await runFileImport(new File(['Unrelated content'], 'other.md'), [savedItem], 'phd_research');

    expect(savedItem).toEqual(snapshot);
  });

  it('an imported item is never editable in place — isSourceEditable stays false for it', async () => {
    const outcome = await runFileImport(new File(['Body text'], 'imported.md'), [], 'phd_research');
    const savedItem = confirmImportedContent(outcome.preview!, {
      workspaceId: 'phd_research',
      contentType: 'research_document',
      sourceHash: outcome.sourceHash,
      sourceFileSize: outcome.size,
    });
    expect(isSourceEditable(savedItem)).toBe(false);
  });
});
