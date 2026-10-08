import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildJarvisContext, type JarvisContextToolInputs, type BuildJarvisContextInput } from './contextEngine';
import { createToolRegistry, type JarvisToolRegistry } from './toolRegistry';
import { createApplicationTools } from './applicationTools';
import type { JarvisTool, JarvisToolResult } from './types';

function registryWithRealTools(): JarvisToolRegistry {
  const registry = createToolRegistry();
  for (const tool of createApplicationTools()) registry.register(tool);
  return registry;
}

const TODAY = '2026-10-03';

function baseInput(overrides: Partial<BuildJarvisContextInput> = {}): BuildJarvisContextInput {
  return {
    workspace: 'global',
    mode: 'general',
    timestamp: TODAY,
    registry: registryWithRealTools(),
    toolInputs: {},
    ...overrides,
  };
}

const emptyApfcInput: NonNullable<JarvisContextToolInputs['apfc.study_state']> = {
  completedTopics: {},
  pyqAttempts: [],
  bookmarkedPyqIds: [],
  revisionQueue: {},
  today: TODAY,
};

const emptyUpscInput: NonNullable<JarvisContextToolInputs['upsc.study_state']> = {
  coverage: {},
  attempts: [],
  bookmarkedPyqIds: [],
  revisionQueue: {},
  importedContent: [],
  today: TODAY,
};

const emptyCurrentAffairsInput: NonNullable<JarvisContextToolInputs['upsc.current_affairs_revision']> = {
  importedContent: [],
  revisionQueue: {},
  today: TODAY,
};

const emptyPhdInput: NonNullable<JarvisContextToolInputs['phd.research_state']> = {
  researchStartDate: '2024-01-01',
  topicAreas: [],
  microTargets: [],
  importedContent: [],
  notesCount: 0,
  today: TODAY,
};

describe('buildJarvisContext — study mode', () => {
  it('uses apfc.study_state for APFC and nothing else workspace-specific', async () => {
    const snapshot = await buildJarvisContext(
      baseInput({
        workspace: 'apfc',
        mode: 'study',
        toolInputs: { 'apfc.study_state': emptyApfcInput, 'global.workspace_state': { activeWorkspaceId: 'apfc' } },
      }),
    );
    expect(snapshot.sections.apfcStudy).toBeDefined();
    expect(snapshot.sections.apfcStudy?.sourceTool).toBe('apfc.study_state');
    expect(snapshot.sections.upscStudy).toBeUndefined();
    expect(snapshot.sections.phdResearch).toBeUndefined();
  });

  it('uses upsc.study_state and upsc.current_affairs_revision for UPSC, and nothing else', async () => {
    const snapshot = await buildJarvisContext(
      baseInput({
        workspace: 'upsc',
        mode: 'study',
        toolInputs: {
          'upsc.study_state': emptyUpscInput,
          'upsc.current_affairs_revision': emptyCurrentAffairsInput,
          'global.workspace_state': { activeWorkspaceId: 'upsc_cse' },
        },
      }),
    );
    expect(snapshot.sections.upscStudy).toBeDefined();
    expect(snapshot.sections.upscCurrentAffairs).toBeDefined();
    expect(snapshot.sections.apfcStudy).toBeUndefined();
    expect(snapshot.sections.phdResearch).toBeUndefined();
  });

  it('uses phd.research_state for PhD, and nothing else workspace-specific', async () => {
    const snapshot = await buildJarvisContext(
      baseInput({
        workspace: 'phd',
        mode: 'study',
        toolInputs: { 'phd.research_state': emptyPhdInput, 'global.workspace_state': { activeWorkspaceId: 'phd_research' } },
      }),
    );
    expect(snapshot.sections.phdResearch).toBeDefined();
    expect(snapshot.sections.apfcStudy).toBeUndefined();
    expect(snapshot.sections.upscStudy).toBeUndefined();
  });
});

describe('buildJarvisContext — research mode', () => {
  it('uses phd.research_state when the workspace is PhD', async () => {
    const snapshot = await buildJarvisContext(
      baseInput({ workspace: 'phd', mode: 'research', toolInputs: { 'phd.research_state': emptyPhdInput } }),
    );
    expect(snapshot.sections.phdResearch).toBeDefined();
  });

  it('does not fetch PhD research state for a non-PhD workspace', async () => {
    const snapshot = await buildJarvisContext(
      baseInput({ workspace: 'upsc', mode: 'research', toolInputs: { 'phd.research_state': emptyPhdInput } }),
    );
    expect(snapshot.sections.phdResearch).toBeUndefined();
    expect(snapshot.sources).toHaveLength(1);
    expect(snapshot.sources[0].sourceTool).toBe('global.workspace_state');
  });
});

describe('buildJarvisContext — general mode', () => {
  it('fetches only the active workspace, never a workspace-specific tool', async () => {
    const snapshot = await buildJarvisContext(
      baseInput({
        workspace: 'upsc',
        mode: 'general',
        toolInputs: { 'upsc.study_state': emptyUpscInput, 'phd.research_state': emptyPhdInput },
      }),
    );
    expect(snapshot.sources).toHaveLength(1);
    expect(snapshot.sources[0].sourceTool).toBe('global.workspace_state');
    expect(snapshot.sections.upscStudy).toBeUndefined();
    expect(snapshot.sections.phdResearch).toBeUndefined();
  });
});

describe('buildJarvisContext — tool execution', () => {
  it('dispatches through the supplied registry rather than any internal engine', async () => {
    const registry = createToolRegistry();
    const stubTool: JarvisTool<Record<string, never>, { dueRevisionCount: number; weakTopicCount: number; lowestWeakTopicAccuracyPct: number | null }> = {
      id: 'apfc.study_state',
      name: 'Stub',
      description: 'A stand-in that returns a fixed value no real engine would ever compute.',
      workspaces: ['apfc'],
      access: 'read',
      run: async () => ({ status: 'ok', summary: 'stub', data: { dueRevisionCount: 999, weakTopicCount: 999, lowestWeakTopicAccuracyPct: null } }),
    };
    registry.register(stubTool);

    const snapshot = await buildJarvisContext(
      baseInput({ workspace: 'apfc', mode: 'study', registry, toolInputs: { 'apfc.study_state': emptyApfcInput } }),
    );

    expect(snapshot.sections.apfcStudy?.dueRevisionCount).toBe(999);
  });

  it('produces a correctly shaped section with provenance for a successful global.workspace_state result', async () => {
    const snapshot = await buildJarvisContext(
      baseInput({ workspace: 'global', mode: 'general', toolInputs: { 'global.workspace_state': { activeWorkspaceId: 'apfc' } } }),
    );
    expect(snapshot.sections.workspace).toEqual({ sourceTool: 'global.workspace_state', workspace: 'apfc', label: expect.any(String) });
  });
});

describe('buildJarvisContext — error and partial-context handling', () => {
  function failingRegistry(): JarvisToolRegistry {
    const registry = createToolRegistry();
    const failingTool: JarvisTool<Record<string, never>, never> = {
      id: 'upsc.current_affairs_revision',
      name: 'Failing stub',
      description: 'Always fails, to test partial-context behaviour.',
      workspaces: ['upsc'],
      access: 'read',
      run: async (): Promise<JarvisToolResult<never>> => ({ status: 'error', summary: 'Could not read Current Affairs state.', error: 'simulated failure' }),
    };
    registry.register(failingTool);
    for (const tool of createApplicationTools()) {
      if (tool.id !== 'upsc.current_affairs_revision') registry.register(tool);
    }
    return registry;
  }

  it('records a failed source with a safe detail message, and marks the snapshot incomplete', async () => {
    const snapshot = await buildJarvisContext(
      baseInput({
        workspace: 'upsc',
        mode: 'study',
        registry: failingRegistry(),
        toolInputs: { 'upsc.study_state': emptyUpscInput, 'upsc.current_affairs_revision': emptyCurrentAffairsInput },
      }),
    );
    const failedSource = snapshot.sources.find((s) => s.sourceTool === 'upsc.current_affairs_revision');
    expect(failedSource?.status).toBe('error');
    expect(failedSource?.detail).toBe('simulated failure');
    expect(snapshot.incomplete).toBe(true);
    expect(snapshot.sections.upscCurrentAffairs).toBeUndefined();
  });

  it('keeps the successful upsc.study_state section even though upsc.current_affairs_revision failed', async () => {
    const snapshot = await buildJarvisContext(
      baseInput({
        workspace: 'upsc',
        mode: 'study',
        registry: failingRegistry(),
        toolInputs: { 'upsc.study_state': emptyUpscInput, 'upsc.current_affairs_revision': emptyCurrentAffairsInput },
      }),
    );
    expect(snapshot.sections.upscStudy).toBeDefined();
    expect(snapshot.sections.upscStudy?.sourceTool).toBe('upsc.study_state');
  });

  it('marks a relevant tool that is not registered as unavailable, not a silent omission', async () => {
    const registry = createToolRegistry(); // nothing registered at all
    const snapshot = await buildJarvisContext(baseInput({ workspace: 'apfc', mode: 'study', registry, toolInputs: { 'apfc.study_state': emptyApfcInput } }));
    const source = snapshot.sources.find((s) => s.sourceTool === 'apfc.study_state');
    expect(source?.status).toBe('unavailable');
    expect(snapshot.incomplete).toBe(true);
  });

  it('marks a relevant, registered tool with no supplied input as unavailable', async () => {
    const snapshot = await buildJarvisContext(baseInput({ workspace: 'apfc', mode: 'study', toolInputs: {} }));
    const source = snapshot.sources.find((s) => s.sourceTool === 'apfc.study_state');
    expect(source?.status).toBe('unavailable');
  });
});

describe('buildJarvisContext — provenance, bounding, and routing', () => {
  it('stamps every populated section and every source entry with its originating tool id', async () => {
    const snapshot = await buildJarvisContext(
      baseInput({
        workspace: 'apfc',
        mode: 'study',
        toolInputs: { 'apfc.study_state': emptyApfcInput, 'global.workspace_state': { activeWorkspaceId: 'apfc' } },
      }),
    );
    expect(snapshot.sections.apfcStudy?.sourceTool).toBe('apfc.study_state');
    expect(snapshot.sections.workspace?.sourceTool).toBe('global.workspace_state');
    expect(snapshot.sources.map((s) => s.sourceTool).sort()).toEqual(['apfc.study_state', 'global.workspace_state']);
  });

  it('keeps every section value a bounded scalar — never a raw item list or nested record', async () => {
    const snapshot = await buildJarvisContext(
      baseInput({
        workspace: 'upsc',
        mode: 'study',
        toolInputs: {
          'upsc.study_state': emptyUpscInput,
          'upsc.current_affairs_revision': emptyCurrentAffairsInput,
          'global.workspace_state': { activeWorkspaceId: 'upsc_cse' },
        },
      }),
    );
    for (const section of Object.values(snapshot.sections)) {
      for (const [key, value] of Object.entries(section as Record<string, unknown>)) {
        if (key === 'sourceTool') continue;
        expect(Array.isArray(value)).toBe(false);
        expect(value === null || typeof value === 'number' || typeof value === 'string').toBe(true);
      }
    }
  });

  it('preserves route when supplied, and leaves it undefined when not', async () => {
    const withRoute = await buildJarvisContext(baseInput({ route: '/pyq-test' }));
    expect(withRoute.route).toBe('/pyq-test');
    const withoutRoute = await buildJarvisContext(baseInput());
    expect(withoutRoute.route).toBeUndefined();
  });

  it('reports the active workspace using the same WorkspaceKind -> JarvisWorkspace mapping Phase 2 established', async () => {
    const snapshot = await buildJarvisContext(
      baseInput({ workspace: 'global', mode: 'general', toolInputs: { 'global.workspace_state': { activeWorkspaceId: 'upsc_cse' } } }),
    );
    expect(snapshot.sections.workspace?.workspace).toBe('upsc');
  });

  it('never mutates its toolInputs', async () => {
    const toolInputs: JarvisContextToolInputs = { 'apfc.study_state': { ...emptyApfcInput, bookmarkedPyqIds: ['pyq-1'] } };
    const snapshot_input = baseInput({ workspace: 'apfc', mode: 'study', toolInputs });
    const before = JSON.parse(JSON.stringify(toolInputs));
    await buildJarvisContext(snapshot_input);
    expect(toolInputs).toEqual(before);
  });
});

describe('architectural boundary — Context Engine must consume tools, not internal engines', () => {
  it('never imports an APFC/UPSC/PhD internal engine or a src/data constant directly', () => {
    const thisFile = fileURLToPath(import.meta.url);
    const contextEnginePath = join(dirname(thisFile), 'contextEngine.ts');
    const source = readFileSync(contextEnginePath, 'utf-8');

    const forbiddenModules = [
      'pyqFilters',
      'revisionQueue',
      'topicStatus',
      'weakTopicPractice',
      'pyqPerformance',
      'upscCseTodaysStudy',
      'phdDashboard',
      'phdAnalytics',
      'phdResearch',
      'phdReadingStatus',
      'commandCentre',
      'contentImport',
      'workspace',
    ];
    for (const moduleName of forbiddenModules) {
      expect(source).not.toMatch(new RegExp(`from ['"].*/${moduleName}['"]`));
    }
    expect(source).not.toMatch(/from ['"].*\/data\//);
  });
});
