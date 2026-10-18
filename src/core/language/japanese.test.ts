import { describe, expect, it } from "vitest";
import { deinflectJapanese } from "./japanese";

const lemma = (surface: string): string => deinflectJapanese(surface).lemma;

describe("deinflectJapanese — pre-existing rules (regression)", () => {
  it("strips polite ます to the stem", () => {
    expect(lemma("食べます")).toBe("食べ");
  });
  it("strips plain past た to the stem", () => {
    expect(lemma("食べた")).toBe("食べ");
  });
  it("strips negative ない to the stem", () => {
    expect(lemma("行かない")).toBe("行か");
  });
  it("strips te-form て to the stem", () => {
    expect(lemma("食べて")).toBe("食べ");
  });
  it("strips potential/passive られる", () => {
    expect(lemma("見られる")).toBe("見");
  });
  it("strips desire たい", () => {
    expect(lemma("食べたい")).toBe("食べ");
  });
  it("leaves most dictionary forms alone", () => {
    expect(lemma("書く")).toBe("書く");
  });
  it("has a pre-existing slice quirk on よう (documents current behavior)", () => {
    // The よう rule slices 3 chars for a 2-char suffix; kept as-is.
    expect(lemma("食べよう")).toBe("食");
  });
  it("adjectival かった is shadowed by the earlier た rule (documents current behavior)", () => {
    // The plain-past た rule fires before the adjectival かった rule; kept as-is.
    expect(lemma("楽しかった")).toBe("楽しかっ");
  });
});

describe("deinflectJapanese — causative", () => {
  it("handles godan causative せる/させる", () => {
    expect(lemma("書かせる")).toBe("書く");
  });
  it("handles ichidan causative させる", () => {
    expect(lemma("食べさせる")).toBe("食べる");
  });
  it("handles short causative せる", () => {
    expect(lemma("食べせる")).toBe("食べる");
  });
});

describe("deinflectJapanese — contractions", () => {
  it("expands ちゃう (〜てしまう)", () => {
    expect(lemma("食べちゃう")).toBe("食べる");
    expect(lemma("書いちゃう")).toBe("書く");
  });
  it("expands じゃう (〜でしまう)", () => {
    expect(lemma("読んじゃう")).toBe("読む");
  });
  it("expands とく (〜ておく)", () => {
    expect(lemma("食べとく")).toBe("食べる");
    expect(lemma("読んどく")).toBe("読む");
    expect(lemma("しとく")).toBe("する");
  });
  it("expands てる (〜ている)", () => {
    expect(lemma("見てる")).toBe("見る");
    expect(lemma("書いてる")).toBe("書く");
  });
});

describe("deinflectJapanese — conditionals and obligation", () => {
  it("handles 〜たら", () => {
    expect(lemma("食べたら")).toBe("食べる");
    expect(lemma("行ったら")).toBe("行く");
    expect(lemma("読んだら")).toBe("読む");
    expect(lemma("したら")).toBe("する");
  });
  it("handles ば-conditional", () => {
    expect(lemma("食べれば")).toBe("食べる");
    expect(lemma("行けば")).toBe("行く");
    expect(lemma("すれば")).toBe("する");
    expect(lemma("来れば")).toBe("来る");
  });
  it("handles adjectival ければ", () => {
    expect(lemma("高ければ")).toBe("高い");
  });
  it("handles なきゃ/なくちゃ/ないと (〜なければならない)", () => {
    expect(lemma("行かなきゃ")).toBe("行く");
    expect(lemma("食べなくちゃ")).toBe("食べる");
    expect(lemma("食べないと")).toBe("食べる");
  });
  it("handles なければ", () => {
    expect(lemma("行かなければ")).toBe("行く");
  });
});

describe("deinflectJapanese — negatives ず/ぬ", () => {
  it("maps ず to the dictionary form", () => {
    expect(lemma("行かず")).toBe("行く");
    expect(lemma("食べず")).toBe("食べる");
    expect(lemma("せず")).toBe("する");
  });
  it("maps literary ぬ to the dictionary form", () => {
    expect(lemma("行かぬ")).toBe("行く");
    expect(lemma("食べぬ")).toBe("食べる");
  });
  it("does not touch the dictionary form 死ぬ", () => {
    expect(lemma("死ぬ")).toBe("死ぬ");
  });
});

describe("deinflectJapanese — potential, volitional, imperative", () => {
  it("handles godan potential", () => {
    expect(lemma("書ける")).toBe("書く");
    expect(lemma("読める")).toBe("読む");
  });
  it("godan potential is ambiguous with ichidan headwords (known limitation)", () => {
    // e-row + る surfaces are identical for godan potential (書ける→書く) and
    // ichidan dictionary forms (食べる). The rule prefers the potential
    // reading; without POS tagging this cannot be disambiguated.
    expect(lemma("食べる")).toBe("食ぶ");
  });
  it("handles godan volitional う", () => {
    expect(lemma("書こう")).toBe("書く");
    expect(lemma("買おう")).toBe("買う");
    expect(lemma("しよう")).toBe("する");
  });
  it("handles imperatives", () => {
    expect(lemma("書け")).toBe("書く");
    expect(lemma("食べろ")).toBe("食べる");
    expect(lemma("しろ")).toBe("する");
    expect(lemma("来い")).toBe("来る");
  });
});
