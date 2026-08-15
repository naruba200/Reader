import { useState } from "react";
import type { DictionaryEntry, Level } from "../core/types";

export interface EntryCardProps {
  /** Surface word (e.g. the clicked token). Defaults to `entry.word`. */
  word?: string;
  entry?: DictionaryEntry;
  level?: Level;
  onClose?: () => void;
  onOpenInDictionary?: () => void;
}

const LEVEL_BADGE: Partial<Record<Level, string>> = {
  A1: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  A2: "bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200",
  B1: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  B2: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  C1: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  C2: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  N5: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  N4: "bg-lime-100 text-lime-800 dark:bg-lime-900 dark:text-lime-200",
  N3: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  N2: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  N1: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

function langForLevel(level: Level | undefined): string {
  if (level && level.startsWith("N")) return "ja-JP";
  return "en-US";
}

/** Shared rendering of a dictionary entry used by both the popover and the dictionary page. */
export function EntryCard({
  word,
  entry,
  level,
  onClose,
  onOpenInDictionary,
}: EntryCardProps) {
  const [played, setPlayed] = useState(false);
  const surface = word ?? entry?.word ?? "";
  const levelText = level && level !== "UNKNOWN" ? level : undefined;

  const speech = () => {
    if (typeof speechSynthesis === "undefined") return;
    const utter = new SpeechSynthesisUtterance(surface);
    utter.lang = langForLevel(level);
    speechSynthesis.cancel();
    speechSynthesis.speak(utter);
    setPlayed(true);
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-lg font-semibold">{surface}</div>
          {entry?.ipa && <div className="text-sm text-gray-500 dark:text-gray-400">{entry.ipa}</div>}
          {entry?.readings && entry.readings.length > 0 && (
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {entry.readings.join(" · ")}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={speech}
          className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-700"
          aria-label="Play pronunciation"
        >
          {played ? "🔊" : "🔈"}
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {levelText && (
          <span
            className={`rounded px-1.5 py-0.5 ${level ? (LEVEL_BADGE[level] ?? "bg-gray-100 dark:bg-gray-700") : "bg-gray-100 dark:bg-gray-700"}`}
          >
            {levelText}
          </span>
        )}
        {entry?.pos && (
          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            {entry.pos}
          </span>
        )}
        {entry?.source && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-gray-500 dark:bg-gray-700 dark:text-gray-300">
            {entry.source}
          </span>
        )}
      </div>

      <p className="mt-2 text-sm leading-snug">
        {entry?.definition ?? "No dictionary entry available for this word."}
      </p>

      {entry?.examples && entry.examples.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300">
          {entry.examples.slice(0, 3).map((ex, i) => (
            <li key={i} className="border-l-2 border-gray-200 pl-2 dark:border-gray-700">
              {ex}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex items-center gap-3">
        {onOpenInDictionary && (
          <button
            type="button"
            onClick={onOpenInDictionary}
            className="text-xs text-blue-600 hover:underline dark:text-blue-400"
          >
            Open in Dictionary →
          </button>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            Close (Esc)
          </button>
        )}
      </div>
    </div>
  );
}