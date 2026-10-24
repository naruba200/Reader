import { describe, it, expect } from "vitest";
import { buildParagraphNodes } from "./spans";

// Simulate a Japanese sentence where particles/punctuation are skipped by
// the analyzer (as tokenizeJapanese does with FUNCTION_WORD_POS):
// text = "私が本を読む" — tokens only for 私, 本, 読む; が/を are gaps.
const text = "私が本を読む";
const tokens = [
  { surface: "私", lemma: "私", start: 0, length: 1, level: "N5" },
  { surface: "本", lemma: "本", start: 2, length: 1, level: "N5" },
  { surface: "読む", lemma: "読む", start: 4, length: 2, level: "N4" },
] as any;

describe("buildParagraphNodes underline scope", () => {
  it("each token span covers only its own text", () => {
    const nodes = buildParagraphNodes(text, { start: 0, end: text.length }, tokens);
    const tokenNodes = nodes.filter((n) => n.token);
    expect(tokenNodes.map((n) => n.text)).toEqual(["私", "本", "読む"]);
    // Reconstructed text must be identical (no duplication, no loss)
    expect(nodes.map((n) => n.text).join("")).toBe(text);
    // Gap runs carry no token (so no underline class)
    const gapNodes = nodes.filter((n) => !n.token);
    expect(gapNodes.map((n) => n.text).join("")).toBe("がを");
  });

  it("last token does not swallow the paragraph tail", () => {
    const t2 = "猫が好き。";
    const toks2 = [
      { surface: "猫", lemma: "猫", start: 0, length: 1, level: "N5" },
      { surface: "好き", lemma: "好き", start: 2, length: 2, level: "N5" },
    ] as any;
    const nodes = buildParagraphNodes(t2, { start: 0, end: t2.length }, toks2);
    const lastTokenNode = nodes.filter((n) => n.token).pop()!;
    expect(lastTokenNode.text).toBe("好き");
    expect(nodes.map((n) => n.text).join("")).toBe(t2);
  });
});
