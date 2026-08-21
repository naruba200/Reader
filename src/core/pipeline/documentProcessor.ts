import type {
  AnalyzedToken,
  DictionaryEntry,
  LanguageAdapter,
  SectionAnalysis,
  Token,
} from "../types";
import { computeDifficulty, type DifficultyWeights } from "../analysis/difficulty";
import type { LevelDb } from "../leveldb/LevelDb";
import type { DictionaryStore } from "../dictionary/store";
import type { PageCache } from "./pageCache";
import { md5 } from "../util/md5";

export interface Page {
  id: string;
  text: string;
  /** Optional chapter context used for heatmap grouping. */
  chapterId?: string;
}

export interface AnalyzeOptions {
  /** When true, resolve definitions from the dictionary store into tokens. */
  enrich?: boolean;
  /** Custom weights for difficulty rating. */
  weights?: DifficultyWeights;
  /** Should analysis consult the cache first. Default true. */
  useCache?: boolean;
}

export interface AnalyzeResult {
  pageId: string;
  tokens: AnalyzedToken[];
  analysis: SectionAnalysis;
  fromCache: boolean;
}

/**
 * Two-phase document processor.
 * Phase 1 tokenizes raw text via the language adapter.
 * Phase 2 resolves each token's difficulty level and computes section analysis.
 * Results are cached by content checksum (MD5) so repeat passes are O(cache hit).
 */
export class DocumentProcessor {
  constructor(
    private readonly adapter: LanguageAdapter,
    private readonly levelDb: LevelDb,
    private readonly dictionary?: DictionaryStore,
    private readonly cache?: PageCache,
  ) {}

  /** Look up a dictionary entry for a lemma (lemmatized). */
  async lookupEntry(lemma: string): Promise<DictionaryEntry | undefined> {
    if (!this.dictionary) return undefined;
    return this.dictionary.lookup(lemma);
  }

  async analyzePage(page: Page, options: AnalyzeOptions = {}): Promise<AnalyzeResult> {
    const useCache = options.useCache ?? true;
    const checksum = md5(page.text);

    if (useCache && this.cache) {
      const hit = await this.cache.get(page.id, checksum);
      if (hit) {
        return {
          pageId: page.id,
          tokens: hit.tokens,
          analysis: hit.analysis,
          fromCache: true,
        };
      }
    }

    const tokens = await this.adapter.tokenize(page.text);
    const analyzed = await this.phase2(tokens, options);
    const analysis = computeDifficulty(analyzed, {
      weights: options.weights,
    });

    if (this.cache) {
      await this.cache.set({
        pageId: page.id,
        checksum,
        analyzedAt: Date.now(),
        tokens: analyzed,
        analysis,
      });
    }

    return {
      pageId: page.id,
      tokens: analyzed,
      analysis,
      fromCache: false,
    };
  }

  private async phase2(
    tokens: Token[],
    options: AnalyzeOptions,
  ): Promise<AnalyzedToken[]> {
    const out: AnalyzedToken[] = [];
    const isJapanese = this.adapter.language === "ja";
    for (const token of tokens) {
      const level = this.levelDb.lookup(token.lemma);
      let finalLevel = level ?? "UNKNOWN";
      // Classify UNKNOWN words by frequency heuristics (Japanese only)
      if (finalLevel === "UNKNOWN" && isJapanese) {
        finalLevel = this.classifyFrequency(token);
      }
      out.push({
        ...token,
        level: finalLevel,
      });
    }

    if (options.enrich && this.dictionary) {
      for (const token of out) {
        const entry = await this.dictionary.lookup(token.lemma);
        if (entry) {
          (token as AnalyzedToken & { entry?: unknown }).entry = entry;
        }
      }
    }
    return out;
  }

  private classifyFrequency(token: Token): "FREQ_COMMON" | "FREQ_UNCOMMON" | "FREQ_RARE" {
    const surface = token.surface;
    const len = surface.length;
    // Count kanji characters (CJK unified ideographs)
    const kanjiCount = (surface.match(/[\u4e00-\u9fff]/g) || []).length;
    const kanjiRatio = len > 0 ? kanjiCount / len : 0;
    // Pure kana or very short words are common
    if (len <= 3 && kanjiRatio === 0) return "FREQ_COMMON";
    // Short words with some kanji
    if (len <= 4 && kanjiRatio < 0.5) return "FREQ_COMMON";
    // Medium length or moderate kanji density
    if (len <= 6 && kanjiRatio < 0.7) return "FREQ_UNCOMMON";
    // Long words or high kanji density
    return "FREQ_RARE";
  }
}
