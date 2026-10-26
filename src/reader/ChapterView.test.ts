import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { ChapterView } from "./ChapterView";

// Regression test for the "underline still spans too far" report (4.2
// follow-up). buildParagraphNodes already scopes each token's span to its
// own text, but that alone does not break the rendered line: adjacent
// same-level tokens have no space between them in Japanese, so their
// text-decoration underlines touch and look like one long line. The fix
// is the token-underline-gap class on every underlined token span, which
// puts a 2px break between consecutive underlines. These tests render
// ChapterView to static markup and assert the spans are separate and
// carry the gap class.

function levelClass(level: string): string | null {
  if (level === "N5") return "underline decoration-green-500 decoration-2 underline-offset-2";
  if (level === "N4") return "underline decoration-lime-500 decoration-2 underline-offset-2";
  return null;
}

function spanHtml(html: string): Array<{ cls: string; text: string }> {
  const out: Array<{ cls: string; text: string }> = [];
  const re = /<span\b([^>]*)>([^<]*)<\/span>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const cls = /class="([^"]*)"/.exec(m[1])?.[1] ?? "";
    out.push({ cls, text: m[2] });
  }
  return out;
}

describe("ChapterView token underlines", () => {
  it("adjacent same-level tokens render as separate spans with a gap class", () => {
    // 東京大学: two adjacent N5 tokens, no particle/space between them.
    const html = renderToStaticMarkup(
      createElement(ChapterView, {
        chapter: { id: "c1", title: "Test", html: "", text: "東京大学" },
        tokens: [
          { surface: "東京", lemma: "東京", start: 0, length: 2, level: "N5" },
          { surface: "大学", lemma: "大学", start: 2, length: 2, level: "N5" },
        ],
        rating: "Moderate",
        levelClass,
      } as any),
    );
    const spans = spanHtml(html);
    const tokyo = spans.find((s) => s.text === "東京");
    const daigaku = spans.find((s) => s.text === "大学");
    expect(tokyo).toBeDefined();
    expect(daigaku).toBeDefined();
    // Each underlined token carries the gap class that breaks the line.
    expect(tokyo!.cls).toContain("token-underline-gap");
    expect(tokyo!.cls).toContain("underline");
    expect(daigaku!.cls).toContain("token-underline-gap");
    expect(daigaku!.cls).toContain("underline");
    // No single span swallows both words.
    expect(spans.find((s) => s.text === "東京大学")).toBeUndefined();
  });

  it("particle gaps between tokens carry no underline", () => {
    const html = renderToStaticMarkup(
      createElement(ChapterView, {
        chapter: { id: "c1", title: "Test", html: "", text: "私が本を読む" },
        tokens: [
          { surface: "私", lemma: "私", start: 0, length: 1, level: "N5" },
          { surface: "本", lemma: "本", start: 2, length: 1, level: "N5" },
          { surface: "読む", lemma: "読む", start: 4, length: 2, level: "N4" },
        ],
        rating: "Moderate",
        levelClass,
      } as any),
    );
    const spans = spanHtml(html);
    for (const gap of ["が", "を"]) {
      const node = spans.find((s) => s.text === gap);
      expect(node).toBeDefined();
      expect(node!.cls).not.toContain("underline");
      expect(node!.cls).not.toContain("token-underline-gap");
    }
  });
});
