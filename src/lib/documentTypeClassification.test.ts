import { describe, it, expect } from 'vitest';
import { classifyDocumentType, extractLectureOrUnitNumber, extractDocumentYear, applyDocumentTypeClassification, DOCUMENT_TYPES } from './documentTypeClassification';

describe('classifyDocumentType — representative document types (deterministic, no AI call)', () => {
  it('classifies an official notification correctly', () => {
    const text = 'Government of India, Ministry of Labour and Employment. Office Memorandum. In pursuance of the powers conferred, the following is notified for general information.';
    const result = classifyDocumentType(text, 'notification.pdf');
    expect(result.documentType).toBe('official_notification');
    expect(result.status).toBe('predicted');
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('classifies a statute/act correctly', () => {
    const text = 'The Minimum Wages Act, 1948. An Act to provide for fixing minimum rates of wages. Be it enacted as follows. Section 1. Short title and commencement. Provided that this Act extends to the whole of India.';
    const result = classifyDocumentType(text, 'minimum-wages-act.pdf');
    expect(result.documentType).toBe('statute');
    expect(result.status).toBe('predicted');
  });

  it('classifies a PYQ (previous year question paper) correctly', () => {
    const text = 'EPFO Enforcement Officer Previous Year Question Paper 2023. Time allowed: 2 hours. Maximum marks: 100. Instructions to candidates: attempt any four questions. Answer the following questions, 5 marks each.';
    const result = classifyDocumentType(text, 'epfo-pyq-2023.pdf');
    expect(result.documentType).toBe('pyq');
  });

  it('classifies a research paper correctly', () => {
    const text = 'Abstract: this paper examines labour welfare outcomes. Keywords: labour, welfare, policy. 1. Introduction. 2. Literature Review. 3. Methodology. 4. Conclusion and Future Work. References: [1] Smith, J. (2020). DOI: 10.1234/abc';
    const result = classifyDocumentType(text, 'labour-welfare-study.pdf');
    expect(result.documentType).toBe('research_paper');
  });

  it('classifies lecture notes correctly', () => {
    const text = 'Lecture 5 notes. Today we will discuss depreciation methods. Recap of last lecture: we covered straight-line depreciation. Unit 2 continues next week.';
    const result = classifyDocumentType(text, 'lecture5-notes.docx');
    expect(result.documentType).toBe('lecture_notes');
  });

  it('classifies a report correctly', () => {
    const text = 'Annual Report 2023-24. Executive Summary. This committee report presents the findings of the report along with recommendations for the coming year.';
    const result = classifyDocumentType(text, 'annual-report.pdf');
    expect(result.documentType).toBe('report');
  });

  it('classifies a book/chapter correctly', () => {
    const text = 'Chapter 7: Industrial Relations. Table of Contents. ISBN 978-0-00-000000-0. Published by Academic Press. Second Edition. Preface: this book covers labour law fundamentals.';
    const result = classifyDocumentType(text, 'textbook-ch7.pdf');
    expect(result.documentType).toBe('book_chapter');
  });

  it('classifies a transcript correctly', () => {
    const text = 'Webinar Transcript. Speaker: Dr. Rao. Q and A Session follows the main talk. Audio transcript auto-generated.';
    const result = classifyDocumentType(text, 'webinar-transcript.docx');
    expect(result.documentType).toBe('transcript');
  });
});

describe('classifyDocumentType — non-APFC and PhD-research material (workspace-independent — never assumes APFC)', () => {
  it('classifies a PhD research paper the same way regardless of workspace (this classifier takes no workspace parameter at all)', () => {
    const text = 'Abstract: a longitudinal study of groundwater depletion. Keywords: hydrology, policy. Literature Review. Methodology. References. DOI: 10.5555/xyz';
    const result = classifyDocumentType(text, 'thesis-chapter-3.pdf');
    expect(result.documentType).toBe('research_paper');
    // No taxonomy/syllabus concept appears anywhere in this module's public surface — confirms it
    // cannot have silently assumed APFC.
    expect(result).not.toHaveProperty('taxonomy');
    expect(result).not.toHaveProperty('workspaceId');
  });
});

describe('classifyDocumentType — ambiguous material and unclassified fallback (never a fabricated confident guess)', () => {
  it('returns status "unclassified" for empty text, never throwing or guessing', () => {
    const result = classifyDocumentType('', 'empty.txt');
    expect(result.status).toBe('unclassified');
    expect(result.documentType).toBe('other');
    expect(result.confidence).toBe(0);
  });

  it('returns status "unclassified" for text with no recognisable signal at all', () => {
    const result = classifyDocumentType('The quick brown fox jumps over the lazy dog repeatedly every single day without fail.', 'random.txt');
    expect(result.status).toBe('unclassified');
    expect(result.documentType).toBe('other');
  });

  it('returns status "needs_review" when two candidate types score within the margin of each other, never silently picking one', () => {
    // Deliberately contains strong signal phrases for BOTH report and research_paper.
    const text = 'Executive Summary. Annual Report. Committee Report. Findings of the report. Recommendations. Abstract. References. Literature Review. Methodology. Keywords. DOI. Conclusion and future work.';
    const result = classifyDocumentType(text, 'ambiguous.pdf');
    expect(result.status).toBe('needs_review');
    expect([...DOCUMENT_TYPES]).toContain(result.documentType);
  });

  it('every returned documentType is always one of the declared DOCUMENT_TYPES — never an invented category', () => {
    const samples = ['', 'random unrelated text', 'Lecture 1 notes', 'Section 5 Act', 'Abstract References DOI'];
    for (const s of samples) {
      expect([...DOCUMENT_TYPES]).toContain(classifyDocumentType(s).documentType);
    }
  });
});

describe('applyDocumentTypeClassification — user-confirmed categories are never silently overwritten', () => {
  it('returns the proposal unchanged when the existing status is undefined (brand-new item)', () => {
    const proposal = classifyDocumentType('Lecture 1 notes on depreciation methods', 'l1.docx');
    expect(applyDocumentTypeClassification(undefined, proposal)).toEqual(proposal);
  });

  it('returns the proposal unchanged when the existing status is "predicted" (safe to refresh)', () => {
    const proposal = classifyDocumentType('Lecture 1 notes', 'l1.docx');
    expect(applyDocumentTypeClassification('predicted', proposal)).toEqual(proposal);
  });

  it('returns the proposal unchanged when the existing status is "needs_review" (safe to refresh)', () => {
    const proposal = classifyDocumentType('Lecture 1 notes', 'l1.docx');
    expect(applyDocumentTypeClassification('needs_review', proposal)).toEqual(proposal);
  });

  it('returns the proposal unchanged when the existing status is "unclassified" (safe to refresh)', () => {
    const proposal = classifyDocumentType('Lecture 1 notes', 'l1.docx');
    expect(applyDocumentTypeClassification('unclassified', proposal)).toEqual(proposal);
  });

  it('returns undefined — never overwriting — when the existing status is "confirmed"', () => {
    const proposal = classifyDocumentType('Lecture 1 notes on an entirely different subject', 'l1.docx');
    expect(applyDocumentTypeClassification('confirmed', proposal)).toBeUndefined();
  });
});

describe('extractLectureOrUnitNumber — conservative, labelled-pattern-only extraction', () => {
  it('extracts from "Lecture 12"', () => {
    expect(extractLectureOrUnitNumber('Lecture 12: Depreciation Methods')).toBe(12);
  });

  it('extracts from "Unit 3"', () => {
    expect(extractLectureOrUnitNumber('This is covered in Unit 3 of the syllabus.')).toBe(3);
  });

  it('extracts from "Chapter 7" and "Module 2" and "Session 9"', () => {
    expect(extractLectureOrUnitNumber('Chapter 7')).toBe(7);
    expect(extractLectureOrUnitNumber('Module 2 overview')).toBe(2);
    expect(extractLectureOrUnitNumber('Session 9 recording')).toBe(9);
  });

  it('is case-insensitive and tolerates a separator', () => {
    expect(extractLectureOrUnitNumber('LECTURE-12')).toBe(12);
    expect(extractLectureOrUnitNumber('lecture: 4')).toBe(4);
  });

  it('returns undefined when no labelled pattern is present — never guesses a stray number', () => {
    expect(extractLectureOrUnitNumber('This document mentions 12 employees and section 3.')).toBeUndefined();
    expect(extractLectureOrUnitNumber('')).toBeUndefined();
  });
});

describe('extractDocumentYear — conservative, labelled-pattern-only extraction', () => {
  it('extracts a year after "dated"', () => {
    expect(extractDocumentYear('Notification dated 2021 regarding wage revision.')).toBe(2021);
  });

  it('extracts a year embedded in an Act title ("Act, 1948")', () => {
    expect(extractDocumentYear('The Minimum Wages Act, 1948')).toBe(1948);
  });

  it('extracts a year after "published" or "copyright"', () => {
    expect(extractDocumentYear('Published 2019 by Academic Press.')).toBe(2019);
    expect(extractDocumentYear('Copyright 2022, All rights reserved.')).toBe(2022);
  });

  it('never matches a bare floating 4-digit number with no label', () => {
    expect(extractDocumentYear('Section 1948 of the handbook covers wages. Room 2021 is the venue.')).toBeUndefined();
  });

  it('rejects an out-of-range year even with a label', () => {
    expect(extractDocumentYear('dated 2150')).toBeUndefined();
  });

  it('accepts an older historical statute year within the widened range', () => {
    expect(extractDocumentYear('The Factories Act, 1860')).toBe(1860);
  });

  it('returns undefined for empty text', () => {
    expect(extractDocumentYear('')).toBeUndefined();
  });
});
