/** User preference: only download dictionary packs over Wi-Fi. */

const WIFI_ONLY_KEY = "smart-reader-dl-wifi-only";

/** Load the Wi-Fi-only preference. Defaults to false (allow any connection). */
export function loadWifiOnly(): boolean {
  try {
    return localStorage.getItem(WIFI_ONLY_KEY) === "true";
  } catch {
    return false;
  }
}

/** Persist the Wi-Fi-only preference. */
export function saveWifiOnly(value: boolean): void {
  try {
    localStorage.setItem(WIFI_ONLY_KEY, value ? "true" : "false");
  } catch {
    /* storage unavailable (private mode, SSR) — preference is session-only */
  }
}
