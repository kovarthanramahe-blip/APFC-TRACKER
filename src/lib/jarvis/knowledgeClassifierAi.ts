import type { WorkspaceKind } from '../workspace';
import { uuid } from '../utils';
import { APFC_SYLLABUS_TAXONOMY_ID, type ApfcTopicTaxonomyEntry } from '../apfcSyllabusTaxonomy';
import type { KnowledgeClassification, KnowledgeItemType } from '../knowledgeClassification';
import type { JarvisAiProvider } from './ai/provider';
import { JarvisAiProviderError } from './ai/provider';
import type { JarvisAiProviderHealthStatus } from './ai/providerMetadata';
import { textMessage, type JarvisAiRequest, type JarvisAiResponse } from './ai/types';

// Knowledge Librarian (P0), Phase 2 — OPTIONAL AI-assisted classification.
//
// lib/knowledgeClassification.ts's lexical classifier already makes "classify an article against
// the syllabus" work with ZERO AI dependency — this module is a strictly additive enhancement, not
// a replacement, and nothing in the ingestion pipeline (lib/knowledgeIngestion.ts) calls it
// automatically. It exists so a future "Try AI classification" action has a real, honest
// implementation to call, built on the SAME generic JarvisAiProvider.complete() abstraction
// runtime.ts already uses — never a new provider mechanism, and never the JARVIS chat/intent-
// routing round trip (this is one direct completion call, not a conversation).
//
// Honesty discipline, matching runtime.ts's own (see that file's header): this module NEVER claims
// an AI answer unless a provider was actually supplied AND its health is genuinely 'model_ready' —
// the exact same signal runtime.ts itself gates on. Today, the ONLY provider actually composed
// anywhere in this app is the Android on-device llama.cpp bridge (see runtime.ts), which only ever
// reports 'model_ready' on a real Android device with the GGUF model loaded — so in this cloud
// development environment (no physical device), this path will always, correctly, report
// 'unavailable'. That is not a bug in this module; it is this module telling the truth about where
// it's actually running. See this feature's own report for what validating the AI path for real
// would require.
//
// Every AI-suggested topicId is validated against the REAL candidate topic set before it is ever
// wrapped into a KnowledgeClassification — an id the model invents (hallucinated, misspelled, or
// from a different taxonomy entirely) is dropped with a warning, never silently trusted.

export interface AiClassificationCandidate {
  topicId: string;
  confidence: number;
  rationale: string;
}

export type AiClassificationOutcome =
  | { status: 'ok'; candidates: AiClassificationCandidate[]; warnings: string[] }
  | { status: 'unavailable'; reason: string }
  | { status: 'error'; message: string };

const MAX_ARTICLE_CHARS_IN_PROMPT = 2000;
const MAX_CANDIDATES_RETURNED = 5;

// AI Model Evaluation & Provider Readiness phase — this module's request bound (the 2000-char
// truncation above) already existed; this is the companion TIME bound, which did not: nothing
// anywhere in this file (or runtime.ts's own non-streaming completion path) previously capped how
// long a single provider.complete() call could run, so a future real adapter that hangs — a dead
// connection, a provider-side outage that never errors, a misbehaving mock in a test — would hang
// classification indefinitely with nothing to show the user but a spinner forever. No real provider
// is wired today (see this module's own header), so this is prepared, tested infrastructure for
// when one is, not a fix for an observed failure.
export const DEFAULT_AI_CLASSIFICATION_TIMEOUT_MS = 20_000;

/**
 * Races `provider.complete()` against a local timer — deliberately NOT relying solely on the
 * provider itself honouring the AbortSignal passed through `request.signal` (a well-behaved
 * adapter will stop real work promptly when it fires, saving cost/quota, but this function's own
 * promise still resolves on time even against an adapter that ignores it entirely, since this is
 * the one guarantee every CALLER of this module needs regardless of which future provider adapter
 * is plugged in). Throws the exact same JarvisAiProviderError shape every other failure path in
 * this module already throws (`code: 'timeout'`), so a catch site never needs a special case for
 * "it was slow" vs. "it errored".
 */
async function completeWithTimeout(provider: JarvisAiProvider, request: JarvisAiRequest, timeoutMs: number): Promise<JarvisAiResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const timeoutPromise = new Promise<never>((_, reject) => {
    controller.signal.addEventListener('abort', () =>
      reject(new JarvisAiProviderError({ code: 'timeout', message: `AI provider did not respond within ${timeoutMs}ms.` })),
    );
  });
  try {
    return await Promise.race([provider.complete({ ...request, signal: controller.signal }), timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * A deterministic, pure prompt builder — directly testable without ever calling a provider. Asks
 * for STRICT JSON only (no prose, no markdown fence) so parseClassificationResponse's job is
 * narrow and the model is never asked to do more than this one structured task.
 */
export function buildClassificationPrompt(article: { title: string; text: string }, candidateTopics: readonly ApfcTopicTaxonomyEntry[]): string {
  const truncatedText = article.text.length > MAX_ARTICLE_CHARS_IN_PROMPT ? `${article.text.slice(0, MAX_ARTICLE_CHARS_IN_PROMPT)}…` : article.text;
  const topicList = candidateTopics.map((t) => `- ${t.topicId}: ${t.subjectTitle} — ${t.topicTitle}`).join('\n');
  return [
    'You are classifying ONE article against a FIXED list of syllabus topics. You must ONLY use topic ids from the list below — never invent a new one.',
    '',
    `Article title: ${article.title}`,
    'Article text:',
    truncatedText,
    '',
    'Candidate syllabus topics (id: subject — title):',
    topicList,
    '',
    'Respond with ONLY strict JSON (no markdown fence, no extra prose) in exactly this shape:',
    '{"classifications":[{"topicId":"<one of the ids above>","confidence":<0 to 1 number>,"rationale":"<short reason citing the article\'s own words>"}]}',
    'Return at most 5 classifications, only for topics the article genuinely relates to. Return {"classifications":[]} if none apply.',
  ].join('\n');
}

function extractJsonObject(rawText: string): unknown {
  try {
    return JSON.parse(rawText);
  } catch {
    // A model that wraps its JSON in a markdown fence (```json ... ```) or adds a stray sentence
    // before/after is a common, real failure mode — this is still "the model answered", just not
    // perfectly formatted, so one conservative fallback (the first {...} block) is attempted before
    // giving up. Never evals, never attempts anything beyond JSON.parse on the extracted slice.
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) return undefined;
    try {
      return JSON.parse(match[0]);
    } catch {
      return undefined;
    }
  }
}

/**
 * Validates and normalises a raw AI response into real candidates — never trusts anything by
 * default. An entry whose topicId isn't in `validTopicIds`, whose confidence isn't a finite
 * number, or whose rationale is missing/empty is either dropped (bad topicId, bad confidence) or
 * given an explicit, honest placeholder rationale (never a fabricated explanation) — see the
 * per-case comments below.
 */
export function parseClassificationResponse(rawText: string, validTopicIds: ReadonlySet<string>): { candidates: AiClassificationCandidate[]; warnings: string[] } {
  const warnings: string[] = [];
  const parsed = extractJsonObject(rawText);
  if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as Record<string, unknown>).classifications)) {
    warnings.push('The AI response was not valid structured JSON — it was ignored. No classification was created from it.');
    return { candidates: [], warnings };
  }

  const rawEntries = (parsed as { classifications: unknown[] }).classifications;
  const candidates: AiClassificationCandidate[] = [];

  for (const entry of rawEntries) {
    if (!entry || typeof entry !== 'object') {
      warnings.push('Ignored a malformed classification entry in the AI response.');
      continue;
    }
    const { topicId, confidence, rationale } = entry as Record<string, unknown>;
    if (typeof topicId !== 'string' || !validTopicIds.has(topicId)) {
      warnings.push(`The AI suggested an unrecognised topic id ("${String(topicId)}") — ignored, never added to the syllabus.`);
      continue;
    }
    if (typeof confidence !== 'number' || !Number.isFinite(confidence)) {
      warnings.push(`Ignored a classification for topic "${topicId}" with a missing or invalid confidence value.`);
      continue;
    }
    const clampedConfidence = Math.min(1, Math.max(0, confidence));
    const finalRationale = typeof rationale === 'string' && rationale.trim() ? rationale.trim() : '(no rationale provided by the model)';
    candidates.push({ topicId, confidence: clampedConfidence, rationale: finalRationale });
  }

  candidates.sort((a, b) => b.confidence - a.confidence);
  return { candidates: candidates.slice(0, MAX_CANDIDATES_RETURNED), warnings };
}

/**
 * The async entry point. `provider`/`providerHealth` are passed in explicitly by the caller
 * (rather than this module reaching into any global JARVIS bootstrap itself) so it stays
 * independently testable with a fake provider and so it never duplicates runtime.ts's own
 * readiness-detection logic — see this module's header for exactly which health value is trusted.
 */
export async function classifyArticleWithAi(
  provider: JarvisAiProvider | undefined,
  providerHealth: JarvisAiProviderHealthStatus | undefined,
  article: { title: string; text: string },
  candidateTopics: readonly ApfcTopicTaxonomyEntry[],
  timeoutMs: number = DEFAULT_AI_CLASSIFICATION_TIMEOUT_MS,
): Promise<AiClassificationOutcome> {
  if (!provider || providerHealth !== 'model_ready') {
    return {
      status: 'unavailable',
      reason: provider ? `No AI model is currently ready on this device (status: ${providerHealth ?? 'unknown'}).` : 'No AI provider is available on this platform.',
    };
  }

  try {
    const response = await completeWithTimeout(provider, { messages: [textMessage('user', buildClassificationPrompt(article, candidateTopics))] }, timeoutMs);
    const validTopicIds = new Set(candidateTopics.map((t) => t.topicId));
    const { candidates, warnings } = parseClassificationResponse(response.text, validTopicIds);
    return { status: 'ok', candidates, warnings };
  } catch (err) {
    // Never the raw err/stack — JarvisAiProviderError.message is the one place this module ever
    // surfaces provider failure text, and its own type already documents why that's required to be
    // safe-to-display (see JarvisAiError's header in ai/types.ts): never a raw provider payload, a
    // stack trace, or anything that could contain a credential. This function has no logging of
    // its own (console.* never appears anywhere in this file) — the ONLY place article text or a
    // provider response could ever reach a log is inside a future real provider adapter itself,
    // which this module has no control over and never will (adapters are out of scope here).
    if (err instanceof JarvisAiProviderError) return { status: 'error', message: err.message };
    return { status: 'error', message: 'AI classification failed unexpectedly.' };
  }
}

/** Wraps validated AI candidates as real KnowledgeClassification records — `status: 'proposed'`
 * (an AI suggestion is never auto-confirmed), `source: 'ai'`. Mirrors
 * lib/knowledgeClassification.ts's createLexicalClassifications exactly, kept in this module
 * (rather than that one) so lib/knowledgeClassification.ts itself never depends on anything under
 * lib/jarvis/ — a one-way dependency direction this app already keeps everywhere else. */
export function createAiClassifications(input: {
  workspaceId: WorkspaceKind;
  itemId: string;
  itemType: KnowledgeItemType;
  candidates: readonly AiClassificationCandidate[];
  createdAt?: string;
}): KnowledgeClassification[] {
  const now = input.createdAt ?? new Date().toISOString();
  return input.candidates.map((c) => ({
    id: uuid(),
    workspaceId: input.workspaceId,
    itemId: input.itemId,
    itemType: input.itemType,
    taxonomy: APFC_SYLLABUS_TAXONOMY_ID,
    topicId: c.topicId,
    confidence: c.confidence,
    rationale: c.rationale,
    status: 'proposed' as const,
    source: 'ai' as const,
    createdAt: now,
    updatedAt: now,
  }));
}
