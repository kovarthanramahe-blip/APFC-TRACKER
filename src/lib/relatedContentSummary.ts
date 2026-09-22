import { getRelatedContent, type ContentRelationship, type RelationshipEntityType } from './contentRelationships';
import { getImportedContentById, type ImportedContent } from './contentImport';
import type { Note } from './types';

// PhD Research — Related Content Summary. A small, purely-derived read: given an entity's id/type,
// how many Notes/research documents/bibliography records is it linked to right now? Never stored
// anywhere — always recomputed from the current contentRelationships/importedContent/notes arrays
// (see lib/contentRelationships.ts's getRelatedContent, reused rather than reimplemented here), so
// a link, an unlink, a cascade-delete, or a workspace switch is reflected immediately with no cache
// to invalidate. This module only adds the one thing getRelatedContent can't know on its own: which
// CONTENT TYPE a related imported_content entry actually is (research_document vs bibliography vs
// anything else) — getRelatedContent is deliberately content-type-agnostic, so that lookup belongs
// here, not in lib/contentRelationships.ts (see that module's own header on staying generic).

export interface RelatedContentCounts {
  notes: number;
  researchDocuments: number;
  bibliographyRecords: number;
  /** Any other ImportedContent contentType a future relationship might target (e.g. 'other',
   * 'question_bank') — kept separate so a caller can decide whether/how to surface it, rather than
   * silently folding it into one of the three counts above. */
  other: number;
  total: number;
}

/**
 * Counts every relationship touching `(entityId, entityType)`, broken down by what's on the OTHER
 * end. A related id that no longer resolves to a real note/imported-content item (which should
 * never happen — see deleteImportedContent/deleteNote's cascade in lib/store.ts — but is never
 * assumed impossible) is simply skipped, never counted and never thrown on.
 */
export function countRelatedContent(
  relationships: readonly ContentRelationship[],
  entityId: string,
  entityType: RelationshipEntityType,
  importedContent: readonly ImportedContent[],
  notes: readonly Note[],
): RelatedContentCounts {
  let noteCount = 0;
  let researchDocumentCount = 0;
  let bibliographyCount = 0;
  let otherCount = 0;

  for (const entry of getRelatedContent(relationships, entityId, entityType)) {
    if (entry.relatedType === 'note') {
      if (notes.some((n) => n.id === entry.relatedId)) noteCount++;
      continue;
    }
    const item = getImportedContentById(importedContent, entry.relatedId);
    if (!item) continue;
    if (item.contentType === 'research_document') researchDocumentCount++;
    else if (item.contentType === 'bibliography') bibliographyCount++;
    else otherCount++;
  }

  return {
    notes: noteCount,
    researchDocuments: researchDocumentCount,
    bibliographyRecords: bibliographyCount,
    other: otherCount,
    total: noteCount + researchDocumentCount + bibliographyCount + otherCount,
  };
}
