// JARVIS Phase 14 — resolves the SAME live-vs-archived grounding data pages/CommandCentre.tsx
// already resolves for generateUpNextItems (live fields for the active workspace, that
// workspace's own archived inactiveWorkspaceOwnedData slice for the other two — lib/store.ts's
// existing workspace-swap architecture, read-only here, never mutated). A new hook rather than a
// refactor of CommandCentre.tsx itself — that page's own Phase 11.4 tests assert its exact inline
// source, so it is left untouched; this duplicates only the STORE-READING glue (unavoidably
// page-specific), never the tool-input-building logic itself (that part is already shared, via
// buildJarvisChatRequest.ts).
import { useMemo } from 'react';
import { useAppStore } from '../store';
import { getLocalDateString } from '../utils';
import type { ApfcCommandCentreData, UpscCseCommandCentreData, PhdCommandCentreData } from '../commandCentre';

const EMPTY_APFC_DATA: ApfcCommandCentreData = { completedTopics: {}, pyqAttempts: [], bookmarkedPyqIds: [], revisionQueue: {} };
const EMPTY_UPSC_CSE_DATA: UpscCseCommandCentreData = { coverage: {}, attempts: [], bookmarkedPyqIds: [], revisionQueue: {}, importedContent: [] };
const EMPTY_PHD_DATA: PhdCommandCentreData = { researchStartDate: '', topicAreas: [], microTargets: [], importedContent: [], notesCount: 0 };

export function useActiveWorkspaceGroundingData() {
  const activeWorkspaceId = useAppStore((s) => s.activeWorkspaceId);
  const inactiveWorkspaceOwnedData = useAppStore((s) => s.inactiveWorkspaceOwnedData);
  const completedTopics = useAppStore((s) => s.completedTopics);
  const pyqAttempts = useAppStore((s) => s.pyqAttempts);
  const bookmarkedPyqIds = useAppStore((s) => s.bookmarkedPyqIds);
  const revisionQueue = useAppStore((s) => s.revisionQueue);
  const upscCseSyllabusCoverage = useAppStore((s) => s.upscCseSyllabusCoverage);
  const upscCsePrelimsPyqAttempts = useAppStore((s) => s.upscCsePrelimsPyqAttempts);
  const importedContent = useAppStore((s) => s.importedContent);
  const phdResearchStartDate = useAppStore((s) => s.phdResearchStartDate);
  const phdTopicAreas = useAppStore((s) => s.phdTopicAreas);
  const phdMicroTargets = useAppStore((s) => s.phdMicroTargets);
  const notes = useAppStore((s) => s.notes);

  const today = useMemo(() => getLocalDateString(), []);

  const apfcData: ApfcCommandCentreData = useMemo(() => {
    if (activeWorkspaceId === 'apfc') return { completedTopics, pyqAttempts, bookmarkedPyqIds, revisionQueue };
    const archived = inactiveWorkspaceOwnedData.apfc;
    return archived
      ? { completedTopics: archived.completedTopics, pyqAttempts: archived.pyqAttempts, bookmarkedPyqIds: archived.bookmarkedPyqIds, revisionQueue: archived.revisionQueue }
      : EMPTY_APFC_DATA;
  }, [activeWorkspaceId, completedTopics, pyqAttempts, bookmarkedPyqIds, revisionQueue, inactiveWorkspaceOwnedData.apfc]);

  const upscCseData: UpscCseCommandCentreData = useMemo(() => {
    if (activeWorkspaceId === 'upsc_cse') {
      return { coverage: upscCseSyllabusCoverage, attempts: upscCsePrelimsPyqAttempts, bookmarkedPyqIds, revisionQueue, importedContent };
    }
    const archived = inactiveWorkspaceOwnedData.upsc_cse;
    return archived
      ? {
          coverage: archived.upscCseSyllabusCoverage,
          attempts: archived.upscCsePrelimsPyqAttempts,
          bookmarkedPyqIds: archived.bookmarkedPyqIds,
          revisionQueue: archived.revisionQueue,
          importedContent: archived.importedContent,
        }
      : EMPTY_UPSC_CSE_DATA;
  }, [activeWorkspaceId, upscCseSyllabusCoverage, upscCsePrelimsPyqAttempts, bookmarkedPyqIds, revisionQueue, importedContent, inactiveWorkspaceOwnedData.upsc_cse]);

  const phdData: PhdCommandCentreData = useMemo(() => {
    if (activeWorkspaceId === 'phd_research') {
      return { researchStartDate: phdResearchStartDate, topicAreas: phdTopicAreas, microTargets: phdMicroTargets, importedContent, notesCount: notes.length };
    }
    const archived = inactiveWorkspaceOwnedData.phd_research;
    return archived
      ? {
          researchStartDate: archived.phdResearchStartDate,
          topicAreas: archived.phdTopicAreas,
          microTargets: archived.phdMicroTargets,
          importedContent: archived.importedContent,
          notesCount: archived.notes.length,
        }
      : EMPTY_PHD_DATA;
  }, [activeWorkspaceId, phdResearchStartDate, phdTopicAreas, phdMicroTargets, importedContent, notes.length, inactiveWorkspaceOwnedData.phd_research]);

  return { activeWorkspaceId, today, apfcData, upscCseData, phdData };
}
