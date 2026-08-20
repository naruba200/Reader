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
  "https://raw.githubusercontent.com/naruba200/Reader/main/packs";

/** Downloadable dictionary packs per language. */
export const DICTIONARY_PACKS: Partial<Record<LanguageCode, PackDefinition[]>> = {
  ja: [
    {
      language: "ja",
      source: "JMDict",
      version: "2026-08-15",
      fileName: "jmdict-ja.pack.ndjson",
      estimatedBytes: 47 * 1024 * 1024,
    },
    {
      language: "ja",
      source: "KANJIDIC2",
      version: "2.0",
      fileName: "kanjidic2-ja.pack.ndjson",
      estimatedBytes: 1.3 * 1024 * 1024,
    },
    {
      language: "ja",
      source: "Tae Kim's Grammar",
      version: "1.0",
      fileName: "tae-kim-ja.pack.ndjson",
      estimatedBytes: 58 * 1024,
    },
    {
      language: "ja",
      source: "JLPT Grammar",
      version: "1.0",
      fileName: "jlpt-grammar-ja.pack.ndjson",
      estimatedBytes: 36 * 1024,
    },
  ],
  en: [
    {
      language: "en",
      source: "WordNet",
      version: "3.1",
      fileName: "wordnet-en.pack.ndjson",
      estimatedBytes: 23 * 1024 * 1024,
    },
  ],
};

export function packUrl(def: PackDefinition): string {
  return `${PACK_BASE_URL}/${def.fileName}`;
}

export const SUPPORTED_DICT_LANGUAGES: readonly LanguageCode[] = ["ja", "en"];