import { useEffect, useState } from "react";
import { getDictionaryStore } from "../core/dictionary";
import { radicalForKanji } from "../core/kanji/radicals";
import {
  loadKanjiInfo,
  copyText,
  type KanjiInfo,
} from "./KanjiSection";
import { StrokeOrderDiagram } from "./StrokeOrderDiagram";

/**
 * Dedicated detail view for a single kanji, reached from a kanji card's
 * action sheet. Shows readings, meanings, grade, strokes, its classical
 * radical, an animated stroke-order diagram, and example words
 * containing it. Back returns to the word page.
 */
export function KanjiDetailPage({
  char,
  onBack,
  onOpenWord,
}: {
  char: string;
  onBack: () => void;
  onOpenWord: (word: string) => void;
}) {
  const [info, setInfo] = useState<KanjiInfo | null>(null);
  const [missing, setMissing] = useState(false);
  const [examples, setExamples] = useState<Array<{ word: string; reading?: string }>>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setInfo(null);
    setMissing(false);
    setExamples([]);
    void (async () => {
      const found = await loadKanjiInfo(char);
      if (cancelled) return;
      if (found) setInfo(found);
      else setMissing(true);
    })();
    void (async () => {
      const store = getDictionaryStore("ja");
      const found = await store.search(char, 12);
      if (cancelled) return;
      setExamples(
        found
          .filter((r) => r.word !== char && r.word.includes(char))
          .slice(0, 6)
          .map((r) => ({ word: r.word, reading: r.reading })),
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [char]);

  const radical = radicalForKanji(char);

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-3 rounded-lg px-2.5 py-1.5 text-sm font-medium hover:bg-gray-100 active:scale-95 dark:hover:bg-gray-700"
      >
        ← Back
      </button>

      <div className="theme-card rounded-2xl border p-4 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="shrink-0 text-center">
            <div className="text-6xl font-bold leading-none">{char}</div>
            <button
              type="button"
              onClick={() => {
                void copyText(char).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                });
              }}
              className="theme-card theme-btn mt-2 rounded-full border px-3 py-1 text-xs font-medium"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
          <div className="min-w-0 flex-1">
            {missing && (
              <p className="text-sm text-gray-400">
                Kanji details need the KANJIDIC2 pack — download it in the Downloads tab.
              </p>
            )}
            {info && (
              <>
                {info.on.length > 0 && (
                  <p className="text-sm leading-snug">
                    <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wider theme-card-muted">
                      ON
                    </span>
                    {info.on.join("、")}
                  </p>
                )}
                {info.kun.length > 0 && (
                  <p className="mt-1 text-sm leading-snug">
                    <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wider theme-card-muted">
                      KUN
                    </span>
                    {info.kun.join("、")}
                  </p>
                )}
                {info.meanings && (
                  <p className="mt-2 text-[15px] leading-relaxed">{info.meanings}</p>
                )}
                {(info.grade ?? info.strokes) && (
                  <p className="mt-1 text-xs theme-card-muted">
                    {[
                      info.grade ? `Grade ${info.grade}` : null,
                      info.strokes ? `${info.strokes} strokes` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
              </>
            )}
            <div className="theme-divider mt-3 border-t pt-2">
              {radical ? (
                <p className="text-sm leading-snug">
                  <span className="mr-2 text-2xl font-bold">{radical.char}</span>
                  <span className="theme-card-muted">
                    Radical {radical.number} of 214 · {radical.meaning} ·{" "}
                    {radical.strokes} strokes
                  </span>
                </p>
              ) : (
                <p className="text-xs theme-card-muted">
                  Radical data not available for this character.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Stroke order
          </h3>
          <StrokeOrderDiagram char={char} animated showFooter className="w-56 max-w-full" />
        </div>
      </div>

      {examples.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Words with {char}
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {examples.map((ex) => (
              <button
                key={ex.word}
                type="button"
                onClick={() => onOpenWord(ex.word)}
                className="theme-card theme-card-interactive rounded-full border px-3 py-1.5 text-[13px] shadow-sm transition-all active:scale-95"
              >
                {ex.word}
                {ex.reading && ex.reading !== ex.word && (
                  <span className="ml-1 text-xs text-gray-400">{ex.reading}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
