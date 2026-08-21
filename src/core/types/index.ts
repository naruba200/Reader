export type LanguageCode = "en" | "de" | "fr" | "ja" | "zh";

export type LevelScheme = "CEFR" | "JLPT" | "HSK";

export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type JlptLevel = "N5" | "N4" | "N3" | "N2" | "N1";
export type HskLevel = "HSK1" | "HSK2" | "HSK3" | "HSK4" | "HSK5" | "HSK6";

export type Level = CefrLevel | JlptLevel | HskLevel | "UNKNOWN" | "FREQ_COMMON" | "FREQ_UNCOMMON" | "FREQ_RARE";

export const UNKNOWN_LEVEL: Level = "UNKNOWN";

export interface Token {
  surface: string;
  lemma: string;
  pos?: string;
  start: number;
  length: number;
  /** Fine-grained POS sub-classifications from Kuromoji (pos_detail_1/2/3). */
  posDetail?: string[];
  /** Conjugation type (e.g. 五段・カ行) from Kuromoji. */
  conjugatedType?: string;
  /** Conjugation form (e.g. 連用形, 仮定形) from Kuromoji. */
  conjugatedForm?: string;
  /** Kana reading from Kuromoji. */
  reading?: string;
}

export interface AnalyzedToken extends Token {
  level: Level;
}

export interface SectionAnalysis {
  sectionId: string;
  totalWords: number;
  unknownWords: number;
  levelCounts: Partial<Record<Level, number>>;
  hardRatio: number;
  coverage: number;
  rating: DifficultyRating;
}

export type DifficultyRating = "Very Easy" | "Easy" | "Moderate" | "Hard" | "Very Hard";

export type BookFormat = "epub" | "pdf" | "fb2" | "mobi";

/** Half-open `[start, end)` range into a text string. */
export interface ParagraphRange {
  start: number;
  end: number;
}

/** A run of plain text in a chapter. `start`/`end` are offsets into `BookChapter.text`. */
export interface TextBlock {
  kind: "text";
  start: number;
  end: number;
}

/** An image placed in the flow. `src` is a self-contained data URL for EPUBs. */
export interface ImageBlock {
  kind: "image";
  src: string;
  alt?: string;
}

/** Ordered content blocks of a chapter: text runs and images. */
export type ChapterBlock = TextBlock | ImageBlock;

export interface BookChapter {
  id: string;
  title: string;
  html: string;
  text: string;
  /** Ordered content blocks. When present the reader renders blocks instead of plain paragraphs. */
  blocks?: ChapterBlock[];
}

export interface BookDocument {
  id: string;
  title: string;
  language: LanguageCode;
  format: BookFormat;
  chapters: BookChapter[];
  author?: string;
  description?: string;
  coverUrl?: string;
  publisher?: string;
  date?: string;
}

export interface DictionaryEntry {
  word: string;
  readings?: string[];
  ipa?: string;
  pos?: string;
  definition: string;
  examples?: string[];
  audio?: string;
  source?: string;
}

export interface LanguageAdapter {
  readonly language: LanguageCode;
  readonly scheme: LevelScheme;
  tokenize(text: string): Promise<Token[]>;
  lemmatize(surface: string, pos?: string): string;
  levels(): readonly Level[];
}
