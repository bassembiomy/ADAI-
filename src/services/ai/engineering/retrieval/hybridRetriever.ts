import {
  ConceptRepository,
  FactRepository,
  RelationshipRepository
} from '../knowledge/contentAddressedStore';
import {
  EngineeringConcept,
  EngineeringFact,
  ConceptLifecycle
} from '../contracts/engineeringKnowledge';
import { ConceptRelationship } from '../contracts/conceptGraph';
import { LexicalIndex } from './lexicalIndex';
import { rerankCandidates, CandidateScoreInput } from './reranker';

export interface KnowledgeQuery {
  query: string;
  domain?: string;
  allowedLifecycles?: ConceptLifecycle[];
  runtimePlanning?: boolean;
  topK?: number;
  expandGraph?: boolean;
  minScore?: number;
}

export interface RetrievedConceptItem {
  concept: EngineeringConcept;
  score: number;
  scoreBreakdown: {
    lexicalScore: number;
    exactAliasBonus: number;
    sourceWeightBonus: number;
    graphBonus: number;
    vectorScore?: number;
  };
  evidence: string;
}

export interface RetrievedFactItem {
  fact: EngineeringFact;
  relevance: number;
  evidence: string;
}

export interface RetrievedRelationshipItem {
  relationship: ConceptRelationship;
  evidence: string;
}

export interface RetrievedKnowledgeBundle {
  concepts: RetrievedConceptItem[];
  facts: RetrievedFactItem[];
  relationships: RetrievedRelationshipItem[];
  runtimeEligibleOnly: boolean;
}

export interface HybridRetrieverOptions {
  conceptStore: ConceptRepository;
  factStore: FactRepository;
  conceptGraphStore: RelationshipRepository;
}

export class HybridRetriever {
  private readonly conceptStore: ConceptRepository;
  private readonly factStore: FactRepository;
  private readonly graphStore: RelationshipRepository;

  constructor(options: HybridRetrieverOptions) {
    this.conceptStore = options.conceptStore;
    this.factStore = options.factStore;
    this.graphStore = options.conceptGraphStore;
  }

  public async retrieve(query: KnowledgeQuery): Promise<RetrievedKnowledgeBundle> {
    const isRuntime = query.runtimePlanning ?? true;
    const allowedLifecycles = isRuntime
      ? ['verified' as const]
      : (query.allowedLifecycles ?? ['verified' as const]);

    const topK = query.topK ?? 10;
    const expandGraph = query.expandGraph ?? true;

    // 1. Fetch eligible concepts from store
    const allConcepts = await this.conceptStore.list({ domain: query.domain });
    const eligibleConcepts = allConcepts.filter(c =>
      allowedLifecycles.includes(c.lifecycle)
    );

    if (eligibleConcepts.length === 0) {
      return {
        concepts: [],
        facts: [],
        relationships: [],
        runtimeEligibleOnly: isRuntime
      };
    }

    // 2. Lexical scoring
    const lexical = new LexicalIndex();
    lexical.index(eligibleConcepts);
    const lexicalMatches = lexical.search(query.query);

    const candidateMap = new Map<string, CandidateScoreInput>();
    for (const match of lexicalMatches) {
      candidateMap.set(match.conceptId, {
        conceptId: match.conceptId,
        lexicalScore: match.lexicalScore,
        exactAliasBonus: match.exactAliasBonus,
        sourceWeightBonus: match.sourceWeightBonus,
        graphBonus: 0
      });
    }

    // 3. Graph expansion
    const verifiedRelationships: ConceptRelationship[] = [];
    if (expandGraph) {
      // Find relationships connected to top lexical hits
      const topLexicalIds = Array.from(candidateMap.keys()).slice(0, 5);
      for (const id of topLexicalIds) {
        const outRels = await this.graphStore.list({
          sourceConceptId: id,
          verified: isRuntime ? true : undefined
        });
        const inRels = await this.graphStore.list({
          targetConceptId: id,
          verified: isRuntime ? true : undefined
        });

        const allConnected = [...outRels, ...inRels];
        for (const rel of allConnected) {
          if (!verifiedRelationships.some(r => r.id === rel.id)) {
            verifiedRelationships.push(rel);
          }

          const neighborId = rel.sourceConceptId === id ? rel.targetConceptId : rel.sourceConceptId;
          if (await this.conceptStore.has(neighborId)) {
            const neighbor = await this.conceptStore.get(neighborId);
            if (allowedLifecycles.includes(neighbor.lifecycle)) {
              const existing = candidateMap.get(neighborId);
              if (existing) {
                existing.graphBonus = Math.max(existing.graphBonus ?? 0, 1.5 * rel.confidence);
              } else {
                candidateMap.set(neighborId, {
                  conceptId: neighborId,
                  lexicalScore: 0.5,
                  exactAliasBonus: 0,
                  sourceWeightBonus: 0.2,
                  graphBonus: 1.5 * rel.confidence
                });
              }
            }
          }
        }
      }
    }

    // 4. Reranking
    const reranked = rerankCandidates(Array.from(candidateMap.values()));
    const conceptLookup = new Map(eligibleConcepts.map(c => [c.id, c]));

    const selectedConceptItems: RetrievedConceptItem[] = [];
    for (const item of reranked.slice(0, topK)) {
      const c = conceptLookup.get(item.conceptId);
      if (c) {
        selectedConceptItems.push({
          concept: c,
          score: item.totalScore,
          scoreBreakdown: item.scoreBreakdown,
          evidence: `Verified concept '${c.id}' (${c.canonicalName}) matches query '${query.query}' with score ${item.totalScore.toFixed(2)}`
        });
      }
    }

    // 5. Fact retrieval for selected concepts
    const selectedConceptIds = new Set(selectedConceptItems.map(i => i.concept.id));
    const retrievedFacts: RetrievedFactItem[] = [];

    for (const cid of selectedConceptIds) {
      const facts = await this.factStore.list({
        subjectConceptId: cid,
        verified: isRuntime ? true : undefined
      });
      for (const fact of facts) {
        retrievedFacts.push({
          fact,
          relevance: fact.confidence,
          evidence: `Fact '${fact.id}' asserts ${fact.predicate} on '${fact.subjectConceptId}' (source: ${fact.sourceId}, locator: ${fact.sectionLocator})`
        });
      }
    }

    // 6. Relationship items
    const relevantRelationships: RetrievedRelationshipItem[] = verifiedRelationships
      .filter(r => selectedConceptIds.has(r.sourceConceptId) || selectedConceptIds.has(r.targetConceptId))
      .map(r => ({
        relationship: r,
        evidence: `Relationship '${r.id}' links '${r.sourceConceptId}' --[${r.relationType}]--> '${r.targetConceptId}'`
      }));

    return {
      concepts: selectedConceptItems,
      facts: retrievedFacts,
      relationships: relevantRelationships,
      runtimeEligibleOnly: isRuntime
    };
  }
}
