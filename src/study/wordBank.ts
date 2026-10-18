import type { LanguageCode } from "../core/types";
import type { SrsState } from "./srs";

export interface WordBankEntry {
  id: string;
  word: string;
  reading?: string;
  definition?: string;
  pos?: string;
  /** Source sentence for context (Anki card back / review hint). */
  sentence?: string;
  bookTitle?: string;
  lang: LanguageCode;
  addedAt: number;
  srs?: SrsState;
}

export interface NewWordInput {
  word: string;
  reading?: string;
  definition?: string;
  pos?: string;
  sentence?: string;
  bookTitle?: string;
  lang: LanguageCode;
}

const WORD_BANK_KEY = "smart-reader-word-bank";

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function loadWordBank(): WordBankEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(WORD_BANK_KEY) ?? "[]");
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function persist(entries: WordBankEntry[]): void {
  try {
    localStorage.setItem(WORD_BANK_KEY, JSON.stringify(entries));
  } catch { /* storage full/unavailable */ }
}

export function isWordSaved(word: string, lang: LanguageCode): boolean {
  const w = word.trim();
  if (!w) return false;
  return loadWordBank().some((e) => e.word === w && e.lang === lang);
}

/** Add a word; returns the entry, or the existing one if already saved. */
export function saveWord(input: NewWordInput): WordBankEntry {
  const word = input.word.trim();
  const entries = loadWordBank();
  const existing = entries.find((e) => e.word === word && e.lang === input.lang);
  if (existing) return existing;
  const entry: WordBankEntry = {
    id: newId(),
    word,
    reading: input.reading?.trim() || undefined,
    definition: input.definition?.trim() || undefined,
    pos: input.pos?.trim() || undefined,
    sentence: input.sentence?.trim() || undefined,
    bookTitle: input.bookTitle?.trim() || undefined,
    lang: input.lang,
    addedAt: Date.now(),
  };
  entries.unshift(entry);
  persist(entries);
  return entry;
}

export function removeWord(id: string): WordBankEntry[] {
  const entries = loadWordBank().filter((e) => e.id !== id);
  persist(entries);
  return entries;
}

export function updateWordSrs(id: string, srs: SrsState): void {
  const entries = loadWordBank();
  const entry = entries.find((e) => e.id === id);
  if (entry) {
    entry.srs = srs;
    persist(entries);
  }
}

/** Replace the whole bank (used by backup restore). */
export function replaceWordBank(entries: WordBankEntry[]): void {
  persist(Array.isArray(entries) ? entries : []);
}

/** Anki-compatible TSV: front → back with sentence context. */
export function buildAnkiTsv(entries: WordBankEntry[]): string {
  const esc = (s: string | undefined) => (s ?? "").replace(/\t/g, " ").replace(/\n/g, "<br>");
  const lines = entries.map((e) => {
    const front = e.reading && e.reading !== e.word ? `${e.word} [${e.reading}]` : e.word;
    const back = [e.definition, e.sentence ? `例: ${e.sentence}` : ""].filter(Boolean).join("<br>");
    return `${esc(front)}\t${esc(back)}`;
  });
  return lines.join("\n");
}

export function downloadAnkiTsv(entries: WordBankEntry[]): void {
  const tsv = buildAnkiTsv(entries);
  const blob = new Blob([tsv], { type: "text/tab-separated-values;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "smart-reader-anki.tsv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
