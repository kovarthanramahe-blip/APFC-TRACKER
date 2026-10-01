import { UPSC_CSE_PRELIMS_SYLLABUS } from '../data/upscCsePrelimsSyllabus';
import { UPSC_CSE_MAINS_SYLLABUS } from '../data/upscCseMainsSyllabus';
import { UPSC_CSE_GRANULAR_NODES } from '../data/upscCseGranularTopics';
import { resolveMicrosyllabusPath, type UpscCseSyllabusTree } from './upscCseSyllabus';
import { resolveGranularBreadcrumb } from './upscCseGranularSyllabus';

// Moved out of pages/RepositoryDetail.tsx (Phase 3 — Unified Knowledge <-> Syllabus Connections):
// pages/Repository.tsx now also needs this same resolver (to label a "filtered by syllabus topic"
// chip when arriving from a syllabus-page link), and a page module importing another page module
// risks a circular dependency (RepositoryDetail.tsx already imports several things FROM
// Repository.tsx) — see lib/repositoryNavigation.ts's own header for why this codebase keeps
// cross-page-shared logic in lib/ instead. Logic is unchanged from its original form.

/**
 * UPSC CSE Current Affairs — resolves a stored `metadata.syllabusNodeId` to a human-readable
 * label, reusing the EXACT same resolvers and label format
 * components/repository/ImportToRepositoryModal.tsx's own buildSyllabusNodeOptions already uses to
 * build the picker — never a second syllabus dataset/search. Tries the granular tree first (a
 * granular node's own breadcrumb carries its microsyllabus id, resolved back through
 * resolveMicrosyllabusPath for the Subject/Microsyllabus titles), then falls back to treating the
 * id as a plain microsyllabus id in either real tree. Returns undefined for an id that doesn't
 * resolve in either — a stale/invalid id is simply not shown, never a fabricated label.
 */
export function resolveSyllabusNodeLabel(syllabusNodeId: string): string | undefined {
  const granularBreadcrumb = resolveGranularBreadcrumb(UPSC_CSE_GRANULAR_NODES, syllabusNodeId);
  if (granularBreadcrumb) {
    const path = resolveMicrosyllabusPath(UPSC_CSE_PRELIMS_SYLLABUS, granularBreadcrumb.microsyllabusId);
    const parts = [path?.subject.title, path?.item.title, granularBreadcrumb.topic?.title, granularBreadcrumb.subtopic?.title, granularBreadcrumb.microTopic?.title].filter(
      (p): p is string => !!p,
    );
    return `Prelims › ${parts.join(' › ')}`;
  }
  for (const [stageLabel, tree] of [
    ['Prelims', UPSC_CSE_PRELIMS_SYLLABUS],
    ['Mains', UPSC_CSE_MAINS_SYLLABUS],
  ] as [string, UpscCseSyllabusTree][]) {
    const path = resolveMicrosyllabusPath(tree, syllabusNodeId);
    if (path) return `${stageLabel} › ${path.subject.title} › ${path.item.title}`;
  }
  return undefined;
}
