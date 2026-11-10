import { describe, it, expect } from 'vitest';

// AI Model Evaluation & Provider Readiness — the PROVIDER-BASED counterpart to
// classificationEval.test.ts/structuredOutputEval.test.ts, kept in its own file so it can never
// accidentally run as part of the normal, fully-offline test/build workflow.
//
// This file is deliberately a SKELETON, not a working integration: no real JarvisAiProvider
// adapter exists anywhere in this codebase today (confirmed by this feature's own trace — see its
// report — runtime.ts composes ONLY the Android on-device llama.cpp provider; the generic
// JarvisAiProvider interface in jarvis/ai/provider.ts has no hosted-API adapter implementing it
// yet). Writing a "real" test against a provider that doesn't exist would mean either skipping
// every test unconditionally (pointless) or secretly calling something — this file does neither.
// It exists to make the GATING PATTERN itself explicit and testable, so wiring a real adapter
// later is "write the adapter, point CLASSIFIER_PROVIDER_FACTORY at it" — never "first invent a
// way to keep provider tests separate from offline ones," which is exactly the gap this closes.
//
// Gating contract: every test below is skipped UNLESS process.env.JARVIS_EVAL_PROVIDER_API_KEY is
// set — this environment variable is never read by application code, never shipped to a browser
// bundle (this file only ever runs under Node/Vitest), and this repository's CI/test/build scripts
// never set it, so these tests do not run automatically anywhere today. A developer who HAS
// configured a real provider adapter and wants to measure it for real sets the variable locally and
// runs this file directly (`npx vitest run src/lib/evaluation/providerClassificationEval.test.ts`)
// — never as part of `npm test`/`npm run build`'s own invocation of the full suite.
const PROVIDER_CONFIGURED = Boolean(process.env.JARVIS_EVAL_PROVIDER_API_KEY);

describe('Provider-based classification evaluation (opt-in — requires JARVIS_EVAL_PROVIDER_API_KEY)', () => {
  it.skipIf(!PROVIDER_CONFIGURED)('would run the same CLASSIFICATION_FIXTURES corpus through a real configured provider and report measured accuracy', async () => {
    // Deliberately unimplemented: there is no real provider adapter to call yet (see this file's
    // own header). When one exists, this test imports it, builds a JarvisAiProvider from the
    // configured key/model, and runs classifyArticleWithAi (jarvis/knowledgeClassifierAi.ts —
    // already built, already timeout-bounded, already validates structured output) across
    // CLASSIFICATION_FIXTURES / STRUCTURED_OUTPUT_FIXTURES, exactly like the offline harness does
    // for the deterministic classifier, and asserts/report real measured numbers — never invented
    // ones. Until that adapter exists, this is intentionally a documented gap, not a false green.
    expect.fail('No real AI provider adapter is wired into this codebase yet — see this file\'s own header for what unblocks this test.');
  });

  it('the gate itself is verifiably off by default in this environment — a false "it ran" is impossible without the key', () => {
    expect(PROVIDER_CONFIGURED).toBe(false);
  });
});
