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
  initialChapterIndex?: number;
  initialPageIndex?: number;
  onProgress?: (chapterIndex: number, pageIndex: number) => void;
  onRegisterCloseHandler?: (close: (() => void) | null) => void;
}

const FONT_SIZE_KEY = "smart-reader-font-size";
const FONT_SIZE_MIN = 13;
const FONT_SIZE_MAX = 32;

function loadFontSize(): number {
  try {
    const value = Number(localStorage.getItem(FONT_SIZE_KEY));
    if (value >= FONT_SIZE_MIN && value <= FONT_SIZE_MAX) return value;
  } catch { /* ignore */ }
  return 17;
}

export type HighlightMode = "all" | "hard" | "unknown" | "off" | "grammar";

const HIGHLIGHT_KEY = "smart-reader-highlight-mode";
const HIGHLIGHT_MODES: readonly HighlightMode[] = ["all", "hard", "unknown", "off", "grammar"];

function loadHighlightMode(): HighlightMode {
  try {
    const value = localStorage.getItem(HIGHLIGHT_KEY);
    if (value !== null && (HIGHLIGHT_MODES as readonly string[]).includes(value)) return value as HighlightMode;
  } catch { /* ignore */ }
  return "unknown";
}

export function shouldHighlightLevel(level: Level, mode: HighlightMode): boolean {
  if (mode === "grammar") return true;
  switch (mode) {
    case "all": return true;
    case "unknown": return level === "UNKNOWN";
    case "hard": return level === "UNKNOWN" || levelRank(level) >= 4;
    case "off": return false;
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

type ReadingFilter = "none" | "sepia" | "warm" | "dark-warm";

const FILTER_KEY = "smart-reader-reading-filter";

function loadReadingFilter(): ReadingFilter {
  try {
    const v = localStorage.getItem(FILTER_KEY);
    if (v === "sepia" || v === "warm" || v === "dark-warm") return v;
  } catch { /* ignore */ }
  return "none";
}

const FILTER_CYCLE: ReadingFilter[] = ["none", "sepia", "warm", "dark-warm"];
const FILTER_LABEL: Record<ReadingFilter, string> = {
  none: "No filter",
  sepia: "Sepia",
  warm: "Warm",
  "dark-warm": "Dark warm",
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
      if (book.chapters[clamped] && book.chapters[clamped].text.trim().length === 0) return firstText;
      return clamped;
    }
    return Math.max(0, firstText);
  });
  const [pageIndex, setPageIndex] = useState(() => Math.max(0, initialPageIndex ?? 0));
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
  const [readingFilter, setReadingFilter] = useState<ReadingFilter>(loadReadingFilter);

  // UI state
  const [controlsVisible, setControlsVisible] = useState(false);
  const [showChapterSelect, setShowChapterSelect] = useState(false);
  const [showFontSizeBar, setShowFontSizeBar] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  // TTS state
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [ttsPaused, setTtsPaused] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Auto-hide timer
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const changeHighlightMode = useCallback((mode: HighlightMode) => {
    setHighlightMode(mode);
    try { localStorage.setItem(HIGHLIGHT_KEY, mode); } catch { /* ignore */ }
  }, []);

  const changeFontSize = useCallback((delta: number) => {
    setFontSize((prev) => {
      const next = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, prev + delta));
      try { localStorage.setItem(FONT_SIZE_KEY, String(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  const changeReadingFilter = useCallback(() => {
    setReadingFilter((prev) => {
      const idx = FILTER_CYCLE.indexOf(prev);
      const next = FILTER_CYCLE[(idx + 1) % FILTER_CYCLE.length];
      try { localStorage.setItem(FILTER_KEY, next); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Controls visibility management
  const toggleControls = useCallback(() => {
    setControlsVisible((v) => {
      if (!v) {
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => setControlsVisible(false), 5000);
      }
      return !v;
    });
  }, []);

  useEffect(() => {
    return () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); };
  }, []);

  // Popover close handler for Android back
  useEffect(() => {
    if (!popover) { onRegisterCloseHandler?.(null); return; }
    onRegisterCloseHandler?.(() => setPopover(null));
    return () => onRegisterCloseHandler?.(null);
  }, [popover, onRegisterCloseHandler]);

  const chapter = book.chapters[chapterIndex] ?? book.chapters[0];
  const pages = useMemo(() => paginateChapter(chapter), [chapter]);
  const page = pages[Math.min(pageIndex, pages.length - 1)];

  // Report reading position changes
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    onProgress?.(chapterIndex, pageIndex);
  }, [chapterIndex, pageIndex, onProgress]);

  const processor = useMemo(() => {
    if (!levelDb) return null;
    const adapter = getAdapter(book.language);
    const dict = getDictionaryStore(book.language);
    return new DocumentProcessor(adapter, levelDb, dict, new MemoryPageCache());
  }, [book.id, book.language, levelDb]);

  useEffect(() => {
    let cancelled = false;
    setLevelDb(null);
    loadLevelDb(book.language).then((db) => { if (!cancelled) setLevelDb(db); });
    return () => { cancelled = true; };
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
      .catch((err) => { console.error("Analysis failed", err); setBusy(false); });
    return () => { cancelled = true; };
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
          if (found) { setEntry(found); return; }
        }
        setEntry(undefined);
      })().catch(() => setEntry(undefined));
    },
    [book.language],
  );

  // Page navigation with animation
  const goPrev = useCallback(() => {
    if (isAnimating) return;
    if (pageIndex > 0) {
      setIsAnimating(true);
      setTimeout(() => {
        setPageIndex(pageIndex - 1);
        setIsAnimating(false);
      }, 200);
    } else if (chapterIndex > 0) {
      const prevPages = paginateChapter(book.chapters[chapterIndex - 1]);
      setIsAnimating(true);
      setTimeout(() => {
        setPageIndex(prevPages.length - 1);
        setChapterIndex(chapterIndex - 1);
        setIsAnimating(false);
      }, 200);
    }
  }, [pageIndex, chapterIndex, book.chapters, isAnimating]);

  const goNext = useCallback(() => {
    if (isAnimating) return;
    if (pageIndex < pages.length - 1) {
      setIsAnimating(true);
      setTimeout(() => {
        setPageIndex(pageIndex + 1);
        setIsAnimating(false);
      }, 200);
    } else if (chapterIndex < book.chapters.length - 1) {
      setIsAnimating(true);
      setTimeout(() => {
        setChapterIndex(chapterIndex + 1);
        setPageIndex(0);
        setIsAnimating(false);
      }, 200);
    }
  }, [pageIndex, pages.length, chapterIndex, book.chapters.length, isAnimating]);

  // Tap zones: 15% left/right for page turns, 70% center for controls
  const handleContentClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (popover) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ratio = x / rect.width;
      if (ratio < 0.15) goPrev();
      else if (ratio > 0.85) goNext();
      else toggleControls();
    },
    [goPrev, goNext, toggleControls, popover],
  );

  // Swipe handling
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

  // TTS
  const startTTS = useCallback(() => {
    const text = chapter.text;
    if (!text) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = book.language === "ja" ? "ja-JP" :
      book.language === "en" ? "en-US" : `${book.language}-${book.language.toUpperCase()}`;
    const voices = speechSynthesis.getVoices();
    const langVoice = voices.find((v) => v.lang.startsWith(book.language));
    if (langVoice) utterance.voice = langVoice;
    utterance.onend = () => { setTtsPlaying(false); setTtsPaused(false); };
    utterance.onerror = () => { setTtsPlaying(false); setTtsPaused(false); };
    utteranceRef.current = utterance;
    speechSynthesis.speak(utterance);
    setTtsPlaying(true);
    setTtsPaused(false);
  }, [chapter.text, book.language]);

  const pauseTTS = useCallback(() => { speechSynthesis.pause(); setTtsPaused(true); }, []);
  const resumeTTS = useCallback(() => { speechSynthesis.resume(); setTtsPaused(false); }, []);
  const stopTTS = useCallback(() => {
    speechSynthesis.cancel();
    setTtsPlaying(false);
    setTtsPaused(false);
    utteranceRef.current = null;
  }, []);

  // Progress calculation
  const totalChars = useMemo(() =>
    book.chapters.reduce((sum, c) => sum + c.text.length, 0), [book.chapters]);
  const readChars = useMemo(() => {
    let chars = 0;
    for (let i = 0; i < chapterIndex; i++) chars += book.chapters[i].text.length;
    // Compute offset within current chapter from page items
    if (page) {
      for (const item of page.items) {
        if (item.kind === "text") {
          chars += item.start;
          break;
        }
      }
    }
    return chars;
  }, [chapterIndex, page, book.chapters]);
  const progress = totalChars > 0 ? readChars / totalChars : 0;

  const filterClass = readingFilter === "sepia" ? "filter-sepia" :
    readingFilter === "warm" ? "filter-warm" :
    readingFilter === "dark-warm" ? "filter-dark-warm" : "";

  const isVertical = readingMode === "vertical";

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {/* Progress bar (always visible at top) */}
      <div className="absolute top-0 left-0 right-0 z-30 h-1 bg-gray-200/50 dark:bg-gray-700/50">
        <div
          className="h-full bg-blue-500 transition-all duration-300"
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* Reading content area */}
      <div
        ref={contentRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={handleContentClick}
        className={`flex-1 ${isVertical ? "overflow-x-auto overflow-y-hidden touch-auto" : "overflow-y-auto touch-pan-y"} ${filterClass} pt-1`}
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
            vertical={isVertical}
            fontSize={fontSize}
          />
        )}
      </div>

      {/* Font size secondary bar */}
      {showFontSizeBar && (
        <div className="absolute bottom-16 left-0 right-0 z-40 flex items-center justify-center gap-4 border-t border-gray-200 bg-white/90 px-4 py-2 backdrop-blur dark:border-gray-700 dark:bg-gray-900/90">
          <button
            type="button"
            onClick={() => changeFontSize(-1)}
            disabled={fontSize <= FONT_SIZE_MIN}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800"
          >
            A−
          </button>
          <span className="text-sm tabular-nums text-gray-600 dark:text-gray-300">{fontSize}px</span>
          <button
            type="button"
            onClick={() => changeFontSize(1)}
            disabled={fontSize >= FONT_SIZE_MAX}
            className="rounded border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium disabled:opacity-40 dark:border-gray-600 dark:bg-gray-800"
          >
            A+
          </button>
        </div>
      )}

      {/* Footer icon bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-40 transition-transform duration-300 ${
          controlsVisible ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="flex items-center justify-around border-t border-gray-200 bg-white/90 px-2 py-1.5 backdrop-blur dark:border-gray-700 dark:bg-gray-900/90">
          {/* Back */}
          <button type="button" onClick={onClose} className="reader-icon-btn" title="Library">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>

          {/* Chapter select */}
          <button
            type="button"
            onClick={() => setShowChapterSelect(true)}
            className="reader-icon-btn"
            title="Chapters"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h7" />
            </svg>
          </button>

          {/* Highlight mode */}
          <button
            type="button"
            onClick={() => {
              const idx = HIGHLIGHT_MODES.indexOf(highlightMode);
              changeHighlightMode(HIGHLIGHT_MODES[(idx + 1) % HIGHLIGHT_MODES.length]);
            }}
            className={`reader-icon-btn ${highlightMode !== "off" ? "active" : ""}`}
            title={`Highlight: ${highlightMode}`}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
            </svg>
          </button>

          {/* Reading mode */}
          <button
            type="button"
            onClick={() => setReadingMode((m) => m === "horizontal" ? "vertical" : "horizontal")}
            className="reader-icon-btn"
            title={isVertical ? "Horizontal" : "Vertical"}
          >
            <span className="text-base font-bold">{isVertical ? "縦" : "横"}</span>
          </button>

          {/* Font size */}
          <button
            type="button"
            onClick={() => setShowFontSizeBar((v) => !v)}
            className={`reader-icon-btn ${showFontSizeBar ? "active" : ""}`}
            title="Font size"
          >
            <span className="text-sm font-bold">A</span>
          </button>

          {/* TTS */}
          <button
            type="button"
            onClick={() => {
              if (ttsPlaying) { if (ttsPaused) resumeTTS(); else pauseTTS(); }
              else startTTS();
            }}
            className={`reader-icon-btn ${ttsPlaying ? "active" : ""}`}
            title={ttsPlaying ? (ttsPaused ? "Resume" : "Pause") : "Read aloud"}
          >
            {ttsPlaying ? (
              ttsPaused ? (
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              ) : (
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              )
            ) : (
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            )}
          </button>
          {ttsPlaying && (
            <button
              type="button"
              onClick={stopTTS}
              className="reader-icon-btn"
              title="Stop"
            >
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 6h12v12H6z" />
              </svg>
            </button>
          )}

          {/* Grammar highlight */}
          <button
            type="button"
            onClick={() => changeHighlightMode(highlightMode === "grammar" ? "unknown" : "grammar")}
            className={`reader-icon-btn ${highlightMode === "grammar" ? "active" : ""}`}
            title="Grammar"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </button>

          {/* Reading filter */}
          <button
            type="button"
            onClick={changeReadingFilter}
            className={`reader-icon-btn ${readingFilter !== "none" ? "active" : ""}`}
            title={FILTER_LABEL[readingFilter]}
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Chapter full-screen overlay */}
      {showChapterSelect && (
        <div className="absolute inset-0 z-50 flex flex-col bg-white dark:bg-gray-900">
          <div className="flex items-center border-b border-gray-200 px-4 py-3 dark:border-gray-700">
            <button
              type="button"
              onClick={() => setShowChapterSelect(false)}
              className="rounded px-2 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              ← Back
            </button>
            <span className="ml-3 font-semibold">Chapters</span>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {book.chapters.map((ch, i) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => {
                  setChapterIndex(i);
                  setPageIndex(0);
                  setShowChapterSelect(false);
                }}
                className={`w-full border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50 ${
                  i === chapterIndex ? "bg-blue-50 dark:bg-blue-900/20" : ""
                }`}
              >
                <div className="text-sm font-medium">{ch.title}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Chapter {i + 1} of {book.chapters.length}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tap zones (visual only, actual handling is via onClick on content) */}
      {controlsVisible && (
        <>
          <div className="tap-zone tap-zone-left" />
          <div className="tap-zone tap-zone-right" />
        </>
      )}

      {/* Word popover */}
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
