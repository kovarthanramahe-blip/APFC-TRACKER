// UPSC CSE Syllabus Foundation — Prelims and Mains as two completely separate hierarchical trees.
//
// This is a NEW, ADDITIVE data model — it does not replace, reuse, or restructure
// data/syllabus.ts's SYLLABUS (APFC's own subject/topic tracker) or lib/types.ts's
// SyllabusSubject/SyllabusTopic, and it does not touch data/syllabusUpscCse.ts's existing
// UPSC_CSE_SYLLABUS (still resolved by data/registry.ts's getSyllabusForWorkspace for the existing
// Syllabus page's checkbox-tracking UI, unchanged by this stage — see this module's own header
// note on why below). Nothing here is wired into pages/Syllabus.tsx's topic-completion tracking
// (completedTopics, toggleTopic, computeUnifiedTopicStatus): that page's data model is a flat
// subject -> topic[] shape built for a single check-off-what-you've-covered list, and force-fitting
// a four-level stage -> paper -> subject -> microsyllabus hierarchy into it would mean redesigning
// that page, which this stage's own instructions explicitly rule out. This module exists so a
// FUTURE stage (PYQ classification, a dedicated syllabus browser, etc.) has a correct, tested
// foundation to build on — belonging exclusively to the `upsc_cse` workspace by construction, the
// same convention data/pyq.ts's PYQ_BANK and data/pyqUpscCse.ts's UPSC_CSE_PYQ_BANK already use
// (no per-node workspaceId field; the tree itself is UPSC CSE-only).
//
// Hierarchy: stage -> paper -> subject -> microsyllabus item. Every level below `stage` carries a
// stable id, its own `order` (for deterministic display), and explicit foreign keys up to every
// ancestor level — not just its immediate parent — so a consumer holding only a microsyllabus item
// never needs to walk the tree to know which paper or stage it belongs to.

export type UpscCseExamStage = 'prelims' | 'mains';

export interface UpscCseSyllabusPaper {
  id: string;
  stage: UpscCseExamStage;
  title: string;
  shortTitle: string;
  /** Deterministic display order among papers within the same stage. */
  order: number;
}

export interface UpscCseSyllabusSubject {
  id: string;
  paperId: string;
  stage: UpscCseExamStage;
  title: string;
  /** Deterministic display order among subjects within the same paper. */
  order: number;
}

export interface UpscCseMicrosyllabusItem {
  id: string;
  /** The subject this item belongs to — its direct parent in the hierarchy. */
  parentId: string;
  subjectId: string;
  paperId: string;
  stage: UpscCseExamStage;
  title: string;
  /** Official UPSC syllabus wording, or — where the official text is a long unbroken clause — a
   * faithful, concise representation of that same clause. Never content invented beyond what the
   * official syllabus states; see each data file's own header for exactly which official clause
   * each item traces back to. */
  description: string;
  /** Deterministic display order among microsyllabus items within the same subject. */
  order: number;
}

export interface UpscCseSyllabusTree {
  stage: UpscCseExamStage;
  papers: UpscCseSyllabusPaper[];
  subjects: UpscCseSyllabusSubject[];
  microsyllabus: UpscCseMicrosyllabusItem[];
}

// ============================================================================================
// Registry / resolver utilities — pure, read-only. Every function here works identically for
// either tree (Prelims or Mains); callers pass the tree they want to query, never a global lookup,
// so the two stages can never be accidentally cross-resolved.
// ============================================================================================

export function getPapersForStage(tree: UpscCseSyllabusTree): UpscCseSyllabusPaper[] {
  return [...tree.papers].sort((a, b) => a.order - b.order);
}

export function getPaperById(tree: UpscCseSyllabusTree, paperId: string): UpscCseSyllabusPaper | undefined {
  return tree.papers.find((p) => p.id === paperId);
}

export function getSubjectsForPaper(tree: UpscCseSyllabusTree, paperId: string): UpscCseSyllabusSubject[] {
  return tree.subjects.filter((s) => s.paperId === paperId).sort((a, b) => a.order - b.order);
}

export function getSubjectById(tree: UpscCseSyllabusTree, subjectId: string): UpscCseSyllabusSubject | undefined {
  return tree.subjects.find((s) => s.id === subjectId);
}

export function getMicrosyllabusForSubject(tree: UpscCseSyllabusTree, subjectId: string): UpscCseMicrosyllabusItem[] {
  return tree.microsyllabus.filter((m) => m.subjectId === subjectId).sort((a, b) => a.order - b.order);
}

export function getMicrosyllabusItemById(tree: UpscCseSyllabusTree, microsyllabusId: string): UpscCseMicrosyllabusItem | undefined {
  return tree.microsyllabus.find((m) => m.id === microsyllabusId);
}

export interface UpscCseSyllabusPath {
  paper: UpscCseSyllabusPaper;
  subject: UpscCseSyllabusSubject;
  item: UpscCseMicrosyllabusItem;
}

/**
 * Resolves a microsyllabus id to its full ancestor path — the one lookup a future PYQ record
 * storing just a microsyllabus id would need to safely display "Prelims › GS Paper I › History ›
 * Modern Indian History" (or similar) without holding any other reference. Returns undefined
 * (never throws) if the id doesn't resolve within this tree, or if — despite validateUpscCseSyllabusTree
 * never allowing this in the data files themselves — a caller passes a tree with a dangling
 * reference; a resolver is not the place to assume its own input is already valid.
 */
export function resolveMicrosyllabusPath(tree: UpscCseSyllabusTree, microsyllabusId: string): UpscCseSyllabusPath | undefined {
  const item = getMicrosyllabusItemById(tree, microsyllabusId);
  if (!item) return undefined;
  const subject = getSubjectById(tree, item.subjectId);
  if (!subject) return undefined;
  const paper = getPaperById(tree, item.paperId);
  if (!paper) return undefined;
  return { paper, subject, item };
}

// ============================================================================================
// Validation — structural integrity checks, used by both the test suite and available to any
// future caller that wants to sanity-check a tree (e.g. one built from an external source later).
// ============================================================================================

export type UpscCseSyllabusIssueReason =
  | 'duplicate_paper_id'
  | 'duplicate_subject_id'
  | 'duplicate_microsyllabus_id'
  | 'subject_stage_mismatch'
  | 'subject_orphan_paper'
  | 'microsyllabus_stage_mismatch'
  | 'microsyllabus_orphan_subject'
  | 'microsyllabus_orphan_paper'
  | 'microsyllabus_parent_subject_mismatch';

export interface UpscCseSyllabusIssue {
  reason: UpscCseSyllabusIssueReason;
  message: string;
}

function findDuplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates];
}

/**
 * Every structural invariant this tree must hold: no duplicate ids at any level, every subject's
 * paperId resolves to a real paper IN THIS TREE with a matching stage, and every microsyllabus
 * item's subjectId/paperId both resolve to real nodes in this tree with matching stage and a
 * consistent parent chain (parentId === subjectId, subjectId's own paperId === the item's paperId).
 * Returns an empty array for a fully valid tree; never throws.
 */
export function validateUpscCseSyllabusTree(tree: UpscCseSyllabusTree): UpscCseSyllabusIssue[] {
  const issues: UpscCseSyllabusIssue[] = [];

  for (const id of findDuplicates(tree.papers.map((p) => p.id))) {
    issues.push({ reason: 'duplicate_paper_id', message: `Duplicate paper id "${id}".` });
  }
  for (const id of findDuplicates(tree.subjects.map((s) => s.id))) {
    issues.push({ reason: 'duplicate_subject_id', message: `Duplicate subject id "${id}".` });
  }
  for (const id of findDuplicates(tree.microsyllabus.map((m) => m.id))) {
    issues.push({ reason: 'duplicate_microsyllabus_id', message: `Duplicate microsyllabus id "${id}".` });
  }

  const paperById = new Map(tree.papers.map((p) => [p.id, p]));
  const subjectById = new Map(tree.subjects.map((s) => [s.id, s]));

  for (const subject of tree.subjects) {
    const paper = paperById.get(subject.paperId);
    if (!paper) {
      issues.push({ reason: 'subject_orphan_paper', message: `Subject "${subject.id}" references a paperId ("${subject.paperId}") that does not exist in this tree.` });
      continue;
    }
    if (paper.stage !== subject.stage) {
      issues.push({ reason: 'subject_stage_mismatch', message: `Subject "${subject.id}" has stage "${subject.stage}" but its paper "${paper.id}" has stage "${paper.stage}".` });
    }
  }

  for (const item of tree.microsyllabus) {
    const subject = subjectById.get(item.subjectId);
    if (!subject) {
      issues.push({ reason: 'microsyllabus_orphan_subject', message: `Microsyllabus item "${item.id}" references a subjectId ("${item.subjectId}") that does not exist in this tree.` });
      continue;
    }
    if (item.parentId !== item.subjectId) {
      issues.push({ reason: 'microsyllabus_parent_subject_mismatch', message: `Microsyllabus item "${item.id}" has parentId "${item.parentId}" which does not match its own subjectId "${item.subjectId}".` });
    }
    if (subject.paperId !== item.paperId) {
      issues.push({
        reason: 'microsyllabus_parent_subject_mismatch',
        message: `Microsyllabus item "${item.id}" states paperId "${item.paperId}" but its subject "${subject.id}" belongs to paper "${subject.paperId}".`,
      });
    }
    const paper = paperById.get(item.paperId);
    if (!paper) {
      issues.push({ reason: 'microsyllabus_orphan_paper', message: `Microsyllabus item "${item.id}" references a paperId ("${item.paperId}") that does not exist in this tree.` });
    } else if (paper.stage !== item.stage) {
      issues.push({ reason: 'microsyllabus_stage_mismatch', message: `Microsyllabus item "${item.id}" has stage "${item.stage}" but its paper "${paper.id}" has stage "${paper.stage}".` });
    }
  }

  return issues;
}
