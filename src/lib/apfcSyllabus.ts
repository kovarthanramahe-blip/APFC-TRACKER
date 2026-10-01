import { SYLLABUS } from '../data/syllabus';
import type { SyllabusSubject, SyllabusTopic } from './types';

// Phase 3 — Unified Knowledge <-> Syllabus Connections. APFC's own syllabus (data/syllabus.ts's
// SYLLABUS, UNCHANGED, UNMERGED with UPSC's own tree) has no resolver of its own yet — every
// existing consumer either walks SYLLABUS directly (pages/Syllabus.tsx) or looks a topic up via
// lib/pyqPerformance.ts's TOPIC_TITLES/TOPIC_SUBJECTS maps (built for PYQ performance stats, not a
// general-purpose lookup). This is the APFC equivalent of lib/upscCseSyllabus.ts's
// resolveMicrosyllabusPath: a single, general lookup any future caller needing "what subject/topic
// does this id belong to" can reuse, instead of re-deriving the same search.

/**
 * Resolves an APFC syllabus topic id (data/syllabus.ts's SyllabusTopic.id — the SAME id
 * ImportedContentMetadata.apfcTopicId and Note.topicId already reference) to its owning subject —
 * the one lookup a knowledge item's "APFC Syllabus Topic" display needs. Returns undefined (never
 * throws) for an id that doesn't resolve, matching lib/upscCseSyllabus.ts's resolveMicrosyllabusPath
 * convention exactly.
 */
export function resolveApfcTopicPath(topicId: string): { subject: SyllabusSubject; topic: SyllabusTopic } | undefined {
  for (const subject of SYLLABUS) {
    const topic = subject.topics.find((t) => t.id === topicId);
    if (topic) return { subject, topic };
  }
  return undefined;
}
