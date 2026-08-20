import * as kuromoji from "@patdx/kuromoji";
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
 * desire, passive, and volitional. Not exhaustive — a real morphological
 * analyzer (MeCab / kuromoji) is the production upgrade path.
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

  // Polite: ます/ません/ました/ませんでした/ましょう → る-form stem
  push(tryEnd("ませんでした"));
  push(tryEnd("ません"));
  push(tryEnd("ました"));
  push(tryEnd("ましょう"));
  push(tryEnd("ます"));

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

  // Potential / passive: られる/れる/える
  if (s.endsWith("られる")) push(s.slice(0, -3));
  if (s.endsWith("れる") && s.length > 3) push(s.slice(0, -2));
  if (s.endsWith("える") && s.length > 3) push(s.slice(0, -2));

  // Desire: たい/たかった
  if (s.endsWith("たかった")) push(s.slice(0, -4));
  if (s.endsWith("たい") && s.length > 3) push(s.slice(0, -2));

  // Volitional: よう
  if (s.endsWith("よう") && s.length > 3) push(s.slice(0, -3));

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

/**
 * Browser dictionary loader that handles both kinds of servers: those that
 * pre-compress `.gz` files (Content-Encoding: gzip, e.g. Vite dev/preview) and
 * those that serve the raw gzip bytes (e.g. file:// on Android). Sniffs the
 * gzip magic bytes and decompresses only when needed.
 */
const browserLoader: kuromoji.LoaderConfig = {
  async loadArrayBuffer(filename) {
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

/** Resolved tokenizer type (the Tokenizer class is not exported by the package). */
type KuromojiTokenizer = Awaited<ReturnType<kuromoji.TokenizerBuilder["build"]>>;

function buildTokenizer(): Promise<KuromojiTokenizer> {
  if (typeof window !== "undefined") {
    return new kuromoji.TokenizerBuilder({ loader: browserLoader }).build();
  }
  // Node (tests): read the same bundled dictionaries from disk. Dynamically
  // imported so the browser bundle never pulls in fs/zlib.
  return import("@patdx/kuromoji/node").then(({ default: NodeDictionaryLoader }) =>
    new kuromoji.TokenizerBuilder({
      loader: new NodeDictionaryLoader({ dic_path: "public/dict/kuromoji/" }),
    }).build(),
  );
}

let tokenizerPromise: Promise<KuromojiTokenizer> | null = null;

/** Lazy singleton Kuromoji tokenizer. Rebuilds if a load attempt fails. */
export function getKuromojiTokenizer(): Promise<KuromojiTokenizer> {
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
