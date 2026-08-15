import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import type { PDFDocumentProxy, PDFPageProxy } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import type { BookDocument, BookChapter } from "../types";
import { BookParseError, detectLanguage, htmlToText, type BookParser } from "./types";

/**
 * PDF parser that uses pdf.js to extract text per page.
 * Each page becomes a chapter so the reader can paginate naturally.
 */
export class PdfParser implements BookParser {
  readonly format = "pdf" as const;

  async parse(file: File | ArrayBuffer, fileName?: string): Promise<BookDocument> {
    GlobalWorkerOptions.workerSrc = workerUrl;

    let data: ArrayBuffer;
    if (typeof ArrayBuffer !== "undefined" && file instanceof ArrayBuffer) {
      data = file;
    } else if (typeof File !== "undefined" && file instanceof File) {
      data = await file.arrayBuffer();
    } else {
      throw new BookParseError("Unsupported PDF input type", "pdf");
    }

    let doc: PDFDocumentProxy;
    let loadingTask: ReturnType<typeof getDocument>;
    try {
      loadingTask = getDocument({ data });
      doc = await loadingTask.promise;
    } catch (err) {
      throw new BookParseError(
        `Failed to load PDF: ${err instanceof Error ? err.message : String(err)}`,
        "pdf",
      );
    }

    try {
      const chapters: BookChapter[] = [];
      const title = fileName?.replace(/\.[^.]+$/, "") ?? "book";

      for (let i = 1; i <= doc.numPages; i += 1) {
        const page = await doc.getPage(i);
        const content = await this.pageText(page);
        const html = content
          .split(/\n{2,}/)
          .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
          .join("\n");
        chapters.push({
          id: `page-${i}`,
          title: `Page ${i}`,
          html,
          text: htmlToText(html),
        });
      }

      if (chapters.length === 0) {
        throw new BookParseError("PDF has no pages", "pdf");
      }

      return {
        id: title + ":" + chapters.length,
        title,
        language: detectLanguage(chapters.map((c) => c.text).join("\n")),
        format: "pdf",
        chapters,
      };
    } finally {
      try {
        await loadingTask.destroy();
      } catch {
        // best-effort cleanup
      }
    }
  }

  private async pageText(page: PDFPageProxy): Promise<string> {
    const content = await page.getTextContent();
    return (content.items ?? [])
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/[ \t]+/g, " ")
      .trim();
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
