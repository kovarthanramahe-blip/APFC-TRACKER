import { describe, it, expect } from 'vitest';
import { parseClassificationResponse } from '../jarvis/knowledgeClassifierAi';
import { STRUCTURED_OUTPUT_FIXTURES, VALID_TOPIC_IDS } from './structuredOutputFixtures';

// AI Model Evaluation & Provider Readiness — structured-output VALIDITY measurement.
//
// Measures the real parseClassificationResponse (jarvis/knowledgeClassifierAi.ts) against a
// battery of plausible real-world LLM output shapes — never a live model call, since this parser
// is itself provider-independent (it takes a raw string, see that module's own header). This is
// the "structured-output validity" axis the AI Model Evaluation phase asked for: whatever provider
// is eventually wired in, THIS validation layer is what stands between its raw text and a
// persisted classification, so its own correctness is measured here directly and exhaustively,
// not just spot-checked by the 2 cases knowledgeClassifierAi.test.ts already covered individually.

describe('parseClassificationResponse — structured-output validity battery (offline, no AI call)', () => {
  for (const fixture of STRUCTURED_OUTPUT_FIXTURES) {
    it(`${fixture.id}: yields exactly ${fixture.expectedCandidateCount} candidate(s)${fixture.expectWarnings ? ' with at least one warning' : ' with no warnings'}`, () => {
      const { candidates, warnings } = parseClassificationResponse(fixture.rawText, VALID_TOPIC_IDS);
      expect(candidates).toHaveLength(fixture.expectedCandidateCount);
      if (fixture.expectWarnings) {
        expect(warnings.length).toBeGreaterThan(0);
      } else {
        expect(warnings).toEqual([]);
      }
    });
  }

  it('every candidate this parser ever returns has a topicId drawn from the real valid set — never a hallucinated id reaching a caller', () => {
    for (const fixture of STRUCTURED_OUTPUT_FIXTURES) {
      const { candidates } = parseClassificationResponse(fixture.rawText, VALID_TOPIC_IDS);
      for (const candidate of candidates) {
        expect(VALID_TOPIC_IDS.has(candidate.topicId), `${fixture.id} produced an id outside the valid set: ${candidate.topicId}`).toBe(true);
      }
    }
  });

  it('every candidate confidence is always within [0, 1], regardless of what the raw text claimed', () => {
    for (const fixture of STRUCTURED_OUTPUT_FIXTURES) {
      const { candidates } = parseClassificationResponse(fixture.rawText, VALID_TOPIC_IDS);
      for (const candidate of candidates) {
        expect(candidate.confidence).toBeGreaterThanOrEqual(0);
        expect(candidate.confidence).toBeLessThanOrEqual(1);
      }
    }
  });

  it('this parser never throws, for any fixture in the battery, including truncated/non-JSON/empty input', () => {
    for (const fixture of STRUCTURED_OUTPUT_FIXTURES) {
      expect(() => parseClassificationResponse(fixture.rawText, VALID_TOPIC_IDS)).not.toThrow();
    }
  });

  it('measured validity rate: every fixture in this battery produces the expected candidate count (100% — this IS the regression bar, not an estimate)', () => {
    const results = STRUCTURED_OUTPUT_FIXTURES.map((fixture) => {
      const { candidates } = parseClassificationResponse(fixture.rawText, VALID_TOPIC_IDS);
      return candidates.length === fixture.expectedCandidateCount;
    });
    const passRate = results.filter(Boolean).length / results.length;
    expect(passRate, `${results.filter((r) => !r).length} of ${results.length} fixtures produced an unexpected candidate count`).toBe(1);
  });
});
