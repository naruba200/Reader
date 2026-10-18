/** Reading-time stats: totals, per-day, per-book, streaks, daily goal. */

export interface ReadingStats {
  totalMs: number;
  /** Local "YYYY-MM-DD" -> ms read that day. */
  perDay: Record<string, number>;
  /** bookId -> ms read. */
  perBook: Record<string, number>;
  /** Consecutive days with any reading time. */
  streak: number;
  lastDay: string | null;
  /** Daily goal in minutes. */
  goalMin: number;
}

const STATS_KEY = "smart-reader-reading-stats";
const DEFAULT_GOAL_MIN = 20;

export function todayKey(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function empty(): ReadingStats {
  return { totalMs: 0, perDay: {}, perBook: {}, streak: 0, lastDay: null, goalMin: DEFAULT_GOAL_MIN };
}

export function loadStats(): ReadingStats {
  try {
    const raw = JSON.parse(localStorage.getItem(STATS_KEY) ?? "{}");
    const s = { ...empty(), ...(raw && typeof raw === "object" ? raw : {}) };
    if (typeof s.goalMin !== "number" || s.goalMin < 1) s.goalMin = DEFAULT_GOAL_MIN;
    return s;
  } catch {
    return empty();
  }
}

function persist(s: ReadingStats): void {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(s));
  } catch { /* storage full/unavailable */ }
}

/** Record `ms` of reading time for a book. Returns the updated stats. */
export function addReadingTime(bookId: string, ms: number): ReadingStats {
  if (!(ms > 0)) return loadStats();
  const s = loadStats();
  const today = todayKey();
  s.totalMs += ms;
  s.perDay[today] = (s.perDay[today] ?? 0) + ms;
  s.perBook[bookId] = (s.perBook[bookId] ?? 0) + ms;
  if (s.lastDay !== today) {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    s.streak = s.lastDay === todayKey(y) ? s.streak + 1 : 1;
    s.lastDay = today;
  }
  // Trim per-day history to a year.
  const days = Object.keys(s.perDay).sort();
  for (const d of days.slice(0, Math.max(0, days.length - 365))) delete s.perDay[d];
  persist(s);
  return s;
}

export function setDailyGoal(min: number): number {
  const s = loadStats();
  s.goalMin = Math.min(240, Math.max(5, Math.round(min)));
  persist(s);
  return s.goalMin;
}

export function formatDuration(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Replace stats (used by backup restore). */
export function replaceStats(s: ReadingStats): void {
  persist({ ...empty(), ...(s && typeof s === "object" ? s : {}) });
}
