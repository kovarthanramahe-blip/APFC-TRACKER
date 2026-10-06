import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handleJarvisRequest } from './orchestrator';
import { createToolRegistry } from './toolRegistry';
import { apfcStudyStateTool, upscStudyStateTool, phdResearchStateTool, type ApfcStudyStateInput, type UpscStudyStateInput, type PhdResearchStateInput } from './applicationTools';
import type { JarvisContext, JarvisTool } from './types';
import type { LocalLlamaRuntimePlugin, LocalLlamaStreamWireEvent } from './ai/android/localLlamaCapacitorPlugin';
import { PYQ_BANK } from '../../data/pyq';
import type { MicroTarget } from '../microTarget';

const CONTEXT: JarvisContext = { workspace: 'upsc', timestamp: '2026-01-01T00:00:00Z' };

function fixturePlugin(overrides: Partial<LocalLlamaRuntimePlugin> = {}): LocalLlamaRuntimePlugin {
  return {
    getRuntimeStatus: async () => ({ status: 'available' }),
    getLoadedModel: async () => ({ model: null }),
    loadModel: async () => {},
    unloadModel: async () => {},
    complete: async () => ({ text: 'stub response', finishReason: 'stop' }),
    completeStreaming: async () => {},
    cancel: async () => {},
    addListener: async (_eventName: string, _listenerFunc: (event: LocalLlamaStreamWireEvent) => void) => ({ remove: async () => {} }),
    ...overrides,
  };
}

describe('runJarvisRequest — deterministic request remains intact', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.doUnmock('./ai/android/localLlamaCapacitorPlugin'));

  it('a study_next intent routes to the deterministic tool and never consults any provider', async () => {
    const getRuntimeStatusSpy = vi.fn(async () => ({ status: 'ready' as const }));
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({
      default: fixturePlugin({ getRuntimeStatus: getRuntimeStatusSpy }),
      isLocalLlamaRuntimeAvailable: true,
    }));
    const { runJarvisRequest } = await import('./runtime');

    const query = 'what should i study next';
    const result = await runJarvisRequest({ context: CONTEXT, query });
    const expected = handleJarvisRequest(CONTEXT, query);

    expect(result.response).toEqual(expected);
    expect(result.provenance).toEqual({ source: 'deterministic', degraded: false, routeTarget: 'deterministic_tool' });
    expect(getRuntimeStatusSpy).not.toHaveBeenCalled();
  });

  it('every returned response matches handleJarvisRequest\'s own output whenever no provider actually answers', async () => {
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({ default: fixturePlugin(), isLocalLlamaRuntimeAvailable: false }));
    const { runJarvisRequest } = await import('./runtime');

    const query = 'explain the preamble';
    const result = await runJarvisRequest({ context: CONTEXT, query });
    expect(result.response).toEqual(handleJarvisRequest(CONTEXT, query));
  });
});

describe('runJarvisRequest — no AI provider available (honest fallback)', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.doUnmock('./ai/android/localLlamaCapacitorPlugin'));

  it('reports no_provider_available and degraded:true when the platform has no native runtime at all', async () => {
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({ default: fixturePlugin(), isLocalLlamaRuntimeAvailable: false }));
    const { runJarvisRequest } = await import('./runtime');

    const result = await runJarvisRequest({ context: CONTEXT, query: 'explain the preamble' });

    expect(result.provenance.source).toBe('no_provider_available');
    expect(result.provenance.degraded).toBe(true);
    expect(result.provenance.degradedReason).toBeTruthy();
    expect(result.response.responseText).toContain('JARVIS');
  });

  it('this is the REAL behaviour under plain Node/Vitest with no mocking at all (no Capacitor native bridge present)', async () => {
    const { runJarvisRequest } = await import('./runtime');
    const result = await runJarvisRequest({ context: CONTEXT, query: 'explain the preamble' });
    expect(result.provenance.source).toBe('no_provider_available');
  });
});

describe('runJarvisRequest — browser/non-Android never invokes the Android native runtime', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.doUnmock('./ai/android/localLlamaCapacitorPlugin'));

  it('never calls any plugin method when isLocalLlamaRuntimeAvailable is false, even if a plugin object exists', async () => {
    const getRuntimeStatusSpy = vi.fn(async () => ({ status: 'ready' as const }));
    const completeSpy = vi.fn(async () => ({ text: 'should never be called', finishReason: 'stop' as const }));
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({
      default: fixturePlugin({ getRuntimeStatus: getRuntimeStatusSpy, complete: completeSpy }),
      isLocalLlamaRuntimeAvailable: false,
    }));
    const { runJarvisRequest } = await import('./runtime');

    await runJarvisRequest({ context: CONTEXT, query: 'explain the preamble' });

    expect(getRuntimeStatusSpy).not.toHaveBeenCalled();
    expect(completeSpy).not.toHaveBeenCalled();
  });
});

describe('runJarvisRequest — Android provider composition is genuinely reachable (Phase 11.1 fix)', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.doUnmock('./ai/android/localLlamaCapacitorPlugin'));

  it('reaches the native runtime boundary (provider.complete() is genuinely called) for the REAL current stub status — "available", no model loaded', async () => {
    // This is the REAL current behaviour of the native stub (see NativeLlamaRuntime.kt): status
    // starts at AVAILABLE and only reaches READY once loadModel() is explicitly called, which
    // this phase's own runtime.ts still never does. Before the Phase 11.1 fix, this exact case
    // returned before ever calling provider.complete() — making the bridge permanently
    // unreachable from any real request. The fix calls it whenever the bridge is reachable at
    // all, not only once a model is loaded.
    const completeSpy = vi.fn(async (request: { prompt: string }) => {
      expect(request.prompt).toContain('explain the preamble');
      return { text: 'Hello from the native stub.', promptTokens: 2, generatedTokens: 6, finishReason: 'stop' as const };
    });
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({
      default: fixturePlugin({ getRuntimeStatus: async () => ({ status: 'available' }), getLoadedModel: async () => ({ model: null }), complete: completeSpy }),
      isLocalLlamaRuntimeAvailable: true,
    }));
    const { runJarvisRequest } = await import('./runtime');

    const result = await runJarvisRequest({ context: CONTEXT, query: 'explain the preamble' });

    expect(completeSpy).toHaveBeenCalledTimes(1);
    expect(result.response.responseText).toBe('Hello from the native stub.');
  });

  it('never fakes "AI ready" for that same case — labels the result as the native stub, never as real AI', async () => {
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({
      default: fixturePlugin({
        getRuntimeStatus: async () => ({ status: 'available' }),
        getLoadedModel: async () => ({ model: null }),
        complete: async () => ({ text: 'Hello from the native stub.', finishReason: 'stop' as const }),
      }),
      isLocalLlamaRuntimeAvailable: true,
    }));
    const { runJarvisRequest } = await import('./runtime');

    const result = await runJarvisRequest({ context: CONTEXT, query: 'explain the preamble' });

    expect(result.provenance).toEqual({
      source: 'android_native_stub',
      providerId: 'android-local-llama',
      providerHealth: 'available',
      routeTarget: 'local_ai',
      degraded: true,
      degradedReason: 'Answered by the Phase 10 native bridge-validation stub — no real AI model is loaded yet.',
    });
    // providerHealth itself is never altered to look ready — it stays exactly what the runtime
    // genuinely reported ('available'), never 'model_ready'.
    expect(result.provenance.providerHealth).not.toBe('model_ready');
  });

  it('reaches the real provider.complete() call once a loaded, ready model is genuinely reported — proving the full dependency path works end to end', async () => {
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({
      default: fixturePlugin({
        getRuntimeStatus: async () => ({ status: 'ready' }),
        getLoadedModel: async () => ({ model: { modelId: 'stub-model', loadedAt: '2026-01-01T00:00:00Z' } }),
        complete: async () => ({ text: 'Hello from the native stub.', promptTokens: 2, generatedTokens: 6, finishReason: 'stop' }),
      }),
      isLocalLlamaRuntimeAvailable: true,
    }));
    const { runJarvisRequest } = await import('./runtime');

    const result = await runJarvisRequest({ context: CONTEXT, query: 'explain the preamble' });

    expect(result.provenance).toEqual({
      source: 'android_local_ai',
      providerId: 'android-local-llama',
      providerHealth: 'model_ready',
      routeTarget: 'local_ai',
      degraded: false,
    });
    expect(result.response.responseText).toBe('Hello from the native stub.');
    expect(result.response.requiresFurtherProcessing).toBe(false);
  });

  it('a genuinely unavailable native runtime (status: unavailable) still returns the honest unavailable/fallback result, never calling complete()', async () => {
    const completeSpy = vi.fn(async () => ({ text: 'should never be called', finishReason: 'stop' as const }));
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({
      default: fixturePlugin({ getRuntimeStatus: async () => ({ status: 'unavailable' }), getLoadedModel: async () => ({ model: null }), complete: completeSpy }),
      isLocalLlamaRuntimeAvailable: true,
    }));
    const { runJarvisRequest } = await import('./runtime');

    const result = await runJarvisRequest({ context: CONTEXT, query: 'explain the preamble' });

    expect(result.provenance.source).toBe('no_provider_available');
    expect(result.provenance.providerHealth).toBe('unavailable');
    expect(result.provenance.degraded).toBe(true);
    expect(completeSpy).not.toHaveBeenCalled();
    expect(result.response.responseText).not.toContain('should never be called');
  });

  it('a native runtime reporting an error status still returns the honest unavailable/fallback result, never calling complete()', async () => {
    const completeSpy = vi.fn(async () => ({ text: 'should never be called', finishReason: 'stop' as const }));
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({
      // status 'ready' with no loaded model maps to health 'error' (see toAndroidProviderHealthStatus).
      default: fixturePlugin({ getRuntimeStatus: async () => ({ status: 'ready' }), getLoadedModel: async () => ({ model: null }), complete: completeSpy }),
      isLocalLlamaRuntimeAvailable: true,
    }));
    const { runJarvisRequest } = await import('./runtime');

    const result = await runJarvisRequest({ context: CONTEXT, query: 'explain the preamble' });

    expect(result.provenance.source).toBe('no_provider_available');
    expect(result.provenance.providerHealth).toBe('error');
    expect(result.provenance.degraded).toBe(true);
    expect(completeSpy).not.toHaveBeenCalled();
  });

  it('reports no_provider_available (never throws) when the provider itself errors', async () => {
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({
      default: fixturePlugin({
        getRuntimeStatus: async () => ({ status: 'ready' }),
        getLoadedModel: async () => ({ model: { modelId: 'stub-model', loadedAt: '2026-01-01T00:00:00Z' } }),
        complete: async () => {
          throw new Error('native crash');
        },
      }),
      isLocalLlamaRuntimeAvailable: true,
    }));
    const { runJarvisRequest } = await import('./runtime');

    const result = await runJarvisRequest({ context: CONTEXT, query: 'explain the preamble' });
    expect(result.provenance.source).toBe('no_provider_available');
    expect(result.provenance.degraded).toBe(true);
  });
});

describe('runJarvisRequest — provenance is always explicit', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.doUnmock('./ai/android/localLlamaCapacitorPlugin'));

  it('every result carries a provenance.source and an explicit degraded boolean, never undefined', async () => {
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({ default: fixturePlugin(), isLocalLlamaRuntimeAvailable: false }));
    const { runJarvisRequest } = await import('./runtime');

    for (const query of ['what should i study next', 'explain the preamble', 'do create a new target']) {
      const result = await runJarvisRequest({ context: CONTEXT, query });
      expect(typeof result.provenance.source).toBe('string');
      expect(typeof result.provenance.degraded).toBe('boolean');
    }
  });
});

// ================================================================================================
// Phase 11.4 — wiring the EXISTING Phase 2 application tools / Phase 3 context engine into the
// EXISTING Phase 11 runtime (via the EXISTING Phase 1 tool registry). No new tool, no new provider,
// no rewrite of handleJarvisRequest()/resolveJarvisRoute() — see runtime.ts's own Phase 11.4
// section for the one, narrow integration point these tests pin.
// ================================================================================================
describe('runJarvisRequest — Phase 11.4: "what should i study next" reaches the real, existing tools', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.doUnmock('./ai/android/localLlamaCapacitorPlugin'));

  const TODAY = '2026-01-01';
  const TIMESTAMP = '2026-01-01T00:00:00Z';

  // Phase 12 — these three fixtures were originally all-empty (every count legitimately zero),
  // which the Phase 12 decision engine now correctly reports as a truthful "nothing actionable"
  // result instead of reciting raw zero counts. That is the intended, more useful behaviour this
  // phase adds, so the fixtures below were updated to carry real non-zero data — proving the real
  // tool's own data still flows all the way into the final response text, just through the
  // decision engine's own (more useful) phrasing rather than the old generic summary. See
  // decisionEngine.test.ts for the "no actionable items" / "insufficient data" cases on their own.
  const APFC_INPUT: ApfcStudyStateInput = { completedTopics: {}, pyqAttempts: [], bookmarkedPyqIds: [PYQ_BANK[0].id], revisionQueue: {}, today: TODAY };
  const UPSC_INPUT: UpscStudyStateInput = { coverage: {}, attempts: [], bookmarkedPyqIds: [], revisionQueue: {}, importedContent: [], today: TODAY };
  const OVERDUE_MICRO_TARGET: MicroTarget = { id: 'mt-overdue', title: 'Read chapter 3', status: 'pending', priority: 'medium', createdAt: '2025-01-01T00:00:00.000Z', targetDate: '2025-12-01' };
  const PHD_INPUT: PhdResearchStateInput = { researchStartDate: '2025-01-01', topicAreas: [], microTargets: [OVERDUE_MICRO_TARGET], importedContent: [], notesCount: 0, today: TODAY };

  it('registers the Phase 2 application tools by default — the apfc workspace\'s real apfc.study_state tool actually runs and grounds the response (via the Phase 12 decision engine), never the "No tools are registered" canned text', async () => {
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({ default: fixturePlugin(), isLocalLlamaRuntimeAvailable: false }));
    const { runJarvisRequest } = await import('./runtime');

    const toolContext: JarvisContext = { workspace: 'apfc', timestamp: TIMESTAMP };
    const expectedToolResult = await apfcStudyStateTool.run(APFC_INPUT, toolContext);
    expect(expectedToolResult.status).toBe('ok');
    const expectedData = expectedToolResult.status === 'ok' ? expectedToolResult.data : null;
    expect(expectedData!.dueRevisionCount).toBeGreaterThan(0);

    const result = await runJarvisRequest({
      context: toolContext,
      query: 'what should i study next',
      toolInputs: { 'apfc.study_state': APFC_INPUT },
    });

    expect(result.response.responseText).toContain(`${expectedData!.dueRevisionCount} PYQ`);
    expect(result.response.responseText).not.toContain('No tools are registered yet');
    expect(result.response.requiresFurtherProcessing).toBe(false);
    expect(result.provenance).toEqual({ source: 'deterministic', degraded: false, routeTarget: 'deterministic_tool' });
  });

  it('selects the upsc.study_state tool for the upsc workspace, and the Phase 12 decision engine names the SAME top candidate generateTodaysStudyItems itself ranked first', async () => {
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({ default: fixturePlugin(), isLocalLlamaRuntimeAvailable: false }));
    const { runJarvisRequest } = await import('./runtime');

    const toolContext: JarvisContext = { workspace: 'upsc', timestamp: TIMESTAMP };
    const expectedToolResult = await upscStudyStateTool.run(UPSC_INPUT, toolContext);
    expect(expectedToolResult.status).toBe('ok');
    const expectedData = expectedToolResult.status === 'ok' ? expectedToolResult.data : null;
    expect(expectedData!.items.length).toBeGreaterThan(0);

    const result = await runJarvisRequest({
      context: toolContext,
      query: 'what should i study next',
      toolInputs: { 'upsc.study_state': UPSC_INPUT, 'upsc.current_affairs_revision': { importedContent: [], revisionQueue: {}, today: TODAY } },
    });

    // The exact title of generateTodaysStudyItems' own first-ranked item must appear — proving the
    // decision engine selected the SAME candidate the existing engine already ranked first, never
    // a re-ranked or fabricated one.
    expect(result.response.responseText).toContain(expectedData!.items[0].title);
    expect(result.response.responseText).toContain(`${expectedData!.items.length} study item`);
    expect(result.response.requiresFurtherProcessing).toBe(false);
    expect(result.provenance.routeTarget).toBe('deterministic_tool');
  });

  it('selects the phd.research_state tool for the phd workspace, grounded in the real dashboard/analytics output (via the Phase 12 decision engine)', async () => {
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({ default: fixturePlugin(), isLocalLlamaRuntimeAvailable: false }));
    const { runJarvisRequest } = await import('./runtime');

    const toolContext: JarvisContext = { workspace: 'phd', timestamp: TIMESTAMP };
    const expectedToolResult = await phdResearchStateTool.run(PHD_INPUT, toolContext);
    expect(expectedToolResult.status).toBe('ok');
    const expectedData = expectedToolResult.status === 'ok' ? expectedToolResult.data : null;
    expect(expectedData!.overdueMicroTargetCount).toBeGreaterThan(0);

    const result = await runJarvisRequest({
      context: toolContext,
      query: 'what should i study next',
      toolInputs: { 'phd.research_state': PHD_INPUT },
    });

    expect(result.response.responseText).toContain(`${expectedData!.overdueMicroTargetCount} overdue micro-target`);
    expect(result.response.requiresFurtherProcessing).toBe(false);
    expect(result.provenance.routeTarget).toBe('deterministic_tool');
  });

  it('an empty registry still produces the existing deterministic fallback, never throwing — "no relevant tool exists" stays safe', async () => {
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({ default: fixturePlugin(), isLocalLlamaRuntimeAvailable: false }));
    const { runJarvisRequest } = await import('./runtime');

    const toolContext: JarvisContext = { workspace: 'apfc', timestamp: TIMESTAMP };
    const query = 'what should i study next';

    const result = await runJarvisRequest({
      context: toolContext,
      query,
      toolInputs: { 'apfc.study_state': APFC_INPUT },
      registry: createToolRegistry(), // deliberately empty — nothing registered
    });

    expect(result.response).toEqual(handleJarvisRequest(toolContext, query));
    expect(result.provenance).toEqual({ source: 'deterministic', degraded: false, routeTarget: 'deterministic_tool' });
  });

  it('a tool that throws is handled safely — falls back to the existing deterministic canned response, never propagating the error', async () => {
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({ default: fixturePlugin(), isLocalLlamaRuntimeAvailable: false }));
    const { runJarvisRequest } = await import('./runtime');

    const brokenTool: JarvisTool<ApfcStudyStateInput, never> = {
      id: 'apfc.study_state',
      name: 'Deliberately Broken APFC Study State',
      description: 'Always throws — proves a failing tool never crashes runJarvisRequest and never fabricates an answer.',
      workspaces: ['apfc'],
      access: 'read',
      run: async () => {
        throw new Error('boom');
      },
    };
    const brokenRegistry = createToolRegistry();
    expect(brokenRegistry.register(brokenTool).status).toBe('ok');

    const toolContext: JarvisContext = { workspace: 'apfc', timestamp: TIMESTAMP };
    const query = 'what should i study next';

    const result = await runJarvisRequest({
      context: toolContext,
      query,
      toolInputs: { 'apfc.study_state': APFC_INPUT },
      registry: brokenRegistry,
    });

    expect(result.response).toEqual(handleJarvisRequest(toolContext, query));
    expect(result.provenance).toEqual({ source: 'deterministic', degraded: false, routeTarget: 'deterministic_tool' });
  });

  it('required context being unavailable (no toolInputs supplied) reproduces the EXACT pre-Phase-11.4 behaviour — existing Phase 1-11 behaviour stays intact', async () => {
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({ default: fixturePlugin(), isLocalLlamaRuntimeAvailable: false }));
    const { runJarvisRequest } = await import('./runtime');

    const toolContext: JarvisContext = { workspace: 'apfc', timestamp: TIMESTAMP };
    const query = 'what should i study next';

    const result = await runJarvisRequest({ context: toolContext, query });

    expect(result.response).toEqual(handleJarvisRequest(toolContext, query));
    expect(result.provenance).toEqual({ source: 'deterministic', degraded: false, routeTarget: 'deterministic_tool' });
  });
});
