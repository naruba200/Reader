import { describe, it, expect } from "vitest";
import { KANGXI_RADICALS, radicalForKanji, kanjiWithRadical } from "./radicals";

describe("Kangxi radicals", () => {
  it("covers all 214 radicals with a character, meaning and stroke count", () => {
    expect(KANGXI_RADICALS).toHaveLength(214);
    for (let n = 1; n <= 214; n++) {
      const r = KANGXI_RADICALS[n - 1];
      expect(r.number).toBe(n);
      expect(r.char.length).toBe(1);
      expect(r.meaning.length).toBeGreaterThan(0);
      expect(r.strokes).toBeGreaterThanOrEqual(1);
      expect(r.strokes).toBeLessThanOrEqual(17);
    }
  });

  it("maps known kanji to their classical radical", () => {
    const cases: Array<[string, number, string]> = [
      ["明", 72, "日"],
      ["林", 75, "木"],
      ["海", 85, "水"],
      ["休", 9, "人"],
      ["語", 149, "言"],
      ["愛", 61, "心"],
      ["飲", 184, "食"],
      ["曜", 72, "日"],
      ["鬱", 192, "鬯"],
      ["亜", 7, "二"],
      ["働", 9, "人"],
      ["読", 149, "言"],
      ["歌", 76, "欠"],
      ["勉", 19, "力"],
      ["頭", 181, "頁"],
      ["親", 147, "見"],
      ["子", 39, "子"],
      ["安", 40, "宀"],
      ["国", 31, "囗"],
    ];
    for (const [kanji, num, char] of cases) {
      const r = radicalForKanji(kanji);
      expect(r?.number).toBe(num);
      expect(r?.char).toBe(char);
    }
  });

  it("a radical character maps to itself", () => {
    expect(radicalForKanji("日")?.number).toBe(72);
    expect(radicalForKanji("水")?.number).toBe(85);
    expect(radicalForKanji("木")?.number).toBe(75);
  });

  it("returns undefined for non-kanji and unknown characters", () => {
    expect(radicalForKanji("a")).toBeUndefined();
    expect(radicalForKanji("あ")).toBeUndefined();
    expect(radicalForKanji("")).toBeUndefined();
  });

  it("kanjiWithRadical groups kanji under their radical", () => {
    expect(kanjiWithRadical(72)).toContain("明");
    expect(kanjiWithRadical(72)).toContain("日");
    expect(kanjiWithRadical(999)).toBe("");
  });
});
