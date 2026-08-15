import { useCallback, useEffect, useMemo, useState } from "react";
import type { DictionaryEntry, LanguageCode } from "../core/types";
import {
  bundledDefaultPack,
  DICTIONARY_PACKS,
  formatBytes,
  getDictionaryStore,
  useDictionaryManager,
} from "../core/dictionary";
import { EntryCard } from "../reader/EntryCard";

export interface DictionaryPageProps {
  onBack: () => void;
  /** Preloaded lookup (e.g. handed off from a popover in the reader). */
  initial?: { language: LanguageCode; word?: string };
}

interface HistoryItem {
  language: LanguageCode;
  word: string;
  at: number;
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

export function DictionaryPage({ onBack, initial }: DictionaryPageProps) {
  const [language, setLanguage] = useState<LanguageCode>(initial?.language ?? "ja");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ word: string; reading?: string; key: string }[]>([]);
  const [selected, setSelected] = useState<{ surface: string; entry?: DictionaryEntry } | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory());
  const manager = useDictionaryManager(SUPPORTED);

  const searchResults = useMemo(() => results, [results]);

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
    }, 250);
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

  // Handle handoff from the reader popover.
  useEffect(() => {
    if (initial?.word) openLookup(initial.language, initial.word);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

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
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search ${LANG_LABEL[language]}…`}
          className="mb-4 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800"
        />

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
                {searchResults.map((r) => (
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
        ) : (
          <div className="space-y-6">
            <section>
              <h2 className="mb-2 text-sm font-semibold">Dictionary packs</h2>
              {SUPPORTED.map((lang) => (
                <PackCard key={lang} lang={lang} manager={manager} />
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
  lang,
  manager,
}: {
  lang: LanguageCode;
  manager: ReturnType<typeof useDictionaryManager>;
}) {
  const def = DICTIONARY_PACKS[lang];
  const info = manager.infos[lang];
  const prog = manager.progress[lang];
  const error = manager.errors[lang];
  const label = `${LANG_LABEL[lang]} (${def?.source ?? "bundled"})`;

  const importInputId = `dict-import-${lang}`;

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
          {prog ? "Downloading" : info ? "Installed" : "Bundled default"}
        </span>
      </div>

      {info && (
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          v{info.version} · {info.count.toLocaleString()} entries · {formatBytes(info.sizeBytes)}
          {info.source !== (def?.source ?? "") && ` · from ${info.source}`}
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
        {def && (
          <button
            type="button"
            disabled={!!prog}
            onClick={() => void manager.download(lang)}
            className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 disabled:opacity-40 dark:border-gray-600 dark:hover:bg-gray-700"
          >
            {info ? "Re-download" : "Download"} ({formatBytes(def.estimatedBytes)})
          </button>
        )}
        {prog && (
          <button
            type="button"
            onClick={() => manager.cancel(lang)}
            className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
          >
            Cancel
          </button>
        )}
        {info && (
          <button
            type="button"
            onClick={() => void manager.remove(lang)}
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
            if (file) void manager.importFile(lang, file);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}