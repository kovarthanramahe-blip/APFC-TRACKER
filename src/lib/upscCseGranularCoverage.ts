import { getCoverageState, computeCoverageSummary, type UpscCseCoverageState, type UpscCseSyllabusCoverage } from './upscCseSyllabusCoverage';
import { leafGranularIdsForMicrosyllabus, type UpscCseGranularNode } from './upscCseGranularSyllabus';

// Coverage roll-up + migration for the UPSC CSE Granular Syllabus (lib/upscCseGranularSyllabus.ts).
// The coverage STORE FIELD itself needs no schema change: lib/upscCseSyllabusCoverage.ts's
// `UpscCseSyllabusCoverage` is already a plain `Record<string, UpscCseCoverageState>` keyed by
// ANY string id, so a granular node's id (a topic/subtopic/micro-topic id) is just one more
// possible key in the exact same map a microsyllabus id already uses — no new store field, no new
// persisted shape. This module supplies the two things granularization actually needs on top of
// that: (1) a deterministic "what does this microsyllabus item's coverage effectively read as now
// that it may have granular children" rule, and (2) a one-time, idempotent migration backfill that
// preserves a user's existing microsyllabus-level coverage when granular children are introduced
// beneath it, rather than silently presenting it as freshly "not started".

/** Converts an aggregate weighted percentage (see computeCoverageSummary's own weighting:
 * not_started=0, learning=33, revised=67, strong=100) back into a single 4-state bucket for
 * display at the microsyllabus level. Deterministic thresholds mirroring the weights themselves. */
export function bucketWeightedPctToCoverageState(weightedPct: number): UpscCseCoverageState {
  if (weightedPct >= 100) return 'strong';
  if (weightedPct >= 67) return 'revised';
  if (weightedPct > 0) return 'learning';
  return 'not_started';
}

/**
 * A microsyllabus item's EFFECTIVE coverage state: rolled up from its granular leaf nodes' states
 * when it has any (via the existing computeCoverageSummary's weighted average, bucketed back to a
 * single state), or its own direct coverage entry unchanged when it has none — so every existing,
 * non-granularized microsyllabus item behaves EXACTLY as it always has. This is the ONE function
 * every consumer (UI, Today's Study, dashboard aggregation) should use instead of calling
 * getCoverageState directly on a microsyllabus id, so granular and non-granular items are never
 * treated inconsistently.
 */
export function effectiveMicrosyllabusCoverageState(
  microsyllabusId: string,
  coverage: UpscCseSyllabusCoverage,
  granularNodes: readonly UpscCseGranularNode[],
): UpscCseCoverageState {
  const leafIds = leafGranularIdsForMicrosyllabus(granularNodes, microsyllabusId);
  if (leafIds.length === 0) return getCoverageState(coverage, microsyllabusId);
  return bucketWeightedPctToCoverageState(computeCoverageSummary(leafIds, coverage).weightedPct);
}

/**
 * The one-time, deterministic, idempotent backfill: for every microsyllabus item that HAS granular
 * children AND already carries a direct coverage entry (e.g. a user marked "Constitution" strong
 * before it was ever broken down further) AND none of its granular leaves have their own entry yet
 * (a fresh granularization, not a user who has already started working through the leaves), seed
 * every one of that item's leaf ids with the SAME state. This is the exact rule that satisfies
 * "preserve existing microsyllabus coverage during migration": a user's prior signal is carried
 * forward onto the new, finer-grained leaves rather than being silently discarded or masked by a
 * fresh "not started" read (see effectiveMicrosyllabusCoverageState above, which would otherwise
 * report 'not_started' for a granularized item with an untouched direct entry and no leaf entries).
 * Never overwrites a leaf that already has its own entry — a user's actual granular-level progress
 * always wins. Idempotent: running this twice never changes the result of the first run, since the
 * leaves it seeds are never empty after the first pass.
 */
export function migrateGranularCoverageBackfill(coverage: UpscCseSyllabusCoverage, granularNodes: readonly UpscCseGranularNode[]): UpscCseSyllabusCoverage {
  const microsyllabusIdsWithGranularChildren = new Set(granularNodes.filter((n) => n.level === 'topic').map((n) => n.microsyllabusId));
  let next = coverage;
  let changed = false;
  for (const microsyllabusId of microsyllabusIdsWithGranularChildren) {
    const directState = coverage[microsyllabusId];
    if (directState === undefined) continue; // nothing to preserve
    const leafIds = leafGranularIdsForMicrosyllabus(granularNodes, microsyllabusId);
    const anyLeafAlreadySet = leafIds.some((id) => coverage[id] !== undefined);
    if (anyLeafAlreadySet) continue; // real granular-level progress already exists — never overwrite it
    if (!changed) {
      next = { ...coverage };
      changed = true;
    }
    for (const id of leafIds) next[id] = directState;
  }
  return next;
}

/** Expands a list of microsyllabus ids into the leaf coverage ids that should feed
 * computeCoverageSummary for subject/paper/stage aggregation — the roll-up mechanism itself is just
 * computeCoverageSummary (already existing, already tested) fed a properly expanded leaf-id list.
 * Re-exported here (alongside expandToLeafCoverageIds in lib/upscCseGranularSyllabus.ts) so callers
 * that only need coverage-related granular helpers can import from one place. */
export { expandToLeafCoverageIds, microsyllabusHasGranularNodes } from './upscCseGranularSyllabus';
