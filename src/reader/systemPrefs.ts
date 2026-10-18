/**
 * System integration preferences and helpers.
 *
 * Kept separate from per-book reading settings (src/reader/readingSettings.ts):
 * these are app-level opt-ins that mirror OS settings rather than reader state.
 */

const FOLLOW_SYSTEM_FONT_SIZE_KEY = "smart-reader-follow-system-font-size";

/**
 * Whether reader font sizes should scale with the device's system text size.
 * Default: false (existing behavior unchanged).
 */
export function loadFollowSystemFontSize(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(FOLLOW_SYSTEM_FONT_SIZE_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveFollowSystemFontSize(v: boolean): void {
  try {
    localStorage.setItem(FOLLOW_SYSTEM_FONT_SIZE_KEY, v ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
}

let cachedScale: number | null = null;

/**
 * Scale factor derived from the system font-size setting: measures how large
 * 1rem actually renders in this environment (rendered px / 16).
 * Cached after the first read; returns 1 outside a DOM environment.
 */
export function getSystemFontScale(): number {
  if (typeof document === "undefined" || typeof window === "undefined") return 1;
  if (cachedScale !== null) return cachedScale;
  try {
    const probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:absolute;visibility:hidden;pointer-events:none;font-size:1rem;line-height:0;width:0;height:0;";
    document.body.appendChild(probe);
    const px = parseFloat(getComputedStyle(probe).fontSize);
    document.body.removeChild(probe);
    cachedScale = Number.isFinite(px) && px > 0 ? px / 16 : 1;
  } catch {
    cachedScale = 1;
  }
  return cachedScale;
}

/**
 * Apply the system font scale to a reader font size when the user opted in
 * via "Follow system font size". Otherwise returns the size unchanged.
 */
export function effectiveFontSize(settings: { fontSize: number }): number {
  return loadFollowSystemFontSize()
    ? settings.fontSize * getSystemFontScale()
    : settings.fontSize;
}
