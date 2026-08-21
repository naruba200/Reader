import ePub, { type Book } from "epubjs";
import type { NavItem } from "epubjs/types/navigation";
import type Section from "epubjs/types/section";
import type { BookDocument, ChapterBlock, ImageBlock } from "../types";
import { BookParseError, detectLanguage, type BookParser } from "./types";

/** A raw segment collected while walking a section: text run or image reference. */
interface RawSegment {
  type: "text" | "image";
  raw?: string;
  src?: string;
  alt?: string;
}

/**
 * EPUB parser that uses epub.js only for parsing (spine extraction).
 * Rendering is handled separately by the reader, so epub.js never attaches
 * an iframe/rendition here.
 */
export class EpubParser implements BookParser {
  readonly format = "epub" as const;

  async parse(file: File | ArrayBuffer, fileName?: string): Promise<BookDocument> {
    if (typeof ArrayBuffer !== "undefined" && file instanceof ArrayBuffer) {
      return this.parseArrayBuffer(file, fileName ?? "book.epub");
    }
    if (typeof File !== "undefined" && file instanceof File) {
      const buffer = await file.arrayBuffer();
      return this.parseArrayBuffer(buffer, file.name);
    }
    throw new BookParseError("Unsupported EPUB input type", "epub");
  }

  private async parseArrayBuffer(
    buffer: ArrayBuffer,
    name: string,
  ): Promise<BookDocument> {
    const book = ePub(buffer);
    try {
      await book.ready;
      await book.loaded.spine;
    } catch (err) {
      throw new BookParseError(
        `Failed to load EPUB: ${err instanceof Error ? err.message : String(err)}`,
        "epub",
      );
    }

    const spine = book.spine;
    let sections: Section[] = [];
    try {
      spine.each((section: Section) => {
        sections.push(section);
      });
    } catch {
      // fall back to sequential access below
    }
    if (sections.length === 0) {
      let i = 0;
      for (;;) {
        let section: Section | null = null;
        try {
          section = spine.get(i);
        } catch {
          break;
        }
        if (!section) break;
        sections.push(section);
        i += 1;
      }
    }

    if (sections.length === 0) {
      throw new BookParseError("EPUB has an empty spine", "epub");
    }

    const tocLabels = await this.loadTocLabels(book);

    const chapters = await Promise.all(
      sections.map(async (section, i) => {
        let html = "";
        let title = "";
        let blocks: ChapterBlock[] | undefined;
        let text = "";
        try {
          // Pass the book's load method so sections are read from the in-memory
          // archive instead of the network, and await the returned promise.
          // Note: epubjs resolves with the <html> Element (not a Document), so
          // the helper methods below accept both.
          const doc: Document | Element | undefined = await section.load(book.load.bind(book));
          html = this.extractBodyHtml(doc);
          title =
            tocLabels.get(this.normalizeHref(section.href, "")) ||
            this.titleFromDoc(doc) ||
            this.titleFromHref(section.href);
          const segments = this.walkBlocks(doc);
          await this.inlineImages(book, segments, section.href);
          ({ text, blocks } = this.segmentsToChapter(segments));
        } catch (err) {
          console.warn(`Failed to load section ${section.href}`, err);
        }
        return {
          id: section.idref || section.href || `sec-${i}`,
          title: title || `Section ${i + 1}`,
          html,
          text,
          blocks,
        };
      }),
    );

    const title =
      (book.packaging?.metadata?.title as string) ||
      name.replace(/\.[^.]+$/, "");
    const language = detectLanguage(chapters.map((c) => c.text).join("\n"));

    // Extract rich metadata from EPUB packaging.
    const metadata = book.packaging?.metadata;
    const author = (metadata?.creator as string) || undefined;
    const description = (metadata?.description as string) || undefined;
    const publisher = (metadata?.publisher as string) || undefined;
    const date = (metadata as unknown as Record<string, unknown>)?.date as string | undefined;

    // Extract cover image if available.
    let coverUrl: string | undefined;
    try {
      const url = await book.coverUrl();
      if (url) {
        if (url.startsWith("blob:")) {
          const response = await fetch(url);
          const blob = await response.blob();
          coverUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        } else {
          coverUrl = url;
        }
      }
    } catch {
      // Ignore — cover extraction is best-effort.
    }

    return {
      id: title + ":" + chapters.length,
      title,
      language,
      format: "epub",
      chapters,
      author,
      description,
      coverUrl,
      publisher,
      date,
    };
  }

  private extractBodyHtml(doc: Document | Element | undefined | null): string {
    if (!doc) return "";
    // epubjs resolves section.load() with the <html> Element; when given a full
    // Document use its body element, otherwise fall back to the element itself.
    const root: Element | null =
      "body" in doc && doc.body instanceof HTMLElement
        ? doc.body
        : (doc as Element).querySelector?.("body") ?? (doc as Element);
    return root ? root.innerHTML : "";
  }

  private titleFromDoc(doc: Document | Element | undefined | null): string {
    if (!doc) return "";
    // Prefer headings inside the body over the <head> <title> element, which
    // is usually the book title rather than the section's own heading.
    const root: Element | null =
      "body" in doc && doc.body instanceof HTMLElement
        ? doc.body
        : (doc as Element).querySelector?.("body") ?? (doc as Element);
    const h = root?.querySelector?.("h1, h2, h3, h4");
    if (h) {
      const text = (h.textContent ?? "").trim();
      if (text) return text;
    }
    const title = doc.querySelector?.("title");
    return title ? (title.textContent ?? "").trim() : "";
  }

  private titleFromHref(href: string): string {
    const base = href.split("/").pop() ?? href;
    return decodeURIComponent(base.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
  }

  /** Directory portion of a path, or "" when the path has no directory. */
  private dirOf(path: string): string {
    const i = path.lastIndexOf("/");
    return i > 0 ? path.slice(0, i) : "";
  }

  /**
   * Strip a fragment, then resolve a relative href against a base directory so
   * hrefs from different documents (nav.xhtml vs OPF manifest) share a key space.
   */
  private normalizeHref(href: string, baseDir: string): string {
    const path = href.split("#")[0];
    if (path.startsWith("/") || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)) {
      return path;
    }
    const parts = [...baseDir.split("/").filter(Boolean), ...path.split("/")];
    const stack: string[] = [];
    for (const part of parts) {
      if (part === "" || part === ".") continue;
      if (part === "..") stack.pop();
      else stack.push(part);
    }
    return stack.join("/");
  }

  /** Map of normalized href -> TOC label, flattened across subitems. */
  private async loadTocLabels(book: Book): Promise<Map<string, string>> {
    const labels = new Map<string, string>();
    try {
      const navigation = await book.loaded.navigation;
      const baseDir = this.dirOf(book.packaging?.navPath ?? "");
      const walk = (items: NavItem[]) => {
        for (const item of items) {
          if (item.href) {
            const key = this.normalizeHref(item.href, baseDir);
            if (key && item.label) labels.set(key, item.label);
          }
          if (item.subitems?.length) walk(item.subitems);
        }
      };
      walk(navigation.toc ?? []);
    } catch (err) {
      console.warn("Failed to load EPUB navigation TOC", err);
    }
    return labels;
  }

  /**
   * Walk a section's body DOM, collecting ordered segments: text runs (with
   * paragraph breaks from `</p>` and `<br>`), and images (both `<img>` and
   * `<svg><image>` elements).
   */
  private walkBlocks(doc: Document | Element | undefined | null): RawSegment[] {
    if (!doc) return [];
    const root: Element | null =
      "body" in doc && doc.body instanceof HTMLElement
        ? doc.body
        : (doc as Element).querySelector?.("body") ?? (doc as Element);
    if (!root) return [];
    const segments: RawSegment[] = [];
    const appendText = (s: string) => {
      if (!s) return;
      const last = segments[segments.length - 1];
      if (last && last.type === "text" && typeof last.raw === "string") {
        last.raw += s;
      } else {
        segments.push({ type: "text", raw: s });
      }
    };
    const visit = (node: ChildNode) => {
      if (node.nodeType === 3) {
        // text node
        appendText(node.nodeValue ?? "");
        return;
      }
      if (node.nodeType !== 1) return; // skip comments etc.
      const el = node as Element;
      const tag = el.nodeName.toLowerCase();
      if (tag === "br") {
        appendText("\n");
        return;
      }
      if (tag === "img") {
        const src = el.getAttribute("src");
        if (src) segments.push({ type: "image", src, alt: el.getAttribute("alt") ?? "" });
        return;
      }
      if (tag === "image") {
        const src =
          el.getAttribute("href") ||
          el.getAttribute("xlink:href") ||
          el.getAttributeNS("http://www.w3.org/1999/xlink", "href");
        if (src) segments.push({ type: "image", src });
        return;
      }
      for (const child of Array.from(el.childNodes)) visit(child);
      if (tag === "p") appendText("\n\n");
    };
    for (const child of Array.from(root.childNodes)) visit(child);
    return segments;
  }

  /**
   * Resolve image segments against the section's directory and inline them as
   * data URLs fetched from the book archive. Failing images are kept as-is and
   * skipped at render time.
   */
  private async inlineImages(
    book: Book,
    segments: RawSegment[],
    sectionHref: string,
  ): Promise<void> {
    // section.href is relative to the OPF directory; resolve it to an
    // archive-absolute path so relative image srcs resolve to real zip entries.
    let sectionDir: string;
    try {
      sectionDir = this.dirOf(book.resolve(sectionHref));
    } catch {
      sectionDir = this.dirOf(sectionHref);
    }
    for (const seg of segments) {
      if (seg.type !== "image" || !seg.src) continue;
      const path = this.normalizeHref(seg.src, sectionDir);
      if (path.startsWith("/") || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(path)) continue;
      try {
        const dataUrl = await book.archive?.getBase64("/" + path);
        if (dataUrl) seg.src = dataUrl;
      } catch (err) {
        console.warn(`Failed to inline image ${path}`, err);
      }
    }
  }

  /**
   * Concatenate text segments into the chapter text and produce ordered blocks.
   * Whitespace-only cleanup (`[ \t]+\n` -> `\n`, `\n{3,}` -> `\n\n`) is applied
   * per text segment so block offsets stay aligned with the final `text`.
   */
  private segmentsToChapter(segments: RawSegment[]): {
    text: string;
    blocks: ChapterBlock[];
  } {
    let text = "";
    const blocks: ChapterBlock[] = [];
    for (const seg of segments) {
      if (seg.type === "text") {
        const cleaned = (seg.raw ?? "")
          .replace(/[ \t]+\n/g, "\n")
          .replace(/\n{3,}/g, "\n\n");
        const start = text.length;
        text += cleaned;
        blocks.push({ kind: "text", start, end: start + cleaned.length });
      } else {
        const image: ImageBlock = { kind: "image", src: seg.src ?? "" };
        if (seg.alt) image.alt = seg.alt;
        blocks.push(image);
      }
    }
    // Trim surrounding whitespace and re-anchor offsets.
    const lead = text.match(/^\s+/);
    if (lead) text = text.slice(lead[0].length);
    const tail = text.match(/\s+$/);
    if (tail) text = text.slice(0, text.length - tail[0].length);
    const leadLen = lead ? lead[0].length : 0;
    for (const block of blocks) {
      if (block.kind !== "text") continue;
      block.start = Math.max(0, block.start - leadLen);
      block.end = Math.max(0, block.end - leadLen);
      block.end = Math.min(block.end, text.length);
      block.start = Math.min(block.start, text.length);
    }
    return { text, blocks };
  }
}
