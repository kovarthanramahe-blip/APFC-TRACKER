import { describe, it, expect } from 'vitest';
import { runClassificationEval, formatEvalReport } from './classificationEval';
import { CLASSIFICATION_FIXTURES } from './classificationFixtures';

// AI Model Evaluation & Provider Readiness — offline evaluation harness regression protection.
//
// This is NOT a generic "does the code run" test: it asserts MEASURED accuracy against a fixed
// fixture corpus stays at or above the bar actually achieved when this harness was built (see this
// feature's own report for the exact numbers and how the fixtures were corrected against real
// classifier output along the way, not picked to flatter it). A future change to
// documentTypeClassification.ts's signal phrases, classifyTextLexically's scoring, or
// apfcSyllabusTaxonomy.ts's own topic set that silently regresses accuracy on representative
// content will fail this test. The 0.85 bar (not 1.0) is deliberate headroom for a future fixture
// added here to be a genuinely hard case, not a guarantee every fixture added later scores
// perfectly on day one.
//
// Entirely offline — no AI provider, no network call, no credential. See
// providerClassificationEval.test.ts (separate file) for the explicitly opt-in, provider-gated
// counterpart this repo's testing policy requires be kept apart from this one.

describe('Offline classification evaluation harness — measured accuracy against representative fixtures', () => {
  const report = runClassificationEval();

  it('the fixture corpus actually covers every category this feature was asked to cover', () => {
    const categories = new Set(CLASSIFICATION_FIXTURES.map((f) => f.category));
    for (const required of [
      'lecture_notes',
      'transcript',
      'official_notification',
      'statute',
      'accounting',
      'labour_law',
      'pyq',
      'book_chapter',
      'research_paper',
      'ambiguous',
      'empty',
      'malformed',
    ]) {
      expect(categories.has(required as never), `missing a fixture for category "${required}"`).toBe(true);
    }
  });

  it('document-type classification accuracy stays at or above the measured baseline (>= 85%)', () => {
    expect(report.documentType.accuracy, formatEvalReport(report)).toBeGreaterThanOrEqual(0.85);
  });

  it('syllabus-topic classification accuracy (on fixtures that actually probe it) stays at or above the measured baseline (>= 85%)', () => {
    expect(report.syllabusTopic.accuracy, formatEvalReport(report)).toBeGreaterThanOrEqual(0.85);
  });

  it('every empty/whitespace-only/malformed fixture abstains ("unclassified") on document type — never a fabricated confident guess', () => {
    const abstentionFixtureIds = new Set(CLASSIFICATION_FIXTURES.filter((f) => f.category === 'empty' || f.category === 'malformed').map((f) => f.id));
    const rows = report.documentType.rows.filter((r) => abstentionFixtureIds.has(r.fixtureId));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.actualStatus, `${row.fixtureId} should abstain, not guess`).toBe('unclassified');
      expect(row.actualConfidence).toBe(0);
    }
  });

  it('every empty/whitespace-only/malformed fixture proposes ZERO syllabus topics — never a fabricated topic match on unreadable content', () => {
    const abstentionFixtureIds = new Set(CLASSIFICATION_FIXTURES.filter((f) => f.category === 'empty' || f.category === 'malformed').map((f) => f.id));
    const rows = report.syllabusTopic.rows.filter((r) => abstentionFixtureIds.has(r.fixtureId));
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.proposedTopicTitles, row.fixtureId).toEqual([]);
    }
  });

  it('the deliberately ambiguous (conflicting-signal) fixture is reported as needing review, never silently resolved to one confident guess', () => {
    const ambiguous = report.documentType.rows.find((r) => r.fixtureId === 'ambiguous-report-vs-paper');
    expect(ambiguous).toBeDefined();
    expect(ambiguous!.actualStatus).toBe('needs_review');
  });

  it('the genuinely-unrelated PhD research fixture gets zero APFC topic proposals — the classifier never forces irrelevant content onto a syllabus just because something was uploaded', () => {
    const row = report.syllabusTopic.rows.find((r) => r.fixtureId === 'phd-research-unrelated-to-apfc');
    expect(row).toBeDefined();
    expect(row!.skipped).toBe(false);
    expect(row!.proposedTopicTitles).toEqual([]);
  });

  it('a genuinely multi-topic fixture can still match one of its real topics even though the classifier also proposes others (inclusion, not exact-match)', () => {
    const row = report.syllabusTopic.rows.find((r) => r.fixtureId === 'mixed-topic-wages-and-bonus');
    expect(row).toBeDefined();
    expect(row!.correct).toBe(true);
    expect(row!.proposedTopicTitles).toContain('Minimum Wages Act, 1948');
  });
});
