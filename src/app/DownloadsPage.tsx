import { useState } from "react";
import type { LanguageCode } from "../core/types";
import {
  bundledDefaultPack,
  DICTIONARY_PACKS,
  formatBytes,
  useDictionaryManager,
} from "../core/dictionary";
import { packKey } from "../core/dictionary/downloadManager";
import type { PackDefinition } from "../core/dictionary/packs";

const SUPPORTED: readonly LanguageCode[] = ["ja", "en"];

const LANG_LABEL: Record<LanguageCode, string> = {
  ja: "日本語",
  en: "English",
  de: "Deutsch",
  fr: "Français",
  zh: "中文",
};

const HISTORY_KEY = "smart-reader-dict-history";

interface HistoryItem {
  language: LanguageCode;
  word: string;
  at: number;
}

function loadHistory(): HistoryItem[] {
  try {
    const raw = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export interface DownloadsPageProps {
  onBack: () => void;
  onOpenWord?: (language: LanguageCode, word: string) => void;
}

export function DownloadsPage({ onBack, onOpenWord }: DownloadsPageProps) {
  const [language, setLanguage] = useState<LanguageCode>("ja");
  const [history] = useState<HistoryItem[]>(() => loadHistory());

  const manager = useDictionaryManager(SUPPORTED);
  const bundledCount = bundledDefaultPack(language).length;

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-gray-200 px-4 py-2 dark:border-gray-700">
        <button
          type="button"
          onClick={onBack}
          className="rounded px-2 py-1 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          ← Back
        </button>
        <h1 className="text-lg font-bold">Downloads</h1>
        <div className="ml-auto flex gap-2">
          {SUPPORTED.map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => setLanguage(lang)}
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

      <div className="min-h-0 flex-1 overflow-y-auto p-4 space-y-6">
        <section>
          <h2 className="mb-2 text-sm font-semibold">Dictionary packs</h2>
          {(DICTIONARY_PACKS[language] ?? []).map((def) => (
            <PackCard key={`${language}:${def.source}`} def={def} manager={manager} />
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
                  onClick={() => onOpenWord?.(h.language, h.word)}
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
          Download a full pack or import your own file to expand lookups.
        </p>
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
