// JARVIS Phase 6 — hierarchical summarisation strategy.
//
// Explicitly NOT "entire document -> model -> summary" (see this phase's own brief, Part F) —
// that doesn't scale past whatever context window the active model happens to have, and this
// architecture must stay usable on ordinary local hardware running a modest open-weight model.
// Instead: chunk summaries roll up into section summaries, which roll up into one final document
// synthesis. Each step's model input is bounded by a single section's worth of chunk summaries,
// never the whole document at once.
//
// This file is a PURE PLANNER only — it decides the ORDER OF OPERATIONS (which chunk summaries
// feed which section summary, which section summaries feed the final synthesis) and returns a
// plan a future executor would carry out by actually calling an AI provider once per step. No AI
// call, no network access, and no text-generation logic lives here — building the plan is fully
// deterministic and testable without any model at all.
import type { JarvisDocumentChunk, JarvisDocumentSection } from './types';

export type JarvisSummarizationPlanStepLevel = 'chunk' | 'section' | 'document';

export interface JarvisSummarizationPlanStep {
  level: JarvisSummarizationPlanStepLevel;
  /** The chunk ids (level: 'chunk'), or the section-level step outputIds (level: 'section'/
   * 'document') this step's summary is built FROM. */
  inputIds: readonly string[];
  /** The id this step's own output will be stored/referenced under — a chunk id (passthrough,
   * level: 'chunk'), a section id (level: 'section'), or the document id (level: 'document'). */
  outputId: string;
}

export interface JarvisSummarizationPlan {
  documentId: string;
  steps: readonly JarvisSummarizationPlanStep[];
}

/**
 * Builds the hierarchical plan for `documentId`'s chunks/sections. Steps are returned in
 * dependency order (every step's inputs are produced by an earlier step, or are a raw chunk) —
 * an executor can simply run them in array order. Chunks with no `sectionId` are grouped under a
 * single synthetic "unsectioned" group so they still roll up into the final document step rather
 * than being silently dropped — never leave a chunk out of the plan just because the source
 * format has no section structure.
 *
 * Deterministic: the same chunks/sections always produce the same plan, in the same order
 * (sections by their own `order`, chunks within a section by their own `order`).
 */
export function buildHierarchicalSummarizationPlan(
  documentId: string,
  chunks: readonly JarvisDocumentChunk[],
  sections: readonly JarvisDocumentSection[],
): JarvisSummarizationPlan {
  const steps: JarvisSummarizationPlanStep[] = [];

  const sortedChunks = [...chunks].sort((a, b) => a.order - b.order);
  for (const chunk of sortedChunks) {
    steps.push({ level: 'chunk', inputIds: [chunk.id], outputId: chunk.id });
  }

  const UNSECTIONED_GROUP_ID = `${documentId}::unsectioned`;
  const chunksBySection = new Map<string, JarvisDocumentChunk[]>();
  for (const chunk of sortedChunks) {
    const key = chunk.sectionId ?? UNSECTIONED_GROUP_ID;
    const group = chunksBySection.get(key) ?? [];
    group.push(chunk);
    chunksBySection.set(key, group);
  }

  const sortedSections = [...sections].sort((a, b) => a.order - b.order);
  const sectionOutputIds: string[] = [];
  for (const section of sortedSections) {
    const sectionChunks = chunksBySection.get(section.id) ?? [];
    if (sectionChunks.length === 0) continue;
    steps.push({ level: 'section', inputIds: sectionChunks.map((c) => c.id), outputId: section.id });
    sectionOutputIds.push(section.id);
  }

  const unsectionedChunks = chunksBySection.get(UNSECTIONED_GROUP_ID) ?? [];
  if (unsectionedChunks.length > 0) {
    steps.push({ level: 'section', inputIds: unsectionedChunks.map((c) => c.id), outputId: UNSECTIONED_GROUP_ID });
    sectionOutputIds.push(UNSECTIONED_GROUP_ID);
  }

  if (sectionOutputIds.length > 0) {
    steps.push({ level: 'document', inputIds: sectionOutputIds, outputId: documentId });
  }

  return { documentId, steps };
}
