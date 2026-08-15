import type { BookFormat } from "../types";
import type { BookParser } from "./types";
import { TextBookParser } from "./textParser";

const EXT_PARSERS: Record<string, BookParser> = {
  txt: new TextBookParser(),
  text: new TextBookParser(),
  md: new TextBookParser(),
};

/** Lazily-created parsers for formats that pull in heavy dependencies (epubjs). */
const LAZY_PARSERS: Readonly<Record<string, () => Promise<BookParser>>> = {
  epub: async () => {
    const { EpubParser } = await import("./epubParser");
    return new EpubParser();
  },
  pdf: async () => {
    const { PdfParser } = await import("./pdfParser");
    return new PdfParser();
  },
};

const lazyCache = new Map<string, Promise<BookParser>>();

/** Register an additional parser for a format (e.g. PDF/MOBI/FB2 in later phases). */
export function registerParser(format: BookFormat, parser: BookParser): void {
  EXT_PARSERS[format] = parser;
}

/** Synchronously get a parser that has no heavy dependencies. */
export function getParser(format: BookFormat): BookParser | undefined {
  return EXT_PARSERS[format];
}

/**
 * Get a parser for a format, loading heavy parsers (epubjs) on demand.
 * Returns undefined for unsupported formats.
 */
export function getParserAsync(format: BookFormat): Promise<BookParser | undefined> {
  if (EXT_PARSERS[format]) {
    return Promise.resolve(EXT_PARSERS[format]);
  }
  const factory = LAZY_PARSERS[format];
  if (!factory) return Promise.resolve(undefined);
  if (!lazyCache.has(format)) {
    lazyCache.set(format, factory());
  }
  return lazyCache.get(format)!;
}

/** Resolve a parser by file name, loading heavy dependencies only when matched. */
export async function parserForFileName(fileName: string): Promise<BookParser | undefined> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (EXT_PARSERS[ext]) return EXT_PARSERS[ext];
  if (LAZY_PARSERS[ext]) return getParserAsync(ext as BookFormat);
  return undefined;
}

export function supportedExtensions(): readonly string[] {
  return ["epub", "txt", "text", "md", "pdf"];
}
