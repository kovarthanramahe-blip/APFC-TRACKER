import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Feedback item — the Research Plan had no edit action for a micro-target: only complete, start,
// or delete, so a mis-filed target required deleting and re-adding it. lib/store.ts already had a
// real updatePhdMicroTarget action (backed by lib/microTarget.ts's updateMicroTarget) — it was
// simply never wired into this page's UI. This repo has no @testing-library/react (or any other
// React-component-rendering) dependency, and no precedent for adding one for a single page (see
// CommandCentre.test.ts's own header) — these are structural, source-verifiable checks, the same
// approach already used for every other page-level .test.ts file in this codebase.
const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'PhdPlan.tsx'), 'utf-8');

describe('PhdPlan.tsx — micro-target editing', () => {
  it('TargetRow renders an Edit control that calls onEdit with the target id', () => {
    expect(source).toMatch(/onClick=\{\(\) => onEdit\(target\.id\)\}/);
    expect(source).toMatch(/title="Edit target"/);
  });

  it('reads the real store action updatePhdMicroTarget — never a locally-reinvented update', () => {
    expect(source).toMatch(/useAppStore\(\(s\) => s\.updatePhdMicroTarget\)/);
  });

  it('submitEditedTarget calls the store\'s updatePhdMicroTarget and then clears editingTargetId', () => {
    const fnMatch = source.match(/function submitEditedTarget\(id: string, values: CreateMicroTargetInput\) \{([\s\S]*?)\n  \}/);
    expect(fnMatch).not.toBeNull();
    const body = fnMatch![1];
    expect(body).toMatch(/updateMicroTarget\(id, values\)/);
    expect(body).toMatch(/setEditingTargetId\(null\)/);
  });

  it('TargetForm is reused for both the "add" and "edit" flows — one form, not two drifting copies', () => {
    const formDeclarations = source.match(/function TargetForm\(/g) ?? [];
    expect(formDeclarations).toHaveLength(1);
    const usages = source.match(/<TargetForm\b/g) ?? [];
    expect(usages.length).toBeGreaterThanOrEqual(3); // 1 "add" site + 2 "edit" sites (timeline/topic_area views)
  });

  it('every <TargetRow> in the list views passes onEdit={setEditingTargetId}', () => {
    const rowUsages = source.match(/<TargetRow\b[\s\S]*?\/>/g) ?? [];
    expect(rowUsages.length).toBeGreaterThan(0);
    for (const usage of rowUsages) {
      expect(usage).toMatch(/onEdit=\{setEditingTargetId\}/);
    }
  });
});

// Feedback item — several Research Plan/linked-material entries can share the exact same title
// (e.g. one book title repeated across several imported chapters), making them indistinguishable
// in a list or a <select>. The filename is what actually tells them apart.
describe('PhdPlan.tsx — disambiguating identically-titled linked material by filename', () => {
  it('the linked-material <select> shows each option\'s sourceFilename alongside its title', () => {
    expect(source).toMatch(/\{c\.provenance\.sourceFilename \? ` — \$\{c\.provenance\.sourceFilename\}` : ''\}/);
  });

  it('TargetRow renders the linked content\'s sourceFilename next to its title, not just the title alone', () => {
    expect(source).toMatch(/\{linkedContent\.sourceFilename && <span[^>]*>— \{linkedContent\.sourceFilename\}<\/span>\}/);
  });

  it('passes the whole linked content item through (title + provenance), not a bare title string that would lose the filename', () => {
    expect(source).toMatch(/linkedContent: \{ title: string; sourceFilename\?: string \} \| undefined/);
    expect(source).not.toMatch(/linkedContentTitle/);
  });
});
