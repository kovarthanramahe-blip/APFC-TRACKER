import { describe, it, expect } from 'vitest';
import { createFolder, renameFolder, moveFolder, deleteFolderFromList, buildFolderTree, flattenFolderTree, getFolderSubtreeIds, wouldCreateCycle, type Folder } from './folders';

describe('createFolder', () => {
  it('creates a root-level folder by default, trimmed, workspace-scoped, with stable timestamps', () => {
    const folder = createFolder('phd_research', '  Literature Review  ', null, '2026-01-01T00:00:00.000Z');
    expect(folder.name).toBe('Literature Review');
    expect(folder.parentId).toBeNull();
    expect(folder.workspaceId).toBe('phd_research');
    expect(folder.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(folder.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(folder.id).toBeTruthy();
  });

  it('two folders created back to back get distinct, stable ids', () => {
    const a = createFolder('apfc', 'A');
    const b = createFolder('apfc', 'B');
    expect(a.id).not.toBe(b.id);
  });

  it('creates a nested folder when a parentId is given', () => {
    const child = createFolder('apfc', 'GS1', 'parent-1');
    expect(child.parentId).toBe('parent-1');
  });
});

describe('renameFolder', () => {
  it('renames the matching folder, trimmed, and bumps updatedAt', () => {
    const folder = createFolder('apfc', 'Old Name', null, '2026-01-01T00:00:00.000Z');
    const renamed = renameFolder([folder], folder.id, '  New Name  ', '2026-02-01T00:00:00.000Z');
    expect(renamed[0].name).toBe('New Name');
    expect(renamed[0].updatedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('is a no-op for a blank name — never fabricates a name', () => {
    const folder = createFolder('apfc', 'Keep Me');
    const result = renameFolder([folder], folder.id, '   ');
    expect(result[0].name).toBe('Keep Me');
  });

  it('is a no-op for an unknown id', () => {
    const folder = createFolder('apfc', 'A');
    const result = renameFolder([folder], 'missing-id', 'New');
    expect(result).toEqual([folder]);
  });

  it('never mutates the input array', () => {
    const folder = createFolder('apfc', 'A');
    const original = [folder];
    renameFolder(original, folder.id, 'B');
    expect(original[0].name).toBe('A');
  });
});

describe('getFolderSubtreeIds / wouldCreateCycle', () => {
  function chain(): Folder[] {
    const root = createFolder('apfc', 'UPSC');
    const gs1 = createFolder('apfc', 'GS1', root.id);
    const gs1a = createFolder('apfc', 'History', gs1.id);
    return [root, gs1, gs1a];
  }

  it('getFolderSubtreeIds includes the folder itself and every descendant', () => {
    const [root, gs1, gs1a] = chain();
    const ids = getFolderSubtreeIds([root, gs1, gs1a], root.id);
    expect(ids.sort()).toEqual([root.id, gs1.id, gs1a.id].sort());
  });

  it('a leaf folder with no children has a subtree of just itself', () => {
    const [root, gs1, gs1a] = chain();
    expect(getFolderSubtreeIds([root, gs1, gs1a], gs1a.id)).toEqual([gs1a.id]);
  });

  it('wouldCreateCycle is false for moving into root', () => {
    const [root] = chain();
    expect(wouldCreateCycle([root], root.id, null)).toBe(false);
  });

  it('wouldCreateCycle is true for moving a folder into itself', () => {
    const [root] = chain();
    expect(wouldCreateCycle([root], root.id, root.id)).toBe(true);
  });

  it('wouldCreateCycle is true for moving a folder into its own descendant', () => {
    const [root, gs1, gs1a] = chain();
    expect(wouldCreateCycle([root, gs1, gs1a], root.id, gs1a.id)).toBe(true);
  });

  it('wouldCreateCycle is false for moving a folder next to an unrelated folder', () => {
    const [root, gs1, gs1a] = chain();
    const sibling = createFolder('apfc', 'PhD');
    expect(wouldCreateCycle([root, gs1, gs1a, sibling], gs1.id, sibling.id)).toBe(false);
  });
});

describe('moveFolder', () => {
  it('re-parents a folder and bumps updatedAt', () => {
    const root = createFolder('apfc', 'UPSC');
    const other = createFolder('apfc', 'Other');
    const child = createFolder('apfc', 'Child', root.id, '2026-01-01T00:00:00.000Z');
    const moved = moveFolder([root, other, child], child.id, other.id, '2026-02-01T00:00:00.000Z');
    const movedChild = moved.find((f) => f.id === child.id)!;
    expect(movedChild.parentId).toBe(other.id);
    expect(movedChild.updatedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('moving to root (null) is allowed', () => {
    const root = createFolder('apfc', 'UPSC');
    const child = createFolder('apfc', 'Child', root.id);
    const moved = moveFolder([root, child], child.id, null);
    expect(moved.find((f) => f.id === child.id)!.parentId).toBeNull();
  });

  it('refuses (no-op) a move that would create a cycle', () => {
    const root = createFolder('apfc', 'UPSC');
    const child = createFolder('apfc', 'Child', root.id);
    const moved = moveFolder([root, child], root.id, child.id);
    expect(moved.find((f) => f.id === root.id)!.parentId).toBeNull();
  });
});

describe('deleteFolderFromList', () => {
  it('removes exactly the target folder', () => {
    const root = createFolder('apfc', 'UPSC');
    const other = createFolder('apfc', 'Other');
    const result = deleteFolderFromList([root, other], root.id);
    expect(result.map((f) => f.id)).toEqual([other.id]);
  });

  it('promotes direct child folders to the deleted folder\'s own parent — never recursively deletes them', () => {
    const root = createFolder('apfc', 'UPSC');
    const child = createFolder('apfc', 'GS1', root.id);
    const grandchild = createFolder('apfc', 'History', child.id);
    const result = deleteFolderFromList([root, child, grandchild], child.id);
    expect(result).toHaveLength(2);
    expect(result.find((f) => f.id === grandchild.id)!.parentId).toBe(root.id); // promoted to child's own parent
    expect(result.find((f) => f.id === root.id)).toBeDefined();
  });

  it('a root folder\'s children are promoted to root (null) when it is deleted', () => {
    const root = createFolder('apfc', 'UPSC');
    const child = createFolder('apfc', 'GS1', root.id);
    const result = deleteFolderFromList([root, child], root.id);
    expect(result.find((f) => f.id === child.id)!.parentId).toBeNull();
  });

  it('is a no-op for an unknown id', () => {
    const root = createFolder('apfc', 'UPSC');
    const result = deleteFolderFromList([root], 'missing-id');
    expect(result).toEqual([root]);
  });
});

describe('buildFolderTree', () => {
  it('builds a root-first tree, alphabetically sorted at each level', () => {
    const root1 = createFolder('apfc', 'Zebra');
    const root2 = createFolder('apfc', 'Alpha');
    const child = createFolder('apfc', 'Child', root2.id);
    const tree = buildFolderTree([root1, root2, child], 'apfc');
    expect(tree.map((n) => n.folder.name)).toEqual(['Alpha', 'Zebra']);
    expect(tree[0].children.map((n) => n.folder.name)).toEqual(['Child']);
    expect(tree[1].children).toEqual([]);
  });

  it('never crosses workspaces', () => {
    const apfcFolder = createFolder('apfc', 'APFC Folder');
    const phdFolder = createFolder('phd_research', 'PhD Folder');
    const tree = buildFolderTree([apfcFolder, phdFolder], 'apfc');
    expect(tree.map((n) => n.folder.name)).toEqual(['APFC Folder']);
  });

  it('returns an empty tree for a workspace with no folders', () => {
    expect(buildFolderTree([], 'apfc')).toEqual([]);
  });
});

describe('flattenFolderTree', () => {
  it('flattens a nested tree into a depth-indented, ordered list', () => {
    const root = createFolder('apfc', 'UPSC');
    const child = createFolder('apfc', 'GS1', root.id);
    const grandchild = createFolder('apfc', 'History', child.id);
    const tree = buildFolderTree([root, child, grandchild], 'apfc');
    const flat = flattenFolderTree(tree);
    expect(flat.map((f) => [f.folder.name, f.depth])).toEqual([
      ['UPSC', 0],
      ['GS1', 1],
      ['History', 2],
    ]);
  });

  it('returns an empty list for an empty tree', () => {
    expect(flattenFolderTree([])).toEqual([]);
  });
});
