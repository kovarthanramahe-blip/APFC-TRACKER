import { describe, it, expect } from 'vitest';
import { getDocumentTaskRequirement, DOCUMENT_TASK_POLICY, type JarvisDocumentTaskKind } from './documentTaskRequirements';

const ALL_KINDS: JarvisDocumentTaskKind[] = ['SHORT_DOCUMENT_SUMMARY', 'LONG_DOCUMENT_SUMMARY', 'DOCUMENT_QA', 'MULTI_DOCUMENT_COMPARISON', 'RESEARCH_SYNTHESIS'];

describe('getDocumentTaskRequirement', () => {
  it('returns a requirement for every declared task kind, each carrying its own kind back', () => {
    for (const kind of ALL_KINDS) {
      expect(getDocumentTaskRequirement(kind).kind).toBe(kind);
    }
  });

  it('every numeric/qualitative threshold traces back to the one named DOCUMENT_TASK_POLICY table, never a call-site literal', () => {
    for (const kind of ALL_KINDS) {
      expect(getDocumentTaskRequirement(kind)).toEqual({ kind, ...DOCUMENT_TASK_POLICY[kind] });
    }
  });

  it('a long document summary requires strictly more context capacity than a short one', () => {
    expect(getDocumentTaskRequirement('LONG_DOCUMENT_SUMMARY').minContextCapacityTokens).toBeGreaterThan(getDocumentTaskRequirement('SHORT_DOCUMENT_SUMMARY').minContextCapacityTokens);
  });

  it('a long document summary requires a strictly larger minimum local capability than a short one', () => {
    const order = { tiny: 0, small: 1, medium: 2, large: 3, unknown: -1 } as const;
    const long = getDocumentTaskRequirement('LONG_DOCUMENT_SUMMARY').minimumLocalCapability;
    const short = getDocumentTaskRequirement('SHORT_DOCUMENT_SUMMARY').minimumLocalCapability;
    expect(order[long]).toBeGreaterThan(order[short]);
  });

  it('every document task requires document retrieval (they are all document operations)', () => {
    for (const kind of ALL_KINDS) {
      expect(getDocumentTaskRequirement(kind).requiresDocumentRetrieval).toBe(true);
    }
  });

  it('research synthesis demands the highest reasoning level', () => {
    expect(getDocumentTaskRequirement('RESEARCH_SYNTHESIS').reasoningLevel).toBe('high');
  });
});
