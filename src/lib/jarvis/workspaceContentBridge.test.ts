import { describe, it, expect } from 'vitest';
import {
  toWorkspaceDocumentId,
  fromWorkspaceDocumentId,
  buildWorkspaceDocumentChunks,
  retrieveWorkspaceEvidence,
  resolveWorkspaceDocumentTitle,
} from './workspaceContentBridge';
import type { Note } from '../types';
import type { ImportedContent } from '../contentImport';

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: 'note-1',
    subject: 'general',
    title: 'Untitled note',
    content: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    pinned: false,
    workspaceId: 'apfc',
    ...overrides,
  };
}

function importedContent(overrides: Partial<ImportedContent> = {}): ImportedContent {
  return {
    id: 'content-1',
    workspaceId: 'apfc',
    contentType: 'document',
    title: 'Untitled document',
    rawContent: '',
    provenance: { importedAt: '2026-01-01T00:00:00.000Z', origin: 'manual' },
    ...overrides,
  };
}

describe('toWorkspaceDocumentId / fromWorkspaceDocumentId', () => {
  it('round-trips a note ref', () => {
    const id = toWorkspaceDocumentId({ itemType: 'note', itemId: 'abc-123' });
    expect(id).toBe('note:abc-123');
    expect(fromWorkspaceDocumentId(id)).toEqual({ itemType: 'note', itemId: 'abc-123' });
  });

  it('round-trips an imported_content ref', () => {
    const id = toWorkspaceDocumentId({ itemType: 'imported_content', itemId: 'xyz-789' });
    expect(fromWorkspaceDocumentId(id)).toEqual({ itemType: 'imported_content', itemId: 'xyz-789' });
  });

  it('never collides a note and an imported_content item that happen to share the same bare id', () => {
    const noteId = toWorkspaceDocumentId({ itemType: 'note', itemId: 'shared-id' });
    const contentId = toWorkspaceDocumentId({ itemType: 'imported_content', itemId: 'shared-id' });
    expect(noteId).not.toBe(contentId);
  });

  it('returns undefined for a malformed or foreign documentId, never guesses', () => {
    expect(fromWorkspaceDocumentId('not-prefixed')).toBeUndefined();
    expect(fromWorkspaceDocumentId('unknown-type:abc')).toBeUndefined();
    expect(fromWorkspaceDocumentId('note:')).toBeUndefined();
  });
});

describe('buildWorkspaceDocumentChunks', () => {
  it('returns [] for an empty workspace', () => {
    expect(buildWorkspaceDocumentChunks([], [], 'apfc')).toEqual([]);
  });

  it('chunks a note belonging to the active workspace, tagging chunks with the note-prefixed documentId', () => {
    const n = note({ id: 'n1', content: 'Depreciation is the systematic allocation of an asset cost over its useful life.' });
    const chunks = buildWorkspaceDocumentChunks([n], [], 'apfc');
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].documentId).toBe('note:n1');
    expect(chunks[0].text).toContain('Depreciation');
  });

  it('chunks an ImportedContent item belonging to the active workspace, using its rawContent', () => {
    const c = importedContent({ id: 'c1', rawContent: 'The Reserve Bank of India sets the repo rate as part of monetary policy.' });
    const chunks = buildWorkspaceDocumentChunks([], [c], 'apfc');
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].documentId).toBe('imported_content:c1');
    expect(chunks[0].text).toContain('Reserve Bank');
  });

  it('excludes a note belonging to a DIFFERENT workspace', () => {
    const n = note({ id: 'n1', content: 'This note belongs to the PhD workspace, not APFC.', workspaceId: 'phd_research' });
    expect(buildWorkspaceDocumentChunks([n], [], 'apfc')).toEqual([]);
  });

  it('produces no chunk for an empty/whitespace-only note, never a fabricated chunk', () => {
    const n = note({ id: 'n1', content: '   ' });
    expect(buildWorkspaceDocumentChunks([n], [], 'apfc')).toEqual([]);
  });
});

describe('retrieveWorkspaceEvidence', () => {
  const apfcNote = note({ id: 'n1', content: 'Minimum Wages Act 1948 governs minimum wage fixation in scheduled employments.' });
  const unrelatedNote = note({ id: 'n2', content: 'The Pomodoro technique uses 25 minute focus intervals.' });
  const cseContent = importedContent({ id: 'c1', workspaceId: 'upsc_cse', rawContent: 'Minimum wage legislation and labour welfare are recurring topics in GS Paper 3.' });

  it('retrieves evidence for a question whose terms genuinely appear in a workspace note', () => {
    const evidence = retrieveWorkspaceEvidence([apfcNote, unrelatedNote], [], 'apfc', { question: 'What does the Minimum Wages Act cover?' });
    expect(evidence.length).toBeGreaterThan(0);
    expect(evidence[0].citation.documentId).toBe('note:n1');
    expect(evidence[0].citation.quote).toContain('Minimum Wages Act');
  });

  it('never retrieves evidence from a different workspace\'s content', () => {
    const evidence = retrieveWorkspaceEvidence([apfcNote], [cseContent], 'apfc', { question: 'minimum wage labour welfare' });
    expect(evidence.every((e) => e.citation.documentId !== 'imported_content:c1')).toBe(true);
  });

  it('returns [] when nothing in the workspace matches the question, never a fabricated/irrelevant result', () => {
    const evidence = retrieveWorkspaceEvidence([unrelatedNote], [], 'apfc', { question: 'constitutional amendment procedure' });
    expect(evidence).toEqual([]);
  });

  it('respects a documentIds scope limited to this bridge\'s own prefixed ids', () => {
    const otherApfcNote = note({ id: 'n3', content: 'Minimum Wages Act also interacts with the Code on Wages 2019.' });
    const evidence = retrieveWorkspaceEvidence([apfcNote, otherApfcNote], [], 'apfc', {
      question: 'Minimum Wages Act',
      documentIds: [toWorkspaceDocumentId({ itemType: 'note', itemId: 'n3' })],
    });
    expect(evidence.every((e) => e.citation.documentId === 'note:n3')).toBe(true);
    expect(evidence.length).toBeGreaterThan(0);
  });

  // Regression test — heading-search coverage fix (jarvis/documents/ingestion.ts's
  // buildDocumentChunks). Before this fix, a query matching ONLY a note's own Markdown heading
  // (never repeated anywhere in its body) returned nothing: splitByHeadings strips the heading
  // line out of the section body it hands to the chunker, and keywordSearchChunks only ever
  // scores chunk.text, never section.title. Reproduces the exact real-browser finding verbatim.
  it('retrieves a note by words that appear ONLY in its own Markdown heading, never repeated in the body', () => {
    const headingOnlyNote = note({
      id: 'n4',
      content: '# Provident Fund Appellate Jurisdiction\n\nA small furry domestic companion animal that purrs and chases a thread of yarn.',
    });
    const evidence = retrieveWorkspaceEvidence([headingOnlyNote], [], 'apfc', { question: 'Provident Fund Appellate' });
    expect(evidence.length).toBeGreaterThan(0);
    expect(evidence[0].citation.documentId).toBe('note:n4');
  });
});

describe('resolveWorkspaceDocumentTitle', () => {
  it('resolves a note documentId back to its real title, workspace-scoped', () => {
    const n = note({ id: 'n1', title: 'Labour Law Essentials' });
    const resolved = resolveWorkspaceDocumentTitle('note:n1', [n], [], 'apfc');
    expect(resolved).toEqual({ itemType: 'note', itemId: 'n1', title: 'Labour Law Essentials' });
  });

  it('resolves an imported_content documentId back to its real title', () => {
    const c = importedContent({ id: 'c1', title: 'RBI Monetary Policy Report' });
    const resolved = resolveWorkspaceDocumentTitle('imported_content:c1', [], [c], 'apfc');
    expect(resolved).toEqual({ itemType: 'imported_content', itemId: 'c1', title: 'RBI Monetary Policy Report' });
  });

  it('returns undefined for a note that belongs to a different workspace — never fabricates across workspaces', () => {
    const n = note({ id: 'n1', title: 'Secret PhD note', workspaceId: 'phd_research' });
    expect(resolveWorkspaceDocumentTitle('note:n1', [n], [], 'apfc')).toBeUndefined();
  });

  it('returns undefined for an id whose item no longer exists', () => {
    expect(resolveWorkspaceDocumentTitle('note:does-not-exist', [], [], 'apfc')).toBeUndefined();
  });

  it('returns undefined for a malformed documentId', () => {
    expect(resolveWorkspaceDocumentTitle('garbage', [], [], 'apfc')).toBeUndefined();
  });
});
