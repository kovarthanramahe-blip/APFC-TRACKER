import { describe, it, expect } from 'vitest';
import { resolveSyllabusNodeLabel } from './syllabusNodeLabel';
import { UPSC_CSE_GRANULAR_NODES } from '../data/upscCseGranularTopics';
import { UPSC_CSE_PRELIMS_SYLLABUS } from '../data/upscCsePrelimsSyllabus';
import { UPSC_CSE_MAINS_SYLLABUS } from '../data/upscCseMainsSyllabus';
import { resolveMicrosyllabusPath } from './upscCseSyllabus';

// P1.1 — resolveSyllabusNodeLabel's granular-node branch previously resolved EVERY granular node's
// microsyllabus path against UPSC_CSE_PRELIMS_SYLLABUS unconditionally and always prefixed "Prelims
// ›", even for a Mains-stage node (a real, populated case since Knowledge Librarian classification
// started using this taxonomy — see lib/upscCseKnowledgeTaxonomy.ts). These tests prove the fix:
// the node's own `stage` field now picks the correct tree and label.

describe('resolveSyllabusNodeLabel — Prelims vs Mains granular nodes (P1.1 fix)', () => {
  it('a Prelims-stage granular topic node resolves with a "Prelims ›" label', () => {
    const prelimsNode = UPSC_CSE_GRANULAR_NODES.find((n) => n.level === 'topic' && n.stage === 'prelims');
    expect(prelimsNode).toBeDefined();
    const label = resolveSyllabusNodeLabel(prelimsNode!.id);
    expect(label).toBeDefined();
    expect(label!.startsWith('Prelims ›')).toBe(true);
    const path = resolveMicrosyllabusPath(UPSC_CSE_PRELIMS_SYLLABUS, prelimsNode!.microsyllabusId);
    expect(label).toContain(path!.subject.title);
    expect(label).toContain(path!.item.title);
  });

  it('a Mains-stage granular topic node resolves with a "Mains ›" label, not the pre-P1.1 hardcoded "Prelims"', () => {
    const mainsNode = UPSC_CSE_GRANULAR_NODES.find((n) => n.level === 'topic' && n.stage === 'mains');
    expect(mainsNode).toBeDefined();
    const label = resolveSyllabusNodeLabel(mainsNode!.id);
    expect(label).toBeDefined();
    expect(label!.startsWith('Mains ›')).toBe(true);
    expect(label).not.toContain('Prelims');
    const path = resolveMicrosyllabusPath(UPSC_CSE_MAINS_SYLLABUS, mainsNode!.microsyllabusId);
    expect(label).toContain(path!.subject.title);
    expect(label).toContain(path!.item.title);
  });

  it('a Mains-stage subtopic/micro-topic node also resolves correctly, carrying its full breadcrumb', () => {
    const mainsMicroTopic = UPSC_CSE_GRANULAR_NODES.find((n) => n.level === 'microtopic' && n.stage === 'mains');
    expect(mainsMicroTopic).toBeDefined();
    const label = resolveSyllabusNodeLabel(mainsMicroTopic!.id);
    expect(label).toBeDefined();
    expect(label!.startsWith('Mains ›')).toBe(true);
    expect(label).toContain(mainsMicroTopic!.title);
  });
});
