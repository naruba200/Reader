import type { LanguageCode } from "../core/types";

/** Lookup counts powering the "difficult words" list and lookup history. */

export interface LookupRecord {
  word: string;
  lang: LanguageCode;
  count: number;
  firstAt: number;
  lastAt: number;
}

const LOOKUP_KEY = "smart-reader-lookup-counts";
const MAX_RECORDS = 500;

function keyOf(word: string, lang: LanguageCode): string {
  return `${lang}:${word}`;
}

function loadAll(): Record<string, LookupRecord> {
  try {
    const raw = JSON.parse(localStorage.getItem(LOOKUP_KEY) ?? "{}");
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

function persist(all: Record<string, LookupRecord>): void {
  try {
    localStorage.setItem(LOOKUP_KEY, JSON.stringify(all));
  } catch { /* storage full/unavailable */ }
}

export function recordLookup(word: string, lang: LanguageCode): LookupRecord | null {
  const w = word.trim();
  if (!w) return null;
  const all = loadAll();
  const key = keyOf(w, lang);
  const now = Date.now();
  const prev = all[key];
  const rec: LookupRecord = prev
    ? { ...prev, count: prev.count + 1, lastAt: now }
    : { word: w, lang, count: 1, firstAt: now, lastAt: now };
  all[key] = rec;
  // Trim oldest if over the cap.
  const keys = Object.keys(all);
  if (keys.length > MAX_RECORDS) {
    keys
      .sort((a, b) => all[a].lastAt - all[b].lastAt)
      .slice(0, keys.length - MAX_RECORDS)
      .forEach((k) => delete all[k]);
  }
  persist(all);
  return rec;
}

/** Most recent lookups first. */
export function getLookupHistory(limit = 100): LookupRecord[] {
  return Object.values(loadAll())
    .sort((a, b) => b.lastAt - a.lastAt)
    .slice(0, limit);
}

/** Words looked up at least `minCount` times — the "difficult" list. */
export function getDifficultWords(minCount = 2): LookupRecord[] {
  return Object.values(loadAll())
    .filter((r) => r.count >= minCount)
    .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt);
}

/** Replace all records (used by backup restore). */
export function replaceLookupHistory(records: LookupRecord[]): void {
  const all: Record<string, LookupRecord> = {};
  for (const r of Array.isArray(records) ? records : []) {
    if (r && r.word) all[keyOf(r.word, r.lang)] = r;
  }
  persist(all);
}
