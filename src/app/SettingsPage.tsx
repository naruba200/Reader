import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { useTheme, THEME_OPTIONS } from "./ThemeContext";
import { loadFollowSystemFontSize, saveFollowSystemFontSize } from "../reader/systemPrefs";
import { exportBackup, importBackup } from "../core/library/backup";
import { getLibraryStore } from "../core/library/libraryStore";
import { loadWordBank } from "../study/wordBank";
import { loadStats, setDailyGoal, formatDuration, todayKey } from "../study/stats";
import {
  isDailyWordEnabled,
  requestAndEnableDailyWord,
  disableDailyWord,
} from "../core/notifications/dailyWord";

type LibraryViewMode = "grid" | "list";

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
  const [dailyWord, setDailyWord] = useState<boolean>(() => isDailyWordEnabled());
  const [dailyWordMsg, setDailyWordMsg] = useState<string | null>(null);
  const [dailyWordBusy, setDailyWordBusy] = useState(false);

  const toggleFollowSystemFont = () => {
    setFollowSystemFont((v) => {
      const next = !v;
      saveFollowSystemFontSize(next);
      return next;
    });
  };

  // Daily word notification: on native, a denied permission auto-disables
  // the toggle (App launch does the same check); on web it can't run.
  const toggleDailyWord = () => {
    if (dailyWordBusy) return;
    if (dailyWord) {
      setDailyWordBusy(true);
      void disableDailyWord().then(() => {
        setDailyWord(false);
        setDailyWordMsg(null);
        setDailyWordBusy(false);
      });
      return;
    }
    if (!Capacitor.isNativePlatform()) {
      setDailyWordMsg("Daily word notifications are available in the Android app only.");
      return;
    }
    setDailyWordBusy(true);
    setDailyWordMsg(null);
    void requestAndEnableDailyWord().then((r) => {
      setDailyWord(r.ok);
      if (!r.ok) setDailyWordMsg(r.message);
      setDailyWordBusy(false);
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
    <main className="min-h-0 flex-1 overflow-y-auto p-4 pt-safe">
      <h1 className="mb-4 text-xl font-bold">Settings</h1>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Appearance
        </h2>
        <div className="theme-card overflow-hidden rounded-xl border">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="font-medium">Theme</span>
            <select
              value={preference}
              onChange={(e) => setThemePreference(e.target.value as (typeof THEME_OPTIONS)[number]["id"])}
              aria-label="Theme"
              className="theme-card rounded-lg border px-3 py-1.5 text-sm font-medium focus:border-blue-500 focus:outline-none"
            >
              {THEME_OPTIONS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between gap-3 theme-divider border-t px-4 py-3">
            <span>
              <span className="block font-medium">Follow system font size</span>
              <span className="block text-sm theme-card-muted">
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
          Notifications
        </h2>
        <div className="theme-card overflow-hidden rounded-xl border">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <span>
              <span className="block font-medium">Word of the day</span>
              <span className="block text-sm theme-card-muted">
                A notification at 9:00 AM with the same word the dictionary home shows
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={dailyWord}
              aria-label="Word of the day notification"
              onClick={toggleDailyWord}
              disabled={dailyWordBusy}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                dailyWord ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  dailyWord ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </div>
          {dailyWordMsg && (
            <p className="theme-divider border-t px-4 py-2 text-xs theme-card-muted">
              {dailyWordMsg}
            </p>
          )}
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Library
        </h2>
        <div className="theme-card overflow-hidden rounded-xl border">
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
                      : "theme-card-muted"
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
        <div className="theme-card overflow-hidden rounded-xl border">
          <div className="px-4 py-3">
            <div className="flex items-baseline justify-between">
              <span className="font-medium">Today</span>
              <span className="text-sm tabular-nums theme-card-muted">
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
          <div className="flex items-center justify-between theme-divider border-t px-4 py-3">
            <span className="font-medium">Day streak</span>
            <span className="text-sm">
              {stats.streak > 0 ? `🔥 ${stats.streak} day${stats.streak !== 1 ? "s" : ""}` : "—"}
            </span>
          </div>
          <div className="flex items-center justify-between theme-divider border-t px-4 py-3">
            <span className="font-medium">Total reading time</span>
            <span className="text-sm theme-card-muted">
              {formatDuration(stats.totalMs)}
            </span>
          </div>
          <div className="theme-divider border-t px-4 py-3">
            <div className="flex items-baseline justify-between">
              <span className="font-medium">Daily goal</span>
              <span className="text-sm tabular-nums theme-card-muted">
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
        <div className="theme-card overflow-hidden rounded-xl border">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="font-medium">Books</span>
            <span className="text-sm theme-card-muted">
              {bookCount === null ? "…" : bookCount}
            </span>
          </div>
          <div className="flex items-center justify-between theme-divider border-t px-4 py-3">
            <span className="font-medium">Word bank</span>
            <span className="text-sm theme-card-muted">
              {wordCount} word{wordCount !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex gap-2 theme-divider border-t px-4 py-3">
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
            <p className="theme-divider border-t px-4 py-2 text-xs theme-card-muted">
              {backupMsg}
            </p>
          )}
          <p className="theme-divider border-t px-4 py-2 text-xs theme-card-muted">
            Backs up library data, reading progress, settings, reading stats and your word bank.
            Book files themselves are not included — re-import them after a restore.
          </p>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          About
        </h2>
        <div className="theme-card overflow-hidden rounded-xl border">
          <p className="px-4 py-3 text-xs leading-relaxed theme-card-muted">
            Dictionary data: JMdict and KANJIDIC2 (EDRDG). Stroke-order
            diagrams: KanjiVG (CC BY-SA 3.0), downloaded per kanji and cached
            on your device. Radical data: Unicode Unihan database (Unicode
            License).
          </p>
        </div>
      </section>

    </main>
  );
}
