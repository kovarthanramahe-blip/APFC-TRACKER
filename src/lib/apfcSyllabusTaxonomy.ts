import { SYLLABUS } from '../data/syllabus';
import type { SyllabusSubject } from './types';

// Knowledge Librarian (P0), Phase 2 — a versioned, provenance-stamped VIEW over the EXISTING APFC
// syllabus (data/syllabus.ts's SYLLABUS, completely unchanged by this module). This is NOT a second
// syllabus, and it does not invent, rename, merge, or reorder a single subject or topic — it exists
// only so a classifier/reviewer has one honest, explicit answer to "which syllabus version was this
// classified against, and how complete is it really".
//
// Honesty requirement this module exists to satisfy: SYLLABUS is this repository's OWN encoding of
// the official UPSC EPFO APFC Recruitment Test syllabus (see data/syllabus.ts's own header — it
// already notes one deliberate restructuring, splitting "Indian Polity and Economy" into two
// subjects). It is a reasonable, real, usable syllabus tree, but this module makes no claim that it
// is byte-for-byte identical to the official syllabus document — bump APFC_SYLLABUS_TAXONOMY_VERSION
// (and update the provenance note) only when SYLLABUS's own topic set actually changes, never to
// claim a completeness this repository cannot verify.

export const APFC_SYLLABUS_TAXONOMY_ID = 'apfc' as const;

/** Bump only when data/syllabus.ts's SYLLABUS topic set changes in a way that could invalidate an
 * EXISTING KnowledgeClassification's topicId (a topic renamed/removed/merged) — never for a purely
 * additive change (a new subject/topic added at the end never invalidates an existing reference). */
export const APFC_SYLLABUS_TAXONOMY_VERSION = 1;

/** A short, honest provenance note — shown anywhere a classification's taxonomy needs to be
 * explained to the user, so "APFC syllabus" never silently reads as "the complete official
 * syllabus, verified" when it is really "this repository's own existing encoding of it". */
export const APFC_SYLLABUS_TAXONOMY_PROVENANCE =
  'APFC Recruitment Test syllabus topics as already encoded in this app (data/syllabus.ts) — the same tree the Syllabus Tracker page uses, not independently re-verified against the official syllabus document by this feature.';

export interface ApfcTopicTaxonomyEntry {
  subjectId: string;
  subjectTitle: string;
  topicId: string;
  topicTitle: string;
}

/**
 * Every APFC syllabus topic, flattened to one entry per topic with its owning subject attached —
 * the single list a classifier (lexical or AI-assisted) scores candidates against, and a manual
 * "Add classification" picker renders. Built fresh from SYLLABUS every call (cheap — this tree is
 * small and static within a session); never cached in a way that could drift from SYLLABUS itself.
 */
export function listApfcTopicsFlat(subjects: readonly SyllabusSubject[] = SYLLABUS): ApfcTopicTaxonomyEntry[] {
  const entries: ApfcTopicTaxonomyEntry[] = [];
  for (const subject of subjects) {
    for (const topic of subject.topics) {
      entries.push({ subjectId: subject.id, subjectTitle: subject.title, topicId: topic.id, topicTitle: topic.title });
    }
  }
  return entries;
}

/** Whether `topicId` genuinely exists in the current APFC syllabus taxonomy — the one guard every
 * classifier (lexical or AI-assisted) and every manual-classification UI action must pass a
 * candidate topic id through before it is ever persisted as a KnowledgeClassification. Never
 * trusts a topic id merely because an AI response or a stale reference claims it. */
export function isValidApfcTopicId(topicId: string, subjects: readonly SyllabusSubject[] = SYLLABUS): boolean {
  return subjects.some((subject) => subject.topics.some((topic) => topic.id === topicId));
}
