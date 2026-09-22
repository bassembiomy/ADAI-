import {
  ConceptRelationship,
  ConceptRelationType
} from '../contracts/conceptGraph';
import { EngineeringConcept } from '../contracts/engineeringKnowledge';

export interface TraversalEvidence {
  path: string[];
  edgeIds: string[];
  depth: number;
  cumulativeConfidence: number;
}

export interface TraversalOptions {
  direction?: 'outgoing' | 'incoming' | 'both';
  relationTypes?: ConceptRelationType[];
  maxDepth?: number;
  maxResults?: number;
}

export interface ConceptGraphTraversalOptions {
  concepts: readonly EngineeringConcept[];
  relationships: readonly ConceptRelationship[];
  maxDepth?: number;
  maxResults?: number;
}

export class ConceptGraphTraversal {
  private readonly concepts = new Map<string, EngineeringConcept>();
  private readonly outgoing = new Map<string, ConceptRelationship[]>();
  private readonly incoming = new Map<string, ConceptRelationship[]>();
  private readonly defaultMaxDepth: number;
  private readonly defaultMaxResults: number;

  constructor(options: ConceptGraphTraversalOptions) {
    this.defaultMaxDepth = Math.min(Math.max(options.maxDepth ?? 5, 1), 10);
    this.defaultMaxResults = Math.min(Math.max(options.maxResults ?? 50, 1), 200);

    for (const c of options.concepts) {
      this.concepts.set(c.id, c);
    }

    for (const rel of options.relationships) {
      const outList = this.outgoing.get(rel.sourceConceptId) ?? [];
      outList.push(rel);
      this.outgoing.set(rel.sourceConceptId, outList);

      const inList = this.incoming.get(rel.targetConceptId) ?? [];
      inList.push(rel);
      this.incoming.set(rel.targetConceptId, inList);
    }
  }

  public getNeighbors(
    conceptId: string,
    options: TraversalOptions = {}
  ): ConceptRelationship[] {
    const direction = options.direction ?? 'both';
    const typeFilter = options.relationTypes ? new Set(options.relationTypes) : null;
    const results: ConceptRelationship[] = [];

    if (direction === 'outgoing' || direction === 'both') {
      const outEdges = this.outgoing.get(conceptId) ?? [];
      for (const edge of outEdges) {
        if (!typeFilter || typeFilter.has(edge.relationType)) {
          results.push(edge);
        }
      }
    }

    if (direction === 'incoming' || direction === 'both') {
      const inEdges = this.incoming.get(conceptId) ?? [];
      for (const edge of inEdges) {
        if (!typeFilter || typeFilter.has(edge.relationType)) {
          results.push(edge);
        }
      }
    }

    return results;
  }

  public getRequirementsClosure(conceptId: string): {
    conceptIds: string[];
    evidence: TraversalEvidence[];
  } {
    const maxDepth = this.defaultMaxDepth;
    const maxResults = this.defaultMaxResults;
    const visited = new Set<string>([conceptId]);
    const evidenceList: TraversalEvidence[] = [];

    interface QueueItem {
      currentId: string;
      path: string[];
      edgeIds: string[];
      depth: number;
      cumulativeConfidence: number;
    }

    const queue: QueueItem[] = [
      {
        currentId: conceptId,
        path: [conceptId],
        edgeIds: [],
        depth: 0,
        cumulativeConfidence: 1.0
      }
    ];

    const targetRelationTypes: ReadonlySet<ConceptRelationType> = new Set(['requires', 'composed_of']);

    while (queue.length > 0 && evidenceList.length < maxResults) {
      const item = queue.shift()!;
      if (item.depth >= maxDepth) continue;

      const outEdges = this.outgoing.get(item.currentId) ?? [];
      for (const edge of outEdges) {
        if (targetRelationTypes.has(edge.relationType)) {
          const nextId = edge.targetConceptId;
          const nextConfidence = item.cumulativeConfidence * edge.confidence;
          const nextEvidence: TraversalEvidence = {
            path: [...item.path, nextId],
            edgeIds: [...item.edgeIds, edge.id],
            depth: item.depth + 1,
            cumulativeConfidence: nextConfidence
          };

          if (!visited.has(nextId)) {
            visited.add(nextId);
            evidenceList.push(nextEvidence);
            queue.push({
              currentId: nextId,
              path: nextEvidence.path,
              edgeIds: nextEvidence.edgeIds,
              depth: nextEvidence.depth,
              cumulativeConfidence: nextConfidence
            });
          }
        }
      }
    }

    return {
      conceptIds: Array.from(visited).filter(id => id !== conceptId).sort(),
      evidence: evidenceList
    };
  }

  public getAlternatives(conceptId: string): Array<{
    conceptId: string;
    evidence: TraversalEvidence;
  }> {
    const results: Array<{ conceptId: string; evidence: TraversalEvidence }> = [];
    const seen = new Set<string>();

    const outEdges = this.outgoing.get(conceptId) ?? [];
    for (const edge of outEdges) {
      if (edge.relationType === 'alternative_to') {
        const altId = edge.targetConceptId;
        if (!seen.has(altId)) {
          seen.add(altId);
          results.push({
            conceptId: altId,
            evidence: {
              path: [conceptId, altId],
              edgeIds: [edge.id],
              depth: 1,
              cumulativeConfidence: edge.confidence
            }
          });
        }
      }
    }

    const inEdges = this.incoming.get(conceptId) ?? [];
    for (const edge of inEdges) {
      if (edge.relationType === 'alternative_to') {
        const altId = edge.sourceConceptId;
        if (!seen.has(altId)) {
          seen.add(altId);
          results.push({
            conceptId: altId,
            evidence: {
              path: [conceptId, altId],
              edgeIds: [edge.id],
              depth: 1,
              cumulativeConfidence: edge.confidence
            }
          });
        }
      }
    }

    return results;
  }

  public getAncestors(conceptId: string): Array<{
    conceptId: string;
    evidence: TraversalEvidence;
  }> {
    const results: Array<{ conceptId: string; evidence: TraversalEvidence }> = [];
    let currentId = conceptId;
    let depth = 0;
    let cumulativeConfidence = 1.0;
    const path = [conceptId];
    const edgeIds: string[] = [];

    while (depth < this.defaultMaxDepth) {
      const outEdges = this.outgoing.get(currentId) ?? [];
      const specEdge = outEdges.find(e => e.relationType === 'specializes');
      if (!specEdge) break;

      currentId = specEdge.targetConceptId;
      depth++;
      cumulativeConfidence *= specEdge.confidence;
      path.push(currentId);
      edgeIds.push(specEdge.id);

      results.push({
        conceptId: currentId,
        evidence: {
          path: [...path],
          edgeIds: [...edgeIds],
          depth,
          cumulativeConfidence
        }
      });
    }

    return results;
  }

  public findShortestEvidencePath(
    sourceId: string,
    targetId: string
  ): TraversalEvidence | null {
    if (sourceId === targetId) {
      return {
        path: [sourceId],
        edgeIds: [],
        depth: 0,
        cumulativeConfidence: 1.0
      };
    }

    interface QueueNode {
      conceptId: string;
      path: string[];
      edgeIds: string[];
      depth: number;
      cumulativeConfidence: number;
    }

    const queue: QueueNode[] = [
      {
        conceptId: sourceId,
        path: [sourceId],
        edgeIds: [],
        depth: 0,
        cumulativeConfidence: 1.0
      }
    ];
    const visited = new Set<string>([sourceId]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= this.defaultMaxDepth) continue;

      const outEdges = this.outgoing.get(current.conceptId) ?? [];
      for (const edge of outEdges) {
        const nextId = edge.targetConceptId;
        const nextConfidence = current.cumulativeConfidence * edge.confidence;
        const nextNode: QueueNode = {
          conceptId: nextId,
          path: [...current.path, nextId],
          edgeIds: [...current.edgeIds, edge.id],
          depth: current.depth + 1,
          cumulativeConfidence: nextConfidence
        };

        if (nextId === targetId) {
          return {
            path: nextNode.path,
            edgeIds: nextNode.edgeIds,
            depth: nextNode.depth,
            cumulativeConfidence: nextNode.cumulativeConfidence
          };
        }

        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push(nextNode);
        }
      }

      const inEdges = this.incoming.get(current.conceptId) ?? [];
      for (const edge of inEdges) {
        const prevId = edge.sourceConceptId;
        const prevConfidence = current.cumulativeConfidence * edge.confidence;
        const prevNode: QueueNode = {
          conceptId: prevId,
          path: [...current.path, prevId],
          edgeIds: [...current.edgeIds, edge.id],
          depth: current.depth + 1,
          cumulativeConfidence: prevConfidence
        };

        if (prevId === targetId) {
          return {
            path: prevNode.path,
            edgeIds: prevNode.edgeIds,
            depth: prevNode.depth,
            cumulativeConfidence: prevNode.cumulativeConfidence
          };
        }

        if (!visited.has(prevId)) {
          visited.add(prevId);
          queue.push(prevNode);
        }
      }
    }

    return null;
  }
}
