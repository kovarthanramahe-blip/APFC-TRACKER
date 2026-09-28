// Premium Knowledge Editor, Phase 5I — static, hand-authored note starting points for APFC/UPSC/PhD
// study workflows. Plain structured Markdown only — never AI-generated, never fabricated content;
// every template is just section headings and prompts for the user to fill in themselves. Kept out
// of Notes.tsx on purpose (this module is the single source of truth a "New from template" picker
// reads from, not a page-local constant) so it stays independently testable and reusable anywhere
// else a note gets created (e.g. a future PhD Research quick-capture flow).

export interface NoteTemplate {
  id: string;
  name: string;
  description: string;
  /** Plain Markdown — becomes the new Note's `content` verbatim; the user edits from there. */
  content: string;
}

export const NOTE_TEMPLATES: readonly NoteTemplate[] = [
  {
    id: 'blank',
    name: 'Blank Note',
    description: 'Start with nothing but a title.',
    content: '',
  },
  {
    id: 'upsc-topic',
    name: 'UPSC Topic',
    description: 'A syllabus topic, structured for first-pass study notes.',
    content: `# Topic:

## Key Concepts

-

## Important Facts / Data

-

## Static + Current Affairs Linkages

-

## Previous Year Questions Referenced

-

## Sources

- `,
  },
  {
    id: 'upsc-revision',
    name: 'UPSC Revision Note',
    description: 'A compressed, quick-recall revision summary.',
    content: `# Revision:

## One-line Summary

>

## Must-Remember Points

- [ ]
- [ ]
- [ ]

## Common Confusions

-

## Last Revised

`,
  },
  {
    id: 'pyq-analysis',
    name: 'PYQ Analysis',
    description: 'Break down a previous year question and what it actually tests.',
    content: `# PYQ:

**Year:**
**Paper:**
**Topic:**

## Question

>

## What It's Really Testing

-

## Correct Approach

1.
2.

## Related Topics to Revise

- `,
  },
  {
    id: 'current-affairs',
    name: 'Current Affairs Note',
    description: 'Capture a current event with its static-syllabus relevance.',
    content: `#

**Date:**
**Source:**

## What Happened

-

## Why It Matters (Static Linkage)

-

## Possible Question Angles

- `,
  },
  {
    id: 'research-note',
    name: 'Research Note',
    description: 'A working note for PhD research — observations, not a final draft.',
    content: `#

## Context

-

## Observations

-

## Open Questions

-

## Next Steps

- [ ] `,
  },
  {
    id: 'source-citation',
    name: 'Source/Citation Note',
    description: 'Notes on a specific source, kept separate from the Working Bibliography record itself.',
    content: `# Notes on:

## Key Argument

-

## Quotes Worth Keeping

>

## How This Connects to My Work

- `,
  },
  {
    id: 'doubt',
    name: 'Doubt Note',
    description: 'A question or confusion to resolve later.',
    content: `# Doubt:

## What I Don't Understand

-

## What I've Tried / What I Think So Far

-

## Resolved?

- [ ] Not yet`,
  },
  {
    id: 'flashcard',
    name: 'Flashcard Note',
    description: 'A single question/answer pair for spaced recall.',
    content: `# Flashcard

## Q

-

## A

- `,
  },
] as const;

export function getNoteTemplate(id: string): NoteTemplate | undefined {
  return NOTE_TEMPLATES.find((t) => t.id === id);
}
