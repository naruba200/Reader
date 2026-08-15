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
    for (const token of tokens) {
      const level = this.levelDb.lookup(token.lemma);
      out.push({
        ...token,
        level: level ?? "UNKNOWN",
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
}
