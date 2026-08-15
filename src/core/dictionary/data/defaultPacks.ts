import type { DictionaryEntry, LanguageCode } from "../../types";
import { JLPT_JA_SAMPLE } from "../../leveldb/data/jlpt.ja";
import { SAMPLE_EN_DICTIONARY } from "../sample";

/** Extra common English words beyond the original samples, for a usable offline default. */
const EXTRA_EN_DICTIONARY: readonly DictionaryEntry[] = [
  { word: "you", pos: "pronoun", definition: "the person or people being addressed" },
  { word: "we", pos: "pronoun", definition: "the speaker together with other people" },
  { word: "they", pos: "pronoun", definition: "people or things previously mentioned" },
  { word: "this", pos: "pronoun", definition: "the person or thing near or indicated" },
  { word: "that", pos: "pronoun", definition: "the person or thing mentioned or indicated" },
  { word: "he", pos: "pronoun", definition: "a male person previously mentioned" },
  { word: "she", pos: "pronoun", definition: "a female person previously mentioned" },
  { word: "it", pos: "pronoun", definition: "a thing, animal, or situation previously mentioned" },
  { word: "have", pos: "verb", definition: "to possess, own, or hold" },
  { word: "do", pos: "verb", definition: "to perform an action or task" },
  { word: "will", pos: "verb", definition: "expressing the future tense" },
  { word: "can", pos: "verb", definition: "to be able to" },
  { word: "would", pos: "verb", definition: "used to express a polite request or a condition" },
  { word: "get", pos: "verb", definition: "to obtain, receive, or become" },
  { word: "make", pos: "verb", definition: "to create, produce, or cause" },
  { word: "like", pos: "verb", definition: "to find something pleasant or agreeable" },
  { word: "know", pos: "verb", definition: "to be aware of or acquainted with" },
  { word: "think", pos: "verb", definition: "to have an opinion or idea" },
  { word: "want", pos: "verb", definition: "to wish or desire" },
  { word: "need", pos: "verb", definition: "to require something because it is essential" },
  { word: "world", pos: "noun", definition: "the earth and all its people and places" },
  { word: "life", pos: "noun", definition: "the condition that distinguishes living things" },
  { word: "time", pos: "noun", definition: "the ongoing sequence of events from past to future" },
  { word: "day", pos: "noun", definition: "a period of 24 hours" },
  { word: "way", pos: "noun", definition: "a method, style, or manner of doing something" },
  { word: "people", pos: "noun", definition: "human beings in general" },
  { word: "thing", pos: "noun", definition: "an object, quality, or concept" },
  { word: "good", pos: "adjective", definition: "having the qualities required; satisfactory" },
  { word: "new", pos: "adjective", definition: "recently made, created, or discovered" },
  { word: "big", pos: "adjective", definition: "of considerable size or extent" },
  { word: "small", pos: "adjective", definition: "of a size that is less than normal" },
  { word: "long", pos: "adjective", definition: "measuring a great distance or duration" },
  { word: "right", pos: "adjective", definition: "morally good; correct or true" },
  { word: "really", pos: "adverb", definition: "in actual fact; truly" },
  { word: "never", pos: "adverb", definition: "not at any time" },
];

/** Bundled offline default dictionary derived from the JLPT wordlist glosses. */
function jaDefaultEntries(): DictionaryEntry[] {
  return JLPT_JA_SAMPLE.map(([kanji, kana, gloss]) => ({
    word: kanji,
    readings: [kana],
    definition: gloss,
    source: "JLPT (bundled)",
  }));
}

/**
 * Small dictionary bundled inside the app so lookups work offline with zero
 * setup. The full packs downloaded from the network overlay this.
 */
export function bundledDefaultPack(language: LanguageCode): readonly DictionaryEntry[] {
  if (language === "ja") return jaDefaultEntries();
  return [...SAMPLE_EN_DICTIONARY, ...EXTRA_EN_DICTIONARY];
}