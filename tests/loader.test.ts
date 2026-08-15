import { describe, it, expect } from "vitest";
import {
  parseTsvLevelData,
  bundledEntries,
  loadLevelDb,
  dictFileName,
  languageScheme,
} from "../src/core/leveldb/loader";

describe("parseTsvLevelData", () => {
  it("parses word<TAB>level rows and skips comments/empty lines", () => {
    const text = [
      "# sample list",
      "hello\tA1",
      "world\tA2",
      "",
      "   ",
      "not-a-level\tZZ",
    ].join("\n");
    const rows = parseTsvLevelData(text, "CEFR");
    expect(rows).toEqual([
      ["hello", "A1"],
      ["world", "A2"],
    ]);
  });

  it("rejects levels that do not match the scheme", () => {
    const rows = parseTsvLevelData("水\tN5\nfoo\tA1", "JLPT");
    expect(rows).toEqual([["水", "N5"]]);
  });
});

describe("bundledEntries", () => {
  it("returns CEFR entries for English and JLPT for Japanese", () => {
    const en = bundledEntries("en");
    expect(en.length).toBeGreaterThan(100);
    expect(en[0][1]).toBe("A1");

    const ja = bundledEntries("ja");
    expect(ja.length).toBeGreaterThan(100);
    expect(ja.some(([w]) => w === "水")).toBe(true);
  });
});

describe("dictFileName / languageScheme", () => {
  it("maps languages to TSV filenames and schemes", () => {
    expect(dictFileName("ja")).toBe("jlpt.ja.tsv");
    expect(dictFileName("en")).toBe("cefr.en.tsv");
    expect(languageScheme("ja")).toBe("JLPT");
    expect(languageScheme("de")).toBe("CEFR");
  });
});

describe("loadLevelDb", () => {
  it("falls back to bundled sample when fetch fails", async () => {
    const failingFetch = async () => {
      throw new Error("network down");
    };
    const db = await loadLevelDb("en", { fetchImpl: failingFetch as unknown as typeof fetch });
    expect(db.scheme).toBe("CEFR");
    expect(db.lookup("the")).toBe("A1");
    expect(db.size()).toBeGreaterThan(100);
  });

  it("uses TSV data when fetch succeeds", async () => {
    const okFetch = async (_url: string) =>
      new Response("alpha\tA1\nbeta\tB2\n", { status: 200 });
    const db = await loadLevelDb("en", {
      basePath: "/dict",
      fetchImpl: okFetch as unknown as typeof fetch,
    });
    expect(db.lookup("alpha")).toBe("A1");
    expect(db.lookup("beta")).toBe("B2");
    expect(db.lookup("the")).toBeUndefined();
  });

  it("uses TSV for Japanese when available", async () => {
    const okFetch = async (_url: string) =>
      new Response("水\tN5\n学校\tN5\n", { status: 200 });
    const db = await loadLevelDb("ja", {
      basePath: "/dict",
      fetchImpl: okFetch as unknown as typeof fetch,
    });
    expect(db.scheme).toBe("JLPT");
    expect(db.lookup("水")).toBe("N5");
  });
});
