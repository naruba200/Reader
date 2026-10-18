import { useMemo, useState } from "react";
import { ActionSheet } from "../components/ActionSheet";
import {
  loadWordBank,
  removeWord,
  saveWord,
  updateWordSrs,
  downloadAnkiTsv,
  isWordSaved,
  type WordBankEntry,
} from "./wordBank";
import {
  getLookupHistory,
  getDifficultWords,
  type LookupRecord,
} from "./history";
import { gradeSrs, isDue, type Grade } from "./srs";

type StudyTab = "review" | "words" | "difficult" | "history";

const TABS: { id: StudyTab; label: string }[] = [
  { id: "review", label: "Review" },
  { id: "words", label: "Words" },
  { id: "difficult", label: "Difficult" },
  { id: "history", label: "History" },
];

const GRADES: { grade: Grade; label: string; className: string }[] = [
  { grade: 0, label: "Again", className: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200" },
  { grade: 3, label: "Hard", className: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200" },
  { grade: 4, label: "Good", className: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-200" },
  { grade: 5, label: "Easy", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-200" },
];

function dueLabel(entry: WordBankEntry): string | null {
  if (!entry.srs) return "New";
  if (isDue(entry.srs)) return "Due";
  const days = Math.ceil((entry.srs.due - Date.now()) / 86_400_000);
  return days <= 0 ? "Due" : `in ${days}d`;
}

export function StudyPage() {
  const [tab, setTab] = useState<StudyTab>("review");
  const [version, setVersion] = useState(0);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  // Flashcard state
  const [cardIndex, setCardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);

  const words = useMemo(() => loadWordBank(), [version]);
  const dueCards = useMemo(() => words.filter((w) => isDue(w.srs)), [words, version]);
  const difficult = useMemo(
    () => getDifficultWords().filter((r) => !isWordSaved(r.word, r.lang)),
    [version],
  );
  const history = useMemo(() => getLookupHistory(100), [version]);

  const refresh = () => {
    setVersion((v) => v + 1);
    setCardIndex(0);
    setShowAnswer(false);
  };

  const gradeCurrent = (grade: Grade) => {
    const card = dueCards[cardIndex];
    if (!card) return;
    updateWordSrs(card.id, gradeSrs(card.srs, grade));
    setShowAnswer(false);
    if (cardIndex + 1 >= dueCards.length) {
      refresh();
    } else {
      setCardIndex(cardIndex + 1);
    }
  };

  const current = dueCards[Math.min(cardIndex, dueCards.length - 1)];

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-gray-200 px-4 py-2 pt-safe dark:border-gray-700">
        <h1 className="text-lg font-bold">Study</h1>
        <div className="mt-1 flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`relative rounded-lg px-3 py-1.5 text-sm font-medium ${
                tab === t.id
                  ? "bg-blue-600 text-white"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              {t.label}
              {t.id === "review" && dueCards.length > 0 && (
                <span className="absolute -right-1 -top-1 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                  {dueCards.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "review" && (
          <div>
            {dueCards.length === 0 ? (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-gray-400">
                <p className="text-lg">All caught up! 🎉</p>
                <p className="text-sm">
                  {words.length === 0
                    ? "Tap a word while reading, then save it to your word bank."
                    : "No cards are due right now."}
                </p>
              </div>
            ) : current ? (
              <div>
                <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                  Card {cardIndex + 1} of {dueCards.length}
                </p>
                <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
                  <p className="text-3xl font-bold">{current.word}</p>
                  {showAnswer ? (
                    <div className="mt-4 space-y-2 text-left">
                      {current.reading && (
                        <p className="text-lg text-gray-600 dark:text-gray-300">{current.reading}</p>
                      )}
                      {current.definition && <p className="text-sm">{current.definition}</p>}
                      {current.sentence && (
                        <p className="border-l-2 border-gray-200 pl-2 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                          {current.sentence}
                        </p>
                      )}
                      <div className="grid grid-cols-4 gap-2 pt-2">
                        {GRADES.map((g) => (
                          <button
                            key={g.grade}
                            type="button"
                            onClick={() => gradeCurrent(g.grade)}
                            className={`rounded-xl px-2 py-2.5 text-sm font-semibold ${g.className}`}
                          >
                            {g.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowAnswer(true)}
                      className="mt-6 w-full rounded-xl bg-blue-600 px-4 py-3 font-medium text-white active:scale-[0.99]"
                    >
                      Show answer
                    </button>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        )}

        {tab === "words" && (
          <div>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {words.length} word{words.length !== 1 ? "s" : ""}
              </span>
              <button
                type="button"
                disabled={words.length === 0}
                onClick={() => downloadAnkiTsv(words)}
                className="ml-auto rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
              >
                Export Anki TSV
              </button>
            </div>
            {words.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-400">
                Nothing saved yet. Tap a word while reading and hit “+ Bank”.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {words.map((w) => (
                  <li key={w.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-medium">{w.word}</span>
                        {w.reading && w.reading !== w.word && (
                          <span className="text-sm text-gray-500 dark:text-gray-400">{w.reading}</span>
                        )}
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500 dark:bg-gray-700 dark:text-gray-300">
                          {dueLabel(w)}
                        </span>
                      </div>
                      {w.definition && (
                        <p className="truncate text-sm text-gray-500 dark:text-gray-400">{w.definition}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(w.id)}
                      className="shrink-0 rounded p-2 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                      aria-label={`Remove ${w.word}`}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === "difficult" && (
          <div>
            <p className="mb-3 text-sm text-gray-500 dark:text-gray-400">
              Words you&apos;ve looked up 2+ times. Save the stubborn ones to your bank.
            </p>
            {difficult.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-400">No difficult words yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {difficult.map((r: LookupRecord) => (
                  <li key={`${r.lang}:${r.word}`} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{r.word}</span>
                      <span className="ml-2 rounded bg-orange-100 px-1.5 py-0.5 text-[10px] text-orange-700 dark:bg-orange-900/40 dark:text-orange-200">
                        ×{r.count}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => { saveWord({ word: r.word, lang: r.lang }); refresh(); }}
                      className="shrink-0 rounded-lg border border-blue-500 px-3 py-1 text-sm font-medium text-blue-600 dark:text-blue-400"
                    >
                      + Bank
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === "history" && (
          <div>
            {history.length === 0 ? (
              <p className="py-12 text-center text-sm text-gray-400">No lookups yet.</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                {history.map((r: LookupRecord) => (
                  <li key={`${r.lang}:${r.word}`} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <span className="font-medium">{r.word}</span>
                      <span className="ml-2 text-xs text-gray-400">{r.lang.toUpperCase()}</span>
                    </div>
                    <span className="text-xs text-gray-400">×{r.count}</span>
                    {!isWordSaved(r.word, r.lang) && (
                      <button
                        type="button"
                        onClick={() => { saveWord({ word: r.word, lang: r.lang }); refresh(); }}
                        className="shrink-0 rounded-lg border border-blue-500 px-2 py-1 text-xs font-medium text-blue-600 dark:text-blue-400"
                      >
                        + Bank
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <ActionSheet
        open={pendingDeleteId !== null}
        title="Remove this word?"
        message="It will also be removed from your review deck."
        actions={[
          {
            label: "Remove",
            destructive: true,
            onSelect: () => {
              if (pendingDeleteId) removeWord(pendingDeleteId);
              refresh();
            },
          },
        ]}
        onClose={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
