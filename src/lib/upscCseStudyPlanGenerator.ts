import type { UpscCseSyllabusTree } from './upscCseSyllabus';
import type { UpscCseSyllabusCoverage } from './upscCseSyllabusCoverage';
import { getCoverageState } from './upscCseSyllabusCoverage';
import { effectiveMicrosyllabusCoverageState } from './upscCseGranularCoverage';
import { getTopicsForMicrosyllabus, getSubtopicsForTopic, getMicroTopicsForSubtopic, microsyllabusHasGranularNodes, type UpscCseGranularNode } from './upscCseGranularSyllabus';
import type { UpscCsePrelimsBatchPyq } from './upscCsePrelimsPyqBatchImport';
import type { UpscCsePrelimsPyqAttempt } from './upscCsePrelimsPyqAttempt';
import { computeUpscCsePrelimsPerformance } from './upscCsePrelimsPyqPerformance';
import { UNMAPPED_MICROSYLLABUS } from './upscCsePrelimsPyqFilters';
import type { UpscCseStudyTask, CreateUpscCseStudyTaskInput } from './upscCseStudyTask';
import type { UpscCseStudyPlanConfig } from './upscCseStudyPlanConfig';

// UPSC CSE Study Plan generator — turns a UpscCseStudyPlanConfig + REAL syllabus/coverage/
// performance data into a dated list of study task inputs (fed to the EXISTING
// lib/upscCseStudyTask.ts's createUpscCseStudyTask/addUpscCseStudyTask — no parallel task store).
// Every generated item traces to a real, existing syllabus node (a microsyllabus item, or, where
// lib/upscCseGranularSyllabus.ts's granular breakdown exists for it, one of its Topic/Subtopic/
// Micro-topic leaves) — never a fabricated topic. 'custom' plans generate NOTHING: the whole point
// of that plan type is the user deciding what to study themselves (see pages/UpscCseStudyPlan.tsx's
// "Add Custom Study Task" flow), so this function is never even called for one.

const DEFAULT_MICROSYLLABUS_MINUTES = 45;
const DEFAULT_GRANULAR_MINUTES = 20;

interface PlanCandidate {
  title: string;
  subject: string;
  microsyllabusId: string;
  granularNodeId?: string;
  estimatedMinutes: number;
  /** Higher sorts first — real weak-area signal (see below) boosts an item's priority without
   * fabricating one for items with no such signal (those simply keep the default rank of 0). */
  rank: number;
}

export interface GenerateUpscCseStudyPlanInput {
  config: UpscCseStudyPlanConfig;
  prelimsTree: UpscCseSyllabusTree;
  mainsTree: UpscCseSyllabusTree;
  granularNodes: readonly UpscCseGranularNode[];
  coverage: UpscCseSyllabusCoverage;
  pyqBank: readonly UpscCsePrelimsBatchPyq[];
  attempts: readonly UpscCsePrelimsPyqAttempt[];
  /** Tasks already in the plan — used only to avoid generating a duplicate item for a
   * microsyllabus/granular node that already has an active (pending/in_progress) task. */
  existingTasks: readonly UpscCseStudyTask[];
}

function candidateSubjectTitle(tree: UpscCseSyllabusTree, subjectId: string): string {
  return tree.subjects.find((s) => s.id === subjectId)?.title ?? 'General';
}

function collectCandidates(input: GenerateUpscCseStudyPlanInput): PlanCandidate[] {
  const { config, prelimsTree, mainsTree, granularNodes, coverage } = input;
  const alreadyPlanned = new Set(
    input.existingTasks
      .filter((t) => t.status !== 'completed')
      .flatMap((t) => [t.granularNodeId, t.granularNodeId ? undefined : t.microsyllabusId].filter((x): x is string => !!x)),
  );

  const performance = computeUpscCsePrelimsPerformance(input.pyqBank, input.attempts, prelimsTree);
  const weakMicrosyllabusIds = new Set(
    performance
      ? performance.weakMicrosyllabus.filter((m) => m.microsyllabusId !== UNMAPPED_MICROSYLLABUS && m.attempted >= 2 && m.accuracy < 50).map((m) => m.microsyllabusId)
      : [],
  );

  const trees = [prelimsTree, mainsTree];
  const candidates: PlanCandidate[] = [];

  for (const tree of trees) {
    const items = [...tree.microsyllabus].sort((a, b) => a.order - b.order);
    for (const item of items) {
      if (config.planType === 'subject_focus') {
        const subjectTitle = candidateSubjectTitle(tree, item.subjectId);
        if (subjectTitle !== config.focusSubject) continue;
      }

      const rank = weakMicrosyllabusIds.has(item.id) ? 1 : 0;

      if (microsyllabusHasGranularNodes(granularNodes, item.id)) {
        // Plan at the finest available granular level for this item.
        for (const topic of getTopicsForMicrosyllabus(granularNodes, item.id)) {
          const subtopics = getSubtopicsForTopic(granularNodes, topic.id);
          const leaves = subtopics.length > 0 ? subtopics.flatMap((st) => getMicroTopicsForSubtopic(granularNodes, st.id)) : [topic];
          const finalLeaves = leaves.length > 0 ? leaves : [topic];
          for (const leaf of finalLeaves) {
            if (getCoverageState(coverage, leaf.id) === 'strong') continue;
            if (alreadyPlanned.has(leaf.id)) continue;
            candidates.push({
              title: leaf.title,
              subject: candidateSubjectTitle(tree, item.subjectId),
              microsyllabusId: item.id,
              granularNodeId: leaf.id,
              estimatedMinutes: DEFAULT_GRANULAR_MINUTES,
              rank,
            });
          }
        }
      } else {
        if (effectiveMicrosyllabusCoverageState(item.id, coverage, granularNodes) === 'strong') continue;
        if (alreadyPlanned.has(item.id)) continue;
        candidates.push({
          title: item.title,
          subject: candidateSubjectTitle(tree, item.subjectId),
          microsyllabusId: item.id,
          estimatedMinutes: DEFAULT_MICROSYLLABUS_MINUTES,
          rank,
        });
      }
    }
  }

  // Weak-area-backed items first, otherwise stable (syllabus tree) order.
  return candidates.sort((a, b) => b.rank - a.rank);
}

function eachDate(startDate: string, targetDate: string): string[] {
  const dates: string[] = [];
  let cursor = new Date(startDate + 'T00:00:00');
  const end = new Date(targetDate + 'T00:00:00');
  while (cursor.getTime() <= end.getTime()) {
    const y = cursor.getFullYear();
    const m = String(cursor.getMonth() + 1).padStart(2, '0');
    const d = String(cursor.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }
  return dates;
}

function isStudyDay(date: string, preferredDays: readonly number[]): boolean {
  if (preferredDays.length === 0) return true;
  const weekday = new Date(date + 'T00:00:00').getDay();
  return preferredDays.includes(weekday);
}

/**
 * Deterministic: identical input always produces an identical output list (candidates are sorted
 * by real weak-area rank then stable tree order; study days are walked in calendar order) — never
 * randomised. Returns [] for a 'custom' plan (see this module's header) or once every real
 * not-yet-strong candidate has been placed, whichever comes first — never pads the plan with
 * invented content to fill the remaining days.
 */
export function generateUpscCseStudyPlan(input: GenerateUpscCseStudyPlanInput): CreateUpscCseStudyTaskInput[] {
  if (input.config.planType === 'custom') return [];

  const candidates = collectCandidates(input);
  if (candidates.length === 0) return [];

  const studyDays = eachDate(input.config.startDate, input.config.targetDate).filter((d) => isStudyDay(d, input.config.preferredDays));
  if (studyDays.length === 0) return [];

  const tasks: CreateUpscCseStudyTaskInput[] = [];
  let candidateIndex = 0;

  for (const date of studyDays) {
    let minutesBudget = input.config.minutesPerDay;
    while (candidateIndex < candidates.length && minutesBudget > 0) {
      const candidate = candidates[candidateIndex];
      if (candidate.estimatedMinutes > minutesBudget && minutesBudget < input.config.minutesPerDay) break;
      tasks.push({
        title: candidate.title,
        date,
        targetMinutes: candidate.estimatedMinutes,
        subject: candidate.subject,
        microsyllabusId: candidate.microsyllabusId,
        granularNodeId: candidate.granularNodeId,
        priority: candidate.rank > 0 ? 'high' : 'medium',
        linkedActionHref: candidate.granularNodeId
          ? `/upsc-syllabus?granularId=${encodeURIComponent(candidate.granularNodeId)}`
          : `/upsc-syllabus?microsyllabusId=${encodeURIComponent(candidate.microsyllabusId)}`,
      });
      minutesBudget -= candidate.estimatedMinutes;
      candidateIndex++;
    }
    if (candidateIndex >= candidates.length) break;
  }

  return tasks;
}
