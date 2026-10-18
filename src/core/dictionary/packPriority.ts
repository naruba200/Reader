import type { LanguageCode } from "../types";

const KEY_PREFIX = "smart-reader-pack-priority:";

/**
 * Default dictionary lookup order when the user has not saved a custom order.
 * Matches the previously hardcoded source list so behavior is unchanged.
 */
export const DEFAULT_PACK_ORDER: readonly string[] = [
  "JMDict",
  "KANJIDIC2",
  "Tae Kim's Grammar",
  "JLPT Grammar",
  "WordNet",
];

/** Load the user's saved pack priority for a language, or null if none saved. */
export function loadPackPriority(language: LanguageCode): string[] | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + language);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((s) => typeof s === "string")) {
      return parsed as string[];
    }
    return null;
  } catch {
    return null;
  }
}

/** Persist the user's pack priority (ordered source names) for a language. */
export function savePackPriority(language: LanguageCode, sources: string[]): void {
  try {
    localStorage.setItem(KEY_PREFIX + language, JSON.stringify(sources));
  } catch {
    /* storage unavailable — priority is session-only */
  }
}

/**
 * Order installed sources by user priority. Sources absent from the saved
 * order keep their existing relative order at the end.
 */
export function orderSourcesByPriority(
  language: LanguageCode,
  sources: string[],
): string[] {
  const saved = loadPackPriority(language);
  const base: readonly string[] = saved ?? DEFAULT_PACK_ORDER;
  const rank = new Map<string, number>();
  base.forEach((source, i) => rank.set(source, i));
  // Array.prototype.sort is stable: unranked sources keep relative order.
  return [...sources].sort((a, b) => {
    const ra = rank.get(a) ?? Number.MAX_SAFE_INTEGER;
    const rb = rank.get(b) ?? Number.MAX_SAFE_INTEGER;
    return ra - rb;
  });
}
