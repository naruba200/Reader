import { useCallback, useEffect, useRef, useState } from "react";
import type { DictionaryEntry, LanguageCode } from "../core/types";
import {
  DICTIONARY_PACKS,
  getDictionaryStore,
} from "../core/dictionary";
import { packKey } from "../core/dictionary/downloadManager";
import type { IndexState } from "../core/dictionary/persistentStore";
import { dictionaryManager } from "../core/dictionary/downloadManager";
import { EntryCard } from "../reader/EntryCard";
import { KanjiSection } from "../reader/KanjiSection";
import { Toast } from "../components/Toast";
import { ConjugationTable } from "../reader/ConjugationTable";
import { isKanji } from "../core/language/japanese";
import { recordLookup } from "../study/history";
import { saveWord, isWordSaved } from "../study/wordBank";

export interface DictionaryPageProps {
  onBack: () => void;
  initial?: { language: LanguageCode; word?: string };
  onRegisterCloseHandler?: (close: (() => void) | null) => void;
}

interface HistoryItem {
  language: LanguageCode;
  word: string;
  at: number;
}

interface SearchResult {
  word: string;
  reading?: string;
  key: string;
}

const HISTORY_KEY = "smart-reader-dict-history";
const SUPPORTED: readonly LanguageCode[] = ["ja", "en"];

function loadHistory(): HistoryItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function pushHistory(item: HistoryItem): HistoryItem[] {
  const list = loadHistory().filter(
    (h) => !(h.language === item.language && h.word === item.word),
  );
  list.unshift(item);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 50)));
  } catch {
    /* storage full/unavailable */
  }
  return list.slice(0, 50);
}

const LANG_LABEL: Record<LanguageCode, string> = {
  ja: "日本語",
  en: "English",
  de: "Deutsch",
  fr: "Français",
  zh: "中文",
};

const JLPT_LEVELS = ["N5", "N4", "N3", "N2", "N1"] as const;

// Recent searches (query strings that led to opening a result), kept
// separate from the looked-up-words history below.
const SEARCH_HISTORY_KEY = "smart-reader-dict-searches";
function loadSearchHistory(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((q): q is string => typeof q === "string") : [];
  } catch {
    return [];
  }
}
function pushSearchHistory(q: string): string[] {
  const list = loadSearchHistory().filter((x) => x !== q);
  list.unshift(q);
  try {
    localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(list.slice(0, 10)));
  } catch {
    /* storage full/unavailable */
  }
  return list.slice(0, 10);
}

// Part-of-speech search filter. JMDict pos is a space-separated code
// string ("n", "v1", "adj-na", "exp n id"); WordNet pos is a full word
// ("noun", "verb"). Both shapes are matched here.
type PosFilter = "noun" | "verb" | "adjective" | "adverb" | "expression";
const POS_FILTERS: Array<{ id: PosFilter; label: string; jaOnly?: boolean }> = [
  { id: "noun", label: "Noun" },
  { id: "verb", label: "Verb" },
  { id: "adjective", label: "Adjective" },
  { id: "adverb", label: "Adverb" },
  { id: "expression", label: "Expression", jaOnly: true },
];
function posMatches(pos: string, filter: PosFilter): boolean {
  const tokens = pos.toLowerCase().split(/\s+/);
  switch (filter) {
    case "noun":
      return tokens.some((t) => t === "n" || t === "noun" || t.startsWith("n-"));
    case "verb":
      return tokens.some((t) => t.startsWith("v"));
    case "adjective":
      return tokens.some((t) => t.startsWith("adj") || t === "a");
    case "adverb":
      return tokens.some((t) => t.startsWith("adv") || t === "r");
    case "expression":
      return tokens.some((t) => t === "exp");
  }
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
        active
          ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
          : "theme-card theme-btn"
      }`}
    >
      {label}
    </button>
  );
}

const SOURCE_ICONS: Record<string, string> = {
  JMDict: "📚",
  "KANJIDIC2": "🔤",
  "Tae Kim's Grammar": "📖",
  "JLPT Grammar": "📝",
  WordNet: "🌐",
};

type CardData =
  | { type: "jlpt"; level: string }
  | { type: "source"; source: string; label: string; icon: string };

// Cache for parsed JLPT TSV: level -> word[]
let jlptCache: Record<string, string[]> | null = null;
let jlptCachePromise: Promise<Record<string, string[]>> | null = null;

async function loadJlptWords(): Promise<Record<string, string[]>> {
  if (jlptCache) return jlptCache;
  if (jlptCachePromise) return jlptCachePromise;

  jlptCachePromise = (async () => {
    try {
      const resp = await fetch("/dict/jlpt.ja.tsv");
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      const result: Record<string, string[]> = {};
      for (const line of text.split("\n")) {
        if (line.startsWith("#") || !line.trim()) continue;
        const tab = line.indexOf("\t");
        if (tab === -1) continue;
        const word = line.slice(0, tab).trim();
        const level = line.slice(tab + 1).trim();
        if (!word || !level) continue;
        if (!result[level]) result[level] = [];
        result[level].push(word);
      }
      jlptCache = result;
      return result;
    } catch {
      jlptCache = {};
      return {};
    }
  })();

  return jlptCachePromise;
}

export function DictionaryPage({ onBack, initial, onRegisterCloseHandler }: DictionaryPageProps) {
  const [language, setLanguage] = useState<LanguageCode>(initial?.language ?? "ja");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<{ surface: string; entry?: DictionaryEntry } | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());
  // Toast for visible failures (e.g. speaker with no working voice).
  const [toast, setToast] = useState<string | null>(null);
  const [searchHistory, setSearchHistory] = useState<string[]>(() => loadSearchHistory());
  const [wordOfDay, setWordOfDay] = useState<{ word: string; level: string; entry?: DictionaryEntry } | null>(null);
  const [similar, setSimilar] = useState<SearchResult[]>([]);
  const [jlptFilter, setJlptFilter] = useState<string | null>(null);
  const [posFilter, setPosFilter] = useState<PosFilter | null>(null);
  const [displayResults, setDisplayResults] = useState<SearchResult[]>([]);
  const [filtering, setFiltering] = useState(false);
  const [copied, setCopied] = useState(false);
  // Bumps to re-render the "+ Bank" saved state.
  const [, setBankTick] = useState(0);

  const saveSelectedWord = useCallback(() => {
    if (!selected) return;
    saveWord({
      word: selected.surface,
      reading: selected.entry?.readings?.[0],
      definition: selected.entry?.definition,
      pos: selected.entry?.pos,
      lang: language,
    });
    setBankTick((t) => t + 1);
  }, [selected, language]);

  const copyWord = useCallback(async () => {
    const text = selected?.entry?.word ?? selected?.surface ?? "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for environments without async clipboard access.
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [selected]);

  const canShare =
    typeof navigator !== "undefined" && typeof navigator.share === "function";

  const shareWord = useCallback(() => {
    const text = selected?.entry?.word ?? selected?.surface ?? "";
    if (!text) return;
    const definition = selected?.entry?.definition;
    void navigator.share?.({ text: definition ? `${text} — ${definition}` : text });
  }, [selected]);

  // Word list state (when a card is opened)
  const [activeCard, setActiveCard] = useState<CardData | null>(null);
  const [listEntries, setListEntries] = useState<DictionaryEntry[]>([]);
  const [listTotal, setListTotal] = useState(0);
  const [listPage, setListPage] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const LIST_PAGE_SIZE = 50;

  // JMDict installed state (for N3-N1 availability)
  const [jmdictInstalled, setJmdictInstalled] = useState(false);

  // Search index state
  const [indexState, setIndexState] = useState<IndexState>("idle");
  const indexStateRef = useRef<IndexState>("idle");

  // Check if JMDict is installed
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const state = dictionaryManager.getState();
      const jmdictKey = packKey({ language: "ja", source: "JMDict", version: "", fileName: "", estimatedBytes: 0 });
      if (!cancelled) setJmdictInstalled(!!state.infos[jmdictKey]);
    };
    void check();
    const unsub = dictionaryManager.subscribe(() => void check());
    return () => { cancelled = true; unsub(); };
  }, []);

  // Subscribe to index state changes
  useEffect(() => {
    const store = getDictionaryStore(language);
    const unsub = store.onIndexStateChange((s) => {
      indexStateRef.current = s;
      setIndexState(s);
    });
    const current = store.getIndexState();
    if (current !== indexStateRef.current) {
      indexStateRef.current = current;
      setIndexState(current);
    }
    return unsub;
  }, [language]);

  // Load word list when a card is active
  useEffect(() => {
    if (!activeCard) return;
    let cancelled = false;
    setListLoading(true);

    if (activeCard.type === "source") {
      // Source cards: use getPage with source filter (fast)
      void (async () => {
        const store = getDictionaryStore(language);
        const offset = listPage * LIST_PAGE_SIZE;
        const { entries, total } = await store.getPage(offset, LIST_PAGE_SIZE, { source: activeCard.source });
        if (!cancelled) {
          setListEntries(entries);
          setListTotal(total);
          setListLoading(false);
        }
      })();
    } else {
      // JLPT cards: fetch TSV, then look up words in dictionary
      void (async () => {
        const jlptWords = await loadJlptWords();
        const wordsForLevel = jlptWords[activeCard.level] ?? [];
        const store = getDictionaryStore(language);
        const offset = listPage * LIST_PAGE_SIZE;
        const pageWords = wordsForLevel.slice(offset, offset + LIST_PAGE_SIZE);

        // Look up each word in the dictionary
        const entries: DictionaryEntry[] = [];
        for (const word of pageWords) {
          const entry = await store.lookup(word);
          if (entry) {
            entries.push(entry);
          } else {
            // Create a minimal entry for words not in the dictionary
            entries.push({ word, definition: "" });
          }
        }

        if (!cancelled) {
          setListEntries(entries);
          setListTotal(wordsForLevel.length);
          setListLoading(false);
        }
      })();
    }

    return () => { cancelled = true; };
  }, [activeCard, listPage, language]);

  // Reset list when card changes
  useEffect(() => {
    setListPage(0);
    setListEntries([]);
    setListTotal(0);
  }, [activeCard]);

  // Search with debounce
  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const store = getDictionaryStore(language);
      const found = await store.search(q, 50);
      if (cancelled) return;
      setResults(
        found.map((r) => ({
          word: r.word,
          reading: r.reading,
          key: r.key,
        })),
      );
    }, 100);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, language]);

  // Word of the day: deterministic pick from the JLPT list by day-of-year.
  useEffect(() => {
    if (language !== "ja") {
      setWordOfDay(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const jlpt = await loadJlptWords();
      const combined: Array<{ word: string; level: string }> = [];
      for (const level of JLPT_LEVELS) {
        for (const w of jlpt[level] ?? []) combined.push({ word: w, level });
      }
      if (combined.length === 0) return;
      const now = new Date();
      const start = new Date(now.getFullYear(), 0, 0);
      const day = Math.floor((now.getTime() - start.getTime()) / 86400000);
      const pick = combined[day % combined.length];
      const store = getDictionaryStore("ja");
      const entry = await store.lookup(pick.word);
      if (!cancelled) setWordOfDay({ ...pick, entry });
    })();
    return () => {
      cancelled = true;
    };
  }, [language]);

  // Similar words for the open entry: words sharing its first kanji (or,
  // for kana/English words, starting with the same characters).
  useEffect(() => {
    if (!selected) {
      setSimilar([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      const surface = selected.surface;
      let q: string;
      if (language === "ja") {
        const firstKanji = [...surface].find((ch) => isKanji(ch));
        q = firstKanji ?? surface.charAt(0);
      } else {
        q = surface.slice(0, 3);
      }
      if (!q) return;
      const store = getDictionaryStore(language);
      const found = await store.search(q, 10);
      if (cancelled) return;
      setSimilar(
        found
          .filter((r) => r.word !== selected.entry?.word && r.word !== surface)
          .slice(0, 6)
          .map((r) => ({ word: r.word, reading: r.reading, key: r.key })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [selected, language]);

  // Apply JLPT + POS filters to the search results. The POS filter needs
  // a per-result lookup (the index carries no pos), so it shows a
  // "Filtering…" state while it runs.
  useEffect(() => {
    if (!jlptFilter && !posFilter) {
      setDisplayResults(results);
      setFiltering(false);
      return;
    }
    let cancelled = false;
    if (posFilter) setFiltering(true);
    void (async () => {
      let out = results;
      if (jlptFilter) {
        const jlpt = await loadJlptWords();
        const set = new Set(jlpt[jlptFilter] ?? []);
        out = out.filter((r) => set.has(r.word));
      }
      if (posFilter) {
        const store = getDictionaryStore(language);
        const kept: SearchResult[] = [];
        for (const r of out) {
          const entry = await store.lookup(r.word);
          if (entry?.pos && posMatches(entry.pos, posFilter)) kept.push(r);
        }
        out = kept;
      }
      if (cancelled) return;
      setDisplayResults(out);
      setFiltering(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [results, jlptFilter, posFilter, language]);

  const openLookup = useCallback((lang: LanguageCode, word: string) => {
    void (async () => {
      const store = getDictionaryStore(lang);
      const entry = await store.lookup(word);
      setLanguage(lang);
      setSelected({ surface: word, entry });
      setHistory(pushHistory({ language: lang, word, at: Date.now() }));
      recordLookup(word, lang);
    })();
  }, []);

  useEffect(() => {
    if (initial?.word) openLookup(initial.language, initial.word);
  }, [initial, openLookup]);

  const openResult = useCallback(
    (word: string, reading?: string) => {
      const q = query.trim();
      if (q && q !== word) setSearchHistory(pushSearchHistory(q));
      void (async () => {
        const store = getDictionaryStore(language);
        const entry = await store.lookup(word);
        setSelected({ surface: reading ?? word, entry });
        setHistory(pushHistory({ language, word, at: Date.now() }));
        recordLookup(word, language);
      })();
    },
    [language, query],
  );

  const switchLanguage = (lang: LanguageCode) => {
    setLanguage(lang);
    setSelected(null);
    setResults([]);
    setQuery("");
    setActiveCard(null);
    setJlptFilter(null);
    setPosFilter(null);
  };

  const openCard = (card: CardData) => {
    if (card.type === "jlpt" && !jmdictInstalled) return;
    setActiveCard(card);
    setSelected(null);
    setQuery("");
  };

  // Android back-button: pop internal sub-views (entry detail, then word
  // list) before falling through to the tab-level back behavior.
  useEffect(() => {
    if (selected) {
      onRegisterCloseHandler?.(() => setSelected(null));
    } else if (activeCard) {
      onRegisterCloseHandler?.(() => {
        setActiveCard(null);
        setListEntries([]);
        setListPage(0);
      });
    } else {
      onRegisterCloseHandler?.(null);
    }
    return () => onRegisterCloseHandler?.(null);
  }, [selected, activeCard, onRegisterCloseHandler]);

  const listTotalPages = Math.ceil(listTotal / LIST_PAGE_SIZE);

  // Source cards for current language
  const sourceCards: Extract<CardData, { type: "source" }>[] = (DICTIONARY_PACKS[language] ?? []).map((pack) => ({
    type: "source" as const,
    source: pack.source,
    label: pack.source,
    icon: SOURCE_ICONS[pack.source] ?? "📖",
  }));

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-gray-200 px-3 py-1.5 pt-safe dark:border-gray-700">
        <button
          type="button"
          onClick={() => {
            if (selected) { setSelected(null); return; }
            if (activeCard) { setActiveCard(null); return; }
            onBack();
          }}
          className="rounded-lg px-2.5 py-1.5 text-sm font-medium hover:bg-gray-100 active:scale-95 dark:hover:bg-gray-700"
        >
          ← {selected ? "Back" : activeCard ? "Cards" : "Library"}
        </button>
        <h1 className="text-base font-bold tracking-tight">Dictionary</h1>
        <div className="ml-auto flex gap-1.5">
          {SUPPORTED.map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => switchLanguage(lang)}
              className={`rounded-lg border px-2.5 py-1 text-[13px] font-medium transition-colors ${
                language === lang
                  ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
                  : "theme-card theme-btn"
              }`}
            >
              {LANG_LABEL[lang]}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {/* Search bar */}
        <div className="mb-3 flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${LANG_LABEL[language]}…`}
            className="theme-card flex-1 rounded-xl border px-4 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          />
          {indexState === "building" && (
            <span className="shrink-0 text-xs text-amber-600 dark:text-amber-400">
              Indexing…
            </span>
          )}
          {indexState === "ready" && query.trim() && (
            <span className="shrink-0 text-xs text-green-600 dark:text-green-400">
              ✓
            </span>
          )}
        </div>

        {selected ? (
          /* Entry detail view */
          <div>
            <div className="theme-card rounded-2xl border p-4 shadow-sm">
              <EntryCard
                word={selected.surface}
                entry={selected.entry}
                wordSaved={isWordSaved(selected.surface, language)}
                onSaveWord={saveSelectedWord}
                onSpeakError={(msg) => setToast(msg)}
              />
            </div>
            {language === "ja" && <KanjiSection word={selected.surface} />}
            {similar.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Similar words
                </h3>
                <div className="flex flex-wrap gap-1.5">
                  {similar.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => openLookup(language, r.word)}
                      className="theme-card theme-card-interactive rounded-full border px-3 py-1.5 text-[13px] shadow-sm transition-all active:scale-95"
                    >
                      {r.word}
                      {r.reading && r.reading !== r.word && (
                        <span className="ml-1 text-xs text-gray-400">{r.reading}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <ConjugationTable word={selected.entry?.word ?? selected.surface} pos={selected.entry?.pos} />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => void copyWord()}
                className="theme-card theme-btn rounded-full border px-3 py-1.5 text-xs font-medium"
              >
                {copied ? "Copied ✓" : "Copy word"}
              </button>
              {canShare && (
                <button
                  type="button"
                  onClick={() => void shareWord()}
                  className="theme-card theme-btn rounded-full border px-3 py-1.5 text-xs font-medium"
                >
                  Share
                </button>
              )}
            </div>
          </div>
        ) : query.trim() ? (
          /* Search results */
          <div>
            {language === "ja" && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                <FilterChip active={jlptFilter === null} onClick={() => setJlptFilter(null)} label="All levels" />
                {JLPT_LEVELS.map((level) => (
                  <FilterChip
                    key={level}
                    active={jlptFilter === level}
                    onClick={() => setJlptFilter(jlptFilter === level ? null : level)}
                    label={level}
                  />
                ))}
              </div>
            )}
            <div className="mb-2 flex flex-wrap gap-1.5">
              <FilterChip active={posFilter === null} onClick={() => setPosFilter(null)} label="All types" />
              {POS_FILTERS.filter((f) => !f.jaOnly || language === "ja").map((f) => (
                <FilterChip
                  key={f.id}
                  active={posFilter === f.id}
                  onClick={() => setPosFilter(posFilter === f.id ? null : f.id)}
                  label={f.label}
                />
              ))}
            </div>
            <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              {filtering
                ? "Filtering…"
                : `${displayResults.length} result${displayResults.length === 1 ? "" : "s"}`}
            </div>
            {displayResults.length === 0 ? (
              <p className="text-sm text-gray-400">
                {jlptFilter || posFilter ? "No matches for these filters." : "No matches."}
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {displayResults.map((r) => (
                  <li key={r.key}>
                    <button
                      type="button"
                      onClick={() => openResult(r.word, r.reading)}
                      className="w-full rounded-xl px-2 py-2 text-left transition-colors hover:bg-gray-100 active:bg-gray-200 dark:hover:bg-gray-800/60 dark:active:bg-gray-700/60"
                    >
                      <span className="text-base font-medium">{r.word}</span>
                      {r.reading && r.reading !== r.word && (
                        <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                          {r.reading}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : activeCard ? (
          /* Word list for a selected card */
          <div>
            <div className="mb-2 flex items-baseline gap-2">
              <span className="text-sm font-bold tracking-tight">
                {activeCard.type === "jlpt" ? `JLPT ${activeCard.level}` : activeCard.label}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {listTotal.toLocaleString()} words
              </span>
            </div>

            {listLoading ? (
              <p className="text-sm text-gray-400">Loading…</p>
            ) : listEntries.length === 0 ? (
              <p className="text-sm text-gray-400">No entries found.</p>
            ) : (
              <>
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {listEntries.map((entry, i) => (
                    <li key={`${entry.word}:${listPage * LIST_PAGE_SIZE + i}`}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelected({ surface: entry.word, entry });
                          setHistory(pushHistory({ language, word: entry.word, at: Date.now() }));
                        }}
                        className="w-full rounded-xl px-2 py-2 text-left transition-colors hover:bg-gray-100 active:bg-gray-200 dark:hover:bg-gray-800/60 dark:active:bg-gray-700/60"
                      >
                        <div className="flex items-baseline gap-2">
                          <span className="text-base font-medium">{entry.word}</span>
                          {entry.readings && entry.readings.length > 0 && entry.readings[0] !== entry.word && (
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              {entry.readings[0]}
                            </span>
                          )}
                        </div>
                        {entry.definition && (
                          <div className="mt-0.5 text-sm text-gray-600 dark:text-gray-300 line-clamp-1">
                            {entry.definition}
                          </div>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>

                {/* Pagination */}
                {listTotalPages > 1 && (
                  <div className="mt-3 flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <button
                      type="button"
                      disabled={listPage === 0}
                      onClick={() => setListPage((p) => p - 1)}
                      className="rounded border border-gray-300 px-2 py-0.5 hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-700"
                    >
                      ← Prev
                    </button>
                    <span>
                      {listPage + 1} / {listTotalPages}
                    </span>
                    <button
                      type="button"
                      disabled={listPage >= listTotalPages - 1}
                      onClick={() => setListPage((p) => p + 1)}
                      className="rounded border border-gray-300 px-2 py-0.5 hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-700"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          /* Category cards home */
          <div className="space-y-4">
            {/* Word of the day */}
            {wordOfDay && (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Word of the day</h2>
                <button
                  type="button"
                  onClick={() => openLookup(language, wordOfDay.word)}
                  className="theme-card theme-card-interactive w-full rounded-2xl border p-4 text-left shadow-sm transition-all active:scale-[0.98]"
                >
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold tracking-tight">{wordOfDay.word}</span>
                    <span className="text-xs theme-card-muted">JLPT {wordOfDay.level}</span>
                  </div>
                  {wordOfDay.entry?.readings?.[0] && wordOfDay.entry.readings[0] !== wordOfDay.word && (
                    <div className="text-sm theme-card-muted">{wordOfDay.entry.readings[0]}</div>
                  )}
                  {wordOfDay.entry?.definition && (
                    <div className="mt-1 text-sm line-clamp-2">{wordOfDay.entry.definition}</div>
                  )}
                </button>
              </section>
            )}

            {/* JLPT Level cards */}
            {language === "ja" && (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">JLPT Levels</h2>
                <div className="grid grid-cols-5 gap-2">
                  {JLPT_LEVELS.map((level) => (
                    <button
                      key={level}
                      type="button"
                      disabled={!jmdictInstalled}
                      onClick={() => openCard({ type: "jlpt", level })}
                      className={`rounded-2xl border p-3 text-center transition-all active:scale-95 ${
                        jmdictInstalled
                          ? "theme-card theme-card-interactive shadow-sm hover:shadow-md"
                          : "theme-card cursor-not-allowed opacity-50"
                      }`}
                    >
                      <div className="text-lg font-bold tracking-tight">{level}</div>
                      <div className="text-[11px] text-gray-500 dark:text-gray-400">
                        {jmdictInstalled ? "Open" : "Need JMDict"}
                      </div>
                    </button>
                  ))}
                </div>
                {!jmdictInstalled && (
                  <p className="mt-1 text-xs text-gray-400">
                    Download the JMDict pack in Downloads to access JLPT word lists.
                  </p>
                )}
              </section>
            )}

            {/* Source/pack cards */}
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Dictionaries</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {sourceCards.map((card) => (
                  <button
                    key={card.source}
                    type="button"
                    onClick={() => openCard(card)}
                    className="theme-card theme-card-interactive rounded-2xl border p-3 text-left shadow-sm transition-all hover:shadow-md active:scale-[0.98]"
                  >
                    <div className="text-2xl">{card.icon}</div>
                    <div className="mt-1 text-sm font-medium tracking-tight">{card.label}</div>
                  </button>
                ))}
              </div>
            </section>

            {/* Recent searches */}
            {searchHistory.length > 0 && (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Recent searches</h2>
                <div className="flex flex-wrap gap-1.5">
                  {searchHistory.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setQuery(q)}
                      className="theme-card theme-card-interactive rounded-full border px-3 py-1.5 text-[13px] shadow-sm transition-all active:scale-95"
                    >
                      🔍 {q}
                    </button>
                  ))}
                </div>
              </section>
            )}

            {/* Recently looked up */}
            {history.length > 0 && (
              <section>
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Recently looked up</h2>
                <div className="flex flex-wrap gap-1.5">
                  {history.slice(0, 20).map((h, i) => (
                    <button
                      key={`${h.language}:${h.word}:${i}`}
                      type="button"
                      onClick={() => openLookup(h.language, h.word)}
                      className="theme-card theme-card-interactive rounded-full border px-3 py-1.5 text-[13px] shadow-sm transition-all active:scale-95"
                    >
                      {h.word}
                      <span className="ml-1 text-xs text-gray-400">{LANG_LABEL[h.language]}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
      {toast && <Toast message={toast} onDone={() => setToast(null)} />}
    </div>
  );
}
