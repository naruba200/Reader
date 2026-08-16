import { describe, it, expect } from "vitest";
import {
  buildParagraphNodes,
  paragraphRangesForBlock,
  splitWords,
  tokenAtOffset,
} from "../src/reader/spans";
import { paginateChapter } from "../src/reader/pages";
import { buildHighlightRanges, highlightNameFor } from "../src/reader/highlight";
import { shouldHighlightLevel } from "../src/reader/Reader";

describe("splitWords", () => {
  it("splits Latin text into spans with offsets", () => {
    const spans = splitWords("Hello world, how are you?");
    expect(spans.map((s) => s.surface)).toEqual(["Hello", "world", "how", "are", "you"]);
    expect(spans[0].start).toBe(0);
    expect(spans[0].length).toBe(5);
    expect(spans[1].start).toBe(6);
  });

  it("handles apostrophes and accents", () => {
    const spans = splitWords("l'homme café");
    expect(spans.map((s) => s.surface)).toEqual(["l'homme", "café"]);
  });
});

describe("tokenAtOffset", () => {
  const tokens = [
    { surface: "Hello", lemma: "hello", start: 0, length: 5, level: "A1" as const },
    { surface: "world", lemma: "world", start: 6, length: 5, level: "A2" as const },
  ];

  it("finds the token covering an offset", () => {
    expect(tokenAtOffset(tokens, 1)?.surface).toBe("Hello");
    expect(tokenAtOffset(tokens, 7)?.surface).toBe("world");
    expect(tokenAtOffset(tokens, 10)?.surface).toBe("world");
    expect(tokenAtOffset(tokens, 11)).toBeUndefined();
    expect(tokenAtOffset(tokens, 50)).toBeUndefined();
  });
});

describe("buildParagraphNodes", () => {
  it("renders Latin text as token and gap nodes with correct text", () => {
    const text = "Hello world, how are you?";
    const tokens = [
      { surface: "Hello", lemma: "hello", start: 0, length: 5, level: "A1" as const },
      { surface: "world", lemma: "world", start: 6, length: 5, level: "A2" as const },
    ];
    const nodes = buildParagraphNodes(text, { start: 0, end: text.length }, tokens);
    expect(nodes.map((n) => n.text).join("")).toBe(text);
    expect(nodes[0].token?.surface).toBe("Hello");
    expect(nodes[1].text).toBe(" ");
    expect(nodes[2].token?.surface).toBe("world");
  });

  it("preserves Japanese text instead of replacing it with spaces", () => {
    const text = "こんにちは世界。今日はいい天気です。";
    // Simulate tokens produced by the Japanese segmenter (kana runs + kanji).
    const tokens = [
      { surface: "こんにちは", lemma: "こんにちは", start: 0, length: 5, level: "N5" as const },
      { surface: "世", lemma: "世", start: 5, length: 1, level: "N3" as const },
      { surface: "界", lemma: "界", start: 6, length: 1, level: "N3" as const },
      { surface: "今日", lemma: "今日", start: 8, length: 2, level: "N4" as const },
    ];
    const nodes = buildParagraphNodes(text, { start: 0, end: text.length }, tokens);
    expect(nodes.map((n) => n.text).join("")).toBe(text);
    expect(nodes.filter((n) => n.token)).toHaveLength(4);
    // Gaps keep the original punctuation, not spaces.
    const gapTexts = nodes.filter((n) => !n.token).map((n) => n.text);
    expect(gapTexts.join("")).toBe("。はいい天気です。");
  });

  it("renders the raw slice when no tokens cover the paragraph", () => {
    const text = "何もタグのない段落です。";
    const nodes = buildParagraphNodes(text, { start: 0, end: text.length }, []);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe(text);
    expect(nodes[0].token).toBeUndefined();
  });

  it("filters tokens outside the paragraph slice", () => {
    const text = "aaaa\n\nbbbb";
    const tokens = [
      { surface: "bbbb", lemma: "bbbb", start: 6, length: 4, level: "A1" as const },
    ];
    const nodes = buildParagraphNodes(text, { start: 0, end: 4 }, tokens);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].text).toBe("aaaa");
  });
});

describe("paragraphRangesForBlock", () => {
  it("splits a block slice into absolute paragraph ranges", () => {
    const text = "aaa\n\nbbb\n\nccc";
    const paras = paragraphRangesForBlock(text, 0, text.length);
    expect(paras).toEqual([
      { start: 0, end: 3 },
      { start: 5, end: 8 },
      { start: 10, end: 13 },
    ]);
  });

  it("respects the block boundaries", () => {
    const text = "head\naaa\n\nbbb\ntail";
    // Block covers only "aaa\n\nbbb" (indices 5..12).
    const paras = paragraphRangesForBlock(text, 5, 12);
    expect(paras).toEqual([
      { start: 5, end: 8 },
      { start: 10, end: 12 },
    ]);
  });

  it("returns a single range when no paragraph break is inside", () => {
    const text = "日本語のテキスト。\n一行。";
    const paras = paragraphRangesForBlock(text, 0, text.length);
    expect(paras).toEqual([{ start: 0, end: text.length }]);
  });

  it("returns an empty array for an empty slice", () => {
    expect(paragraphRangesForBlock("aaa\n\nbbb", 3, 3)).toEqual([]);
  });
});

describe("paginateChapter", () => {
  const chapter = (text: string, blocks?: { start: number; end: number }[]) => ({
    id: "t",
    title: "T",
    html: "",
    text,
    blocks: blocks?.map((b) => ({ kind: "text" as const, ...b })),
  });

  it("splits a long chapter into multiple pages near the budget", () => {
    const text = Array.from({ length: 100 }, () => "あいうえおかきくけこさしすせそ\n\n").join("");
    const pages = paginateChapter(chapter(text), 800);
    expect(pages.length).toBeGreaterThan(1);
    // Each page holds at most ~800 chars of text.
    for (const page of pages) {
      const chars = page.items
        .filter((b) => b.kind === "text")
        .reduce((n, b) => n + (b.end - b.start), 0);
      expect(chars).toBeLessThanOrEqual(800);
    }
    // All paragraph text is covered exactly once (separators are dropped).
    const covered = pages
      .flatMap((p) => p.items)
      .filter((b): b is { kind: "text"; start: number; end: number } => b.kind === "text")
      .sort((a, b) => a.start - b.start)
      .map((b) => text.slice(b.start, b.end))
      .join("");
    expect(covered).toBe("あいうえおかきくけこさしすせそ".repeat(100));
  });

  it("keeps paragraphs intact when they fit", () => {
    // 3 paragraphs, each 10 chars => budget 800 fits all in one page.
    const text = "aaaaaaaaaa\n\nbbbbbbbbbb\n\ncccccccccc";
    const pages = paginateChapter(chapter(text), 800);
    expect(pages).toHaveLength(1);
    expect(pages[0].items).toEqual([
      { kind: "text", start: 0, end: 10 },
      { kind: "text", start: 12, end: 22 },
      { kind: "text", start: 24, end: 34 },
    ]);
  });

  it("splits an oversized single paragraph", () => {
    const text = "x".repeat(2000);
    const pages = paginateChapter(chapter(text), 800);
    expect(pages.length).toBe(3);
    expect(pages[0].items[0]).toEqual({ kind: "text", start: 0, end: 800 });
    expect(pages[1].items[0]).toEqual({ kind: "text", start: 800, end: 1600 });
    expect(pages[2].items[0]).toEqual({ kind: "text", start: 1600, end: 2000 });
  });

  it("puts each image on its own page", () => {
    const text = "aaa\n\nbbb";
    const pages = paginateChapter(
      {
        id: "t",
        title: "T",
        html: "",
        text,
        blocks: [
          { kind: "text", start: 0, end: 3 },
          { kind: "image", src: "data:image/png;base64,x" },
          { kind: "text", start: 5, end: 8 },
        ],
      },
      800,
    );
    expect(pages.map((p) => p.items.map((b) => b.kind).join(","))).toEqual([
      "text",
      "image",
      "text",
    ]);
  });

  it("returns a single empty page for an empty chapter", () => {
    const pages = paginateChapter(chapter(""), 800);
    expect(pages).toHaveLength(1);
    expect(pages[0].items).toEqual([]);
  });

  it("uses absolute offsets into chapter text", () => {
    const text = "prefix\n\nあいうえおかきくけこ\n\nsuffix";
    const pages = paginateChapter(chapter(text), 800);
    const first = pages[0].items[0];
    expect(first.kind === "text" && text.slice(first.start, first.end)).toBe("prefix");
  });
});

describe("buildHighlightRanges", () => {
  it("builds ranges only for supported levels", () => {
    const tokens = [
      { surface: "the", lemma: "the", start: 0, length: 3, level: "A1" as const },
      { surface: "x", lemma: "x", start: 4, length: 1, level: "BOGUS" as never },
      { surface: "水", lemma: "水", start: 6, length: 1, level: "N5" as const },
    ];
    const ranges = buildHighlightRanges(tokens);
    expect(ranges).toHaveLength(2);
    expect(ranges[0]).toEqual({ level: "A1", start: 0, end: 3 });
    expect(ranges[1]).toEqual({ level: "N5", start: 6, end: 7 });
  });
});

describe("highlightNameFor", () => {
  it("lowercases level into a registered name", () => {
    expect(highlightNameFor("B2")).toBe("level-b2");
    expect(highlightNameFor("UNKNOWN")).toBe("level-unknown");
  });
});

describe("shouldHighlightLevel", () => {
  it("underline filters follow the selected mode", () => {
    expect(shouldHighlightLevel("N5", "all")).toBe(true);
    expect(shouldHighlightLevel("UNKNOWN", "all")).toBe(true);
    expect(shouldHighlightLevel("UNKNOWN", "unknown")).toBe(true);
    expect(shouldHighlightLevel("N5", "unknown")).toBe(false);
    expect(shouldHighlightLevel("N2", "hard")).toBe(true);
    expect(shouldHighlightLevel("N1", "hard")).toBe(true);
    expect(shouldHighlightLevel("C1", "hard")).toBe(true);
    expect(shouldHighlightLevel("N5", "hard")).toBe(false);
    expect(shouldHighlightLevel("A1", "hard")).toBe(false);
    expect(shouldHighlightLevel("N1", "off")).toBe(false);
    expect(shouldHighlightLevel("UNKNOWN", "off")).toBe(false);
  });
});
