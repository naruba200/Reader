import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import type { BookDocument, LanguageCode } from "../core/types";
import { parserForFileName } from "../core/books";
import { Reader } from "../reader/Reader";
import { useTheme } from "./ThemeContext";
import { DictionaryPage } from "./DictionaryPage";
import { dictionaryManager } from "../core/dictionary/downloadManager";
import { getKuromojiTokenizer } from "../core/language";
import {
  getLibraryStore,
  type StoredBookMeta,
  type StoredProgress,
} from "../core/library";

type View = "library" | "reader" | "dictionary";
type LibraryViewMode = "grid" | "list";
type LibrarySort = "recent" | "title" | "added" | "language";

const VIEW_MODE_KEY = "smart-reader-library-view";
const SORT_KEY = "smart-reader-library-sort";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const LANG_COLORS: Record<string, string> = {
  ja: "from-rose-400 to-red-500",
  en: "from-blue-400 to-indigo-500",
  de: "from-yellow-400 to-amber-500",
  fr: "from-purple-400 to-violet-500",
  zh: "from-orange-400 to-red-500",
};

interface ActiveBook {
  id: string;
  doc: BookDocument;
  progress?: StoredProgress;
}

export function App() {
  const { theme, toggleTheme } = useTheme();
  const [books, setBooks] = useState<StoredBookMeta[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [active, setActive] = useState<ActiveBook | null>(null);
  const [view, setView] = useState<View>("library");
  const [dictInitial, setDictInitial] = useState<{ language: LanguageCode; word?: string }>();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [activeDownloads, setActiveDownloads] = useState<{
    count: number;
    received: number;
    total?: number;
  }>({ count: 0, received: 0 });

  // Library view state
  const [viewMode, setViewMode] = useState<LibraryViewMode>(() => {
    try { return (localStorage.getItem(VIEW_MODE_KEY) as LibraryViewMode) || "grid"; } catch { return "grid"; }
  });
  const [sortBy, setSortBy] = useState<LibrarySort>(() => {
    try { return (localStorage.getItem(SORT_KEY) as LibrarySort) || "recent"; } catch { return "recent"; }
  });

  useEffect(() => {
    try { localStorage.setItem(VIEW_MODE_KEY, viewMode); } catch { /* ignore */ }
  }, [viewMode]);
  useEffect(() => {
    try { localStorage.setItem(SORT_KEY, sortBy); } catch { /* ignore */ }
  }, [sortBy]);

  useEffect(() => {
    return dictionaryManager.subscribe(({ progress }) => {
      const langs = (Object.keys(progress) as LanguageCode[]).filter((l) => progress[l]);
      const received = langs.reduce((n, l) => n + (progress[l]?.received ?? 0), 0);
      const total = langs.reduce((n, l) => n + (progress[l]?.total ?? 0), 0);
      setActiveDownloads({ count: langs.length, received, total: total || undefined });
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (books.some((b) => b.language === "ja")) {
      void getKuromojiTokenizer().catch(() => {});
    }
  }, [hydrated, books]);

  const viewRef = useRef(view);
  viewRef.current = view;
  const activeRef = useRef(active);
  activeRef.current = active;
  const closeHandlerRef = useRef<(() => void) | null>(null);
  const registerCloseHandler = useCallback((close: (() => void) | null) => {
    closeHandlerRef.current = close;
  }, []);

  useEffect(() => {
    if (Capacitor.getPlatform() !== "android") return;
    let remove: (() => void) | undefined;
    void CapApp.addListener("backButton", () => {
      if (closeHandlerRef.current) { closeHandlerRef.current(); return; }
      if (viewRef.current === "reader") { setActive(null); setView("library"); }
      else if (viewRef.current === "dictionary") { setView(activeRef.current ? "reader" : "library"); }
      else { void CapApp.exitApp(); }
    }).then((handle) => { remove = handle.remove; });
    return () => { remove?.(); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getLibraryStore()
      .listBooks()
      .then((list) => { if (cancelled) return; setBooks(list); setHydrated(true); })
      .catch((err) => { console.warn("Failed to load library", err); setHydrated(true); });
    return () => { cancelled = true; };
  }, []);

  const handleFile = async (file: File) => {
    setError(null);
    setBusy("Importing…");
    try {
      const parser = await parserForFileName(file.name);
      if (!parser) throw new Error(`Unsupported file: ${file.name}`);
      const doc = await parser.parse(file, file.name);
      const meta = await getLibraryStore().saveBook(doc, file.name);
      setBooks((prev) => {
        const idx = prev.findIndex((b) => b.id === meta.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = meta;
          return next;
        }
        return [...prev, meta];
      });
      setActive({ id: meta.id, doc });
      setView("reader");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const openBook = async (meta: StoredBookMeta) => {
    setError(null);
    setBusy("Opening…");
    try {
      const doc = await getLibraryStore().loadBook(meta.id);
      if (!doc) throw new Error("Saved book data is missing");
      const progress = await getLibraryStore().loadProgress(meta.id);
      setActive({ id: meta.id, doc, progress });
      setView("reader");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const handleProgress = useCallback(
    (chapterIndex: number, pageIndex: number) => {
      if (!active) return;
      void getLibraryStore()
        .saveProgress(active.id, chapterIndex, pageIndex)
        .catch((err) => console.warn("Failed to save progress", err));
    },
    [active],
  );

  const openDictionary = (language: LanguageCode, word?: string) => {
    setDictInitial({ language, word });
    setView("dictionary");
  };

  const deleteBook = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm("Delete this book?")) return;
    try {
      await getLibraryStore().deleteBook(id);
      setBooks((prev) => prev.filter((b) => b.id !== id));
    } catch (err) {
      console.warn("Failed to delete book", err);
    }
  };

  // Sort books
  const sortedBooks = useMemo(() => {
    const sorted = [...books];
    switch (sortBy) {
      case "recent":
        sorted.sort((a, b) => (b.lastReadAt ?? 0) - (a.lastReadAt ?? 0) || b.addedAt - a.addedAt);
        break;
      case "title":
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case "added":
        sorted.sort((a, b) => b.addedAt - a.addedAt);
        break;
      case "language":
        sorted.sort((a, b) => a.language.localeCompare(b.language) || a.title.localeCompare(b.title));
        break;
    }
    return sorted;
  }, [books, sortBy]);

  return (
    <div className="flex h-full flex-col bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <header className="flex items-center gap-3 border-b border-gray-200 px-4 py-2 dark:border-gray-700">
        <button
          type="button"
          onClick={() => { setView("library"); setActive(null); }}
          className="text-lg font-bold hover:text-gray-600 dark:hover:text-gray-300"
        >
          Smart Reader
        </button>
        <span className="text-xs text-gray-500 dark:text-gray-400">Alpha</span>
        <button
          type="button"
          onClick={() => openDictionary("ja")}
          className="ml-auto rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
        >
          Dictionary
        </button>
        {activeDownloads.count > 0 && (
          <button
            type="button"
            onClick={() => setView("dictionary")}
            className="flex items-center gap-1.5 rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/40 dark:text-blue-200 dark:hover:bg-blue-900/60"
            title="Dictionary packs are downloading"
          >
            <span className="animate-pulse">↓</span>
            {formatBytes(activeDownloads.received)}
            {activeDownloads.total ? ` / ${formatBytes(activeDownloads.total)}` : ""}
          </button>
        )}
        <label className="cursor-pointer rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700">
          Import…
          <input
            type="file"
            accept=".epub,.txt,.md,.pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }}
          />
        </label>
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
      </header>

      {error && (
        <div className="mx-4 mt-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/40 dark:text-red-200">
          {error}
        </div>
      )}

      {busy && (
        <div className="mx-4 mt-3 text-sm text-gray-500 dark:text-gray-400">{busy}</div>
      )}

      {view === "reader" && active ? (
        <div className="min-h-0 flex-1">
          <Reader
            book={active.doc}
            onClose={() => { setActive(null); setView("library"); }}
            onOpenDictionary={openDictionary}
            onRegisterCloseHandler={registerCloseHandler}
            initialChapterIndex={active.progress?.chapterIndex}
            initialPageIndex={active.progress?.pageIndex}
            onProgress={handleProgress}
          />
        </div>
      ) : view === "dictionary" ? (
        <div className="min-h-0 flex-1">
          <DictionaryPage
            onBack={() => setView(active ? "reader" : "library")}
            initial={dictInitial}
          />
        </div>
      ) : (
        <main className="min-h-0 flex-1 overflow-y-auto p-4">
          {!hydrated ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400">
              <p className="text-lg">Loading library…</p>
            </div>
          ) : books.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-400">
              <p className="text-lg">No books yet</p>
              <p className="text-sm">Import an EPUB, PDF, TXT, or MD file to start reading.</p>
            </div>
          ) : (
            <>
              {/* Library toolbar */}
              <div className="mb-3 flex items-center gap-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {books.length} book{books.length !== 1 ? "s" : ""}
                </span>
                <div className="ml-auto flex items-center gap-1">
                  {/* Sort */}
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as LibrarySort)}
                    className="rounded border border-gray-300 bg-white px-2 py-1 text-xs dark:border-gray-600 dark:bg-gray-800"
                  >
                    <option value="recent">Recently read</option>
                    <option value="title">Title</option>
                    <option value="added">Date added</option>
                    <option value="language">Language</option>
                  </select>
                  {/* View mode toggle */}
                  <button
                    type="button"
                    onClick={() => setViewMode((v) => v === "grid" ? "list" : "grid")}
                    className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
                    title={viewMode === "grid" ? "List view" : "Grid view"}
                  >
                    {viewMode === "grid" ? "☰" : "▦"}
                  </button>
                </div>
              </div>

              {/* Book list */}
              {viewMode === "grid" ? (
                <ul className="grid grid-cols-3 gap-2">
                  {sortedBooks.map((book) => (
                    <li key={book.id}>
                      <button
                        type="button"
                        onClick={() => void openBook(book)}
                        className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white text-left shadow-sm hover:shadow dark:border-gray-700 dark:bg-gray-800"
                      >
                        {/* Cover */}
                        <div className={`aspect-[2/3] bg-gradient-to-br ${LANG_COLORS[book.language] ?? "from-gray-400 to-gray-500"} flex items-center justify-center`}>
                          {book.coverUrl ? (
                            <img src={book.coverUrl} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-4xl font-bold text-white/80">{book.title[0]?.toUpperCase() ?? "?"}</span>
                          )}
                        </div>
                        <div className="p-3">
                          <div className="truncate font-semibold">{book.title}</div>
                          {book.author && (
                            <div className="truncate text-xs text-gray-500 dark:text-gray-400">{book.author}</div>
                          )}
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            {book.language.toUpperCase()} · {book.chapters} chapters
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                  {sortedBooks.map((book) => (
                    <li key={book.id}>
                      <button
                        type="button"
                        onClick={() => void openBook(book)}
                        className="flex w-full items-center gap-3 p-3 text-left hover:bg-gray-100 dark:hover:bg-gray-800/50"
                      >
                        <div className={`h-12 w-9 shrink-0 rounded bg-gradient-to-br ${LANG_COLORS[book.language] ?? "from-gray-400 to-gray-500"} flex items-center justify-center`}>
                          {book.coverUrl ? (
                            <img src={book.coverUrl} alt="" className="h-full w-full rounded object-cover" />
                          ) : (
                            <span className="text-sm font-bold text-white/80">{book.title[0]?.toUpperCase() ?? "?"}</span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{book.title}</div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {book.author && <span className="mr-1">{book.author}</span>}
                            {book.language.toUpperCase()} · {book.chapters} chapters
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => void deleteBook(e, book.id)}
                          className="shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                          title="Delete"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </main>
      )}
    </div>
  );
}
