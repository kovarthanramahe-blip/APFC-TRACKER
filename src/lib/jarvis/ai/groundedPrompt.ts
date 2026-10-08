// JARVIS Phase 13B — Part G: "the LLM may phrase the recommendation naturally, but it must not
// replace the decision." This file builds the PROMPT a real local LLM would be given to phrase an
// already-made JarvisDecisionResult (Phase 12's own decisionEngine.ts) in natural language — it
// never calls a model itself, never invokes the Decision Engine itself, and never replaces its
// output: the grounded facts are copied verbatim from `decision`'s own already-computed fields,
// and the prompt's own instructions explicitly forbid inventing new ones.
//
// Deliberately NOT wired into runtime.ts in this phase. resolveJarvisRoute() (routingPolicy.ts,
// Phase 6, unmodified) always sends a 'study_next' intent to 'deterministic_tool', never to an AI
// route — which is exactly Architecture Rule 2, "the deterministic JARVIS Decision Engine remains
// authoritative for grounded decisions", and is not something this phase changes. This function
// exists, fully tested, as the building block a FUTURE phase would call once some intent is
// genuinely routed through a local LLM with grounded context to phrase — matching the same
// "additive, not force-wired" precedent Phase 13A set for localLlmLifecycle.ts.
import type { JarvisDecisionResult } from '../decisionEngine';

export interface GroundedLlmPrompt {
  /** A system-role instruction establishing the "phrase, never invent" boundary — never the
   * grounded facts themselves (those live in `userContent` so a provider that only supports a
   * single combined prompt can still include both, in order). */
  systemInstruction: string;
  /** The grounded facts (verbatim from `decision`) plus the original user-facing ask, formatted
   * for a model to phrase naturally. */
  userContent: string;
}

/**
 * Builds a grounded prompt for `decision` — never for `'insufficient_data'` (there is nothing
 * grounded to phrase) or `'no_action'` without the user ever having a query worth re-phrasing
 * beyond the decision's own honest text; both return `null` so a caller falls back to using
 * `decision.recommendation`/`decision.rationale` directly, exactly as runtime.ts already does
 * today. Pure: the same `decision` always produces the same prompt.
 */
export function buildGroundedLlmPrompt(decision: JarvisDecisionResult): GroundedLlmPrompt | null {
  if (decision.kind !== 'recommendation') {
    return null;
  }

  const systemInstruction =
    'You are JARVIS, a study assistant. Phrase the GROUNDED FACTS below naturally and concisely. ' +
    'Do not invent, add, remove, or change any fact, number, or name. Do not recommend anything ' +
    'other than what the grounded facts already recommend. If you are unsure how to phrase ' +
    'something, state it plainly rather than guessing.';

  const candidateLines =
    decision.candidates.length > 0
      ? decision.candidates.map((c, i) => `${i + 1}. ${c.title} — ${c.description}`).join('\n')
      : '(no individually-named candidates — counts only)';

  const userContent = [
    `GROUNDED FACTS (workspace: ${decision.workspace}):`,
    `Recommendation: ${decision.recommendation}`,
    `Rationale: ${decision.rationale}`,
    `Candidates, in priority order:`,
    candidateLines,
  ].join('\n');

  return { systemInstruction, userContent };
}
