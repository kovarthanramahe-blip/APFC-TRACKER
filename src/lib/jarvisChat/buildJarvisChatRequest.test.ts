import { describe, it, expect } from 'vitest';
import { buildJarvisChatRequestContext, type JarvisChatGroundingData } from './buildJarvisChatRequest';

const EMPTY_APFC = { completedTopics: {}, pyqAttempts: [], bookmarkedPyqIds: [], revisionQueue: {} };
const EMPTY_UPSC = { coverage: {}, attempts: [], bookmarkedPyqIds: [], revisionQueue: {}, importedContent: [] };
const EMPTY_PHD = { researchStartDate: '2025-01-01', topicAreas: [], microTargets: [], importedContent: [], notesCount: 0 };

function baseData(overrides: Partial<JarvisChatGroundingData> = {}): JarvisChatGroundingData {
  return {
    activeWorkspaceId: 'apfc',
    today: '2026-01-01',
    apfcData: EMPTY_APFC,
    upscCseData: EMPTY_UPSC,
    phdData: EMPTY_PHD,
    ...overrides,
  };
}

describe('buildJarvisChatRequestContext', () => {
  it('maps apfc -> workspace "apfc" and includes only apfc.study_state (+ global.workspace_state)', () => {
    const { workspace, toolInputs } = buildJarvisChatRequestContext(baseData());
    expect(workspace).toBe('apfc');
    expect(Object.keys(toolInputs).sort()).toEqual(['apfc.study_state', 'global.workspace_state']);
    expect(toolInputs['apfc.study_state']).toEqual({ ...EMPTY_APFC, today: '2026-01-01' });
  });

  it('maps upsc_cse -> workspace "upsc" and includes both upsc.study_state and upsc.current_affairs_revision', () => {
    const { workspace, toolInputs } = buildJarvisChatRequestContext(baseData({ activeWorkspaceId: 'upsc_cse' }));
    expect(workspace).toBe('upsc');
    expect(Object.keys(toolInputs).sort()).toEqual(['global.workspace_state', 'upsc.current_affairs_revision', 'upsc.study_state']);
  });

  it('maps phd_research -> workspace "phd" and includes only phd.research_state', () => {
    const { workspace, toolInputs } = buildJarvisChatRequestContext(baseData({ activeWorkspaceId: 'phd_research' }));
    expect(workspace).toBe('phd');
    expect(Object.keys(toolInputs).sort()).toEqual(['global.workspace_state', 'phd.research_state']);
  });

  it('never includes another workspace\'s tool input alongside the active one', () => {
    const { toolInputs } = buildJarvisChatRequestContext(baseData({ activeWorkspaceId: 'apfc' }));
    expect(toolInputs['upsc.study_state']).toBeUndefined();
    expect(toolInputs['phd.research_state']).toBeUndefined();
  });

  it('is pure — the same input always produces an equal (deep) output', () => {
    const data = baseData({ activeWorkspaceId: 'upsc_cse' });
    expect(buildJarvisChatRequestContext(data)).toEqual(buildJarvisChatRequestContext(data));
  });
});
