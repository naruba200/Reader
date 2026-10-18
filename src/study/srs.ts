/** Minimal SM-2 spaced repetition for word-bank flashcards. */

export interface SrsState {
  /** Easiness factor. */
  ease: number;
  /** Current interval in days. */
  interval: number;
  /** Successful repetitions. */
  reps: number;
  /** Timestamp (ms) when the card is next due. */
  due: number;
}

export function newSrsState(now = Date.now()): SrsState {
  return { ease: 2.5, interval: 0, reps: 0, due: now };
}

export type Grade = 0 | 1 | 2 | 3 | 4 | 5;

/**
 * Classic SM-2 update. Grades 0-2 count as a lapse (restart the interval);
 * 3-5 advance it.
 */
export function gradeSrs(prev: SrsState | undefined, grade: Grade, now = Date.now()): SrsState {
  const s: SrsState = prev ?? newSrsState(now);
  let { ease, interval, reps } = s;

  if (grade < 3) {
    reps = 0;
    interval = 0;
  } else {
    reps += 1;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 6;
    else interval = Math.round(interval * ease);
  }

  ease = ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02));
  if (ease < 1.3) ease = 1.3;

  const due = grade < 3
    ? now + 10 * 60_000 // lapse → retry in 10 minutes
    : now + interval * 24 * 60 * 60_000;

  return { ease, interval, reps, due };
}

export function isDue(srs: SrsState | undefined, now = Date.now()): boolean {
  if (!srs) return true; // never reviewed → due
  return srs.due <= now;
}
