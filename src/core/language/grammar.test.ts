import { describe, expect, it } from "vitest";
import { detectGrammar, GRAMMAR_PATTERNS } from "./grammar";

const label = (id: string): string => GRAMMAR_PATTERNS.find((p) => p.id === id)!.label;

async function labelsFor(text: string): Promise<string[]> {
  const ms = await detectGrammar(text);
  return ms.map((m) => m.pattern);
}

async function matchFor(text: string, id: string) {
  const ms = await detectGrammar(text);
  return ms.find((m) => m.pattern === label(id));
}

describe("detectGrammar", () => {
  it("detects 〜てしまう and its contractions", async () => {
    expect(await labelsFor("宿題を忘れてしまった。")).toContain(label("teshimau"));
    expect(await labelsFor("ケーキを全部食べちゃった。")).toContain(label("teshimau"));
    expect(await labelsFor("ジュースを飲んじゃった。")).toContain(label("teshimau"));
  });

  it("detects obligation patterns", async () => {
    expect(await labelsFor("明日までに提出しなければならない。")).toContain(label("nakereba"));
    expect(await labelsFor("早く行かなきゃ。")).toContain(label("nakereba"));
    expect(await labelsFor("宿題をやらなくちゃ。")).toContain(label("nakereba"));
    expect(await labelsFor("野菜を食べないといけない。")).toContain(label("nakereba"));
  });

  it("detects passive and causative", async () => {
    expect(await labelsFor("このケーキは母に作られた。")).toContain(label("passive"));
    expect(await labelsFor("子供に野菜を食べさせた。")).toContain(label("causative"));
  });

  it("detects 〜ことができる for ability", async () => {
    expect(await labelsFor("彼は泳ぐことができる。")).toContain(label("dekiru"));
  });

  it("detects 〜たばかり and 〜ておく", async () => {
    expect(await labelsFor("今食べたばかりだ。")).toContain(label("tabakari"));
    expect(await labelsFor("明日のために準備しておく。")).toContain(label("teoku"));
    expect(await labelsFor("メモしとくね。")).toContain(label("teoku"));
  });

  it("detects 〜てみる, 〜てくれる, 〜ていく, 〜ている", async () => {
    expect(await labelsFor("この本を読んでみる。")).toContain(label("temiru"));
    expect(await labelsFor("友達が遊びに来てくれた。")).toContain(label("teageru"));
    expect(await labelsFor("歩いていく。")).toContain(label("tekuruteiku"));
    expect(await labelsFor("子供が外で遊んでいる。")).toContain(label("teiru"));
  });

  it("detects 〜すぎる and 〜やすい", async () => {
    expect(await labelsFor("ケーキを食べすぎた。")).toContain(label("sugiru"));
    expect(await labelsFor("この本は読みやすい。")).toContain(label("yasuikui"));
  });

  it("detects conditionals 〜ば, 〜たら, 〜なら, 〜ても", async () => {
    expect(await labelsFor("安ければ買う。")).toContain(label("ba"));
    expect(await labelsFor("雨が降ったら中止だ。")).toContain(label("tara"));
    expect(await labelsFor("暇なら来て。")).toContain(label("nara"));
    expect(await labelsFor("雨が降っても行く。")).toContain(label("temo"));
    expect(await labelsFor("ここに入ってもいいよ。")).toContain(label("temoii"));
  });

  it("detects purpose patterns 〜ように and 〜ために", async () => {
    expect(await labelsFor("見えるように大きく書いた。")).toContain(label("youni"));
    expect(await labelsFor("勉強のために早起きする。")).toContain(label("tameni"));
  });

  it("detects 〜ながら, 〜みたい, 〜っぽい, 〜そう", async () => {
    expect(await labelsFor("歩きながら話す。")).toContain(label("nagara"));
    expect(await labelsFor("雨みたいだ。")).toContain(label("mitai"));
    expect(await labelsFor("子供っぽい服。")).toContain(label("ppoi"));
    expect(await labelsFor("雨が降りそうだ。")).toContain(label("souda"));
    expect(await labelsFor("彼は来るそうだ。")).toContain(label("souda"));
  });

  it("detects 〜ずに, 〜べき, 〜はず, 〜わけ, 〜ところ, 〜ものだ", async () => {
    expect(await labelsFor("何も言わずに帰った。")).toContain(label("zuni"));
    expect(await labelsFor("守るべき約束だ。")).toContain(label("beshi"));
    expect(await labelsFor("彼は来るはずだ。")).toContain(label("hazu"));
    expect(await labelsFor("できないわけだ。")).toContain(label("wake"));
    expect(await labelsFor("今食べるところだ。")).toContain(label("tokoro"));
    expect(await labelsFor("努力するものだ。")).toContain(label("monoda"));
  });

  it("detects 〜ざるを得ない, 〜かもしれない, 〜だろう, 〜たり, 〜のに, 〜ので, 〜てから", async () => {
    expect(await labelsFor("行かざるを得ない。")).toContain(label("zaruwoenai"));
    expect(await labelsFor("明日は雨かもしれない。")).toContain(label("kamoshirenai"));
    expect(await labelsFor("明日は降るだろう。")).toContain(label("darou"));
    expect(await labelsFor("食べたり飲んだりした。")).toContain(label("tari"));
    expect(await labelsFor("雨なのに出かけた。")).toContain(label("noni"));
    expect(await labelsFor("雨なので休む。")).toContain(label("nodekara"));
    expect(await labelsFor("食べてから出かける。")).toContain(label("tekara"));
  });

  it("does not mistake から meaning 'from' for the reason particle", async () => {
    expect(await labelsFor("東京から来た。")).not.toContain(label("nodekara"));
  });

  it("returns absolute offsets that slice back to the matched text", async () => {
    const text = "宿題を忘れてしまった。";
    const m = await matchFor(text, "teshimau");
    expect(m).toBeDefined();
    expect(text.slice(m!.start, m!.end)).toContain("てしまっ");
  });

  it("returns [] for empty text and never throws on odd input", async () => {
    expect(await detectGrammar("")).toEqual([]);
    expect(await detectGrammar("   ")).toEqual([]);
    const ms = await detectGrammar("Hello, world! 123");
    expect(Array.isArray(ms)).toBe(true);
  });

  it("exposes a catalog with ids, labels and plain-English explanations", async () => {
    expect(GRAMMAR_PATTERNS.length).toBeGreaterThanOrEqual(25);
    for (const p of GRAMMAR_PATTERNS) {
      expect(p.id).toMatch(/^[a-z0-9]+$/);
      expect(p.label).toContain("〜");
      expect(p.explanation.length).toBeGreaterThan(20);
    }
  });
});
