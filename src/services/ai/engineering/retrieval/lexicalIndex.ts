import { EngineeringConcept } from '../contracts/engineeringKnowledge';

export function tokenize(text: string): string[] {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\s-]/g, ' ')
    .split(/[\s_-]+/)
    .filter(token => token.length >= 2);
}

export interface LexicalMatchResult {
  conceptId: string;
  lexicalScore: number;
  exactAliasBonus: number;
  sourceWeightBonus: number;
}

export class LexicalIndex {
  private readonly concepts = new Map<string, EngineeringConcept>();
  private readonly docTokens = new Map<string, string[]>();
  private readonly idfMap = new Map<string, number>();

  public index(concepts: readonly EngineeringConcept[]): void {
    this.concepts.clear();
    this.docTokens.clear();
    this.idfMap.clear();

    const dfMap = new Map<string, number>();
    const totalDocs = concepts.length;

    for (const c of concepts) {
      this.concepts.set(c.id, c);

      const textParts = [
        c.canonicalName,
        ...c.aliases,
        c.domain,
        c.description,
        ...c.functionalRoles,
        ...c.inputs.map(i => `${i.name} ${i.domain || ''} ${i.unit || ''}`),
        ...c.outputs.map(o => `${o.name} ${o.domain || ''} ${o.unit || ''}`)
      ];
      const tokens = tokenize(textParts.join(' '));
      this.docTokens.set(c.id, tokens);

      const uniqueTokens = new Set(tokens);
      for (const t of uniqueTokens) {
        dfMap.set(t, (dfMap.get(t) ?? 0) + 1);
      }
    }

    for (const [term, df] of dfMap.entries()) {
      // Standard BM25 IDF formulation: ln(1 + (N - n + 0.5) / (n + 0.5))
      const idf = Math.log(1 + (totalDocs - df + 0.5) / (df + 0.5));
      this.idfMap.set(term, Math.max(idf, 0.1));
    }
  }

  public search(query: string): LexicalMatchResult[] {
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) return [];

    const queryLower = query.trim().toLowerCase();
    const results: LexicalMatchResult[] = [];

    const k1 = 1.2;
    const b = 0.75;
    let avgDocLen = 0;
    for (const tokens of this.docTokens.values()) {
      avgDocLen += tokens.length;
    }
    avgDocLen = avgDocLen > 0 ? avgDocLen / (this.docTokens.size || 1) : 1;

    for (const [id, tokens] of this.docTokens.entries()) {
      const concept = this.concepts.get(id)!;
      const docLen = tokens.length;

      // Count TF
      const tfMap = new Map<string, number>();
      for (const t of tokens) {
        tfMap.set(t, (tfMap.get(t) ?? 0) + 1);
      }

      let bm25Score = 0;
      for (const qToken of queryTokens) {
        const tf = tfMap.get(qToken) ?? 0;
        const idf = this.idfMap.get(qToken) ?? 0;
        if (tf > 0) {
          const numerator = tf * (k1 + 1);
          const denominator = tf + k1 * (1 - b + b * (docLen / avgDocLen));
          bm25Score += idf * (numerator / denominator);
        }
      }

      // Exact alias match check
      let exactAliasBonus = 0;
      for (const alias of [concept.canonicalName, ...concept.aliases]) {
        const aliasLower = alias.trim().toLowerCase();
        if (queryLower === aliasLower || queryLower.includes(aliasLower) || aliasLower.includes(queryLower)) {
          exactAliasBonus = Math.max(exactAliasBonus, 2.0);
        }
      }

      // Source weight bonus (verified ADIA / standards / textbooks receive priority)
      let sourceWeightBonus = 0;
      if (concept.provenanceIds.some(p => p.includes('standard') || p.includes('iso') || p.includes('ieee'))) {
        sourceWeightBonus += 0.5;
      }
      if (concept.confidence >= 0.95) {
        sourceWeightBonus += 0.3;
      }

      const totalLexical = bm25Score + exactAliasBonus + sourceWeightBonus;
      if (totalLexical > 0) {
        results.push({
          conceptId: id,
          lexicalScore: bm25Score,
          exactAliasBonus,
          sourceWeightBonus
        });
      }
    }

    return results;
  }
}
