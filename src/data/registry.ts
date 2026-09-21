import type { SyllabusSubject } from '../lib/types';
import type { WorkspaceKind } from '../lib/workspace';
import { SYLLABUS } from './syllabus';
import { UPSC_CSE_SYLLABUS } from './syllabusUpscCse';

// Multi-Workspace OS, Stage 3B-1 — the workspace/data registry: resolves which of the app's
// static data files belong to a given workspace, so pages read through this instead of importing
// a specific workspace's data file directly. Syllabus-only for now (PYQ/question bank resolvers
// are explicitly out of scope for this stage — see the Stage 3B-1 task). Both SYLLABUS and
// UPSC_CSE_SYLLABUS are returned exactly as their own modules define them — this file never
// mutates, reorders or filters either array.
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
