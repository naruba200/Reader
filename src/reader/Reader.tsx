import { useCallback, useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import type {
  AnalyzedToken,
  BookDocument,
  DictionaryEntry,
  DifficultyRating,
  LanguageCode,
  Level,
} from "../core/types";
import { getAdapter } from "../core/language";
import { loadLevelDb } from "../core/leveldb/loader";
import type { LevelDb } from "../core/leveldb/LevelDb";
import { MemoryPageCache, DocumentProcessor } from "../core/pipeline";
import { getDictionaryStore } from "../core/dictionary";
import { levelRank } from "../core/analysis";
import { ChapterView } from "./ChapterView";
import { WordPopover, type PopoverState } from "./WordPopover";
import { paginateChapter } from "./pages";

export interface ReaderProps {
  book: BookDocument;
  onClose: () => void;
  onOpenDictionary?: (language: LanguageCode, word: string) => void;
  /** Chapter to start on when the book opens (restored reading position). */
  initialChapterIndex?: number;
  /** Page within the initial chapter to start on. */
  initialPageIndex?: number;
  /** Called whenever the reading position changes. */
  onProgress?: (chapterIndex: number, pageIndex: number) => void;
  /** Lets the parent intercept the Android back button when a popover is open. */
  onRegisterCloseHandler?: (close: (() => void) | null) => void;
}

const FONT_SIZE_KEY = "smart-reader-font-size";
const FONT_SIZE_MIN = 13;
const FONT_SIZE_MAX = 32;

function loadFontSize(): number {
  try {
    const value = Number(localStorage.getItem(FONT_SIZE_KEY));
    if (value >= FONT_SIZE_MIN && value <= FONT_SIZE_MAX) return value;
  } catch {
    /* ignore */
  }
  return 17;
}

/** Which tokens get an underline in the chapter text. */
export type HighlightMode = "all" | "hard" | "unknown" | "off";

const HIGHLIGHT_KEY = "smart-reader-highlight-mode";

const HIGHLIGHT_MODES: readonly HighlightMode[] = ["all", "hard", "unknown", "off"];

const HIGHLIGHT_LABEL: Record<HighlightMode, string> = {
  all: "All",
  hard: "Hard",
  unknown: "New",
  off: "Off",
};

function loadHighlightMode(): HighlightMode {
  try {
    const value = localStorage.getItem(HIGHLIGHT_KEY);
    if (value !== null && (HIGHLIGHT_MODES as readonly string[]).includes(value)) return value as HighlightMode;
  } catch {
    /* ignore */
  }
  return "unknown";
}

/** Whether a token at `level` gets an underline for the given highlight mode. */
export function shouldHighlightLevel(level: Level, mode: HighlightMode): boolean {
  switch (mode) {
    case "all":
      return true;
    case "unknown":
      return level === "UNKNOWN";
    case "hard":
      return level === "UNKNOWN" || levelRank(level) >= 4;
    case "off":
      return false;
  }
}

const LEVEL_CLASS: Partial<Record<Level, string>> = {
  A1: "underline decoration-green-500 decoration-2 underline-offset-2",
  A2: "underline decoration-lime-500 decoration-2 underline-offset-2",
  B1: "underline decoration-yellow-500 decoration-2 underline-offset-2",
  B2: "underline decoration-orange-400 decoration-2 underline-offset-2",
  C1: "underline decoration-orange-600 decoration-2 underline-offset-2",
  C2: "underline decoration-red-600 decoration-2 underline-offset-2",
  N5: "underline decoration-green-500 decoration-2 underline-offset-2",
  N4: "underline decoration-lime-500 decoration-2 underline-offset-2",
  N3: "underline decoration-yellow-500 decoration-2 underline-offset-2",
  N2: "underline decoration-orange-400 decoration-2 underline-offset-2",
  N1: "underline decoration-red-600 decoration-2 underline-offset-2",
  UNKNOWN: "underline decoration-purple-500 decoration-2 underline-offset-2 decoration-dashed",
};

export function Reader({
  book,
  onClose,
  onOpenDictionary,
  onRegisterCloseHandler,
  initialChapterIndex,
  initialPageIndex,
  onProgress,
}: ReaderProps) {
  const [chapterIndex, setChapterIndex] = useState(() => {
    const firstText = book.chapters.findIndex((c) => c.text.trim().length > 0);
    if (initialChapterIndex !== undefined) {
      const clamped = Math.max(0, Math.min(initialChapterIndex, book.chapters.length - 1));
      if (book.chapters[clamped] && book.chapters[clamped].text.trim().length === 0) {
        return firstText;
      }
      return clamped;
    }
    return Math.max(0, firstText);
  });
  const [pageIndex, setPageIndex] = useState(() =>
    Math.max(0, initialPageIndex ?? 0),
  );
  const mounted = useRef(false);
  const [tokens, setTokens] = useState<AnalyzedToken[]>([]);
  const [rating, setRating] = useState<DifficultyRating>("Moderate");
  const [popover, setPopover] = useState<PopoverState | null>(null);
  const [entry, setEntry] = useState<DictionaryEntry | undefined>();
  const [busy, setBusy] = useState(true);
  const [readingMode, setReadingMode] = useState<"horizontal" | "vertical">(() =>
    book.language === "ja" ? "vertical" : "horizontal",
  );
  const [fontSize, setFontSize] = useState<number>(loadFontSize);
  const [levelDb, setLevelDb] = useState<LevelDb | null>(null);
  const [highlightMode, setHighlightMode] = useState<HighlightMode>(loadHighlightMode);

  const changeHighlightMode = useCallback((mode: HighlightMode) => {
    setHighlightMode(mode);
    try {
      localStorage.setItem(HIGHLIGHT_KEY, mode);
    } catch {
      /* ignore */
    }
  }, []);

  const changeFontSize = useCallback((delta: number) => {
    setFontSize((prev) => {
      const next = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, prev + delta));
      try {
        localStorage.setItem(FONT_SIZE_KEY, String(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // While a word popover is open, register a close handler so the Android back
  // button closes it instead of leaving the reader.
  useEffect(() => {
    if (!popover) {
      onRegisterCloseHandler?.(null);
      return;
    }
    onRegisterCloseHandler?.(() => setPopover(null));
    return () => onRegisterCloseHandler?.(null);
  }, [popover, onRegisterCloseHandler]);

  const chapter = book.chapters[chapterIndex] ?? book.chapters[0];
  const pages = useMemo(() => paginateChapter(chapter), [chapter]);
  const page = pages[Math.min(pageIndex, pages.length - 1)];

  // Report reading position changes (skipping the initial mount).
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    onProgress?.(chapterIndex, pageIndex);
  }, [chapterIndex, pageIndex, onProgress]);

  const processor = useMemo(() => {
    if (!levelDb) return null;
    const adapter = getAdapter(book.language);
    const dict = getDictionaryStore(book.language);
    return new DocumentProcessor(adapter, levelDb, dict, new MemoryPageCache());
  }, [book.id, book.language, levelDb]);

  // Load the level database (JLPT/CEFR wordlist) for the book's language. The
  // full JLPT list is served from /dict; on any failure it falls back to the
  // bundled sample.
  useEffect(() => {
    let cancelled = false;
    setLevelDb(null);
    loadLevelDb(book.language).then((db) => {
      if (!cancelled) setLevelDb(db);
    });
    return () => {
      cancelled = true;
    };
  }, [book.id, book.language]);

  useEffect(() => {
    if (!processor) return;
    let cancelled = false;
    setBusy(true);
    setPopover(null);
    setEntry(undefined);
    processor
      .analyzePage({ id: chapter.id, text: chapter.text })
      .then((result) => {
        if (cancelled) return;
        setTokens(result.tokens);
        setRating(result.analysis.rating);
        setBusy(false);
      })
      .catch((err) => {
        console.error("Analysis failed", err);
        setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [processor, chapter]);

  const levelClass = useCallback(
    (level: Level) => {
      if (!shouldHighlightLevel(level, highlightMode)) return null;
      return LEVEL_CLASS[level] ?? null;
    },
    [highlightMode],
  );

  const handleWordClick = useCallback(
    (token: AnalyzedToken, pos: { x: number; y: number }) => {
      setPopover({ token, x: pos.x, y: pos.y });
      setEntry(undefined);
      const dict = getDictionaryStore(book.language);
      const candidates = [token.lemma, token.surface].filter(
        (w, i, arr) => w.trim() && arr.indexOf(w) === i,
      );
      void (async () => {
        for (const word of candidates) {
          const found = await dict.lookup(word);
          if (found) {
            setEntry(found);
            return;
          }
        }
        setEntry(undefined);
      })().catch(() => setEntry(undefined));
    },
    [book.language],
  );

  // Page navigation flows across chapters: past the last page moves to the next
  // chapter (page 1); back from the first page moves to the previous chapter's
  // last page.
  const goPrev = useCallback(() => {
    if (pageIndex > 0) {
      setPageIndex(pageIndex - 1);
    } else if (chapterIndex > 0) {
      const prevPages = paginateChapter(book.chapters[chapterIndex - 1]);
      setPageIndex(prevPages.length - 1);
      setChapterIndex(chapterIndex - 1);
    }
  }, [pageIndex, chapterIndex, book.chapters]);

  const goNext = useCallback(() => {
    if (pageIndex < pages.length - 1) {
      setPageIndex(pageIndex + 1);
    } else if (chapterIndex < book.chapters.length - 1) {
      setChapterIndex(chapterIndex + 1);
      setPageIndex(0);
    }
  }, [pageIndex, pages.length, chapterIndex, book.chapters.length]);

  // Swipe left/right to turn pages. Vertical swipes keep scrolling; if the
  // reading area can scroll horizontally (vertical reading mode), the swipe is
  // left to the browser and only navigates when there is nothing to scroll.
  const contentRef = useRef<HTMLDivElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = useCallback((e: TouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  }, []);

  const handleTouchEnd = useCallback(
    (e: TouchEvent<HTMLDivElement>) => {
      const start = touchStartRef.current;
      touchStartRef.current = null;
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
      const el = contentRef.current;
      if (el && el.scrollLeft > 0) return;
      if (dx < 0) goNext();
      else goPrev();
    },
    [goNext, goPrev],
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-col gap-1 border-b border-gray-200 px-4 py-2 dark:border-gray-700">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded px-2 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            ← Library
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{book.title}</div>
            <div className="truncate text-xs text-gray-500 dark:text-gray-400">
              {book.language.toUpperCase()} · Chapter {chapterIndex + 1} of {book.chapters.length} ·
              Page {pageIndex + 1} of {pages.length}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="min-w-0 flex-1 rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
            value={chapterIndex}
            onChange={(e) => {
              setChapterIndex(Number(e.target.value));
              setPageIndex(0);
            }}
          >
            {book.chapters.map((c, i) => (
              <option key={c.id} value={i}>
                {c.title}
              </option>
            ))}
          </select>
          <span
            className="flex shrink-0 items-center overflow-hidden rounded border border-gray-300 dark:border-gray-600"
            title="Which words get underlined"
          >
            {HIGHLIGHT_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => changeHighlightMode(mode)}
                className={`px-2 py-1 text-xs ${
                  highlightMode === mode
                    ? "bg-gray-200 font-semibold dark:bg-gray-700"
                    : "bg-white dark:bg-gray-800"
                }`}
              >
                {HIGHLIGHT_LABEL[mode]}
              </button>
            ))}
          </span>
          <button
            type="button"
            onClick={() => setReadingMode((m) => (m === "horizontal" ? "vertical" : "horizontal"))}
            className="shrink-0 rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
            title="Toggle vertical (top-to-bottom) reading"
          >
            {readingMode === "horizontal" ? "縦" : "横"}
          </button>
          <span className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => changeFontSize(-1)}
              disabled={fontSize <= FONT_SIZE_MIN}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-sm disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800"
              aria-label="Decrease font size"
            >
              A−
            </button>
            <button
              type="button"
              onClick={() => changeFontSize(1)}
              disabled={fontSize >= FONT_SIZE_MAX}
              className="rounded border border-gray-300 bg-white px-2 py-1 text-sm disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800"
              aria-label="Increase font size"
            >
              A+
            </button>
          </span>
        </div>
      </header>

      <div
        ref={contentRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={
          readingMode === "vertical"
            ? "flex-1 overflow-x-auto overflow-y-hidden touch-auto"
            : "flex-1 overflow-y-auto touch-pan-y"
        }
      >
        {busy ? (
          <div className="flex h-full items-center justify-center text-gray-400">
            Analyzing…
          </div>
        ) : (
          <ChapterView
            chapter={chapter}
            tokens={tokens}
            rating={rating}
            levelClass={levelClass}
            onWordClick={handleWordClick}
            page={page}
            vertical={readingMode === "vertical"}
            fontSize={fontSize}
          />
        )}
      </div>

      <footer className="flex items-center gap-4 border-t border-gray-200 px-4 py-2 text-xs text-gray-500 dark:border-gray-700">
        <button
          type="button"
          disabled={pageIndex === 0 && chapterIndex === 0}
          onClick={goPrev}
          className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-gray-700"
        >
          ← Prev
        </button>
        <button
          type="button"
          disabled={pageIndex >= pages.length - 1 && chapterIndex >= book.chapters.length - 1}
          onClick={goNext}
          className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-gray-700"
        >
          Next →
        </button>
        <span className="ml-auto">
          Page {pageIndex + 1} of {pages.length}
        </span>
      </footer>

      {popover && (
        <WordPopover
          popover={popover}
          entry={entry}
          onClose={() => setPopover(null)}
          onOpenInDictionary={
            onOpenDictionary
              ? (lemma) => {
                  setPopover(null);
                  onOpenDictionary(book.language, lemma);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}
