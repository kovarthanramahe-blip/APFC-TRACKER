import { describe, it, expect } from 'vitest';
import { WORKSPACES, ACTIVE_WORKSPACES, DEFAULT_WORKSPACE_ID, getWorkspaceMeta } from './workspace';

describe('workspace registry', () => {
  it('WORKSPACES lists all three workspaces, including the not-yet-active PhD Research', () => {
    expect(WORKSPACES.map((w) => w.id).sort()).toEqual(['apfc', 'phd_research', 'upsc_cse'].sort());
  });

  it('ACTIVE_WORKSPACES — Stage 3A — contains exactly APFC and UPSC CSE, never PhD Research', () => {
    expect(ACTIVE_WORKSPACES.map((w) => w.id)).toEqual(['apfc', 'upsc_cse']);
    expect(ACTIVE_WORKSPACES.every((w) => w.status === 'active')).toBe(true);
    expect(ACTIVE_WORKSPACES.some((w) => w.id === 'phd_research')).toBe(false);
  });

  it('PhD Research is registered but explicitly marked comingSoon, not active', () => {
    const phd = WORKSPACES.find((w) => w.id === 'phd_research');
    expect(phd?.status).toBe('comingSoon');
  });

  it('DEFAULT_WORKSPACE_ID is apfc and is itself active', () => {
    expect(DEFAULT_WORKSPACE_ID).toBe('apfc');
    expect(ACTIVE_WORKSPACES.some((w) => w.id === DEFAULT_WORKSPACE_ID)).toBe(true);
  });

  it('getWorkspaceMeta resolves each known id to its own registry entry', () => {
    expect(getWorkspaceMeta('apfc').shortLabel).toBe('APFC');
    expect(getWorkspaceMeta('upsc_cse').shortLabel).toBe('UPSC CSE');
    expect(getWorkspaceMeta('phd_research').shortLabel).toBe('PhD');
  });

  it('every workspace has a non-empty label/shortLabel/tagline', () => {
    for (const w of WORKSPACES) {
      expect(w.label.length).toBeGreaterThan(0);
      expect(w.shortLabel.length).toBeGreaterThan(0);
      expect(w.tagline.length).toBeGreaterThan(0);
    }
  });
});
