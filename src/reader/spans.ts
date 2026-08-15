import type { AnalyzedToken, ParagraphRange } from "../core/types";

export interface WordSpan {
  surface: string;
  start: number;
  end: number;
  length: number;
}

/**
 * Split the `[start, end)` slice of `text` into paragraph ranges using the
 * same double-newline rule as `splitParagraphs`, keeping absolute offsets.
 */
export function paragraphRangesForBlock(
  text: string,
  start: number,
  end: number,
): ParagraphRange[] {
  const paras: ParagraphRange[] = [];
  const re = /\n[ \t]*\n/g;
  re.lastIndex = start;
  let last = start;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null && m.index < end) {
    if (m.index > last) paras.push({ start: last, end: m.index });
    last = m.index + m[0].length;
  }
  if (last < end) paras.push({ start: last, end });
  return paras;
}

/** Split a string into word spans using the same regex as the Latin tokenizer. */
export function splitWords(text: string): WordSpan[] {
  const re = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF']+/g;
  const spans: WordSpan[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    spans.push({
      surface: m[0],
      start: m.index,
      end: m.index + m[0].length,
      length: m[0].length,
    });
  }
  return spans;
}

/** Find the token whose span covers a given character offset. */
export function tokenAtOffset(
  tokens: readonly AnalyzedToken[],
  offset: number,
): AnalyzedToken | undefined {
  return tokens.find((t) => offset >= t.start && offset < t.start + t.length);
}

/**
 * A single renderable run of a paragraph: either raw text that no token
 * covers, or the token's own text plus the token to style/click.
 */
export interface ParagraphNode {
  text: string;
  start: number;
  length: number;
  token?: AnalyzedToken;
}

/**
 * Build the ordered runs for one paragraph slice. Unlike splitWords (which is
 * Latin-only), this walks the analyzed tokens directly, so it works for any
 * script (Japanese, Korean, Arabic, …). Characters not covered by a token —
 * punctuation, whitespace, line breaks — are emitted as raw text runs instead
 * of being replaced with spaces.
 */
export function buildParagraphNodes(
  text: string,
  para: { start: number; end: number },
  tokens: readonly AnalyzedToken[],
): ParagraphNode[] {
  const nodes: ParagraphNode[] = [];
  const inRange = tokens
    .filter((t) => t.start >= para.start && t.start + t.length <= para.end)
    .sort((a, b) => a.start - b.start);

  let cursor = para.start;
  for (const token of inRange) {
    if (token.start > cursor) {
      nodes.push({
        text: text.slice(cursor, token.start),
        start: cursor,
        length: token.start - cursor,
      });
    }
    nodes.push({ text: token.surface, start: token.start, length: token.length, token });
    cursor = token.start + token.length;
  }
  if (cursor < para.end) {
    nodes.push({
      text: text.slice(cursor, para.end),
      start: cursor,
      length: para.end - cursor,
    });
  }
  return nodes;
}
