import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { AnalyzedToken, DictionaryEntry } from "../core/types";
import { EntryCard } from "./EntryCard";

export interface PopoverState {
  token: AnalyzedToken;
  x: number;
  y: number;
}

export interface WordPopoverProps {
  popover: PopoverState;
  entry?: DictionaryEntry;
  onClose: () => void;
  onOpenInDictionary?: (lemma: string) => void;
  onSaveWord?: () => void;
  wordSaved?: boolean;
}

const WIDTH = 288; // w-72
const GAP = 8;

/** Popover showing dictionary entry details for a tapped word. */
export function WordPopover({
  popover,
  entry,
  onClose,
  onOpenInDictionary,
  onSaveWord,
  wordSaved,
}: WordPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);

  // Re-measure (and reposition) on scroll/resize so the popover follows layout changes.
  const measure = useCallback(() => {
    setHeight(ref.current?.offsetHeight ?? 0);
  }, []);

  useLayoutEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [measure]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onOutside = (e: MouseEvent | TouchEvent) => {
      if (ref.current && e.target instanceof Node && !ref.current.contains(e.target)) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onOutside);
    window.addEventListener("touchstart", onOutside);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onOutside);
      window.removeEventListener("touchstart", onOutside);
    };
  }, [onClose]);

  const left = Math.max(GAP, Math.min(popover.x - WIDTH / 2, window.innerWidth - WIDTH - GAP));
  const above = popover.y - height - GAP;
  const top = above >= GAP ? above : popover.y + GAP + 20;

  return (
    <div
      ref={ref}
      className="theme-card fixed z-50 w-72 rounded-lg border p-3 shadow-lg"
      style={{ left, top }}
    >
      <EntryCard
        word={popover.token.surface}
        entry={entry}
        level={popover.token.level}
        onClose={onClose}
        onSaveWord={onSaveWord}
        wordSaved={wordSaved}
        onOpenInDictionary={
          onOpenInDictionary
            ? () => onOpenInDictionary(popover.token.lemma)
            : undefined
        }
      />
    </div>
  );
}