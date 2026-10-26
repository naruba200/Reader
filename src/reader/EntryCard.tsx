import { useState } from "react";
import type { DictionaryEntry, Level } from "../core/types";
import {
  getActiveEngine,
  getActiveRate,
  getActiveVoiceId,
  getAllEngines,
  languageForText,
  waitForVoices,
  NO_JAPANESE_VOICE_MESSAGE,
} from "../core/tts";

export interface EntryCardProps {
  /** Surface word (e.g. the clicked token). Defaults to `entry.word`. */
  word?: string;
  entry?: DictionaryEntry;
  level?: Level;
  onClose?: () => void;
  onOpenInDictionary?: () => void;
  /** Save-to-word-bank handler; when provided a "+ Bank" button is shown. */
  onSaveWord?: () => void;
  wordSaved?: boolean;
  /** Called when speaking fails (e.g. so the host page can show a toast).
      When absent, the failure is shown inline under the buttons. */
  onSpeakError?: (message: string) => void;
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

const JAPANESE_RE = /[\u3040-\u30FF\u4E00-\u9FFF]/;

/**
 * JMDict examples arrive as Japanese/English pairs (sentence, then its
 * translation); WordNet examples are single English sentences. Group
 * consecutive JP→EN pairs so the translation renders muted under its
 * sentence instead of as a flat mixed list.
 */
function pairExamples(examples: string[]): Array<{ jp: string; en?: string }> {
  const pairs: Array<{ jp: string; en?: string }> = [];
  for (let i = 0; i < examples.length; i++) {
    const cur = examples[i];
    const next = examples[i + 1];
    if (
      next !== undefined &&
      JAPANESE_RE.test(cur) &&
      !JAPANESE_RE.test(next)
    ) {
      pairs.push({ jp: cur, en: next });
      i++;
    } else {
      pairs.push({ jp: cur });
    }
  }
  return pairs;
}

/** Shared rendering of a dictionary entry used by both the popover and the dictionary page. */
export function EntryCard({
  word,
  entry,
  level,
  onClose,
  onOpenInDictionary,
  onSaveWord,
  wordSaved,
  onSpeakError,
}: EntryCardProps) {
  const [played, setPlayed] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [speakError, setSpeakError] = useState<string | null>(null);
  const surface = word ?? entry?.word ?? "";
  const levelText = level && level !== "UNKNOWN" ? level : undefined;

  // Speak through the app's TTS engine (active first, then every other
  // engine), NOT raw browser speechSynthesis — that engine is silent on
  // Android WebView, which is why the speaker icon used to do nothing.
  // The language comes from the WORD'S TEXT (Japanese characters → ja):
  // deriving it from the JLPT level was the gibberish bug, because a
  // Japanese word with no JLPT level was spoken by an English voice.
  // A voice is only ever used when it speaks that language, and when no
  // voice for the language exists the user gets an install hint instead
  // of gibberish.
  const speak = async () => {
    if (speaking || !surface) return;
    setSpeakError(null);
    setSpeaking(true);
    const lang = languageForText(surface, level);
    const active = getActiveEngine();
    const engines = [active, ...getAllEngines().filter((e) => e.id !== active.id)];
    // Voices load asynchronously; wait briefly rather than concluding
    // "no voice" from a still-empty cache right after app start.
    const voices = await waitForVoices(lang);
    if (voices.length === 0) {
      const msg =
        lang === "ja"
          ? NO_JAPANESE_VOICE_MESSAGE
          : "Couldn't play audio — no working voice on this device";
      setSpeaking(false);
      setSpeakError(msg);
      onSpeakError?.(msg);
      return;
    }
    const savedId = getActiveVoiceId();
    let spoken = false;
    for (const engine of engines) {
      const savedMatchesLang =
        savedId != null &&
        voices.some((v) => v.id === savedId && v.engine === engine.id);
      const voiceId = savedMatchesLang
        ? savedId
        : voices.find((v) => v.engine === engine.id)?.id;
      // Never speak with a voice of the wrong language (or none): the
      // native engine used to default to ja-JP, which is exactly how an
      // English word could come out as Japanese and vice versa.
      if (!voiceId) continue;
      try {
        await engine.speak(surface, voiceId, getActiveRate());
        spoken = true;
        break;
      } catch (err) {
        console.warn(`TTS engine "${engine.id}" failed, trying next`, err);
      }
    }
    setSpeaking(false);
    if (spoken) {
      setPlayed(true);
    } else {
      const msg = "Couldn't play audio — no working voice on this device";
      setSpeakError(msg);
      onSpeakError?.(msg);
    }
  };

  return (
    <div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-2xl font-bold tracking-tight break-words">{surface}</div>
          {entry?.ipa && <div className="text-sm theme-card-muted">{entry.ipa}</div>}
          {entry?.readings && entry.readings.length > 0 && (
            <div className="text-sm theme-card-muted">
              {entry.readings.join(" · ")}
            </div>
          )}
        </div>
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={() => void speak()}
            disabled={speaking}
            className="theme-card theme-btn rounded border px-2 py-1 text-xs disabled:opacity-50"
            aria-label="Play pronunciation"
          >
            {played ? "🔊" : "🔈"}
          </button>
          {onSaveWord && (
            <button
              type="button"
              onClick={onSaveWord}
              className={`rounded border px-2 py-1 text-xs font-medium ${
                wordSaved
                  ? "border-green-400 bg-green-50 text-green-700 dark:border-green-600 dark:bg-green-900/40 dark:text-green-300"
                  : "theme-card theme-btn"
              }`}
              aria-label={wordSaved ? "Saved to word bank" : "Save to word bank"}
            >
              {wordSaved ? "✓ Bank" : "+ Bank"}
            </button>
          )}
        </div>
      </div>
      {speakError && (
        <p className="mt-1 text-xs text-red-400">{speakError}</p>
      )}

      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        {levelText && (
          <span
            className={`rounded px-1.5 py-0.5 ${level ? (LEVEL_BADGE[level] ?? "theme-chip") : "theme-chip"}`}
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
          <span className="theme-chip rounded px-1.5 py-0.5">
            {entry.source}
          </span>
        )}
      </div>

      <div className="mt-3">
        <div className="text-[11px] font-semibold uppercase tracking-wider theme-card-muted">
          Meaning
        </div>
        <p className="mt-0.5 text-[15px] leading-relaxed">
          {entry?.definition ?? "No dictionary entry available for this word."}
        </p>
      </div>

      {entry?.examples && entry.examples.length > 0 && (
        <div className="mt-3">
          <div className="text-[11px] font-semibold uppercase tracking-wider theme-card-muted">
            Examples
          </div>
          <ul className="mt-1 space-y-2 text-sm">
            {pairExamples(entry.examples).slice(0, 2).map((pair, i) => (
              <li key={i} className="theme-divider border-l-2 pl-2">
                <div>{pair.jp}</div>
                {pair.en && <div className="text-xs theme-card-muted">{pair.en}</div>}
              </li>
            ))}
          </ul>
        </div>
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
            className="ml-auto text-xs text-gray-400 hover:text-white"
          >
            Close (Esc)
          </button>
        )}
      </div>
    </div>
  );
}
