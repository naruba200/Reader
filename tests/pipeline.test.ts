import { describe, it, expect } from "vitest";
import { PriorityQueue, MemoryPageCache, DocumentProcessor } from "../src/core/pipeline";
import { computeDifficulty, ratingFor } from "../src/core/analysis";
import { MemoryLevelDb } from "../src/core/leveldb/LevelDb";
import { ENGLISH_ADAPTER } from "../src/core/language";
import { MemoryDictionaryStore } from "../src/core/dictionary";

describe("PriorityQueue", () => {
  it("pops items in priority order", () => {
    const q = new PriorityQueue<string>();
    q.push("low", 1);
    q.push("high", 10);
    q.push("mid", 5);
    expect(q.pop()).toBe("high");
    expect(q.pop()).toBe("mid");
    expect(q.pop()).toBe("low");
    expect(q.pop()).toBeUndefined();
  });

  it("is FIFO for equal priorities", () => {
    const q = new PriorityQueue<string>();
    q.push("a", 1);
    q.push("b", 1);
    q.push("c", 1);
    expect(q.pop()).toBe("a");
    expect(q.pop()).toBe("b");
    expect(q.pop()).toBe("c");
  });

  it("reports size and supports clear", () => {
    const q = new PriorityQueue<string>();
    q.push("a", 1);
    q.push("b", 2);
    expect(q.size).toBe(2);
    expect(q.peek()).toBe("b");
    q.clear();
    expect(q.size).toBe(0);
  });
});

describe("MemoryPageCache", () => {
  it("returns cached results only for matching checksum", async () => {
    const cache = new MemoryPageCache();
    const result = {
      pageId: "p1",
      checksum: "abc",
      analyzedAt: 1,
      tokens: [],
      analysis: {
        sectionId: "", totalWords: 0, unknownWords: 0,
        levelCounts: {}, hardRatio: 0, coverage: 1, rating: "Easy" as const,
      },
    };
    await cache.set(result);
    expect((await cache.get("p1", "abc"))?.checksum).toBe("abc");
    expect(await cache.get("p1", "diff")).toBeUndefined();
    await cache.delete("p1");
    expect(await cache.get("p1", "abc")).toBeUndefined();
  });
});

describe("computeDifficulty", () => {
  const tokens = [
    { surface: "the", lemma: "the", start: 0, length: 3, level: "A1" },
    { surface: "xylophone", lemma: "xylophone", start: 4, length: 9, level: "C2" },
    { surface: "quixotic", lemma: "quixotic", start: 14, length: 8, level: "UNKNOWN" },
  ] as const;

  it("computes coverage and hard ratio", () => {
    const analysis = computeDifficulty(tokens);
    expect(analysis.totalWords).toBe(3);
    expect(analysis.unknownWords).toBe(1);
    expect(analysis.coverage).toBeCloseTo(2 / 3);
    expect(analysis.hardRatio).toBeCloseTo(1 / 3);
    expect(analysis.levelCounts["A1"]).toBe(1);
  });

  it("rates text with many unknown words as hard", () => {
    const allUnknown = tokens.map((t) => ({ ...t, level: "UNKNOWN" as const }));
    expect(computeDifficulty(allUnknown).rating).toBe("Very Hard");
  });

  it("rates a mix of easy known words", () => {
    const easy = tokens.map((t) => ({ ...t, level: "A1" as const }));
    expect(computeDifficulty(easy).rating).toBe("Very Easy");
  });
});

describe("ratingFor", () => {
  it("maps scores to rating bands", () => {
    expect(ratingFor(0.1)).toBe("Very Easy");
    expect(ratingFor(0.3)).toBe("Easy");
    expect(ratingFor(0.5)).toBe("Moderate");
    expect(ratingFor(0.7)).toBe("Hard");
    expect(ratingFor(0.9)).toBe("Very Hard");
  });
});

describe("DocumentProcessor", () => {
  it("analyzes a page and resolves levels", async () => {
    const levelDb = new MemoryLevelDb("CEFR", [
      ["the", "A1"], ["quick", "B1"], ["fox", "B2"],
    ]);
    const processor = new DocumentProcessor(ENGLISH_ADAPTER, levelDb);
    const result = await processor.analyzePage({ id: "p1", text: "The quick fox" });
    expect(result.fromCache).toBe(false);
    expect(result.analysis.totalWords).toBe(3);
    expect(result.tokens.map((t) => t.level)).toEqual(["A1", "B1", "B2"]);
    expect(result.tokens[0].lemma).toBe("the");
  });

  it("marks out-of-vocabulary words as UNKNOWN", async () => {
    const levelDb = new MemoryLevelDb("CEFR", [["the", "A1"]]);
    const processor = new DocumentProcessor(ENGLISH_ADAPTER, levelDb);
    const result = await processor.analyzePage({ id: "p1", text: "the zzzzq" });
    expect(result.tokens[1].level).toBe("UNKNOWN");
  });

  it("serves cached results on repeat analysis", async () => {
    const levelDb = new MemoryLevelDb("CEFR", [["the", "A1"]]);
    const cache = new MemoryPageCache();
    const processor = new DocumentProcessor(ENGLISH_ADAPTER, levelDb, undefined, cache);
    const first = await processor.analyzePage({ id: "p1", text: "the cat" });
    const second = await processor.analyzePage({ id: "p1", text: "the cat" });
    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(second.tokens).toEqual(first.tokens);
  });

  it("enriches tokens with dictionary entries", async () => {
    const levelDb = new MemoryLevelDb("CEFR", [["water", "A1"]]);
    const dict = new MemoryDictionaryStore();
    await dict.put({ word: "water", definition: "the clear liquid", ipa: "/ˈwɔːtə/" });
    const processor = new DocumentProcessor(ENGLISH_ADAPTER, levelDb, dict);
    const result = await processor.analyzePage({ id: "p1", text: "water" }, { enrich: true });
    const entry = result.tokens[0] as unknown as { entry?: { definition: string } };
    expect(entry.entry?.definition).toBe("the clear liquid");
  });
});
