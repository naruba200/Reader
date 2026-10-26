import { describe, it, expect } from "vitest";
import { parseJlptTsv, pickWordOfDay } from "./wordOfDay";

describe("parseJlptTsv", () => {
  it("parses word<TAB>level lines, skipping comments and junk", () => {
    const text = [
      "# comment",
      "",
      "猫\tN5",
      "犬\tN5",
      "曖昧\tN1",
      "no-tab-line",
      "\tN5",
      "鳥\t",
    ].join("\n");
    expect(parseJlptTsv(text)).toEqual({
      N5: ["猫", "犬"],
      N1: ["曖昧"],
    });
  });
});

describe("pickWordOfDay", () => {
  const jlpt = { N5: ["a", "b"], N1: ["c"] };
  // Combined order is N5 → N1: [a, b, c]. Note the day formula counts
  // Jan 1 as day 1, so Jan 1 picks combined[1], not combined[0].
  it("picks by day-of-year modulo list length", () => {
    expect(pickWordOfDay(jlpt, new Date(2026, 0, 1))).toEqual({ word: "b", level: "N5" });
    expect(pickWordOfDay(jlpt, new Date(2026, 0, 2))).toEqual({ word: "c", level: "N1" });
    expect(pickWordOfDay(jlpt, new Date(2026, 0, 3))).toEqual({ word: "a", level: "N5" });
  });

  it("returns null for an empty list", () => {
    expect(pickWordOfDay({}, new Date(2026, 0, 1))).toBeNull();
  });
});
