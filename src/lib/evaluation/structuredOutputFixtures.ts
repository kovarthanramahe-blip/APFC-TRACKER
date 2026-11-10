// AI Model Evaluation & Provider Readiness — structured-output validity fixtures.
//
// Real failure modes a real LLM's JSON output could plausibly exhibit, used to measure
// jarvis/knowledgeClassifierAi.ts's parseClassificationResponse against something broader than
// the handful of cases its own existing unit tests already cover individually. Every fixture here
// is a RAW TEXT STRING standing in for what a provider's response.text could contain — no AI call,
// no network, fully offline.

export interface StructuredOutputFixture {
  id: string;
  rawText: string;
  /** How many of VALID_TOPIC_IDS (below) this response SHOULD yield as real candidates once
   * parsed and validated — the one measurable, objective pass/fail signal for this fixture. */
  expectedCandidateCount: number;
  /** Whether at least one warning is expected (a fixture can still correctly yield 0 or more
   * candidates AND warn — e.g. a response with one valid entry and one hallucinated topicId). */
  expectWarnings: boolean;
}

export const VALID_TOPIC_IDS = new Set(['topic-inflation', 'topic-parliament']);

export const STRUCTURED_OUTPUT_FIXTURES: readonly StructuredOutputFixture[] = [
  {
    id: 'valid-single-candidate',
    rawText: '{"classifications":[{"topicId":"topic-inflation","confidence":0.8,"rationale":"mentions inflation"}]}',
    expectedCandidateCount: 1,
    expectWarnings: false,
  },
  {
    id: 'valid-empty-classifications',
    rawText: '{"classifications":[]}',
    expectedCandidateCount: 0,
    expectWarnings: false,
  },
  {
    id: 'valid-multiple-candidates',
    rawText: '{"classifications":[{"topicId":"topic-inflation","confidence":0.9,"rationale":"a"},{"topicId":"topic-parliament","confidence":0.4,"rationale":"b"}]}',
    expectedCandidateCount: 2,
    expectWarnings: false,
  },
  {
    id: 'wrapped-in-markdown-fence',
    rawText: '```json\n{"classifications":[{"topicId":"topic-inflation","confidence":0.7,"rationale":"fenced"}]}\n```',
    expectedCandidateCount: 1,
    expectWarnings: false,
  },
  {
    id: 'leading-prose-before-json',
    rawText: 'Sure, here is the classification:\n{"classifications":[{"topicId":"topic-inflation","confidence":0.6,"rationale":"prose prefix"}]}',
    expectedCandidateCount: 1,
    expectWarnings: false,
  },
  {
    id: 'hallucinated-topic-id',
    rawText: '{"classifications":[{"topicId":"topic-does-not-exist","confidence":0.9,"rationale":"invented"}]}',
    expectedCandidateCount: 0,
    expectWarnings: true,
  },
  {
    id: 'mixed-valid-and-hallucinated',
    rawText: '{"classifications":[{"topicId":"topic-inflation","confidence":0.8,"rationale":"real"},{"topicId":"topic-fake","confidence":0.5,"rationale":"invented"}]}',
    expectedCandidateCount: 1,
    expectWarnings: true,
  },
  {
    id: 'missing-confidence-field',
    rawText: '{"classifications":[{"topicId":"topic-inflation","rationale":"no confidence"}]}',
    expectedCandidateCount: 0,
    expectWarnings: true,
  },
  {
    id: 'confidence-as-string-not-number',
    rawText: '{"classifications":[{"topicId":"topic-inflation","confidence":"high","rationale":"wrong type"}]}',
    expectedCandidateCount: 0,
    expectWarnings: true,
  },
  {
    id: 'confidence-out-of-range-clamped',
    rawText: '{"classifications":[{"topicId":"topic-inflation","confidence":5,"rationale":"too high"}]}',
    expectedCandidateCount: 1, // clamped to 1.0, not rejected
    expectWarnings: false,
  },
  {
    id: 'missing-rationale-gets-honest-placeholder',
    rawText: '{"classifications":[{"topicId":"topic-inflation","confidence":0.5}]}',
    expectedCandidateCount: 1, // accepted; rationale falls back to an honest placeholder, never fabricated
    expectWarnings: false,
  },
  {
    id: 'not-json-at-all',
    rawText: 'I cannot classify this article.',
    expectedCandidateCount: 0,
    expectWarnings: true,
  },
  {
    id: 'classifications-field-not-an-array',
    rawText: '{"classifications":"topic-inflation"}',
    expectedCandidateCount: 0,
    expectWarnings: true,
  },
  {
    id: 'empty-string-response',
    rawText: '',
    expectedCandidateCount: 0,
    expectWarnings: true,
  },
  {
    id: 'truncated-json-mid-object',
    rawText: '{"classifications":[{"topicId":"topic-inflation","confidence":0.7,"rationale":"truncated',
    expectedCandidateCount: 0,
    expectWarnings: true,
  },
  {
    id: 'array-entry-not-an-object',
    rawText: '{"classifications":["topic-inflation"]}',
    expectedCandidateCount: 0,
    expectWarnings: true,
  },
  {
    id: 'more-than-five-candidates-truncated-to-five',
    rawText: `{"classifications":[${['topic-inflation', 'topic-parliament', 'topic-inflation', 'topic-parliament', 'topic-inflation', 'topic-parliament'].map((id, i) => `{"topicId":"${id}","confidence":${0.9 - i * 0.1},"rationale":"r${i}"}`).join(',')}]}`,
    expectedCandidateCount: 5, // MAX_CANDIDATES_RETURNED caps it, never silently dropped to 0
    expectWarnings: false,
  },
] as const;
