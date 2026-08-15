import { describe, it, expect } from "vitest";
import "fake-indexeddb/auto";
import {
  IndexedDbDictionaryStore,
  PersistentDictionaryStore,
} from "../src/core/dictionary";

let dbCounter = 0;
function uniqueDb(): string {
  dbCounter += 1;
  return `test-db-${dbCounter}-${Math.random().toString(36).slice(2)}`;
}

describe("IndexedDbDictionaryStore", () => {
  it("stores and looks up entries by surface word and reading", async () => {
    const store = new IndexedDbDictionaryStore("ja", uniqueDb());
    await store.bulkPut([
      { word: "水", readings: ["みず"], definition: "water", pos: "noun" },
    ]);
    expect((await store.lookup("水"))?.definition).toBe("water");
    expect((await store.lookup("みず"))?.definition).toBe("water");
    expect((await store.lookup("ミズ"))?.definition).toBe("water");
    expect(await store.lookup("missing")).toBeUndefined();
  });

  it("records pack metadata and clears on deletePack", async () => {
    const store = new IndexedDbDictionaryStore("ja", uniqueDb());
    await store.bulkPut([{ word: "犬", definition: "dog" }]);
    await store.putPackInfo({
      language: "ja",
      source: "JMDict",
      version: "1.0",
      count: 1,
      sizeBytes: 100,
      downloadedAt: 1,
    });
    expect((await store.getPackInfo())?.source).toBe("JMDict");
    expect(await store.size()).toBe(1);

    await store.deletePack();
    expect(await store.getPackInfo()).toBeUndefined();
    expect(await store.size()).toBe(0);
  });

  it("keeps separate languages isolated in one database", async () => {
    const dbName = uniqueDb();
    const ja = new IndexedDbDictionaryStore("ja", dbName);
    const en = new IndexedDbDictionaryStore("en", dbName);
    await ja.bulkPut([{ word: "水", definition: "water" }]);
    await en.bulkPut([{ word: "water", definition: "water" }]);
    expect(await ja.size()).toBe(1);
    expect(await en.size()).toBe(1);
    expect((await ja.lookup("water"))?.definition).toBeUndefined();
    expect((await en.lookup("水"))?.definition).toBeUndefined();
  });
});

describe("PersistentDictionaryStore", () => {
  it("falls back to the bundled default", async () => {
    const store = new PersistentDictionaryStore("ja", uniqueDb());
    // 私 is in the bundled JLPT default.
    expect((await store.lookup("私"))?.definition).toContain("I");
    expect((await store.lookup("わたし"))?.definition).toContain("I");
  });

  it("prefers downloaded pack entries over the bundled default", async () => {
    const store = new PersistentDictionaryStore("ja", uniqueDb());
    await store.bulkPut([{ word: "私", readings: ["わたし"], definition: "full JMDict sense" }]);
    expect((await store.lookup("私"))?.definition).toBe("full JMDict sense");
    expect((await store.lookup("わたし"))?.definition).toBe("full JMDict sense");
  });

  it("searches the index with priority exact > prefix > substring", async () => {
    const store = new PersistentDictionaryStore("ja", uniqueDb());
    await store.bulkPut([
      { word: "学校", readings: ["がっこう"], definition: "school" },
      { word: "学生", readings: ["がくせい"], definition: "student" },
      { word: "大学", readings: ["だいがく"], definition: "university" },
    ]);
    // "学" is a prefix of 学校/学生 but only a substring of 大学.
    const results = await store.search("学", 10);
    const words = results.map((r) => r.word);
    expect(words[0]).toBe("学生");
    expect(words[1]).toBe("学校");
    expect(words.findIndex((w) => w === "大学")).toBeGreaterThan(1);

    // Kana prefix: only 学校's reading starts with がっ.
    const kana = await store.search("がっ", 10);
    expect(kana[0]?.word).toBe("学校");

    const exact = await store.search("学校", 10);
    expect(exact[0]?.word).toBe("学校");
  });

  it("clears the search index after installing a new pack", async () => {
    const store = new PersistentDictionaryStore("ja", uniqueDb());
    await store.bulkPut([{ word: "新語", definition: "new word" }]);
    expect((await store.search("新語", 5))[0]?.word).toBe("新語");
    await store.removePack();
    expect(await store.search("新語", 5)).toEqual([]);
  });
});