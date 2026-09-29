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

export interface DictionaryPageProps {
  onBack: () => void;
  initial?: { language: LanguageCode; word?: string };
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

export function DictionaryPage({ onBack, initial }: DictionaryPageProps) {
  const [language, setLanguage] = useState<LanguageCode>(initial?.language ?? "ja");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<{ surface: string; entry?: DictionaryEntry } | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());

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

  const openLookup = useCallback((lang: LanguageCode, word: string) => {
    void (async () => {
      const store = getDictionaryStore(lang);
      const entry = await store.lookup(word);
      setLanguage(lang);
      setSelected({ surface: word, entry });
      setHistory(pushHistory({ language: lang, word, at: Date.now() }));
    })();
  }, []);

  useEffect(() => {
    if (initial?.word) openLookup(initial.language, initial.word);
  }, [initial, openLookup]);

  const openResult = useCallback(
    (word: string, reading?: string) => {
      void (async () => {
        const store = getDictionaryStore(language);
        const entry = await store.lookup(word);
        setSelected({ surface: reading ?? word, entry });
        setHistory(pushHistory({ language, word, at: Date.now() }));
      })();
    },
    [language],
  );

  const switchLanguage = (lang: LanguageCode) => {
    setLanguage(lang);
    setSelected(null);
    setResults([]);
    setQuery("");
    setActiveCard(null);
  };

  const openCard = (card: CardData) => {
    if (card.type === "jlpt" && !jmdictInstalled) return;
    setActiveCard(card);
    setSelected(null);
    setQuery("");
  };

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
      <header className="flex items-center gap-3 border-b border-gray-200 px-4 py-2 dark:border-gray-700">
        <button
          type="button"
          onClick={() => {
            if (selected) { setSelected(null); return; }
            if (activeCard) { setActiveCard(null); return; }
            onBack();
          }}
          className="rounded px-2 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          ← {selected ? "Back" : activeCard ? "Cards" : "Library"}
        </button>
        <h1 className="text-lg font-bold">Dictionary</h1>
        <div className="ml-auto flex gap-2">
          {SUPPORTED.map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => switchLanguage(lang)}
              className={`rounded border px-2 py-1 text-sm ${
                language === lang
                  ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
                  : "border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800"
              }`}
            >
              {LANG_LABEL[lang]}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {/* Search bar */}
        <div className="mb-4 flex items-center gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${LANG_LABEL[language]}…`}
            className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800"
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
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <EntryCard word={selected.surface} entry={selected.entry} />
            </div>
          </div>
        ) : query.trim() ? (
          /* Search results */
          <div>
            <div className="mb-2 text-xs text-gray-500 dark:text-gray-400">
              {results.length} result{results.length === 1 ? "" : "s"}
            </div>
            {results.length === 0 ? (
              <p className="text-sm text-gray-400">No matches.</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {results.map((r) => (
                  <li key={r.key}>
                    <button
                      type="button"
                      onClick={() => openResult(r.word, r.reading)}
                      className="w-full px-1 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50"
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
            <div className="mb-3 flex items-center gap-2">
              <span className="text-sm font-semibold">
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
                        className="w-full px-1 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50"
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
          <div className="space-y-6">
            {/* JLPT Level cards */}
            {language === "ja" && (
              <section>
                <h2 className="mb-2 text-sm font-semibold">JLPT Levels</h2>
                <div className="grid grid-cols-5 gap-2">
                  {JLPT_LEVELS.map((level) => (
                    <button
                      key={level}
                      type="button"
                      disabled={!jmdictInstalled}
                      onClick={() => openCard({ type: "jlpt", level })}
                      className={`rounded-lg border p-3 text-center transition-shadow ${
                        jmdictInstalled
                          ? "border-gray-200 bg-white shadow-sm hover:shadow dark:border-gray-700 dark:bg-gray-800"
                          : "cursor-not-allowed border-gray-100 bg-gray-50 opacity-50 dark:border-gray-800 dark:bg-gray-900"
                      }`}
                    >
                      <div className="text-lg font-bold">{level}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
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
              <h2 className="mb-2 text-sm font-semibold">Dictionaries</h2>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {sourceCards.map((card) => (
                  <button
                    key={card.source}
                    type="button"
                    onClick={() => openCard(card)}
                    className="rounded-lg border border-gray-200 bg-white p-3 text-left shadow-sm transition-shadow hover:shadow dark:border-gray-700 dark:bg-gray-800"
                  >
                    <div className="text-2xl">{card.icon}</div>
                    <div className="mt-1 text-sm font-medium">{card.label}</div>
                  </button>
                ))}
              </div>
            </section>

            {/* Recently looked up */}
            {history.length > 0 && (
              <section>
                <h2 className="mb-2 text-sm font-semibold">Recently looked up</h2>
                <div className="flex flex-wrap gap-2">
                  {history.slice(0, 20).map((h, i) => (
                    <button
                      key={`${h.language}:${h.word}:${i}`}
                      type="button"
                      onClick={() => openLookup(h.language, h.word)}
                      className="rounded-full border border-gray-300 bg-white px-3 py-1 text-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700"
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
    </div>
  );
}
