import type { MockTestBlueprint } from '../lib/types';
import { SYLLABUS } from './syllabus';
import { QUESTION_BANK } from './questionBank';

const negFraction = 1 / 3;

export const MOCK_TEST_BLUEPRINTS: MockTestBlueprint[] = [
  {
    id: 'full-length',
    title: 'Full-Length Simulation',
    description: `All ${QUESTION_BANK.length} questions across every subject — closest to the real Phase I pattern with 1/3rd negative marking.`,
    durationMinutes: 120,
    subjects: 'all',
    questionCount: QUESTION_BANK.length,
    marksPerCorrect: 2.5,
    negativeMarkFraction: negFraction,
  },
  {
    id: 'quick-40',
    title: 'Quick Practice — 40 Questions',
    description: 'A fast, randomised 40-question set spanning all subjects. Great for a daily practice habit.',
    durationMinutes: 35,
    subjects: 'all',
    questionCount: 40,
    marksPerCorrect: 2.5,
    negativeMarkFraction: negFraction,
  },
  {
    id: 'quick-20',
    title: 'Speed Round — 20 Questions',
    description: 'A short, high-intensity 20-question drill to warm up or squeeze in a quick revision session.',
    durationMinutes: 18,
    subjects: 'all',
    questionCount: 20,
    marksPerCorrect: 2.5,
    negativeMarkFraction: negFraction,
  },
  ...SYLLABUS.map<MockTestBlueprint>((subj) => ({
    id: `subject-${subj.id}`,
    title: `${subj.title} — Subject Test`,
    description: `Focused practice covering only ${subj.title}.`,
    durationMinutes: 15,
    subjects: [subj.colorKey],
    questionCount: QUESTION_BANK.filter((q) => q.subject === subj.colorKey).length,
    marksPerCorrect: 2.5,
    negativeMarkFraction: negFraction,
  })),
];

export function getBlueprint(id: string) {
  return MOCK_TEST_BLUEPRINTS.find((b) => b.id === id);
}

export function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function pickQuestionsForBlueprint(blueprint: MockTestBlueprint) {
  const pool = blueprint.subjects === 'all' ? QUESTION_BANK : QUESTION_BANK.filter((q) => blueprint.subjects.includes(q.subject));
  const shuffled = shuffle(pool);
  return shuffled.slice(0, Math.min(blueprint.questionCount, shuffled.length));
}
