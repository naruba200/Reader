# Smart Reader — Product Roadmap

A Japanese-learner's ebook reader ("NoweRead" on Android). This document is the
full product vision: every feature worth building, and what needs to change to
be truly mobile-first. Phased so each step ships something usable.

## Identity

Not just another ebook reader. The moat is the **study loop**: read Japanese
books, tap words for instant dictionary + grammar, save words with sentence
context, review with SRS, export to Anki. Every feature below should serve
reading first, studying second, everything else third.

## Phase 0 — Mobile shell (foundation)

- [x] TTS engine fixes (native default on Android, watchdog, fallback, mobile voice selector)
- [x] Bottom tab bar: Library / Dictionary / Study / Downloads / Settings (replaces desktop header)
- [x] Safe-area insets + `viewport-fit=cover` edge-to-edge on Android 15+
- [x] Bottom-sheet action sheets instead of `confirm()` dialogs
- [x] Immersive reader: auto-hiding chrome, tap to toggle (existed, kept)
- [ ] Adaptive icon + splash screen
- [x] Repo hygiene: `.gitignore` added (`node_modules/`, `dist/`, test novels, APKs). Note: already-tracked files need one `git rm -r --cached` in a full local clone to actually untrack; APKs ship via GitHub Releases (manual web-UI step — the GitHub App can't create releases)

## Phase 1 — Reader comfort

- [x] Reading settings panel: font size, typeface (Default/Serif/Sans/Mincho JP), line height, margins — per book (`src/reader/ReadingSettingsPanel.tsx`, `src/reader/readingSettings.ts`)
- [x] Themes: day / night / sepia / warm / true-black AMOLED (AMOLED forces dark + pure black chrome); auto-switch at sunset — not built
- [x] In-app brightness slider (dim overlay)
- [x] Page-turn gestures: edge tap zones, swipe (existed); volume-key paging skipped — Android intercepts volume keys before they reach the WebView, no web API available
- [x] Scroll mode as alternative to paginated mode (per-book "View mode" setting in the reading panel; renders the full chapter with scroll-fraction progress tracking)
- [x] Keep-awake toggle while reading (Wake Lock API)
- [x] Haptics on page turn and word lookup (`navigator.vibrate`, guarded)

## Phase 2 — Read-aloud done right

- [x] Sentence-highlight karaoke during TTS (existed: `ttsSentenceIndex` → highlighted sentence in `ChapterView`)
- [x] Background playback with notification controls; headset button handling (`navigator.mediaSession` metadata + play/pause/prev/next handlers)
- [x] Sleep timer (5/10/15/30/60 min, badge on the TTS button while active)
- [x] Per-book voice/speed memory (speech rate saved per book; engine/voice choice stays global)

## Phase 3 — The study loop

- [x] Word bank: save words from the dictionary sheet with sentence context (`src/study/wordBank.ts`; "+ Bank" in `EntryCard`/popover/dictionary page; Study tab)
- [x] In-app SRS flashcards (SM-2, `src/study/srs.ts`); one-tap Anki TSV export with sentence context — audio not included (no pronunciation audio source available)
- [x] Auto-collected "difficult words" (looked up 2+ times); lookup history (`src/study/history.ts`, recorded on reader taps + dictionary searches)
- [x] Furigana toggle (ruby readings from the kuromoji tokenizer, Japanese books only) — per-JLPT-level filtering not built
- [ ] Pitch-accent display on dictionary entries — skipped: no pitch-accent data source in the repo
- [x] Words color-coded by JLPT level (existed); per-book difficulty analysis (existed: rating badge)
- [x] Grammar pattern detection with plain-language explanations (39 patterns via kuromoji, `src/core/language/grammar.ts`; highlights in the reader + tap for explanation)
- [ ] Sentence-aligned parallel translation view for hard passages — skipped: no translation data source / would need a backend
- [ ] Clipboard-monitor lookup (copy a word anywhere → floating definition) — not built: needs a native overlay service

## Phase 4 — Library & dictionary depth

- [x] Collections via tags, reading-status shelves (Want to read / Reading / Finished filter chips; opening a book auto-marks it Reading), star ratings — long-press a book (or ⋯) for the details sheet (`src/app/BookSheet.tsx`)
- [x] Reading status (want to read / reading / finished) + star ratings
- [x] Full metadata editing (title/author) — editable in the book details sheet; tags, status and stars were already editable
- [ ] Share-sheet import; "Open with" intent filters; OPDS catalog support — skipped: native Android work (intent filters, manifest), can't be done in the web layer
- [x] Storage manager: per-book sizes in the book details sheet; library/word-bank counts + backup in Settings — no "clear cache" (dictionary packs are managed in Downloads)
- [x] Full backup/restore to a single JSON file (metadata + progress + settings + word bank + lookup history; book files must be re-imported)
- [x] Offline dictionary packs: pause/resume (Range-request resume, byte-exact so no duplicate entries), Wi-Fi-only downloads setting
- [x] Multiple dictionaries with priority ordering (reorder installed packs in Downloads); robust deinflection (causative, ちゃう/じゃう/とく/てる contractions, ば/たら/なきゃ, godan potential/volitional/imperative)

## Phase 5 — Platform & polish

- [ ] Home-screen "continue reading" widget; launcher app shortcuts — skipped: native Android work (widget provider, manifest), can't be done in the web layer
- [ ] Reading reminders; daily goal notifications — skipped: needs native notification scheduling
- [x] Android back / predictive-back per screen (existed for reader/dictionary/downloads; extended to settings/study tabs)
- [x] Follow system dark mode (Auto theme option with live switching); system font-size scaling (opt-in, measured from the system 1rem); TalkBack labels on icon-only buttons
- [x] Reading stats: time read (`src/study/stats.ts` — total, per-day, per-book, day streak), daily goal with progress bar in Settings
- [ ] Optional progress/bookmark/word-bank sync across devices — not built; manual JSON backup/restore covers the offline case

## Non-goals

- Social features, stores, accounts-as-requirement. Sync stays optional and
  file-based unless there's a real reason for a backend.
- Desktop UI parity. Mobile-first means some desktop conveniences don't come back.

## Follow-up batch — 2026-10-24 (theme cards, word page, kanji, dictionary home)

User-reported issues (cards ignoring Sepia/Warm/AMOLED, content hidden behind
the status bar, flat word pages, silent speaker) plus the kanji section and
dictionary-home extras, shipped ahead of a new release. Reader immersive
behavior was confirmed fine and left untouched.

- [x] Theme-aware cards: per-theme CSS variables (`--card-bg` / `--card-text` / `--card-muted` / `--card-border` / `--card-chip-bg` in `src/index.css`) — every theme gets a card darker than its page background with lighter text; `.theme-card`, `.theme-card-muted`, `.theme-chip`, `.theme-divider`, `.theme-hover` utilities applied to book cards, dictionary cards, word cards, settings sections, bottom sheets (BookSheet, ReadingSettingsPanel, ActionSheet), bottom nav, popover, toasts, and reader chrome popups (voice selector, chapter overlay). Contrast checked per theme (light ~13:1, dark ~17:1, sepia ~12:1, warm ~12:1, dark-warm ~15:1, AMOLED ~18:1; AMOLED page is already pure black so its card is near-black with a visible border). Reader reading area itself NOT converted (its own filter-based themes).
- [x] Status bar visible on every non-reader screen: `pt-safe` added to Dictionary/Downloads headers and Settings main; App-level effect re-shows the status bar on Android whenever the view is not the reader (Reader's own show/hide on unmount kept as-is).
- [x] Word meaning page redesign (`src/reader/EntryCard.tsx`, `src/app/DictionaryPage.tsx`): bigger word, small muted section labels (Meaning / Examples), tighter result/list rows and home spacing; dark palette and muted colors kept.
- [x] Speaker fix: EntryCard no longer uses raw browser `speechSynthesis` (silent on Android WebView) — it now speaks through the app TTS engine with the active-then-others fallback chain, a voice matched to the word's language, and the saved rate. Failures surface as a toast on the dictionary page (inline error text in the popover, which has no toast host).
- [x] Dead book icon removed: the 📖 "read definition aloud" button is gone; exactly two actions remain (speaker + bank). No meatball menu (explicitly withdrawn by the user).
- [x] Kanji section (`src/reader/KanjiSection.tsx`): one Takoboto-style card per kanji in the word — big kanji, ON, KUN (markers kept: "." okurigana dots, "-" affixes), meanings, "Grade X · N strokes" meta line. Uses the bundled KANJIDIC2 pack via a new source-pinned `store.lookup(word, "KANJIDIC2")` (`src/core/dictionary/store.ts`, `persistentStore.ts`) — plain lookup would return the JMDict word entry instead, since JMDict outranks KANJIDIC2. Shows a "download KANJIDIC2 in Downloads" hint when the pack is missing.
- [ ] Kanji section meta fields JLPT / SKIP / frequency — skipped, not faked: the KANJIDIC2 pack format carries only meanings, readings, grade and strokes. Getting them needs pack regeneration from kanjidic2.xml (which does carry jlpt/skip/freq).
- [ ] Stroke-order diagrams — skipped for now (see below). KanjiVG is CC BY-SA 3.0 (attribution + share-alike) and covers 12,000+ characters, but the full set is ~22 MB as a wheel (~6.5 MB compressed) — bundling it would roughly double the APK. Recommended follow-up: lazy-download one small SVG per kanji on demand and cache it in IndexedDB, following the existing pack-download pattern.
- [x] Dictionary home: word of the day (deterministic day-of-year pick from the JLPT list, with reading + definition preview, tap to open), recent searches (query strings that led to opening a result, tap to re-run), recently looked-up words (existed, kept).
- [x] Word extras: examples now render as Japanese/English pairs (the JMDict pack carries `examples: [JP, EN, …]` — verified against the pack; WordNet single-sentence examples render unpaired), similar words (words sharing the first kanji / same prefix, capped at 6), conjugation table (`src/core/language/conjugation.ts`, tested in `conjugation.test.ts`: ichidan, godan incl. 行く/ある irregulars, suru, kuru, i-/na-adjectives), copy word (clipboard with textarea fallback) + share (only rendered when `navigator.share` exists).
- [x] Search filters: JLPT level (Japanese only, membership in the TSV word list) and part of speech (noun/verb/adjective/adverb/expression; matches both JMDict codes like `v1`/`adj-na` and WordNet words like `noun`; per-result lookups with a "Filtering…" state). Filters apply to the shown result set (search itself is capped at 50).
- [ ] Conjugation table coverage gap: entries without a pos code and without an unambiguous ending get no table — る-ending verbs are ambiguous (ichidan vs godan-る) and guessing wrong teaches the wrong form. Forward rules are used instead of inverting `deinflectJapanese` (it maps conjugated → lemma candidates without labeling forms, so inversion is ambiguous).
- [x] Underline fix (held from the same batch, unpushed until now): token spans in `src/reader/spans.ts` cover only the token's own text; gaps are raw unstyled runs. Regression test `src/reader/spans.test.ts` (2 tests) kept passing throughout.
