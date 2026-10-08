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

// ================================================================================================
// Phase 14 — streamJarvisRequest: the additive streaming sibling the real JARVIS chat UI drives.
// runJarvisRequest itself is never modified — every test above this point still exercises it
// completely unchanged.
// ================================================================================================
async function drain(iterable: AsyncGenerator<import('./runtime').JarvisStreamDelta>) {
  const events: import('./runtime').JarvisStreamDelta[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

/** A fixture plugin whose `completeStreaming` genuinely emits events through `addListener` —
 * exactly the real wiring nativeLlamaRuntime.ts's own `stream()` depends on (see that file's own
 * tests for the same pattern) — so streamJarvisRequest is exercised through the REAL
 * provider.stream() path, never a shortcut. */
function streamingFixturePlugin(tokens: string[], overrides: Partial<LocalLlamaRuntimePlugin> = {}): LocalLlamaRuntimePlugin {
  let listener: ((event: LocalLlamaStreamWireEvent) => void) | null = null;
  return fixturePlugin({
    addListener: async (_eventName, listenerFunc) => {
      listener = listenerFunc;
      return { remove: async () => {} };
    },
    completeStreaming: async ({ requestId }) => {
      queueMicrotask(() => {
        for (const token of tokens) listener?.({ requestId, type: 'text_delta', delta: token });
        listener?.({ requestId, type: 'completed', promptTokens: 1, generatedTokens: tokens.length, finishReason: 'stop' });
      });
    },
    ...overrides,
  });
}

describe('streamJarvisRequest — deterministic/tool-grounded paths yield exactly one result, never a fake stream', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.doUnmock('./ai/android/localLlamaCapacitorPlugin'));

  it('a study_next intent (deterministic_tool route) yields one event with the full result and no textDelta', async () => {
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({ default: fixturePlugin(), isLocalLlamaRuntimeAvailable: false }));
    const { streamJarvisRequest } = await import('./runtime');

    const events = await drain(streamJarvisRequest({ context: CONTEXT, query: 'what should i study next' }));

    expect(events).toHaveLength(1);
    expect(events[0].textDelta).toBeUndefined();
    expect(events[0].result?.provenance).toEqual({ source: 'deterministic', degraded: false, routeTarget: 'deterministic_tool' });
  });

  it('matches runJarvisRequest\'s own result exactly for the same input (no AI available)', async () => {
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({ default: fixturePlugin(), isLocalLlamaRuntimeAvailable: false }));
    const { streamJarvisRequest, runJarvisRequest } = await import('./runtime');

    const query = 'explain the preamble';
    const [event] = await drain(streamJarvisRequest({ context: CONTEXT, query }));
    const direct = await runJarvisRequest({ context: CONTEXT, query });

    expect(event.result).toEqual(direct);
  });
});

describe('streamJarvisRequest — the real AI path forwards genuine incremental deltas', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.doUnmock('./ai/android/localLlamaCapacitorPlugin'));

  it('yields one textDelta event per real token, then exactly one final result (android_native_stub, no model loaded)', async () => {
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({
      default: streamingFixturePlugin(['Hello', ' world'], { getRuntimeStatus: async () => ({ status: 'available' }), getLoadedModel: async () => ({ model: null }) }),
      isLocalLlamaRuntimeAvailable: true,
    }));
    const { streamJarvisRequest } = await import('./runtime');

    const events = await drain(streamJarvisRequest({ context: CONTEXT, query: 'explain the preamble' }));

    const deltas = events.filter((e) => e.textDelta !== undefined).map((e) => e.textDelta);
    expect(deltas).toEqual(['Hello', ' world']);

    const final = events[events.length - 1];
    expect(final.result?.response.responseText).toBe('Hello world');
    expect(final.result?.provenance.source).toBe('android_native_stub');
    expect(final.result?.provenance.degraded).toBe(true);
  });

  // Phase 13E runtime fix — physical-device evidence showed the UI rendering a completely EMPTY
  // message instead of any fallback text whenever the Android provider's completion genuinely
  // produced no output (no text_delta events, and the provider's own final `response.text` also
  // empty). Previously `finalText` fell back only to the locally-accumulated `fullText`, which is
  // equally empty in that case, so an empty string silently overwrote the orchestrator's own
  // already-computed, non-empty `response.responseText`. This proves the fix: the final result
  // must still carry that original deterministic text, never an empty string.
  it('an empty provider completion (no deltas, no final text) falls back to the deterministic response.responseText, never an empty string', async () => {
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({
      default: streamingFixturePlugin([], { getRuntimeStatus: async () => ({ status: 'available' }), getLoadedModel: async () => ({ model: null }) }),
      isLocalLlamaRuntimeAvailable: true,
    }));
    const { streamJarvisRequest } = await import('./runtime');

    const query = 'explain the preamble';
    const expectedDeterministicText = handleJarvisRequest(CONTEXT, query).responseText;
    expect(expectedDeterministicText).toBeTruthy();

    const events = await drain(streamJarvisRequest({ context: CONTEXT, query }));
    const final = events[events.length - 1];

    expect(final.result?.response.responseText).toBe(expectedDeterministicText);
    expect(final.result?.response.responseText).not.toBe('');
    // Provenance is unaffected by this fallback — still honestly labelled as the stub/degraded
    // path that produced no real output, exactly as before this fix.
    expect(final.result?.provenance.source).toBe('android_native_stub');
    expect(final.result?.provenance.degraded).toBe(true);
  });

  it('a genuinely loaded, ready model streams as android_local_ai, never degraded', async () => {
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({
      default: streamingFixturePlugin(['Ancient', ' India'], {
        getRuntimeStatus: async () => ({ status: 'ready' }),
        getLoadedModel: async () => ({ model: { modelId: 'qwen3-1.7b', loadedAt: '2026-01-01T00:00:00Z' } }),
      }),
      isLocalLlamaRuntimeAvailable: true,
    }));
    const { streamJarvisRequest } = await import('./runtime');

    const events = await drain(streamJarvisRequest({ context: CONTEXT, query: 'explain the preamble' }));
    const final = events[events.length - 1];

    expect(final.result?.provenance).toEqual({ source: 'android_local_ai', providerId: 'android-local-llama', providerHealth: 'model_ready', routeTarget: 'local_ai', degraded: false });
    expect(final.result?.response.responseText).toBe('Ancient India');
  });

  it('cancelling mid-stream (AbortSignal) stops the stream — the fixture\'s own cancel() is reached, exactly like nativeLlamaRuntime.ts\'s existing abort wiring', async () => {
    const cancelSpy = vi.fn(async () => {});
    let listener: ((event: LocalLlamaStreamWireEvent) => void) | null = null;
    let resolveStreamingStarted!: () => void;
    const streamingStarted = new Promise<void>((resolve) => {
      resolveStreamingStarted = resolve;
    });

    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({
      default: fixturePlugin({
        getRuntimeStatus: async () => ({ status: 'available' }),
        getLoadedModel: async () => ({ model: null }),
        addListener: async (_eventName, listenerFunc) => {
          listener = listenerFunc;
          return { remove: async () => {} };
        },
        completeStreaming: async () => {
          // Signals the test that the request has genuinely started (abort listener already
          // registered by nativeLlamaRuntime.ts by this point) before never resolving/emitting on
          // its own — only cancel() ends this request, exactly like a real in-progress generation.
          resolveStreamingStarted();
        },
        cancel: cancelSpy,
      }),
      isLocalLlamaRuntimeAvailable: true,
    }));
    const { streamJarvisRequest } = await import('./runtime');

    const controller = new AbortController();
    const events: import('./runtime').JarvisStreamDelta[] = [];
    const iterationPromise = (async () => {
      for await (const event of streamJarvisRequest({ context: CONTEXT, query: 'explain the preamble' }, controller.signal)) {
        events.push(event);
      }
    })();

    // Only abort once the native call has genuinely started — aborting any earlier would hit
    // nativeLlamaRuntime.ts's own "cancelled before it started" early-return path instead of
    // exercising a REAL in-flight cancellation (that early path is already covered by Phase 10's
    // own existing tests, not what this test is for).
    await streamingStarted;
    controller.abort();
    // The abort propagates to cancel(); the fixture's own listener then reports cancellation,
    // exactly as a real native stream would via onCancelled -> the 'error'/cancelled stream event.
    queueMicrotask(() => listener?.({ requestId: 'req-1', type: 'error', code: 'cancelled', message: 'The request was cancelled.' }));
    await iterationPromise;

    expect(cancelSpy).toHaveBeenCalled();
    expect(events[events.length - 1].result?.provenance.source).toBe('no_provider_available');
  });

  it('a provider.stream() error (not cancellation) is reported honestly, never silently swallowed', async () => {
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({
      default: streamingFixturePlugin([], {
        getRuntimeStatus: async () => ({ status: 'available' }),
        getLoadedModel: async () => ({ model: null }),
        completeStreaming: async () => {
          throw new Error('native crash');
        },
      }),
      isLocalLlamaRuntimeAvailable: true,
    }));
    const { streamJarvisRequest } = await import('./runtime');

    const events = await drain(streamJarvisRequest({ context: CONTEXT, query: 'explain the preamble' }));
    expect(events[events.length - 1].result?.provenance.source).toBe('no_provider_available');
  });
});

// ================================================================================================
// Phase 13C — the automatic local-model bootstrap (ensureAndroidLocalLlamaModelReady,
// ai/android/localLlamaBootstrap.ts) is actually WIRED into both runJarvisRequest and
// streamJarvisRequest. The bootstrap boundary's own unit tests (localLlamaBootstrap.test.ts) cover
// its internal logic in isolation; these prove the real end-to-end integration point: a GGUF model
// genuinely discoverable via getModelStorageInfo, but not yet loaded, now actually gets loaded and
// the request is served by android_local_ai — closing the exact gap this phase's own brief names.
// ================================================================================================
describe('runJarvisRequest — Phase 13C: the automatic bootstrap discovers and loads an on-device model', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.doUnmock('./ai/android/localLlamaCapacitorPlugin'));

  /** A stateful fixture: starts at 'available'/no loaded model (the REAL current native stub's
   * starting state — see NativeLlamaRuntime.kt), and only transitions to 'ready' with a loaded
   * model once loadModel() is actually called — exactly the lifecycle a real llama.cpp-backed
   * plugin genuinely has, never faked ahead of time. */
  function bootstrappableFixturePlugin(loadModelSpy = vi.fn(async (_options: { modelId: string }) => {})) {
    let loaded = false;
    const plugin = fixturePlugin({
      getRuntimeStatus: async () => ({ status: loaded ? 'ready' : 'available' }),
      getLoadedModel: async () => (loaded ? { model: { modelId: 'qwen3-1.7b-q4_k_m', loadedAt: '2026-01-01T00:00:00Z' } } : { model: null }),
      getModelStorageInfo: async () => ({ modelAvailable: true, modelId: 'qwen3-1.7b-q4_k_m', modelPath: '/storage/emulated/0/Android/data/com.apfctracker.app/files/models/qwen3-1.7b-q4_k_m.gguf', modelSizeBytes: 1_280_000_000 }),
      loadModel: async (options: { modelId: string }) => {
        await loadModelSpy(options);
        loaded = true;
      },
      complete: async () => ({ text: 'Real Qwen3 answer.', promptTokens: 4, generatedTokens: 3, finishReason: 'stop' as const }),
    });
    return { plugin, loadModelSpy };
  }

  it('a model discoverable but not yet loaded is actually loaded, and the request is served as android_local_ai', async () => {
    const { plugin, loadModelSpy } = bootstrappableFixturePlugin();
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({ default: plugin, isLocalLlamaRuntimeAvailable: true }));
    const { runJarvisRequest } = await import('./runtime');

    const result = await runJarvisRequest({ context: CONTEXT, query: 'explain the preamble' });

    expect(loadModelSpy).toHaveBeenCalledTimes(1);
    // Phase 13E regression — must receive the real ABSOLUTE PATH (getModelStorageInfo's own
    // modelPath above), never the bare modelId ('qwen3-1.7b-q4_k_m'), which is exactly the bug a
    // physical Xiaomi Pad 6 logcat caught ("file not found: Qwen3-1.7B-Q4_K_M.gguf").
    expect(loadModelSpy).toHaveBeenCalledWith({ modelId: '/storage/emulated/0/Android/data/com.apfctracker.app/files/models/qwen3-1.7b-q4_k_m.gguf' });
    expect(result.provenance.source).toBe('android_local_ai');
    expect(result.provenance.providerHealth).toBe('model_ready');
    expect(result.provenance.degraded).toBe(false);
    expect(result.response.responseText).toBe('Real Qwen3 answer.');
  });

  it('a second request after the bootstrap already loaded the model does not call loadModel again', async () => {
    const { plugin, loadModelSpy } = bootstrappableFixturePlugin();
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({ default: plugin, isLocalLlamaRuntimeAvailable: true }));
    const { runJarvisRequest } = await import('./runtime');

    await runJarvisRequest({ context: CONTEXT, query: 'explain the preamble' });
    await runJarvisRequest({ context: CONTEXT, query: 'what is the fundamental rights chapter' });

    expect(loadModelSpy).toHaveBeenCalledTimes(1);
  });

  it('no on-device model at all (getModelStorageInfo reports modelAvailable:false) never attempts a load and stays on the honest stub path', async () => {
    const loadModelSpy = vi.fn(async () => {});
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({
      default: fixturePlugin({
        getRuntimeStatus: async () => ({ status: 'available' }),
        getLoadedModel: async () => ({ model: null }),
        getModelStorageInfo: async () => ({ modelAvailable: false }),
        loadModel: loadModelSpy,
        complete: async () => ({ text: 'stub answer', finishReason: 'stop' as const }),
      }),
      isLocalLlamaRuntimeAvailable: true,
    }));
    const { runJarvisRequest } = await import('./runtime');

    const result = await runJarvisRequest({ context: CONTEXT, query: 'explain the preamble' });

    expect(loadModelSpy).not.toHaveBeenCalled();
    expect(result.provenance.source).toBe('android_native_stub');
    expect(result.provenance.providerHealth).toBe('available');
  });

  it('a study_next intent (deterministic_tool route) never triggers the bootstrap at all — the EXISTING deterministic routing is untouched by this phase', async () => {
    const loadModelSpy = vi.fn(async () => {});
    const getModelStorageInfoSpy = vi.fn(async () => ({ modelAvailable: true, modelId: 'qwen3-1.7b-q4_k_m', modelPath: '/x.gguf' }));
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({
      default: fixturePlugin({ getModelStorageInfo: getModelStorageInfoSpy, loadModel: loadModelSpy }),
      isLocalLlamaRuntimeAvailable: true,
    }));
    const { runJarvisRequest } = await import('./runtime');

    const result = await runJarvisRequest({ context: CONTEXT, query: 'what should i study next' });

    expect(loadModelSpy).not.toHaveBeenCalled();
    expect(getModelStorageInfoSpy).not.toHaveBeenCalled();
    expect(result.provenance.source).toBe('deterministic');
  });
});

describe('streamJarvisRequest — Phase 13C: the SAME bootstrap boundary applies to the streaming path', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.doUnmock('./ai/android/localLlamaCapacitorPlugin'));

  it('a model discoverable but not yet loaded is actually loaded before streaming begins, and the final event is android_local_ai', async () => {
    const loadModelSpy = vi.fn(async (_options: { modelId: string }) => {});
    let loaded = false;
    const plugin = streamingFixturePlugin(['Ancient', ' India'], {
      getRuntimeStatus: async () => ({ status: loaded ? 'ready' : 'available' }),
      getLoadedModel: async () => (loaded ? { model: { modelId: 'qwen3-1.7b-q4_k_m', loadedAt: '2026-01-01T00:00:00Z' } } : { model: null }),
      getModelStorageInfo: async () => ({ modelAvailable: true, modelId: 'qwen3-1.7b-q4_k_m', modelPath: '/x.gguf', modelSizeBytes: 1_280_000_000 }),
      loadModel: async (options: { modelId: string }) => {
        await loadModelSpy(options);
        loaded = true;
      },
    });
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({ default: plugin, isLocalLlamaRuntimeAvailable: true }));
    const { streamJarvisRequest } = await import('./runtime');

    const events = await drain(streamJarvisRequest({ context: CONTEXT, query: 'explain the preamble' }));
    const final = events[events.length - 1];

    expect(loadModelSpy).toHaveBeenCalledTimes(1);
    // Phase 13E regression — same fix, streaming path: the real absolute path ('/x.gguf' here),
    // never the bare modelId.
    expect(loadModelSpy).toHaveBeenCalledWith({ modelId: '/x.gguf' });
    expect(final.result?.provenance).toEqual({ source: 'android_local_ai', providerId: 'android-local-llama', providerHealth: 'model_ready', routeTarget: 'local_ai', degraded: false });
    expect(final.result?.response.responseText).toBe('Ancient India');
  });

  it('cancellation (AbortSignal) still stops an in-flight stream even once the bootstrap has successfully loaded a model', async () => {
    const cancelSpy = vi.fn(async () => {});
    let listener: ((event: LocalLlamaStreamWireEvent) => void) | null = null;
    let resolveStreamingStarted!: () => void;
    const streamingStarted = new Promise<void>((resolve) => {
      resolveStreamingStarted = resolve;
    });

    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({
      default: fixturePlugin({
        getRuntimeStatus: async () => ({ status: 'ready' }),
        getLoadedModel: async () => ({ model: { modelId: 'qwen3-1.7b-q4_k_m', loadedAt: '2026-01-01T00:00:00Z' } }),
        addListener: async (_eventName, listenerFunc) => {
          listener = listenerFunc;
          return { remove: async () => {} };
        },
        completeStreaming: async () => {
          resolveStreamingStarted();
        },
        cancel: cancelSpy,
      }),
      isLocalLlamaRuntimeAvailable: true,
    }));
    const { streamJarvisRequest } = await import('./runtime');

    const controller = new AbortController();
    const events: import('./runtime').JarvisStreamDelta[] = [];
    const iterationPromise = (async () => {
      for await (const event of streamJarvisRequest({ context: CONTEXT, query: 'explain the preamble' }, controller.signal)) {
        events.push(event);
      }
    })();

    await streamingStarted;
    controller.abort();
    queueMicrotask(() => listener?.({ requestId: 'req-1', type: 'error', code: 'cancelled', message: 'The request was cancelled.' }));
    await iterationPromise;

    expect(cancelSpy).toHaveBeenCalled();
    expect(events[events.length - 1].result?.provenance.source).toBe('no_provider_available');
  });
});

// ================================================================================================
// Phase 13C FIX (physical-device regression) — a Xiaomi Pad 6 logcat capture showed
// getRuntimeStatus -> getLoadedModel -> complete(), with NO getModelStorageInfo and NO loadModel
// call in between: exactly the OLD, pre-Phase-13C call sequence. Root cause: capacitor.config.ts's
// own `server.url` was pointing the native WebView at a remote deployment instead of the bundled
// `dist/` — so no local code change could ever run on-device until deployed there (see this
// phase's own report for the full trace). That config is fixed; these tests exist to pin something
// the ABOVE Phase 13C tests proved was ALREADY correct in this file but is worth making
// unmistakably explicit: the bootstrap's own native calls happen, in real call order, strictly
// BEFORE provider.complete()/stream() — never merely "both eventually get called".
// ================================================================================================
describe('runJarvisRequest — Phase 13C FIX: bootstrap genuinely runs BEFORE complete(), in call order', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.doUnmock('./ai/android/localLlamaCapacitorPlugin'));

  it('(a)+(c) getModelStorageInfo and loadModel are both called, and BOTH happen before complete() — never after, never skipped', async () => {
    const callOrder: string[] = [];
    let loaded = false;
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({
      default: fixturePlugin({
        getRuntimeStatus: async () => {
          callOrder.push('getRuntimeStatus');
          return { status: loaded ? 'ready' : 'available' };
        },
        getLoadedModel: async () => {
          callOrder.push('getLoadedModel');
          return loaded ? { model: { modelId: 'qwen3-1.7b-q4_k_m', loadedAt: '2026-01-01T00:00:00Z' } } : { model: null };
        },
        getModelStorageInfo: async () => {
          callOrder.push('getModelStorageInfo');
          return { modelAvailable: true, modelId: 'qwen3-1.7b-q4_k_m', modelPath: '/x.gguf', modelSizeBytes: 1_280_000_000 };
        },
        loadModel: async (options: { modelId: string }) => {
          callOrder.push(`loadModel:${options.modelId}`);
          loaded = true;
        },
        complete: async () => {
          callOrder.push('complete');
          return { text: 'Real Qwen3 answer.', finishReason: 'stop' as const };
        },
      }),
      isLocalLlamaRuntimeAvailable: true,
    }));
    const { runJarvisRequest } = await import('./runtime');

    const result = await runJarvisRequest({ context: CONTEXT, query: 'Hello jarvis' });

    // The EXACT bug this regression guards against: getModelStorageInfo/loadModel silently
    // skipped while complete() still ran — reproducing the physical-device logcat evidence.
    // Phase 13E — loadModel must receive the real path ('/x.gguf'), never the bare modelId
    // ('qwen3-1.7b-q4_k_m') — that mismatch was itself a second, physically-confirmed bug this
    // same regression now also pins.
    expect(callOrder).toContain('getModelStorageInfo');
    expect(callOrder).toContain('loadModel:/x.gguf');
    expect(callOrder.indexOf('getModelStorageInfo')).toBeLessThan(callOrder.indexOf('complete'));
    expect(callOrder.indexOf('loadModel:/x.gguf')).toBeLessThan(callOrder.indexOf('complete'));
    expect(result.provenance.source).toBe('android_local_ai');
  });

  it('(d) a genuine loadModel failure still calls complete() through the honest stub path — never silently dropping the request, never claiming model_ready', async () => {
    const callOrder: string[] = [];
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({
      default: fixturePlugin({
        getRuntimeStatus: async () => ({ status: 'available' }),
        getLoadedModel: async () => ({ model: null }),
        getModelStorageInfo: async () => ({ modelAvailable: true, modelId: 'qwen3-1.7b-q4_k_m', modelPath: '/x.gguf' }),
        loadModel: async () => {
          callOrder.push('loadModel-attempted');
          throw new Error('native load failed: out of memory');
        },
        complete: async () => {
          callOrder.push('complete');
          return { text: 'stub answer', finishReason: 'stop' as const };
        },
      }),
      isLocalLlamaRuntimeAvailable: true,
    }));
    const { runJarvisRequest } = await import('./runtime');

    const result = await runJarvisRequest({ context: CONTEXT, query: 'Hello jarvis' });

    expect(callOrder).toEqual(['loadModel-attempted', 'complete']);
    expect(result.provenance.source).toBe('android_native_stub');
    expect(result.provenance.providerHealth).not.toBe('model_ready');
    expect(result.provenance.degraded).toBe(true);
  });

  it('(e) a deterministic (study_next) request never calls getModelStorageInfo or loadModel at all', async () => {
    const getModelStorageInfoSpy = vi.fn(async () => ({ modelAvailable: true, modelId: 'qwen3-1.7b-q4_k_m', modelPath: '/x.gguf' }));
    const loadModelSpy = vi.fn(async () => {});
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({
      default: fixturePlugin({ getModelStorageInfo: getModelStorageInfoSpy, loadModel: loadModelSpy }),
      isLocalLlamaRuntimeAvailable: true,
    }));
    const { runJarvisRequest } = await import('./runtime');

    await runJarvisRequest({ context: CONTEXT, query: 'what should i study next' });

    expect(getModelStorageInfoSpy).not.toHaveBeenCalled();
    expect(loadModelSpy).not.toHaveBeenCalled();
  });
});

describe('streamJarvisRequest — Phase 13C FIX: the bootstrap also runs BEFORE streaming begins, in call order', () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.doUnmock('./ai/android/localLlamaCapacitorPlugin'));

  it('(f) getModelStorageInfo and loadModel both happen before completeStreaming() is ever called', async () => {
    const callOrder: string[] = [];
    let loaded = false;
    let listener: ((event: LocalLlamaStreamWireEvent) => void) | null = null;
    vi.doMock('./ai/android/localLlamaCapacitorPlugin', () => ({
      default: fixturePlugin({
        getRuntimeStatus: async () => {
          callOrder.push('getRuntimeStatus');
          return { status: loaded ? 'ready' : 'available' };
        },
        getLoadedModel: async () => (loaded ? { model: { modelId: 'qwen3-1.7b-q4_k_m', loadedAt: '2026-01-01T00:00:00Z' } } : { model: null }),
        getModelStorageInfo: async () => {
          callOrder.push('getModelStorageInfo');
          return { modelAvailable: true, modelId: 'qwen3-1.7b-q4_k_m', modelPath: '/x.gguf', modelSizeBytes: 1_280_000_000 };
        },
        loadModel: async (options: { modelId: string }) => {
          callOrder.push(`loadModel:${options.modelId}`);
          loaded = true;
        },
        addListener: async (_eventName, listenerFunc) => {
          listener = listenerFunc;
          return { remove: async () => {} };
        },
        completeStreaming: async ({ requestId }) => {
          callOrder.push('completeStreaming');
          queueMicrotask(() => {
            listener?.({ requestId, type: 'text_delta', delta: 'Ancient India' });
            listener?.({ requestId, type: 'completed', promptTokens: 1, generatedTokens: 1, finishReason: 'stop' });
          });
        },
      }),
      isLocalLlamaRuntimeAvailable: true,
    }));
    const { streamJarvisRequest } = await import('./runtime');

    const events: import('./runtime').JarvisStreamDelta[] = [];
    for await (const event of streamJarvisRequest({ context: CONTEXT, query: 'Hello jarvis' })) {
      events.push(event);
    }
    const final = events[events.length - 1];

    expect(callOrder.indexOf('getModelStorageInfo')).toBeLessThan(callOrder.indexOf('completeStreaming'));
    // Phase 13E — same real-path fix, streaming path.
    expect(callOrder.indexOf('loadModel:/x.gguf')).toBeLessThan(callOrder.indexOf('completeStreaming'));
    expect(final.result?.provenance.source).toBe('android_local_ai');
  });
});
