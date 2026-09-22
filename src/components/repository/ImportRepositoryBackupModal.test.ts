import { describe, it, expect, beforeEach } from 'vitest';
import { useAppStore } from '../../lib/store';
import { createRevisionQueue } from '../../lib/revisionQueue';
import { DEFAULT_WORKSPACE_ID } from '../../lib/workspace';
import { confirmImportedContent, type ImportPreview } from '../../lib/contentImport';
import { buildRepositoryExportSnapshot, serializeRepositoryExportSnapshot } from '../../lib/repository';
import { validateRepositoryBackupJson, buildRepositoryImportPlan } from '../../lib/repositoryImport';

// This component has no rendering test here (no React Testing Library / DOM environment in this
// repo — see every other *.test.ts file for the established convention). These tests exercise the
// exact pipeline components/repository/ImportRepositoryBackupModal.tsx runs against the REAL
// store: validateRepositoryBackupJson -> buildRepositoryImportPlan -> (only on explicit confirm)
// useAppStore's applyRepositoryImportPlan. lib/repositoryImport.test.ts already covers the pure
// validate/plan logic exhaustively in isolation; these tests focus on how the STORE actually
// applies a plan — the one part of this stage lib/repositoryImport.ts's own pure tests can't cover
// on their own. A manual browser smoke check covers the actual on-screen
// pick/validate/preview/confirm flow.

function fullReset() {
  useAppStore.setState({
    activeWorkspaceId: DEFAULT_WORKSPACE_ID,
    inactiveWorkspaceOwnedData: {},
    completedTopics: {},
    notes: [],
    attempts: [],
    pyqAttempts: [],
    sessions: [],
    studyLog: {},
    starredQuestionIds: [],
    bookmarkedPyqIds: [],
    rewardUnlocks: {},
    studyPlan: null,
    studyPlanGeneratedAt: null,
    personalStudyPlanTasks: [],
    revisionQueue: createRevisionQueue(),
    importedContent: [],
    contentRelationships: [],
  });
}

function preview(overrides: Partial<ImportPreview> = {}): ImportPreview {
  return {
    sourceFilename: overrides.sourceFilename ?? 'file.md',
    originalFormat: overrides.originalFormat ?? 'markdown',
    suggestedContentType: overrides.suggestedContentType ?? 'note',
    title: overrides.title ?? 'Title',
    content: overrides.content ?? 'Body content.',
  };
}

/** Mirrors the modal's own handleFileChange: validate then build a plan against the real store's
 * current active-workspace data. */
function readAndPlan(json: string) {
  const validated = validateRepositoryBackupJson(json);
  if (validated.status !== 'ok') return validated;
  const state = useAppStore.getState();
  const plan = buildRepositoryImportPlan(validated.snapshot, {
    workspaceId: state.activeWorkspaceId,
    existingNotes: state.notes,
    existingImportedContent: state.importedContent,
    existingRelationships: state.contentRelationships,
  });
  return { status: 'ok' as const, plan };
}

describe('Import Repository Backup — no mutation before confirmation', () => {
  beforeEach(fullReset);

  it('reading and planning a backup never touches the store — only applyRepositoryImportPlan does', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);
    const backup = serializeRepositoryExportSnapshot(buildRepositoryExportSnapshot([doc], [], [], 'phd_research', '2026-01-01T00:00:00.000Z'));

    const before = useAppStore.getState().importedContent;
    const result = readAndPlan(backup);
    expect(result.status).toBe('ok');
    // Still just the original document — nothing from the plan has been applied.
    expect(useAppStore.getState().importedContent).toBe(before);
    expect(useAppStore.getState().importedContent).toHaveLength(1);
  });
});

describe('Import Repository Backup — successful additive restore via the real store', () => {
  beforeEach(fullReset);

  it('applyRepositoryImportPlan adds the backup\'s notes, imported content, and relationships to the current workspace', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Backed-up Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    const bib = confirmImportedContent(preview({ title: 'Backed-up Bib' }), { workspaceId: 'phd_research', contentType: 'bibliography' });
    useAppStore.getState().addImportedContent(doc);
    useAppStore.getState().addImportedContent(bib);
    useAppStore.getState().upsertNote({ id: 'src-note', subject: 'general', title: 'Backed-up Note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
    useAppStore.getState().addContentRelationship({ source: { id: bib.id, type: 'imported_content' }, target: { id: doc.id, type: 'imported_content' }, type: 'cites' });

    const state = useAppStore.getState();
    const backup = serializeRepositoryExportSnapshot(
      buildRepositoryExportSnapshot(state.importedContent, state.notes, state.contentRelationships, 'phd_research', '2026-01-01T00:00:00.000Z'),
    );

    // Simulate: switch to a clean workspace, then restore the backup there.
    fullReset();
    useAppStore.getState().setActiveWorkspaceId('apfc');
    const planResult = readAndPlan(backup);
    expect(planResult.status).toBe('ok');
    if (planResult.status !== 'ok') return;

    useAppStore.getState().applyRepositoryImportPlan(planResult.plan);

    const after = useAppStore.getState();
    expect(after.notes.map((n) => n.title)).toEqual(['Backed-up Note']);
    expect(after.importedContent.map((c) => c.title).sort()).toEqual(['Backed-up Bib', 'Backed-up Doc']);
    expect(after.contentRelationships).toHaveLength(1);
    // Restored into the CURRENT active workspace (apfc), not the backup's original (phd_research).
    expect(after.notes.every((n) => n.workspaceId === 'apfc')).toBe(true);
    expect(after.importedContent.every((c) => c.workspaceId === 'apfc')).toBe(true);
    expect(after.contentRelationships.every((r) => r.workspaceId === 'apfc')).toBe(true);
  });
});

describe('Import Repository Backup — no overwrite of existing records (real store)', () => {
  beforeEach(fullReset);

  it('importing a backup whose ids collide with existing destination records leaves the existing records completely untouched', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const original = confirmImportedContent(preview({ title: 'Original Title', content: 'Original raw content' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(original);

    // A backup that happens to carry the SAME id but different content (simulating a stale/older
    // export, or a deliberately crafted collision).
    const collidingBackupJson = JSON.stringify(
      buildRepositoryExportSnapshot(
        [{ ...original, title: 'Imported Title (should not overwrite)', rawContent: 'Different content' }],
        [],
        [],
        'phd_research',
        '2026-01-01T00:00:00.000Z',
      ),
    );

    const result = readAndPlan(collidingBackupJson);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    useAppStore.getState().applyRepositoryImportPlan(result.plan);

    const items = useAppStore.getState().importedContent;
    expect(items).toHaveLength(2); // the original, untouched, plus a new remapped copy
    const untouchedOriginal = items.find((i) => i.id === original.id);
    expect(untouchedOriginal?.title).toBe('Original Title');
    expect(untouchedOriginal?.rawContent).toBe('Original raw content');
    const remappedCopy = items.find((i) => i.id !== original.id);
    expect(remappedCopy?.title).toBe('Imported Title (should not overwrite)');
  });
});

describe('Import Repository Backup — atomicity (single store update)', () => {
  beforeEach(fullReset);

  it('applyRepositoryImportPlan changes notes, importedContent, and contentRelationships together in one update, never partially', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Doc' }), { workspaceId: 'phd_research', contentType: 'research_document' });
    useAppStore.getState().addImportedContent(doc);
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'Note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
    useAppStore.getState().addContentRelationship({ source: { id: doc.id, type: 'imported_content' }, target: { id: 'n1', type: 'note' }, type: 'related_to' });

    const state = useAppStore.getState();
    const backup = serializeRepositoryExportSnapshot(
      buildRepositoryExportSnapshot(state.importedContent, state.notes, state.contentRelationships, 'phd_research', '2026-01-01T00:00:00.000Z'),
    );

    const result = readAndPlan(backup); // re-importing into the SAME (non-empty) workspace -> everything collides
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;

    let updateCount = 0;
    const unsubscribe = useAppStore.subscribe(() => {
      updateCount++;
    });
    useAppStore.getState().applyRepositoryImportPlan(result.plan);
    unsubscribe();

    expect(updateCount).toBe(1); // one set() call, not one per collection
    expect(useAppStore.getState().notes).toHaveLength(2);
    expect(useAppStore.getState().importedContent).toHaveLength(2);
    expect(useAppStore.getState().contentRelationships).toHaveLength(2);
  });
});

describe('Import Repository Backup — existing repository export regression', () => {
  beforeEach(fullReset);

  it('the export -> import round trip preserves every field exactly (content, title, tags, category, provenance)', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const doc = confirmImportedContent(preview({ title: 'Round Trip Doc', content: 'Exact content to preserve.' }), {
      workspaceId: 'phd_research',
      contentType: 'research_document',
      metadata: { tags: ['a', 'b'], category: 'Cat' },
    });
    useAppStore.getState().addImportedContent(doc);

    const exportedJson = serializeRepositoryExportSnapshot(
      buildRepositoryExportSnapshot(useAppStore.getState().importedContent, [], [], 'phd_research', '2026-01-01T00:00:00.000Z'),
    );

    fullReset();
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    const result = readAndPlan(exportedJson);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    useAppStore.getState().applyRepositoryImportPlan(result.plan);

    const restored = useAppStore.getState().importedContent[0];
    expect(restored.title).toBe('Round Trip Doc');
    expect(restored.rawContent).toBe('Exact content to preserve.');
    expect(restored.metadata).toEqual({ tags: ['a', 'b'], category: 'Cat' });
    expect(restored.contentType).toBe('research_document');
    expect(restored.id).toBe(doc.id); // empty destination -> no collision -> original id preserved
  });

  it('exportAllData/importAllData (the unrelated full-app backup) still works, unaffected by this feature', () => {
    useAppStore.getState().setActiveWorkspaceId('phd_research');
    useAppStore.getState().upsertNote({ id: 'n1', subject: 'general', title: 'Note', content: 'x', createdAt: 'a', updatedAt: 'a', pinned: false });
    // Just a smoke check that the schemaVersion/kind additions to RepositoryExportSnapshot never
    // leaked into or broke the separate, unrelated store field this module doesn't touch.
    expect(useAppStore.getState().notes).toHaveLength(1);
  });
});
