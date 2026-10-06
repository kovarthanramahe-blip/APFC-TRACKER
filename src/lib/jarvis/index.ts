// JARVIS Intelligence Core — public API (Phase 1: foundational contracts only).
//
// JARVIS is organised into three layers. Keeping them separable is the whole point of this
// module, and every future JARVIS phase should be checked against this boundary before it's
// allowed to blur it:
//
//   1. Deterministic application intelligence
//      The authoritative source of truth. This is this codebase's own existing lib/* engines —
//      revision scheduling (lib/revisionQueue.ts), PhD analytics (lib/phdAnalytics.ts), weak-topic
//      detection (lib/weakTopicPractice.ts), the Command Centre's own aggregation
//      (lib/commandCentre.ts), and so on. JARVIS does not reimplement any of this; it only reads
//      it, through layer 2.
//
//   2. Tools (JarvisTool, see types.ts)
//      Controlled, typed interfaces onto layer 1's application state, and — in future phases —
//      onto web search, device/app diagnostics, and user-authorised actions. A tool is how any
//      capability outside this module's own pure logic gets reached; nothing is called directly.
//      No real tool exists yet — toolRegistry.ts holds the (currently empty) registry a future
//      phase will populate.
//
//   3. AI reasoning
//      Interpretation of natural language, conversation, synthesis, and planning. Not implemented
//      anywhere in this codebase yet. When it exists, it may only READ what layers 1-2 already
//      produced (a JarvisSignal, a JarvisToolResult) and narrate/reason over it — it is never the
//      authoritative source for application state, and it never computes a fact layer 1 should
//      have computed instead.
//
// This phase (Phase 1) implements only the contracts (types.ts), a minimal tool registry
// (toolRegistry.ts) holding no real tools, and a conservative, non-AI orchestrator
// (orchestrator.ts) that resolves a simple intent and returns a structured response. Nothing here
// calls an AI provider, makes a network request, or mutates application state.

export type {
  JarvisWorkspace,
  JarvisIntent,
  JarvisContext,
  JarvisSignal,
  JarvisToolAccess,
  JarvisTool,
  JarvisToolResult,
  JarvisActionRisk,
  JarvisAction,
  JarvisResponse,
} from './types';
export { JARVIS_KNOWN_INTENTS } from './types';

export type { JarvisToolRegistry, JarvisToolRegistrationResult, JarvisToolFilter } from './toolRegistry';
export { createToolRegistry } from './toolRegistry';

export { handleJarvisRequest, resolveIntent } from './orchestrator';

// Phase 2 — the first real (read-only) application tools. See applicationTools.ts's own header
// for the data-integrity rule every one of them follows: each is a VIEW onto an already-existing
// engine, never a parallel calculation.
export {
  createApplicationTools,
  toJarvisWorkspace,
  apfcStudyStateTool,
  upscStudyStateTool,
  upscCurrentAffairsRevisionTool,
  phdResearchStateTool,
  globalWorkspaceStateTool,
} from './applicationTools';
export type {
  ApfcStudyStateInput,
  ApfcStudyStateData,
  UpscStudyStateInput,
  UpscStudyStateItem,
  UpscStudyStateData,
  UpscCurrentAffairsRevisionInput,
  UpscCurrentAffairsDueItem,
  UpscCurrentAffairsRevisionData,
  PhdResearchStateInput,
  PhdResearchStateData,
  GlobalWorkspaceStateInput,
  GlobalWorkspaceStateData,
} from './applicationTools';

// Phase 3 — the Context Engine: deterministic assembly of a compact, bounded context snapshot
// from the Phase 2 application tools. See contextEngine.ts's own header for the dependency
// direction it must never invert (application engines -> tools -> context engine -> future AI).
export { buildJarvisContext, JARVIS_KNOWN_CONTEXT_MODES } from './contextEngine';
export type {
  JarvisContextMode,
  JarvisContextSourceStatus,
  JarvisContextSource,
  JarvisWorkspaceSection,
  JarvisApfcStudySection,
  JarvisUpscStudySection,
  JarvisUpscCurrentAffairsSection,
  JarvisPhdResearchSection,
  JarvisContextSections,
  JarvisContextSnapshot,
  JarvisContextToolInputs,
  BuildJarvisContextInput,
} from './contextEngine';

// Phase 4 — provider-independent AI contracts, a provider interface, a provider registry, and a
// CLIENT-SIDE-ONLY secure gateway contract. See ai/gateway.ts's own header: no server/edge
// endpoint exists anywhere in this repository yet, so nothing exported here can make a real AI
// call succeed today — these are the stable shapes a future provider adapter and a future
// server/edge endpoint both build against. No provider SDK, no credential, no network call by
// default: createProviderRegistry() starts empty, and createFetchGatewayClient() only ever talks
// to whatever endpointUrl its caller explicitly supplies.
export type {
  JarvisAiRole,
  JarvisAiJsonSchema,
  JarvisAiToolDefinition,
  JarvisAiToolCall,
  JarvisAiToolCallResult,
  JarvisAiMessageContentPart,
  JarvisAiMessage,
  JarvisAiModelConfig,
  JarvisAiRequest,
  JarvisAiFinishReason,
  JarvisAiUsage,
  JarvisAiResponse,
  JarvisAiStreamEvent,
  JarvisAiErrorCode,
  JarvisAiError,
} from './ai/types';
export { textMessage } from './ai/types';

export type { JarvisAiProviderCapabilities, JarvisAiProvider } from './ai/provider';
export { JarvisAiProviderError } from './ai/provider';

export type { JarvisAiProviderRegistry, JarvisAiProviderRegistrationResult } from './ai/providerRegistry';
export { createProviderRegistry } from './ai/providerRegistry';

export type { JarvisAiGatewayRequest, JarvisAiGatewayResponse, JarvisAiGatewayClient } from './ai/gateway';
export { createFetchGatewayClient } from './ai/gateway';

// Phase 6 — zero-cost provider classification + local AI adapter contract. See
// ai/providerMetadata.ts and ai/localProvider.ts's own headers: no runtime is downloaded,
// installed, or required by this phase; every health state defaults to "not available" until a
// real probe says otherwise.
export type { JarvisAiProviderClass, JarvisAiProviderCostClass, JarvisAiProviderHealthStatus, JarvisAiProviderMetadata } from './ai/providerMetadata';
export { isDefaultEligible, isReadyForInference } from './ai/providerMetadata';

export type { JarvisLocalProviderConfig, JarvisLocalHealthProbeResult } from './ai/localProvider';
export { classifyLocalProviderHealth, buildLocalProviderMetadata, UNPROBED_LOCAL_HEALTH } from './ai/localProvider';

// Phase 6 — Document Intelligence foundation (contracts + pure planners only — see
// documents/index.ts and documents/types.ts's own headers for the full long-term pipeline and
// what this phase deliberately does not implement yet).
export * from './documents';

// Phase 6 — deterministic routing policy. See routingPolicy.ts's own header: builds on top of
// Phase 1's orchestrator.ts without modifying it.
export type { JarvisRouteTarget, JarvisRouteDecision, ResolveJarvisRouteInput, DegradedRouteDecision } from './routingPolicy';
export { resolveJarvisRoute, isRouteTableFreeByDefault, resolveEffectiveRoute } from './routingPolicy';

// Phase 8 — local AI runtime readiness + Ollama provider adapter (see ai/localRuntime.ts's own
// header: optional, zero-cost, never installs/downloads anything, never wired into the UI yet).
export type {
  OllamaChatMessage,
  OllamaRequestOptions,
  OllamaChatRequest,
  OllamaChatResponseChunk,
  OllamaModelDetails,
  OllamaTagsModel,
  OllamaTagsResponse,
  OllamaShowResponse,
  OllamaClientErrorKind,
  JarvisOllamaHttpClient,
  OllamaRuntimeConfig,
} from './ai/localRuntime';
export { OLLAMA_DEFAULT_BASE_URL, OllamaClientError, createFetchOllamaHttpClient } from './ai/localRuntime';

export type { JarvisLocalModelInfo } from './ai/modelDiscovery';
export { mapOllamaTagsModelToInfo, extractContextLengthTokens, enrichModelInfoWithShowResponse } from './ai/modelDiscovery';

export type { JarvisLocalRuntimeHealthState, JarvisLocalRuntimeHealth, ProbeLocalRuntimeHealthInput } from './ai/localRuntimeHealth';
export { probeLocalRuntimeHealth, toProviderHealthStatus } from './ai/localRuntimeHealth';

export type { OllamaProviderConfig } from './ai/ollamaProvider';
export { createOllamaProvider } from './ai/ollamaProvider';

export type { BuildDocumentGroundedMessagesInput } from './ai/documentGroundingPrompt';
export { buildDocumentGroundedMessages } from './ai/documentGroundingPrompt';

// Phase 8.5 — cross-device local AI capability & routing (see ai/crossDeviceRouting.ts's own
// header: extends Phase 6's routingPolicy.ts without modifying it; represents Android as a target
// label only — no Android inference runtime is installed or called).
export type { JarvisDevicePlatform, JarvisDeviceClass, JarvisModelResourceClass, JarvisDeviceCapabilities } from './ai/deviceCapabilities';
export { createUnknownDeviceCapabilities, isKnownDevice } from './ai/deviceCapabilities';

export type { JarvisModelRuntime, JarvisModelLocality, JarvisModelMinimumDevice, JarvisModelProfile, JarvisDeviceModelFit } from './ai/modelProfile';
export { evaluateDeviceModelFit } from './ai/modelProfile';

export type { JarvisDocumentTaskKind, JarvisReasoningLevel, JarvisDocumentTaskRequirement } from './ai/documentTaskRequirements';
export { DOCUMENT_TASK_POLICY, getDocumentTaskRequirement } from './ai/documentTaskRequirements';

export type { JarvisCrossDeviceTarget, JarvisCrossDeviceCandidate, SelectCrossDeviceTargetInput, JarvisCrossDeviceDecision } from './ai/crossDeviceRouting';
export { selectCrossDeviceTarget } from './ai/crossDeviceRouting';

// Phase 10 — Android local AI runtime proof-of-integration (see ai/android/nativeLlamaRuntime.ts's
// own header: the native side is a deterministic bridge-validation stub, never real inference —
// see this phase's own final report for the exact, honest boundary of what was proven).
export type {
  JarvisAndroidRuntimeStatus,
  JarvisAndroidLoadedModel,
  NativeLlamaCompletionRequest,
  NativeLlamaFinishReason,
  NativeLlamaCompletionResult,
  NativeLlamaRuntimeErrorKind,
  NativeLlamaRuntimeClient,
} from './ai/android/nativeLlamaRuntimeContract';
export { NativeLlamaRuntimeError, toAndroidProviderHealthStatus } from './ai/android/nativeLlamaRuntimeContract';

export type { LocalLlamaCompleteOptions, LocalLlamaCompleteResult, LocalLlamaStreamOptions, LocalLlamaStreamWireEvent, LocalLlamaRuntimePlugin } from './ai/android/localLlamaCapacitorPlugin';
export { isLocalLlamaRuntimeAvailable } from './ai/android/localLlamaCapacitorPlugin';

export { createNativeLlamaRuntime } from './ai/android/nativeLlamaRuntime';

export type { AndroidLocalLlamaProviderConfig } from './ai/android/androidLocalLlamaProvider';
export { createAndroidLocalLlamaProvider, getAndroidLocalLlamaHealth } from './ai/android/androidLocalLlamaProvider';

export type { JarvisLocalLlamaTelemetryEvent, BuildTelemetryEventInput } from './ai/android/localLlamaTelemetry';
export { buildTelemetryEvent } from './ai/android/localLlamaTelemetry';

// Phase 13A — Local LLM lifecycle state + the llama.cpp/GGUF-style model-backend boundary (see
// ai/android/localLlmLifecycle.ts and ai/android/localLlmModelBackend.ts's own headers: additive
// only, deliberately not wired into runtime.ts's own routing/provenance in this phase).
export type { JarvisLocalLlmLifecycleState, JarvisLocalLlmLifecycleTracker } from './ai/android/localLlmLifecycle';
export { createLocalLlmLifecycleTracker } from './ai/android/localLlmLifecycle';

export type { LocalLlmModelFormat, LocalLlmModelDescriptor, LocalLlmBackendAvailability, LocalLlmModelBackend } from './ai/android/localLlmModelBackend';
export { noModelBackendConfigured } from './ai/android/localLlmModelBackend';

// Phase 11 — application runtime composition layer (see runtime.ts's own header: pure
// composition of Phases 1-10, never a rewrite of handleJarvisRequest() or a second orchestrator).
export type { JarvisRuntimeProvenanceSource, JarvisRuntimeProvenance, JarvisRuntimeResult, RunJarvisRequestInput } from './runtime';
export { runJarvisRequest } from './runtime';
