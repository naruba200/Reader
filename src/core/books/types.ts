import type { BookDocument, BookFormat, BookChapter } from "../types";

/** Parses a book file into a normalized BookDocument. */
export interface BookParser {
  readonly format: BookFormat;
  parse(file: File | ArrayBuffer, fileName?: string): Promise<BookDocument>;
}

/** Errors thrown by book parsers. */
export class BookParseError extends Error {
  constructor(message: string, readonly format?: BookFormat) {
    super(message);
    this.name = "BookParseError";
  }
}

/** Strip HTML tags to plain text, preserving paragraph breaks. */
export function htmlToText(html: string): string {
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'");
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Estimate the dominant language code from a text sample. */
export function detectLanguage(text: string): "en" | "ja" | "de" | "fr" {
  const sample = text.slice(0, 2000);
  const kana = (sample.match(/[\u3040-\u30FF]/g) || []).length;
  const kanji = (sample.match(/[\u4E00-\u9FFF]/g) || []).length;
  if (kana > 5 || kanji > 10) return "ja";
  const umlaut = (sample.match(/[äöüßÄÖÜ]/g) || []).length;
  if (umlaut > 2) return "de";
  const frMarkers = (sample.match(/\b(le|la|les|une|des|dans|pour|avec)\b/g) || []).length;
  if (frMarkers > 2) return "fr";
  return "en";
}

/** Create a chapter list from (id, title, html) tuples. */
export function buildChapters(
  entries: readonly { id: string; title: string; html: string }[],
): BookChapter[] {
  return entries.map((entry) => ({
    id: entry.id,
    title: entry.title || "Untitled",
    html: entry.html,
    text: htmlToText(entry.html),
  }));
}
