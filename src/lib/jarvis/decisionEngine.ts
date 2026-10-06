// JARVIS Phase 12 — Decision & Recommendation Engine.
//
// Pure, deterministic intelligence layered ONLY on top of what Phase 2 (applicationTools.ts) and
// Phase 3 (contextEngine.ts) already compute, and what Phase 11.4 (runtime.ts) already grounds.
// This file introduces NO new application calculation, NO new tool, NO new registry, and NO
// AI/network/model call of any kind — it only turns already-grounded data into a small, explainable
// structured recommendation a FUTURE local LLM could narrate. It never narrates with an LLM itself,
// never accesses UI state or browser globals, and never performs a network call. Same input always
// produces the same JarvisDecisionResult.
//
// ================================================================================================
// Trace notes (Phase 12's own "trace, don't rewrite" step) — what the EXISTING data actually
// supports, which is the ONLY thing this file is allowed to use:
// ================================================================================================
//
// - upsc.study_state (applicationTools.ts) is the ONLY application tool whose data is item-level:
//   its `items: UpscStudyStateItem[]` come straight from lib/upscCseTodaysStudy.ts's
//   generateTodaysStudyItems, which ALREADY returns its items in a fixed, documented priority
//   order: syllabus topics not-started/learning -> questions due for revision today -> Current
//   Affairs due for revision today -> incorrect questions -> unattempted questions -> weak areas.
//   That function's own doc comment states this explicitly ("the rest in a fixed priority order"),
//   and lib/commandCentre.ts's own CommandCentreItem.priority field documents this codebase's
//   established convention: "priority" IS an item's own position in an already-prioritised list,
//   never a separately invented score. This file follows that same convention: candidates are
//   taken in the EXACT order the existing engine already returned them, and the first one is the
//   selection — never re-sorted by a new weighting scheme.
// - apfc.study_state and phd.research_state return workspace-level COUNTS ONLY (dueRevisionCount/
//   weakTopicCount; overdueMicroTargetCount/mostOverdueDays/...) — applicationTools.ts's own header
//   explains why: "APFC has no existing engine that selects a short, actionable 'today' list" at
//   item granularity, and the same is true of PhD's tool. This file NEVER fabricates a named item
//   for those workspaces; it reports exactly the counts those tools computed, honestly labelled as
//   count-only (no `candidates`, no `selectedCandidate`).
//
// Priority signals ACTUALLY used (because the existing data actually supports them):
//   1. Existing ordering/ranking — a UPSC item's own index in the array generateTodaysStudyItems
//      already returned. The first candidate IS the recommendation, by the existing engine's own
//      design, never re-ranked here.
//   2. Due today / incomplete-not-started state — carried IMPLICITLY by which `kind` a UPSC item
//      has: 'revision'/'current_affairs_revision' only exist when something is genuinely due by
//      `today` (see generateTodaysStudyItems); 'syllabus' only exists for a not_started/learning
//      coverage state. This file translates that existing `kind` into a human-readable reason
//      (describeCandidateReason below) — it never computes a NEW due/incomplete signal itself.
//   3. Workspace relevance — only the active workspace's own grounded section is ever considered,
//      matching Phase 11.4's existing workspace-scoped grounding; this file never looks across
//      workspaces.
//
// Priority signals DELIBERATELY NOT used, and why:
//   - "Overdue" as distinct from "due today" — no UPSC item exposes that distinction (getDueItems
//     only reports due-by-today, no separate overdue flag). PhD's own `mostOverdueDays` IS a real,
//     existing overdue signal, but only as a workspace-level COUNT, with no specific item it
//     belongs to — used only in the PhD count-only sentence, never to rank a specific candidate.
//   - "Explicit priority" — MicroTarget (lib/microTarget.ts) does carry its own priority field, but
//     phd.research_state's own DTO (PhdResearchStateData) never surfaces it per-item — only
//     aggregate counts. Reaching past that Phase 2 tool's own contract to read MicroTarget.priority
//     directly would duplicate application-state extraction Phase 2 already owns, which this phase
//     is explicitly scoped not to do. Unavailable at the tool-output layer this file is allowed to
//     read, so — per this phase's own rule ("if a signal is unavailable, simply don't use it") —
//     it is not used.
//   - Any numeric urgency/confidence score — would be invented, not observed; this file prefers
//     explainable rules (kind -> reason, position -> rank) over opaque weights throughout.
import type { JarvisWorkspace } from './types';
import type { JarvisApfcStudySection, JarvisPhdResearchSection } from './contextEngine';

/** Mirrors UpscCseTodaysStudyItemKind (lib/upscCseTodaysStudy.ts) structurally rather than
 * importing it, so this file's only dependency on workspace-specific internals stays at the Phase
 * 2 tool-output boundary (UpscStudyStateItem, applicationTools.ts) — never a direct import of a
 * workspace engine. */
export type JarvisDecisionCandidateKind = 'syllabus' | 'revision' | 'current_affairs_revision' | 'incorrect' | 'unanswered' | 'weak_area' | string;

/** One real, already-computed study item — the shape JUST enough of UpscStudyStateItem to decide
 * and explain with, never a second, parallel item type: every field here is copied verbatim from
 * the existing tool's own output, never recomputed. */
export interface JarvisDecisionCandidate {
  id: string;
  kind: JarvisDecisionCandidateKind;
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
  /** The Phase 2 tool id this candidate actually came from — e.g. 'upsc.study_state'. */
  sourceTool: string;
}

export type JarvisDecisionKind = 'recommendation' | 'no_action' | 'insufficient_data';

export interface JarvisDecisionResult {
  kind: JarvisDecisionKind;
  workspace: JarvisWorkspace;
  /** A short, user-facing recommendation sentence — built strictly from fields already present on
   * `candidates`/the supplied counts; never a fabricated subject, deadline, or score. */
  recommendation: string;
  /** Why `recommendation` says what it says — cites the selected candidate's own `kind`/title, or
   * the relevant counts, never an invented justification. */
  rationale: string;
  /** Every real candidate considered, in the EXACT order the underlying tool/engine already
   * returned them (see this file's header on why that order is never changed). Empty when this
   * workspace's tool only returns counts (apfc, phd) or when there is nothing actionable. */
  candidates: readonly JarvisDecisionCandidate[];
  /** `candidates[0]`, present only for the `'recommendation'` kind when at least one real
   * candidate exists. Absent for a count-only recommendation (apfc/phd), `'no_action'`, and
   * `'insufficient_data'` — never a guess at "the" item when none is actually named. */
  selectedCandidate?: JarvisDecisionCandidate;
  provenance: {
    /** Every Phase 2 tool id this decision actually drew data from. */
    sourceTools: readonly string[];
  };
}

/** This file's own input — deliberately NOT the full JarvisContextSnapshot (contextEngine.ts):
 * that type's own `sections` compresses UPSC's item list down to a bare count (see
 * contextEngine.ts's own JarvisUpscStudySection — "a COUNT, not the item list itself"), which is
 * exactly the one thing this file needs to rank and explain a specific candidate. Rather than
 * widening contextEngine.ts's own compressed contract (which other, unrelated callers may already
 * depend on staying bounded), the caller (runtime.ts) separately supplies the EXISTING, real
 * UpscStudyStateItem list — read straight off upsc.study_state's own already-computed output,
 * never a second calculation. apfc/phd sections are passed through exactly as contextEngine.ts
 * already shaped them, since those tools never had an item list to begin with. */
export interface DecideStudyNextInput {
  workspace: JarvisWorkspace;
  /** Present only when the active workspace's own tool actually returned item-level candidates
   * (today: only upsc.study_state does). Copied verbatim from UpscStudyStateItem — never
   * re-sorted, never filtered by an invented rule. Absent (not empty) means "this workspace's own
   * tool has no item list to offer", distinct from an empty array (its tool ran and genuinely
   * found nothing actionable). */
  upscItems?: readonly { id: string; kind: string; title: string; description: string; actionLabel: string; actionHref: string }[];
  /** Read straight from contextEngine.ts's own JarvisContextSections.apfcStudy — never recomputed. */
  apfcStudy?: JarvisApfcStudySection;
  /** Read straight from contextEngine.ts's own JarvisContextSections.phdResearch — never
   * recomputed. */
  phdResearch?: JarvisPhdResearchSection;
}

const CANDIDATE_REASON_BY_KIND: Readonly<Record<string, string>> = {
  syllabus: 'it is a syllabus topic that is currently not started or still being learned',
  revision: 'it covers questions due for revision today',
  current_affairs_revision: 'it covers Current Affairs items due for revision today',
  incorrect: 'it covers questions answered incorrectly in a past attempt',
  unanswered: 'it covers questions not attempted yet',
  weak_area: 'it covers a weak area with low recent accuracy',
};

/** Translates an EXISTING candidate `kind` into a human-readable reason — never a new fact, only a
 * fixed phrase for a kind generateTodaysStudyItems already assigned. An unrecognised kind (none
 * exist today, but `kind` is deliberately typed as a non-exhaustive string — see this file's own
 * JarvisDecisionCandidateKind) falls back to a conservative, honest phrase rather than guessing. */
function describeCandidateReason(kind: string): string {
  return CANDIDATE_REASON_BY_KIND[kind] ?? 'it is the next actionable item in the existing study order';
}

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/**
 * The first, and so far only, fully supported intent: "what should I study next" for whichever
 * workspace is active. Deterministic: the same `input` always returns the same JarvisDecisionResult.
 * Architected so a future intent (e.g. 'revision_today', 'research_next') can add its own sibling
 * function later without touching this one — no shared mutable state, no hidden dependency on call
 * order.
 */
export function decideStudyNext(input: DecideStudyNextInput): JarvisDecisionResult {
  const sourceTools: string[] = [];

  if (input.upscItems !== undefined) {
    sourceTools.push('upsc.study_state');

    const candidates: JarvisDecisionCandidate[] = input.upscItems.map((item) => ({
      id: item.id,
      kind: item.kind,
      title: item.title,
      description: item.description,
      actionLabel: item.actionLabel,
      actionHref: item.actionHref,
      sourceTool: 'upsc.study_state',
    }));

    if (candidates.length === 0) {
      return {
        kind: 'no_action',
        workspace: input.workspace,
        recommendation: "There is nothing actionable to study right now — you're caught up.",
        rationale: "Today's Study found no syllabus topics, revision items, or weak areas needing attention.",
        candidates: [],
        provenance: { sourceTools },
      };
    }

    // The EXISTING engine's own order, unchanged — the first candidate is the recommendation by
    // that engine's own design (see this file's header), never re-sorted by a new rule here.
    const selected = candidates[0];
    const reason = describeCandidateReason(selected.kind);
    const itemsPhrase = pluralize(candidates.length, 'study item');

    return {
      kind: 'recommendation',
      workspace: input.workspace,
      recommendation: `You have ${itemsPhrase} due today. I recommend "${selected.title}" first.`,
      rationale: `"${selected.title}" is first in the existing study-priority order because ${reason}.`,
      candidates,
      selectedCandidate: selected,
      provenance: { sourceTools },
    };
  }

  if (input.apfcStudy) {
    sourceTools.push('apfc.study_state');
    const { dueRevisionCount, weakTopicCount, lowestWeakTopicAccuracyPct } = input.apfcStudy;

    if (dueRevisionCount === 0 && weakTopicCount === 0) {
      return {
        kind: 'no_action',
        workspace: input.workspace,
        recommendation: "There is nothing actionable to study right now — you're caught up.",
        rationale: 'No PYQs are due for revision and no weak topics were found.',
        candidates: [],
        provenance: { sourceTools },
      };
    }

    const parts: string[] = [];
    if (dueRevisionCount > 0) parts.push(`${pluralize(dueRevisionCount, 'PYQ')} due for revision`);
    if (weakTopicCount > 0) {
      const accuracy = lowestWeakTopicAccuracyPct !== null ? ` (lowest recent accuracy ${lowestWeakTopicAccuracyPct}%)` : '';
      parts.push(`${pluralize(weakTopicCount, 'weak topic')}${accuracy}`);
    }

    // apfc.study_state has no item-level list (see this file's header) — this is deliberately a
    // count-only recommendation: no `candidates`, no `selectedCandidate`, never a guessed title.
    return {
      kind: 'recommendation',
      workspace: input.workspace,
      recommendation: `You have ${parts.join(' and ')}. Revision is due first; a specific question list isn't available from this workspace's study-state tool.`,
      rationale: 'apfc.study_state reports workspace-level counts only — no individual PYQ/topic is named by this tool.',
      candidates: [],
      provenance: { sourceTools },
    };
  }

  if (input.phdResearch) {
    sourceTools.push('phd.research_state');
    const { overdueMicroTargetCount, mostOverdueDays, researchDocumentsToContinueCount, bibliographyToContinueCount } = input.phdResearch;
    const toContinueCount = researchDocumentsToContinueCount + bibliographyToContinueCount;

    if (overdueMicroTargetCount === 0 && toContinueCount === 0) {
      return {
        kind: 'no_action',
        workspace: input.workspace,
        recommendation: "There is nothing actionable to study right now — you're caught up.",
        rationale: 'No micro-targets are overdue and no research documents or bibliography items are still to continue.',
        candidates: [],
        provenance: { sourceTools },
      };
    }

    const parts: string[] = [];
    if (overdueMicroTargetCount > 0) {
      const overdue = mostOverdueDays !== null ? ` (up to ${pluralize(mostOverdueDays, 'day')} overdue)` : '';
      parts.push(`${pluralize(overdueMicroTargetCount, 'overdue micro-target')}${overdue}`);
    }
    if (toContinueCount > 0) parts.push(`${pluralize(toContinueCount, 'item')} still to continue`);

    // phd.research_state has no item-level list either (see this file's header) — again a
    // count-only recommendation, never a named micro-target/document.
    return {
      kind: 'recommendation',
      workspace: input.workspace,
      recommendation: `You have ${parts.join(' and ')}. Overdue micro-targets are the priority; a specific target isn't available from this workspace's research-state tool.`,
      rationale: 'phd.research_state reports workspace-level counts only — no individual micro-target/document is named by this tool.',
      candidates: [],
      provenance: { sourceTools },
    };
  }

  // Nothing grounded at all — never fabricate a recommendation (this phase's own stated rule).
  return {
    kind: 'insufficient_data',
    workspace: input.workspace,
    recommendation: '',
    rationale: 'No grounded study-state data is available for this workspace.',
    candidates: [],
    provenance: { sourceTools: [] },
  };
}
