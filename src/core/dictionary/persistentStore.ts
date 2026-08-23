import type { DictionaryEntry, LanguageCode } from "../types";
import { bundledDefaultPack } from "./data/defaultPacks";
import { IndexedDbDictionaryStore } from "./indexeddb";
import { MemoryDictionaryStore, normalizeKey, recordsFor, type DictionaryStore } from "./store";
import type { PackInfo, WordIndexRecord } from "./pack";
import { SortedSearchIndex } from "./searchIndex";

export type IndexState = "idle" | "building" | "ready" | "error";

/**
 * Dictionary store that layers a bundled in-memory default over an IndexedDB
 * backend holding downloaded packs. Lookups check the (larger) backend first,
 * then fall back to the bundled default. Uses a pre-built snapshot for instant
 * table view and search index loading.
 */
export class PersistentDictionaryStore implements DictionaryStore {
  private readonly overlay: MemoryDictionaryStore;
  private readonly backend: IndexedDbDictionaryStore;
  private searchIndex?: SortedSearchIndex;
  private snapshotEntries?: DictionaryEntry[];
  private snapshotTotal = 0;
  private indexState: IndexState = "idle";
  private indexStateListeners = new Set<(s: IndexState) => void>();
  private snapshotBuildPromise?: Promise<void>;

  constructor(
    readonly language: LanguageCode,
    dbName?: string,
  ) {
    this.overlay = new MemoryDictionaryStore(language);
    void this.overlay.bulkPut(bundledDefaultPack(language));
    this.backend = new IndexedDbDictionaryStore(language, dbName);
  }

  /** Subscribe to index build state changes. Returns an unsubscribe function. */
  onIndexStateChange(listener: (s: IndexState) => void): () => void {
    this.indexStateListeners.add(listener);
    return () => this.indexStateListeners.delete(listener);
  }

  getIndexState(): IndexState {
    return this.indexState;
  }

  private setIndexState(state: IndexState): void {
    this.indexState = state;
    for (const fn of this.indexStateListeners) fn(state);
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
    await this.backend.invalidateEntriesSnapshot();
    this.searchIndex = undefined;
    this.snapshotEntries = undefined;
    this.snapshotTotal = 0;
    this.snapshotBuildPromise = undefined;
    this.setIndexState("idle");
  }

  async packInfo(source?: string): Promise<PackInfo | undefined> {
    return this.backend.getPackInfo(source);
  }

  async installPack(info: PackInfo): Promise<void> {
    await this.backend.putPackInfo(info);
    await this.backend.invalidateEntriesSnapshot();
    this.searchIndex = undefined;
    this.snapshotEntries = undefined;
    this.snapshotTotal = 0;
    this.snapshotBuildPromise = undefined;
    this.setIndexState("idle");
    void this.rebuildSnapshot();
  }

  async removePack(source?: string): Promise<void> {
    await this.backend.deletePack(source);
    await this.backend.invalidateEntriesSnapshot();
    this.searchIndex = undefined;
    this.snapshotEntries = undefined;
    this.snapshotTotal = 0;
    this.snapshotBuildPromise = undefined;
    this.setIndexState("idle");
    void this.rebuildSnapshot();
  }

  // ----- snapshot management -----

  /**
   * Rebuild the pre-built snapshot: deduplicated, sorted entries + search index.
   * Runs in background after pack install/remove. One cursor scan builds everything.
   */
  rebuildSnapshot(): Promise<void> {
    if (this.snapshotBuildPromise) return this.snapshotBuildPromise;

    this.snapshotBuildPromise = (async () => {
      // Collect overlay entries (tiny, ~315 entries)
      const overlayEntries: DictionaryEntry[] = [];
      for (const entry of bundledDefaultPack(this.language)) {
        overlayEntries.push(entry);
      }

      // One cursor scan to get all backend entries + build search index records
      const backendRecords = await this.backend.getAllIndexRecords();
      const backendEntries = await this.backend.getAllEntries();

      // Merge and deduplicate entries
      const seen = new Set<string>();
      const allEntries: DictionaryEntry[] = [];
      for (const entry of [...overlayEntries, ...backendEntries]) {
        if (!seen.has(entry.word)) {
          seen.add(entry.word);
          allEntries.push(entry);
        }
      }
      allEntries.sort((a, b) => a.word.localeCompare(b.word, this.language === "ja" ? "ja" : undefined));

      // Build sorted search index
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
      const allRecords = [...overlayRecords, ...backendRecords];
      allRecords.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

      // Cache in memory
      this.snapshotEntries = allEntries;
      this.snapshotTotal = allEntries.length;
      this.searchIndex = new SortedSearchIndex(allRecords);
      this.setIndexState("ready");

      // Persist to IndexedDB (best-effort)
      void this.backend.putEntriesSnapshot({
        entries: allEntries,
        total: allEntries.length,
        searchIndex: allRecords,
      }).catch(() => { /* not critical */ });
    })();

    return this.snapshotBuildPromise;
  }

  /**
   * Load snapshot from IndexedDB cache (fast ~50ms) or trigger rebuild.
   * Populates this.snapshotEntries, this.snapshotTotal, this.searchIndex.
   */
  private async ensureSnapshot(): Promise<void> {
    // Already loaded in memory
    if (this.snapshotEntries && this.searchIndex) return;

    // Try loading from IndexedDB cache
    try {
      const cached = await this.backend.getEntriesSnapshot();
      if (cached && cached.entries.length > 0) {
        this.snapshotEntries = cached.entries;
        this.snapshotTotal = cached.total;
        this.searchIndex = new SortedSearchIndex(cached.searchIndex);
        this.setIndexState("ready");
        return;
      }
    } catch {
      // Cache read failed, fall through to rebuild
    }

    // No cache — rebuild from scratch
    await this.rebuildSnapshot();
  }

  // ----- table view -----

  /**
   * Return a paginated slice of unique entries for the table view.
   * Uses the pre-built snapshot for O(1) array slicing.
   */
  async getPage(
    offset: number,
    limit: number,
  ): Promise<{ entries: DictionaryEntry[]; total: number }> {
    await this.ensureSnapshot();
    if (this.snapshotEntries) {
      return {
        entries: this.snapshotEntries.slice(offset, offset + limit),
        total: this.snapshotTotal,
      };
    }
    // Fallback: cursor scan (shouldn't happen after snapshot is built)
    return this.backend.getEntriesPaginated(offset, limit);
  }

  // ----- search -----

  /** Ensure the search index is built; returns immediately if already built. */
  private ensureIndex(): Promise<void> {
    if (this.searchIndex) return Promise.resolve();
    return this.ensureSnapshot();
  }

  /** Priority search using sorted index with binary search. */
  async search(query: string, limit = 50): Promise<WordIndexRecord[]> {
    const q = normalizeKey(query, this.language);
    if (!q) return [];
    await this.ensureIndex();
    if (!this.searchIndex) return [];
    return this.searchIndex.search(q, this.language, limit);
  }

  /** Return the raw sorted search index records (for filtering by source, etc.). */
  async getSearchIndex(): Promise<WordIndexRecord[]> {
    await this.ensureIndex();
    if (!this.searchIndex) return [];
    return this.searchIndex.toArray();
  }

  /** Return all unique entries (bundled overlay + downloaded packs). */
  async getAllEntries(): Promise<DictionaryEntry[]> {
    await this.ensureSnapshot();
    if (this.snapshotEntries) return this.snapshotEntries;
    // Fallback
    const backendEntries = await this.backend.getAllEntries();
    const seen = new Set<string>();
    const out: DictionaryEntry[] = [];
    for (const entry of backendEntries) {
      if (!seen.has(entry.word)) {
        seen.add(entry.word);
        out.push(entry);
      }
    }
    for (const entry of bundledDefaultPack(this.language)) {
      if (!seen.has(entry.word)) {
        seen.add(entry.word);
        out.push(entry);
      }
    }
    return out;
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
