import { describe, it, expect } from 'vitest';
import { useAppStore } from '../../lib/store';
import { createRevisionQueue } from '../../lib/revisionQueue';
import { DEFAULT_WORKSPACE_ID } from '../../lib/workspace';
import { buildCurrentAffairsManualContent } from './CreateCurrentAffairsModal';

// Manual Current Affairs capture — this component has no rendering test here (no React Testing
// Library / DOM environment in this repo — see ImportToRepositoryModal.test.ts's own header for the
// established convention). These tests exercise buildCurrentAffairsManualContent, the exact pure
// builder the modal's Save button calls — it is a thin composition of the EXISTING
// createManualImportedContent() (lib/contentImport.ts) and buildMetadata() (ImportToRepositoryModal.tsx),
// never a new creation function or a new metadata builder.

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

describe('buildCurrentAffairsManualContent — produces a real ImportedContent', () => {
  it('creates an ImportedContent object with contentType exactly "current_affairs"', () => {
    const item = buildCurrentAffairsManualContent('upsc_cse', 'New policy announced', 'Body text here.', '', '', '');
    expect(item.contentType).toBe('current_affairs');
  });

  it('preserves the title', () => {
    const item = buildCurrentAffairsManualContent('upsc_cse', '  New policy announced  ', 'Body', '', '', '');
    expect(item.title).toBe('New policy announced');
  });

  it('preserves rawContent exactly as typed', () => {
    const item = buildCurrentAffairsManualContent('upsc_cse', 'Title', 'What happened, why it matters.', '', '', '');
    expect(item.rawContent).toBe('What happened, why it matters.');
  });

  it('preserves eventDate in metadata', () => {
    const item = buildCurrentAffairsManualContent('upsc_cse', 'Title', 'Body', '2026-03-14', '', '');
    expect(item.metadata?.eventDate).toBe('2026-03-14');
  });

  it('preserves source in metadata', () => {
    const item = buildCurrentAffairsManualContent('upsc_cse', 'Title', 'Body', '', 'The Hindu, 14 Mar 2026', '');
    expect(item.metadata?.source).toBe('The Hindu, 14 Mar 2026');
  });

  it('preserves syllabusNodeId in metadata, exactly as selected, with no second validation', () => {
    const item = buildCurrentAffairsManualContent('upsc_cse', 'Title', 'Body', '', '', 'some-real-looking-node-id');
    expect(item.metadata?.syllabusNodeId).toBe('some-real-looking-node-id');
  });

  it('stamps workspaceId exactly as given', () => {
    const item = buildCurrentAffairsManualContent('upsc_cse', 'Title', 'Body', '', '', '');
    expect(item.workspaceId).toBe('upsc_cse');
  });

  it('introduces no file/import assumption that would break manual content — origin is "manual", no sourceFilename/sourceHash/sourceFileSize', () => {
    const item = buildCurrentAffairsManualContent('upsc_cse', 'Title', 'Body', '2026-01-05', 'PIB', 'node-1');
    expect(item.provenance.origin).toBe('manual');
    expect(item.provenance.sourceFilename).toBeUndefined();
    expect(item.provenance.sourceHash).toBeUndefined();
    expect(item.provenance.sourceFileSize).toBeUndefined();
    expect(item.provenance.originalFormat).toBeUndefined();
  });

  it('all three Current Affairs fields are optional — an entry with none of them still saves cleanly with no fabricated defaults', () => {
    const item = buildCurrentAffairsManualContent('upsc_cse', 'Title only', 'Body only', '', '', '');
    expect(item.metadata).toBeUndefined();
  });

  it('each saved entry gets its own unique id', () => {
    const a = buildCurrentAffairsManualContent('upsc_cse', 'Title', 'Body', '', '', '');
    const b = buildCurrentAffairsManualContent('upsc_cse', 'Title', 'Body', '', '', '');
    expect(a.id).not.toBe(b.id);
  });
});

describe('buildCurrentAffairsManualContent — building a draft never persists anything (the basis for "Cancel discards the draft")', () => {
  it('is a pure builder: calling it repeatedly never touches the store — only the modal\'s explicit Save -> addImportedContent does', () => {
    fullReset();
    buildCurrentAffairsManualContent('upsc_cse', 'Draft title', 'Draft body', '2026-01-01', 'Source', 'node-1');
    buildCurrentAffairsManualContent('upsc_cse', 'Another draft', 'More body', '', '', '');
    // Simulates typing into the form and then closing without clicking Save — onClose simply
    // unmounts the component (same documented pattern as ImportToRepositoryModal's own Cancel),
    // and since this builder itself never calls addImportedContent, nothing was ever persisted to
    // begin with for Cancel to need to undo.
    expect(useAppStore.getState().importedContent).toEqual([]);
  });

  it('an explicit save (addImportedContent), by contrast, does persist exactly one item — proving the two paths genuinely differ', () => {
    fullReset();
    const item = buildCurrentAffairsManualContent('upsc_cse', 'Saved title', 'Saved body', '', '', '');
    useAppStore.getState().addImportedContent(item);
    expect(useAppStore.getState().importedContent).toHaveLength(1);
    expect(useAppStore.getState().importedContent[0].contentType).toBe('current_affairs');
  });
});
