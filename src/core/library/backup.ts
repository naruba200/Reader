import {
  getLibraryStore,
  type StoredBookMeta,
  type StoredProgress,
} from "./libraryStore";
import { loadWordBank, replaceWordBank, type WordBankEntry } from "../../study/wordBank";
import {
  getLookupHistory,
  replaceLookupHistory,
  type LookupRecord,
} from "../../study/history";
import { loadStats, replaceStats, type ReadingStats } from "../../study/stats";

export interface BackupData {
  version: 1;
  app: "smart-reader";
  exportedAt: number;
  books: StoredBookMeta[];
  progress: StoredProgress[];
  settings: Record<string, string>;
  wordBank: WordBankEntry[];
  lookupHistory: LookupRecord[];
  stats: ReadingStats;
}

// Handled through dedicated stores, not the generic settings blob.
const EXCLUDED_SETTING_KEYS = new Set([
  "smart-reader-word-bank",
  "smart-reader-lookup-counts",
  "smart-reader-reading-stats",
  "smart-reader-book-cache", // rebuilt cache
]);

function collectSettings(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("smart-reader-") && !EXCLUDED_SETTING_KEYS.has(k)) {
        const v = localStorage.getItem(k);
        if (v !== null) out[k] = v;
      }
    }
  } catch { /* ignore */ }
  return out;
}

function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Export library metadata, progress, settings and the word bank to a JSON
 * file. Book documents (full text) are NOT included — re-import the book
 * files after a restore; progress and metadata will reattach by book id.
 */
export async function exportBackup(): Promise<void> {
  const store = getLibraryStore();
  const [books, progress] = await Promise.all([store.listBooks(), store.listProgress()]);
  const data: BackupData = {
    version: 1,
    app: "smart-reader",
    exportedAt: Date.now(),
    books,
    progress,
    settings: collectSettings(),
    wordBank: loadWordBank(),
    lookupHistory: getLookupHistory(500),
    stats: loadStats(),
  };
  const date = new Date().toISOString().slice(0, 10);
  downloadJson(`smart-reader-backup-${date}.json`, data);
}

export interface ImportResult {
  books: number;
  words: number;
}

function isBackupData(v: unknown): v is BackupData {
  if (!v || typeof v !== "object") return false;
  const d = v as Record<string, unknown>;
  return d.app === "smart-reader" && d.version === 1;
}

/** Restore a backup file. Throws on invalid files. */
export async function importBackup(file: File): Promise<ImportResult> {
  const text = await file.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("Not a valid JSON file");
  }
  if (!isBackupData(parsed)) {
    throw new Error("Not a Smart Reader backup file");
  }
  const store = getLibraryStore();
  if (Array.isArray(parsed.books)) {
    await store.putMetas(parsed.books.filter((b): b is StoredBookMeta => !!b && typeof b.id === "string"));
  }
  if (Array.isArray(parsed.progress)) {
    await store.putProgress(parsed.progress.filter((p): p is StoredProgress => !!p && typeof p.id === "string"));
  }
  if (parsed.settings && typeof parsed.settings === "object") {
    try {
      for (const [k, v] of Object.entries(parsed.settings)) {
        if (typeof v === "string" && k.startsWith("smart-reader-")) {
          localStorage.setItem(k, v);
        }
      }
    } catch { /* ignore */ }
  }
  if (Array.isArray(parsed.wordBank)) replaceWordBank(parsed.wordBank);
  if (Array.isArray(parsed.lookupHistory)) replaceLookupHistory(parsed.lookupHistory);
  if (parsed.stats && typeof parsed.stats === "object") replaceStats(parsed.stats);
  return {
    books: Array.isArray(parsed.books) ? parsed.books.length : 0,
    words: Array.isArray(parsed.wordBank) ? parsed.wordBank.length : 0,
  };
}
