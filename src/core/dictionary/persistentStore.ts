import type { DictionaryEntry, LanguageCode } from "../types";
import { bundledDefaultPack } from "./data/defaultPacks";
import { IndexedDbDictionaryStore } from "./indexeddb";
import { MemoryDictionaryStore, normalizeKey, recordsFor, type DictionaryStore } from "./store";
import type { PackInfo, WordIndexRecord } from "./pack";

/**
 * Dictionary store that layers a bundled in-memory default over an IndexedDB
 * backend holding downloaded packs. Lookups check the (larger) backend first,
 * then fall back to the bundled default. Search uses a lazily built in-memory
 * index of word/reading keys.
 */
export class PersistentDictionaryStore implements DictionaryStore {
  private readonly overlay: MemoryDictionaryStore;
  private readonly backend: IndexedDbDictionaryStore;
  private searchIndex?: WordIndexRecord[];

  constructor(
    readonly language: LanguageCode,
    dbName?: string,
  ) {
    this.overlay = new MemoryDictionaryStore(language);
    void this.overlay.bulkPut(bundledDefaultPack(language));
    this.backend = new IndexedDbDictionaryStore(language, dbName);
  }

  async lookup(word: string): Promise<DictionaryEntry | undefined> {
    const key = normalizeKey(word, this.language);
    if (!key) return undefined;
    const backend = await this.backend.lookup(key);
    if (backend) return backend;
    return this.overlay.lookup(key);
  }

  async put(entry: DictionaryEntry): Promise<void> {
    await this.backend.put(entry);
  }

  async bulkPut(entries: Iterable<DictionaryEntry>, source?: string): Promise<void> {
    await this.backend.bulkPut(entries, source);
  }

  async size(): Promise<number> {
    return this.backend.size();
  }

  async clear(): Promise<void> {
    await this.backend.clear();
    this.searchIndex = undefined;
  }

  async packInfo(source?: string): Promise<PackInfo | undefined> {
    return this.backend.getPackInfo(source);
  }

  async installPack(info: PackInfo): Promise<void> {
    await this.backend.putPackInfo(info);
    this.searchIndex = undefined;
  }

  async removePack(source?: string): Promise<void> {
    await this.backend.deletePack(source);
    this.searchIndex = undefined;
  }

  /** Lazily load word/reading keys (bundled default + downloaded pack) for search. */
  async getSearchIndex(): Promise<WordIndexRecord[]> {
    if (!this.searchIndex) {
      const overlayRecords: WordIndexRecord[] = [];
      for (const entry of bundledDefaultPack(this.language)) {
        for (const { key, reading } of recordsFor(entry, this.language)) {
          overlayRecords.push({
            key: `${this.language}:${key}`,
            lang: this.language,
            word: entry.word,
            reading,
          });
        }
      }
      const backendRecords = await this.backend.getAllIndexRecords();
      this.searchIndex = [...overlayRecords, ...backendRecords];
    }
    return this.searchIndex;
  }

  /** Priority search: exact match, then prefix, then substring; deduped by word. */
  async search(query: string, limit = 50): Promise<WordIndexRecord[]> {
    const q = normalizeKey(query, this.language);
    if (!q) return [];
    const index = await this.getSearchIndex();
    const seen = new Set<string>();
    const exact: WordIndexRecord[] = [];
    const prefix: WordIndexRecord[] = [];
    const substring: WordIndexRecord[] = [];
    const push = (arr: WordIndexRecord[], rec: WordIndexRecord) => {
      if (seen.has(rec.word)) return;
      seen.add(rec.word);
      arr.push(rec);
    };
    for (const rec of index) {
      const key = rec.key.slice(this.language.length + 1);
      if (key === q) {
        if (exact.length < limit) push(exact, rec);
      } else if (key.startsWith(q)) {
        if (prefix.length < limit) push(prefix, rec);
      } else if (key.includes(q)) {
        if (substring.length < limit) push(substring, rec);
      }
    }
    return [...exact, ...prefix, ...substring].slice(0, limit);
  }
}

const stores = new Map<LanguageCode, PersistentDictionaryStore>();

/** Shared per-language persistent dictionary store. */
export function getDictionaryStore(language: LanguageCode): PersistentDictionaryStore {
  let store = stores.get(language);
  if (!store) {
    store = new PersistentDictionaryStore(language);
    stores.set(language, store);
  }
  return store;
}