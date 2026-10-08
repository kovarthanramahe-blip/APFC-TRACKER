// JARVIS Phase 8.5 — document intelligence task requirements (Part 6).
//
// Deterministic requirement PROFILES for named document-operation kinds — never a numerical
// threshold scattered inline inside routing logic. Every number below lives in
// DOCUMENT_TASK_POLICY, exported and named, so it is an explicit, inspectable, overridable policy
// value (this phase's own brief: "do not invent numerical thresholds unless they are explicitly
// represented as configurable policy values") rather than a magic constant buried in a
// conditional. These are still deliberately ROUGH, qualitative figures — not measured from a real
// model — exactly like Phase 6's own JarvisAiProviderMetadata.contextCapacityTokens convention of
// "null/unset until a real model documents one"; the difference here is these are the task'S OWN
// requirement, which this project is free to set as policy, not a claim about any specific model.
import type { JarvisModelResourceClass } from './deviceCapabilities';

export type JarvisDocumentTaskKind = 'SHORT_DOCUMENT_SUMMARY' | 'LONG_DOCUMENT_SUMMARY' | 'DOCUMENT_QA' | 'MULTI_DOCUMENT_COMPARISON' | 'RESEARCH_SYNTHESIS';

export type JarvisReasoningLevel = 'low' | 'medium' | 'high';

export interface JarvisDocumentTaskRequirement {
  kind: JarvisDocumentTaskKind;
  minContextCapacityTokens: number;
  reasoningLevel: JarvisReasoningLevel;
  requiresDocumentRetrieval: boolean;
  prefersStreaming: boolean;
  minimumLocalCapability: JarvisModelResourceClass;
}

type TaskPolicy = Omit<JarvisDocumentTaskRequirement, 'kind'>;

/** The one place every document-task threshold lives — change a task's requirement here, never at
 * a routing call site. */
export const DOCUMENT_TASK_POLICY: Readonly<Record<JarvisDocumentTaskKind, TaskPolicy>> = {
  SHORT_DOCUMENT_SUMMARY: { minContextCapacityTokens: 4_000, reasoningLevel: 'low', requiresDocumentRetrieval: true, prefersStreaming: true, minimumLocalCapability: 'small' },
  LONG_DOCUMENT_SUMMARY: { minContextCapacityTokens: 32_000, reasoningLevel: 'medium', requiresDocumentRetrieval: true, prefersStreaming: true, minimumLocalCapability: 'large' },
  DOCUMENT_QA: { minContextCapacityTokens: 8_000, reasoningLevel: 'low', requiresDocumentRetrieval: true, prefersStreaming: true, minimumLocalCapability: 'small' },
  MULTI_DOCUMENT_COMPARISON: { minContextCapacityTokens: 16_000, reasoningLevel: 'medium', requiresDocumentRetrieval: true, prefersStreaming: false, minimumLocalCapability: 'medium' },
  RESEARCH_SYNTHESIS: { minContextCapacityTokens: 24_000, reasoningLevel: 'high', requiresDocumentRetrieval: true, prefersStreaming: false, minimumLocalCapability: 'large' },
};

export function getDocumentTaskRequirement(kind: JarvisDocumentTaskKind): JarvisDocumentTaskRequirement {
  return { kind, ...DOCUMENT_TASK_POLICY[kind] };
}
