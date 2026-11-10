// AI Model Evaluation & Provider Readiness — offline evaluation harness.
//
// Runs CLASSIFICATION_FIXTURES through the app's own, already-shipping deterministic classifiers
// (classifyDocumentType, createLexicalClassifications against the REAL live APFC syllabus) and
// computes real, measured metrics — never fabricated or estimated numbers. No AI provider call
// anywhere in this file; every fixture here is designed to be classifiable without one, which is
// the whole point of measuring what the deterministic path alone actually achieves today.
import { classifyDocumentType } from '../documentTypeClassification';
import { createLexicalClassifications } from '../knowledgeClassification';
import { listApfcTopicsFlat } from '../apfcSyllabusTaxonomy';
import { CLASSIFICATION_FIXTURES, type ClassificationFixture } from './classificationFixtures';

export interface DocumentTypeEvalRow {
  fixtureId: string;
  expected: string;
  actual: string;
  actualStatus: string;
  actualConfidence: number;
  correct: boolean;
}

export interface SyllabusTopicEvalRow {
  fixtureId: string;
  expectedTopicTitle: string | 'NONE' | undefined;
  proposedTopicTitles: string[];
  /** Skipped (not evaluated on this axis at all) when the fixture set no expectation — see
   * ClassificationFixture.expectedApfcTopicTitle's own header for what each of the three states
   * means. `correct` is meaningless when `skipped` is true. */
  skipped: boolean;
  correct: boolean;
}

export interface ClassificationEvalReport {
  documentType: {
    rows: DocumentTypeEvalRow[];
    accuracy: number; // correct / total, 0..1
    total: number;
    correctCount: number;
  };
  syllabusTopic: {
    rows: SyllabusTopicEvalRow[];
    /** Accuracy over EVALUATED rows only (skipped rows excluded from both numerator and
     * denominator — they were never a claim about this axis to begin with). */
    accuracy: number;
    /** Number of rows actually evaluated on this axis (total fixtures minus skipped ones). */
    total: number;
    correctCount: number;
    skippedCount: number;
  };
}

function documentTypeRow(fixture: ClassificationFixture): DocumentTypeEvalRow {
  const result = classifyDocumentType(fixture.text, fixture.filename);
  const actual = result.status === 'unclassified' || result.status === 'needs_review' ? 'ABSTAIN' : result.documentType;
  const correct = fixture.expectedDocumentType === 'ABSTAIN' ? actual === 'ABSTAIN' : actual === fixture.expectedDocumentType;
  return {
    fixtureId: fixture.id,
    expected: fixture.expectedDocumentType,
    actual: result.documentType,
    actualStatus: result.status,
    actualConfidence: result.confidence,
    correct,
  };
}

function syllabusTopicRow(fixture: ClassificationFixture, topicTitleById: ReadonlyMap<string, string>): SyllabusTopicEvalRow {
  const candidates = createLexicalClassifications({
    workspaceId: 'apfc',
    itemId: fixture.id,
    itemType: 'imported_content',
    text: fixture.text,
    candidateTopics: listApfcTopicsFlat(),
  });
  const proposedTopicTitles = candidates.map((c) => topicTitleById.get(c.topicId) ?? c.topicId);

  if (fixture.expectedApfcTopicTitle === undefined) {
    return { fixtureId: fixture.id, expectedTopicTitle: undefined, proposedTopicTitles, skipped: true, correct: true };
  }
  const correct =
    fixture.expectedApfcTopicTitle === 'NONE' ? proposedTopicTitles.length === 0 : proposedTopicTitles.includes(fixture.expectedApfcTopicTitle);

  return { fixtureId: fixture.id, expectedTopicTitle: fixture.expectedApfcTopicTitle, proposedTopicTitles, skipped: false, correct };
}

/**
 * Runs every fixture in CLASSIFICATION_FIXTURES through both real classifiers and returns the
 * measured accuracy. Pure, synchronous, deterministic — the same fixtures always produce the same
 * report, so this can be asserted on directly in a test (see classificationEval.test.ts) without
 * any flakiness.
 */
export function runClassificationEval(fixtures: readonly ClassificationFixture[] = CLASSIFICATION_FIXTURES): ClassificationEvalReport {
  const topicTitleById = new Map(listApfcTopicsFlat().map((t) => [t.topicId, t.topicTitle]));

  const documentTypeRows = fixtures.map(documentTypeRow);
  const syllabusTopicRows = fixtures.map((f) => syllabusTopicRow(f, topicTitleById));

  const docCorrect = documentTypeRows.filter((r) => r.correct).length;
  const evaluatedTopicRows = syllabusTopicRows.filter((r) => !r.skipped);
  const topicCorrect = evaluatedTopicRows.filter((r) => r.correct).length;

  return {
    documentType: { rows: documentTypeRows, accuracy: docCorrect / documentTypeRows.length, total: documentTypeRows.length, correctCount: docCorrect },
    syllabusTopic: {
      rows: syllabusTopicRows,
      accuracy: topicCorrect / evaluatedTopicRows.length,
      total: evaluatedTopicRows.length,
      correctCount: topicCorrect,
      skippedCount: syllabusTopicRows.length - evaluatedTopicRows.length,
    },
  };
}

/** A short, human-readable summary — used by this harness's own report and reusable by any future
 * CLI/dev-tool wrapper that wants to print results without reimplementing the formatting. */
export function formatEvalReport(report: ClassificationEvalReport): string {
  const lines: string[] = [];
  lines.push(`Document-type classification: ${report.documentType.correctCount}/${report.documentType.total} correct (${(report.documentType.accuracy * 100).toFixed(1)}%)`);
  for (const row of report.documentType.rows) {
    if (!row.correct) lines.push(`  MISS  ${row.fixtureId}: expected ${row.expected}, got ${row.actual} (status: ${row.actualStatus}, confidence: ${row.actualConfidence.toFixed(2)})`);
  }
  lines.push(
    `Syllabus-topic classification: ${report.syllabusTopic.correctCount}/${report.syllabusTopic.total} correct (${(report.syllabusTopic.accuracy * 100).toFixed(1)}%), ${report.syllabusTopic.skippedCount} fixture(s) not evaluated on this axis`,
  );
  for (const row of report.syllabusTopic.rows) {
    if (!row.skipped && !row.correct) lines.push(`  MISS  ${row.fixtureId}: expected ${row.expectedTopicTitle}, got [${row.proposedTopicTitles.join(', ')}]`);
  }
  return lines.join('\n');
}
