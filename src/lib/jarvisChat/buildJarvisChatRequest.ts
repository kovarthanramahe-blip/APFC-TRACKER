// JARVIS Phase 14 — grounding-context builder for the dedicated JARVIS chat page.
//
// Mirrors pages/CommandCentre.tsx's own AskJarvis logic EXACTLY (same toJarvisWorkspace mapping,
// same per-workspace tool-input shape) — extracted as its own pure function so this new page and
// AskJarvis both ground a request the same way, without either duplicating logic by hand-copying
// the other's inline code and risking drift. CommandCentre.tsx itself is left untouched (its own
// Phase 11.4 tests assert its exact inline source) — this is a NEW file, not a refactor of that one.
import { toJarvisWorkspace } from '../jarvis/applicationTools';
import type { JarvisContextToolInputs } from '../jarvis/contextEngine';
import type { JarvisWorkspace } from '../jarvis/types';
import type { WorkspaceKind } from '../workspace';
import type { ApfcCommandCentreData, UpscCseCommandCentreData, PhdCommandCentreData } from '../commandCentre';

export interface JarvisChatGroundingData {
  activeWorkspaceId: WorkspaceKind;
  /** yyyy-mm-dd, local date — caller-supplied, matching every engine this ultimately reads from. */
  today: string;
  apfcData: ApfcCommandCentreData;
  upscCseData: UpscCseCommandCentreData;
  phdData: PhdCommandCentreData;
}

export interface JarvisChatRequestContext {
  workspace: JarvisWorkspace;
  toolInputs: JarvisContextToolInputs;
}

/**
 * Builds the `{ workspace, toolInputs }` a `runJarvisRequest`/`streamJarvisRequest` caller needs —
 * only the ACTIVE workspace's own tool input is ever included (exactly AskJarvis's own rule: never
 * a guess at, or a snapshot of, a workspace that isn't currently active). Pure: the same input
 * always produces the same output, no store/React dependency.
 */
export function buildJarvisChatRequestContext(data: JarvisChatGroundingData): JarvisChatRequestContext {
  const workspace = toJarvisWorkspace(data.activeWorkspaceId);

  const toolInputs: JarvisContextToolInputs = {
    'global.workspace_state': { activeWorkspaceId: data.activeWorkspaceId },
    ...(workspace === 'apfc' ? { 'apfc.study_state': { ...data.apfcData, today: data.today } } : {}),
    ...(workspace === 'upsc'
      ? {
          'upsc.study_state': { ...data.upscCseData, today: data.today },
          'upsc.current_affairs_revision': { importedContent: data.upscCseData.importedContent, revisionQueue: data.upscCseData.revisionQueue, today: data.today },
        }
      : {}),
    ...(workspace === 'phd' ? { 'phd.research_state': { ...data.phdData, today: data.today } } : {}),
  };

  return { workspace, toolInputs };
}
