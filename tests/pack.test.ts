import { describe, it, expect } from "vitest";
import { normalizeKey, recordsFor } from "../src/core/dictionary";

describe("normalizeKey", () => {
  it("is case-insensitive for latin text", () => {
    expect(normalizeKey("House")).toBe("house");
    expect(normalizeKey("  HOuSe  ")).toBe("house");
  });

  it("converts katakana to hiragana for Japanese", () => {
    expect(normalizeKey("コーヒー", "ja")).toBe("こーひー");
    expect(normalizeKey("わたし", "ja")).toBe("わたし");
  });
});

describe("recordsFor", () => {
  it("stores an entry under its surface word and each reading", () => {
    const records = recordsFor(
      { word: "私", readings: ["わたし", "ワタシ"], definition: "I; me" },
      "ja",
    );
    const keys = records.map((r) => r.key).sort();
    // ワタシ normalizes to わたし, deduped against the hiragana reading.
    expect(keys).toEqual(["わたし", "私"].sort());
    const reading = records.find((r) => r.key === "わたし");
    expect(reading?.reading).toBe("わたし");
  });

  it("stores a single key when there are no readings", () => {
    const records = recordsFor({ word: "cat", definition: "an animal" }, "en");
    expect(records.map((r) => r.key)).toEqual(["cat"]);
  });
});