import type { LanguageAdapter, Token } from "../types";

/** Hiragana range (small kana ぁ-ゖ). */
export function isHiragana(ch: string): boolean {
  return /[\u3040-\u3096\u309D-\u309F]/.test(ch);
}

/** Katakana range including prolonged sound mark and small kana. */
export function isKatakana(ch: string): boolean {
  return /[\u30A0-\u30FA\u30FD-\u30FF]/.test(ch);
}

export function isKana(ch: string): boolean {
  return isHiragana(ch) || isKatakana(ch);
}

/** Kanji ranges (CJK unified ideographs plus extension A). */
export function isKanji(ch: string): boolean {
  return /[\u4E00-\u9FFF\u3400-\u4DBF]/.test(ch);
}

export function isJapaneseChar(ch: string): boolean {
  return isKana(ch) || isKanji(ch);
}

/** Normalize katakana to hiragana for kana matching. */
export function katakanaToHiragana(s: string): string {
  return s.replace(/[\u30A1-\u30F6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

/** Normalize hiragana to katakana. */
export function hiraganaToKatakana(s: string): string {
  return s.replace(/[\u3041-\u3096]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60),
  );
}

export function toHiragana(s: string): string {
  return s.replace(/[\u30A1-\u30F6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

/** Voice marks: が, ぱ etc. only map across the kana block; return unchanged otherwise. */
function addDakuten(ch: string): string {
  if (ch === "は") return "ば";
  if (ch === "ば") return "ぱ";
  if (ch === "き") return "ぎ";
  if (ch === "く") return "ぐ";
  if (ch === "さ") return "ざ";
  if (ch === "し") return "じ";
  if (ch === "す") return "ず";
  if (ch === "た") return "だ";
  if (ch === "ち") return "ぢ";
  if (ch === "つ") return "づ";
  if (ch === "て") return "で";
  if (ch === "と") return "ど";
  return ch;
}

/**
 * Minimum-seed dictionary used by the stub segmenter.
 * Forms are dictionary-form entries (kanji and kana) with their kana reading.
 * Kept tiny on purpose; production builds load full lists via LevelDbLoader.
 */
const SEED_WORDS: readonly (readonly [string, string])[] = [
  ["私", "わたし"], ["僕", "ぼく"], ["俺", "おれ"], ["あなた", "あなた"],
  ["彼", "かれ"], ["彼女", "かのじょ"], ["私たち", "わたしたち"], ["誰", "だれ"],
  ["何", "なに"], ["それ", "それ"], ["これ", "これ"], ["あれ", "あれ"],
  ["ここ", "ここ"], ["そこ", "そこ"], ["どこ", "どこ"], ["日本", "にほん"],
  ["今日", "きょう"], ["昨日", "きのう"], ["明日", "あした"], ["今", "いま"],
  ["行く", "いく"], ["来る", "くる"], ["食べる", "たべる"], ["飲む", "のむ"],
  ["見る", "みる"], ["言う", "いう"], ["思う", "おもう"], ["分かる", "わかる"],
  ["する", "する"], ["来る", "くる"], ["ある", "ある"], ["いる", "いる"],
  ["読む", "よむ"], ["書く", "かく"], ["話す", "はなす"], ["聞く", "きく"],
  ["学校", "がっこう"], ["先生", "せんせい"], ["人", "ひと"], ["友達", "ともだち"],
  ["家族", "かぞく"], ["家", "いえ"], ["部屋", "へや"], ["本", "ほん"],
  ["水", "みず"], ["お茶", "おちゃ"], ["仕事", "しごと"], ["勉強", "べんきょう"],
  ["好き", "すき"], ["嫌い", "きらい"], ["楽しい", "たのしい"], ["面白い", "おもしろい"],
  ["大きい", "おおきい"], ["小さい", "ちいさい"], ["新しい", "あたらしい"], ["古い", "ふるい"],
  ["高い", "たかい"], ["安い", "やすい"], ["いい", "いい"], ["ない", "ない"],
  ["たくさん", "たくさん"], ["とても", "とても"], ["もう", "もう"], ["まだ", "まだ"],
  ["今", "いま"], ["今日", "きょう"], ["先", "さき"],
];

export interface SegmentResult {
  tokens: Token[];
}

/**
 * Stub Japanese segmenter.
 * Tries longest-match against the seed dictionary; on failure groups runs of
 * kana and individual kanji into raw tokens. Rewrites the reading position
 * after inflected forms where possible.
 */
export function segmentJapanese(
  text: string,
  seed: readonly (readonly [string, string])[] = SEED_WORDS,
): SegmentResult {
  const tokens: Token[] = [];
  const index = new Map<string, string>();
  for (const [form, reading] of seed) {
    index.set(form, reading);
    if (!/[一-龯]/.test(form)) index.set(form, reading);
  }

  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    let matched: string | undefined;
    let matchLen = 0;

    for (let len = Math.min(rest.length, 6); len >= 1; len--) {
      const cand = rest.slice(0, len);
      if (index.has(cand)) {
        matched = cand;
        matchLen = len;
        break;
      }
    }

    if (matched !== undefined) {
      tokens.push({
        surface: matched,
        lemma: matched,
        start: i,
        length: matched.length,
      });
      i += matchLen;
      continue;
    }

    const ch = text[i];
    if (isKana(ch)) {
      let j = i + 1;
      while (j < text.length && isKana(text[j])) j++;
      const run = text.slice(i, j);
      tokens.push({ surface: run, lemma: run, start: i, length: run.length });
      i = j;
    } else if (isKanji(ch)) {
      tokens.push({ surface: ch, lemma: ch, start: i, length: 1 });
      i += 1;
    } else {
      i += 1;
    }
  }

  return { tokens };
}

export interface Deinflection {
  surface: string;
  lemma: string;
}

/**
 * Basic Japanese deinflector (MVP).
 * Strips common verb/adjective endings and maps the stem back toward the
 * dictionary form. Covers polite forms, past, negative, te-form, potential,
 * desire, passive, volitional, causative, 〜てしまう/〜ておく/〜ている
 * contractions, 〜たら/〜ば conditionals, 〜ず/〜ぬ negatives, the
 * 〜なければならない family, godan volitional う, and imperatives.
 * Not exhaustive — a real morphological analyzer (MeCab / kuromoji) is the
 * production upgrade path.
 */
export function deinflectJapanese(surface: string): Deinflection {
  const s = surface;
  if (s.length <= 1) return { surface: s, lemma: s };

  const tryEnd = (suffix: string): string | undefined => {
    if (!s.endsWith(suffix)) return undefined;
    const base = s.slice(0, s.length - suffix.length);
    if (base.length === 0) return undefined;
    return base;
  };

  const candidates: string[] = [];

  const push = (v?: string) => {
    if (v !== undefined && v.length > 0) candidates.push(v);
  };

  // Kana row tables for the extended rules below.
  const E_ROW_KANA = "えけげせぜてでねへべぺめれ";
  const I_ROW_KANA = "いきぎしじちぢにひびぴみり";
  /** godan te-/ta-stem → dictionary ending (っ→く is the most common reading). */
  const TE_STEM_MAP: Record<string, string> = {
    い: "く", ち: "つ", り: "る", き: "く", ぎ: "ぐ",
    し: "す", み: "む", び: "ぶ", に: "ぬ", ん: "む", っ: "く",
  };
  /** e-row → u-row (godan potential, imperative, ば-conditional). */
  const E_ROW_MAP: Record<string, string> = {
    け: "く", げ: "ぐ", せ: "す", て: "つ", ね: "ぬ",
    へ: "ふ", べ: "ぶ", め: "む", れ: "る", え: "う",
  };
  /** o-row → u-row (godan volitional う). */
  const O_ROW_MAP: Record<string, string> = {
    こ: "く", ご: "ぐ", そ: "す", と: "つ", の: "ぬ",
    ほ: "ふ", ぼ: "ぶ", も: "む", ろ: "る", よ: "る",
    お: "う", を: "う",
  };
  /** godan a-stem → u-row (negative/causative stems). */
  const A_ROW_MAP: Record<string, string> = {
    か: "く", が: "ぐ", さ: "す", た: "つ", な: "ぬ",
    は: "ふ", ば: "ぶ", ま: "む", ら: "る", わ: "う",
  };

  /**
   * Map a negative/a-stem (行か, 食べ, し, 来) back to the dictionary form.
   * Returns undefined when the stem shape is not recognized.
   */
  const stemToDict = (b: string): string | undefined => {
    if (!b) return undefined;
    if (b.endsWith("来") || b.endsWith("こ")) return b.slice(0, -1) + "来る";
    if (b.endsWith("し")) return b.slice(0, -1) + "する";
    const lc = b.charAt(b.length - 1);
    if (A_ROW_MAP[lc]) return b.slice(0, -1) + A_ROW_MAP[lc];
    if (E_ROW_KANA.includes(lc) || I_ROW_KANA.includes(lc)) return b + "る";
    return undefined;
  };

  // Polite: ます/ません/ました/ませんでした/ましょう → る-form stem
  push(tryEnd("ませんでした"));
  push(tryEnd("ません"));
  push(tryEnd("ました"));
  push(tryEnd("ましょう"));
  push(tryEnd("ます"));

  // 〜てしまう contractions: ちゃう/じゃう/ちまう (食べちゃう→食べる; 読んじゃう→読む).
  // Placed before the past-tense rules: ちゃった/じゃった end in た.
  for (const suf of ["ちゃった", "じゃった", "ちゃう", "じゃう", "ちまう"]) {
    const b = tryEnd(suf);
    if (b === undefined) continue;
    const lc = b.charAt(b.length - 1);
    if (TE_STEM_MAP[lc]) push(b.slice(0, -1) + TE_STEM_MAP[lc]);
    else push(b + "る");
    push(b);
    push(b + (suf.charAt(0) === "じ" ? "で" : "て"));
  }

  // 〜ておく contractions: とく/どく (食べとく→食べる; 読んどく→読む).
  for (const suf of ["とく", "どく"]) {
    const b = tryEnd(suf);
    if (b === undefined) continue;
    if (b === "し") {
      push("する"); // しとく
      continue;
    }
    if (b.length === 1 && isHiragana(b)) continue; // ほどく is a dictionary form
    const lc = b.charAt(b.length - 1);
    if (TE_STEM_MAP[lc]) {
      push(b.slice(0, -1) + TE_STEM_MAP[lc]);
      if (lc === "っ") push(b.slice(0, -1) + "つ"); // 待っとく→待つ (ambiguous)
    } else {
      push(b + "る");
    }
    push(b);
  }

  // てる contraction: ている→てる (見てる→見る; 書いてる→書く).
  {
    const b = tryEnd("てる");
    if (b !== undefined) {
      if (b === "し") push("する");
      else if (b === "来" || b === "き") push("来る");
      else {
        const lc = b.charAt(b.length - 1);
        if (TE_STEM_MAP[lc]) push(b.slice(0, -1) + TE_STEM_MAP[lc]);
        else push(b + "る");
        push(b);
      }
    }
  }

  // 〜たら/〜だら conditional (食べたら→食べる; 行ったら→行く; 読んだら→読む).
  {
    const b = tryEnd("たら");
    if (b !== undefined) {
      if (b === "し") push("する");
      else if (b === "来" || b === "き") push("来る");
      else {
        const lc = b.charAt(b.length - 1);
        if (TE_STEM_MAP[lc]) push(b.slice(0, -1) + TE_STEM_MAP[lc]);
        else push(b + "る");
      }
      push(b);
    }
    const d = tryEnd("だら");
    if (d !== undefined) {
      const lc = d.charAt(d.length - 1);
      if (TE_STEM_MAP[lc]) push(d.slice(0, -1) + TE_STEM_MAP[lc]);
      else push(d + "る");
      push(d);
    }
  }

  // Past plain: た/だ (食べた→食べる; 読んだ→読む)
  if (s.endsWith("た")) {
    const base = s.slice(0, -1);
    push(base); // 食べ + る
    push(base + "る");
    push(base + "く");
  }
  if (s.endsWith("だ")) {
    const base = s.slice(0, -1);
    push(base);
    push(base + "る");
    push(base + "む");
  }

  // Negative: ない/なかった/なかった
  if (s.endsWith("なかった")) {
    push(s.slice(0, -4));
    push(s.slice(0, -4) + "る");
  }
  if (s.endsWith("ない") && s.length > 3) {
    const base = s.slice(0, -2);
    push(base);
    push(base + "る");
    push(base + "く");
  }

  // 〜ず → ない (行かず→行く; 食べず→食べる; せず→する)
  {
    const b = tryEnd("ず");
    if (b === "せ") push("する");
    else if (b !== undefined) {
      push(stemToDict(b));
      push(b + "ない");
      push(b);
    }
  }

  // 〜ぬ → ない, literary negative (行かぬ→行く; 食べぬ→食べる; せぬ→する).
  // Skipped for single-kana stems so dictionary forms like 死ぬ are untouched.
  {
    const b = tryEnd("ぬ");
    if (b === "せ") push("する");
    else if (b === "来" || b === "こ") push("来る");
    else if (b !== undefined && b.length >= 2) {
      push(stemToDict(b));
      push(b + "ない");
      push(b);
    }
  }

  // 〜なければならない family: なきゃ/なくちゃ/ないと → ない
  // (行かなきゃ→行く; 飲まなくちゃ→飲む; 食べないと→食べる)
  for (const suf of ["なくちゃ", "なきゃ"]) {
    const b = tryEnd(suf);
    if (b === undefined) continue;
    push(stemToDict(b));
    push(b + "ない");
    push(b);
  }
  {
    const b = tryEnd("ないと");
    if (b !== undefined) {
      // Strip the ない down to the a-stem: 食べないと → 食べ.
      const stem = b.endsWith("な") ? b.slice(0, -1) : b;
      push(stemToDict(stem));
      push(stem + "ない");
      push(stem);
    }
  }

  // 〜なければ → ない (行かなければ→行く)
  {
    const b = tryEnd("なければ");
    if (b !== undefined) {
      push(stemToDict(b));
      push(b + "ない");
      push(b);
    }
  }

  // Te-form: て/で (食べて→食べる; 読んで→読む)
  if (s.endsWith("て") && s.length > 2) {
    const base = s.slice(0, -1);
    push(base);
    push(base + "る");
    push(base + "く");
    push(addDakuten(base.charAt(base.length - 1)) + base.slice(0, -1));
  }
  if (s.endsWith("で") && s.length > 2) {
    const base = s.slice(0, -1);
    push(base + "む");
    push(base + "ぶ");
    push(base + "ぬ");
  }

  // Imperative: godan e-stem (書け→書く), ichidan 〜ろ (食べろ→食べる),
  // する→しろ, 来る→来い. Placed after the te-form rules so te-forms keep
  // their existing readings.
  if (s.length >= 2) {
    const lc = s.charAt(s.length - 1);
    const prev = s.charAt(s.length - 2);
    if (s === "来い" || s === "こい") {
      push("来る");
    } else if (s === "しろ") {
      push("する");
    } else if (E_ROW_MAP[lc] && isKanji(prev)) {
      push(s.slice(0, -1) + E_ROW_MAP[lc]);
    } else if (
      lc === "ろ" &&
      (isKanji(prev) || E_ROW_KANA.includes(prev) || I_ROW_KANA.includes(prev) || prev === "し")
    ) {
      push(s.slice(0, -1) + "る");
    }
  }

  // Potential / passive: られる/れる/える
  if (s.endsWith("られる")) push(s.slice(0, -3));
  if (s.endsWith("れる") && s.length > 3) push(s.slice(0, -2));
  if (s.endsWith("える") && s.length > 3) push(s.slice(0, -2));

  // Causative: させる/せる (書かせる→書く; 食べさせる→食べる; 食べせる→食べる)
  {
    const b = tryEnd("させる");
    if (b !== undefined) {
      if (b.endsWith("さ")) push(b.slice(0, -1) + "する"); // 心配させる (causative of する)
      else push(stemToDict(b));
      push(b);
    }
    const c = tryEnd("せる");
    // させる handled above; single-kana stems (きせる) are left alone.
    if (c !== undefined && !s.endsWith("させる") && c.length >= 2) {
      push(stemToDict(c));
      push(c);
    }
  }

  // Godan potential: e-stem + る (書ける→書く; 読める→読む; 来れる→来る).
  // Ambiguous with ichidan dictionary forms (食べる); this is a best guess,
  // placed after the られる/れる/える rules so those keep priority.
  if (
    s.endsWith("る") &&
    s.length > 2 &&
    !s.endsWith("られる") &&
    !s.endsWith("れる") &&
    !s.endsWith("える")
  ) {
    const b = s.slice(0, -1);
    if (b === "され") push("する");
    else {
      const lc = b.charAt(b.length - 1);
      if (E_ROW_MAP[lc]) push(b.slice(0, -1) + E_ROW_MAP[lc]);
    }
  }

  // Desire: たい/たかった
  if (s.endsWith("たかった")) push(s.slice(0, -4));
  if (s.endsWith("たい") && s.length > 3) push(s.slice(0, -2));

  // ば-conditional: ければ (adjectival), れば / e-stem+ば (verbal)
  // (高ければ→高い; 食べれば→食べる; 行けば→行く; すれば→する; 来れば→来る)
  if (s.endsWith("ければ") && s.length > 3) {
    const base = s.slice(0, -3);
    push(base + "い");
    push(base);
  }
  {
    const b = tryEnd("れば");
    if (b !== undefined) push(stemToDict(b) ?? b + "る");
  }
  if (s.endsWith("ば") && s.length > 2) {
    const b = s.slice(0, -1);
    const lc = b.charAt(b.length - 1);
    if (E_ROW_MAP[lc]) push(b.slice(0, -1) + E_ROW_MAP[lc]);
  }

  // Volitional: よう
  if (s.endsWith("よう") && s.length > 3) push(s.slice(0, -3));

  // Godan volitional う: 書こう→書く; 買おう→買う.
  // The kana before the o-row stem must be kanji so だろう etc. are skipped.
  if (s.endsWith("う") && s.length > 2) {
    const b = s.slice(0, -1);
    if (b === "しよ") {
      push("する");
    } else {
      const lc = b.charAt(b.length - 1);
      const prev = b.charAt(b.length - 2);
      if (O_ROW_MAP[lc] && isKanji(prev)) {
        push(b.slice(0, -1) + O_ROW_MAP[lc]);
        push(b);
      }
    }
  }

  // Adjectival: かった (楽しかった→楽しい), くない, そう
  if (s.endsWith("かった") && s.length > 4) {
    const base = s.slice(0, -3);
    push(base + "い");
    push(base);
  }
  if (s.endsWith("くない") && s.length > 4) {
    const base = s.slice(0, -3);
    push(base + "い");
    push(base);
  }

  // Fallback: verb u-stem + る (書く→書く, 話す→話す)
  const last = s.charAt(s.length - 1);
  if (isKana(last) && s.length > 1 && !s.endsWith("る")) {
    const base = s.slice(0, -1);
    if (isHiragana(last)) {
      const kanaRow: Record<string, string> = {
        き: "く", ぎ: "ぐ", し: "す", じ: "ず", ち: "つ", に: "ぬ",
        ひ: "ふ", び: "ぶ", み: "む", り: "る",
      };
      if (kanaRow[last]) push(base + kanaRow[last]);
    }
  }

  candidates.push(s);
  const unique = [...new Set(candidates)].filter((c) => c.length > 0);
  const lemma = unique.length > 1 ? unique[0] : s;
  return { surface: s, lemma };
}

/** Part-of-speech groups treated as function words: skipped, so they are never underlined. */
const FUNCTION_WORD_POS = new Set([
  "助詞", "助動詞", "記号", "感動詞", "接続詞", "連体詞",
]);

/** Kuromoji dictionary directory (browser). Bundled under public/dict/kuromoji for offline use. */
const KUROMOJI_DICT_URL = "/dict/kuromoji/";

function buildTokenizer(): Promise<{ tokenize(text: string): Array<{ surface_form: string; basic_form: string; pos: string; word_position: number; pos_detail_1: string; pos_detail_2: string; pos_detail_3: string; conjugated_type: string; conjugated_form: string; reading?: string }> }> {
  // Dynamic import so kuromoji is code-split out of the main bundle.
  return import("@patdx/kuromoji").then((kuromoji) => {
    if (typeof window !== "undefined") {
      const browserLoader = {
        async loadArrayBuffer(filename: string) {
          const res = await fetch(KUROMOJI_DICT_URL + filename);
          if (!res.ok) {
            throw new Error(`Kuromoji dictionary fetch failed (HTTP ${res.status}): ${filename}`);
          }
          const bytes = new Uint8Array(await res.arrayBuffer());
          if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
            const stream = new Response(bytes).body!.pipeThrough(new DecompressionStream("gzip"));
            return new Response(stream).arrayBuffer();
          }
          return bytes.buffer;
        },
      };
      return new kuromoji.TokenizerBuilder({ loader: browserLoader }).build();
    }
    // Node (tests): read the same bundled dictionaries from disk.
    return import("@patdx/kuromoji/node").then(({ default: NodeDictionaryLoader }) =>
      new kuromoji.TokenizerBuilder({
        loader: new NodeDictionaryLoader({ dic_path: "public/dict/kuromoji/" }),
      }).build(),
    );
  });
}

let tokenizerPromise: ReturnType<typeof buildTokenizer> | null = null;

/** Lazy singleton Kuromoji tokenizer. Rebuilds if a load attempt fails. */
export function getKuromojiTokenizer(): ReturnType<typeof buildTokenizer> {
  if (tokenizerPromise === null) {
    tokenizerPromise = buildTokenizer().catch((err) => {
      tokenizerPromise = null;
      throw err;
    });
  }
  return tokenizerPromise;
}

/**
 * Tokenize Japanese with Kuromoji and map to our Token shape.
 * Function words (particles, auxiliaries, punctuation) are dropped so only
 * content words get underlined; offsets are character indices into `text`.
 */
export async function tokenizeJapanese(text: string): Promise<Token[]> {
  const tokenizer = await getKuromojiTokenizer();
  const tokens: Token[] = [];
  for (const t of tokenizer.tokenize(text)) {
    if (FUNCTION_WORD_POS.has(t.pos)) continue;
    tokens.push({
      surface: t.surface_form,
      lemma: t.basic_form,
      pos: t.pos,
      start: t.word_position - 1,
      length: t.surface_form.length,
      posDetail: [t.pos_detail_1, t.pos_detail_2, t.pos_detail_3],
      conjugatedType: t.conjugated_type,
      conjugatedForm: t.conjugated_form,
      reading: t.reading,
    });
  }
  return tokens;
}

export const JAPANESE_ADAPTER: LanguageAdapter = {
  language: "ja",
  scheme: "JLPT",
  async tokenize(text: string): Promise<Token[]> {
    try {
      return await tokenizeJapanese(text);
    } catch {
      // Fall back to the stub segmenter when the Kuromoji dictionary is unavailable.
      const { tokens } = segmentJapanese(text);
      return tokens.map((t) => ({
        ...t,
        lemma: deinflectJapanese(t.surface).lemma,
      }));
    }
  },
  lemmatize(surface: string): string {
    return deinflectJapanese(surface).lemma;
  },
  levels(): ReturnType<LanguageAdapter["levels"]> {
    return ["N5", "N4", "N3", "N2", "N1"];
  },
};
