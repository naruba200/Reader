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
- [ ] Repo hygiene: gitignore `node_modules/`, `dist/`, test novels; APKs via GitHub Releases

## Phase 1 — Reader comfort

- [x] Reading settings panel: font size, typeface (Default/Serif/Sans/Mincho JP), line height, margins — per book (`src/reader/ReadingSettingsPanel.tsx`, `src/reader/readingSettings.ts`)
- [x] Themes: day / night / sepia / warm / true-black AMOLED (AMOLED forces dark + pure black chrome); auto-switch at sunset — not built
- [x] In-app brightness slider (dim overlay)
- [x] Page-turn gestures: edge tap zones, swipe (existed); volume-key paging skipped — Android intercepts volume keys before they reach the WebView, no web API available
- [ ] Scroll mode as alternative to paginated mode
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
- [ ] Grammar pattern detection with plain-language explanations — not built (`ChapterView` already accepts `grammarMatches` if a detector is added later)
- [ ] Sentence-aligned parallel translation view for hard passages — skipped: no translation data source / would need a backend
- [ ] Clipboard-monitor lookup (copy a word anywhere → floating definition) — not built: needs a native overlay service

## Phase 4 — Library & dictionary depth

- [x] Collections via tags, reading-status shelves (Want to read / Reading / Finished filter chips; opening a book auto-marks it Reading), star ratings — long-press a book (or ⋯) for the details sheet (`src/app/BookSheet.tsx`)
- [x] Reading status (want to read / reading / finished) + star ratings
- [ ] Full metadata editing (title/author) — tags, status and stars are editable; duplicate-import detection already existed
- [ ] Share-sheet import; "Open with" intent filters; OPDS catalog support — skipped: native Android work (intent filters, manifest), can't be done in the web layer
- [x] Storage manager: per-book sizes in the book details sheet; library/word-bank counts + backup in Settings — no "clear cache" (dictionary packs are managed in Downloads)
- [x] Full backup/restore to a single JSON file (metadata + progress + settings + word bank + lookup history; book files must be re-imported)
- [ ] Offline dictionary packs: pause/resume, Wi-Fi-only downloads
- [ ] Multiple dictionaries with priority ordering; robust deinflection

## Phase 5 — Platform & polish

- [ ] Home-screen "continue reading" widget; launcher app shortcuts — skipped: native Android work (widget provider, manifest), can't be done in the web layer
- [ ] Reading reminders; daily goal notifications — skipped: needs native notification scheduling
- [x] Android back / predictive-back per screen (existed for reader/dictionary/downloads; extended to settings/study tabs)
- [ ] Follow system dark mode; system font-size scaling; TalkBack labels — not built
- [x] Reading stats: time read (`src/study/stats.ts` — total, per-day, per-book, day streak), daily goal with progress bar in Settings
- [ ] Optional progress/bookmark/word-bank sync across devices — not built; manual JSON backup/restore covers the offline case

## Non-goals

- Social features, stores, accounts-as-requirement. Sync stays optional and
  file-based unless there's a real reason for a backend.
- Desktop UI parity. Mobile-first means some desktop conveniences don't come back.
