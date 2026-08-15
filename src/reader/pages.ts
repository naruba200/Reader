import type { BookChapter, ChapterBlock, ImageBlock, ParagraphRange, TextBlock } from "../core/types";
import { paragraphRangesForBlock } from "./spans";

/** One rendered page: an ordered list of content items (text runs + images). */
export interface Page {
  items: ChapterBlock[];
}

/** Default character budget per page. Tune for larger/smaller pages. */
export const DEFAULT_PAGE_CHARS = 800;

/** A single fillable unit during pagination: a paragraph range or an image. */
type Unit =
  | { kind: "text"; start: number; end: number }
  | { kind: "image"; src: string; alt?: string };

/**
 * Split a chapter into pages of roughly `pageChars` characters. Paragraphs are
 * kept intact unless a single paragraph alone exceeds the budget (then it is
 * split mid-paragraph). Images always get their own page. All text ranges are
 * absolute offsets into `chapter.text`, so existing per-chapter analysis stays
 * valid for every page.
 */
export function paginateChapter(
  chapter: BookChapter,
  pageChars: number = DEFAULT_PAGE_CHARS,
): Page[] {
  const text = chapter.text;
  const units = unitsForChapter(chapter, text);
  const pages: Page[] = [];
  let current: Unit[] = [];
  let used = 0;

  const flush = () => {
    if (current.length === 0) return;
    pages.push({ items: current });
    current = [];
    used = 0;
  };

  for (const unit of units) {
    if (unit.kind === "image") {
      flush();
      pages.push({ items: [unit] });
      continue;
    }
    const len = unit.end - unit.start;
    if (used > 0 && used + len > pageChars) flush();
    if (len > pageChars) {
      // Oversized paragraph: split it into pageChars-sized chunks.
      let s = unit.start;
      while (s < unit.end) {
        const e = Math.min(s + pageChars, unit.end);
        const chunk: TextBlock = { kind: "text", start: s, end: e };
        if (current.length > 0) flush();
        current.push(chunk);
        used = e - s;
        flush();
        s = e;
      }
      continue;
    }
    current.push(unit);
    used += len;
  }
  flush();

  if (pages.length === 0) {
    pages.push({ items: [] });
  }
  return pages;
}

function unitsForChapter(chapter: BookChapter, text: string): Unit[] {
  if (chapter.blocks && chapter.blocks.length > 0) {
    const units: Unit[] = [];
    for (const block of chapter.blocks) {
      if (block.kind === "image") {
        const image: ImageBlock = { kind: "image", src: block.src };
        if (block.alt) image.alt = block.alt;
        units.push(image);
        continue;
      }
      for (const para of paragraphRangesForBlock(text, block.start, block.end)) {
        units.push(textUnit(para));
      }
    }
    return units;
  }
  return splitParagraphs(text).map(textUnit);
}

function textUnit(para: ParagraphRange): Unit {
  return { kind: "text", start: para.start, end: para.end };
}

/** Split raw text into paragraphs, keeping absolute character offsets. */
export function splitParagraphs(text: string): ParagraphRange[] {
  const paras: ParagraphRange[] = [];
  const re = /\n[ \t]*\n/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) paras.push({ start: last, end: m.index });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    paras.push({ start: last, end: text.length });
  }
  return paras;
}
