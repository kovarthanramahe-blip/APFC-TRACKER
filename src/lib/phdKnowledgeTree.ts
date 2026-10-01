import type { ImportedContent } from './contentImport';
import { getBibliographyFields } from './bibliography';
import { getOutgoingRelationships, type ContentRelationship } from './contentRelationships';

// PhD Knowledge Library grouping (Phase 2) — a read-only PRESENTATION layer over data that
// already exists in full: bibliography records (contentType 'bibliography', each already carrying
// structured BibliographyFields.authors — see lib/bibliography.ts) and the research_document items
// already linked to them via the EXISTING ContentRelationship mechanism (a bibliography record
// "cites"/"links_to" a research_document — source = bibliography, target = document, exactly as
// pages/WorkingBibliography.tsx's own LinkedDocumentsModal already creates). No new store field, no
// new entity type, no new relationship kind: this module only re-shapes what addContentRelationship
// + the bibliography metadata already persisted, into
//
//   Author -> Source (a bibliography record) -> Chapters (its linked research_document items)
//
// — the compact drill-down this phase's product direction asks for, without turning the Repository
// into a second database hierarchy. A source with more than one author appears under EVERY one of
// its authors (same object, not duplicated data) — the same multi-bucket convention
// lib/bibliography.ts's own collectBibliographyAuthors already uses, so "group by author" behaves
// identically everywhere in this app. A source with no listed author(s) at all is grouped under
// UNATTRIBUTED_AUTHOR rather than silently dropped.

export const UNATTRIBUTED_AUTHOR = 'Unattributed';

export interface PhdSourceNode {
  /** The bibliography record itself — the "Book / Article" level. */
  source: ImportedContent;
  /** research_document items linked FROM this source (its "Chapters") — already-confirmed,
   * already-persisted ImportedContent items, never a placeholder/stub. */
  chapters: ImportedContent[];
}

export interface PhdAuthorGroup {
  author: string;
  sources: PhdSourceNode[];
}

/**
 * Builds the Author -> Source -> Chapters tree for display. `bibliographyRecords` and
 * `researchDocuments` are expected to already be workspace-scoped (exactly as
 * pages/PhdResearch.tsx's own `selectImportedContentByType` results already are) — this function
 * does no workspace filtering of its own, matching the read-only-presentation scope of this
 * module. Deterministic: authors are sorted alphabetically (case-insensitive), with
 * UNATTRIBUTED_AUTHOR always last; each author's own sources are sorted by title.
 */
export function buildPhdKnowledgeTree(
  bibliographyRecords: readonly ImportedContent[],
  researchDocuments: readonly ImportedContent[],
  relationships: readonly ContentRelationship[],
): PhdAuthorGroup[] {
  const documentById = new Map(researchDocuments.map((doc) => [doc.id, doc]));
  const sourceNodeByAuthor = new Map<string, PhdSourceNode[]>();

  for (const record of bibliographyRecords) {
    const chapters = getOutgoingRelationships(relationships, record.id, 'imported_content')
      .filter((r) => r.targetType === 'imported_content')
      .map((r) => documentById.get(r.targetId))
      .filter((doc): doc is ImportedContent => !!doc);

    const node: PhdSourceNode = { source: record, chapters };
    const authors = getBibliographyFields(record).authors ?? [];
    const buckets = authors.length > 0 ? authors : [UNATTRIBUTED_AUTHOR];
    for (const author of buckets) {
      const existing = sourceNodeByAuthor.get(author);
      if (existing) existing.push(node);
      else sourceNodeByAuthor.set(author, [node]);
    }
  }

  const sortedAuthors = [...sourceNodeByAuthor.keys()].sort((a, b) => {
    if (a === UNATTRIBUTED_AUTHOR) return b === UNATTRIBUTED_AUTHOR ? 0 : 1;
    if (b === UNATTRIBUTED_AUTHOR) return -1;
    return a.localeCompare(b, undefined, { sensitivity: 'base' });
  });

  return sortedAuthors.map((author) => ({
    author,
    sources: [...sourceNodeByAuthor.get(author)!].sort((a, b) => a.source.title.localeCompare(b.source.title, undefined, { sensitivity: 'base' })),
  }));
}
