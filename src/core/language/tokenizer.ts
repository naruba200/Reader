import type { Token } from "../types";

const LATIN_WORD = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF']+/g;

export interface TokenizeOptions {
  /** Treat apostrophes as part of the word (e.g. don't, l'homme, d'accord). Default true. */
  keepApostrophes?: boolean;
}

/** Split a Latin-script text into word tokens with character offsets. */
export function tokenizeLatin(text: string, options: TokenizeOptions = {}): Token[] {
  const keepApostrophes = options.keepApostrophes ?? true;
  const re = keepApostrophes
    ? LATIN_WORD
    : /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]+/g;
  const tokens: Token[] = [];
  let match: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((match = re.exec(text)) !== null) {
    const surface = match[0];
    tokens.push({
      surface,
      lemma: surface.toLowerCase(),
      start: match.index,
      length: surface.length,
    });
  }
  return tokens;
}
