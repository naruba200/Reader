import { useEffect, useState } from "react";
import { useTheme, type ThemePreference } from "./ThemeContext";
import { loadFollowSystemFontSize, saveFollowSystemFontSize } from "../reader/systemPrefs";
import { exportBackup, importBackup } from "../core/library/backup";
import { getLibraryStore } from "../core/library/libraryStore";
import { loadWordBank } from "../study/wordBank";
import { loadStats, setDailyGoal, formatDuration, todayKey } from "../study/stats";

type LibraryViewMode = "grid" | "list";

const THEME_OPTIONS: { id: ThemePreference; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "auto", label: "Auto" },
];

export function SettingsPage({
  viewMode,
  onViewModeChange,
}: {
  viewMode: LibraryViewMode;
  onViewModeChange: (mode: LibraryViewMode) => void;
}) {
  const { preference, setThemePreference } = useTheme();
  const [bookCount, setBookCount] = useState<number | null>(null);
  const [wordCount, setWordCount] = useState(0);
  const [backupMsg, setBackupMsg] = useState<string | null>(null);
  const [stats, setStats] = useState(() => loadStats());
  const [followSystemFont, setFollowSystemFont] = useState<boolean>(() => loadFollowSystemFontSize());

  const toggleFollowSystemFont = () => {
    setFollowSystemFont((v) => {
      const next = !v;
      saveFollowSystemFontSize(next);
      return next;
    });
  };

  const todayMs = stats.perDay[todayKey()] ?? 0;
  const goalPct = Math.min(100, Math.round((todayMs / (stats.goalMin * 60_000)) * 100));

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const books = await getLibraryStore().listBooks();
        if (!cancelled) setBookCount(books.length);
      } catch { /* ignore */ }
    })();
    setWordCount(loadWordBank().length);
    return () => { cancelled = true; };
  }, []);

  const doExport = () => {
    setBackupMsg(null);
    void exportBackup()
      .then(() => setBackupMsg("Backup downloaded."))
      .catch(() => setBackupMsg("Export failed."));
  };

  const doImport = (file: File | undefined) => {
    if (!file) return;
    setBackupMsg("Restoring…");
    void importBackup(file)
      .then((r) => setBackupMsg(`Restored ${r.books} books and ${r.words} words.`))
      .catch((err) => setBackupMsg(err instanceof Error ? err.message : "Import failed."));
  };

  return (
    <main className="min-h-0 flex-1 overflow-y-auto p-4">
      <h1 className="mb-4 text-xl font-bold">Settings</h1>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Appearance
        </h2>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="font-medium">Theme</span>
            <div
              role="group"
              aria-label="Theme"
              className="flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-600"
            >
              {THEME_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setThemePreference(o.id)}
                  aria-pressed={preference === o.id}
                  className={`px-4 py-1.5 text-sm font-medium ${
                    preference === o.id
                      ? "bg-blue-600 text-white"
                      : "text-gray-600 dark:text-gray-300"
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 dark:border-gray-700">
            <span>
              <span className="block font-medium">Follow system font size</span>
              <span className="block text-sm text-gray-500 dark:text-gray-400">
                Scale reader text with your device&apos;s text size setting
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={followSystemFont}
              aria-label="Follow system font size"
              onClick={toggleFollowSystemFont}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                followSystemFont ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  followSystemFont ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </div>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Library
        </h2>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="font-medium">View</span>
            <div className="flex overflow-hidden rounded-lg border border-gray-300 dark:border-gray-600">
              {(["grid", "list"] as LibraryViewMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onViewModeChange(m)}
                  className={`px-4 py-1.5 text-sm font-medium capitalize ${
                    viewMode === m
                      ? "bg-blue-600 text-white"
                      : "text-gray-600 dark:text-gray-300"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Reading
        </h2>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="px-4 py-3">
            <div className="flex items-baseline justify-between">
              <span className="font-medium">Today</span>
              <span className="text-sm tabular-nums text-gray-500 dark:text-gray-400">
                {formatDuration(todayMs)} / {stats.goalMin}m
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
              <div
                className="h-full rounded-full bg-blue-600 transition-all"
                style={{ width: `${goalPct}%` }}
              />
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 dark:border-gray-700">
            <span className="font-medium">Day streak</span>
            <span className="text-sm">
              {stats.streak > 0 ? `🔥 ${stats.streak} day${stats.streak !== 1 ? "s" : ""}` : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 dark:border-gray-700">
            <span className="font-medium">Total reading time</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {formatDuration(stats.totalMs)}
            </span>
          </div>
          <div className="border-t border-gray-100 px-4 py-3 dark:border-gray-700">
            <div className="flex items-baseline justify-between">
              <span className="font-medium">Daily goal</span>
              <span className="text-sm tabular-nums text-gray-500 dark:text-gray-400">
                {stats.goalMin} min
              </span>
            </div>
            <input
              type="range"
              min={5}
              max={120}
              step={5}
              value={stats.goalMin}
              onChange={(e) => setStats((s) => ({ ...s, goalMin: setDailyGoal(Number(e.target.value)) }))}
              className="mt-1 w-full accent-blue-600"
              aria-label="Daily reading goal in minutes"
            />
          </div>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Storage
        </h2>
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="font-medium">Books</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {bookCount === null ? "…" : bookCount}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 dark:border-gray-700">
            <span className="font-medium">Word bank</span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {wordCount} word{wordCount !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex gap-2 border-t border-gray-100 px-4 py-3 dark:border-gray-700">
            <button
              type="button"
              onClick={doExport}
              className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white"
            >
              Export backup
            </button>
            <label className="flex-1 cursor-pointer rounded-lg border border-gray-300 px-3 py-2 text-center text-sm font-medium dark:border-gray-600">
              Import backup
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => { doImport(e.target.files?.[0]); e.target.value = ""; }}
              />
            </label>
          </div>
          {backupMsg && (
            <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
              {backupMsg}
            </p>
          )}
          <p className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400 dark:border-gray-700">
            Backs up library data, reading progress, settings, reading stats and your word bank.
            Book files themselves are not included — re-import them after a restore.
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          About
        </h2>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-800">
          <p className="font-medium">Smart Reader</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Alpha — a Japanese-learner&apos;s ebook reader.
          </p>
        </div>
      </section>
    </main>
  );
}
