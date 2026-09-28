import { describe, it, expect } from 'vitest';
import { findDuplicates, findNoteDuplicates } from './importDuplicates';
import { confirmImportedContent, type ImportPreview } from './contentImport';
import type { Note } from './types';

function preview(overrides: Partial<ImportPreview> = {}): ImportPreview {
  return {
    sourceFilename: 'thesis-notes.md',
    originalFormat: 'markdown',
    suggestedContentType: 'note',
    title: 'Thesis Notes',
    content: 'Some content',
    ...overrides,
  };
}

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: overrides.id ?? 'n1',
    subject: 'general',
    title: 'A note',
    content: 'Body',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    pinned: false,
    workspaceId: 'phd_research',
    ...overrides,
  };
}

describe('findDuplicates', () => {
  it('reports an exact match when another item in the same workspace shares sourceHash', () => {
    const existingItem = confirmImportedContent(preview(), {
      workspaceId: 'phd_research',
      contentType: 'research_document',
      sourceHash: 'hash-abc',
      sourceFileSize: 100,
    });

    const result = findDuplicates([existingItem], 'phd_research', {
      sourceFilename: 'thesis-notes.md',
      sourceHash: 'hash-abc',
      sourceFileSize: 100,
    });

    expect(result.exactMatch).toBe(existingItem);
    expect(result.possibleMatches).toEqual([]);
  });

  it('reports a possible (non-blocking) match on filename+size when hashes do not match', () => {
    const existingItem = confirmImportedContent(preview(), {
      workspaceId: 'phd_research',
      contentType: 'research_document',
      sourceHash: 'hash-old',
      sourceFileSize: 100,
    });

    const result = findDuplicates([existingItem], 'phd_research', {
      sourceFilename: 'thesis-notes.md',
      sourceHash: 'hash-new',
      sourceFileSize: 100,
    });

    expect(result.exactMatch).toBeNull();
    expect(result.possibleMatches).toEqual([existingItem]);
  });

  it('reports a possible match when no hash is available to compare at all', () => {
    const existingItem = confirmImportedContent(preview(), {
      workspaceId: 'phd_research',
      contentType: 'research_document',
      sourceFileSize: 250,
    });

    const result = findDuplicates([existingItem], 'phd_research', {
      sourceFilename: 'thesis-notes.md',
      sourceFileSize: 250,
    });

    expect(result.exactMatch).toBeNull();
    expect(result.possibleMatches).toEqual([existingItem]);
  });

  it('never compares across workspaces, for exact or possible matches', () => {
    const otherWorkspaceItem = confirmImportedContent(preview(), {
      workspaceId: 'upsc_cse',
      contentType: 'note',
      sourceHash: 'hash-abc',
      sourceFileSize: 100,
    });

    const result = findDuplicates([otherWorkspaceItem], 'phd_research', {
      sourceFilename: 'thesis-notes.md',
      sourceHash: 'hash-abc',
      sourceFileSize: 100,
    });

    expect(result.exactMatch).toBeNull();
    expect(result.possibleMatches).toEqual([]);
  });

  it('reports no duplicates when neither hash nor filename/size match anything', () => {
    const existingItem = confirmImportedContent(preview({ sourceFilename: 'other-file.md' }), {
      workspaceId: 'phd_research',
      contentType: 'research_document',
      sourceHash: 'hash-unrelated',
      sourceFileSize: 999,
    });

    const result = findDuplicates([existingItem], 'phd_research', {
      sourceFilename: 'thesis-notes.md',
      sourceHash: 'hash-abc',
      sourceFileSize: 100,
    });

    expect(result.exactMatch).toBeNull();
    expect(result.possibleMatches).toEqual([]);
  });

  it('returns an empty result when the candidate carries no hash and no filename/size to compare', () => {
    const existingItem = confirmImportedContent(preview(), {
      workspaceId: 'phd_research',
      contentType: 'research_document',
      sourceHash: 'hash-abc',
      sourceFileSize: 100,
    });

    const result = findDuplicates([existingItem], 'phd_research', {});

    expect(result.exactMatch).toBeNull();
    expect(result.possibleMatches).toEqual([]);
  });

  it('prefers the exact match and omits possible matches once an exact match is found', () => {
    const exactItem = confirmImportedContent(preview(), {
      workspaceId: 'phd_research',
      contentType: 'research_document',
      sourceHash: 'hash-abc',
      sourceFileSize: 100,
    });
    const sameNameDifferentHash = confirmImportedContent(preview(), {
      workspaceId: 'phd_research',
      contentType: 'research_document',
      sourceHash: 'hash-different',
      sourceFileSize: 100,
    });

    const result = findDuplicates([exactItem, sameNameDifferentHash], 'phd_research', {
      sourceFilename: 'thesis-notes.md',
      sourceHash: 'hash-abc',
      sourceFileSize: 100,
    });

    expect(result.exactMatch).toBe(exactItem);
    expect(result.possibleMatches).toEqual([]);
  });
});

describe('findNoteDuplicates', () => {
  it('reports an exact match when another note in the same workspace shares sourceHash', () => {
    const existingNote = note({ id: 'n1', sourceHash: 'hash-abc', sourceFileSize: 100, sourceFilename: 'a.md' });
    const result = findNoteDuplicates([existingNote], 'phd_research', { sourceFilename: 'a.md', sourceHash: 'hash-abc', sourceFileSize: 100 });
    expect(result.exactMatch).toBe(existingNote);
    expect(result.possibleMatches).toEqual([]);
  });

  it('reports a possible (non-blocking) match on filename+size when hashes do not match', () => {
    const existingNote = note({ id: 'n1', sourceHash: 'hash-old', sourceFileSize: 100, sourceFilename: 'a.md' });
    const result = findNoteDuplicates([existingNote], 'phd_research', { sourceFilename: 'a.md', sourceHash: 'hash-new', sourceFileSize: 100 });
    expect(result.exactMatch).toBeNull();
    expect(result.possibleMatches).toEqual([existingNote]);
  });

  it('never compares across workspaces', () => {
    const otherWorkspaceNote = note({ id: 'n1', workspaceId: 'upsc_cse', sourceHash: 'hash-abc', sourceFileSize: 100, sourceFilename: 'a.md' });
    const result = findNoteDuplicates([otherWorkspaceNote], 'phd_research', { sourceFilename: 'a.md', sourceHash: 'hash-abc', sourceFileSize: 100 });
    expect(result.exactMatch).toBeNull();
    expect(result.possibleMatches).toEqual([]);
  });

  it('a manually created/edited note (no sourceHash) never surfaces as a duplicate', () => {
    const manualNote = note({ id: 'n1' }); // no sourceHash/sourceFileSize/sourceFilename at all
    const result = findNoteDuplicates([manualNote], 'phd_research', { sourceFilename: 'a.md', sourceHash: 'hash-abc', sourceFileSize: 100 });
    expect(result.exactMatch).toBeNull();
    expect(result.possibleMatches).toEqual([]);
  });

  it('returns an empty result when the candidate carries no hash and no filename/size to compare', () => {
    const existingNote = note({ id: 'n1', sourceHash: 'hash-abc', sourceFileSize: 100, sourceFilename: 'a.md' });
    const result = findNoteDuplicates([existingNote], 'phd_research', {});
    expect(result.exactMatch).toBeNull();
    expect(result.possibleMatches).toEqual([]);
  });
});
