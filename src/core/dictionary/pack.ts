import type { DictionaryEntry, LanguageCode } from "../types";

export const PACK_FILE_EXT = ".pack.ndjson";

/** Metadata describing an installed dictionary pack. */
export interface PackInfo {
  language: LanguageCode;
  source: string;
  version: string;
  count: number;
  sizeBytes: number;
  downloadedAt: number;
}

/** A lightweight search index record (word/reading only, full entry fetched by key). */
export interface WordIndexRecord {
  key: string;
  lang: LanguageCode;
  word: string;
  reading?: string;
}

/**
 * Validate and normalize one NDJSON line into a DictionaryEntry.
 * Returns undefined for blank/invalid lines.
 */
export function parsePackLine(line: string): DictionaryEntry | undefined {
  const trimmed = line.trim();
  if (!trimmed) return undefined;
  try {
    const raw: unknown = JSON.parse(trimmed);
    if (typeof raw !== "object" || raw === null) return undefined;
    const obj = raw as Record<string, unknown>;
    const word = typeof obj.word === "string" ? obj.word.trim() : "";
    if (!word) return undefined;
    const entry: DictionaryEntry = {
      word,
      definition: typeof obj.definition === "string" ? obj.definition : "",
    };
    if (Array.isArray(obj.readings)) {
      entry.readings = obj.readings.filter(
        (r): r is string => typeof r === "string",
      );
    }
    if (typeof obj.ipa === "string") entry.ipa = obj.ipa;
    if (typeof obj.pos === "string") entry.pos = obj.pos;
    if (Array.isArray(obj.examples)) {
      entry.examples = obj.examples.filter(
        (e): e is string => typeof e === "string",
      );
    }
    if (typeof obj.audio === "string") entry.audio = obj.audio;
    if (typeof obj.source === "string") entry.source = obj.source;
    return entry;
  } catch {
    return undefined;
  }
}

export function formatBytes(n: number): string {
  if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1) + " MB";
  if (n >= 1024) return (n / 1024).toFixed(1) + " KB";
  return `${n} B`;
}