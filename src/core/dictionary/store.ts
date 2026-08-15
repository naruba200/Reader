import type { DictionaryEntry, LanguageCode } from "../types";
import { toHiragana } from "../language/japanese";

/** Normalize a word into a stable, case-insensitive lookup key. */
export function normalizeKey(word: string, language?: LanguageCode): string {
  let key = word.trim().toLowerCase();
  if (language === "ja") {
    key = toHiragana(key);
  }
  return key;
}

/** A stored record: a normalized key pointing at an entry (and the form that produced it). */
export interface StoredRecord {
  key: string;
  entry: DictionaryEntry;
  /** Set when the key was generated from `entry.readings[i]` rather than `entry.word`. */
  reading?: string;
}

/**
 * A dictionary entry is addressable by its surface word and by each of its
 * readings (important for Japanese where kanji and kana both appear in text).
 */
export function recordsFor(
  entry: DictionaryEntry,
  language?: LanguageCode,
): StoredRecord[] {
  const seen = new Set<string>();
  const out: StoredRecord[] = [];
  const add = (word: string, reading?: string) => {
    const key = normalizeKey(word, language);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ key, entry, reading });
  };
  add(entry.word);
  for (const r of entry.readings ?? []) add(r, r);
  return out;
}

/** Persistent lookup store for dictionary entries keyed by normalized word. */
export interface DictionaryStore {
  lookup(word: string): Promise<DictionaryEntry | undefined>;
  put(entry: DictionaryEntry): Promise<void>;
  bulkPut(entries: Iterable<DictionaryEntry>): Promise<void>;
  size(): Promise<number>;
  clear(): Promise<void>;
}

/** In-memory DictionaryStore backed by a Map. */
export class MemoryDictionaryStore implements DictionaryStore {
  private readonly map = new Map<string, DictionaryEntry>();
  private readonly language?: LanguageCode;

  constructor(language?: LanguageCode) {
    this.language = language;
  }

  async lookup(word: string): Promise<DictionaryEntry | undefined> {
    return this.map.get(normalizeKey(word, this.language));
  }

  async put(entry: DictionaryEntry): Promise<void> {
    for (const { key } of recordsFor(entry, this.language)) {
      this.map.set(key, entry);
    }
  }

  async bulkPut(entries: Iterable<DictionaryEntry>): Promise<void> {
    for (const entry of entries) {
      for (const { key } of recordsFor(entry, this.language)) {
        this.map.set(key, entry);
      }
    }
  }

  async size(): Promise<number> {
    return this.map.size;
  }

  async clear(): Promise<void> {
    this.map.clear();
  }
}