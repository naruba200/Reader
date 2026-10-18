import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { App as CapApp } from "@capacitor/app";
import type { BookDocument, LanguageCode } from "../core/types";
import { parserForFileName } from "../core/books";
import { Reader } from "../reader/Reader";
import { DictionaryPage } from "./DictionaryPage";
import { DownloadsPage } from "./DownloadsPage";
import { dictionaryManager } from "../core/dictionary/downloadManager";
import { getKuromojiTokenizer } from "../core/language";
import { ActionSheet } from "../components/ActionSheet";
import { SettingsPage } from "./SettingsPage";
import { BookSheet } from "./BookSheet";
import { StudyPage } from "../study/StudyPage";
import {
  getLibraryStore,
  type ReadingStatus,
  type StoredBookMeta,
  type StoredProgress,
} from "../core/library";

type View = "library" | "reader" | "dictionary" | "downloads" | "settings" | "study";
type LibraryViewMode = "grid" | "list";
type LibrarySort = "recent" | "title" | "added" | "language";

const VIEW_MODE_KEY = "smart-reader-library-view";
const SORT_KEY = "smart-reader-library-sort";
const BOOK_CACHE_KEY = "smart-reader-book-cache";

function loadBookCache(): StoredBookMeta[] {
  try {
    const raw = JSON.parse(localStorage.getItem(BOOK_CACHE_KEY) ?? "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveBookCache(books: StoredBookMeta[]): void {
  try {
    localStorage.setItem(BOOK_CACHE_KEY, JSON.stringify(books));
  } catch {
    /* storage full/unavailable */
  }
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

type TabId = "library" | "dictionary" | "study" | "downloads" | "settings";

function TabIcon({ id }: { id: TabId }) {
  const cls = "h-6 w-6";
  switch (id) {
    case "library":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 19.5A2.5 2.5 0 016.5 17H20" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
        </svg>
      );
    case "dictionary":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" />
        </svg>
      );
    case "study":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path strokeLinecap="round" d="M3 9h18" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 13h4" />
        </svg>
      );
    case "downloads":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 10l5 5 5-5" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15V3" />
        </svg>
      );
    case "settings":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M1 14h6M9 8h6M17 16h6" />
        </svg>
      );
  }
}

function BottomNav({
  view,
  downloadsActive,
  onNavigate,
}: {
  view: View;
  downloadsActive: boolean;
  onNavigate: (tab: TabId) => void;
}) {
  const tabs: { id: TabId; label: string }[] = [
    { id: "library", label: "Library" },
    { id: "dictionary", label: "Dictionary" },
    { id: "study", label: "Study" },
    { id: "downloads", label: "Downloads" },
    { id: "settings", label: "Settings" },
  ];
  return (
    <nav className="border-t border-gray-200 bg-white pb-safe dark:border-gray-700 dark:bg-gray-800">
      <div className="grid grid-cols-5">
        {tabs.map((t) => {
          const isActive = view === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onNavigate(t.id)}
              className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                isActive
                  ? "text-blue-600 dark:text-blue-400"
                  : "text-gray-500 dark:text-gray-400"
              }`}
            >
              <TabIcon id={t.id} />
              {t.label}
              {t.id === "downloads" && downloadsActive && (
                <span className="absolute right-1/2 top-1.5 h-2 w-2 translate-x-4 rounded-full bg-blue-500" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

export function App() {
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
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"all" | ReadingStatus>("all");
  const [sheetBook, setSheetBook] = useState<StoredBookMeta | null>(null);

  // Long-press on a book card opens its details sheet.
  const lpTimer = useRef<number | null>(null);
  const lpFired = useRef(false);
  const startBookLongPress = useCallback((book: StoredBookMeta) => {
    lpFired.current = false;
    if (lpTimer.current) window.clearTimeout(lpTimer.current);
    lpTimer.current = window.setTimeout(() => {
      lpFired.current = true;
      lpTimer.current = null;
      setSheetBook(book);
    }, 550);
  }, []);
  const cancelBookLongPress = useCallback(() => {
    if (lpTimer.current) {
      window.clearTimeout(lpTimer.current);
      lpTimer.current = null;
    }
  }, []);

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
      else if (viewRef.current === "downloads") { setView("library"); }
      else if (viewRef.current === "settings") { setView("library"); }
      else if (viewRef.current === "study") { setView("library"); }
      else { void CapApp.exitApp(); }
    }).then((handle) => { remove = handle.remove; });
    return () => { remove?.(); };
  }, []);

  // Load books: show cache instantly, then refresh from IndexedDB in background
  useEffect(() => {
    let cancelled = false;

    // 1. Instant: load from localStorage cache
    const cached = loadBookCache();
    if (cached.length > 0) {
      setBooks(cached);
      setHydrated(true);
    }

    // 2. Background: refresh from IndexedDB
    getLibraryStore()
      .listBooks()
      .then((list) => {
        if (cancelled) return;
        setBooks(list);
        setHydrated(true);
        saveBookCache(list);
      })
      .catch((err) => {
        console.warn("Failed to load library", err);
        if (!cancelled) setHydrated(true);
      });

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
        const next = idx >= 0 ? [...prev] : [...prev, meta];
        if (idx >= 0) next[idx] = meta;
        saveBookCache(next);
        return next;
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
      // Auto-shelf: opening a book marks it as "reading" unless finished.
      if (meta.status !== "finished" && meta.status !== "reading") {
        const updated = await getLibraryStore().updateMeta(meta.id, { status: "reading" });
        if (updated) {
          setBooks((prev) => {
            const next = prev.map((b) => (b.id === updated.id ? updated : b));
            saveBookCache(next);
            return next;
          });
        }
      }
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

  const requestDeleteBook = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setPendingDeleteId(id);
  };

  const confirmDeleteBook = async () => {
    const id = pendingDeleteId;
    if (!id) return;
    try {
      await getLibraryStore().deleteBook(id);
      setBooks((prev) => {
        const next = prev.filter((b) => b.id !== id);
        saveBookCache(next);
        return next;
      });
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

  const visibleBooks = useMemo(
    () => (statusFilter === "all" ? sortedBooks : sortedBooks.filter((b) => b.status === statusFilter)),
    [sortedBooks, statusFilter],
  );

  const STATUS_FILTERS: { id: "all" | ReadingStatus; label: string }[] = [
    { id: "all", label: "All" },
    { id: "want", label: "Want to read" },
    { id: "reading", label: "Reading" },
    { id: "finished", label: "Finished" },
  ];

  return (
    <div className="flex h-full flex-col bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      {view === "library" && (
      <header className="flex items-center gap-3 border-b border-gray-200 px-4 py-2 pt-safe dark:border-gray-700">
        <span className="text-lg font-bold">Smart Reader</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">Alpha</span>
        <label className="ml-auto cursor-pointer rounded-xl bg-blue-600 px-4 py-2 text-sm font-medium text-white active:scale-[0.98]">
          Import…
          <input
            type="file"
            accept=".epub,.txt,.md,.pdf"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ""; }}
          />
        </label>
      </header>
      )}

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
      ) : view === "downloads" ? (
        <div className="min-h-0 flex-1">
          <DownloadsPage
            onBack={() => setView("library")}
            onOpenWord={(lang, word) => { openDictionary(lang, word); }}
          />
        </div>
      ) : view === "settings" ? (
        <div className="min-h-0 flex-1">
          <SettingsPage
            viewMode={viewMode}
            onViewModeChange={setViewMode}
          />
        </div>
      ) : view === "study" ? (
        <div className="min-h-0 flex-1">
          <StudyPage />
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
              <div className="mb-2 flex gap-1 overflow-x-auto pb-1">
                {STATUS_FILTERS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setStatusFilter(f.id)}
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                      statusFilter === f.id
                        ? "bg-blue-600 text-white"
                        : "bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="mb-3 flex items-center gap-2">
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {visibleBooks.length} book{visibleBooks.length !== 1 ? "s" : ""}
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
                    aria-label={viewMode === "grid" ? "Switch to list view" : "Switch to grid view"}
                  >
                    {viewMode === "grid" ? "☰" : "▦"}
                  </button>
                </div>
              </div>

              {/* Book list */}
              {viewMode === "grid" ? (
                <ul className="grid grid-cols-3 gap-2">
                  {visibleBooks.map((book) => (
                    <li key={book.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (lpFired.current) { lpFired.current = false; return; }
                          void openBook(book);
                        }}
                        onTouchStart={() => startBookLongPress(book)}
                        onTouchEnd={cancelBookLongPress}
                        onTouchMove={cancelBookLongPress}
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
                          {book.stars ? (
                            <div className="mt-0.5 text-xs text-amber-400">
                              {"★".repeat(book.stars)}
                            </div>
                          ) : null}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                  {visibleBooks.map((book) => (
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
                          <div className="truncate font-medium">
                            {book.title}
                            {book.stars ? (
                              <span className="ml-1.5 text-xs text-amber-400">{"★".repeat(book.stars)}</span>
                            ) : null}
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">
                            {book.author && <span className="mr-1">{book.author}</span>}
                            {book.language.toUpperCase()} · {book.chapters} chapters
                          </div>
                          {(book.tags ?? []).length > 0 && (
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              {book.tags!.slice(0, 3).map((t) => (
                                <span key={t} className="rounded bg-gray-100 px-1.5 py-px text-[10px] text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setSheetBook(book); }}
                          className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700"
                          title="Details"
                          aria-label={`Details for ${book.title}`}
                        >
                          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                            <circle cx="12" cy="5" r="1.8" />
                            <circle cx="12" cy="12" r="1.8" />
                            <circle cx="12" cy="19" r="1.8" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => requestDeleteBook(e, book.id)}
                          className="shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                          title="Delete"
                          aria-label={`Delete ${book.title}`}
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
              {visibleBooks.length === 0 && (
                <p className="py-12 text-center text-sm text-gray-400">
                  No books with this status yet.
                </p>
              )}
            </>
          )}
        </main>
      )}

      {view !== "reader" && (
        <BottomNav
          view={view}
          downloadsActive={activeDownloads.count > 0}
          onNavigate={(tab) => {
            if (tab === "dictionary") openDictionary("ja");
            else setView(tab);
          }}
        />
      )}

      <ActionSheet
        open={pendingDeleteId !== null}
        title="Delete this book?"
        message="The book and its reading progress will be removed from your library."
        actions={[
          { label: "Delete", destructive: true, onSelect: () => void confirmDeleteBook() },
        ]}
        onClose={() => setPendingDeleteId(null)}
      />

      <BookSheet
        book={sheetBook}
        onClose={() => setSheetBook(null)}
        onUpdated={(meta) => {
          setSheetBook(meta);
          setBooks((prev) => {
            const next = prev.map((b) => (b.id === meta.id ? meta : b));
            saveBookCache(next);
            return next;
          });
        }}
      />
    </div>
  );
}
