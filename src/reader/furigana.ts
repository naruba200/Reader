import type { AnalyzedToken } from "../core/types";

/** Convert katakana (U+30A1–U+30F6) to hiragana. */
export function kataToHira(input: string): string {
  return input.replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

/** True if the string contains any CJK unified ideograph (kanji). */
export function hasKanji(s: string): boolean {
  return /[一-鿿豈-﫿]/.test(s);
}

/**
 * Hiragana reading suitable for <rt>, or null when furigana makes no sense
 * (no kanji, no reading, or the reading is identical to the surface).
 */
export function furiganaFor(token: AnalyzedToken): string | null {
  if (!token.reading) return null;
  if (!hasKanji(token.surface)) return null;
  const hira = kataToHira(token.reading);
  if (!hira || hira === token.surface) return null;
  return hira;
}

/**
 * Extract the sentence containing `offset` from `text`, for use as
 * flashcard/Anki context. Clamped to a reasonable length.
 */
export function sentenceAround(text: string, offset: number, maxLen = 160): string {
  const boundaries = /[。！？.!?\n]/;
  let start = 0;
  for (let i = Math.min(offset, text.length - 1); i >= 0; i--) {
    if (boundaries.test(text[i])) { start = i + 1; break; }
  }
  let end = text.length;
  for (let i = offset; i < text.length; i++) {
    if (boundaries.test(text[i])) { end = i + 1; break; }
  }
  let sentence = text.slice(start, end).trim().replace(/\s+/g, " ");
  if (sentence.length > maxLen) {
    // Trim around the target word.
    const rel = offset - start;
    const half = Math.floor(maxLen / 2);
    const s = Math.max(0, rel - half);
    sentence = (s > 0 ? "…" : "") + sentence.slice(s, s + maxLen).trim() + (s + maxLen < sentence.length ? "…" : "");
  }
  return sentence;
}
