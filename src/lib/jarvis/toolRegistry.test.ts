import { describe, it, expect } from 'vitest';
import { createToolRegistry } from './toolRegistry';
import type { JarvisTool } from './types';

function makeTool(overrides: Partial<JarvisTool> = {}): JarvisTool {
  return {
    id: 'apfc.study_due_count',
    name: 'APFC Study Due Count',
    description: 'Reports how many APFC PYQs are currently due for revision.',
    workspaces: ['apfc'],
    access: 'read',
    run: async () => ({ status: 'ok', summary: 'stub', data: null }),
    ...overrides,
  };
}

describe('createToolRegistry', () => {
  it('registers a tool and retrieves it by id', () => {
    const registry = createToolRegistry();
    const tool = makeTool();

    const result = registry.register(tool);

    expect(result).toEqual({ status: 'ok' });
    expect(registry.get(tool.id)).toBe(tool);
  });

  it('rejects a duplicate tool id deterministically, without overwriting the original', () => {
    const registry = createToolRegistry();
    const first = makeTool({ name: 'First' });
    const second = makeTool({ name: 'Second' });

    expect(registry.register(first)).toEqual({ status: 'ok' });
    const duplicateResult = registry.register(second);

    expect(duplicateResult.status).toBe('error');
    expect(duplicateResult.error).toContain(first.id);
    expect(registry.get(first.id)).toBe(first);
  });

  it('returns undefined for an id that was never registered', () => {
    const registry = createToolRegistry();
    expect(registry.get('does.not.exist')).toBeUndefined();
  });

  it('lists every registered tool when no filter is given', () => {
    const registry = createToolRegistry();
    const apfcTool = makeTool({ id: 'apfc.tool', workspaces: ['apfc'] });
    const phdTool = makeTool({ id: 'phd.tool', workspaces: ['phd'] });
    registry.register(apfcTool);
    registry.register(phdTool);

    expect(registry.list()).toEqual([apfcTool, phdTool]);
  });

  it('filters list() by workspace', () => {
    const registry = createToolRegistry();
    const apfcTool = makeTool({ id: 'apfc.tool', workspaces: ['apfc'] });
    const globalTool = makeTool({ id: 'global.tool', workspaces: ['apfc', 'global'] });
    const phdTool = makeTool({ id: 'phd.tool', workspaces: ['phd'] });
    registry.register(apfcTool);
    registry.register(globalTool);
    registry.register(phdTool);

    expect(registry.list({ workspace: 'apfc' })).toEqual([apfcTool, globalTool]);
    expect(registry.list({ workspace: 'phd' })).toEqual([phdTool]);
  });

  it('filters list() by access classification', () => {
    const registry = createToolRegistry();
    const readTool = makeTool({ id: 'read.tool', access: 'read' });
    const writeTool = makeTool({ id: 'write.tool', access: 'write' });
    registry.register(readTool);
    registry.register(writeTool);

    expect(registry.list({ access: 'write' })).toEqual([writeTool]);
  });

  it('combines workspace and access filters', () => {
    const registry = createToolRegistry();
    const match = makeTool({ id: 'match', workspaces: ['upsc'], access: 'write' });
    const wrongWorkspace = makeTool({ id: 'wrong.workspace', workspaces: ['phd'], access: 'write' });
    const wrongAccess = makeTool({ id: 'wrong.access', workspaces: ['upsc'], access: 'read' });
    registry.register(match);
    registry.register(wrongWorkspace);
    registry.register(wrongAccess);

    expect(registry.list({ workspace: 'upsc', access: 'write' })).toEqual([match]);
  });

  it('keeps separate registry instances fully independent', () => {
    const registryA = createToolRegistry();
    const registryB = createToolRegistry();

    registryA.register(makeTool({ id: 'only.in.a' }));

    expect(registryA.list()).toHaveLength(1);
    expect(registryB.list()).toHaveLength(0);
  });
});
