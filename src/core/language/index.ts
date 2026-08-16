import type { LanguageAdapter, LanguageCode } from "../types";
import { ENGLISH_ADAPTER } from "./english";
import { GERMAN_ADAPTER } from "./german";
import { FRENCH_ADAPTER } from "./french";
import { JAPANESE_ADAPTER } from "./japanese";

const ADAPTERS: Readonly<Record<string, LanguageAdapter>> = {
  en: ENGLISH_ADAPTER,
  de: GERMAN_ADAPTER,
  fr: FRENCH_ADAPTER,
  ja: JAPANESE_ADAPTER,
};

/** Get the adapter for a language, falling back to English for unknown codes. */
export function getAdapter(language: LanguageCode): LanguageAdapter {
  return ADAPTERS[language] ?? ENGLISH_ADAPTER;
}

export function hasAdapter(language: LanguageCode): boolean {
  return language in ADAPTERS;
}

export function supportedLanguages(): readonly LanguageCode[] {
  return ["en", "de", "fr", "ja"] as const;
}

export { tokenizeLatin } from "./tokenizer";
export { ENGLISH_ADAPTER } from "./english";
export { GERMAN_ADAPTER } from "./german";
export { FRENCH_ADAPTER } from "./french";
export { JAPANESE_ADAPTER } from "./japanese";
export {
  segmentJapanese,
  deinflectJapanese,
  getKuromojiTokenizer,
  tokenizeJapanese,
  isHiragana,
  isKatakana,
  isKana,
  isKanji,
  katakanaToHiragana,
  hiraganaToKatakana,
  toHiragana,
} from "./japanese";
