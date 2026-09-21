import { describe, it, expect } from 'vitest';
import { WORKSPACES, ACTIVE_WORKSPACES, DEFAULT_WORKSPACE_ID, getWorkspaceMeta } from './workspace';

describe('workspace registry', () => {
  it('WORKSPACES lists all three workspaces', () => {
    expect(WORKSPACES.map((w) => w.id).sort()).toEqual(['apfc', 'phd_research', 'upsc_cse'].sort());
  });

  it('ACTIVE_WORKSPACES contains all three workspaces, now that PhD Research has its own page', () => {
    expect(ACTIVE_WORKSPACES.map((w) => w.id).sort()).toEqual(['apfc', 'phd_research', 'upsc_cse'].sort());
    expect(ACTIVE_WORKSPACES.every((w) => w.status === 'active')).toBe(true);
  });

  it('PhD Research is registered and marked active', () => {
    const phd = WORKSPACES.find((w) => w.id === 'phd_research');
    expect(phd?.status).toBe('active');
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
