import type { PYQ, SyllabusSubject } from '../lib/types';
import type { WorkspaceKind } from '../lib/workspace';
import { SYLLABUS } from './syllabus';
import { UPSC_CSE_SYLLABUS } from './syllabusUpscCse';
import { PYQ_BANK } from './pyq';
import { UPSC_CSE_PYQ_BANK } from './pyqUpscCse';

// Multi-Workspace OS — the workspace/data registry: resolves which of the app's static data files
// belong to a given workspace, so pages read through this instead of importing a specific
// workspace's data file directly. Every resolved array is returned exactly as its own module
// defines it — this file never mutates, reorders or filters any of them. Question-bank/
// generated-question resolvers remain out of scope until a UPSC CSE question bank actually exists
// (see the Stage 3B-2A task) — adding one now, unpopulated, would be speculative scope creep this
// project's stages have consistently avoided.
export function getSyllabusForWorkspace(workspaceId: WorkspaceKind): SyllabusSubject[] {
  switch (workspaceId) {
    case 'apfc':
      return SYLLABUS;
    case 'upsc_cse':
      return UPSC_CSE_SYLLABUS;
    case 'phd_research':
      // 'research'-kind workspaces (lib/workspace.ts) have no syllabus concept at all.
      return [];
  }
}

// Multi-Workspace OS, Stage 3B-2A — PYQ_BANK/UPSC_CSE_PYQ_BANK are both objective (Prelims-style)
// PYQ[] only; see data/pyqUpscCse.ts for why UPSC CSE's is currently empty, and
// lib/types.ts's DescriptiveExamQuestion for the separate (proposed, unpopulated) shape a
// descriptive Mains question would need instead of being forced into this one.
export function getPyqBankForWorkspace(workspaceId: WorkspaceKind): PYQ[] {
  switch (workspaceId) {
    case 'apfc':
      return PYQ_BANK;
    case 'upsc_cse':
      return UPSC_CSE_PYQ_BANK;
    case 'phd_research':
      return [];
  }
}
