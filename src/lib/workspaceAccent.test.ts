import { describe, it, expect } from 'vitest';
import { WORKSPACES } from './workspace';
import { WORKSPACE_ACCENTS, getWorkspaceAccent } from './workspaceAccent';

// Workspace Visual Identity — WORKSPACE_ACCENTS is the ONE place a workspace's colour is defined
// (see the module's own header); every consumer (AppShell's switcher/sidebar/bottom-nav,
// Primitives.tsx's PageHeader/ProgressBar, Repository.tsx's tag filter) reads it via
// getWorkspaceAccent rather than hard-coding a colour class itself. These tests assert on the
// actual exported config, which is exactly what every one of those consumers reads.

describe('workspace accent — colour assignment', () => {
  it('APFC uses the green family', () => {
    const accent = getWorkspaceAccent('apfc');
    expect(accent.bg).toBe('bg-green-600');
    expect(accent.text).toContain('green');
    expect(accent.shadow).toContain('green');
    expect(accent.bar).toContain('green');
    expect(accent.gradientFrom).toContain('green');
    expect(accent.gradientTo).toContain('green');
  });

  it('UPSC CSE reuses the app\'s existing default "brand" blue, not a second/new blue', () => {
    const accent = getWorkspaceAccent('upsc_cse');
    expect(accent.bg).toBe('bg-brand-600');
    expect(accent.text).toContain('brand');
    expect(accent.shadow).toContain('brand');
    expect(accent.bar).toContain('brand');
  });

  it('PhD Research uses the violet family', () => {
    const accent = getWorkspaceAccent('phd_research');
    expect(accent.bg).toBe('bg-violet-600');
    expect(accent.text).toContain('violet');
    expect(accent.shadow).toContain('violet');
    expect(accent.bar).toContain('violet');
    expect(accent.gradientFrom).toContain('violet');
    expect(accent.gradientTo).toContain('violet');
  });
});

describe('workspace accent — never confusable with a semantic colour', () => {
  it('APFC\'s workspace green is a different Tailwind colour family from the app\'s semantic "success" green (emerald) — see Primitives.tsx\'s Badge success tone', () => {
    const accent = getWorkspaceAccent('apfc');
    expect(accent.bg).not.toContain('emerald');
    expect(accent.text).not.toContain('emerald');
  });

  it('no workspace accent uses red/rose (danger) or amber (warning)', () => {
    for (const workspaceId of Object.keys(WORKSPACE_ACCENTS) as (keyof typeof WORKSPACE_ACCENTS)[]) {
      const accent = WORKSPACE_ACCENTS[workspaceId];
      for (const value of Object.values(accent)) {
        expect(value).not.toMatch(/\b(red|rose|amber)-/);
      }
    }
  });
});

describe('workspace accent — every workspace is covered, no stale/leftover accent', () => {
  it('WORKSPACE_ACCENTS has exactly one entry per registered workspace, no more, no fewer', () => {
    const registeredIds = WORKSPACES.map((w) => w.id).sort();
    const accentIds = Object.keys(WORKSPACE_ACCENTS).sort();
    expect(accentIds).toEqual(registeredIds);
  });

  it('every workspace has a distinct bg/text/shadow/bar/gradient from every other workspace — switching never keeps the previous workspace\'s accent', () => {
    const ids = WORKSPACES.map((w) => w.id);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = getWorkspaceAccent(ids[i]);
        const b = getWorkspaceAccent(ids[j]);
        expect(a.bg).not.toBe(b.bg);
        expect(a.text).not.toBe(b.text);
        expect(a.shadow).not.toBe(b.shadow);
        expect(a.bar).not.toBe(b.bar);
        expect(a.gradientFrom).not.toBe(b.gradientFrom);
        expect(a.gradientTo).not.toBe(b.gradientTo);
      }
    }
  });

  it('getWorkspaceAccent is a pure lookup — calling it repeatedly for different ids never returns a cached/stale previous result', () => {
    const green = getWorkspaceAccent('apfc');
    const blue = getWorkspaceAccent('upsc_cse');
    const violet = getWorkspaceAccent('phd_research');
    // Re-resolve 'apfc' again AFTER resolving the other two — simulates switching workspaces back
    // and forth — and confirm it's still exactly the green accent, not anything left over from the
    // most recently resolved workspace.
    const greenAgain = getWorkspaceAccent('apfc');
    expect(greenAgain).toEqual(green);
    expect(greenAgain.bg).toBe('bg-green-600');
    expect(blue.bg).toBe('bg-brand-600');
    expect(violet.bg).toBe('bg-violet-600');
  });
});
