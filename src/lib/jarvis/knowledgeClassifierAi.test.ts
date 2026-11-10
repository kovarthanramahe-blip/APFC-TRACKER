import { describe, it, expect, vi } from 'vitest';
import { buildClassificationPrompt, parseClassificationResponse, classifyArticleWithAi, createAiClassifications } from './knowledgeClassifierAi';
import { JarvisAiProviderError } from './ai/provider';
import type { JarvisAiProvider } from './ai/provider';
import type { ApfcTopicTaxonomyEntry } from '../apfcSyllabusTaxonomy';

const TOPICS: ApfcTopicTaxonomyEntry[] = [
  { subjectId: 'economy', subjectTitle: 'Economy', topicId: 'topic-inflation', topicTitle: 'Inflation and Monetary Policy' },
  { subjectId: 'polity', subjectTitle: 'Polity', topicId: 'topic-parliament', topicTitle: 'Parliament and Legislature' },
];
const VALID_IDS = new Set(TOPICS.map((t) => t.topicId));

function fakeProvider(completeImpl: JarvisAiProvider['complete']): JarvisAiProvider {
  return {
    id: 'fake',
    name: 'Fake Provider',
    capabilities: { streaming: false, toolCalling: false },
    complete: completeImpl,
  };
}

describe('buildClassificationPrompt', () => {
  it('includes the article title, a truncated/whole article text, and every candidate topic id', () => {
    const prompt = buildClassificationPrompt({ title: 'Budget Day', text: 'Full budget coverage here.' }, TOPICS);
    expect(prompt).toContain('Budget Day');
    expect(prompt).toContain('Full budget coverage here.');
    expect(prompt).toContain('topic-inflation');
    expect(prompt).toContain('topic-parliament');
    expect(prompt).toContain('strict JSON');
  });

  it('truncates a very long article body rather than sending it unbounded', () => {
    const longText = 'x'.repeat(5000);
    const prompt = buildClassificationPrompt({ title: 'T', text: longText }, TOPICS);
    expect(prompt.length).toBeLessThan(longText.length + 1000);
  });
});

describe('parseClassificationResponse', () => {
  it('parses a well-formed response', () => {
    const raw = JSON.stringify({ classifications: [{ topicId: 'topic-inflation', confidence: 0.8, rationale: 'mentions RBI rate hike' }] });
    const result = parseClassificationResponse(raw, VALID_IDS);
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].topicId).toBe('topic-inflation');
    expect(result.candidates[0].confidence).toBe(0.8);
    expect(result.warnings).toEqual([]);
  });

  it('extracts JSON even when wrapped in a markdown code fence', () => {
    const raw = '```json\n' + JSON.stringify({ classifications: [{ topicId: 'topic-inflation', confidence: 0.5, rationale: 'r' }] }) + '\n```';
    const result = parseClassificationResponse(raw, VALID_IDS);
    expect(result.candidates).toHaveLength(1);
  });

  it('drops an entry whose topicId is not in the real candidate set, with a warning — never invents a topic', () => {
    const raw = JSON.stringify({ classifications: [{ topicId: 'totally-fabricated-topic', confidence: 0.9, rationale: 'r' }] });
    const result = parseClassificationResponse(raw, VALID_IDS);
    expect(result.candidates).toEqual([]);
    expect(result.warnings.some((w) => w.includes('unrecognised topic id'))).toBe(true);
  });

  it('drops an entry with a missing/invalid confidence rather than guessing one', () => {
    const raw = JSON.stringify({ classifications: [{ topicId: 'topic-inflation', confidence: 'high', rationale: 'r' }] });
    const result = parseClassificationResponse(raw, VALID_IDS);
    expect(result.candidates).toEqual([]);
    expect(result.warnings.some((w) => w.includes('invalid confidence'))).toBe(true);
  });

  it('clamps an out-of-range confidence into [0,1]', () => {
    const raw = JSON.stringify({ classifications: [{ topicId: 'topic-inflation', confidence: 5, rationale: 'r' }] });
    const result = parseClassificationResponse(raw, VALID_IDS);
    expect(result.candidates[0].confidence).toBe(1);
  });

  it('fills an honest placeholder rationale when the model omits one, never fabricating an explanation', () => {
    const raw = JSON.stringify({ classifications: [{ topicId: 'topic-inflation', confidence: 0.5 }] });
    const result = parseClassificationResponse(raw, VALID_IDS);
    expect(result.candidates[0].rationale).toBe('(no rationale provided by the model)');
  });

  it('returns empty candidates with a warning for completely invalid JSON, never throws', () => {
    expect(() => parseClassificationResponse('not json at all', VALID_IDS)).not.toThrow();
    const result = parseClassificationResponse('not json at all', VALID_IDS);
    expect(result.candidates).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('returns empty candidates for a response missing the classifications array', () => {
    const result = parseClassificationResponse(JSON.stringify({ foo: 'bar' }), VALID_IDS);
    expect(result.candidates).toEqual([]);
  });

  it('caps the number of returned candidates', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ topicId: i % 2 === 0 ? 'topic-inflation' : 'topic-parliament', confidence: 0.1 + i / 100, rationale: 'r' }));
    const result = parseClassificationResponse(JSON.stringify({ classifications: many }), VALID_IDS);
    expect(result.candidates.length).toBeLessThanOrEqual(5);
  });

  it('sorts candidates by confidence descending', () => {
    const raw = JSON.stringify({
      classifications: [
        { topicId: 'topic-inflation', confidence: 0.3, rationale: 'r' },
        { topicId: 'topic-parliament', confidence: 0.9, rationale: 'r' },
      ],
    });
    const result = parseClassificationResponse(raw, VALID_IDS);
    expect(result.candidates[0].topicId).toBe('topic-parliament');
  });
});

describe('classifyArticleWithAi', () => {
  it('reports unavailable when no provider is supplied', async () => {
    const result = await classifyArticleWithAi(undefined, undefined, { title: 'T', text: 'x' }, TOPICS);
    expect(result.status).toBe('unavailable');
  });

  it('reports unavailable when providerHealth is not model_ready, even if a provider object exists', async () => {
    const provider = fakeProvider(vi.fn());
    const result = await classifyArticleWithAi(provider, 'unavailable', { title: 'T', text: 'x' }, TOPICS);
    expect(result.status).toBe('unavailable');
    expect(provider.complete).not.toHaveBeenCalled();
  });

  it('calls the provider and returns parsed candidates when healthy', async () => {
    const complete = vi.fn().mockResolvedValue({ text: JSON.stringify({ classifications: [{ topicId: 'topic-inflation', confidence: 0.7, rationale: 'r' }] }), finishReason: 'stop' });
    const provider = fakeProvider(complete);
    const result = await classifyArticleWithAi(provider, 'model_ready', { title: 'T', text: 'Inflation news.' }, TOPICS);
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].topicId).toBe('topic-inflation');
    }
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('surfaces a JarvisAiProviderError as a typed error outcome', async () => {
    const complete = vi.fn().mockRejectedValue(new JarvisAiProviderError({ code: 'provider_error', message: 'boom' } as never));
    const provider = fakeProvider(complete);
    const result = await classifyArticleWithAi(provider, 'model_ready', { title: 'T', text: 'x' }, TOPICS);
    expect(result.status).toBe('error');
  });

  it('surfaces an unexpected thrown error as a typed error outcome, never propagating the raw exception', async () => {
    const complete = vi.fn().mockRejectedValue(new Error('network down'));
    const provider = fakeProvider(complete);
    const result = await classifyArticleWithAi(provider, 'model_ready', { title: 'T', text: 'x' }, TOPICS);
    expect(result.status).toBe('error');
  });

  // AI Model Evaluation & Provider Readiness phase — completeWithTimeout's own coverage. A provider
  // whose complete() never resolves (a dead connection, an outage that never errors) must not hang
  // classification forever; a short, explicitly-passed timeoutMs (never the real 20s default, which
  // would make this test itself slow) proves the race actually fires.
  it('reports a typed error — never hanging forever — when the provider never resolves within the given timeout', async () => {
    const complete = vi.fn(() => new Promise<never>(() => {})); // never settles
    const provider = fakeProvider(complete);
    const result = await classifyArticleWithAi(provider, 'model_ready', { title: 'T', text: 'x' }, TOPICS, 15);
    expect(result.status).toBe('error');
    if (result.status === 'error') expect(result.message).toMatch(/did not respond within 15ms/);
  });

  it('still succeeds normally when the provider responds well within the timeout — the timeout never interferes with a healthy, fast response', async () => {
    const complete = vi.fn().mockResolvedValue({ text: JSON.stringify({ classifications: [{ topicId: 'topic-inflation', confidence: 0.6, rationale: 'r' }] }), finishReason: 'stop' });
    const provider = fakeProvider(complete);
    const result = await classifyArticleWithAi(provider, 'model_ready', { title: 'T', text: 'Inflation news.' }, TOPICS, 15);
    expect(result.status).toBe('ok');
  });

  it('passes an AbortSignal through to the provider so a well-behaved real adapter can stop real work promptly on timeout', async () => {
    let seenSignal: AbortSignal | undefined;
    const complete = vi.fn((request) => {
      seenSignal = request.signal;
      return new Promise<never>(() => {});
    });
    const provider = fakeProvider(complete);
    await classifyArticleWithAi(provider, 'model_ready', { title: 'T', text: 'x' }, TOPICS, 15);
    expect(seenSignal).toBeInstanceOf(AbortSignal);
  });
});

describe('createAiClassifications', () => {
  it('wraps candidates as proposed/ai-source KnowledgeClassification records', () => {
    const result = createAiClassifications({
      workspaceId: 'apfc',
      itemId: 'item-1',
      itemType: 'imported_content',
      candidates: [{ topicId: 'topic-inflation', confidence: 0.7, rationale: 'r' }],
    });
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('proposed');
    expect(result[0].source).toBe('ai');
    expect(result[0].itemId).toBe('item-1');
  });

  it('returns an empty array for an empty candidate list', () => {
    expect(createAiClassifications({ workspaceId: 'apfc', itemId: 'item-1', itemType: 'imported_content', candidates: [] })).toEqual([]);
  });
});
