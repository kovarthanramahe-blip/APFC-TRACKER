// JARVIS Phase 3 — Context Engine.
//
// Sits between layer 2 (JarvisTool, applicationTools.ts) and a future layer 3 (AI reasoning — see
// index.ts's architecture doc):
//
//   Application state -> Application Intelligence Tools -> Context Engine -> AI / Web / Voice
//
// This is NOT an AI system. buildJarvisContext below is a deterministic, synchronous-in-spirit
// assembly step (async only because JarvisTool.run's own Phase 1 contract is async — nothing here
// performs real I/O; every Phase 2 tool resolves immediately). It decides WHICH already-registered
// JarvisTools are relevant for a given workspace + purpose, runs only those, and compresses each
// one's result into a small, bounded DTO section — never the tool's full output, never a second
// calculation of anything a tool already computed.
//
// Dependency direction this file must never invert:
//
//   existing application engines -> Application Tools -> Context Engine -> future AI
//
// So this file deliberately imports ONLY from './types', './toolRegistry', and TYPE-ONLY from
// './applicationTools' (to describe each tool's own declared input/output shape) — never from any
// APFC/UPSC/PhD internal engine (lib/pyqFilters.ts, lib/revisionQueue.ts, lib/topicStatus.ts,
// lib/weakTopicPractice.ts, lib/pyqPerformance.ts, lib/upscCseTodaysStudy.ts, lib/phdDashboard.ts,
// lib/phdAnalytics.ts, lib/phdResearch.ts, lib/phdReadingStatus.ts) or any src/data/* constant.
// contextEngine.test.ts enforces this with a static source check, not just a convention.
import type { JarvisContext, JarvisWorkspace } from './types';
import type { JarvisToolRegistry } from './toolRegistry';
import type {
  ApfcStudyStateInput,
  ApfcStudyStateData,
  UpscStudyStateInput,
  UpscStudyStateData,
  UpscCurrentAffairsRevisionInput,
  UpscCurrentAffairsRevisionData,
  PhdResearchStateInput,
  PhdResearchStateData,
  GlobalWorkspaceStateInput,
  GlobalWorkspaceStateData,
} from './applicationTools';

/** A string-based, extensible purpose — deliberately not a closed enum, matching Phase 1's
 * JarvisIntent convention (see types.ts). `JARVIS_KNOWN_CONTEXT_MODES` is a non-exhaustive
 * reference list, not a type constraint: an unrecognised mode falls back to the same minimal
 * selection as 'general' (see resolveRelevantToolIds) rather than throwing or guessing. */
export type JarvisContextMode = string;

export const JARVIS_KNOWN_CONTEXT_MODES = ['study', 'research', 'general'] as const;

export type JarvisContextSourceStatus = 'ok' | 'error' | 'unavailable';

/** One entry per tool this call actually considered relevant — whether or not it could run. Lets
 * a caller see exactly what the snapshot is, and is not, grounded in. `sourceTool` is the Phase 2
 * tool id (internal provenance for a future AI layer to cite its evidence by) — never a web/
 * external citation. */
export interface JarvisContextSource {
  sourceTool: string;
  status: JarvisContextSourceStatus;
  /** Present for 'error' (the tool's own already-safe JarvisToolResult.error message, never a raw
   * exception/stack) or 'unavailable' (a short, fixed reason — tool not registered, or no input
   * supplied for it). Absent for 'ok'. */
  detail?: string;
}

export interface JarvisWorkspaceSection {
  sourceTool: 'global.workspace_state';
  workspace: JarvisWorkspace;
  label: string;
}

export interface JarvisApfcStudySection {
  sourceTool: 'apfc.study_state';
  dueRevisionCount: number;
  weakTopicCount: number;
  lowestWeakTopicAccuracyPct: number | null;
}

export interface JarvisUpscStudySection {
  sourceTool: 'upsc.study_state';
  /** A COUNT, not the item list itself — the underlying tool's own list stays bounded there
   * (generateTodaysStudyItems' own defaults); this section compresses it further for a future AI
   * prompt, matching this phase's own worked example ("TODAY'S STUDY: 2 items"). */
  todaysStudyItemCount: number;
  currentAffairsDueCount: number;
}

export interface JarvisUpscCurrentAffairsSection {
  sourceTool: 'upsc.current_affairs_revision';
  dueCount: number;
}

export interface JarvisPhdResearchSection {
  sourceTool: 'phd.research_state';
  overdueMicroTargetCount: number;
  mostOverdueDays: number | null;
  researchDocumentsToContinueCount: number;
  bibliographyToContinueCount: number;
}

/** Only the sections relevant to the request's (workspace, mode) are ever populated — see
 * resolveRelevantToolIds. An absent section was never fetched at all, which is different from one
 * whose tool failed (see `sources` on JarvisContextSnapshot for that distinction). */
export interface JarvisContextSections {
  workspace?: JarvisWorkspaceSection;
  apfcStudy?: JarvisApfcStudySection;
  upscStudy?: JarvisUpscStudySection;
  upscCurrentAffairs?: JarvisUpscCurrentAffairsSection;
  phdResearch?: JarvisPhdResearchSection;
}

export interface JarvisContextSnapshot {
  /** ISO 8601 — passed through from the caller's own timestamp, never computed internally. */
  generatedAt: string;
  workspace: JarvisWorkspace;
  mode: JarvisContextMode;
  route?: string;
  sections: JarvisContextSections;
  /** One entry per tool considered relevant for this request, success or not. */
  sources: readonly JarvisContextSource[];
  /** True whenever any source is not 'ok' — the snapshot may be missing information. */
  incomplete: boolean;
}

/** The typed input each Phase 2 tool declares — keyed by that tool's own id. A caller only
 * supplies the entries relevant to the (workspace, mode) it's requesting; an entry this request
 * doesn't need is simply never read. Reusing each tool's own *Input type (rather than a new,
 * parallel shape) means this file never needs to know HOW to build one — only Phase 2's own tools,
 * and whatever already reads the live application state to call them, do. */
export interface JarvisContextToolInputs {
  'apfc.study_state'?: ApfcStudyStateInput;
  'upsc.study_state'?: UpscStudyStateInput;
  'upsc.current_affairs_revision'?: UpscCurrentAffairsRevisionInput;
  'phd.research_state'?: PhdResearchStateInput;
  'global.workspace_state'?: GlobalWorkspaceStateInput;
}

export interface BuildJarvisContextInput {
  workspace: JarvisWorkspace;
  mode: JarvisContextMode;
  route?: string;
  /** ISO 8601 — supplied by the caller, matching every engine this phase ultimately reads from. */
  timestamp: string;
  /** The Phase 1 registry holding (at minimum) the Phase 2 application tools this engine might
   * call — never created internally, per this phase's own "no secret registry" requirement. */
  registry: JarvisToolRegistry;
  toolInputs: JarvisContextToolInputs;
}

const ALWAYS_RELEVANT: readonly string[] = ['global.workspace_state'];

/**
 * Which tool ids are relevant for a given (workspace, mode) — the ONLY place that decision is
 * made. Deterministic: same (workspace, mode) always returns the same ids, in the same order.
 * An unrecognised mode (anything other than 'study'/'research') is treated exactly like 'general'
 * — the conservative, minimum-information default — rather than guessing what it might mean.
 */
function resolveRelevantToolIds(workspace: JarvisWorkspace, mode: JarvisContextMode): readonly string[] {
  if (mode === 'study') {
    switch (workspace) {
      case 'apfc':
        return [...ALWAYS_RELEVANT, 'apfc.study_state'];
      case 'upsc':
        return [...ALWAYS_RELEVANT, 'upsc.study_state', 'upsc.current_affairs_revision'];
      case 'phd':
        return [...ALWAYS_RELEVANT, 'phd.research_state'];
      case 'global':
        return ALWAYS_RELEVANT;
    }
  }
  if (mode === 'research' && workspace === 'phd') {
    return [...ALWAYS_RELEVANT, 'phd.research_state'];
  }
  // 'research' for any non-PhD workspace, 'general' for any workspace, and any unrecognised mode
  // all fall back to the same minimum: just which workspace is active.
  return ALWAYS_RELEVANT;
}

/** Applies one tool's successful result onto `sections`, mutating only the one field that tool
 * owns. The `as` casts below are safe DESPITE the registry erasing each tool's own generic type
 * (JarvisToolRegistry.get returns JarvisTool<unknown, unknown> — see toolRegistry.ts): this
 * function is keyed by the exact same fixed tool-id string literals applicationTools.ts declares
 * each tool against, so a given `toolId` here always corresponds to the one Phase 2 DTO shape
 * named in its own case. */
function applySuccessfulResult(sections: JarvisContextSections, toolId: string, data: unknown): void {
  switch (toolId) {
    case 'global.workspace_state': {
      const d = data as GlobalWorkspaceStateData;
      sections.workspace = { sourceTool: 'global.workspace_state', workspace: d.workspace, label: d.label };
      return;
    }
    case 'apfc.study_state': {
      const d = data as ApfcStudyStateData;
      sections.apfcStudy = {
        sourceTool: 'apfc.study_state',
        dueRevisionCount: d.dueRevisionCount,
        weakTopicCount: d.weakTopicCount,
        lowestWeakTopicAccuracyPct: d.lowestWeakTopicAccuracyPct,
      };
      return;
    }
    case 'upsc.study_state': {
      const d = data as UpscStudyStateData;
      sections.upscStudy = {
        sourceTool: 'upsc.study_state',
        todaysStudyItemCount: d.items.length,
        currentAffairsDueCount: d.currentAffairsDueCount,
      };
      return;
    }
    case 'upsc.current_affairs_revision': {
      const d = data as UpscCurrentAffairsRevisionData;
      sections.upscCurrentAffairs = { sourceTool: 'upsc.current_affairs_revision', dueCount: d.dueItems.length };
      return;
    }
    case 'phd.research_state': {
      const d = data as PhdResearchStateData;
      sections.phdResearch = {
        sourceTool: 'phd.research_state',
        overdueMicroTargetCount: d.overdueMicroTargetCount,
        mostOverdueDays: d.mostOverdueDays,
        researchDocumentsToContinueCount: d.researchDocumentsToContinueCount,
        bibliographyToContinueCount: d.bibliographyToContinueCount,
      };
      return;
    }
  }
}

function getToolInput(toolInputs: JarvisContextToolInputs, toolId: string): unknown {
  return (toolInputs as Record<string, unknown>)[toolId];
}

/**
 * Assembles a compact, bounded JarvisContextSnapshot for `input.workspace`/`input.mode`, running
 * only the JarvisTools resolveRelevantToolIds decides are relevant — never every registered tool,
 * and never a tool this call has no input for. Every tool is looked up and invoked through
 * `input.registry`; this function never imports or calls an application engine directly (see this
 * file's own header).
 *
 * One failing or unavailable source never discards the rest of the snapshot: each relevant tool
 * is run independently, its outcome recorded in `sources`, and only a successful result ever
 * populates its own section of `sections`. Never mutates `input` or anything reachable from it.
 */
export async function buildJarvisContext(input: BuildJarvisContextInput): Promise<JarvisContextSnapshot> {
  const relevantToolIds = resolveRelevantToolIds(input.workspace, input.mode);
  const toolContext: JarvisContext = { workspace: input.workspace, route: input.route, timestamp: input.timestamp };

  const sections: JarvisContextSections = {};
  const sources: JarvisContextSource[] = [];

  for (const toolId of relevantToolIds) {
    const tool = input.registry.get(toolId);
    if (!tool) {
      sources.push({ sourceTool: toolId, status: 'unavailable', detail: 'This source is not registered.' });
      continue;
    }

    const toolInput = getToolInput(input.toolInputs, toolId);
    if (toolInput === undefined) {
      sources.push({ sourceTool: toolId, status: 'unavailable', detail: 'No input was supplied for this source.' });
      continue;
    }

    try {
      const result = await tool.run(toolInput, toolContext);
      if (result.status === 'ok') {
        applySuccessfulResult(sections, toolId, result.data);
        sources.push({ sourceTool: toolId, status: 'ok' });
      } else {
        sources.push({ sourceTool: toolId, status: 'error', detail: result.error });
      }
    } catch (err) {
      sources.push({ sourceTool: toolId, status: 'error', detail: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  return {
    generatedAt: input.timestamp,
    workspace: input.workspace,
    mode: input.mode,
    route: input.route,
    sections,
    sources,
    incomplete: sources.some((s) => s.status !== 'ok'),
  };
}
