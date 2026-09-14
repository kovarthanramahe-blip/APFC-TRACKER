import { describe, it, expect } from 'vitest';
import { SYLLABUS } from '../data/syllabus';
import { PYQ_BANK } from '../data/pyq';
import { QUESTION_BANK } from '../data/questionBank';
import { validateResearchBatch, getValidBatchConcepts } from './generatedQuestionResearchBatch';
import {
  APFC_RESEARCH_BATCH,
  APFC_RESEARCH_BATCH_SOURCES,
  APFC_RESEARCH_BATCH_CONCEPTS,
  APFC_RESEARCH_BATCH_RESULT,
} from './apfcSourceResearchBatch';

const KNOWN_TOPIC_IDS = new Set(SYLLABUS.flatMap((s) => s.topics.map((t) => t.id)));

describe('all included sources validate', () => {
  it('has exactly 4 sources, every one valid', () => {
    expect(APFC_RESEARCH_BATCH.sources).toHaveLength(4);
    expect(APFC_RESEARCH_BATCH_RESULT.sources).toHaveLength(4);
    for (const result of APFC_RESEARCH_BATCH_RESULT.sources) {
      expect(result.status).toBe('valid');
    }
  });

  it('recomputing validateResearchBatch independently agrees', () => {
    const recomputed = validateResearchBatch(APFC_RESEARCH_BATCH);
    expect(recomputed.sources.every((s) => s.status === 'valid')).toBe(true);
  });
});

describe('all included concepts validate', () => {
  it('has exactly 4 concepts, every one valid', () => {
    expect(APFC_RESEARCH_BATCH.conceptInputs).toHaveLength(4);
    expect(APFC_RESEARCH_BATCH_RESULT.concepts).toHaveLength(4);
    for (const result of APFC_RESEARCH_BATCH_RESULT.concepts) {
      expect(result.status).toBe('valid');
    }
  });

  it('getValidBatchConcepts returns all 4, matching the supplied conceptIds', () => {
    const valid = getValidBatchConcepts(APFC_RESEARCH_BATCH_RESULT);
    expect(valid.map((c) => c.conceptId).sort()).toEqual(
      APFC_RESEARCH_BATCH_CONCEPTS.map((c) => c.conceptId).sort(),
    );
  });
});

describe('sourceId traceability', () => {
  it('every concept.sourceId resolves to a source actually present in the batch', () => {
    const knownSourceIds = new Set(APFC_RESEARCH_BATCH_SOURCES.map((s) => s.sourceId));
    for (const concept of APFC_RESEARCH_BATCH_CONCEPTS) {
      expect(knownSourceIds.has(concept.sourceId)).toBe(true);
    }
  });

  it('every validated concept carries the same sourceId it was supplied with', () => {
    const valid = getValidBatchConcepts(APFC_RESEARCH_BATCH_RESULT);
    for (const concept of valid) {
      const originalInput = APFC_RESEARCH_BATCH_CONCEPTS.find((c) => c.conceptId === concept.conceptId);
      expect(originalInput).toBeDefined();
      expect(concept.sourceId).toBe(originalInput!.sourceId);
    }
  });

  it('all 4 sourceIds are unique (no accidental collision within the batch)', () => {
    const ids = APFC_RESEARCH_BATCH_SOURCES.map((s) => s.sourceId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all 4 conceptIds are unique (no accidental collision within the batch)', () => {
    const ids = APFC_RESEARCH_BATCH_CONCEPTS.map((c) => c.conceptId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('topicId validity', () => {
  it('every concept.topicId is a real syllabus topic', () => {
    for (const concept of APFC_RESEARCH_BATCH_CONCEPTS) {
      expect(KNOWN_TOPIC_IDS.has(concept.topicId)).toBe(true);
    }
  });

  it('the Code on Social Security concept is filed under the "labour-law" subject', () => {
    const cssConcept = APFC_RESEARCH_BATCH_CONCEPTS.find((c) => c.conceptId === 'concept-css-2020-act-details')!;
    const subject = SYLLABUS.find((s) => s.topics.some((t) => t.id === cssConcept.topicId));
    expect(subject?.id).toBe('labour-law');
  });

  it('the three current-development concepts are filed under the "current-affairs" subject', () => {
    const currentDevConceptIds = ['concept-four-labour-codes-effective-2025-11-21', 'concept-eec-2026', 'concept-vishwas-2026'];
    for (const conceptId of currentDevConceptIds) {
      const concept = APFC_RESEARCH_BATCH_CONCEPTS.find((c) => c.conceptId === conceptId)!;
      const subject = SYLLABUS.find((s) => s.topics.some((t) => t.id === concept.topicId));
      expect(subject?.id).toBe('current-affairs');
    }
  });
});

describe('exact source-reference preservation', () => {
  it('preserves every source field exactly through validateResearchBatch', () => {
    for (let i = 0; i < APFC_RESEARCH_BATCH_SOURCES.length; i++) {
      expect(APFC_RESEARCH_BATCH_RESULT.sources[i].source).toEqual(APFC_RESEARCH_BATCH_SOURCES[i]);
    }
  });

  it('exact reference URLs/document references match the supplied source metadata', () => {
    const bySourceId = new Map(APFC_RESEARCH_BATCH_SOURCES.map((s) => [s.sourceId, s]));
    expect(bySourceId.get('src-css-2020-india-code')!.reference).toBe('https://www.indiacode.nic.in/handle/123456789/16823?view_type=browse');
    expect(bySourceId.get('src-four-labour-codes-effective-pib')!.reference).toBe('https://www.pib.gov.in/PressReleasePage.aspx?PRID=2194018&lang=1&reg=1');
    expect(bySourceId.get('src-eec-2026-pib')!.reference).toBe('https://www.pib.gov.in/PressReleasePage.aspx?PRID=2299045&lang=2&reg=48');
    expect(bySourceId.get('src-vishwas-2026-pib')!.reference).toBe('https://www.pib.gov.in/PressReleasePage.aspx?PRID=2285666&lang=1&reg=6');
  });

  it('sourceType and publishedAt are preserved exactly', () => {
    const bySourceId = new Map(APFC_RESEARCH_BATCH_RESULT.sources.map((s) => [s.source.sourceId, s.source]));
    expect(bySourceId.get('src-css-2020-india-code')?.sourceType).toBe('india_code');
    expect(bySourceId.get('src-css-2020-india-code')?.publishedAt).toBe('2020-09-28');
    expect(bySourceId.get('src-four-labour-codes-effective-pib')?.sourceType).toBe('pib');
    expect(bySourceId.get('src-four-labour-codes-effective-pib')?.publishedAt).toBe('2025-11-25');
    expect(bySourceId.get('src-eec-2026-pib')?.publishedAt).toBe('2026-08-13');
    expect(bySourceId.get('src-vishwas-2026-pib')?.publishedAt).toBe('2026-07-17');
  });
});

describe('exact factualBasis preservation', () => {
  it('preserves factualBasis exactly through validateResearchBatch for every concept', () => {
    const valid = getValidBatchConcepts(APFC_RESEARCH_BATCH_RESULT);
    for (const original of APFC_RESEARCH_BATCH_CONCEPTS) {
      const validated = valid.find((c) => c.conceptId === original.conceptId);
      expect(validated).toBeDefined();
      expect(validated!.factualBasis).toBe(original.factualBasis);
    }
  });

  it('no PYQ calibration ids were added to any concept', () => {
    for (const concept of APFC_RESEARCH_BATCH_CONCEPTS) {
      expect(concept.relevantPyqIds).toBeUndefined();
    }
  });
});

describe('zero contamination of PYQ_BANK/QUESTION_BANK', () => {
  it('no research fixture id collides with an existing PYQ id', () => {
    const pyqIds = new Set(PYQ_BANK.map((p) => p.id));
    for (const concept of APFC_RESEARCH_BATCH_CONCEPTS) {
      expect(pyqIds.has(concept.conceptId)).toBe(false);
      expect(pyqIds.has(concept.sourceId)).toBe(false);
    }
  });

  it('no research fixture id collides with an existing QUESTION_BANK id', () => {
    const questionIds = new Set(QUESTION_BANK.map((q) => q.id));
    for (const concept of APFC_RESEARCH_BATCH_CONCEPTS) {
      expect(questionIds.has(concept.conceptId)).toBe(false);
      expect(questionIds.has(concept.sourceId)).toBe(false);
    }
  });

  it('this module exports no reference to PYQ_BANK or QUESTION_BANK content', () => {
    expect(APFC_RESEARCH_BATCH_SOURCES.every((s) => !('correctOptionId' in s))).toBe(true);
    expect(APFC_RESEARCH_BATCH_CONCEPTS.every((c) => !('options' in c))).toBe(true);
  });
});
