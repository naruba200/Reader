import { describe, it, expect, vi } from "vitest";
import { htmlToText, detectLanguage, TextBookParser, parserForFileName } from "../src/core/books";

vi.mock("pdfjs-dist", () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: "" },
}));

describe("htmlToText", () => {
  it("strips tags and keeps paragraph breaks", () => {
    const html = "<p>Hello <b>world</b>.</p><p>Second para.</p>";
    const text = htmlToText(html);
    expect(text).toContain("Hello world.");
    expect(text).toContain("Second para.");
  });

  it("decodes common entities", () => {
    expect(htmlToText("a &amp; b &lt;c&gt;")).toBe("a & b <c>");
  });
});

describe("detectLanguage", () => {
  it("detects Japanese from kana/kanji", () => {
    expect(detectLanguage("これは日本語です。学校へ行く。")).toBe("ja");
  });

  it("detects German from umlauts", () => {
    expect(detectLanguage("Die Straße ist groß und schön.")).toBe("de");
  });

  it("detects French from common markers", () => {
    expect(detectLanguage("Le livre est sur la table pour les enfants.")).toBe("fr");
  });

  it("defaults to English", () => {
    expect(detectLanguage("The quick brown fox jumps over the lazy dog.")).toBe("en");
  });
});

describe("TextBookParser", () => {
  it("parses text into a single chapter", async () => {
    const buf = new TextEncoder().encode("Hello world.\n\nThis is chapter text.").buffer;
    const parser = new TextBookParser();
    const book = await parser.parse(buf, "sample.txt");
    expect(book.title).toBe("sample");
    expect(book.language).toBe("en");
    expect(book.format).toBe("epub");
    expect(book.chapters).toHaveLength(1);
    expect(book.chapters[0].text).toContain("Hello world.");
    expect(book.chapters[0].html).toContain("<p>");
  });

  it("detects Japanese text", async () => {
    const buf = new TextEncoder().encode("今日は学校へ行きます。水を飲みます。").buffer;
    const book = await new TextBookParser().parse(buf, "ja.txt");
    expect(book.language).toBe("ja");
  });
});

describe("parserForFileName", () => {
  it("resolves parsers by extension", async () => {
    expect(await parserForFileName("book.epub")).toBeDefined();
    expect(await parserForFileName("notes.txt")).toBeDefined();
    expect(await parserForFileName("notes.md")).toBeDefined();
    expect(await parserForFileName("book.pdf")).toBeDefined();
    expect(await parserForFileName("book.mobi")).toBeUndefined();
  });
});
