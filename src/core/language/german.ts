import type { LanguageAdapter, Token } from "../types";
import { tokenizeLatin } from "./tokenizer";

/**
 * Rule-based German lemmatizer (MVP-grade).
 * Handles common noun plural/case endings and separable verb prefixes.
 * Full morphological analysis is out of scope for the MVP sample wordlist.
 */
export function lemmatizeGerman(surface: string): string {
  let w = surface.toLowerCase();
  if (w.length <= 3) return w;

  if (w.endsWith("eien")) w = w.slice(0, -4) + "e"; // -eien → -e (backen, etc.)
  if (w.endsWith("ern")) w = w.slice(0, -3);
  else if (w.endsWith("en") && w.length > 4) w = w.slice(0, -2);
  else if (w.endsWith("eln") && w.length > 5) w = w.slice(0, -2);
  if (w.endsWith("es") && w.length > 4) w = w.slice(0, -2);
  if (w.endsWith("er") && w.length > 4) w = w.slice(0, -2);
  if (w.endsWith("e") && w.length > 3 && !w.slice(0, -1).endsWith("ß")) {
    w = w.slice(0, -1);
  }
  if (w.endsWith("n") && w.length > 4 && /[aeiou]/.test(w[w.length - 2])) {
    w = w.slice(0, -1);
  }

  // Umlaut reversal for common plural forms (Häuser→haus, Bäume→baum).
  w = w
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u");

  if (w.endsWith("ss") && surface.includes("ß")) return w.replace(/ss$/, "ß");
  return w;
}

export const GERMAN_ADAPTER: LanguageAdapter = {
  language: "de",
  scheme: "CEFR",
  async tokenize(text: string): Promise<Token[]> {
    return tokenizeLatin(text).map((t) => ({ ...t, lemma: lemmatizeGerman(t.surface) }));
  },
  lemmatize(surface: string): string {
    return lemmatizeGerman(surface);
  },
  levels(): ReturnType<LanguageAdapter["levels"]> {
    return ["A1", "A2", "B1", "B2", "C1", "C2"];
  },
};
