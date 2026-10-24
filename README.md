# NoweRead — Smart Reader

A Japanese learner's ebook reader: read EPUB, PDF, TXT, and Markdown books
with tap-to-lookup dictionary cards, JLPT-level word highlighting, read-aloud,
and a study loop (word bank, SRS flashcards, Anki export) built in.

Android app name: **NoweRead** (`com.smartreader.app`). The web build runs
as a normal Vite SPA; the Android shell is Capacitor.

## Features

- **Library** — import EPUB / PDF / TXT / MD, grid or list view, sorting,
  covers, reading progress, tags, reading status, star ratings, full
  backup/restore to a single JSON file.
- **Reader** — paginated or continuous-scroll reading, vertical Japanese
  layout, per-book font size / typeface / line height / margins, themes
  (Light, Dark, Sepia, Warm, Dark Warm, AMOLED true black), in-app
  brightness, keep-awake, haptics, immersive fullscreen while reading.
- **Dictionary** — offline-first JMdict-based Japanese–English dictionary
  with downloadable packs, kanjidic2 kanji data, JLPT N1–N5 vocab,
  WordNet, and robust deinflection (tap a conjugated verb, get the
  dictionary form).
- **Word lookup** — tap any word in a book for a dictionary card with
  readings, definitions, pitch info, and grammar notes; furigana toggle
  (readings from the kuromoji tokenizer); JLPT-level underlines.
- **Study loop** — save words with their sentence context, review with
  built-in SM-2 flashcards, export to Anki (TSV), lookup history,
  auto-collected difficult words, reading-time stats with daily goals.
- **Read-aloud** — native device TTS on Android (with browser fallback),
  sentence highlighting, background playback with lock-screen and
  headset controls, sleep timer, per-book speech rate.
- **Grammar** — pattern detection with plain-English explanations
  (tap a grammar highlight to learn why).

## Run it

```bash
npm install
npm run dev        # web dev server (Vite)
npm run build      # typecheck + production build -> dist/
npm test           # vitest
```

## Build the Android APK

```bash
npm install
npm run build
npx cap sync android
```

Then open `android/` in Android Studio and build the APK (or App Bundle).
The sandbox/CI cannot build it: Gradle dependency downloads need network
access that the assistant environment blocks.

## Dictionary data

Dictionary packs are generated from public sources with the scripts in
`scripts/` (`npm run dict:*`): JMdict (via the Yomitan pipeline), JLPT
vocab lists, kanjidic2, and WordNet. Generated packs live in `packs/` /
`dist-packs/`. See `ROADMAP.md` for the product roadmap and planned work.

## Tech

React 19 + Vite + TypeScript + Tailwind CSS 4, Capacitor 8 (Android),
kuromoji tokenizer, IndexedDB/LevelDB dictionary index.

## Status

Alpha, under active development. See the
[releases](https://github.com/naruba200/Reader/releases) for APK builds
and changelogs.
