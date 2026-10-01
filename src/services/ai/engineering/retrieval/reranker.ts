export interface CandidateScoreInput {
  conceptId: string;
  lexicalScore: number;
  exactAliasBonus: number;
  sourceWeightBonus: number;
  vectorScore?: number;
  graphBonus?: number;
}

export interface RerankedScoreOutput {
  conceptId: string;
  totalScore: number;
  scoreBreakdown: {
    lexicalScore: number;
    exactAliasBonus: number;
    sourceWeightBonus: number;
    graphBonus: number;
    vectorScore?: number;
  };
}

export function rerankCandidates(
  candidates: readonly CandidateScoreInput[]
): RerankedScoreOutput[] {
  const scored: RerankedScoreOutput[] = candidates.map(c => {
    const graphBonus = c.graphBonus ?? 0;
    const vectorScore = c.vectorScore ?? 0;
    const totalScore =
      c.lexicalScore +
      c.exactAliasBonus +
      c.sourceWeightBonus +
      graphBonus +
      vectorScore * 2.0;

    return {
      conceptId: c.conceptId,
      totalScore,
      scoreBreakdown: {
        lexicalScore: c.lexicalScore,
        exactAliasBonus: c.exactAliasBonus,
        sourceWeightBonus: c.sourceWeightBonus,
        graphBonus,
        vectorScore: c.vectorScore
      }
    };
  });

  // Sort descending by totalScore, deterministic tie-breaker by conceptId ascending
  return scored.sort((a, b) => {
    const scoreDiff = b.totalScore - a.totalScore;
    if (Math.abs(scoreDiff) > 1e-6) {
      return scoreDiff;
    }
    return a.conceptId.localeCompare(b.conceptId);
  });
}
