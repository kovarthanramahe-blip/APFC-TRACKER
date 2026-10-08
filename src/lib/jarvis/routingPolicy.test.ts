import { describe, it, expect } from 'vitest';
import { resolveJarvisRoute, isRouteTableFreeByDefault, resolveEffectiveRoute, type ResolveJarvisRouteInput } from './routingPolicy';

function baseInput(overrides: Partial<ResolveJarvisRouteInput> = {}): ResolveJarvisRouteInput {
  return { intent: 'question', workspace: 'apfc', hasDocumentContext: false, webResearchExplicitlyRequested: false, ...overrides };
}

describe('resolveJarvisRoute — deterministic routing', () => {
  it('"What should I study next" (study_next intent) routes to the deterministic tool, never AI', () => {
    const decision = resolveJarvisRoute(baseInput({ intent: 'study_next' }));
    expect(decision.target).toBe('deterministic_tool');
    expect(decision.costClass).toBe('FREE_DETERMINISTIC');
  });

  it('a plain question with no document/web signal routes to local AI', () => {
    const decision = resolveJarvisRoute(baseInput({ intent: 'question' }));
    expect(decision.target).toBe('local_ai');
  });

  it('a question with document context routes to document retrieval + local AI', () => {
    const decision = resolveJarvisRoute(baseInput({ intent: 'question', hasDocumentContext: true }));
    expect(decision.target).toBe('document_retrieval_local_ai');
    expect(decision.requiresDocumentRetrieval).toBe(true);
  });

  it('explicit web research request routes to web retrieval + AI, even with document context present', () => {
    const decision = resolveJarvisRoute(baseInput({ intent: 'question', hasDocumentContext: true, webResearchExplicitlyRequested: true }));
    expect(decision.target).toBe('web_retrieval_ai');
    expect(decision.requiresWebRetrieval).toBe(true);
    expect(decision.requiresDocumentRetrieval).toBe(false);
  });

  it('never enables web retrieval unless explicitly requested', () => {
    const decision = resolveJarvisRoute(baseInput({ intent: 'question', webResearchExplicitlyRequested: false }));
    expect(decision.requiresWebRetrieval).toBe(false);
  });

  it('an action-style request with no document/web signal routes to deterministic-context AI planning', () => {
    const decision = resolveJarvisRoute(baseInput({ intent: 'action' }));
    expect(decision.target).toBe('deterministic_context_ai_planning');
  });

  it('is fully deterministic — identical input always produces an identical decision', () => {
    const input = baseInput({ intent: 'question', hasDocumentContext: true });
    expect(resolveJarvisRoute(input)).toEqual(resolveJarvisRoute(input));
  });
});

describe('isRouteTableFreeByDefault — Part I cost invariant', () => {
  it('no route in the table defaults to PAID_OPTIONAL', () => {
    expect(isRouteTableFreeByDefault()).toBe(true);
  });

  it('every possible route decision carries a non-paid cost class', () => {
    const intents = ['question', 'study_next', 'research', 'diagnose', 'action', 'unknown'];
    for (const intent of intents) {
      for (const hasDocumentContext of [true, false]) {
        for (const webResearchExplicitlyRequested of [true, false]) {
          const decision = resolveJarvisRoute(baseInput({ intent, hasDocumentContext, webResearchExplicitlyRequested }));
          expect(decision.costClass).not.toBe('PAID_OPTIONAL');
        }
      }
    }
  });
});

describe('resolveEffectiveRoute — graceful AI-unavailable behaviour (Part J)', () => {
  it('a deterministic_tool route is never affected by AI provider health', () => {
    const decision = resolveJarvisRoute(baseInput({ intent: 'study_next' }));
    const effective = resolveEffectiveRoute(decision, 'unavailable');
    expect(effective).toEqual({ effectiveTarget: 'deterministic_tool', degraded: false });
  });

  it('an AI-requiring route proceeds normally when the provider is model_ready', () => {
    const decision = resolveJarvisRoute(baseInput({ intent: 'question' }));
    const effective = resolveEffectiveRoute(decision, 'model_ready');
    expect(effective).toEqual({ effectiveTarget: 'local_ai', degraded: false });
  });

  it('an AI-requiring route falls back to an explicit ai_unavailable result when the provider is not ready', () => {
    const decision = resolveJarvisRoute(baseInput({ intent: 'question' }));
    const effective = resolveEffectiveRoute(decision, 'unavailable');
    expect(effective.effectiveTarget).toBe('ai_unavailable');
    expect(effective.degraded).toBe(true);
    expect(effective.degradedReason).toMatch(/AI inference is currently unavailable/);
  });

  it('the degraded reason explicitly states deterministic features remain usable — never implies the app is down', () => {
    const decision = resolveJarvisRoute(baseInput({ intent: 'question' }));
    const effective = resolveEffectiveRoute(decision, 'model_missing');
    expect(effective.degradedReason).toMatch(/Deterministic application features remain fully usable/);
  });

  it('treats every non-model_ready health state (available, model_missing, error) as not-ready for an AI-requiring route', () => {
    const decision = resolveJarvisRoute(baseInput({ intent: 'question' }));
    for (const health of ['unavailable', 'available', 'model_missing', 'error'] as const) {
      expect(resolveEffectiveRoute(decision, health).effectiveTarget).toBe('ai_unavailable');
    }
  });
});
