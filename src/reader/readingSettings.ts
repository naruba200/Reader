/** Per-book reading comfort settings, persisted in localStorage. */

export type TypefaceId = "default" | "serif" | "sans" | "mincho";

export interface ReadingSettings {
  fontSize: number;
  typeface: TypefaceId;
  lineHeight: number;
  /** Horizontal content padding in px. */
  marginX: number;
}

export const DEFAULT_READING_SETTINGS: ReadingSettings = {
  fontSize: 17,
  typeface: "default",
  lineHeight: 1.75,
  marginX: 16,
};

export const FONT_SIZE_MIN = 13;
export const FONT_SIZE_MAX = 32;
export const LINE_HEIGHT_MIN = 1.4;
export const LINE_HEIGHT_MAX = 2.4;
export const MARGIN_X_MIN = 0;
export const MARGIN_X_MAX = 48;

export const TYPEFACE_LABELS: Record<TypefaceId, string> = {
  default: "Default",
  serif: "Serif",
  sans: "Sans",
  mincho: "Mincho JP",
};

export const TYPEFACE_STACKS: Record<TypefaceId, string | undefined> = {
  default: undefined,
  serif: "Georgia, 'Times New Roman', serif",
  sans: "system-ui, -apple-system, 'Segoe UI', sans-serif",
  mincho: "'Noto Serif JP', 'Hiragino Mincho ProN', 'Yu Mincho', serif",
};

const SETTINGS_KEY = "smart-reader-reading-settings";
const LEGACY_FONT_SIZE_KEY = "smart-reader-font-size";

interface StoredSettings {
  perBook: Record<string, Partial<ReadingSettings>>;
}

function loadStored(): StoredSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
    if (raw && typeof raw === "object" && raw.perBook && typeof raw.perBook === "object") {
      return raw as StoredSettings;
    }
  } catch { /* ignore */ }
  return { perBook: {} };
}

function saveStored(s: StoredSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch { /* storage full/unavailable */ }
}

function clampSettings(p: Partial<ReadingSettings>): ReadingSettings {
  return {
    fontSize: Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, p.fontSize ?? DEFAULT_READING_SETTINGS.fontSize)),
    typeface: p.typeface ?? DEFAULT_READING_SETTINGS.typeface,
    lineHeight: Math.min(LINE_HEIGHT_MAX, Math.max(LINE_HEIGHT_MIN, p.lineHeight ?? DEFAULT_READING_SETTINGS.lineHeight)),
    marginX: Math.min(MARGIN_X_MAX, Math.max(MARGIN_X_MIN, p.marginX ?? DEFAULT_READING_SETTINGS.marginX)),
  };
}

/** Effective settings for a book: per-book overrides over defaults. */
export function loadReadingSettings(bookId: string): ReadingSettings {
  const stored = loadStored();
  const partial = stored.perBook[bookId] ?? {};
  // One-time migration from the old global font-size key.
  if (partial.fontSize === undefined) {
    try {
      const legacy = Number(localStorage.getItem(LEGACY_FONT_SIZE_KEY));
      if (legacy >= FONT_SIZE_MIN && legacy <= FONT_SIZE_MAX) {
        partial.fontSize = legacy;
      }
    } catch { /* ignore */ }
  }
  return clampSettings(partial);
}

export function saveReadingSettings(bookId: string, partial: Partial<ReadingSettings>): ReadingSettings {
  const stored = loadStored();
  const merged = clampSettings({ ...stored.perBook[bookId], ...partial });
  stored.perBook[bookId] = merged;
  saveStored(stored);
  return merged;
}

// --- Global device prefs (not per book) ---

const BRIGHTNESS_KEY = "smart-reader-brightness";
const WAKE_LOCK_KEY = "smart-reader-wake-lock";

export function loadBrightness(): number {
  try {
    const v = Number(localStorage.getItem(BRIGHTNESS_KEY));
    if (v >= 0.35 && v <= 1) return v;
  } catch { /* ignore */ }
  return 1;
}

export function saveBrightness(v: number): void {
  try {
    localStorage.setItem(BRIGHTNESS_KEY, String(Math.min(1, Math.max(0.35, v))));
  } catch { /* ignore */ }
}

export function loadWakeLock(): boolean {
  try {
    return localStorage.getItem(WAKE_LOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveWakeLock(on: boolean): void {
  try {
    localStorage.setItem(WAKE_LOCK_KEY, on ? "1" : "0");
  } catch { /* ignore */ }
}
