import type { DictionaryEntry } from "../types";

/**
 * English-meaning search for the Japanese dictionary.
 *
 * The Japanese word/reading index (`SortedSearchIndex`) only matches
 * Japanese surface forms, so a user without a Japanese word or keyboard
 * cannot find anything by typing English. This module indexes the English
 * glosses carried in entry definitions (JMdict glosses, KANJIDIC2 meanings,
 * grammar-pack definitions) and searches them with strict ranking:
 *
 *   1. exact gloss phrase   ("dog" matches the gloss "dog")
 *   2. gloss-phrase prefix  ("dog" matches "dogwood" — a phrase starting with it)
 *   3. whole-word token match (all query words appear as whole words in a gloss)
 *   4. substring fallback   (only to fill remaining slots)
 *
 * Substring-only matches are deliberately last: a loose substring search
 * on "an" must not flood results with "another", "animal", "plan" ahead
 * of entries whose gloss actually is "an" or contains the word "an".
 *
 * Design note: only ONE sorted array (gloss phrases) is kept. Token and
 * substring tiers run as a single linear pass over that array, only when
 * the binary-search tiers did not fill the limit, and stop as soon as the
 * limit is filled. A separate token→words index would roughly triple
 * memory (JMdict has ~200k entries, ~500k phrases, ~1M+ tokens) for a
 * secondary search path; the linear fallback is bounded by the same
 * debounce the search bar already uses.
 */

/** One English gloss phrase pointing at its Japanese entry. */
export interface GlossRecord {
  /** Lowercased, trimmed gloss phrase (e.g. "to eat"). */
  phrase: string;
  /** The Japanese word this gloss belongs to. */
  word: string;
  /** First reading, when it differs from the word (for result rows). */
  reading?: string;
}

export interface GlossIndex {
  /** All gloss phrases, sorted by phrase for binary search. */
  phrases: GlossRecord[];
}

/**
 * Split an entry definition into gloss phrases. JMdict-style definitions
 * join glosses with ";" (e.g. "dog; hound; canine"); a definition without
 * ";" is a single phrase. Commas are NOT split on — they occur inside
 * single glosses ("to run, jump, and play").
 */
export function parseGlosses(definition: string): string[] {
  return definition
    .split(/[;；]/)
    .map((g) => g.trim())
    .filter((g) => g.length > 0);
}

/** Build the sorted phrase index from entries. Deduplicates (phrase, word). */
export function buildGlossIndex(entries: Iterable<DictionaryEntry>): GlossIndex {
  const seen = new Set<string>();
  const phrases: GlossRecord[] = [];
  for (const entry of entries) {
    if (!entry.definition) continue;
    const reading =
      entry.readings && entry.readings[0] && entry.readings[0] !== entry.word
        ? entry.readings[0]
        : undefined;
    for (const gloss of parseGlosses(entry.definition)) {
      const phrase = gloss.toLowerCase();
      const dedupKey = `${phrase}\n${entry.word}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);
      phrases.push({ phrase, word: entry.word, reading });
    }
  }
  phrases.sort((a, b) =>
    a.phrase < b.phrase ? -1 : a.phrase > b.phrase ? 1 : a.word < b.word ? -1 : a.word > b.word ? 1 : 0,
  );
  return { phrases };
}

/** True when the query is Latin-script text with no Japanese characters. */
export function isLatinQuery(query: string): boolean {
  if (!/[a-zA-Z]/.test(query)) return false;
  // Hiragana, katakana (incl. half-width), CJK unified + compatibility ideographs.
  return !/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff\uff66-\uff9f]/.test(query);
}

function lowerBound(records: GlossRecord[], target: string): number {
  let lo = 0;
  let hi = records.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (records[mid].phrase < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Ranked English-gloss search. Returns records in tier order
 * (exact phrase, phrase prefix, whole-word token match, substring),
 * deduplicated by word, capped at `limit`.
 */
export function searchGlossIndex(
  index: GlossIndex,
  query: string,
  limit = 50,
): GlossRecord[] {
  const q = query.trim().toLowerCase();
  if (!q || limit <= 0) return [];
  const { phrases } = index;

  const seen = new Set<string>();
  const out: GlossRecord[] = [];
  const push = (rec: GlossRecord): boolean => {
    if (seen.has(rec.word)) return false;
    seen.add(rec.word);
    out.push(rec);
    return out.length >= limit;
  };

  // Tier 1: exact gloss phrase.
  const exactIdx = lowerBound(phrases, q);
  if (exactIdx < phrases.length && phrases[exactIdx].phrase === q) {
    for (let i = exactIdx; i < phrases.length && phrases[i].phrase === q; i++) {
      if (push(phrases[i])) return out;
    }
  }

  // Tier 2: gloss-phrase prefix.
  const prefixEnd = lowerBound(phrases, q + "\uffff");
  for (let i = lowerBound(phrases, q); i < prefixEnd; i++) {
    if (phrases[i].phrase.startsWith(q)) {
      if (push(phrases[i])) return out;
    }
  }

  // Tiers 3 + 4: one linear pass, only if the limit is not filled yet.
  // Tier 3 requires EVERY query word to appear as a whole word in the
  // gloss (AND semantics: "to eat" matches "to eat" and "to eat a meal",
  // not "to sleep"). Tier 4 is a plain substring fallback.
  if (out.length < limit) {
    const tokens = q.split(/[^a-z0-9']+/).filter((t) => t.length > 0);
    const tokenRes = tokens.map((t) => new RegExp(`\\b${escapeRegExp(t)}\\b`));
    const tier3: GlossRecord[] = [];
    const tier4: GlossRecord[] = [];
    for (let i = 0; i < phrases.length; i++) {
      const rec = phrases[i];
      if (seen.has(rec.word)) continue;
      if (tokenRes.length > 0 && tokenRes.every((re) => re.test(rec.phrase))) {
        tier3.push(rec);
        // Tier 3 alone fills the limit: later phrases cannot outrank it.
        if (tier3.length >= limit) break;
      } else if (rec.phrase.includes(q)) {
        tier4.push(rec);
      }
    }
    for (const rec of tier3) if (push(rec)) return out;
    for (const rec of tier4) if (push(rec)) return out;
  }

  return out.slice(0, limit);
}

/** Merge Japanese word matches with English-meaning matches: Japanese first, deduped by word. */
export function mergeSearchResults<T extends { word: string }>(
  japanese: T[],
  meaning: T[],
  limit = 50,
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of japanese) {
    if (seen.has(r.word)) continue;
    seen.add(r.word);
    out.push(r);
    if (out.length >= limit) return out;
  }
  for (const r of meaning) {
    if (seen.has(r.word)) continue;
    seen.add(r.word);
    out.push(r);
    if (out.length >= limit) return out;
  }
  return out;
}
