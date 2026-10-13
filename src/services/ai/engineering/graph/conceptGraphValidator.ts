import {
  ConceptRelationship,
  ConceptRelationType,
  ConceptRelationTypeEnum
} from '../contracts/conceptGraph';
import { EngineeringConcept } from '../contracts/engineeringKnowledge';

export interface ConceptGraphValidationOptions {
  requireVerified?: boolean;
  minConfidence?: number;
}

export interface GraphValidationIssue {
  code: string;
  message: string;
  relationId?: string;
  sourceConceptId?: string;
  targetConceptId?: string;
  severity: 'error' | 'warning';
}

export interface GraphValidationResult {
  valid: boolean;
  issues: GraphValidationIssue[];
}

const HIERARCHICAL_RELATION_TYPES: ReadonlySet<ConceptRelationType> = new Set([
  'requires',
  'composed_of',
  'specializes'
]);

export function validateConceptGraph(
  concepts: readonly EngineeringConcept[],
  relationships: readonly ConceptRelationship[],
  options: ConceptGraphValidationOptions = {}
): GraphValidationResult {
  const issues: GraphValidationIssue[] = [];
  const conceptMap = new Map<string, EngineeringConcept>();
  for (const c of concepts) {
    conceptMap.set(c.id, c);
  }

  // 1. Endpoint & taxonomy & lifecycle validation
  for (const rel of relationships) {
    const source = conceptMap.get(rel.sourceConceptId);
    const target = conceptMap.get(rel.targetConceptId);

    if (!source) {
      issues.push({
        code: 'DANGLING_ENDPOINT',
        message: `Relationship '${rel.id}' references missing source concept '${rel.sourceConceptId}'`,
        relationId: rel.id,
        sourceConceptId: rel.sourceConceptId,
        severity: 'error'
      });
    }

    if (!target) {
      issues.push({
        code: 'DANGLING_ENDPOINT',
        message: `Relationship '${rel.id}' references missing target concept '${rel.targetConceptId}'`,
        relationId: rel.id,
        targetConceptId: rel.targetConceptId,
        severity: 'error'
      });
    }

    const typeValid = ConceptRelationTypeEnum.safeParse(rel.relationType).success;
    if (!typeValid) {
      issues.push({
        code: 'INVALID_RELATION_TAXONOMY',
        message: `Relationship '${rel.id}' has invalid relationType '${rel.relationType}'`,
        relationId: rel.id,
        severity: 'error'
      });
    }

    if (options.minConfidence !== undefined && rel.confidence < options.minConfidence) {
      issues.push({
        code: 'LOW_CONFIDENCE',
        message: `Relationship '${rel.id}' confidence ${rel.confidence} is below minimum ${options.minConfidence}`,
        relationId: rel.id,
        severity: 'warning'
      });
    }

    if (options.requireVerified) {
      if (!rel.verified) {
        issues.push({
          code: 'UNVERIFIED_CONTENT_INELIGIBLE',
          message: `Relationship '${rel.id}' is unverified and prohibited at runtime`,
          relationId: rel.id,
          severity: 'error'
        });
      }
      if (source && source.lifecycle !== 'verified') {
        issues.push({
          code: 'UNVERIFIED_CONTENT_INELIGIBLE',
          message: `Source concept '${source.id}' has lifecycle '${source.lifecycle}' (must be 'verified')`,
          relationId: rel.id,
          sourceConceptId: source.id,
          severity: 'error'
        });
      }
      if (target && target.lifecycle !== 'verified') {
        issues.push({
          code: 'UNVERIFIED_CONTENT_INELIGIBLE',
          message: `Target concept '${target.id}' has lifecycle '${target.lifecycle}' (must be 'verified')`,
          relationId: rel.id,
          targetConceptId: target.id,
          severity: 'error'
        });
      }
    }
  }

  // 2. Cycle detection for hierarchical / dependency relations (requires, composed_of, specializes)
  const adjList = new Map<string, Array<{ target: string; relId: string }>>();
  for (const rel of relationships) {
    if (HIERARCHICAL_RELATION_TYPES.has(rel.relationType)) {
      const list = adjList.get(rel.sourceConceptId) ?? [];
      list.push({ target: rel.targetConceptId, relId: rel.id });
      adjList.set(rel.sourceConceptId, list);
    }
  }

  const visited = new Set<string>();
  const inStack = new Set<string>();
  const cycleEdges: string[] = [];

  function dfs(u: string): boolean {
    visited.add(u);
    inStack.add(u);

    const neighbors = adjList.get(u) ?? [];
    for (const { target, relId } of neighbors) {
      if (!visited.has(target)) {
        if (dfs(target)) return true;
      } else if (inStack.has(target)) {
        cycleEdges.push(relId);
        issues.push({
          code: 'DEPENDENCY_CYCLE_DETECTED',
          message: `Cycle detected in dependency graph involving '${u}' -> '${target}' via relationship '${relId}'`,
          relationId: relId,
          sourceConceptId: u,
          targetConceptId: target,
          severity: 'error'
        });
        return true;
      }
    }

    inStack.delete(u);
    return false;
  }

  for (const node of adjList.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return {
    valid: issues.filter(i => i.severity === 'error').length === 0,
    issues
  };
}
