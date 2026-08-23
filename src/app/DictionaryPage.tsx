import { useCallback, useEffect, useRef, useState } from "react";
import type { DictionaryEntry, LanguageCode } from "../core/types";
import {
  bundledDefaultPack,
  DICTIONARY_PACKS,
  formatBytes,
  getDictionaryStore,
  useDictionaryManager,
} from "../core/dictionary";
import type { IndexState } from "../core/dictionary/persistentStore";
import { packKey } from "../core/dictionary/downloadManager";
import type { PackDefinition } from "../core/dictionary/packs";
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
const PAGE_SIZE_OPTIONS = [50, 100, 200];

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

function splitOnKun(readings?: string[]): { onReading: string; kunReading: string } {
  if (!readings || readings.length === 0) return { onReading: "", kunReading: "" };
  const on: string[] = [];
  const kun: string[] = [];
  for (const r of readings) {
    const hasKatakana = /[\u30A0-\u30FF]/.test(r);
    const hasHiragana = /[\u3040-\u309F]/.test(r);
    if (hasKatakana && !hasHiragana) {
      on.push(r);
    } else {
      kun.push(r);
    }
  }
  return { onReading: on.join(", "), kunReading: kun.join(", ") };
}

export function DictionaryPage({ onBack, initial }: DictionaryPageProps) {
  const [language, setLanguage] = useState<LanguageCode>(initial?.language ?? "ja");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<{ surface: string; entry?: DictionaryEntry } | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());
  const [viewMode, setViewMode] = useState<"list" | "table">("list");

  // Paginated table state
  const [pageSize, setPageSize] = useState(100);
  const [currentPage, setCurrentPage] = useState(0);
  const [pageEntries, setPageEntries] = useState<DictionaryEntry[]>([]);
  const [totalEntries, setTotalEntries] = useState(0);
  const [pageLoading, setPageLoading] = useState(false);

  // Search index state
  const [indexState, setIndexState] = useState<IndexState>("idle");
  const indexStateRef = useRef<IndexState>("idle");

  const manager = useDictionaryManager(SUPPORTED);

  // Subscribe to index state changes
  useEffect(() => {
    const store = getDictionaryStore(language);
    const unsub = store.onIndexStateChange((s) => {
      indexStateRef.current = s;
      setIndexState(s);
    });
    // Check current state in case it changed between render and effect
    const current = store.getIndexState();
    if (current !== indexStateRef.current) {
      indexStateRef.current = current;
      setIndexState(current);
    }
    return unsub;
  }, [language]);

  // Load paginated entries when switching to table view or changing page
  useEffect(() => {
    if (viewMode !== "table") return;
    let cancelled = false;
    setPageLoading(true);
    void (async () => {
      const store = getDictionaryStore(language);
      const offset = currentPage * pageSize;
      const { entries, total } = await store.getPage(offset, pageSize);
      if (!cancelled) {
        setPageEntries(entries);
        setTotalEntries(total);
        setPageLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [viewMode, language, currentPage, pageSize]);

  // Reset table state when language changes
  useEffect(() => {
    setCurrentPage(0);
    setPageEntries([]);
    setTotalEntries(0);
  }, [language]);

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
  };

  const switchViewMode = (mode: "list" | "table") => {
    setViewMode(mode);
    if (mode === "list") {
      setPageEntries([]);
      setTotalEntries(0);
    }
  };

  const totalPages = Math.ceil(totalEntries / pageSize);
  const bundledCount = bundledDefaultPack(language).length;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-gray-200 px-4 py-2 dark:border-gray-700">
        <button
          type="button"
          onClick={onBack}
          className="rounded px-2 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          ← Library
        </button>
        <h1 className="text-lg font-bold">Dictionary</h1>
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={() => switchViewMode(viewMode === "list" ? "table" : "list")}
            className={`rounded border px-2 py-1 text-sm ${
              viewMode === "table"
                ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200"
                : "border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800"
            }`}
            title={viewMode === "table" ? "List view" : "Table view"}
          >
            {viewMode === "table" ? "☰" : "▦"}
          </button>
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
          <div>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="mb-3 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              ← Back to results
            </button>
            <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <EntryCard word={selected.surface} entry={selected.entry} />
            </div>
          </div>
        ) : query.trim() ? (
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
        ) : viewMode === "table" ? (
          <div>
            {pageLoading ? (
              <p className="text-sm text-gray-400">Loading entries…</p>
            ) : (
              <>
                {/* Pagination controls */}
                <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span>{totalEntries.toLocaleString()} entries</span>
                  <span>·</span>
                  <span>Page {currentPage + 1} of {totalPages}</span>
                  <span>·</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setCurrentPage(0);
                    }}
                    className="rounded border border-gray-300 bg-white px-1 py-0.5 text-xs dark:border-gray-600 dark:bg-gray-800"
                  >
                    {PAGE_SIZE_OPTIONS.map((n) => (
                      <option key={n} value={n}>{n} / page</option>
                    ))}
                  </select>
                  <div className="ml-auto flex gap-1">
                    <button
                      type="button"
                      disabled={currentPage === 0}
                      onClick={() => setCurrentPage((p) => p - 1)}
                      className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-700"
                    >
                      ← Prev
                    </button>
                    <button
                      type="button"
                      disabled={currentPage >= totalPages - 1}
                      onClick={() => setCurrentPage((p) => p + 1)}
                      className="rounded border border-gray-300 px-2 py-0.5 text-xs hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-700"
                    >
                      Next →
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:border-gray-700 dark:text-gray-400">
                        <th className="sticky top-0 bg-white px-3 py-2 dark:bg-gray-900">Word</th>
                        <th className="sticky top-0 bg-white px-3 py-2 dark:bg-gray-900">On</th>
                        <th className="sticky top-0 bg-white px-3 py-2 dark:bg-gray-900">Kun</th>
                        <th className="sticky top-0 bg-white px-3 py-2 dark:bg-gray-900">POS</th>
                        <th className="sticky top-0 bg-white px-3 py-2 dark:bg-gray-900">Definition</th>
                        <th className="sticky top-0 bg-white px-3 py-2 dark:bg-gray-900">Examples</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                      {pageEntries.map((entry, i) => {
                        const { onReading, kunReading } = splitOnKun(entry.readings);
                        return (
                          <tr
                            key={`${entry.word}:${currentPage * pageSize + i}`}
                            className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                            onClick={() => {
                              setSelected({ surface: entry.word, entry });
                              setHistory(pushHistory({ language, word: entry.word, at: Date.now() }));
                            }}
                          >
                            <td className="whitespace-nowrap px-3 py-2 font-medium">{entry.word}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-gray-500 dark:text-gray-400">
                              {onReading || "—"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-gray-500 dark:text-gray-400">
                              {kunReading || "—"}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                              {entry.pos ?? "—"}
                            </td>
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                              {entry.definition}
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 max-w-xs truncate">
                              {entry.examples?.slice(0, 2).join(" / ") ?? "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Bottom pagination */}
                <div className="mt-3 flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <button
                    type="button"
                    disabled={currentPage === 0}
                    onClick={() => setCurrentPage(0)}
                    className="rounded border border-gray-300 px-2 py-0.5 hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-700"
                  >
                    « First
                  </button>
                  <button
                    type="button"
                    disabled={currentPage === 0}
                    onClick={() => setCurrentPage((p) => p - 1)}
                    className="rounded border border-gray-300 px-2 py-0.5 hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-700"
                  >
                    ‹ Prev
                  </button>
                  <span>
                    Page {currentPage + 1} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages - 1}
                    onClick={() => setCurrentPage((p) => p + 1)}
                    className="rounded border border-gray-300 px-2 py-0.5 hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-700"
                  >
                    Next ›
                  </button>
                  <button
                    type="button"
                    disabled={currentPage >= totalPages - 1}
                    onClick={() => setCurrentPage(totalPages - 1)}
                    className="rounded border border-gray-300 px-2 py-0.5 hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-700"
                  >
                    Last »
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            <section>
              <h2 className="mb-2 text-sm font-semibold">Dictionary packs</h2>
              {SUPPORTED.map((lang) => (
                <div key={lang} className="mb-3">
                  <h3 className="mb-1 text-xs font-medium text-gray-500 dark:text-gray-400">
                    {LANG_LABEL[lang]}
                  </h3>
                  {(DICTIONARY_PACKS[lang] ?? []).map((def) => (
                    <PackCard key={`${lang}:${def.source}`} def={def} manager={manager} />
                  ))}
                </div>
              ))}
            </section>

            {history.length > 0 && (
              <section>
                <h2 className="mb-2 text-sm font-semibold">Recently looked up</h2>
                <div className="flex flex-wrap gap-2">
                  {history.slice(0, 20).map((h, i) => (
                    <button
                      key={`${h.language}:${h.word}:${i}`}
                      type="button"
                      onClick={() => {
                        switchLanguage(h.language);
                        openLookup(h.language, h.word);
                      }}
                      className="rounded-full border border-gray-300 bg-white px-3 py-1 text-sm hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:hover:bg-gray-700"
                    >
                      {h.word}
                      <span className="ml-1 text-xs text-gray-400">{LANG_LABEL[h.language]}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}

            <p className="text-xs text-gray-400">
              Bundled default for {LANG_LABEL[language]}: {bundledCount} words.
              Download a full pack below or import your own file to expand lookups.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function PackCard({
  def,
  manager,
}: {
  def: PackDefinition;
  manager: ReturnType<typeof useDictionaryManager>;
}) {
  const key = packKey(def);
  const info = manager.infos[key];
  const prog = manager.progress[key];
  const error = manager.errors[key];
  const label = def.source;

  const importInputId = `dict-import-${def.language}-${def.source}`;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-center gap-2">
        <span className="font-medium">{label}</span>
        <span
          className={`ml-auto rounded px-2 py-0.5 text-xs ${
            prog
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200"
              : info
                ? "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-200"
                : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300"
          }`}
        >
          {prog ? "Downloading" : info ? "Installed" : "Not installed"}
        </span>
      </div>

      {info && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          v{info.version} · {info.count.toLocaleString()} entries · {formatBytes(info.sizeBytes)}
          {info.source !== def.source && ` · from ${info.source}`}
        </p>
      )}

      {prog && (
        <div className="mt-2">
          <div className="h-2 w-full overflow-hidden rounded bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{
                width: `${prog.total && prog.total > 0 ? Math.min(100, (prog.received / prog.total) * 100) : prog.count > 0 ? 50 : 0}%`,
              }}
            />
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {prog.phase === "download"
              ? `Downloading ${formatBytes(prog.received)}${prog.total ? ` / ${formatBytes(prog.total)}` : ""}`
              : `Writing ${prog.count.toLocaleString()} entries to storage…`}
          </p>
        </div>
      )}

      {error && (
        <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!!prog}
          onClick={() => void manager.download(def)}
          className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-700"
        >
          {info ? "Re-download" : "Download"} ({formatBytes(def.estimatedBytes)})
        </button>
        {prog && (
          <button
            type="button"
            onClick={() => manager.cancel(key)}
            className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
        )}
        {info && (
          <button
            type="button"
            onClick={() => void manager.remove(def)}
            className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/30"
          >
            Delete
          </button>
        )}
        <label
          htmlFor={importInputId}
          className="cursor-pointer rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
        >
          Import file…
        </label>
        <input
          id={importInputId}
          type="file"
          accept=".ndjson,.json,.txt"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void manager.importFile(def.language, file);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
