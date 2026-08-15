import type { DictionaryEntry } from "../types";

/** Small bundled English dictionary for offline MVP use and tests. */
export const SAMPLE_EN_DICTIONARY: readonly DictionaryEntry[] = [
  {
    word: "the",
    pos: "article",
    definition: "used to refer to a specific person or thing",
    ipa: "/ðə/",
  },
  {
    word: "be",
    pos: "verb",
    definition: "to exist; to have identity, quality, or location",
    ipa: "/biː/",
  },
  {
    word: "go",
    pos: "verb",
    definition: "to move or travel to a place",
    ipa: "/ɡəʊ/",
  },
  {
    word: "see",
    pos: "verb",
    definition: "to notice or become aware of something with the eyes",
    ipa: "/siː/",
  },
  {
    word: "know",
    pos: "verb",
    definition: "to have information in your mind",
    ipa: "/nəʊ/",
  },
  {
    word: "come",
    pos: "verb",
    definition: "to move toward or reach a place",
    ipa: "/kʌm/",
  },
  {
    word: "make",
    pos: "verb",
    definition: "to create or produce something",
    ipa: "/meɪk/",
  },
  {
    word: "take",
    pos: "verb",
    definition: "to get hold of something with your hands",
    ipa: "/teɪk/",
  },
  {
    word: "give",
    pos: "verb",
    definition: "to provide someone with something",
    ipa: "/ɡɪv/",
  },
  {
    word: "say",
    pos: "verb",
    definition: "to speak words aloud",
    ipa: "/seɪ/",
  },
  {
    word: "friend",
    pos: "noun",
    definition: "a person you know well and like",
    ipa: "/frend/",
  },
  {
    word: "family",
    pos: "noun",
    definition: "a group of people related to each other",
    ipa: "/ˈfæmɪli/",
  },
  {
    word: "house",
    pos: "noun",
    definition: "a building where people live",
    ipa: "/haʊs/",
  },
  {
    word: "school",
    pos: "noun",
    definition: "a place where children learn",
    ipa: "/skuːl/",
  },
  {
    word: "book",
    pos: "noun",
    definition: "a set of printed pages fastened together",
    ipa: "/bʊk/",
  },
  {
    word: "water",
    pos: "noun",
    definition: "the clear liquid that falls as rain",
    ipa: "/ˈwɔːtə/",
  },
  {
    word: "food",
    pos: "noun",
    definition: "things that people and animals eat",
    ipa: "/fuːd/",
  },
  {
    word: "happy",
    pos: "adjective",
    definition: "feeling pleasure or contentment",
    ipa: "/ˈhæpi/",
  },
  {
    word: "big",
    pos: "adjective",
    definition: "large in size or amount",
    ipa: "/bɪɡ/",
  },
  {
    word: "small",
    pos: "adjective",
    definition: "little in size",
    ipa: "/smɔːl/",
  },
];

/** Small bundled Japanese dictionary for offline MVP use and tests. */
export const SAMPLE_JA_DICTIONARY: readonly DictionaryEntry[] = [
  {
    word: "水",
    readings: ["みず"],
    pos: "noun",
    definition: "water",
  },
  {
    word: "学校",
    readings: ["がっこう"],
    pos: "noun",
    definition: "school",
  },
  {
    word: "先生",
    readings: ["せんせい"],
    pos: "noun",
    definition: "teacher",
  },
  {
    word: "友達",
    readings: ["ともだち"],
    pos: "noun",
    definition: "friend",
  },
  {
    word: "家族",
    readings: ["かぞく"],
    pos: "noun",
    definition: "family",
  },
  {
    word: "食べる",
    readings: ["たべる"],
    pos: "verb",
    definition: "to eat",
  },
  {
    word: "飲む",
    readings: ["のむ"],
    pos: "verb",
    definition: "to drink",
  },
  {
    word: "行く",
    readings: ["いく"],
    pos: "verb",
    definition: "to go",
  },
  {
    word: "見る",
    readings: ["みる"],
    pos: "verb",
    definition: "to see; to watch",
  },
  {
    word: "読む",
    readings: ["よむ"],
    pos: "verb",
    definition: "to read",
  },
  {
    word: "楽しい",
    readings: ["たのしい"],
    pos: "adjective",
    definition: "enjoyable; fun",
  },
  {
    word: "新しい",
    readings: ["あたらしい"],
    pos: "adjective",
    definition: "new",
  },
];

/** Bundled dictionary entries for a language. */
export function bundledDictionary(language: string): readonly DictionaryEntry[] {
  if (language === "ja") return SAMPLE_JA_DICTIONARY;
  return SAMPLE_EN_DICTIONARY;
}
