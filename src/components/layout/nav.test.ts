import { describe, it, expect } from 'vitest';
import { getNavItemsForWorkspace, getMobileNavItemsForWorkspace, resolveActiveNavItem, NAV_ITEMS, MOBILE_NAV_ITEMS } from './nav';

// Multi-Workspace OS — workspace-aware navigation. Each workspace's sidebar is its OWN list (never
// the flat union) so switching workspaces can never leave a stale, irrelevant, or duplicate item
// visible — this is the exact bug this stage fixes (a generic Dashboard entry AND a working
// /phd-dashboard entry both visible while PhD Research is active).

describe('getNavItemsForWorkspace — APFC', () => {
  const items = getNavItemsForWorkspace('apfc');
  const paths = items.map((i) => i.to);

  it('includes the generic Dashboard route as its own dashboard destination', () => {
    expect(paths).toContain('/');
    expect(items.find((i) => i.to === '/')?.label).toBe('Dashboard');
  });

  it('includes existing working APFC functionality (syllabus, question bank, PYQs, mock tests, notes, repository)', () => {
    expect(paths).toEqual(
      expect.arrayContaining(['/syllabus', '/pyq', '/pyq-test', '/mock-tests', '/notes', '/repository', '/pomodoro', '/analytics', '/study-plan', '/settings']),
    );
  });

  it('never includes UPSC CSE or PhD Research routes', () => {
    expect(paths.some((p) => p.startsWith('/upsc-'))).toBe(false);
    expect(paths.some((p) => p.startsWith('/phd-'))).toBe(false);
  });
});

describe('getNavItemsForWorkspace — UPSC CSE', () => {
  const items = getNavItemsForWorkspace('upsc_cse');
  const paths = items.map((i) => i.to);

  it('its dashboard destination is /upsc-dashboard, never the generic Dashboard', () => {
    expect(paths[0]).toBe('/upsc-dashboard');
    expect(paths).not.toContain('/');
  });

  it('includes UPSC CSE syllabus and PYQ practice', () => {
    expect(paths).toEqual(expect.arrayContaining(['/upsc-syllabus', '/upsc-pyq-test']));
  });

  it('includes genuinely shared, workspace-aware functionality (Notes, Repository, Pomodoro, Settings)', () => {
    expect(paths).toEqual(expect.arrayContaining(['/notes', '/repository', '/pomodoro', '/settings']));
  });

  it('never shows APFC-specific navigation (Question Bank/PYQs/Mock Tests/Analytics/Study Plan are APFC-only pages)', () => {
    expect(paths).not.toEqual(expect.arrayContaining(['/pyq']));
    expect(paths).not.toContain('/pyq-test');
    expect(paths).not.toContain('/mock-tests');
    expect(paths).not.toContain('/analytics');
    expect(paths).not.toContain('/study-plan');
    expect(paths).not.toContain('/syllabus');
  });

  it('never shows PhD Research routes', () => {
    expect(paths.some((p) => p.startsWith('/phd-'))).toBe(false);
  });
});

describe('getNavItemsForWorkspace — PhD Research', () => {
  const items = getNavItemsForWorkspace('phd_research');
  const paths = items.map((i) => i.to);

  it('its FIRST item is the real working PhD dashboard at /phd-dashboard, never the generic Dashboard', () => {
    expect(paths[0]).toBe('/phd-dashboard');
    expect(paths).not.toContain('/');
  });

  it('has exactly one dashboard entry — no duplicate/placeholder Dashboard item alongside it', () => {
    const dashboardLike = items.filter((i) => /dashboard/i.test(i.label));
    expect(dashboardLike).toHaveLength(1);
    expect(dashboardLike[0].to).toBe('/phd-dashboard');
  });

  it('exposes Research Documents and Working Bibliography at their real existing routes', () => {
    expect(paths).toContain('/phd-research');
    expect(paths).toContain('/phd-research/bibliography');
  });

  it('exposes the shared Repository/Notes (Topic Areas and micro-targets live on /phd-dashboard itself, not a separate route)', () => {
    expect(paths).toEqual(expect.arrayContaining(['/repository', '/notes', '/pomodoro', '/settings']));
  });

  it('never shows APFC-specific syllabus/PYQs/Question Bank/Mock Tests navigation', () => {
    expect(paths).not.toContain('/syllabus');
    expect(paths).not.toContain('/pyq');
    expect(paths).not.toContain('/pyq-test');
    expect(paths).not.toContain('/mock-tests');
    expect(paths).not.toContain('/analytics');
    expect(paths).not.toContain('/study-plan');
  });

  it('never shows UPSC CSE-specific navigation', () => {
    expect(paths.some((p) => p.startsWith('/upsc-'))).toBe(false);
  });

  it("'/phd-research' is marked end:true so it never also highlights on its own bibliography sub-route", () => {
    expect(items.find((i) => i.to === '/phd-research')?.end).toBe(true);
  });
});

describe('resolveActiveNavItem — active-route highlighting', () => {
  const phdItems = getNavItemsForWorkspace('phd_research');
  const upscItems = getNavItemsForWorkspace('upsc_cse');
  const apfcItems = getNavItemsForWorkspace('apfc');

  it('PhD: /phd-dashboard resolves to the PhD Dashboard item', () => {
    expect(resolveActiveNavItem(phdItems, '/phd-dashboard')?.label).toBe('PhD Dashboard');
  });

  it('PhD: /phd-research/bibliography resolves to Working Bibliography, NOT Research Documents', () => {
    expect(resolveActiveNavItem(phdItems, '/phd-research/bibliography')?.label).toBe('Working Bibliography');
  });

  it('PhD: /phd-research (exact) resolves to Research Documents', () => {
    expect(resolveActiveNavItem(phdItems, '/phd-research')?.label).toBe('Research Documents');
  });

  it('UPSC: /upsc-dashboard resolves to the UPSC CSE Dashboard item', () => {
    expect(resolveActiveNavItem(upscItems, '/upsc-dashboard')?.label).toBe('UPSC CSE Dashboard');
  });

  it('UPSC: /upsc-syllabus resolves to UPSC CSE Syllabus', () => {
    expect(resolveActiveNavItem(upscItems, '/upsc-syllabus')?.label).toBe('UPSC CSE Syllabus');
  });

  it('UPSC: /upsc-pyq-test resolves to UPSC CSE PYQs', () => {
    expect(resolveActiveNavItem(upscItems, '/upsc-pyq-test')?.label).toBe('UPSC CSE PYQs');
  });

  it('APFC: exact "/" resolves to Dashboard, but a deeper path never falsely matches it', () => {
    expect(resolveActiveNavItem(apfcItems, '/')?.label).toBe('Dashboard');
    expect(resolveActiveNavItem(apfcItems, '/syllabus')?.label).not.toBe('Dashboard');
  });

  it('APFC: a sub-route with no dedicated nav entry (mock test runner) still resolves to its parent Mock Tests item', () => {
    expect(resolveActiveNavItem(apfcItems, '/mock-tests/run/abc')?.label).toBe('Mock Tests');
  });

  it('a path with no match in the given workspace list resolves to undefined (e.g. an APFC-only route while PhD items are given)', () => {
    expect(resolveActiveNavItem(phdItems, '/mock-tests')).toBeUndefined();
  });
});

describe('getMobileNavItemsForWorkspace — mobile bottom bar respects the active workspace', () => {
  it('APFC mobile nav is unchanged from before this stage (same 5 routes, same order)', () => {
    expect(getMobileNavItemsForWorkspace('apfc').map((i) => i.to)).toEqual(['/', '/syllabus', '/mock-tests', '/pomodoro', '/notes']);
  });

  it('UPSC CSE mobile nav starts with its own dashboard, never APFC routes', () => {
    const paths = getMobileNavItemsForWorkspace('upsc_cse').map((i) => i.to);
    expect(paths[0]).toBe('/upsc-dashboard');
    expect(paths).not.toContain('/');
    expect(paths).not.toContain('/syllabus');
    expect(paths).not.toContain('/mock-tests');
  });

  it('PhD Research mobile nav starts with /phd-dashboard, never the generic Dashboard or APFC routes', () => {
    const paths = getMobileNavItemsForWorkspace('phd_research').map((i) => i.to);
    expect(paths[0]).toBe('/phd-dashboard');
    expect(paths).not.toContain('/');
    expect(paths).not.toContain('/syllabus');
    expect(paths).not.toContain('/mock-tests');
  });

  it('the default MOBILE_NAV_ITEMS export still mirrors APFC (backward compatible)', () => {
    expect(MOBILE_NAV_ITEMS).toEqual(getMobileNavItemsForWorkspace('apfc'));
  });
});

describe('NAV_ITEMS — the deduplicated union across all three workspaces', () => {
  it('contains every distinct route from every workspace exactly once', () => {
    const allPaths = [...getNavItemsForWorkspace('apfc'), ...getNavItemsForWorkspace('upsc_cse'), ...getNavItemsForWorkspace('phd_research')].map((i) => i.to);
    const distinctPaths = new Set(allPaths);
    expect(NAV_ITEMS).toHaveLength(distinctPaths.size);
    for (const p of distinctPaths) expect(NAV_ITEMS.some((i) => i.to === p)).toBe(true);
  });

  it('a route shared by multiple workspaces (e.g. /notes, /repository) appears only once', () => {
    expect(NAV_ITEMS.filter((i) => i.to === '/notes')).toHaveLength(1);
    expect(NAV_ITEMS.filter((i) => i.to === '/repository')).toHaveLength(1);
  });
});
