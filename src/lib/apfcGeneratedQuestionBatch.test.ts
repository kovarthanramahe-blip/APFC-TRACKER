import { describe, it, expect } from 'vitest';
import { SYLLABUS } from '../data/syllabus';
import { PYQ_BANK } from '../data/pyq';
import { QUESTION_BANK } from '../data/questionBank';
import { APFC_RESEARCH_BATCH_CONCEPTS, APFC_RESEARCH_BATCH_SOURCES } from './apfcSourceResearchBatch';
import { verifyNoAuthenticityClaim, verifyExactlyOneCorrectOption, verifyNoDuplicateOptionText } from './generatedQuestionQuality';
import { APFC_GENERATED_QUESTION_BATCH, APFC_GENERATED_QUESTION_DRAFTS } from './apfcGeneratedQuestionBatch';

const KNOWN_TOPIC_IDS = new Set(SYLLABUS.flatMap((s) => s.topics.map((t) => t.id)));
const PYQ_IDS = new Set(PYQ_BANK.map((p) => p.id));
const QUESTION_BANK_IDS = new Set(QUESTION_BANK.map((q) => q.id));
const conceptsById = new Map(APFC_RESEARCH_BATCH_CONCEPTS.map((c) => [c.conceptId, c]));
const sourcesBySourceId = new Map(APFC_RESEARCH_BATCH_SOURCES.map((s) => [s.sourceId, s]));

describe('1. exactly 8 generated drafts exist', () => {
  it('the batch contains exactly 8 entries, all structurally valid', () => {
    expect(APFC_GENERATED_QUESTION_BATCH).toHaveLength(8);
    for (const entry of APFC_GENERATED_QUESTION_BATCH) {
      expect(entry.workflowResult.status).not.toBe('invalid');
    }
    expect(APFC_GENERATED_QUESTION_DRAFTS).toHaveLength(8);
  });
});

describe('2. exactly 2 per source concept', () => {
  it('every one of the 4 concepts has exactly 2 generated questions', () => {
    const counts = new Map<string, number>();
    for (const entry of APFC_GENERATED_QUESTION_BATCH) {
      counts.set(entry.conceptId, (counts.get(entry.conceptId) ?? 0) + 1);
    }
    expect(counts.size).toBe(4);
    for (const conceptId of APFC_RESEARCH_BATCH_CONCEPTS.map((c) => c.conceptId)) {
      expect(counts.get(conceptId)).toBe(2);
    }
  });
});

describe('3. all 8 have valid source provenance', () => {
  it('every draft has provenance.kind "generated" with non-empty source metadata', () => {
    for (const draft of APFC_GENERATED_QUESTION_DRAFTS) {
      expect(draft.provenance.kind).toBe('generated');
      expect(draft.provenance.sourceAuthority.length).toBeGreaterThan(0);
      expect(draft.provenance.sourceTitle.length).toBeGreaterThan(0);
      expect(draft.provenance.sourceReference.length).toBeGreaterThan(0);
    }
  });
});

describe('4. all 8 have valid syllabus topicIds', () => {
  it('every draft.topicId and provenance.topicId is a real syllabus topic', () => {
    for (const draft of APFC_GENERATED_QUESTION_DRAFTS) {
      expect(KNOWN_TOPIC_IDS.has(draft.topicId)).toBe(true);
      expect(KNOWN_TOPIC_IDS.has(draft.provenance.topicId)).toBe(true);
    }
  });
});

describe('5. all 8 have exactly one correct option', () => {
  it('verifyExactlyOneCorrectOption reports no errors for any draft', () => {
    for (const draft of APFC_GENERATED_QUESTION_DRAFTS) {
      expect(verifyExactlyOneCorrectOption(draft)).toEqual([]);
    }
  });

  it('every draft has exactly 4 options', () => {
    for (const draft of APFC_GENERATED_QUESTION_DRAFTS) {
      expect(draft.options).toHaveLength(4);
    }
  });
});

describe('6. no duplicate option text', () => {
  it('verifyNoDuplicateOptionText reports no errors for any draft', () => {
    for (const draft of APFC_GENERATED_QUESTION_DRAFTS) {
      expect(verifyNoDuplicateOptionText(draft)).toEqual([]);
    }
  });
});

describe('7. no ID collisions', () => {
  it('all 8 generated question ids are unique among themselves', () => {
    const ids = APFC_GENERATED_QUESTION_BATCH.map((e) => e.id);
    expect(new Set(ids).size).toBe(8);
  });

  it('no generated question id collides with an existing PYQ_BANK id', () => {
    for (const entry of APFC_GENERATED_QUESTION_BATCH) {
      expect(PYQ_IDS.has(entry.id)).toBe(false);
    }
  });

  it('no generated question id collides with an existing QUESTION_BANK id', () => {
    for (const entry of APFC_GENERATED_QUESTION_BATCH) {
      expect(QUESTION_BANK_IDS.has(entry.id)).toBe(false);
    }
  });
});

describe('8. all source references are preserved', () => {
  it('every draft carries its source authority/title/reference exactly', () => {
    for (const entry of APFC_GENERATED_QUESTION_BATCH) {
      const concept = conceptsById.get(entry.conceptId)!;
      const source = sourcesBySourceId.get(concept.sourceId)!;
      if (entry.workflowResult.status === 'invalid') throw new Error(`expected ${entry.id} to be valid`);
      const draft = entry.workflowResult.draft;
      expect(draft.provenance.sourceAuthority).toBe(source.authority);
      expect(draft.provenance.sourceTitle).toBe(source.title);
      expect(draft.provenance.sourceReference).toBe(source.reference);
      expect(draft.provenance.sourcePublishedAt).toBe(source.publishedAt);
    }
  });
});

describe('9. all factualBasis links trace back to the research batch', () => {
  it('every entry.conceptId resolves to a real concept in the Stage 6K research batch', () => {
    for (const entry of APFC_GENERATED_QUESTION_BATCH) {
      expect(conceptsById.has(entry.conceptId)).toBe(true);
    }
  });

  it("every draft's topicId matches its linked concept's topicId exactly", () => {
    for (const entry of APFC_GENERATED_QUESTION_BATCH) {
      if (entry.workflowResult.status === 'invalid') throw new Error(`expected ${entry.id} to be valid`);
      const concept = conceptsById.get(entry.conceptId)!;
      expect(entry.workflowResult.draft.topicId).toBe(concept.topicId);
      expect(entry.workflowResult.draft.provenance.topicId).toBe(concept.topicId);
    }
  });

  it('every workflow result carries the exact same SourceConcept object supplied to it', () => {
    for (const entry of APFC_GENERATED_QUESTION_BATCH) {
      if (entry.workflowResult.status === 'invalid') throw new Error(`expected ${entry.id} to be valid`);
      const concept = conceptsById.get(entry.conceptId)!;
      expect(entry.workflowResult.sourceConcept).toEqual(concept);
    }
  });
});

describe('10. no question claims to be an authentic PYQ', () => {
  it('verifyNoAuthenticityClaim reports no errors for any draft', () => {
    for (const draft of APFC_GENERATED_QUESTION_DRAFTS) {
      expect(verifyNoAuthenticityClaim(draft)).toEqual([]);
    }
  });
});

describe('11. all drafts pass structural validation', () => {
  it('workflowResult is never "invalid" and quality-assessment validation reports zero errors', () => {
    for (const entry of APFC_GENERATED_QUESTION_BATCH) {
      expect(entry.workflowResult.status).not.toBe('invalid');
      expect(entry.qualityAssessmentErrors).toEqual([]);
    }
  });
});

describe('12. all remain draft, not published', () => {
  it('every draft.provenance.verificationStatus is "draft"', () => {
    for (const draft of APFC_GENERATED_QUESTION_DRAFTS) {
      expect(draft.provenance.verificationStatus).toBe('draft');
    }
  });

  it('every workflow result is "validated", never "publishable"', () => {
    for (const entry of APFC_GENERATED_QUESTION_BATCH) {
      expect(entry.workflowResult.status).toBe('validated');
    }
  });
});

describe('13. PYQ_BANK and QUESTION_BANK are unchanged', () => {
  it('none of the 8 generated question ids appear anywhere in PYQ_BANK or QUESTION_BANK', () => {
    const generatedIds = new Set(APFC_GENERATED_QUESTION_BATCH.map((e) => e.id));
    for (const id of generatedIds) {
      expect(PYQ_IDS.has(id)).toBe(false);
      expect(QUESTION_BANK_IDS.has(id)).toBe(false);
    }
  });

  it('QUESTION_BANK and PYQ_BANK are non-empty and untouched by importing this fixture', () => {
    expect(QUESTION_BANK.length).toBeGreaterThan(0);
    expect(PYQ_BANK.length).toBeGreaterThan(0);
  });
});

describe('14. no invented calibration IDs', () => {
  it('no draft carries any calibratedAgainstPyqIds', () => {
    for (const draft of APFC_GENERATED_QUESTION_DRAFTS) {
      expect(draft.provenance.calibratedAgainstPyqIds).toBeUndefined();
    }
  });
});
