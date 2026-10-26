/**
 * Word of the day: the single source of truth for the deterministic pick
 * shown on the dictionary home AND sent by the daily notification, so
 * the two can never disagree.
 *
 * Source: /dict/jlpt.ja.tsv, bundled in the web dir (works offline).
 * Combined list in JLPT_LEVELS order (N5 → N1), each level's words in
 * file order. Pick = combined[day % combined.length], where day is the
 * day-of-year count from `new Date(year, 0, 0)` — note this counts Jan 1
 * as day 1, so the first word is picked on Jan 2 (and on Dec 31 of a
 * non-leap year day wraps to combined[365 % length]). That shape is
 * preserved deliberately: changing it would desync the notification
 * from what the home screen has shown all along.
 */

export const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;

export interface WordOfDay {
  word: string;
  level: string;
}

/** Parse the jlpt.ja.tsv format: `word<TAB>level`, `#` comments skipped. */
export function parseJlptTsv(text: string): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const line of text.split("\n")) {
    if (line.startsWith("#") || !line.trim()) continue;
    const tab = line.indexOf("\t");
    if (tab === -1) continue;
    const word = line.slice(0, tab).trim();
    const level = line.slice(tab + 1).trim();
    if (!word || !level) continue;
    if (!result[level]) result[level] = [];
    result[level].push(word);
  }
  return result;
}

let jlptCache: Record<string, string[]> | null = null;
let jlptCachePromise: Promise<Record<string, string[]>> | null = null;

export async function loadJlptWords(): Promise<Record<string, string[]>> {
  if (jlptCache) return jlptCache;
  if (jlptCachePromise) return jlptCachePromise;
  jlptCachePromise = (async () => {
    try {
      const resp = await fetch("/dict/jlpt.ja.tsv");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const parsed = parseJlptTsv(await resp.text());
      jlptCache = parsed;
      return parsed;
    } catch {
      jlptCache = {};
      return {};
    }
  })();
  return jlptCachePromise;
}

/** Pure deterministic pick for a given date (no fetch). */
export function pickWordOfDay(
  jlpt: Record<string, string[]>,
  date: Date,
): WordOfDay | null {
  const combined: WordOfDay[] = [];
  for (const level of JLPT_LEVELS) {
    for (const w of jlpt[level] ?? []) combined.push({ word: w, level });
  }
  if (combined.length === 0) return null;
  const start = new Date(date.getFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start.getTime()) / 86400000);
  return combined[day % combined.length];
}

/** Load the list and pick today's word (defaults to right now). */
export async function getWordOfDay(date: Date = new Date()): Promise<WordOfDay | null> {
  const jlpt = await loadJlptWords();
  return pickWordOfDay(jlpt, date);
}
