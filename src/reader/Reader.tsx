import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AnalyzedToken,
  BookDocument,
  DictionaryEntry,
  DifficultyRating,
  LanguageCode,
  Level,
} from "../core/types";
import { getAdapter } from "../core/language";
import { bundledEntries } from "../core/leveldb/loader";
import { MemoryLevelDb } from "../core/leveldb/LevelDb";
import { MemoryPageCache, DocumentProcessor } from "../core/pipeline";
import { getDictionaryStore } from "../core/dictionary";
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
  const [busy, setBusy] = useState(false);
  const [readingMode, setReadingMode] = useState<"horizontal" | "vertical">(() =>
    book.language === "ja" ? "vertical" : "horizontal",
  );

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
    const adapter = getAdapter(book.language);
    const scheme = book.language === "ja" ? "JLPT" : "CEFR";
    const levelDb = new MemoryLevelDb(scheme, bundledEntries(book.language));
    const dict = getDictionaryStore(book.language);
    return new DocumentProcessor(adapter, levelDb, dict, new MemoryPageCache());
  }, [book.id, book.language]);

  useEffect(() => {
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

  const levelClass = useCallback((level: Level) => LEVEL_CLASS[level] ?? null, []);

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

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-gray-200 px-4 py-2 dark:border-gray-700">
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          ← Library
        </button>
        <div className="min-w-0">
          <div className="truncate font-semibold">{book.title}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {book.language.toUpperCase()} · Chapter {chapterIndex + 1} of {book.chapters.length} ·
            Page {pageIndex + 1} of {pages.length}
          </div>
        </div>
        <select
          className="ml-auto rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
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
        <button
          type="button"
          onClick={() => setReadingMode((m) => (m === "horizontal" ? "vertical" : "horizontal"))}
          className="shrink-0 rounded border border-gray-300 bg-white px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
          title="Toggle vertical (top-to-bottom) reading"
        >
          {readingMode === "horizontal" ? "縦" : "横"}
        </button>
      </header>

      <div
        className={
          readingMode === "vertical"
            ? "flex-1 overflow-x-auto overflow-y-hidden"
            : "flex-1 overflow-y-auto"
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
