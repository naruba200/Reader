import type { LanguageAdapter, Token } from "../types";
import { tokenizeLatin } from "./tokenizer";

const IRREGULAR: Record<string, string> = {
  am: "be", is: "be", are: "be", was: "be", were: "be", been: "be", being: "be",
  has: "have", had: "have", having: "have",
  does: "do", did: "do", done: "do", doing: "do",
  went: "go", gone: "go", going: "go",
  made: "make", making: "make",
  came: "come", coming: "come",
  saw: "see", seen: "see", seeing: "see",
  took: "take", taken: "take", taking: "take",
  gave: "give", given: "give", giving: "give",
  got: "get", gotten: "get", getting: "get",
  said: "say", saying: "say",
  knew: "know", known: "know", knowing: "know",
  thought: "think", thinking: "think",
  told: "tell", telling: "tell",
  felt: "feel", feeling: "feel",
  found: "find", finding: "find",
  left: "leave", leaving: "leave",
  let: "let",
  put: "put",
  set: "set",
  ran: "run", running: "run",
  bought: "buy", buying: "buy",
  brought: "bring", bringing: "bring",
  caught: "catch", catching: "catch",
  taught: "teach", teaching: "teach",
  sold: "sell", selling: "sell",
  sent: "send", sending: "send",
  spent: "spend", spending: "spend",
  stood: "stand", standing: "stand",
  understood: "understand", understanding: "understand",
  wrote: "write", written: "write", writing: "write",
  read: "read",
  ate: "eat", eaten: "eat", eating: "eat",
  drank: "drink", drunk: "drink", drinking: "drink",
  slept: "sleep", sleeping: "sleep",
  spoke: "speak", spoken: "speak", speaking: "speak",
  broke: "break", broken: "break", breaking: "break",
  drove: "drive", driven: "drive", driving: "drive",
  flew: "fly", flown: "fly", flying: "fly",
  swam: "swim", swum: "swim", swimming: "swim",
  sang: "sing", sung: "sing", singing: "sing",
  wore: "wear", worn: "wear", wearing: "wear",
  drew: "draw", drawn: "draw", drawing: "draw",
  began: "begin", begun: "begin", beginning: "begin",
  grew: "grow", grown: "grow", growing: "grow",
  became: "become", becoming: "become",
  kept: "keep", keeping: "keep",
  meant: "mean", meaning: "mean",
  met: "meet", meeting: "meet",
  paid: "pay", paying: "pay",
  played: "play", playing: "play",
  showed: "show", shown: "show", showing: "show",
  sat: "sit", sitting: "sit",
  woke: "wake", woken: "wake", waking: "wake",
  won: "win", winning: "win",
  women: "woman", children: "child", men: "man", people: "person",
  better: "good", best: "good", worse: "bad", worst: "bad",
  more: "much", most: "much", farther: "far", further: "far", furthest: "far",
  feet: "foot", teeth: "tooth", mice: "mouse", geese: "goose",
  lives: "life", knives: "knife", wives: "wife", shelves: "shelf",
  leaves: "leaf", wolves: "wolf", halves: "half", calves: "calf",
};

/** Rule-based English lemmatizer: irregulars first, then suffix rules. */
export function lemmatizeEnglish(surface: string): string {
  const lower = surface.toLowerCase();
  const irregular = IRREGULAR[lower];
  if (irregular !== undefined) return irregular;
  if (lower.length <= 3) return lower;

  const doubled = (w: string) =>
    w.length >= 2 && w[w.length - 1] === w[w.length - 2];

  if (lower.endsWith("ies") && lower.length > 4) return lower.slice(0, -3) + "y";
  if (lower.endsWith("ves") && lower.length > 4) return lower.slice(0, -3) + "f";
  if (lower.endsWith("es") && lower.length > 4) return lower.slice(0, -2);
  if (lower.endsWith("s") && !lower.endsWith("ss") && !lower.endsWith("us")) {
    return lower.slice(0, -1);
  }
  if (lower.endsWith("ing") && lower.length > 5) {
    const stem = lower.slice(0, -3);
    if (doubled(stem)) return stem.slice(0, -1);
    return stem;
  }
  if (lower.endsWith("ied") && lower.length > 4) return lower.slice(0, -3) + "y";
  if (lower.endsWith("ed") && lower.length > 4) {
    const stem = lower.slice(0, -2);
    if (doubled(stem)) return stem.slice(0, -1);
    if (stem.endsWith("e")) return stem;
    return stem;
  }
  return lower;
}

export const ENGLISH_ADAPTER: LanguageAdapter = {
  language: "en",
  scheme: "CEFR",
  async tokenize(text: string): Promise<Token[]> {
    return tokenizeLatin(text).map((t) => ({ ...t, lemma: lemmatizeEnglish(t.surface) }));
  },
  lemmatize(surface: string): string {
    return lemmatizeEnglish(surface);
  },
  levels(): ReturnType<LanguageAdapter["levels"]> {
    return ["A1", "A2", "B1", "B2", "C1", "C2"];
  },
};
