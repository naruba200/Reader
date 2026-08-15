import { memo, useMemo } from "react";
import type {
  AnalyzedToken,
  BookChapter,
  DifficultyRating,
} from "../core/types";
import { buildParagraphNodes, paragraphRangesForBlock } from "./spans";
import type { Page } from "./pages";

export interface ChapterViewProps {
  chapter: BookChapter;
  tokens: AnalyzedToken[];
  rating: DifficultyRating;
  /** Map a token level to a CSS class name, or null for no styling. */
  levelClass: (level: AnalyzedToken["level"]) => string | null;
  onWordClick?: (token: AnalyzedToken, event: { x: number; y: number }) => void;
  /** When set, only this page's content items are rendered. */
  page?: Page;
  /** Render the book's text vertically (top-to-bottom) for Japanese-style reading. */
  vertical?: boolean;
}

const RATING_BADGE: Record<DifficultyRating, string> = {
  "Very Easy": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  Easy: "bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200",
  Moderate: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  Hard: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  "Very Hard": "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

/**
 * Renders a chapter's (or one page's) content, one word per span so each token
 * can be styled by difficulty and clicked for lookup. Uses absolute offsets into
 * the raw text so styling stays in sync with the tokenizer. Images render as
 * standalone blocks at their flow position. Only the book's text is affected by
 * vertical reading mode; the header and images stay in horizontal layout.
 */
export const ChapterView = memo(function ChapterView({
  chapter,
  tokens,
  rating,
  levelClass,
  onWordClick,
  page,
  vertical = false,
}: ChapterViewProps) {
  const text = chapter.text;
  const paragraphClass = vertical ? "leading-relaxed" : "mb-4 leading-relaxed";

  // The content to render: the requested page, or the whole chapter.
  const items = useMemo(() => {
    if (page) return page.items;
    if (chapter.blocks && chapter.blocks.length > 0) return chapter.blocks;
    return [{ kind: "text" as const, start: 0, end: text.length }];
  }, [page, chapter.blocks, text.length]);

  const { allNodes, textNodes, imageNodes } = useMemo(() => {
    const all: React.ReactNode[] = [];
    const texts: React.ReactNode[] = [];
    const images: React.ReactNode[] = [];
    items.forEach((block, bi) => {
      if (block.kind === "image") {
        const node = (
          <figure
            key={`i:${bi}`}
            className={
              vertical
                ? "block-image flex flex-1 flex-col items-center justify-center overflow-hidden"
                : "block-image my-6 flex justify-center"
            }
          >
            <img
              src={block.src}
              alt={block.alt ?? ""}
              className={
                vertical
                  ? "max-h-full max-w-full rounded object-contain"
                  : "max-w-full h-auto rounded"
              }
            />
          </figure>
        );
        all.push(node);
        images.push(node);
        return;
      }
      const textNode = (
        <p key={`t:${bi}`} className={paragraphClass}>
          {paragraphRangesForBlock(text, block.start, block.end).map((para) =>
            buildParagraphNodes(text, para, tokens).map((node) =>
              node.token ? (
                <span
                  key={`${node.start}:${node.length}`}
                  className={levelClass(node.token.level) ?? undefined}
                  onClick={
                    onWordClick
                      ? (e) => {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          onWordClick(node.token!, {
                            x: rect.left + rect.width / 2,
                            y: rect.top,
                          });
                        }
                      : undefined
                  }
                >
                  {node.text}
                </span>
              ) : (
                <span key={`${node.start}:${node.length}`}>{node.text}</span>
              ),
            ),
          )}
        </p>
      );
      all.push(textNode);
      texts.push(textNode);
    });
    return { allNodes: all, textNodes: texts, imageNodes: images };
  }, [items, text, tokens, paragraphClass, levelClass, onWordClick, vertical]);

  return (
    <article
      className={
        vertical ? "relative h-full flex flex-col py-8 px-4" : "relative max-w-prose mx-auto py-8 px-4"
      }
    >
      <div className="mb-4 flex items-center gap-2 text-sm">
        <span className="font-semibold">{chapter.title}</span>
        <span className={`ml-auto rounded px-2 py-0.5 text-xs font-medium ${RATING_BADGE[rating]}`}>
          {rating}
        </span>
      </div>

      {vertical ? (
        <>
          {textNodes.length > 0 && (
            <div className="flex-1 min-h-0 reading-vertical-text">{textNodes}</div>
          )}
          {imageNodes}
        </>
      ) : (
        allNodes
      )}
    </article>
  );
});
