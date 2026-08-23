import type { WordIndexRecord } from "./pack";

/**
 * A sorted array of WordIndexRecord[] with binary search for fast lookup.
 * Records must be sorted by key (lexicographic) before construction.
 *
 * Search complexity:
 *  - Exact match: O(log n)
 *  - Prefix match: O(log n + k) where k = number of prefix matches
 *  - Substring match: O(n) as fallback
 */
export class SortedSearchIndex {
  private records: WordIndexRecord[] = [];

  constructor(records?: WordIndexRecord[]) {
    if (records) this.records = records;
  }

  get size(): number {
    return this.records.length;
  }

  /** Return a copy of the underlying sorted records array. */
  toArray(): WordIndexRecord[] {
    return this.records;
  }

  /** Replace the entire index (e.g. after worker completes). */
  replace(records: WordIndexRecord[]): void {
    this.records = records;
  }

  /**
   * Binary search for the first record whose key >= target.
   * Returns the index, or `records.length` if not found.
   */
  private lowerBound(target: string): number {
    let lo = 0;
    let hi = this.records.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.records[mid].key < target) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

  /**
   * Binary search for the first record whose key > target.
   * Returns the index, or `records.length` if not found.
   */
  private upperBound(target: string): number {
    let lo = 0;
    let hi = this.records.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.records[mid].key <= target) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

  /**
   * Search the index with priority ranking:
   * 1. Exact match (O(log n))
   * 2. Prefix match (O(log n + k))
   * 3. Substring fallback (O(n))
   *
   * Results are deduplicated by word and limited to `limit`.
   */
  search(query: string, langPrefix: string, limit = 50): WordIndexRecord[] {
    const q = `${langPrefix}:${query}`;
    const langLen = langPrefix.length + 1; // +1 for the ":"

    const seen = new Set<string>();
    const exact: WordIndexRecord[] = [];
    const prefix: WordIndexRecord[] = [];
    const substring: WordIndexRecord[] = [];

    const push = (arr: WordIndexRecord[], rec: WordIndexRecord) => {
      if (seen.has(rec.word)) return;
      seen.add(rec.word);
      arr.push(rec);
    };

    // 1. Exact match via binary search
    const exactIdx = this.lowerBound(q);
    if (exactIdx < this.records.length && this.records[exactIdx].key === q) {
      push(exact, this.records[exactIdx]);
    }

    // 2. Prefix match via binary search
    const prefixStart = this.lowerBound(q);
    const prefixEnd = this.upperBound(q + "\uffff");
    for (let i = prefixStart; i < prefixEnd && prefix.length < limit; i++) {
      const key = this.records[i].key.slice(langLen);
      if (key.startsWith(query)) {
        push(prefix, this.records[i]);
      }
    }

    // 3. Substring fallback — only if prefix didn't fill the limit
    if (prefix.length < limit) {
      const subLimit = limit - prefix.length;
      // Scan entire array for substring matches
      for (let i = 0; i < this.records.length && substring.length < subLimit; i++) {
        const key = this.records[i].key.slice(langLen);
        if (key.includes(query)) {
          push(substring, this.records[i]);
        }
      }
    }

    return [...exact, ...prefix, ...substring].slice(0, limit);
  }
}
