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
import { Toast } from "../components/Toast";
import { ReadingSettingsPanel } from "./ReadingSettingsPanel";
import {
  loadReadingSettings,
  saveReadingSettings,
  loadBrightness,
  saveBrightness,
  loadWakeLock,
  saveWakeLock,
  TYPEFACE_STACKS,
  type ReadingSettings,
} from "./readingSettings";
import { tapTick } from "../core/util/haptics";
import { recordLookup } from "../study/history";
import { saveWord, isWordSaved } from "../study/wordBank";
import { addReadingTime } from "../study/stats";
import { sentenceAround, kataToHira } from "./furigana";
import {
  getActiveEngine,
  getActiveVoiceId,
  setActiveEngine,
  setActiveVoice,
  getActiveRate,
  setActiveRate,
  getAllEngines,
  getAllVoices,
  type TTSEngine,
  type TTSVoice,
} from "../core/tts";

/** A grammar pattern match in the text. */

export interface ReaderProps {
  book: BookDocument;
  onClose: () => void;
  onOpenDictionary?: (language: LanguageCode, word: string) => void;
  initialChapterIndex?: number;
  initialPageIndex?: number;
  onProgress?: (chapterIndex: number, pageIndex: number) => void;
  onRegisterCloseHandler?: (close: (() => void) | null) => void;
}

export type HighlightMode = "all" | "hard" | "unknown" | "off";

const HIGHLIGHT_KEY = "smart-reader-highlight-mode";
const HIGHLIGHT_MODES: readonly HighlightMode[] = ["all", "hard", "unknown", "off"];

function loadHighlightMode(): HighlightMode {
  try {
    const value = localStorage.getItem(HIGHLIGHT_KEY);
    if (value !== null && (HIGHLIGHT_MODES as readonly string[]).includes(value)) return value as HighlightMode;
  } catch { /* ignore */ }
  return "unknown";
}

export function shouldHighlightLevel(level: Level, mode: HighlightMode): boolean {
  switch (mode) {
    case "all": return true;
    case "unknown": return level === "UNKNOWN" || level === "FREQ_COMMON" || level === "FREQ_UNCOMMON" || level === "FREQ_RARE";
    case "hard": return level === "UNKNOWN" || level === "FREQ_RARE" || levelRank(level) >= 4;
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
  FREQ_COMMON: "underline decoration-sky-400 decoration-2 underline-offset-2",
  FREQ_UNCOMMON: "underline decoration-blue-500 decoration-2 underline-offset-2",
  FREQ_RARE: "underline decoration-indigo-600 decoration-2 underline-offset-2 decoration-dotted",
};

type ReadingFilter = "none" | "sepia" | "warm" | "dark-warm" | "amoled";

const FILTER_KEY = "smart-reader-reading-filter";

function loadReadingFilter(): ReadingFilter {
  try {
    const v = localStorage.getItem(FILTER_KEY);
    if (v === "sepia" || v === "warm" || v === "dark-warm" || v === "amoled") return v;
  } catch { /* ignore */ }
  return "none";
}

const FILTER_CYCLE: ReadingFilter[] = ["none", "sepia", "warm", "dark-warm", "amoled"];
const FILTER_LABEL: Record<ReadingFilter, string> = {
  none: "No filter",
  sepia: "Sepia",
  warm: "Warm",
  "dark-warm": "Dark warm",
  amoled: "AMOLED black",
};

type NavigationMode = "tap" | "swipe" | "both";
const NAV_MODE_KEY = "smart-reader-navigation-mode";

function loadNavigationMode(): NavigationMode {
  try {
    const v = localStorage.getItem(NAV_MODE_KEY);
    if (v === "tap" || v === "swipe" || v === "both") return v;
  } catch { /* ignore */ }
  return "both";
}

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
  // Per-book reading comfort settings (font, typeface, line height, margins)
  const [readingSettings, setReadingSettings] = useState<ReadingSettings>(() =>
    loadReadingSettings(book.id),
  );
  const changeReadingSettings = useCallback(
    (partial: Partial<ReadingSettings>) => {
      setReadingSettings(saveReadingSettings(book.id, partial));
    },
    [book.id],
  );

  // Device-level prefs
  const [brightness, setBrightnessState] = useState<number>(loadBrightness);
  const changeBrightness = useCallback((v: number) => {
    setBrightnessState(v);
    saveBrightness(v);
  }, []);
  const [wakeLockOn, setWakeLockOn] = useState<boolean>(loadWakeLock);
  const changeWakeLock = useCallback((on: boolean) => {
    setWakeLockOn(on);
    saveWakeLock(on);
  }, []);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);

  // Furigana readings above kanji (Japanese books only)
  const [furigana, setFurigana] = useState<boolean>(() => {
    try { return localStorage.getItem("smart-reader-furigana") === "1"; } catch { return false; }
  });
  const toggleFurigana = useCallback(() => {
    setFurigana((v) => {
      const next = !v;
      try { localStorage.setItem("smart-reader-furigana", next ? "1" : "0"); } catch { /* ignore */ }
      setToast(next ? "Furigana on" : "Furigana off");
      return next;
    });
  }, []);
  const [levelDb, setLevelDb] = useState<LevelDb | null>(null);
  const [highlightMode, setHighlightMode] = useState<HighlightMode>(loadHighlightMode);
  const [readingFilter, setReadingFilter] = useState<ReadingFilter>(loadReadingFilter);
  const [navigationMode, setNavigationMode] = useState<NavigationMode>(loadNavigationMode);

  // UI state
  const [controlsVisible, setControlsVisible] = useState(false);
  const [showChapterSelect, setShowChapterSelect] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // TTS state
  const [ttsPlaying, setTtsPlaying] = useState(false);
  const [ttsPaused, setTtsPaused] = useState(false);
  const [ttsSentenceIndex, setTtsSentenceIndex] = useState(-1);
  const [showVoiceSelector, setShowVoiceSelector] = useState(false);
  const [ttsVoices, setTtsVoices] = useState<TTSVoice[]>([]);
  const [ttsEngineId, setTtsEngineId] = useState<string>(() => getActiveEngine().id);
  // Speech rate: per-book memory, falling back to the global saved rate.
  const [ttsRate, setTtsRate] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem(`smart-reader-tts-rate-${book.id}`));
      if (v >= 0.5 && v <= 2) return v;
    } catch { /* ignore */ }
    return getActiveRate();
  });
  // Sleep timer in minutes (0 = off).
  const [sleepMinutes, setSleepMinutes] = useState(0);
  const sentencesRef = useRef<string[]>([]);
  // Mobile long-press (the voice selector used to be desktop right-click only)
  const longPressTimer = useRef<number | null>(null);
  const longPressFired = useRef(false);

  const cancelTtsLongPress = useCallback(() => {
    if (longPressTimer.current !== null) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  const startTtsLongPress = useCallback(() => {
    cancelTtsLongPress();
    longPressFired.current = false;
    longPressTimer.current = window.setTimeout(() => {
      longPressFired.current = true;
      longPressTimer.current = null;
      setShowVoiceSelector((v) => !v);
    }, 550);
  }, [cancelTtsLongPress]);

  // TTS - load voices for current language (and refresh when engine changes)
  const reloadTtsVoices = useCallback((engineId: string) => {
    const voices = getAllVoices().filter(
      (v) => v.engine === engineId && v.lang.startsWith(book.language),
    );
    setTtsVoices(voices);
  }, [book.language]);

  const switchTtsEngine = useCallback((engineId: string) => {
    setActiveEngine(engineId);
    setActiveVoice(null);
    setTtsEngineId(engineId);
    reloadTtsVoices(engineId);
    const engine = getAllEngines().find((e) => e.id === engineId);
    setToast(`Voice engine: ${engine?.name ?? engineId}`);
  }, [reloadTtsVoices]);

  // Controls visibility management
  const toggleControls = useCallback(() => {
    setControlsVisible((v) => !v);
  }, []);

  const changeHighlightMode = useCallback((mode: HighlightMode) => {
    setHighlightMode(mode);
    try { localStorage.setItem(HIGHLIGHT_KEY, mode); } catch { /* ignore */ }
    const labels: Record<HighlightMode, string> = { all: "All", hard: "Hard", unknown: "Unknown", off: "Off" };
    setToast(`Highlight: ${labels[mode]}`);
  }, []);

  const changeReadingFilter = useCallback(() => {
    setReadingFilter((prev) => {
      const idx = FILTER_CYCLE.indexOf(prev);
      const next = FILTER_CYCLE[(idx + 1) % FILTER_CYCLE.length];
      try { localStorage.setItem(FILTER_KEY, next); } catch { /* ignore */ }
      setToast(FILTER_LABEL[next]);
      return next;
    });
  }, []);

  const changeNavigationMode = useCallback(() => {
    setNavigationMode((prev) => {
      const cycle: NavigationMode[] = ["both", "tap", "swipe"];
      const idx = cycle.indexOf(prev);
      const next = cycle[(idx + 1) % cycle.length];
      try { localStorage.setItem(NAV_MODE_KEY, next); } catch { /* ignore */ }
      const labels: Record<NavigationMode, string> = { both: "Tap + Swipe", tap: "Tap only", swipe: "Swipe only" };
      setToast(labels[next]);
      return next;
    });
  }, []);

  // Popover close handler for Android back
  const popoverCloseTimeRef = useRef(0);
  useEffect(() => {
    if (!popover) {
      onRegisterCloseHandler?.(null);
      popoverCloseTimeRef.current = Date.now();
      return;
    }
    onRegisterCloseHandler?.(() => setPopover(null));
    return () => onRegisterCloseHandler?.(null);
  }, [popover, onRegisterCloseHandler]);

  const chapter = book.chapters[chapterIndex] ?? book.chapters[0];
  const pages = useMemo(() => paginateChapter(chapter), [chapter]);
  const page = pages[Math.min(pageIndex, pages.length - 1)];

  // Save the popover's word to the word bank with sentence context.
  const savePopoverWord = useCallback(() => {
    if (!popover) return;
    const token = popover.token;
    const word = token.lemma?.trim() || token.surface;
    saveWord({
      word,
      reading: entry?.readings?.[0] ?? (token.reading ? kataToHira(token.reading) : undefined),
      definition: entry?.definition,
      pos: entry?.pos,
      sentence: sentenceAround(chapter.text, token.start),
      bookTitle: book.title,
      lang: book.language,
    });
    setToast("Saved to word bank");
  }, [popover, entry, chapter.text, book.title, book.language]);

  const popoverWordSaved = popover
    ? isWordSaved(popover.token.lemma?.trim() || popover.token.surface, book.language)
    : false;

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
      tapTick();
      recordLookup(token.lemma?.trim() || token.surface, book.language);
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
    tapTick();
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
    tapTick();
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
      if (Date.now() - popoverCloseTimeRef.current < 300) return;
      if ((e.target as HTMLElement).closest("[data-word]")) return;
      if (navigationMode === "swipe") {
        toggleControls();
        return;
      }
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ratio = x / rect.width;
      if (ratio < 0.15) goPrev();
      else if (ratio > 0.85) goNext();
      else toggleControls();
    },
    [goPrev, goNext, toggleControls, popover, navigationMode],
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
      if (navigationMode === "tap") return;
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
    [goNext, goPrev, navigationMode],
  );

  // TTS - load voices for current language; also refresh when the voice
  // selector opens, since engine voices load asynchronously.
  useEffect(() => {
    reloadTtsVoices(ttsEngineId);
  }, [book.language, ttsEngineId, showVoiceSelector, reloadTtsVoices]);

  // Keep-awake via the Wake Lock API while reading (re-request on visibility change).
  useEffect(() => {
    if (!wakeLockOn) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (type: string) => Promise<{ release: () => Promise<void> }> };
        };
        if (!nav.wakeLock) return;
        if (document.visibilityState !== "visible") return;
        lock = await nav.wakeLock.request("screen");
        if (cancelled) {
          void lock.release().catch(() => {});
          lock = null;
        }
      } catch (err) {
        console.warn("Wake lock request failed", err);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible" && !lock) void request();
    };
    void request();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      if (lock) void lock.release().catch(() => {});
    };
  }, [wakeLockOn]);

  // Sleep timer: stop read-aloud after N minutes.
  useEffect(() => {
    if (!ttsPlaying || sleepMinutes <= 0) return;
    const t = window.setTimeout(() => {
      getActiveEngine().stop();
      setTtsPlaying(false);
      setTtsPaused(false);
      setTtsSentenceIndex(-1);
      setSleepMinutes(0);
      setToast("Sleep timer ended");
    }, sleepMinutes * 60_000);
    return () => window.clearTimeout(t);
  }, [ttsPlaying, sleepMinutes]);

  // Reading-time stats: bank visible reading time every 30s and on close.
  useEffect(() => {
    let accMs = 0;
    let last = Date.now();
    const note = () => {
      const now = Date.now();
      if (document.visibilityState === "visible") accMs += now - last;
      last = now;
    };
    const flush = () => {
      if (accMs >= 60_000) {
        addReadingTime(book.id, accMs);
        accMs = 0;
      }
    };
    const iv = window.setInterval(() => { note(); flush(); }, 30_000);
    document.addEventListener("visibilitychange", note);
    return () => {
      window.clearInterval(iv);
      document.removeEventListener("visibilitychange", note);
      note();
      if (accMs > 10_000) addReadingTime(book.id, accMs);
    };
  }, [book.id]);

  // MediaSession: lock-screen / notification metadata while reading aloud.
  useEffect(() => {
    try {
      const ms = navigator.mediaSession;
      if (!ms) return;
      ms.metadata = ttsPlaying
        ? new MediaMetadata({
            title: chapter.title || book.title,
            artist: book.author ?? "Smart Reader",
            album: book.title,
          })
        : null;
    } catch { /* ignore */ }
  }, [ttsPlaying, chapter.title, book.title, book.author]);

  // TTS - sentence-level sequential speaking.
  // Tries the active engine first, then falls back to any other available
  // engine once. If every engine fails, the user gets a toast instead of
  // the old behavior: silence and a stuck pause icon.
  const speakSentence = useCallback(async (sentences: string[], index: number): Promise<void> => {
    if (index >= sentences.length) {
      setTtsPlaying(false);
      setTtsPaused(false);
      setTtsSentenceIndex(-1);
      return;
    }
    const text = sentences[index];
    if (!text.trim()) {
      return speakSentence(sentences, index + 1);
    }
    setTtsSentenceIndex(index);

    const active = getActiveEngine();
    const engines: TTSEngine[] = [active, ...getAllEngines().filter((e) => e.id !== active.id)];

    let spoken = false;
    for (const engine of engines) {
      const isActive = engine.id === active.id;
      const voiceId = isActive
        ? (getActiveVoiceId() ?? ttsVoices.find((v) => v.engine === engine.id)?.id)
        : ttsVoices.find((v) => v.engine === engine.id)?.id;
      try {
        await engine.speak(text, voiceId, ttsRate);
        spoken = true;
        break;
      } catch (err) {
        console.warn(`TTS engine "${engine.id}" failed, trying next`, err);
      }
    }
    if (!spoken) {
      setTtsPlaying(false);
      setTtsPaused(false);
      setTtsSentenceIndex(-1);
      setToast("Read aloud failed — no working voice on this device");
      return;
    }
    // Continue to next sentence
    return speakSentence(sentences, index + 1);
  }, [ttsRate, ttsVoices]);

  const changeTtsRate = useCallback((rate: number) => {
    const clamped = Math.min(2, Math.max(0.5, Math.round(rate * 10) / 10));
    setTtsRate(clamped);
    setActiveRate(clamped);
    try { localStorage.setItem(`smart-reader-tts-rate-${book.id}`, String(clamped)); } catch { /* ignore */ }
  }, [book.id]);

  const startTTS = useCallback(() => {
    const text = chapter.text;
    if (!text) return;
    const sentences = text.split(/(?<=[。！？.!?])\s*/).filter((s) => s.trim());
    if (sentences.length === 0) return;
    sentencesRef.current = sentences;
    setTtsPlaying(true);
    setTtsPaused(false);
    speakSentence(sentences, 0);
  }, [chapter.text, speakSentence]);

  const pauseTTS = useCallback(() => { getActiveEngine().pause(); setTtsPaused(true); }, []);
  const resumeTTS = useCallback(() => {
    const engine = getActiveEngine();
    if (engine.id === "native") {
      // Device TTS has no true pause (pause stops it), so resume restarts
      // the current sentence instead of silently doing nothing.
      setTtsPaused(false);
      void speakSentence(sentencesRef.current, Math.max(0, ttsSentenceIndex));
    } else {
      engine.resume();
      setTtsPaused(false);
    }
  }, [speakSentence, ttsSentenceIndex]);
  const stopTTS = useCallback(() => {
    getActiveEngine().stop();
    setTtsPlaying(false);
    setTtsPaused(false);
    setTtsSentenceIndex(-1);
  }, []);

  // MediaSession action handlers: headset buttons, lock screen, notification.
  useEffect(() => {
    let ms: MediaSession | null = null;
    try {
      ms = navigator.mediaSession ?? null;
      if (!ms || typeof ms.setActionHandler !== "function") return;
      ms.setActionHandler("play", () => { if (ttsPaused) resumeTTS(); });
      ms.setActionHandler("pause", () => { if (ttsPlaying && !ttsPaused) pauseTTS(); });
      ms.setActionHandler("previoustrack", () => { goPrev(); });
      ms.setActionHandler("nexttrack", () => { goNext(); });
    } catch { /* ignore */ }
    return () => {
      try {
        ms?.setActionHandler("play", null);
        ms?.setActionHandler("pause", null);
        ms?.setActionHandler("previoustrack", null);
        ms?.setActionHandler("nexttrack", null);
      } catch { /* ignore */ }
    };
  }, [ttsPlaying, ttsPaused, pauseTTS, resumeTTS, goPrev, goNext]);


  const isAmoled = readingFilter === "amoled";

  const filterClass = readingFilter === "sepia" ? "filter-sepia" :
    readingFilter === "warm" ? "filter-warm" :
    readingFilter === "dark-warm" ? "filter-dark-warm" : "";

  const chromeClass =
    isAmoled ? "bg-black" :
    readingFilter === "sepia" ? "bg-[rgb(245,241,232)] dark:bg-[rgb(30,25,20)]" :
    readingFilter === "warm" ? "bg-[rgb(255,249,235)] dark:bg-[rgb(35,30,22)]" :
    readingFilter === "dark-warm" ? "bg-[rgb(240,235,225)] dark:bg-[rgb(25,22,18)]" : "bg-white dark:bg-gray-900";

  const isVertical = readingMode === "vertical";

  return (
    <div className={`relative flex h-full flex-col overflow-hidden ${isAmoled ? "dark" : ""}`}>
      {/* In-app brightness dim overlay (below sheets/popovers) */}
      {brightness < 1 && (
        <div
          className="pointer-events-none absolute inset-0 z-[70] bg-black"
          style={{ opacity: 1 - brightness }}
        />
      )}
      {/* Page counter (hidden when controls are visible) */}
      {!controlsVisible && (
      <div className={`absolute top-0 left-0 right-0 z-30 flex items-center justify-center py-0.5 text-xs text-gray-500 ${chromeClass}`}>
        Page {pageIndex + 1} / {pages.length}
      </div>
      )}


      {/* Navigation bar (visible when controls are shown) */}
      {controlsVisible && (
        <div className={`absolute top-6 left-0 right-0 z-30 flex items-center justify-center gap-4 border-b border-gray-200 py-1 ${chromeClass}`}>
          <button
            type="button"
            onClick={() => {
              if (chapterIndex > 0) {
                setChapterIndex(chapterIndex - 1);
                setPageIndex(0);
              }
            }}
            disabled={chapterIndex === 0}
            className="reader-icon-btn disabled:opacity-30"
            title="Previous chapter"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={goPrev}
            disabled={chapterIndex === 0 && pageIndex === 0}
            className="reader-icon-btn disabled:opacity-30"
            title="Previous page"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {chapterIndex + 1}/{book.chapters.length}
          </span>
          <button
            type="button"
            onClick={goNext}
            disabled={chapterIndex === book.chapters.length - 1 && pageIndex === pages.length - 1}
            className="reader-icon-btn disabled:opacity-30"
            title="Next page"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => {
              if (chapterIndex < book.chapters.length - 1) {
                setChapterIndex(chapterIndex + 1);
                setPageIndex(0);
              }
            }}
            disabled={chapterIndex === book.chapters.length - 1}
            className="reader-icon-btn disabled:opacity-30"
            title="Next chapter"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        </div>
      )}

      {/* Reading content area */}
      <div
        ref={contentRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={handleContentClick}
        className={`flex-1 ${isVertical ? "overflow-x-auto overflow-y-hidden touch-auto" : "overflow-y-auto touch-pan-y"} ${filterClass} ${isAmoled ? "bg-black" : ""} pt-1`}
        style={{ fontFamily: TYPEFACE_STACKS[readingSettings.typeface] }}
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
            fontSize={readingSettings.fontSize}
            lineHeight={readingSettings.lineHeight}
            contentPaddingX={readingSettings.marginX}
            furigana={furigana && book.language === "ja"}
            ttsSentenceIndex={ttsSentenceIndex}
            ttsSentences={ttsPlaying ? sentencesRef.current : []}
          />
        )}
      </div>

      {/* Footer icon bar */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-40 transition-transform duration-300 ${
          controlsVisible ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className={`flex items-center justify-around border-t border-gray-200 px-2 py-1.5 ${chromeClass}`}>
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
            onClick={() => {
              setReadingMode((m) => {
                const next = m === "horizontal" ? "vertical" : "horizontal";
                setToast(next === "vertical" ? "Vertical" : "Horizontal");
                return next;
              });
            }}
            className="reader-icon-btn"
            title={isVertical ? "Horizontal" : "Vertical"}
          >
            <span className="text-base font-bold">{isVertical ? "縦" : "横"}</span>
          </button>

          {/* Reading settings */}
          <button
            type="button"
            onClick={() => setShowSettingsPanel(true)}
            className="reader-icon-btn"
            title="Reading settings"
          >
            <span className="text-sm font-bold">A</span>
          </button>

          {/* Furigana (Japanese only) */}
          {book.language === "ja" && (
            <button
              type="button"
              onClick={toggleFurigana}
              className={`reader-icon-btn ${furigana ? "active" : ""}`}
              title="Furigana"
            >
              <span className="text-sm font-bold">あ</span>
            </button>
          )}

          {/* TTS */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                // A long-press opens the voice selector instead of speaking;
                // swallow the click that follows it on touch devices.
                if (longPressFired.current) {
                  longPressFired.current = false;
                  return;
                }
                if (ttsPlaying) { if (ttsPaused) resumeTTS(); else pauseTTS(); }
                else startTTS();
              }}
              onTouchStart={startTtsLongPress}
              onTouchEnd={cancelTtsLongPress}
              onTouchMove={cancelTtsLongPress}
              onContextMenu={(e) => { e.preventDefault(); setShowVoiceSelector((v) => !v); }}
              className={`reader-icon-btn ${ttsPlaying ? "active" : ""}`}
              title={ttsPlaying ? (ttsPaused ? "Resume" : "Pause") : "Read aloud (long-press for voice)"}
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
            {showVoiceSelector && (
              <div className={`absolute bottom-full left-0 mb-2 w-56 rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-600 dark:bg-gray-800 z-50`}>
                <div className="mb-1 text-xs font-semibold text-gray-500 dark:text-gray-400">Engine</div>
                <div className="mb-2 flex gap-1">
                  {getAllEngines().map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => switchTtsEngine(e.id)}
                      className={`flex-1 rounded px-2 py-1 text-xs font-medium ${
                        ttsEngineId === e.id
                          ? "bg-blue-500 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                      }`}
                    >
                      {e.name}
                    </button>
                  ))}
                </div>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Speed</span>
                  <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">{ttsRate.toFixed(1)}×</span>
                </div>
                <input
                  type="range"
                  min={0.5}
                  max={2}
                  step={0.1}
                  value={ttsRate}
                  onChange={(e) => changeTtsRate(Number(e.target.value))}
                  className="mb-2 w-full accent-blue-600"
                  aria-label="Speech speed"
                />
                <div className="mb-1 text-xs font-semibold text-gray-500 dark:text-gray-400">Sleep timer</div>
                <div className="mb-2 flex flex-wrap gap-1">
                  {[0, 5, 10, 15, 30, 60].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setSleepMinutes(m)}
                      className={`rounded px-2 py-1 text-xs font-medium ${
                        sleepMinutes === m
                          ? "bg-blue-500 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                      }`}
                    >
                      {m === 0 ? "Off" : `${m}m`}
                    </button>
                  ))}
                </div>
                <div className="mb-1 text-xs font-semibold text-gray-500 dark:text-gray-400">Voice</div>
                <div className="max-h-40 overflow-y-auto custom-scrollbar">
                  {ttsVoices.length === 0 ? (
                    <p className="text-xs text-gray-400 py-1">No voices for this language</p>
                  ) : (
                    ttsVoices.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => { setActiveVoice(v.id); setShowVoiceSelector(false); setToast(`Voice: ${v.name}`); }}
                        className={`w-full rounded px-2 py-1 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700 ${
                          getActiveVoiceId() === v.id ? "bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200" : ""
                        }`}
                      >
                        <div className="font-medium">{v.name}</div>
                        <div className="text-gray-400">{v.lang}</div>
                      </button>
                    ))
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowVoiceSelector(false)}
                  className="mt-1 w-full rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
            )}
            {sleepMinutes > 0 && ttsPlaying && (
              <span
                className="absolute -right-1 -top-1 rounded-full bg-blue-600 px-1 text-[10px] font-bold leading-4 text-white"
                title={`Sleep timer: ${sleepMinutes} min`}
              >
                {sleepMinutes}
              </span>
            )}
          </div>
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

          {/* Navigation mode */}
          <button
            type="button"
            onClick={changeNavigationMode}
            className={`reader-icon-btn ${navigationMode !== "both" ? "active" : ""}`}
            title={`Nav: ${navigationMode}`}
          >
            <span className="text-xs font-bold">{navigationMode === "tap" ? "👆" : navigationMode === "swipe" ? "👋" : "👆👋"}</span>
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
          <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
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
          wordSaved={popoverWordSaved}
          onSaveWord={savePopoverWord}
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

      {/* Reading settings bottom sheet */}
      <ReadingSettingsPanel
        open={showSettingsPanel}
        onClose={() => setShowSettingsPanel(false)}
        settings={readingSettings}
        onChange={changeReadingSettings}
        brightness={brightness}
        onBrightnessChange={changeBrightness}
        wakeLock={wakeLockOn}
        onWakeLockChange={changeWakeLock}
      />

      {/* Toast notification */}
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
