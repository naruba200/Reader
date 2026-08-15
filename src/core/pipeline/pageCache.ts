import type { AnalyzedToken, SectionAnalysis } from "../types";

/** Fully serializable result of analyzing one page. */
export interface CachedPageResult {
  pageId: string;
  checksum: string;
  analyzedAt: number;
  tokens: AnalyzedToken[];
  analysis: SectionAnalysis;
}

/** Cache for per-page analysis results, keyed by page id + content checksum (MD5). */
export interface PageCache {
  get(pageId: string, checksum: string): Promise<CachedPageResult | undefined>;
  set(result: CachedPageResult): Promise<void>;
  delete(pageId: string): Promise<void>;
  clear(): Promise<void>;
}

/** In-memory PageCache. Useful for tests and non-persistent sessions. */
export class MemoryPageCache implements PageCache {
  private readonly map = new Map<string, CachedPageResult>();

  async get(pageId: string, checksum: string): Promise<CachedPageResult | undefined> {
    const entry = this.map.get(pageId);
    if (entry === undefined) return undefined;
    if (entry.checksum !== checksum) return undefined;
    return entry;
  }

  async set(result: CachedPageResult): Promise<void> {
    this.map.set(result.pageId, result);
  }

  async delete(pageId: string): Promise<void> {
    this.map.delete(pageId);
  }

  async clear(): Promise<void> {
    this.map.clear();
  }
}
