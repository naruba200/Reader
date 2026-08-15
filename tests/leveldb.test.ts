import { describe, it, expect } from "vitest";
import { MemoryLevelDb } from "../src/core/leveldb/LevelDb";
import { CEFR_EN_SAMPLE } from "../src/core/leveldb/data/cefr.en";
import { JLPT_JA_SAMPLE } from "../src/core/leveldb/data/jlpt.ja";

describe("MemoryLevelDb", () => {
  it("stores and looks up entries by normalized key", () => {
    const db = new MemoryLevelDb("CEFR", [
      ["Hello", "A1"],
      ["hello", "A2"],
    ]);
    expect(db.lookup("HELLO")).toBe("A1");
    expect(db.lookup("hello")).toBe("A1");
    expect(db.lookup("missing")).toBeUndefined();
    expect(db.size()).toBe(1);
  });

  it("keeps the first level when the same word is added twice", () => {
    const db = new MemoryLevelDb("CEFR", [
      ["work", "A1"],
      ["work", "B1"],
    ]);
    expect(db.lookup("work")).toBe("A1");
    expect(db.size()).toBe(1);
  });

  it("clears all entries", () => {
    const db = new MemoryLevelDb("CEFR", [["word", "B2"]]);
    db.clear();
    expect(db.lookup("word")).toBeUndefined();
    expect(db.size()).toBe(0);
  });
});

describe("CEFR_EN_SAMPLE", () => {
  it("has valid entries and levels", () => {
    const levels = new Set(CEFR_EN_SAMPLE.map(([, level]) => level));
    expect(levels.size).toBeGreaterThan(0);
    for (const entry of CEFR_EN_SAMPLE) {
      expect(entry.length).toBe(2);
      expect(entry[0].length).toBeGreaterThan(0);
      expect(["A1", "A2", "B1", "B2", "C1", "C2"]).toContain(entry[1]);
    }
  });

  it("loads into a LevelDb with correct dedup and size", () => {
    const db = new MemoryLevelDb(
      "CEFR",
      CEFR_EN_SAMPLE.map(([word, level]) => [word, level]),
    );
    expect(db.size()).toBeLessThanOrEqual(CEFR_EN_SAMPLE.length);
    expect(db.size()).toBeGreaterThan(CEFR_EN_SAMPLE.length * 0.95);
    expect(db.lookup("the")).toBe("A1");
    expect(db.lookup("WORD")).toBeDefined();
  });
});

describe("JLPT_JA_SAMPLE", () => {
  it("has valid entries and levels", () => {
    const levels = new Set(JLPT_JA_SAMPLE.map(([, , , level]) => level));
    expect(levels.size).toBeGreaterThan(0);
    for (const [kanji, kana, gloss, level] of JLPT_JA_SAMPLE) {
      expect(kanji.length).toBeGreaterThan(0);
      expect(kana.length).toBeGreaterThan(0);
      expect(gloss.length).toBeGreaterThan(0);
      expect(["N5", "N4", "N3", "N2", "N1"]).toContain(level);
    }
  });

  it("has no duplicate kanji forms", () => {
    const kanji = JLPT_JA_SAMPLE.map(([kanji]) => kanji);
    expect(new Set(kanji).size).toBe(kanji.length);
  });

  it("builds a working in-memory level db", () => {
    const db = new MemoryLevelDb(
      "JLPT",
      JLPT_JA_SAMPLE.map(
        ([kanji, , , level]): readonly [string, typeof level] => [kanji, level],
      ).concat(
        JLPT_JA_SAMPLE.map(
          ([, kana, , level]): readonly [string, typeof level] => [kana, level],
        ),
      ),
    );
    expect(db.lookup("水")).toBe("N5");
    expect(db.lookup("みず")).toBe("N5");
    expect(db.lookup("車")).toBe("N5");
    expect(db.lookup("関係ないことば")).toBeUndefined();
  });
});
