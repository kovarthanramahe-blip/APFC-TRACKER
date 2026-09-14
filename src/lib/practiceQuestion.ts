// Unified Question Architecture, Stage 1 — a pure, type-level bridge only. PYQ (lib/types.ts)
// already satisfies PracticeQuestion structurally, and its provenance fields stay exactly where
// they are (flat on PYQ, never touched in src/data/pyq.ts); this module just derives the new
// discriminated QuestionProvenance view on demand, so a future unified question pool can treat
// "where did this question come from" the same way for authentic PYQs and (not yet built)
// source-backed generated questions. No generated questions, UI, store, or scoring code exists
// here — that is explicitly out of scope for this stage.
import type { PYQ, PyqProvenance, QuestionProvenance } from './types';

/** Derives a PYQ's provenance as the new discriminated shape. Never mutates `pyq`, and requires no
 * change to how PYQ itself stores these fields. */
export function toPyqProvenance(pyq: PYQ): PyqProvenance {
  return {
    kind: 'pyq',
    year: pyq.year,
    verificationStatus: pyq.verificationStatus,
    verificationNote: pyq.verificationNote,
    source: pyq.source,
  };
}

/** Narrows a QuestionProvenance to its 'pyq' arm. The union currently has exactly two arms, so this
 * one discriminator check is the minimum needed to distinguish either case (a provenance that
 * isn't a PYQ's is, by construction, a generated one). */
export function isPyqProvenance(provenance: QuestionProvenance): provenance is PyqProvenance {
  return provenance.kind === 'pyq';
}
