// Original motivational lines for UPSC EPFO APFC aspirants. None are
// attributed to real people — every line here was written for this app,
// so there is no risk of misquoting or fabricating a real person's words.

export const QUOTES: string[] = [
  "Today's disciplined hour becomes tomorrow's confidence.",
  "Don't chase motivation. Build a routine that works without it.",
  'One completed topic is one less topic standing between you and your goal.',
  'Revision turns information into recall.',
  'Your competition is not yesterday’s topper. It is yesterday’s version of you.',
  'Consistency beats intensity when the exam is still months away.',
  'A mock test is not a verdict. It is a map of what to fix next.',
  'Small, repeated effort quietly outperforms occasional bursts of ambition.',
  'The syllabus does not shrink by worrying about it. It shrinks by studying it.',
  'Every mistake reviewed today is a mark saved on exam day.',
  'Patience is not passive. It is choosing to keep showing up.',
  'You don’t need a perfect day. You need a day that isn’t skipped.',
  'Deep, focused work for one hour outweighs three distracted ones.',
  'Progress on paper often looks slower than progress in your head. Trust the process.',
  'The aspirant who reviews their wrong answers grows faster than the one who avoids them.',
  'Discipline is choosing between what you want now and what you want most.',
  'A single focused session, done daily, becomes an unbeatable habit by exam day.',
  'Preparation is a long conversation with yourself. Be encouraging in it.',
  'You are not behind. You are exactly where consistent effort will take you.',
  'The exam rewards depth of understanding, not just hours logged.',
  'Rest is part of preparation, not a break from it.',
  'What you revise today, you recall tomorrow.',
  'Every subject you strengthen removes one more source of exam-day doubt.',
  'A calm, steady aspirant beats an anxious, inconsistent one.',
  'Momentum is built one finished topic at a time.',
  'Your future self is counting on the effort you put in today.',
  'The goal is not to feel ready. The goal is to be ready.',
  'Struggling with a topic means you’re finally studying it seriously.',
  'Long-term preparation rewards those who show up on the ordinary days too.',
  'A weak subject today is just an unfinished subject, not a permanent one.',
  'Focus on the next topic, not the entire syllabus, and the syllabus takes care of itself.',
  'Reviewing mistakes is uncomfortable. Repeating them is worse.',
  'The version of you at the exam hall is being built right now.',
  'Every mock test attempted honestly is a rehearsal for the real thing.',
  'Discipline feels heavy in the moment and light in hindsight.',
  'A routine you can sustain beats a schedule you can’t.',
  'Clarity comes from revision, not from re-reading once and hoping.',
  'You don’t rise to the level of the exam. You fall to the level of your preparation.',
  'One more page today is one less page tomorrow.',
  'The aspirants who succeed are usually just the ones who didn’t quit on the hard days.',
];

function hashDateKey(dateKey: string): number {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) {
    hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/** Deterministic per calendar day — same quote all day, changes at midnight. */
export function getQuoteIndexForDate(dateKey: string): number {
  return hashDateKey(dateKey) % QUOTES.length;
}

export function getQuoteForDate(dateKey: string): string {
  return QUOTES[getQuoteIndexForDate(dateKey)];
}
