import { describe, it, expect } from "vitest";
import { MemoryDictionaryStore, bundledDictionary } from "../src/core/dictionary";

describe("MemoryDictionaryStore", () => {
  it("stores and looks up entries case-insensitively", async () => {
    const store = new MemoryDictionaryStore();
    await store.put({ word: "House", definition: "a building" });
    expect((await store.lookup("HOUSE"))?.definition).toBe("a building");
    expect(await store.lookup("missing")).toBeUndefined();
  });

  it("supports bulk puts and size", async () => {
    const store = new MemoryDictionaryStore();
    await store.bulkPut([
      { word: "cat", definition: "an animal" },
      { word: "dog", definition: "an animal" },
    ]);
    expect(await store.size()).toBe(2);
    expect((await store.lookup("dog"))?.word).toBe("dog");
  });

  it("clears all entries", async () => {
    const store = new MemoryDictionaryStore();
    await store.put({ word: "x", definition: "y" });
    await store.clear();
    expect(await store.size()).toBe(0);
    expect(await store.lookup("x")).toBeUndefined();
  });
});

describe("bundledDictionary", () => {
  it("returns English sample by default and Japanese for ja", () => {
    const en = bundledDictionary("en");
    const ja = bundledDictionary("ja");
    expect(en.length).toBeGreaterThan(10);
    expect(ja.length).toBeGreaterThan(10);
    expect(en.some((e) => e.word === "water")).toBe(true);
    expect(ja.some((e) => e.word === "水")).toBe(true);
  });

  it("provides readable IPA and pos metadata", () => {
    const en = bundledDictionary("en");
    const friend = en.find((e) => e.word === "friend");
    expect(friend?.ipa).toBe("/frend/");
    expect(friend?.pos).toBe("noun");
  });
});
