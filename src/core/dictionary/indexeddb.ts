import type { DictionaryEntry, LanguageCode } from "../types";
import {
  MemoryDictionaryStore,
  normalizeKey,
  recordsFor,
  type DictionaryStore,
} from "./store";
import type { PackInfo, WordIndexRecord } from "./pack";

const DB_NAME = "smart-reader";
const DB_VERSION = 2;
const STORE_ENTRIES = "dictionary";
const STORE_PACKS = "packs";
const STORE_INDEX = "wordIndex";

function openDb(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_ENTRIES)) {
        db.createObjectStore(STORE_ENTRIES, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_PACKS)) {
        db.createObjectStore(STORE_PACKS, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_INDEX)) {
        db.createObjectStore(STORE_INDEX, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = work(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runBatch(
  db: IDBDatabase,
  storeName: string,
  put: (store: IDBObjectStore) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    put(store);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

const langKey = (lang: LanguageCode, key: string) => `${lang}:${key}`;

const langRange = (lang: LanguageCode) =>
  IDBKeyRange.bound(langKey(lang, ""), langKey(lang, "\uffff"));

/** Key for entry records: lang:source:normalizedWord */
const entryKey = (lang: LanguageCode, source: string, word: string) =>
  `${lang}:${source}:${word}`;

/** Key for pack info records: lang:source */
const packInfoKey = (lang: LanguageCode, source: string) => `${lang}:${source}`;

/** Range for all entries of a given language+source. */
const sourceRange = (lang: LanguageCode, source: string) =>
  IDBKeyRange.bound(`${lang}:${source}:`, `${lang}:${source}:\uffff`);

/** IndexedDB-backed storage. Only usable in browser contexts. */
export class IndexedDbDictionaryStore {
  private dbPromise?: Promise<IDBDatabase>;

  constructor(
    private readonly language: LanguageCode,
    private readonly dbName = DB_NAME,
  ) {}

  private async db(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDb(this.dbName);
    }
    return this.dbPromise;
  }

  async lookup(word: string, source?: string): Promise<DictionaryEntry | undefined> {
    const db = await this.db();
    if (source) {
      const key = entryKey(this.language, source, normalizeKey(word, this.language));
      const record = await run<{ key: string; entry: DictionaryEntry } | undefined>(
        db, STORE_ENTRIES, "readonly", (store) => store.get(key),
      );
      return record?.entry;
    }
    // Without source, search all sources for this language.
    const normalized = normalizeKey(word, this.language);
    // Try common sources in order of likelihood.
    for (const src of ["JMDict", "KANJIDIC2", "Tae Kim's Grammar", "JLPT Grammar", "WordNet"]) {
      const key = entryKey(this.language, src, normalized);
      const record = await run<{ key: string; entry: DictionaryEntry } | undefined>(
        db, STORE_ENTRIES, "readonly", (store) => store.get(key),
      );
      if (record?.entry) return record.entry;
    }
    return undefined;
  }

  async put(entry: DictionaryEntry, source = "default"): Promise<void> {
    await this.bulkPut([entry], source);
  }

  async bulkPut(entries: Iterable<DictionaryEntry>, source = "default"): Promise<void> {
    const db = await this.db();
    const records = [...entries]
      .flatMap((e) => recordsFor(e, this.language))
      .map((r) => ({
        ...r,
        key: entryKey(this.language, source, r.key),
      }));
    const indexRecords: WordIndexRecord[] = records.map((r) => ({
      key: r.key,
      lang: this.language,
      word: r.entry.word,
      reading: r.reading,
      source,
    }));
    if (records.length === 0) return;
    const BATCH = 1000;
    for (let i = 0; i < records.length; i += BATCH) {
      const slice = records.slice(i, i + BATCH);
      const indexSlice = indexRecords.slice(i, i + BATCH);
      await Promise.all([
        runBatch(db, STORE_ENTRIES, (store) => {
          for (const r of slice) store.put(r);
        }),
        runBatch(db, STORE_INDEX, (store) => {
          for (const r of indexSlice) store.put(r);
        }),
      ]);
    }
  }

  async size(): Promise<number> {
    const db = await this.db();
    const range = langRange(this.language);
    return run<number>(db, STORE_ENTRIES, "readonly", (store) => store.count(range));
  }

  async clear(): Promise<void> {
    const db = await this.db();
    const range = langRange(this.language);
    await Promise.all([
      runBatch(db, STORE_ENTRIES, (store) => store.delete(range)),
      runBatch(db, STORE_INDEX, (store) => store.delete(range)),
    ]);
  }

  // ----- pack metadata -----

  async getPackInfo(source?: string): Promise<PackInfo | undefined> {
    const db = await this.db();
    if (source) {
      return run<PackInfo | undefined>(
        db, STORE_PACKS, "readonly",
        (store) => store.get(packInfoKey(this.language, source)),
      );
    }
    // Without source, return first found pack info for this language.
    const range = IDBKeyRange.bound(`${this.language}:`, `${this.language}:\uffff`);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_PACKS, "readonly");
      const store = tx.objectStore(STORE_PACKS);
      const req = store.openCursor(range);
      req.onsuccess = () => {
        const cursor = req.result;
        resolve(cursor ? (cursor.value as unknown as PackInfo) : undefined);
        if (cursor) cursor.continue();
      };
      tx.onerror = () => reject(tx.error);
    });
  }

  async putPackInfo(info: PackInfo): Promise<void> {
    const db = await this.db();
    const record = { ...info, key: packInfoKey(this.language, info.source) };
    await run(db, STORE_PACKS, "readwrite", (store) => store.put(record));
  }

  async deletePack(source?: string): Promise<void> {
    const db = await this.db();
    if (source) {
      // Delete specific source's entries and pack info.
      const range = sourceRange(this.language, source);
      await Promise.all([
        runBatch(db, STORE_ENTRIES, (store) => store.delete(range)),
        runBatch(db, STORE_INDEX, (store) => store.delete(range)),
        run(db, STORE_PACKS, "readwrite", (store) =>
          store.delete(packInfoKey(this.language, source)),
        ),
      ]);
    } else {
      // Delete all packs for this language.
      const range = langRange(this.language);
      await Promise.all([
        runBatch(db, STORE_ENTRIES, (store) => store.delete(range)),
        runBatch(db, STORE_INDEX, (store) => store.delete(range)),
        runBatch(db, STORE_PACKS, (store) => store.delete(range)),
      ]);
    }
  }

  // ----- word search index -----

  async getAllIndexRecords(): Promise<WordIndexRecord[]> {
    const db = await this.db();
    const keyRange = langRange(this.language);
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_INDEX, "readonly");
      const store = transaction.objectStore(STORE_INDEX);
      const request = store.openCursor(keyRange);
      const out: WordIndexRecord[] = [];
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          out.push(cursor.value as WordIndexRecord);
          cursor.continue();
        }
      };
      transaction.oncomplete = () => resolve(out);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  }
}

/** Factory that only creates a persistent store when IndexedDB exists. */
export function createDictionaryStore(language: LanguageCode): DictionaryStore {
  if (typeof indexedDB !== "undefined") {
    return new IndexedDbDictionaryStore(language) as unknown as DictionaryStore;
  }
  return new MemoryDictionaryStore(language);
}