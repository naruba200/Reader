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
- [x] Stroke-order diagrams — done 2026-10-26 via the lazy-download follow-up (see "Post-4.2 fixes" below): one KanjiVG SVG per kanji on demand + IndexedDB cache, nothing bundled, so the APK-size concern no longer applies.
- [x] Dictionary home: word of the day (deterministic day-of-year pick from the JLPT list, with reading + definition preview, tap to open), recent searches (query strings that led to opening a result, tap to re-run), recently looked-up words (existed, kept).
- [x] Word extras: examples now render as Japanese/English pairs (the JMDict pack carries `examples: [JP, EN, …]` — verified against the pack; WordNet single-sentence examples render unpaired), similar words (words sharing the first kanji / same prefix, capped at 6), conjugation table (`src/core/language/conjugation.ts`, tested in `conjugation.test.ts`: ichidan, godan incl. 行く/ある irregulars, suru, kuru, i-/na-adjectives), copy word (clipboard with textarea fallback) + share (only rendered when `navigator.share` exists).
- [x] Search filters: JLPT level (Japanese only, membership in the TSV word list) and part of speech (noun/verb/adjective/adverb/expression; matches both JMDict codes like `v1`/`adj-na` and WordNet words like `noun`; per-result lookups with a "Filtering…" state). Filters apply to the shown result set (search itself is capped at 50).
- [ ] Conjugation table coverage gap: entries without a pos code and without an unambiguous ending get no table — る-ending verbs are ambiguous (ichidan vs godan-る) and guessing wrong teaches the wrong form. Forward rules are used instead of inverting `deinflectJapanese` (it maps conjugated → lemma candidates without labeling forms, so inversion is ambiguous).
- [x] Underline fix (held from the same batch, unpushed until now): token spans in `src/reader/spans.ts` cover only the token's own text; gaps are raw unstyled runs. Regression test `src/reader/spans.test.ts` (2 tests) kept passing throughout. Follow-up 2026-10-26 (see "Post-4.2 fixes" below): adjacent same-level underlines still fused visually — fixed with a 2px gap on underlined token spans.

## Post-4.2 fixes — 2026-10-26 (user-reported bugs + requested features)

All six items below are implemented in this tree (unpushed — parent handles pushing). Nothing here was verified on a physical device; on-device checks (speaker voice, kanji page taps, notification delivery) belong to the user.

- [x] Underline actually fixed (follow-up to the 4.2 fix): the 4.2 `spans.ts` fix was correct, but Japanese has no spaces between words, so adjacent same-level tokens' underlines touched at the boundary and rendered as one continuous line — visually identical to the old bug. Fix: a 2px inline-end gap on underlined token spans (`.token-underline-gap` in `src/index.css`, applied in `src/reader/ChapterView.tsx`; in vertical-rl the gap reads as a vertical notch in the side line). Regression tests in `src/reader/ChapterView.test.ts` (same-level tokens get separate spans with the gap class; particles get none).
- [x] Theme cards distinct in light / sepia / warm: the 4.2 card values were all near-black muted tones (`#23272f` / `#4a4136` / `#4a3f28`) — different hexes, perceptually identical dark cards on a phone screen — and light had no explicit rule. New values separated by hue at a middle lightness, each still darker than its own page background with WCAG-checked readable text: light `#4b5563` slate (text 6.9:1, muted 5.1:1), sepia `#6b5b45` brown (5.8:1, 4.2:1), warm `#7a5a1e` gold (6.0:1, 4.3:1), plus an explicit `:root[data-theme="light"]` rule. Dark / dark-warm / AMOLED cards unchanged (not reported).
- [x] Speaker gibberish fixed: the word page derived the TTS language from the word's JLPT level, so a Japanese word with no level was spoken by an English voice. Language now comes from the word's text (`languageForText` in `src/core/tts/index.ts`: Japanese characters → `ja`, else level as fallback); voices are waited for up to 2s (async native-voice loading) and a voice is only ever used when it speaks that language; when no Japanese voice is installed the user gets a clear install hint instead of gibberish. The native engine no longer guesses `ja-JP` when no voice matches — it throws so the fallback chain can try the next engine. The same language-aware matching was applied to the reader's sentence loop (a voice saved for another language can no longer speak this book). How the user changes the voice: long-press (550ms) the read-aloud button in the reader chrome (right-click on desktop) — the selector already shows each voice's name and language.
- [x] Tappable kanji (`src/reader/KanjiSection.tsx`): each kanji card opens an action sheet with Open kanji page / Copy kanji / Show radical. Copy uses clipboard + textarea fallback with a transient "Copied ✓". Show radical toggles an inline row (radical character + meaning + "Radical N of 214 · M strokes"). Radical data is NOT from the KANJIDIC2 pack — the pack has no radical field (verified against the live pack). It comes from a bundled 214-radical Kangxi table + per-kanji mapping derived from the Unicode Unihan database (`kRSUnicode`, `src/core/kanji/radicals.ts`, Unicode License; 28,056 BMP kanji). No radical data is faked: kanji outside the map show an honest "not available" note.
- [x] Kanji page (`src/reader/KanjiDetailPage.tsx`): dedicated detail view for one kanji — big kanji, ON, KUN, meanings, grade, strokes, radical, animated stroke-order diagram, example words containing it (dictionary search, capped at 6, tap to open the word). Reached from the kanji card's action sheet; header back, Android back, and its own Back button all return to the word page. Wired in `src/app/DictionaryPage.tsx` (kanjiDetail state sits above the entry detail in the back stack).
- [x] Stroke-order diagrams (`src/core/kanji/strokeOrder.ts`, `src/reader/StrokeOrderDiagram.tsx`): lazy-download one KanjiVG SVG per kanji on demand + IndexedDB cache — nothing bundled, so the earlier APK-size concern no longer applies. Animated stroke-by-stroke on the kanji page (staggered dashoffset animation, Replay button, stroke count) and a compact static diagram on each kanji card (silent when offline/undownloaded). Offline with no cached copy shows a "needs connection" state with Retry, never a broken image. KanjiVG attribution (CC BY-SA 3.0) on the kanji page footer and in Settings → About (which also credits JMdict/KANJIDIC2 and Unihan).
- [x] Daily word-of-the-day notification (`src/core/notifications/dailyWord.ts`): new dependency `@capacitor/local-notifications` 8.3.1 — the user must run `npm install` and `npx cap sync android` when building, since a new native plugin is involved, and `package.json` + `package-lock.json` must be pushed together. Settings → Notifications toggle with proper Android 13+ permission request; denial turns the toggle off with an explanation (Android Settings → Apps → Smart Reader → Notifications). The next 30 days are scheduled individually at 9:00 AM local (a repeating notification can't change its word daily) and refreshed on every app launch; the word is the exact same deterministic pick as the dictionary home (`src/core/wordOfDay.ts`, extracted from DictionaryPage without changing the pick, including its day-count shape). Tapping a notification opens the word's dictionary entry via the App-level tap listener. Not verifiable on-device from the sandbox.

## English-meaning search + JLPT data restoration — 2026-10-26 (user requests; unpushed — parent handles pushing)

- [x] English-meaning search in the dictionary (`src/core/dictionary/glossIndex.ts`, wired in `src/app/DictionaryPage.tsx`): typing English in the Japanese dictionary's search bar now returns the corresponding Japanese words. Approach: a lazy in-memory gloss index built from the snapshot entries on first English search (no new IndexedDB schema or storage; invalidated wherever the word index is). Definitions are split into gloss phrases on ";" (JMdict convention; commas are NOT split — they occur inside single glosses). Ranking is strict: exact gloss phrase > gloss-phrase prefix > whole-word token match (all query words must appear as whole words, so "to eat" does not match "to sleep") > substring fallback (only fills remaining slots, so "an" cannot flood results with "another"/"animal"/"plan"). Japanese word/reading search is untouched — for a Latin-script query the two result sets are merged, Japanese first, deduplicated by word, capped at 50 (`mergeSearchResults`). A query counts as Latin-script only if it has a Latin letter and no Japanese characters, so romaji keeps working through the normal path and mixed queries stay Japanese-only. Tapping a meaning result opens the same word entry detail (with readings, examples, kanji section). Search placeholder for the Japanese tab now reads "Search Japanese or English meanings…". Works on the bundled overlay too (its JLPT sample entries carry English glosses), so English search functions even before JMdict is downloaded. Tests in `src/core/dictionary/glossIndex.test.ts` (12 tests: phrase splitting, English→Japanese results with readings, case-insensitivity, exact>prefix>token>substring order, multi-word AND semantics, non-matching returns empty, limit, dedup, Latin-query gating, merge order).
- [x] JLPT data restored — this was a real latent bug: the browsable JLPT section (level cards → paginated word list → entry detail) already existed, but its data file `jlpt.ja.tsv` lived only in the committed `dist/` copy, NOT in `public/dict/` — and `vite build` empties `dist/`, so every fresh local build silently deleted it, leaving word-of-the-day, JLPT cards, JLPT filters, and the daily notification with an empty list. Fix: the file is now restored to `public/dict/jlpt.ja.tsv` (byte-identical to the tracked `dist/` copy), and a fresh build was verified to copy it to `dist/dict/jlpt.ja.tsv`. Source: the OpenJLPT wordlist (header in the file); no license statement is carried in the file itself, so no license is claimed here.
- [x] JLPT home cards now show per-level word counts (from the cached TSV; "Need JMDict" hint unchanged when the pack is missing). Example sentences were already wired: tapping any JLPT list word that resolves to a JMdict entry opens the full entry detail, which renders its JP/EN example pairs — no new code needed for that part.
- Honest coverage (OpenJLPT TSV, counted from the file): N5 1,157 · N4 1,123 · N3 3,243 · N2 3,243 · N1 6,467 — 15,233 rows, 14,003 unique words (levels overlap: a word can appear at several levels; the lists are per-level membership, not a partition). Fallback if the TSV ever fails to load: the bundled 318-word sample (N5 142, N4 173, N3/N2/N1 1 each — effectively N5+N4 only). NOT covered from open data: what fraction of TSV words resolve to JMdict entries (cannot be measured here — the pack is not installed in this environment; words without an entry still list, as bare rows with no definition, exactly as before), textbook lesson structures (deliberately not copied — see the JPro note), and audio (no open source available here). Nothing is faked or padded: thin levels are reported as thin.
