import type { AnalyzedToken, Level } from "../core/types";

export type HighlightName = `level-${string}`;

/** Create the registered highlight name for a level. */
export function highlightNameFor(level: Level): HighlightName {
  const key = level.toLowerCase();
  return `level-${key}`;
}

const SUPPORTED_LEVELS = new Set([
  "A1", "A2", "B1", "B2", "C1", "C2",
  "N5", "N4", "N3", "N2", "N1", "UNKNOWN",
]);

export interface HighlightRange {
  level: Level;
  start: number;
  end: number;
}

/**
 * Build highlight ranges from analyzed tokens using the text's character offsets.
 * Only tokens whose level is one of the supported ones produce highlights.
 */
export function buildHighlightRanges(tokens: readonly AnalyzedToken[]): HighlightRange[] {
  const ranges: HighlightRange[] = [];
  for (const token of tokens) {
    if (!SUPPORTED_LEVELS.has(token.level)) continue;
    ranges.push({
      level: token.level,
      start: token.start,
      end: token.start + token.length,
    });
  }
  return ranges;
}

/** Whether the running browser supports the CSS Custom Highlight API. */
export function supportsCustomHighlights(): boolean {
  return typeof CSS !== "undefined" && "highlights" in CSS;
}

/**
 * Apply highlights to a document's text nodes using the CSS Custom Highlight API.
 * Returns a cleanup function that removes the registered highlights.
 */
export function applyHighlights(
  document: Document,
  ranges: readonly HighlightRange[],
): () => void {
  if (!supportsCustomHighlights()) return () => {};

  const byLevel = new Map<Level, Range[]>();
  for (const { level, start, end } of ranges) {
    const range = document.createRange();
    try {
      const startNode = textNodeAtOffset(document.body, start);
      const endNode = textNodeAtOffset(document.body, end);
      if (!startNode || !endNode) continue;
      range.setStart(startNode.node, startNode.offset);
      range.setEnd(endNode.node, endNode.offset);
    } catch {
      continue;
    }
    const list = byLevel.get(level) ?? [];
    list.push(range);
    byLevel.set(level, list);
  }

  const registered: [HighlightName, Highlight][] = [];
  for (const [level, rangesForLevel] of byLevel) {
    const highlight = new Highlight(...rangesForLevel);
    const name = highlightNameFor(level);
    try {
      CSS.highlights.set(name, highlight);
      registered.push([name, highlight]);
    } catch {
      // ignore unsupported levels
    }
  }

  return () => {
    for (const [name] of registered) {
      try {
        CSS.highlights.delete(name);
      } catch {
        // ignore
      }
    }
  };
}

interface TextNodeRef {
  node: Text;
  offset: number;
}

/** Walk text nodes (depth-first) to find the node containing a character offset. */
function textNodeAtOffset(root: Node, target: number): TextNodeRef | undefined {
  let consumed = 0;

  function walk(node: Node): TextNodeRef | undefined {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent?.length ?? 0;
      if (consumed + len >= target && len > 0) {
        return { node: node as Text, offset: target - consumed };
      }
      consumed += len;
      return undefined;
    }
    if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.DOCUMENT_NODE) {
      return undefined;
    }
    if ((node as Element).nodeName === "SCRIPT" || (node as Element).nodeName === "STYLE") {
      return undefined;
    }
    for (let i = 0; i < node.childNodes.length; i++) {
      const found = walk(node.childNodes[i]);
      if (found) return found;
    }
    return undefined;
  }

  return walk(root);
}
