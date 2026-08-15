import type { LanguageCode, Level, LevelScheme } from "../types";
import { MemoryLevelDb, type LevelDb } from "./LevelDb";
import { CEFR_EN_SAMPLE } from "./data/cefr.en";
import { JLPT_JA_SAMPLE } from "./data/jlpt.ja";

const SCHEME_BY_LANGUAGE: Readonly<Record<string, LevelScheme>> = {
  en: "CEFR",
  de: "CEFR",
  fr: "CEFR",
  ja: "JLPT",
};

/** Load bundled sample entries for a language as [word, level] tuples. */
export function bundledEntries(language: LanguageCode): readonly (readonly [string, Level])[] {
  if (language === "ja") {
    return JLPT_JA_SAMPLE.map(([kanji, , , level]) => [
      kanji,
      level,
    ] as const);
  }
  return CEFR_EN_SAMPLE.map(([word, level]) => [word, level] as const);
}

/** Parse TSV rows of the form `word\tlevel` into [word, level] tuples. */
export function parseTsvLevelData(
  text: string,
  scheme: LevelScheme,
): readonly (readonly [string, Level])[] {
  const out: (readonly [string, Level])[] = [];
  const validLevels = scheme === "JLPT"
    ? ["N5", "N4", "N3", "N2", "N1"]
    : ["A1", "A2", "B1", "B2", "C1", "C2"];
  const valid = new Set(validLevels);

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length === 0 || line.startsWith("#")) continue;
    const tab = line.indexOf("\t");
    if (tab === -1) continue;
    const word = line.slice(0, tab).trim();
    const level = line.slice(tab + 1).trim();
    if (word.length === 0 || !valid.has(level as Level)) continue;
    out.push([word, level as Level]);
  }
  return out;
}

export interface LevelDbLoadOptions {
  /** Base path for TSV wordlists. Default "/dict". */
  basePath?: string;
  /** Custom fetch implementation (for tests). */
  fetchImpl?: typeof fetch;
}

/** Map of language code to TSV filename served under /public/dict. */
export function dictFileName(language: LanguageCode): string {
  switch (language) {
    case "ja": return "jlpt.ja.tsv";
    case "de": return "cefr.de.tsv";
    case "fr": return "cefr.fr.tsv";
    default: return "cefr.en.tsv";
  }
}

export function languageScheme(language: LanguageCode): LevelScheme {
  return SCHEME_BY_LANGUAGE[language] ?? "CEFR";
}

/**
 * Loads a LevelDb for a language.
 * Tries to fetch the TSV wordlist from the given base path; on any failure
 * (404, network error, empty payload) falls back to the bundled sample.
 */
export async function loadLevelDb(
  language: LanguageCode,
  options: LevelDbLoadOptions = {},
): Promise<LevelDb> {
  const scheme = languageScheme(language);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const basePath = options.basePath ?? "/dict";
  const url = `${basePath.replace(/\/$/, "")}/${dictFileName(language)}`;

  let entries = bundledEntries(language);
  if (typeof fetchImpl === "function") {
    try {
      const res = await fetchImpl(url);
      if (res.ok) {
        const text = await res.text();
        const parsed = parseTsvLevelData(text, scheme);
        if (parsed.length > 0) {
          entries = parsed;
        }
      }
    } catch {
      // network errors fall through to the bundled sample
    }
  }

  return new MemoryLevelDb(scheme, entries);
}
