import type { JarvisContext, JarvisIntent, JarvisResponse } from './types';

// Conservative, deliberately non-"intelligent" intent matching. This is NOT a natural-language
// classifier and must not grow into one here — it exists only so the orchestrator has *something*
// deterministic to resolve before an AI reasoning layer (layer 3 — see types.ts's header) exists.
// Each rule is a narrow, explainable keyword/pattern check; a query matching none of them is
// 'unknown', which is the conservative, honest answer rather than a guess.
const INTENT_RULES: ReadonlyArray<{ intent: JarvisIntent; test: (query: string) => boolean }> = [
  { intent: 'study_next', test: (q) => /\b(study next|what should i study|revise|revision|due)\b/.test(q) },
  { intent: 'research', test: (q) => /\b(research|bibliography|source|paper|citation)\b/.test(q) },
  { intent: 'diagnose', test: (q) => /\b(diagnose|not working|broken|crash(ed)?|bug|error)\b/.test(q) },
  { intent: 'action', test: (q) => /^(do|create|delete|enable|disable|set|mark|open|start|stop)\b/.test(q) },
  { intent: 'question', test: (q) => q.endsWith('?') || /^(what|why|how|when|who|where|which|explain)\b/.test(q) },
];

/**
 * Resolves the simplest possible intent for a raw query string — see INTENT_RULES above for why
 * this is deliberately conservative. Pure and deterministic: the same query always resolves to
 * the same intent, with no AI call, no network call, and no dependence on anything outside the
 * string itself.
 */
export function resolveIntent(query: string): JarvisIntent {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return 'unknown';
  for (const rule of INTENT_RULES) {
    if (rule.test(normalized)) return rule.intent;
  }
  return 'unknown';
}

const INTENT_ACKNOWLEDGEMENTS: Readonly<Record<string, string>> = {
  study_next: 'Recognised this as a study_next request.',
  research: 'Recognised this as a research request.',
  diagnose: 'Recognised this as a diagnose request.',
  action: 'Recognised this as an action request.',
  question: 'Recognised this as a question.',
};

function buildResponseText(intent: JarvisIntent, query: string): string {
  if (intent === 'unknown' || !query.trim()) {
    return "JARVIS didn't recognise a specific request in that — this phase only understands a few conservative intents and does not interpret free-form language.";
  }
  const acknowledgement = INTENT_ACKNOWLEDGEMENTS[intent] ?? `Recognised this as a "${intent}" request.`;
  return `${acknowledgement} No tools are registered yet, so there is nothing further JARVIS can resolve on its own in this phase.`;
}

/**
 * The minimal JARVIS orchestration entry point for this phase. Resolves an intent for `query`,
 * then returns a structured JarvisResponse — it never calls an AI provider, never makes a network
 * request, and never reads or writes any application state (including `context.appContext`, which
 * is carried through only for a future phase to use). `signals` and `toolResults` are always empty
 * here because no JarvisTool is ever invoked in this phase (see toolRegistry.ts) — they exist on
 * JarvisResponse now so a future phase that starts populating them is not a breaking change.
 *
 * `context` is accepted (and typed) but deliberately unused beyond being part of this function's
 * contract: nothing in this phase's conservative intent matching reads workspace/route/timestamp/
 * appContext. A future phase that lets context influence intent resolution or tool selection can
 * do so without changing this function's signature.
 */
export function handleJarvisRequest(context: JarvisContext, query: string): JarvisResponse {
  void context;
  const intent = resolveIntent(query);
  return {
    intent,
    responseText: buildResponseText(intent, query),
    signals: [],
    toolResults: [],
    requiresFurtherProcessing: true,
  };
}
