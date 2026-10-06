// JARVIS Intelligence Core — Phase 1 contracts only.
//
// JARVIS has three layers, and this module exists to keep them separable:
//
//   1. Deterministic application intelligence — the authoritative app state, calculations,
//      diagnostics, and revision/study state already computed by this codebase's own lib/*
//      engines (lib/revisionQueue.ts, lib/phdDashboard.ts, lib/commandCentre.ts, etc).
//   2. Tools — controlled, typed interfaces onto that application intelligence, plus future
//      web/device capabilities (JarvisTool below).
//   3. AI reasoning — interpretation, natural-language conversation, synthesis, and planning.
//      Not implemented anywhere in this phase.
//
// The AI layer is never the authoritative source for application state: it may only read what
// layer 1 already computed through a layer-2 tool, never invent or recompute it. This file defines
// the shapes that keep that boundary explicit; it contains no behaviour and no AI/network calls.

/**
 * JARVIS's own workspace identifier — deliberately NOT the same type as lib/workspace.ts's
 * `WorkspaceKind` ('apfc' | 'upsc_cse' | 'phd_research'). JARVIS additionally needs a `'global'`
 * value for cross-workspace concerns (e.g. the Command Centre's own aggregation — see
 * lib/commandCentre.ts), which `WorkspaceKind` has no equivalent for. Reconciling the two types is
 * a future-phase concern; this phase only defines JARVIS's own shape.
 */
export type JarvisWorkspace = 'apfc' | 'upsc' | 'phd' | 'global';

/**
 * A string-based intent identifier — deliberately not a closed enum, so a future tool/capability
 * can introduce its own intent without this file changing. `JARVIS_KNOWN_INTENTS` below documents
 * the intents this phase's conservative orchestrator (see orchestrator.ts) actually recognises;
 * it is a non-exhaustive reference list, not a type constraint.
 */
export type JarvisIntent = string;

/** Non-exhaustive — the intents orchestrator.ts's conservative matcher currently recognises. */
export const JARVIS_KNOWN_INTENTS = ['question', 'study_next', 'research', 'diagnose', 'action', 'unknown'] as const;

/**
 * The input JARVIS reasons over for a single request. Deliberately NOT the application's Zustand
 * store (lib/store.ts) — that is layer 1's own authoritative state, reached only through a
 * JarvisTool's `run`, never duplicated or snapshotted wholesale into context. `appContext` is an
 * explicit, caller-chosen, opaque slice of relevant state for the current request — never the
 * whole store, and never anything sensitive unless a future feature explicitly requires it.
 */
export interface JarvisContext {
  /** The workspace this request is being made in/about. */
  workspace: JarvisWorkspace;
  /** The app route the request originated from, if any (e.g. '/pyq-test'). */
  route?: string;
  /** The raw text of the user's request, when one exists. Orchestrator callers may also pass the
   * query as its own argument (see orchestrator.ts) — this field lets a JarvisContext be recorded/
   * replayed on its own without losing what was asked. */
  query?: string;
  /** ISO 8601 date-time — caller-supplied, matching this codebase's existing "no Date.now() in a
   * pure function" convention (e.g. lib/revisionQueue.ts, lib/phdResearch.ts). Never computed
   * internally by anything in lib/jarvis. */
  timestamp: string;
  /** An explicit, caller-chosen slice of additional context relevant to this request — never a
   * dump of the whole store, and never sensitive information unless a specific future feature
   * states it needs it. Opaque to this phase: nothing here reads or interprets it yet. */
  appContext?: Readonly<Record<string, unknown>>;
}

/**
 * A deterministic piece of information the application itself produced — e.g. "3 PYQs are due for
 * revision" or "this micro-target is overdue." A signal is always a FACT already computed by
 * layer 1 (see this file's header); JARVIS's AI layer may only read and narrate signals, never
 * fabricate them. Generic over `data` so a future tool can attach whatever structured payload its
 * own signal needs, while every signal still carries a human-readable `summary` on its own.
 */
export interface JarvisSignal<TData = unknown> {
  /** Stable identifier for the KIND of signal, e.g. 'study_due', 'weak_topic', 'overdue_research',
   * 'reading_status', 'app_health', 'current_affairs', 'device_health'. Non-exhaustive — any
   * future tool may introduce its own id. */
  id: string;
  workspace: JarvisWorkspace;
  /** Human-readable summary of this signal on its own, independent of any AI narration. */
  summary: string;
  /** Structured payload backing `summary`, when the signal carries one. */
  data?: TData;
}

export type JarvisToolAccess = 'read' | 'write';

/**
 * A standard result envelope for anything a JarvisTool or the orchestrator produces — mirrors this
 * codebase's existing `status: 'ok' | 'error'` result convention (see lib/importPipeline.ts's
 * `ImportOutcome`) rather than introducing a new pattern. Discriminated on `status` so a caller
 * never needs to guess which fields are present.
 */
export type JarvisToolResult<TData = unknown> =
  | {
      status: 'ok';
      /** Human-readable summary of what this result means, independent of `data`'s own shape. */
      summary: string;
      data: TData;
      metadata?: Readonly<Record<string, unknown>>;
    }
  | {
      status: 'error';
      summary: string;
      /** Human-readable reason this failed — never a raw thrown error/stack trace. */
      error: string;
      metadata?: Readonly<Record<string, unknown>>;
    };

/**
 * A controlled, typed interface onto one unit of application/web/device capability (layer 2 — see
 * this file's header). No real tool is implemented in this phase; this is the shape a future tool
 * must satisfy to be registered (see toolRegistry.ts).
 */
export interface JarvisTool<TInput = unknown, TOutput = unknown> {
  /** Stable identifier, used as the registry key — must be unique across all registered tools. */
  id: string;
  name: string;
  description: string;
  /** Which JarvisWorkspace values this tool is meaningful for. A tool scoped to a single exam
   * workspace lists only that one; a cross-workspace tool (like a future Command Centre tool)
   * would list `'global'` alongside or instead of the exam-specific ones. */
  workspaces: readonly JarvisWorkspace[];
  /** Whether running this tool can only read application state, or may also write/mutate it.
   * Nothing in this phase executes a 'write' tool automatically — see JarvisAction below. */
  access: JarvisToolAccess;
  /** The tool's own async execution function. Never called by anything in this phase — orchestrator.ts
   * does not invoke any tool yet; this is purely the contract future phases will call through.
   *
   * Deliberately METHOD-SHORTHAND syntax (`run(...): ...`) rather than an arrow-typed property
   * (`run: (...) => ...`) — TypeScript checks a method signature's parameters bivariantly, which
   * is what lets a heterogeneous registry hold `JarvisTool<SpecificInput, SpecificOutput>` values
   * typed as the generic-erased `JarvisTool` (defaults: `JarvisTool<unknown, unknown>`) — e.g.
   * toolRegistry.ts's `list()`/`get()` return type, and applicationTools.ts's own
   * `createApplicationTools(): JarvisTool[]`. An arrow-typed property is checked contravariantly
   * instead and genuinely does not compile for this exact pattern (verified: switching this back
   * to a property type reproduces real `tsc -b` errors at both of those call sites). This changes
   * no runtime behaviour — assigning an arrow function to a method-shorthand member works
   * identically at the call site. */
  run(input: TInput, context: JarvisContext): Promise<JarvisToolResult<TOutput>>;
}

export type JarvisActionRisk = 'low' | 'medium' | 'high';

/**
 * An action JARVIS may eventually ASK to perform through a registered JarvisTool — never executed
 * automatically. Representing an action is just data; nothing in lib/jarvis in this phase runs
 * one. A future confirmation/execution layer is what would actually call `toolId`'s `run`.
 */
export interface JarvisAction<TPayload = unknown> {
  id: string;
  description: string;
  risk: JarvisActionRisk;
  /** Whether a human must explicitly confirm this action before it may ever run. A future
   * execution layer must treat this as mandatory for any risk above 'low'; this phase does not
   * enforce it itself, since nothing executes actions yet. */
  requiresConfirmation: boolean;
  /** The JarvisTool.id this action would run through. */
  toolId: string;
  payload: TPayload;
}

/**
 * The orchestrator's structured reply to a single request (see orchestrator.ts). Deliberately
 * distinguishes what was understood (`intent`), what JARVIS is saying (`responseText`), what the
 * application itself already knows (`signals`), what any tool run produced (`toolResults` — always
 * empty in this phase, since no tool is ever invoked), and whether a future AI/tool phase would
 * need to do more with this request (`requiresFurtherProcessing`).
 */
export interface JarvisResponse {
  intent: JarvisIntent;
  responseText: string;
  signals: readonly JarvisSignal[];
  toolResults: readonly JarvisToolResult[];
  /** True whenever this phase's conservative, non-AI orchestrator could not itself fully resolve
   * the request — which, since it never calls a tool or an AI provider, is every request. Kept as
   * an explicit field (rather than always omitted) so a future phase has a real contract to start
   * setting this `false` against, instead of introducing the field later as a breaking change. */
  requiresFurtherProcessing: boolean;
}
