/**
 * Forward conjugation tables for Japanese words (dictionary form → basic
 * forms). Used by the dictionary word page ("Conjugation" section).
 *
 * Why forward rules instead of reusing `deinflectJapanese`: the
 * deinflector maps a conjugated surface back to lemma candidates and does
 * not label which form each rule produces, so it cannot be inverted into
 * a table. The verb/adjective class here comes from the entry's JMDict
 * pos code when present (v1 = ichidan, v5* = godan, vs = suru, vk =
 * kuru, adj-i, adj-na); godan (except る-ending), suru and kuru are also
 * inferred from the word shape alone, since those endings are
 * unambiguous. る-ending verbs without a pos code are skipped — they
 * could be ichidan or godan-る, and guessing wrong teaches the wrong
 * form. Entries without a pos code and without an unambiguous ending get
 * no table (a known coverage gap, noted in ROADMAP.md).
 */

export interface ConjugationForm {
  label: string;
  form: string;
}

const U_ROW = "うくぐすつぬふぶむる";
const A_ROW_MAP: Record<string, string> = {
  う: "わ", く: "か", ぐ: "が", す: "さ", つ: "た",
  ぬ: "な", ふ: "は", ぶ: "ば", む: "ま", る: "ら",
};
const I_ROW_MAP: Record<string, string> = {
  う: "い", く: "き", ぐ: "ぎ", す: "し", つ: "ち",
  ぬ: "に", ふ: "ひ", ぶ: "び", む: "み", る: "り",
};
const E_ROW_MAP: Record<string, string> = {
  う: "え", く: "け", ぐ: "げ", す: "せ", つ: "て",
  ぬ: "ね", ふ: "へ", ぶ: "べ", む: "め", る: "れ",
};
// Godan te/ta endings by dictionary ending (euphony rules).
const TE_MAP: Record<string, string> = {
  う: "って", つ: "って", る: "って",
  む: "んで", ぶ: "んで", ぬ: "んで",
  く: "いて", ぐ: "いで", す: "して",
};
const TA_MAP: Record<string, string> = {
  う: "った", つ: "った", る: "った",
  む: "んだ", ぶ: "んだ", ぬ: "んだ",
  く: "いた", ぐ: "いだ", す: "した",
};

function godan(word: string): ConjugationForm[] | null {
  const last = word.charAt(word.length - 1);
  if (!U_ROW.includes(last) || !A_ROW_MAP[last] || !TE_MAP[last]) return null;
  const stem = word.slice(0, -1);
  // 行く is the famous exception: 行って, not 行いて.
  const isIku = word.endsWith("行く");
  return [
    { label: "Dictionary", form: word },
    { label: "Polite", form: `${stem}${I_ROW_MAP[last]}ます` },
    { label: "Te-form", form: isIku ? `${stem}って` : `${stem}${TE_MAP[last]}` },
    { label: "Past", form: isIku ? `${stem}った` : `${stem}${TA_MAP[last]}` },
    // ある → ない, not あらない.
    { label: "Negative", form: word === "ある" ? "ない" : `${stem}${A_ROW_MAP[last]}ない` },
    { label: "Potential", form: `${stem}${E_ROW_MAP[last]}る` },
  ];
}

function ichidan(word: string): ConjugationForm[] | null {
  if (!word.endsWith("る")) return null;
  const stem = word.slice(0, -1);
  return [
    { label: "Dictionary", form: word },
    { label: "Polite", form: `${stem}ます` },
    { label: "Te-form", form: `${stem}て` },
    { label: "Past", form: `${stem}た` },
    { label: "Negative", form: `${stem}ない` },
    { label: "Potential", form: `${stem}られる` },
  ];
}

function suru(word: string): ConjugationForm[] {
  const stem = word.endsWith("する") ? word.slice(0, -2) : word;
  return [
    { label: "Dictionary", form: `${stem}する` },
    { label: "Polite", form: `${stem}します` },
    { label: "Te-form", form: `${stem}して` },
    { label: "Past", form: `${stem}した` },
    { label: "Negative", form: `${stem}しない` },
    { label: "Potential", form: `${stem}できる` },
  ];
}

function kuru(word: string): ConjugationForm[] {
  const stem = word.endsWith("来る") || word.endsWith("くる")
    ? word.slice(0, -2)
    : word;
  return [
    { label: "Dictionary", form: word },
    { label: "Polite", form: `${stem}きます` },
    { label: "Te-form", form: `${stem}きて` },
    { label: "Past", form: `${stem}きた` },
    { label: "Negative", form: `${stem}こない` },
    { label: "Potential", form: `${stem}こられる` },
  ];
}

function iAdjective(word: string): ConjugationForm[] {
  const stem = word.slice(0, -1);
  return [
    { label: "Present", form: word },
    { label: "Past", form: `${stem}かった` },
    { label: "Negative", form: `${stem}くない` },
    { label: "Te-form", form: `${stem}くて` },
  ];
}

function naAdjective(word: string): ConjugationForm[] {
  return [
    { label: "Present", form: word },
    { label: "Past", form: `${word}だった` },
    { label: "Negative", form: `${word}じゃない` },
    { label: "Te-form", form: `${word}で` },
  ];
}

/** Basic conjugation table for a word, or null when it is not conjugable. */
export function conjugate(word: string, pos?: string): ConjugationForm[] | null {
  if (!word) return null;
  const tokens = (pos ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  const has = (prefix: string) => tokens.some((t) => t === prefix || t.startsWith(`${prefix}-`));

  if (has("vk")) return kuru(word);
  if (has("vs")) return suru(word);
  if (has("v1")) return ichidan(word);
  if (tokens.some((t) => t.startsWith("v5"))) return godan(word);
  if (has("adj-i")) return word.endsWith("い") ? iAdjective(word) : null;
  if (has("adj-na")) return naAdjective(word);

  // No pos code: only unambiguous shapes get a table.
  if (word.endsWith("する")) return suru(word);
  if (word.endsWith("来る") || word.endsWith("くる")) return kuru(word);
  const last = word.charAt(word.length - 1);
  if (U_ROW.includes(last) && last !== "る") return godan(word);
  return null;
}
