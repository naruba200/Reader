import type { LanguageCode } from "../types";

export interface PackDefinition {
  language: LanguageCode;
  source: string;
  version: string;
  fileName: string;
  /** Approximate download size, shown to the user before downloading. */
  estimatedBytes: number;
}

/** Where generated dictionary packs are hosted (GitHub Releases). */
const PACK_BASE_URL =
  "https://github.com/naruba200/Reader/releases/latest/download";

/** Downloadable dictionary packs per language. */
export const DICTIONARY_PACKS: Partial<Record<LanguageCode, PackDefinition>> = {
  ja: {
    language: "ja",
    source: "JMDict",
    version: "2026-08-15",
    fileName: "jmdict-ja.pack.ndjson",
    estimatedBytes: 47 * 1024 * 1024,
  },
  en: {
    language: "en",
    source: "WordNet",
    version: "3.1",
    fileName: "wordnet-en.pack.ndjson",
    estimatedBytes: 23 * 1024 * 1024,
  },
};

export function packUrl(def: PackDefinition): string {
  return `${PACK_BASE_URL}/${def.fileName}`;
}

export const SUPPORTED_DICT_LANGUAGES: readonly LanguageCode[] = ["ja", "en"];