import type { BookDocument } from "../types";
import { BookParseError, detectLanguage, type BookParser } from "./types";

/**
 * Parses plain text into a single-chapter BookDocument.
 * Useful for quick reading, tests, and as a fallback for unknown formats.
 */
export class TextBookParser implements BookParser {
  readonly format = "epub" as const;

  async parse(file: File | ArrayBuffer, fileName?: string): Promise<BookDocument> {
    let text: string;
    if (typeof ArrayBuffer !== "undefined" && file instanceof ArrayBuffer) {
      text = new TextDecoder().decode(file);
    } else if (typeof File !== "undefined" && file instanceof File) {
      text = await file.text();
    } else {
      throw new BookParseError("Unsupported text input type");
    }

    const name = fileName ?? "book.txt";
    const paragraphs = text
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter((p) => p.length > 0);
    const html = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n");

    return {
      id: name + ":1",
      title: name.replace(/\.[^.]+$/, ""),
      language: detectLanguage(text),
      format: "epub",
      chapters: [
        {
          id: "text",
          title: name.replace(/\.[^.]+$/, ""),
          html,
          text,
        },
      ],
    };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
