import type { Level, LevelScheme } from "../types";

export interface LevelDb {
  readonly scheme: LevelScheme;
  /** O(1) lookup of a normalized word's difficulty level. */
  lookup(word: string): Level | undefined;
  size(): number;
  /** Remove all entries. */
  clear(): void;
}

/** Simple in-memory O(1) hash map implementation of LevelDb (~2-5MB wordlist in RAM). */
export class MemoryLevelDb implements LevelDb {
  readonly scheme: LevelScheme;
  private readonly map = new Map<string, Level>();

  constructor(scheme: LevelScheme, entries: Iterable<readonly [string, Level]>) {
    this.scheme = scheme;
    for (const [word, level] of entries) {
      const key = normalizeKey(word);
      if (!this.map.has(key)) {
        this.map.set(key, level);
      }
    }
  }

  lookup(word: string): Level | undefined {
    return this.map.get(normalizeKey(word));
  }

  size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }
}

export function normalizeKey(word: string): string {
  return word.trim().toLowerCase();
}
