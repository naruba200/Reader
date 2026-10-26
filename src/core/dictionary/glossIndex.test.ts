import { describe, it, expect } from "vitest";
import type { DictionaryEntry } from "../types";
import {
  buildGlossIndex,
  isLatinQuery,
  mergeSearchResults,
  parseGlosses,
  searchGlossIndex,
} from "./glossIndex";

const entry = (
  word: string,
  definition: string,
  readings?: string[],
): DictionaryEntry => ({ word, definition, readings });

describe("parseGlosses", () => {
  it("splits JMdict-style semicolon glosses and trims", () => {
    expect(parseGlosses("dog; hound; canine")).toEqual([
      "dog",
      "hound",
      "canine",
    ]);
  });

  it("keeps a single gloss whole and does not split on commas", () => {
    expect(parseGlosses("to run, jump, and play")).toEqual([
      "to run, jump, and play",
    ]);
  });

  it("drops empties and handles the full-width semicolon", () => {
    expect(parseGlosses("apple； banana; ")).toEqual(["apple", "banana"]);
    expect(parseGlosses("")).toEqual([]);
  });
});

describe("searchGlossIndex", () => {
  const index = buildGlossIndex([
    entry("犬", "dog", ["いぬ"]),
    entry("犬小屋", "doghouse; kennel", ["いぬごや"]),
    entry("食べる", "to eat; to have a meal", ["たべる"]),
    entry("睡眠", "to sleep", ["すいみん"]),
    entry("猫", "cat", ["ねこ"]),
  ]);

  it("returns Japanese entries for an English query, with readings", () => {
    const results = searchGlossIndex(index, "dog");
    expect(results[0].word).toBe("犬");
    expect(results[0].reading).toBe("いぬ");
    expect(results.map((r) => r.word)).toContain("犬小屋");
  });

  it("is case-insensitive", () => {
    expect(searchGlossIndex(index, "DOG")[0].word).toBe("犬");
  });

  it("returns empty for a non-matching query, never everything", () => {
    expect(searchGlossIndex(index, "zzzzzz")).toEqual([]);
  });

  it("multi-word queries need every word (AND), not any word", () => {
    const results = searchGlossIndex(index, "to eat");
    expect(results.map((r) => r.word)).toContain("食べる");
    // "to sleep" shares "to" but not "eat": must not match.
    expect(results.map((r) => r.word)).not.toContain("睡眠");
  });

  it("ranks exact phrase > phrase prefix > whole-word token > substring", () => {
    const ranked = buildGlossIndex([
      entry("X1", "an"),
      entry("X2", "an apple"),
      entry("X3", "animal"),
      entry("X4", "another"),
      entry("X8", "such an animal"),
      entry("X5", "a plan"),
      entry("X7", "bread and butter"),
      entry("X6", "meaning"),
    ]);
    const words = searchGlossIndex(ranked, "an").map((r) => r.word);
    expect(words).toEqual(["X1", "X2", "X3", "X4", "X8", "X5", "X7", "X6"]);
  });

  it("caps results at the limit", () => {
    expect(searchGlossIndex(index, "to", 2)).toHaveLength(2);
  });

  it("deduplicates the same word across tiers", () => {
    const dup = buildGlossIndex([entry("犬", "dog; dog", ["いぬ"])]);
    const results = searchGlossIndex(dup, "dog");
    expect(results.filter((r) => r.word === "犬")).toHaveLength(1);
  });
});

describe("isLatinQuery", () => {
  it("accepts plain English and romaji, rejects Japanese and mixed input", () => {
    expect(isLatinQuery("dog")).toBe(true);
    expect(isLatinQuery("taberu")).toBe(true);
    expect(isLatinQuery("to eat")).toBe(true);
    expect(isLatinQuery("犬")).toBe(false);
    expect(isLatinQuery("たべる")).toBe(false);
    expect(isLatinQuery("dog 犬")).toBe(false);
    expect(isLatinQuery("123")).toBe(false);
    expect(isLatinQuery("")).toBe(false);
  });
});

describe("mergeSearchResults", () => {
  it("keeps Japanese matches first, dedupes by word, and caps", () => {
    const jp = [
      { word: "犬", key: "ja:いぬ" },
      { word: "猫", key: "ja:ねこ" },
    ];
    const en = [
      { word: "猫", key: "meaning:猫" },
      { word: "鳥", key: "meaning:鳥" },
    ];
    expect(mergeSearchResults(jp, en, 50).map((r) => r.word)).toEqual([
      "犬",
      "猫",
      "鳥",
    ]);
    expect(mergeSearchResults(jp, en, 2).map((r) => r.word)).toEqual([
      "犬",
      "猫",
    ]);
  });
});
