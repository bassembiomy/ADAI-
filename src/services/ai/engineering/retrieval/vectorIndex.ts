export interface VectorMatchResult {
  conceptId: string;
  cosineSimilarity: number;
}

export function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA <= 0 || normB <= 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class VectorIndex {
  private readonly vectors = new Map<string, number[]>();

  public setVector(id: string, vector: number[]): void {
    this.vectors.set(id, vector);
  }

  public search(queryVector: number[], topK = 10): VectorMatchResult[] {
    const results: VectorMatchResult[] = [];
    for (const [id, vec] of this.vectors.entries()) {
      const sim = cosineSimilarity(queryVector, vec);
      results.push({ conceptId: id, cosineSimilarity: sim });
    }
    return results
      .sort((a, b) => b.cosineSimilarity - a.cosineSimilarity || a.conceptId.localeCompare(b.conceptId))
      .slice(0, topK);
  }

  public size(): number {
    return this.vectors.size;
  }
}
