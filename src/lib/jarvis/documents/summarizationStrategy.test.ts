import { describe, it, expect } from 'vitest';
import { buildHierarchicalSummarizationPlan } from './summarizationStrategy';
import type { JarvisDocumentChunk, JarvisDocumentSection } from './types';

function chunk(id: string, order: number, sectionId?: string): JarvisDocumentChunk {
  return { id, documentId: 'doc-1', sectionId, order, text: `text ${id}` };
}

describe('buildHierarchicalSummarizationPlan — large-document strategy', () => {
  it('never sends the whole document in one step: chunk summaries happen before any section/document step', () => {
    const sections: JarvisDocumentSection[] = [{ id: 'sec-1', documentId: 'doc-1', order: 0 }];
    const chunks = [chunk('c1', 0, 'sec-1'), chunk('c2', 1, 'sec-1'), chunk('c3', 2, 'sec-1')];
    const plan = buildHierarchicalSummarizationPlan('doc-1', chunks, sections);

    const chunkSteps = plan.steps.filter((s) => s.level === 'chunk');
    const sectionSteps = plan.steps.filter((s) => s.level === 'section');
    expect(chunkSteps).toHaveLength(3);
    expect(sectionSteps).toHaveLength(1);
    // Every chunk step appears before the section step that depends on it.
    const lastChunkIndex = plan.steps.findLastIndex((s) => s.level === 'chunk');
    const sectionIndex = plan.steps.findIndex((s) => s.level === 'section');
    expect(sectionIndex).toBeGreaterThan(lastChunkIndex);
  });

  it('a section summary step is bounded to just that section\'s own chunks, never the whole document', () => {
    const sections: JarvisDocumentSection[] = [
      { id: 'sec-1', documentId: 'doc-1', order: 0 },
      { id: 'sec-2', documentId: 'doc-1', order: 1 },
    ];
    const chunks = [chunk('c1', 0, 'sec-1'), chunk('c2', 1, 'sec-1'), chunk('c3', 2, 'sec-2')];
    const plan = buildHierarchicalSummarizationPlan('doc-1', chunks, sections);

    const sec1Step = plan.steps.find((s) => s.level === 'section' && s.outputId === 'sec-1');
    const sec2Step = plan.steps.find((s) => s.level === 'section' && s.outputId === 'sec-2');
    expect(sec1Step?.inputIds).toEqual(['c1', 'c2']);
    expect(sec2Step?.inputIds).toEqual(['c3']);
  });

  it('the final document step rolls up every section step output, never a raw chunk directly', () => {
    const sections: JarvisDocumentSection[] = [
      { id: 'sec-1', documentId: 'doc-1', order: 0 },
      { id: 'sec-2', documentId: 'doc-1', order: 1 },
    ];
    const chunks = [chunk('c1', 0, 'sec-1'), chunk('c2', 1, 'sec-2')];
    const plan = buildHierarchicalSummarizationPlan('doc-1', chunks, sections);

    const documentStep = plan.steps.find((s) => s.level === 'document');
    expect(documentStep?.inputIds).toEqual(['sec-1', 'sec-2']);
    expect(documentStep?.outputId).toBe('doc-1');
  });

  it('groups sectionless chunks under a synthetic group rather than dropping them from the plan', () => {
    const chunks = [chunk('c1', 0), chunk('c2', 1)];
    const plan = buildHierarchicalSummarizationPlan('doc-1', chunks, []);

    const sectionLevelSteps = plan.steps.filter((s) => s.level === 'section');
    expect(sectionLevelSteps).toHaveLength(1);
    expect(sectionLevelSteps[0].inputIds).toEqual(['c1', 'c2']);
    const documentStep = plan.steps.find((s) => s.level === 'document');
    expect(documentStep?.inputIds).toEqual(sectionLevelSteps.map((s) => s.outputId));
  });

  it('is fully deterministic — the same input always produces the same plan', () => {
    const sections: JarvisDocumentSection[] = [{ id: 'sec-1', documentId: 'doc-1', order: 0 }];
    const chunks = [chunk('c2', 1, 'sec-1'), chunk('c1', 0, 'sec-1')]; // deliberately out of order
    const planA = buildHierarchicalSummarizationPlan('doc-1', chunks, sections);
    const planB = buildHierarchicalSummarizationPlan('doc-1', chunks, sections);
    expect(planA).toEqual(planB);
    // Chunk steps still come out in the chunk's own `order`, not input array order.
    expect(planA.steps.filter((s) => s.level === 'chunk').map((s) => s.outputId)).toEqual(['c1', 'c2']);
  });

  it('produces no document-level step at all when there are no chunks', () => {
    const plan = buildHierarchicalSummarizationPlan('doc-empty', [], []);
    expect(plan.steps).toHaveLength(0);
  });
});
