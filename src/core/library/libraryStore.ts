import type { BookDocument, BookFormat, LanguageCode } from "../types";

const DB_NAME = "smart-reader-library";
const DB_VERSION = 1;
const STORE_META = "meta";
const STORE_DOCS = "docs";
const STORE_PROGRESS = "progress";

/** Lightweight book metadata shown in the library list (no full document). */
export interface StoredBookMeta {
  id: string;
  title: string;
  language: LanguageCode;
  format: BookFormat;
  fileName: string;
  chapters: number;
  addedAt: number;
  author?: string;
  coverUrl?: string;
  lastReadAt?: number;
}

/** Last reading position within a book, keyed by book id. */
export interface StoredProgress {
  id: string;
  chapterIndex: number;
  pageIndex: number;
  updatedAt: number;
}

export function newBookId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

let lastAddedAt = 0;
function monotonicNow(): number {
  const now = Date.now();
  lastAddedAt = now > lastAddedAt ? now : lastAddedAt + 1;
  return lastAddedAt;
}

function openDb(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const store of [STORE_META, STORE_DOCS, STORE_PROGRESS]) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: "id" });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * IndexedDB-backed library. Parsed books are stored as serialized documents so
 * opening a saved book never needs re-parsing; reading position is kept in a
 * separate store so listing books never loads full documents.
 */
export class LibraryStore {
  private dbPromise?: Promise<IDBDatabase>;

  constructor(private readonly dbName = DB_NAME) {}

  private async db(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = openDb(this.dbName);
    }
    return this.dbPromise;
  }

  private async withStores<T>(
    storeNames: string[],
    mode: IDBTransactionMode,
    work: (get: (name: string) => IDBObjectStore) => Promise<T>,
  ): Promise<T> {
    const db = await this.db();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeNames, mode);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
      work((name) => tx.objectStore(name))
        .then((result) => {
          tx.oncomplete = () => resolve(result);
        })
        .catch(reject);
    });
  }

  async saveBook(doc: BookDocument, fileName: string): Promise<StoredBookMeta> {
    const existing = await this.findBookByFileName(fileName);
    if (existing) {
      const updated: StoredBookMeta = {
        ...existing,
        title: doc.title,
        language: doc.language,
        format: doc.format,
        fileName,
        chapters: doc.chapters.length,
        author: doc.author,
        coverUrl: doc.coverUrl,
      };
      await this.withStores([STORE_META, STORE_DOCS], "readwrite", (get) => {
        get(STORE_META).put(updated);
        get(STORE_DOCS).put({ id: updated.id, doc });
        return Promise.resolve();
      });
      return updated;
    }
    const meta: StoredBookMeta = {
      id: newBookId(),
      title: doc.title,
      language: doc.language,
      format: doc.format,
      fileName,
      chapters: doc.chapters.length,
      addedAt: monotonicNow(),
      author: doc.author,
      coverUrl: doc.coverUrl,
    };
    await this.withStores([STORE_META, STORE_DOCS], "readwrite", (get) => {
      get(STORE_META).put(meta);
      get(STORE_DOCS).put({ id: meta.id, doc });
      return Promise.resolve();
    });
    return meta;
  }

  async findBookByFileName(fileName: string): Promise<StoredBookMeta | undefined> {
    const db = await this.db();
    return new Promise<StoredBookMeta | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_META, "readonly");
      const store = tx.objectStore(STORE_META);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { resolve(undefined); return; }
        const meta = cursor.value as StoredBookMeta;
        if (meta.fileName === fileName) { resolve(meta); return; }
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  }

  async listBooks(): Promise<StoredBookMeta[]> {
    const db = await this.db();
    return new Promise<StoredBookMeta[]>((resolve, reject) => {
      const request = db
        .transaction(STORE_META, "readonly")
        .objectStore(STORE_META)
        .getAll();
      request.onsuccess = () =>
        resolve(
          (request.result as StoredBookMeta[]).sort((a, b) => a.addedAt - b.addedAt),
        );
      request.onerror = () => reject(request.error);
    });
  }

  async loadBook(id: string): Promise<BookDocument | undefined> {
    const db = await this.db();
    return new Promise<BookDocument | undefined>((resolve, reject) => {
      const request = db
        .transaction(STORE_DOCS, "readonly")
        .objectStore(STORE_DOCS)
        .get(id);
      request.onsuccess = () =>
        resolve((request.result as { doc: BookDocument } | undefined)?.doc);
      request.onerror = () => reject(request.error);
    });
  }

  async saveProgress(id: string, chapterIndex: number, pageIndex: number): Promise<void> {
    const progress: StoredProgress = { id, chapterIndex, pageIndex, updatedAt: Date.now() };
    await this.withStores([STORE_PROGRESS, STORE_META], "readwrite", (get) => {
      get(STORE_PROGRESS).put(progress);
      // Also update lastReadAt on the meta record for sorting.
      const metaStore = get(STORE_META);
      const req = metaStore.get(id);
      req.onsuccess = () => {
        const meta = req.result as StoredBookMeta | undefined;
        if (meta) {
          meta.lastReadAt = Date.now();
          metaStore.put(meta);
        }
      };
      return Promise.resolve();
    });
  }

  async loadProgress(id: string): Promise<StoredProgress | undefined> {
    const db = await this.db();
    return new Promise<StoredProgress | undefined>((resolve, reject) => {
      const request = db
        .transaction(STORE_PROGRESS, "readonly")
        .objectStore(STORE_PROGRESS)
        .get(id);
      request.onsuccess = () => resolve(request.result as StoredProgress | undefined);
      request.onerror = () => reject(request.error);
    });
  }

  async deleteBook(id: string): Promise<void> {
    await this.withStores([STORE_META, STORE_DOCS, STORE_PROGRESS], "readwrite", (get) => {
      get(STORE_META).delete(id);
      get(STORE_DOCS).delete(id);
      get(STORE_PROGRESS).delete(id);
      return Promise.resolve();
    });
  }
}

let libraryStore: LibraryStore | undefined;

/** Shared library store for the whole app. */
export function getLibraryStore(): LibraryStore {
  if (!libraryStore) {
    libraryStore = new LibraryStore();
  }
  return libraryStore;
}