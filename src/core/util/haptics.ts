/** Tiny haptics helper — no-ops where the device doesn't support vibration. */

export function vibrate(pattern: number | number[]): boolean {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      return navigator.vibrate(pattern);
    }
  } catch { /* ignore */ }
  return false;
}

/** Short tick for page turns and word taps. */
export function tapTick(): void {
  vibrate(8);
}
