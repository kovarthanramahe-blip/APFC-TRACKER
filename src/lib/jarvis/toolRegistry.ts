import type { JarvisTool, JarvisToolAccess, JarvisWorkspace } from './types';

export interface JarvisToolRegistrationResult {
  status: 'ok' | 'error';
  /** Present only when status is 'error' — e.g. a duplicate tool id. */
  error?: string;
}

export interface JarvisToolFilter {
  workspace?: JarvisWorkspace;
  access?: JarvisToolAccess;
}

/** A minimal, framework-independent registry of JarvisTool definitions. Holds no real tools in
 * this phase — see types.ts's JarvisTool for the contract a future tool must satisfy to be
 * registered here, and lib/jarvis/index.ts for why this is exposed as a factory rather than a
 * singleton. */
export interface JarvisToolRegistry {
  /** Registers `tool`, or returns `{ status: 'error' }` if its id is already registered — never
   * throws, and never overwrites the existing registration on a duplicate id. */
  register(tool: JarvisTool): JarvisToolRegistrationResult;
  /** Looks up a tool by id. `undefined` if no such tool is registered. */
  get(id: string): JarvisTool | undefined;
  /** Lists registered tools, optionally narrowed by workspace and/or access. Order matches
   * registration order. */
  list(filter?: JarvisToolFilter): readonly JarvisTool[];
}

/**
 * Creates a new, independent JarvisToolRegistry. A factory rather than a module-level singleton:
 * this codebase's existing global-state convention (lib/store.ts's Zustand `create`) exists to
 * share live application state across the whole React tree, which nothing here needs — a tool
 * registry is configuration, assembled once by whatever future code wires real tools in, and is
 * far easier to unit test as an independent instance than as shared global state.
 */
export function createToolRegistry(): JarvisToolRegistry {
  const tools = new Map<string, JarvisTool>();

  return {
    register(tool) {
      if (tools.has(tool.id)) {
        return { status: 'error', error: `A tool with id "${tool.id}" is already registered.` };
      }
      tools.set(tool.id, tool);
      return { status: 'ok' };
    },

    get(id) {
      return tools.get(id);
    },

    list(filter) {
      let result = Array.from(tools.values());
      if (filter?.workspace !== undefined) {
        const workspace = filter.workspace;
        result = result.filter((tool) => tool.workspaces.includes(workspace));
      }
      if (filter?.access !== undefined) {
        const access = filter.access;
        result = result.filter((tool) => tool.access === access);
      }
      return result;
    },
  };
}
