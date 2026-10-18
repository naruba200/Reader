/**
 * Japanese grammar pattern detection.
 *
 * Runs the raw Kuromoji token stream (particles and auxiliaries included —
 * unlike `tokenizeJapanese`, which drops function words) over chapter text and
 * matches common grammar patterns with plain-English explanations. Matches
 * carry absolute character offsets so they plug straight into ChapterView's
 * `grammarMatches` prop.
 *
 * Matching is defensive: every rule combines conjugated_type/conjugated_form,
 * part-of-speech details and surface forms, because a single signal is never
 * enough (e.g. られる is passive for ichidan verbs but potential too, and
 * せる after an e-row stem is potential while after an a-row stem it is
 * causative).
 */
import { getKuromojiTokenizer } from "./japanese";

/** One raw Kuromoji token with an absolute character offset. */
export interface GrammarToken {
  surface: string;
  /** Dictionary (basic) form. */
  basic: string;
  pos: string;
  d1: string;
  d2: string;
  d3: string;
  ctype: string;
  cform: string;
  reading?: string;
  /** Absolute character offset into the source text (word_position - 1). */
  offset: number;
  length: number;
}

export interface GrammarPatternDef {
  id: string;
  /** Display label, e.g. "〜てしまう". */
  label: string;
  /** Plain-English explanation (1-2 sentences). */
  explanation: string;
}

export interface GrammarMatch {
  /** Absolute character offsets into the source text. */
  start: number;
  end: number;
  pattern: string;
  definition: string;
}

export const GRAMMAR_PATTERNS: GrammarPatternDef[] = [
  {
    id: "teshimau",
    label: "〜てしまう・〜ちゃう・〜じゃう",
    explanation:
      "Expresses completion, or regret that something ended up happening. Casual speech contracts 〜てしまう to 〜ちゃう/〜じゃう.",
  },
  {
    id: "nakereba",
    label: "〜なければならない・〜なきゃ・〜なくちゃ・〜ないといけない",
    explanation:
      "Expresses obligation: 'must / have to do'. Casual speech shortens it to 〜なきゃ, 〜なくちゃ, or 〜ないと.",
  },
  {
    id: "passive",
    label: "〜れる・〜られる",
    explanation:
      "Passive voice: the subject receives the action (作られる = 'is made'). For ichidan verbs 〜られる also serves as the potential ('can do').",
  },
  {
    id: "causative",
    label: "〜させる・〜せる",
    explanation:
      "Causative: 'make/let someone do' (行かせる = 'make someone go', 食べさせる = 'let someone eat').",
  },
  {
    id: "dekiru",
    label: "〜ことができる",
    explanation:
      "Expresses ability: 'can do' — the formal equivalent of the 〜(ら)れる potential form.",
  },
  {
    id: "tabakari",
    label: "〜たばかり",
    explanation:
      "'Just did': the action happened very recently (食べたばかり = 'just ate').",
  },
  {
    id: "teoku",
    label: "〜ておく・〜とく",
    explanation:
      "'Do in advance / do for later' (準備しておく = 'prepare ahead of time'). Casual speech contracts it to 〜とく.",
  },
  {
    id: "temiru",
    label: "〜てみる",
    explanation:
      "'Try doing': attempt something to see what happens (食べてみる = 'try eating it').",
  },
  {
    id: "tekuruteiku",
    label: "〜てくる・〜ていく",
    explanation:
      "Direction of an action relative to the speaker: 〜てくる is 'go do and come back', 〜ていく is 'go on doing / take away'.",
  },
  {
    id: "teiru",
    label: "〜ている",
    explanation:
      "Progressive or resultant state: 'is doing' or 'has done and remains so' (開いている = 'is open').",
  },
  {
    id: "teageru",
    label: "〜てあげる・〜てくれる・〜てもらう",
    explanation:
      "Giving and receiving favors: 〜てあげる (do for someone), 〜てくれる (someone does for me), 〜てもらう (have someone do for me).",
  },
  {
    id: "sugiru",
    label: "〜すぎる",
    explanation:
      "'Too much': exceeds a proper amount (食べすぎる = 'eat too much', 高すぎる = 'too expensive').",
  },
  {
    id: "yasuikui",
    label: "〜やすい・〜にくい",
    explanation:
      "'Easy to' / 'hard to' do (読みやすい = 'easy to read', 食べにくい = 'hard to eat').",
  },
  {
    id: "nagara",
    label: "〜ながら",
    explanation:
      "'While doing': two actions happen at the same time (歩きながら = 'while walking').",
  },
  {
    id: "ba",
    label: "〜ば",
    explanation:
      "Conditional 'if/when', formal or literary in tone (行けば = 'if one goes').",
  },
  {
    id: "tara",
    label: "〜たら",
    explanation:
      "Conditional 'if/when', the conversational default (降ったら = 'if/when it rains').",
  },
  {
    id: "nara",
    label: "〜なら",
    explanation:
      "'If' for nouns and na-adjectives: a topic-conditional (暇なら = 'if you're free').",
  },
  {
    id: "temo",
    label: "〜ても",
    explanation:
      "'Even if': concession — the result holds regardless (降っても = 'even if it rains').",
  },
  {
    id: "temoii",
    label: "〜てもいい",
    explanation:
      "Permission: 'may do' (入ってもいい = 'you may come in'). 〜なくてもいい means 'don't have to'.",
  },
  {
    id: "youni",
    label: "〜ように",
    explanation:
      "'In order to / so that': purpose or aim (見えるように = 'so that it can be seen').",
  },
  {
    id: "tameni",
    label: "〜ために",
    explanation:
      "'For the sake of / in order to' (勉強のために = 'for the sake of studying').",
  },
  {
    id: "rashii",
    label: "〜らしい",
    explanation:
      "Hearsay ('I heard that...') or typicalness ('typical of...', 男らしい = 'manly').",
  },
  {
    id: "mitai",
    label: "〜みたい",
    explanation:
      "'Looks like / seems': conjecture from what you observe (雨みたい = 'looks like rain').",
  },
  {
    id: "ppoi",
    label: "〜っぽい",
    explanation:
      "'-ish': resembling or smacking of something (子供っぽい = 'childish').",
  },
  {
    id: "souda",
    label: "〜そうだ・〜そう",
    explanation:
      "Hearsay 'I heard that...' (降るそうだ) versus stem + 〜そう for conjecture from appearance (降りそう = 'looks like it will rain').",
  },
  {
    id: "zuni",
    label: "〜ずに・〜ないで",
    explanation:
      "'Without doing' (言わずに = 'without saying', 食べないで = 'without eating').",
  },
  {
    id: "beshi",
    label: "〜べき",
    explanation:
      "'Should / ought to': duty or strong recommendation (守るべき = 'should be kept').",
  },
  {
    id: "hazu",
    label: "〜はず",
    explanation:
      "Expectation: 'supposed to / should be' (来るはず = 'is supposed to come').",
  },
  {
    id: "wake",
    label: "〜わけ",
    explanation:
      "Explains a reason or draws a conclusion: 'it means that / that's why' (できないわけだ = 'no wonder I can't').",
  },
  {
    id: "tokoro",
    label: "〜ところ",
    explanation:
      "Stage of an action: 'about to' (食べるところ), 'in the middle of' (食べているところ), or 'just finished' (食べたところ).",
  },
  {
    id: "monoda",
    label: "〜ものだ・〜ことだ",
    explanation:
      "'Should' as general wisdom, or nostalgic recollection (努力するものだ = 'one should make an effort').",
  },
  {
    id: "zaruwoenai",
    label: "〜ざるを得ない",
    explanation:
      "'Have no choice but to' — formal (行かざるを得ない = 'have no choice but to go').",
  },
  {
    id: "kamoshirenai",
    label: "〜かもしれない",
    explanation:
      "'Might / maybe': uncertainty (雨かもしれない = 'it might rain').",
  },
  {
    id: "darou",
    label: "〜だろう・〜でしょう",
    explanation:
      "'Probably': the speaker's conjecture (降るだろう = 'it will probably rain').",
  },
  {
    id: "tari",
    label: "〜たり〜たりする",
    explanation:
      "Lists representative actions: 'doing things like...' (食べたり飲んだり = 'eating, drinking, and so on').",
  },
  {
    id: "noni",
    label: "〜のに",
    explanation:
      "'Although / even though', often with a nuance of complaint or surprise (雨なのに = 'even though it's raining').",
  },
  {
    id: "nodekara",
    label: "〜ので・〜から",
    explanation:
      "'Because': gives a reason (雨なので = 'because it's raining'). Note 〜から after a noun means 'from'.",
  },
  {
    id: "tekara",
    label: "〜てから",
    explanation:
      "'After doing' (食べてから = 'after eating').",
  },
  {
    id: "toiu",
    label: "〜という",
    explanation:
      "Names or defines: 'called' or 'that' (学生という = 'a person called a student').",
  },
];

const PATTERN_BY_ID = new Map(GRAMMAR_PATTERNS.map((p) => [p.id, p]));

interface ScanCtx {
  t: GrammarToken[];
  used: boolean[];
  out: GrammarMatch[];
}

/**
 * Claim tokens [from, to] for a pattern. When extendStem is set, the claim
 * also reaches back one token if it is a verb/adjective stem, so tapping the
 * stem word still lands inside the highlighted match.
 */
function claim(
  ctx: ScanCtx,
  def: GrammarPatternDef,
  from: number,
  to: number,
  extendStem: boolean,
): void {
  let s = from;
  if (extendStem && from > 0) {
    const p = ctx.t[from - 1];
    if (p.pos === "動詞" || p.pos === "形容詞") s = from - 1;
  }
  for (let k = s; k <= to; k++) if (ctx.used[k]) return;
  for (let k = s; k <= to; k++) ctx.used[k] = true;
  ctx.out.push({
    start: ctx.t[s].offset,
    end: ctx.t[to].offset + ctx.t[to].length,
    pattern: def.label,
    definition: def.explanation,
  });
}

/** 〜なければならない / 〜なきゃ / 〜なくちゃ / 〜ないといけない family. */
const OBLIGATION_RES: RegExp[] = [
  /^なけれ[ば](ならない|いけない|なりません|いけません)$/,
  /^なきゃ(いけない|だめ|いけません)?$/,
  /^なくちゃ(いけない|だめ|いけません)?$/,
  /^ないと(いけない|だめ|いけません)?$/,
  /^なくては(ならない|いけない|だめ|なりません|いけません)$/,
];

/** Longest token-window (up to 6) whose joined surfaces form an obligation pattern. -1 if none. */
function matchObligation(t: GrammarToken[], i: number): number {
  let s = "";
  let best = -1;
  for (let k = 0; k < 6 && i + k < t.length; k++) {
    s += t[i + k].surface;
    if (s.length > 12) break;
    if (OBLIGATION_RES.some((re) => re.test(s))) best = k;
  }
  return best;
}

function scanTokens(t: GrammarToken[]): GrammarMatch[] {
  const ctx: ScanCtx = { t, used: new Array(t.length).fill(false), out: [] };
  const D = (id: string): GrammarPatternDef => PATTERN_BY_ID.get(id)!;

  for (let i = 0; i < t.length; i++) {
    const tok = t[i];
    const prev = i > 0 ? t[i - 1] : undefined;
    const next = i + 1 < t.length ? t[i + 1] : undefined;
    const prevIsTe = prev?.surface === "て" || prev?.surface === "で";

    // 〜ざるを得ない (most specific first)
    if (
      tok.surface === "ざる" &&
      next?.surface === "を" &&
      t[i + 2]?.basic === "得る" &&
      t[i + 3]?.basic === "ない"
    ) {
      claim(ctx, D("zaruwoenai"), i, i + 3, true);
      continue;
    }

    // 〜なければならない family (window join over surfaces)
    if (
      tok.basic === "ない" ||
      tok.surface === "なけれ" ||
      tok.surface === "なきゃ" ||
      tok.surface === "なくちゃ"
    ) {
      const k = matchObligation(t, i);
      if (k >= 0) {
        claim(ctx, D("nakereba"), i, i + k, true);
        continue;
      }
    }

    // 〜てしまう / 〜ちゃう / 〜じゃう
    if (tok.basic === "しまう" && tok.d1 === "非自立" && prevIsTe) {
      claim(ctx, D("teshimau"), i - 1, i, true);
      continue;
    }
    if ((tok.basic === "ちゃう" || tok.basic === "じゃう") && prev?.pos === "動詞") {
      claim(ctx, D("teshimau"), i - 1, i, false);
      continue;
    }

    // 〜れる / 〜られる (passive; ichidan 〜られる doubles as potential)
    if (
      (tok.basic === "れる" || tok.basic === "られる") &&
      tok.d1 === "接尾" &&
      prev?.pos === "動詞"
    ) {
      claim(ctx, D("passive"), i - 1, i, false);
      continue;
    }

    // 〜させる (causative). Single-token godan potentials like 話せる are
    // morphologically indistinguishable from ichidan verbs, so 〜せる is
    // deliberately not claimed here; ability is covered by 〜ことができる.
    if (tok.basic === "させる" && tok.d1 === "接尾" && prev?.pos === "動詞") {
      claim(ctx, D("causative"), i - 1, i, false);
      continue;
    }

    // 〜たばかり
    if (
      tok.basic === "た" &&
      tok.pos === "助動詞" &&
      (next?.surface === "ばかり" || next?.surface === "ばっかり")
    ) {
      claim(ctx, D("tabakari"), i, i + 1, true);
      continue;
    }

    // 〜ておく / 〜とく
    if (tok.basic === "おく" && tok.d1 === "非自立" && prevIsTe) {
      claim(ctx, D("teoku"), i - 1, i, true);
      continue;
    }
    if (tok.basic === "とく" && tok.d1 === "非自立" && prev?.pos === "動詞") {
      claim(ctx, D("teoku"), i - 1, i, false);
      continue;
    }

    // 〜てみる / 〜てくる・〜ていく / 〜ている / 〜てあげる・〜てくれる・〜てもらう
    if (tok.basic === "みる" && tok.d1 === "非自立" && prevIsTe) {
      claim(ctx, D("temiru"), i - 1, i, true);
      continue;
    }
    if (
      (tok.basic === "くる" || tok.basic === "いく" || tok.basic === "ゆく") &&
      tok.d1 === "非自立" &&
      prevIsTe
    ) {
      claim(ctx, D("tekuruteiku"), i - 1, i, true);
      continue;
    }
    if (tok.basic === "いる" && tok.d1 === "非自立" && prevIsTe) {
      claim(ctx, D("teiru"), i - 1, i, true);
      continue;
    }
    if (
      (tok.basic === "あげる" || tok.basic === "くれる" || tok.basic === "もらう") &&
      tok.d1 === "非自立" &&
      prevIsTe
    ) {
      claim(ctx, D("teageru"), i - 1, i, true);
      continue;
    }

    // 〜すぎる / 〜やすい・〜にくい (d1=非自立 separates them from the main verbs)
    if (tok.basic === "すぎる" && tok.d1 === "非自立") {
      claim(ctx, D("sugiru"), i, i, true);
      continue;
    }
    if (
      (tok.basic === "やすい" || tok.basic === "にくい") &&
      tok.d1 === "非自立" &&
      prev?.pos === "動詞"
    ) {
      claim(ctx, D("yasuikui"), i - 1, i, false);
      continue;
    }

    // 〜ながら / 〜ば / 〜たら / 〜なら
    if (tok.surface === "ながら" && tok.pos === "助詞" && prev?.pos === "動詞") {
      claim(ctx, D("nagara"), i - 1, i, false);
      continue;
    }
    if (tok.surface === "ば" && tok.d1 === "接続助詞" && prev?.cform === "仮定形") {
      claim(ctx, D("ba"), i - 1, i, false);
      continue;
    }
    if (tok.surface === "たら" && tok.pos === "助動詞") {
      claim(ctx, D("tara"), i, i, true);
      continue;
    }
    if (tok.surface === "なら" && tok.basic === "だ") {
      claim(ctx, D("nara"), i, i, false);
      continue;
    }

    // 〜てもいい before 〜ても (the も token is shared)
    if (
      tok.surface === "も" &&
      tok.d1 === "係助詞" &&
      prevIsTe &&
      (next?.basic === "いい" || next?.basic === "よい")
    ) {
      const from = t[i - 2]?.basic === "ない" ? i - 2 : i - 1;
      claim(ctx, D("temoii"), from, i + 1, true);
      continue;
    }
    if (
      tok.surface === "も" &&
      tok.d1 === "係助詞" &&
      prevIsTe &&
      t[i - 2]?.pos === "動詞"
    ) {
      claim(ctx, D("temo"), i - 2, i, false);
      continue;
    }

    // 〜ように / 〜ために
    if (tok.surface === "に" && prev?.surface === "よう" && prev.pos === "名詞") {
      claim(ctx, D("youni"), i - 1, i, false);
      continue;
    }
    if (tok.surface === "に" && prev?.basic === "ため" && prev.pos === "名詞") {
      claim(ctx, D("tameni"), i - 1, i, false);
      continue;
    }

    // 〜らしい / 〜みたい / 〜っぽい
    if (tok.basic === "らしい" && tok.pos === "助動詞") {
      claim(ctx, D("rashii"), i, i, false);
      continue;
    }
    if (tok.basic === "みたい" && tok.d1 === "非自立") {
      claim(ctx, D("mitai"), i, i, false);
      continue;
    }
    if (tok.basic === "っぽい") {
      claim(ctx, D("ppoi"), i, i, false);
      continue;
    }

    // 〜そう (conjecture: d1=接尾) vs 〜そうだ (hearsay: d1=特殊 + だ)
    if (tok.basic === "そう" && tok.d1 === "接尾") {
      claim(ctx, D("souda"), i, i, true);
      continue;
    }
    if (
      tok.basic === "そう" &&
      tok.d1 === "特殊" &&
      (next?.basic === "だ" || next?.surface === "です")
    ) {
      claim(ctx, D("souda"), i, i + 1, false);
      continue;
    }

    // 〜ずに / 〜ないで (ず and ざる both have basic_form ぬ)
    if (tok.basic === "ぬ" && tok.surface === "ず" && next?.surface === "に") {
      claim(ctx, D("zuni"), i, i + 1, true);
      continue;
    }
    if (
      tok.basic === "ない" &&
      tok.pos === "助動詞" &&
      next?.surface === "で" &&
      next.d1 === "接続助詞"
    ) {
      claim(ctx, D("zuni"), i, i + 1, true);
      continue;
    }

    // 〜べき (basic べし) / 〜はず / 〜わけ / 〜ところ / 〜ものだ・〜ことだ
    if (tok.basic === "べし") {
      claim(ctx, D("beshi"), i, i, false);
      continue;
    }
    if (tok.basic === "はず" && tok.d1 === "非自立") {
      claim(ctx, D("hazu"), i, i, false);
      continue;
    }
    if (tok.basic === "わけ" && tok.d1 === "非自立") {
      claim(ctx, D("wake"), i, i, false);
      continue;
    }
    if (tok.basic === "ところ" && tok.d1 === "非自立") {
      claim(ctx, D("tokoro"), i, i, false);
      continue;
    }
    if (
      (tok.basic === "もの" || tok.basic === "こと") &&
      tok.d1 === "非自立" &&
      next?.basic === "だ"
    ) {
      claim(ctx, D("monoda"), i, i + 1, false);
      continue;
    }

    // 〜ことができる
    if (
      tok.basic === "できる" &&
      prev?.surface === "が" &&
      t[i - 2]?.basic === "こと"
    ) {
      claim(ctx, D("dekiru"), i - 2, i, false);
      continue;
    }

    // 〜かもしれない / 〜だろう・〜でしょう
    if (
      tok.surface === "かも" &&
      next?.basic === "しれる" &&
      t[i + 2]?.basic === "ない"
    ) {
      claim(ctx, D("kamoshirenai"), i, i + 2, false);
      continue;
    }
    if (
      (tok.surface === "だろ" || tok.surface === "でしょ") &&
      next?.surface === "う"
    ) {
      claim(ctx, D("darou"), i, i + 1, false);
      continue;
    }

    // 〜たり〜たりする (だり is the voiced variant)
    if ((tok.basic === "たり" || tok.basic === "だり") && tok.d1 === "並立助詞") {
      claim(ctx, D("tari"), i, next?.basic === "する" ? i + 1 : i, true);
      continue;
    }

    // 〜のに (single token, or の+に after an auxiliary like た/ない/な)
    if (tok.surface === "のに") {
      claim(ctx, D("noni"), i, i, false);
      continue;
    }
    if (
      tok.surface === "の" &&
      tok.d1 === "非自立" &&
      next?.surface === "に" &&
      prev?.pos === "助動詞"
    ) {
      claim(ctx, D("noni"), i, i + 1, false);
      continue;
    }

    // 〜ので / 〜てから / 〜から (because; から after a noun means "from")
    if (tok.surface === "ので") {
      claim(ctx, D("nodekara"), i, i, false);
      continue;
    }
    if (tok.surface === "から" && tok.pos === "助詞") {
      if (prevIsTe && t[i - 2]?.pos === "動詞") {
        claim(ctx, D("tekara"), i - 1, i, false);
      } else if (
        prev &&
        (prev.pos === "助動詞" || prev.pos === "動詞" || prev.pos === "形容詞")
      ) {
        claim(ctx, D("nodekara"), i, i, false);
      }
      continue;
    }

    // 〜という
    if (tok.surface === "という") {
      claim(ctx, D("toiu"), i, i, false);
      continue;
    }
  }

  ctx.out.sort((a, b) => a.start - b.start);
  return ctx.out;
}

/**
 * Detect grammar patterns in Japanese text. Returns matches with absolute
 * character offsets. Returns [] when the tokenizer is unavailable.
 */
export async function detectGrammar(text: string): Promise<GrammarMatch[]> {
  if (!text || !text.trim()) return [];
  let tokens: GrammarToken[];
  try {
    const tokenizer = await getKuromojiTokenizer();
    tokens = tokenizer.tokenize(text).map((t) => ({
      surface: t.surface_form,
      basic: t.basic_form,
      pos: t.pos,
      d1: t.pos_detail_1,
      d2: t.pos_detail_2,
      d3: t.pos_detail_3,
      ctype: t.conjugated_type,
      cform: t.conjugated_form,
      reading: t.reading,
      offset: t.word_position - 1,
      length: t.surface_form.length,
    }));
  } catch {
    return [];
  }
  try {
    return scanTokens(tokens);
  } catch {
    return [];
  }
}
