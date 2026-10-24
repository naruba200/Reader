import { useEffect, useState } from "react";
import { getDictionaryStore } from "../core/dictionary";
import { dictionaryManager, packKey } from "../core/dictionary/downloadManager";
import type { DictionaryEntry } from "../core/types";

/**
 * Takoboto-style kanji breakdown for a Japanese word, sourced from the
 * KANJIDIC2 pack the app already bundles — nothing is imported from
 * Takoboto itself (it is built from the same public sources: JMdict +
 * KANJIDIC2 + KanjiVG).
 *
 * The pack format carries only: meanings, readings (ON in katakana, KUN in
 * hiragana with "." okurigana dots and "-" affix markers), grade and
 * stroke count. JLPT level, SKIP code and frequency are NOT in the pack,
 * so they are omitted rather than faked — getting them needs pack
 * regeneration from kanjidic2.xml (which does carry those fields).
 * Stroke-order diagrams are a follow-up (see ROADMAP.md): KanjiVG would
 * be the dataset, but it is not bundled yet.
 */

interface KanjiInfo {
  char: string;
  on: string[];
  kun: string[];
  meanings: string;
  grade?: string;
  strokes?: string;
}

// CJK Unified Ideographs + Extension A + Compatibility Ideographs.
const KANJI_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF]/g;
const KATAKANA_RE = /^[\u30A0-\u30FF]+$/;

function extractKanji(word: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of word.matchAll(KANJI_RE)) {
    if (!seen.has(m[0])) {
      seen.add(m[0]);
      out.push(m[0]);
    }
  }
  return out;
}

function parseKanjiEntry(
  char: string,
  entry: Pick<DictionaryEntry, "readings" | "definition">,
): KanjiInfo {
  const on: string[] = [];
  const kun: string[] = [];
  for (const r of entry.readings ?? []) {
    // ON readings are pure katakana; KUN are hiragana (with "." and "-"
    // markers, kept as-is — they mark okurigana boundaries and affixes).
    if (KATAKANA_RE.test(r)) on.push(r);
    else kun.push(r);
  }
  const lines = entry.definition.split("\n");
  const meanings = lines[0] ?? "";
  const meta = lines.slice(1).join(" ");
  const grade = /Grade (\d+)/.exec(meta)?.[1];
  const strokes = /(\d+) strokes/.exec(meta)?.[1];
  return { char, on, kun, meanings, grade, strokes };
}

/** Kanji cards for the kanji in `word`. Renders nothing when there is no kanji. */
export function KanjiSection({ word }: { word: string }) {
  const chars = extractKanji(word);
  const [infos, setInfos] = useState<KanjiInfo[] | null>(null);
  const [kanjidicInstalled, setKanjidicInstalled] = useState(true);

  useEffect(() => {
    const check = () => {
      const state = dictionaryManager.getState();
      const key = packKey({ language: "ja", source: "KANJIDIC2", version: "", fileName: "", estimatedBytes: 0 });
      setKanjidicInstalled(!!state.infos[key]);
    };
    check();
    const unsub = dictionaryManager.subscribe(() => check());
    return unsub;
  }, []);

  useEffect(() => {
    if (chars.length === 0) {
      setInfos(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      const store = getDictionaryStore("ja");
      const found: KanjiInfo[] = [];
      for (const ch of chars) {
        // Source-pinned: plain lookup would return the JMDict word entry
        // for the kanji (JMDict outranks KANJIDIC2), not the kanji data.
        const entry = await store.lookup(ch, "KANJIDIC2");
        if (entry) found.push(parseKanjiEntry(ch, entry));
      }
      if (!cancelled) setInfos(found);
    })();
    return () => {
      cancelled = true;
    };
    // chars derives from word; re-run only when the word changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word]);

  if (chars.length === 0 || infos === null) return null;
  if (infos.length === 0) {
    if (!kanjidicInstalled) {
      return (
        <p className="mt-4 text-xs text-gray-400">
          Kanji details need the KANJIDIC2 pack — download it in the Downloads tab.
        </p>
      );
    }
    return null;
  }

  return (
    <div className="mt-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
        Kanji
      </h3>
      <div className="space-y-2">
        {infos.map((info) => (
          <div key={info.char} className="theme-card flex gap-3 rounded-2xl border p-3 shadow-sm">
            <div className="w-12 shrink-0 text-center text-4xl font-bold leading-none">
              {info.char}
            </div>
            <div className="min-w-0 flex-1">
              {info.on.length > 0 && (
                <p className="text-sm leading-snug">
                  <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wider theme-card-muted">
                    ON
                  </span>
                  {info.on.join("、")}
                </p>
              )}
              {info.kun.length > 0 && (
                <p className="mt-0.5 text-sm leading-snug">
                  <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-wider theme-card-muted">
                    KUN
                  </span>
                  {info.kun.join("、")}
                </p>
              )}
              {info.meanings && (
                <p className="mt-1 text-sm leading-snug">{info.meanings}</p>
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
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
