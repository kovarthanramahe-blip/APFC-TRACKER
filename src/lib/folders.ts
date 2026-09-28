// Premium Note Organisation (Phase 3B) — a workspace-scoped folder tree shared by both Notes and
// ImportedContent (a document/bibliography record/etc. references a folder the exact same way a
// note does: an optional `folderId`, resolved against this SAME collection — see lib/types.ts's
// Note and lib/contentImport.ts's ImportedContentMetadata). This module is content-agnostic on
// purpose, matching lib/importedContentRepository.ts's own "generic over contentType" precedent —
// it only ever deals with Folder objects and their own parent/child relationships; a Note or
// ImportedContent item's `folderId` is read/written by its own repository module
// (lib/importedContentRepository.ts / lib/noteOrganization.ts), never here.
//
// No recursive deletion: deleting one folder promotes its direct child folders to ITS OWN parent
// (never deletes them) — the codebase has no existing "cascade delete a whole subtree" pattern to
// reuse, so this module doesn't invent one. What happens to the NOTES/DOCUMENTS inside a deleted
// folder is a decision the caller (lib/store.ts's deleteFolder action) makes explicitly — this
// module only ever touches the Folder[] list itself.
import type { WorkspaceKind } from './workspace';
import { uuid } from './utils';

export interface Folder {
  id: string;
  workspaceId: WorkspaceKind;
  name: string;
  /** null = a root-level folder. */
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function createFolder(workspaceId: WorkspaceKind, name: string, parentId: string | null = null, now: string = new Date().toISOString()): Folder {
  return { id: uuid(), workspaceId, name: name.trim(), parentId, createdAt: now, updatedAt: now };
}

/** A no-op (returns `folders` unchanged, by reference) for a blank name or an id that isn't in the
 * list — never silently drops a folder or fabricates a name from nothing. */
export function renameFolder(folders: readonly Folder[], id: string, name: string, now: string = new Date().toISOString()): Folder[] {
  const trimmed = name.trim();
  if (!trimmed) return [...folders];
  const idx = folders.findIndex((f) => f.id === id);
  if (idx === -1) return [...folders];
  const copy = [...folders];
  copy[idx] = { ...copy[idx], name: trimmed, updatedAt: now };
  return copy;
}

/** Every folder id in `id`'s own subtree, including `id` itself — the one primitive both
 * wouldCreateCycle (below) and a caller's "does this folder have any subfolders at all" check
 * build on. */
export function getFolderSubtreeIds(folders: readonly Folder[], id: string): string[] {
  const ids = [id];
  for (const child of folders.filter((f) => f.parentId === id)) {
    ids.push(...getFolderSubtreeIds(folders, child.id));
  }
  return ids;
}

/** Whether re-parenting `id` under `candidateParentId` would create a cycle (moving a folder into
 * itself, or into one of its own descendants) — the one invariant that must hold for `parentId` to
 * stay a valid tree. `null` (root) never creates a cycle. */
export function wouldCreateCycle(folders: readonly Folder[], id: string, candidateParentId: string | null): boolean {
  if (candidateParentId === null) return false;
  return getFolderSubtreeIds(folders, id).includes(candidateParentId);
}

/** A no-op (by reference) when the move would create a cycle — moving a folder is never silently
 * corrupted into an invalid tree. */
export function moveFolder(folders: readonly Folder[], id: string, newParentId: string | null, now: string = new Date().toISOString()): Folder[] {
  if (wouldCreateCycle(folders, id, newParentId)) return [...folders];
  const idx = folders.findIndex((f) => f.id === id);
  if (idx === -1) return [...folders];
  const copy = [...folders];
  copy[idx] = { ...copy[idx], parentId: newParentId, updatedAt: now };
  return copy;
}

/** Removes exactly one folder; its direct child folders are promoted to ITS OWN parent (see this
 * module's header — never recursively deleted). A no-op if `id` isn't in the list. */
export function deleteFolderFromList(folders: readonly Folder[], id: string, now: string = new Date().toISOString()): Folder[] {
  const target = folders.find((f) => f.id === id);
  if (!target) return [...folders];
  return folders.filter((f) => f.id !== id).map((f) => (f.parentId === id ? { ...f, parentId: target.parentId, updatedAt: now } : f));
}

export interface FolderTreeNode {
  folder: Folder;
  children: FolderTreeNode[];
}

/** The folder tree for one workspace, root-first, each level alphabetically sorted
 * (case-insensitive) — the shape the sidebar's folder tree renders directly. */
export function buildFolderTree(folders: readonly Folder[], workspaceId: WorkspaceKind): FolderTreeNode[] {
  const scoped = folders.filter((f) => f.workspaceId === workspaceId);
  function build(parentId: string | null): FolderTreeNode[] {
    return scoped
      .filter((f) => f.parentId === parentId)
      .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
      .map((folder) => ({ folder, children: build(folder.id) }));
  }
  return build(null);
}

/** Flattens a folder tree (buildFolderTree's own output) into a depth-indented, ordered list — the
 * exact shape a <select>'s <option> list or a sidebar tree renders directly, without either of them
 * needing to know the tree is a tree. Used by components/organisation/FolderPicker.tsx and by any
 * page building its own folder <select> (see pages/Notes.tsx). */
export function flattenFolderTree(nodes: readonly FolderTreeNode[], depth = 0): { folder: Folder; depth: number }[] {
  return nodes.flatMap((node) => [{ folder: node.folder, depth }, ...flattenFolderTree(node.children, depth + 1)]);
}
