import type {
  AnalyzedToken,
  DifficultyRating,
  Level,
  SectionAnalysis,
} from "../types";

const LEVEL_RANK: Record<Level, number> = {
  A1: 1, A2: 2, B1: 3, B2: 4, C1: 5, C2: 6,
  N5: 1, N4: 2, N3: 3, N2: 4, N1: 5,
  HSK1: 1, HSK2: 2, HSK3: 3, HSK4: 4, HSK5: 5, HSK6: 6,
  UNKNOWN: 0,
  FREQ_COMMON: 1,
  FREQ_UNCOMMON: 2,
  FREQ_RARE: 3,
};

export interface DifficultyWeights {
  /** Weight applied to the share of unknown words. */
  unknown: number;
  /** Weight applied to the mean known-word level rank. */
  level: number;
}

const DEFAULT_WEIGHTS: DifficultyWeights = { unknown: 1, level: 1 };

/**
 * Computes a SectionAnalysis for a list of analyzed tokens.
 * Coverage = share of words whose level is known (not UNKNOWN).
 * Hard ratio = share of words at the top half of the scheme range.
 */
export function computeDifficulty(
  tokens: readonly AnalyzedToken[],
  options: { weights?: DifficultyWeights } = {},
): SectionAnalysis {
  const weights = { ...DEFAULT_WEIGHTS, ...options.weights };
  const levelCounts: Partial<Record<Level, number>> = {};
  let unknownWords = 0;
  let totalRank = 0;
  let knownWords = 0;

  for (const token of tokens) {
    levelCounts[token.level] = (levelCounts[token.level] ?? 0) + 1;
    const rank = LEVEL_RANK[token.level] ?? 0;
    if (rank === 0) {
      unknownWords += 1;
    } else {
      totalRank += rank;
      knownWords += 1;
    }
  }

  const totalWords = tokens.length;
  const coverage = totalWords === 0 ? 1 : knownWords / totalWords;
  const hardRatio = totalWords === 0 ? 0 : unknownWords / totalWords;
  const meanLevel = knownWords === 0 ? 0 : totalRank / knownWords;

  // Normalized difficulty in [0,1]: unknown share + mean level share.
  const maxRank = Math.max(...Object.values(LEVEL_RANK), 1);
  const score =
    weights.unknown * hardRatio +
    weights.level * (maxRank === 0 ? 0 : meanLevel / maxRank);

  const rating = ratingFor(score);

  return {
    sectionId: "",
    totalWords,
    unknownWords,
    levelCounts,
    hardRatio,
    coverage,
    rating,
  };
}

export function ratingFor(score: number): DifficultyRating {
  if (score <= 0.2) return "Very Easy";
  if (score <= 0.4) return "Easy";
  if (score <= 0.6) return "Moderate";
  if (score <= 0.8) return "Hard";
  return "Very Hard";
}

/** Rank used to compare levels within a single scheme. */
export function levelRank(level: Level): number {
  return LEVEL_RANK[level] ?? 0;
}
