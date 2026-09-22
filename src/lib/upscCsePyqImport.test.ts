import { describe, it, expect } from 'vitest';
import {
  parseUpscCsePrelimsSource,
  validateQuestionText,
  validateOptions,
  validateCorrectOption,
  validateYear,
  validateQuestionNumber,
  validateUpscCsePrelimsCandidate,
  buildUpscCsePrelimsImportPreview,
  type ParsedUpscCsePrelimsCandidate,
} from './upscCsePyqImport';
import { PYQ_BANK } from '../data/pyq';
import { UPSC_CSE_PYQ_BANK } from '../data/pyqUpscCse';

function candidate(overrides: Partial<ParsedUpscCsePrelimsCandidate> = {}): ParsedUpscCsePrelimsCandidate {
  return {
    questionNumber: overrides.questionNumber ?? 1,
    question: overrides.question ?? 'What is the capital of India?',
    options: overrides.options ?? [
      { id: 'A', text: 'Mumbai' },
      { id: 'B', text: 'New Delhi' },
      { id: 'C', text: 'Kolkata' },
      { id: 'D', text: 'Chennai' },
    ],
    correctOptionId: overrides.correctOptionId,
    subject: overrides.subject,
    topic: overrides.topic,
    unrecognizedLines: overrides.unrecognizedLines ?? [],
  };
}

const FULL_SOURCE = `Year: 2023
Paper: General Studies Paper I

Q1. What is the capital of India?
A) Mumbai
B) New Delhi
C) Kolkata
D) Chennai
Answer: B
Subject: Polity
Topic: Government Structure

Q2. Which river is known as the Ganga of the South?
A) Godavari
B) Krishna
C) Cauvery
D) Narmada
Answer: A
`;

describe('parseUpscCsePrelimsSource — valid structured PYQ', () => {
  it('parses a well-formed source into structured candidates with year, paper, and every field', () => {
    const result = parseUpscCsePrelimsSource(FULL_SOURCE);
    expect(result.structured).toBe(true);
    expect(result.year).toBe(2023);
    expect(result.paper).toBe('General Studies Paper I');
    expect(result.candidates).toHaveLength(2);

    const q1 = result.candidates[0];
    expect(q1.questionNumber).toBe(1);
    expect(q1.question).toBe('What is the capital of India?');
    expect(q1.options).toEqual([
      { id: 'A', text: 'Mumbai' },
      { id: 'B', text: 'New Delhi' },
      { id: 'C', text: 'Kolkata' },
      { id: 'D', text: 'Chennai' },
    ]);
    expect(q1.correctOptionId).toBe('B');
    expect(q1.subject).toBe('Polity');
    expect(q1.topic).toBe('Government Structure');
    expect(q1.unrecognizedLines).toEqual([]);
  });

  it('a question with no Subject/Topic/Answer lines still parses correctly, those fields simply absent', () => {
    const result = parseUpscCsePrelimsSource('Q1. Bare question?\nA) One\nB) Two\n');
    expect(result.structured).toBe(true);
    expect(result.candidates[0].correctOptionId).toBeUndefined();
    expect(result.candidates[0].subject).toBeUndefined();
    expect(result.candidates[0].topic).toBeUndefined();
  });

  it('a question whose text wraps onto a second line before the options is joined correctly', () => {
    const result = parseUpscCsePrelimsSource('Q1. This question text\nwraps onto a second line.\nA) One\nB) Two\n');
    expect(result.candidates[0].question).toBe('This question text wraps onto a second line.');
  });
});

describe('parseUpscCsePrelimsSource — malformed question / unrecognized content', () => {
  it('a line after the options that matches none of the known patterns is recorded as unrecognized, never silently absorbed', () => {
    const result = parseUpscCsePrelimsSource('Q1. Question?\nA) One\nB) Two\nSome stray unrelated line\n');
    expect(result.candidates[0].unrecognizedLines).toEqual(['Some stray unrelated line']);
  });
});

describe('validateOptions — invalid option', () => {
  it('rejects fewer than 2 options', () => {
    const issues = validateOptions([{ id: 'A', text: 'Only one' }]);
    expect(issues.some((i) => i.reason === 'too_few_options')).toBe(true);
  });

  it('rejects an option with empty text', () => {
    const issues = validateOptions([
      { id: 'A', text: 'Real' },
      { id: 'B', text: '   ' },
    ]);
    expect(issues.some((i) => i.reason === 'empty_option_text')).toBe(true);
  });

  it('rejects duplicate option ids', () => {
    const issues = validateOptions([
      { id: 'A', text: 'First' },
      { id: 'A', text: 'Second' },
    ]);
    expect(issues.some((i) => i.reason === 'duplicate_option_id')).toBe(true);
  });

  it('accepts a well-formed option list with no issues', () => {
    const issues = validateOptions([
      { id: 'A', text: 'One' },
      { id: 'B', text: 'Two' },
    ]);
    expect(issues).toEqual([]);
  });
});

describe('validateQuestionText — malformed question', () => {
  it('rejects empty/whitespace-only question text', () => {
    expect(validateQuestionText('')).toBeDefined();
    expect(validateQuestionText('   ')).toBeDefined();
  });

  it('accepts real question text', () => {
    expect(validateQuestionText('A real question?')).toBeUndefined();
  });
});

describe('validateCorrectOption — missing correct answer is VALID, an invalid one is not', () => {
  const options = [
    { id: 'A', text: 'One' },
    { id: 'B', text: 'Two' },
  ];

  it('an absent correctOptionId is never flagged as an error — see answer-key safety', () => {
    expect(validateCorrectOption(options, undefined)).toBeUndefined();
  });

  it('a correctOptionId that does not match any option is rejected', () => {
    const issue = validateCorrectOption(options, 'Z');
    expect(issue?.reason).toBe('correct_option_not_in_options');
  });

  it('a correctOptionId matching a real option passes', () => {
    expect(validateCorrectOption(options, 'B')).toBeUndefined();
  });
});

describe('validateYear', () => {
  it('accepts an absent year (never required)', () => {
    expect(validateYear(undefined)).toBeUndefined();
  });

  it('accepts a plausible UPSC CSE Prelims year', () => {
    expect(validateYear(2020)).toBeUndefined();
  });

  it('rejects a year before UPSC CSE Prelims existed', () => {
    expect(validateYear(1950)?.reason).toBe('invalid_year');
  });

  it('rejects a year in the future', () => {
    expect(validateYear(new Date().getFullYear() + 5)?.reason).toBe('invalid_year');
  });
});

describe('validateQuestionNumber', () => {
  it('accepts an absent question number', () => {
    expect(validateQuestionNumber(undefined)).toBeUndefined();
  });

  it('rejects zero or negative question numbers', () => {
    expect(validateQuestionNumber(0)?.reason).toBe('invalid_question_number');
    expect(validateQuestionNumber(-1)?.reason).toBe('invalid_question_number');
  });

  it('accepts a positive integer', () => {
    expect(validateQuestionNumber(1)).toBeUndefined();
  });
});

describe('buildUpscCsePrelimsImportPreview — absent answer key (whole file)', () => {
  it('a source with no Answer lines at all produces hasAnswerKey: false and every accepted question has no correctOptionId', () => {
    const source = 'Q1. Question one?\nA) One\nB) Two\n\nQ2. Question two?\nA) Three\nB) Four\n';
    const preview = buildUpscCsePrelimsImportPreview(source, 'no-answers.txt');
    expect(preview.hasAnswerKey).toBe(false);
    expect(preview.accepted).toHaveLength(2);
    expect(preview.accepted.every((q) => q.correctOptionId === undefined)).toBe(true);
  });
});

describe('buildUpscCsePrelimsImportPreview — verified answer key present', () => {
  it('a source with Answer lines produces hasAnswerKey: true and the correct correctOptionId on each question', () => {
    const preview = buildUpscCsePrelimsImportPreview(FULL_SOURCE, 'source.txt');
    expect(preview.hasAnswerKey).toBe(true);
    expect(preview.accepted[0].correctOptionId).toBe('B');
    expect(preview.accepted[1].correctOptionId).toBe('A');
  });

  it('an answer key is never marked as more authoritative than "provisional" just because it parsed correctly', () => {
    const preview = buildUpscCsePrelimsImportPreview(FULL_SOURCE, 'source.txt');
    expect(preview.accepted.every((q) => q.verificationStatus === 'provisional')).toBe(true);
  });
});

describe('buildUpscCsePrelimsImportPreview — duplicate question', () => {
  it('a repeated question text is rejected on its second occurrence', () => {
    const source = 'Q1. Same question?\nA) One\nB) Two\n\nQ2. Same question?\nA) Three\nB) Four\n';
    const preview = buildUpscCsePrelimsImportPreview(source, 'dup.txt');
    expect(preview.accepted).toHaveLength(1);
    expect(preview.rejected).toHaveLength(1);
    expect(preview.rejected[0].issues.some((i) => i.reason === 'duplicate_question')).toBe(true);
  });

  it('a repeated question NUMBER is rejected, preventing a derived-id collision', () => {
    const source = 'Year: 2020\nPaper: GS Paper I\n\nQ1. First question?\nA) One\nB) Two\n\nQ1. Different text, same number?\nA) Three\nB) Four\n';
    const preview = buildUpscCsePrelimsImportPreview(source, 'dup-number.txt');
    expect(preview.accepted).toHaveLength(1);
    expect(preview.rejected).toHaveLength(1);
    expect(preview.rejected[0].issues.some((i) => i.reason === 'duplicate_question')).toBe(true);
  });
});

describe('buildUpscCsePrelimsImportPreview — provenance', () => {
  it('every accepted question carries the sourceFilename and importedAt it was built with', () => {
    const preview = buildUpscCsePrelimsImportPreview(FULL_SOURCE, 'gs1-2023.md', '2026-01-01T00:00:00.000Z');
    expect(preview.sourceFilename).toBe('gs1-2023.md');
    expect(preview.accepted.every((q) => q.provenance.sourceFilename === 'gs1-2023.md')).toBe(true);
    expect(preview.accepted.every((q) => q.provenance.importedAt === '2026-01-01T00:00:00.000Z')).toBe(true);
  });

  it('a missing sourceFilename (e.g. pasted text) is preserved as undefined, never fabricated as a fake filename', () => {
    const preview = buildUpscCsePrelimsImportPreview(FULL_SOURCE, undefined, '2026-01-01T00:00:00.000Z');
    expect(preview.sourceFilename).toBeUndefined();
    expect(preview.accepted[0].provenance.sourceFilename).toBeUndefined();
  });
});

describe('buildUpscCsePrelimsImportPreview — unsupported/unstructured source', () => {
  it('a source with no "Qn." markers at all is reported as unstructured, with a reason, never force-converted', () => {
    const preview = buildUpscCsePrelimsImportPreview('This is just some prose about the UPSC exam, not a question list.', 'notes.txt');
    expect(preview.structured).toBe(false);
    expect(preview.unstructuredReason).toBeTruthy();
    expect(preview.accepted).toEqual([]);
    expect(preview.rejected).toEqual([]);
  });

  it('an empty file is reported as unstructured, never throwing', () => {
    expect(() => buildUpscCsePrelimsImportPreview('', 'empty.txt')).not.toThrow();
    expect(buildUpscCsePrelimsImportPreview('', 'empty.txt').structured).toBe(false);
  });
});

describe('buildUpscCsePrelimsImportPreview — no fabrication', () => {
  it('never invents a year when the source states none', () => {
    const preview = buildUpscCsePrelimsImportPreview('Q1. Undated question?\nA) One\nB) Two\n', 'undated.txt');
    expect(preview.year).toBeUndefined();
    expect(preview.accepted[0].year).toBeUndefined();
  });

  it('never invents a paper when the source states none', () => {
    const preview = buildUpscCsePrelimsImportPreview('Q1. No paper stated?\nA) One\nB) Two\n', 'nopaper.txt');
    expect(preview.paper).toBeUndefined();
  });

  it('never invents subject/topic classification when the source does not state them', () => {
    const preview = buildUpscCsePrelimsImportPreview('Q1. Unclassified question?\nA) One\nB) Two\n', 'unclassified.txt');
    expect(preview.accepted[0].subject).toBeUndefined();
    expect(preview.accepted[0].topic).toBeUndefined();
  });

  it('never invents a correct option — validateCorrectOption never picks a default when absent', () => {
    const preview = buildUpscCsePrelimsImportPreview('Q1. No answer given?\nA) One\nB) Two\nC) Three\n', 'noanswer.txt');
    expect(preview.accepted[0].correctOptionId).toBeUndefined();
  });

  it('never invents an explanation field — UpscCsePrelimsPyq has no explanation field to fill at all', () => {
    const preview = buildUpscCsePrelimsImportPreview(FULL_SOURCE, 'x.txt');
    expect(preview.accepted[0]).not.toHaveProperty('explanation');
  });

  it('an unparseable block is skipped/rejected, never guessed into a fabricated question', () => {
    // Only 1 option -> too_few_options -> rejected, never "completed" with invented options.
    const preview = buildUpscCsePrelimsImportPreview('Q1. Incomplete question?\nA) Only one option\n', 'incomplete.txt');
    expect(preview.accepted).toEqual([]);
    expect(preview.rejected).toHaveLength(1);
    expect(preview.rejected[0].issues.some((i) => i.reason === 'too_few_options')).toBe(true);
  });
});

describe('validateUpscCsePrelimsCandidate — combinator', () => {
  it('a fully valid candidate produces no issues', () => {
    expect(validateUpscCsePrelimsCandidate(candidate({ correctOptionId: 'B' }), 2023)).toEqual([]);
  });

  it('a candidate with multiple problems reports all of them, not just the first', () => {
    const bad = candidate({ question: '', options: [{ id: 'A', text: 'Only one' }], correctOptionId: 'Z' });
    const issues = validateUpscCsePrelimsCandidate(bad, 2023);
    const reasons = issues.map((i) => i.reason);
    expect(reasons).toContain('empty_question_text');
    expect(reasons).toContain('too_few_options');
    expect(reasons).toContain('correct_option_not_in_options');
  });
});

describe('UPSC CSE PYQ import — workspace isolation (by construction)', () => {
  it('UpscCsePrelimsPyq has no per-record workspaceId field — it is exclusively for the UPSC CSE bank by construction, exactly like data/pyq.ts\'s own PYQ_BANK', () => {
    const preview = buildUpscCsePrelimsImportPreview(FULL_SOURCE, 'x.txt');
    expect(preview.accepted[0]).not.toHaveProperty('workspaceId');
  });
});

describe('APFC 458-question regression', () => {
  it('data/pyq.ts\'s PYQ_BANK is completely unaffected by this stage', () => {
    expect(PYQ_BANK.length).toBe(458);
  });
});

describe('empty UPSC bank remains empty', () => {
  it('data/pyqUpscCse.ts\'s UPSC_CSE_PYQ_BANK is still empty — this stage builds the importer/validator only, never populates it', () => {
    expect(UPSC_CSE_PYQ_BANK).toEqual([]);
  });
});
