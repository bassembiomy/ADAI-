import type { SysmlRepository, SysmlRelationship } from './model';

export interface TraceabilityDiagnostic {
  code: 'UNRESOLVED_ENDPOINT' | 'DUPLICATE_ID' | 'REQUIREMENT_CYCLE';
  elementId: string;
  message: string;
}

export interface TraceabilityIndex {
  relationshipsByEndpoint: Map<string, SysmlRelationship[]>;
  relationshipsByKind: Map<SysmlRelationship['kind'], SysmlRelationship[]>;
  requirementsById: Map<string, SysmlRepository['requirements'][string]>;
  childrenByRequirement: Map<string, string[]>;
  parentsByRequirement: Map<string, string[]>;
  verificationCasesByRequirement: Map<string, string[]>;
  evidenceByRequirement: Map<string, string[]>;
  evidenceByVerificationCase: Map<string, string[]>;
  artifactsByRequirement: Map<string, string[]>;
  coveringElementsByRequirement: Map<string, string[]>;
  elementsById: Map<string, unknown>;
  diagnostics: TraceabilityDiagnostic[];
}

const add = <T>(map: Map<string, T[]>, key: string, value: T): void => {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
};

const sortedUnique = (values: string[]): string[] => [...new Set(values)].sort();

export function buildTraceabilityIndex(repo: SysmlRepository): TraceabilityIndex {
  const index: TraceabilityIndex = {
    relationshipsByEndpoint: new Map(),
    relationshipsByKind: new Map(),
    requirementsById: new Map(Object.entries(repo.requirements)),
    childrenByRequirement: new Map(),
    parentsByRequirement: new Map(),
    verificationCasesByRequirement: new Map(),
    evidenceByRequirement: new Map(),
    evidenceByVerificationCase: new Map(),
    artifactsByRequirement: new Map(),
    coveringElementsByRequirement: new Map(),
    elementsById: new Map(),
    diagnostics: [],
  };

  const collections = [
    repo.definitions, repo.usages, repo.connectors, repo.relationships,
    repo.requirements, repo.verificationCases, repo.evidence, repo.artifacts,
    repo.baselines,
  ];
  for (const collection of collections) {
    for (const [id, entity] of Object.entries(collection)) {
      if (index.elementsById.has(id)) {
        index.diagnostics.push({ code: 'DUPLICATE_ID', elementId: id, message: `Duplicate SysML element ID: ${id}` });
      }
      index.elementsById.set(id, entity);
    }
  }

  const knownIds = new Set(index.elementsById.keys());
  for (const relationship of Object.values(repo.relationships)) {
    add(index.relationshipsByEndpoint, relationship.sourceId, relationship);
    add(index.relationshipsByEndpoint, relationship.targetId, relationship);
    add(index.relationshipsByKind, relationship.kind, relationship);
    for (const endpoint of [relationship.sourceId, relationship.targetId]) {
      if (!knownIds.has(endpoint)) {
        index.diagnostics.push({ code: 'UNRESOLVED_ENDPOINT', elementId: relationship.id, message: `Relationship ${relationship.id} references unresolved endpoint ${endpoint}` });
      }
    }
    const sourceRequirement = index.requirementsById.has(relationship.sourceId);
    const targetRequirement = index.requirementsById.has(relationship.targetId);
    if (sourceRequirement && targetRequirement) {
      if (relationship.kind === 'requirementContainment' || relationship.kind === 'deriveReqt') {
        add(index.childrenByRequirement, relationship.sourceId, relationship.targetId);
        add(index.parentsByRequirement, relationship.targetId, relationship.sourceId);
      }
    }
    if (relationship.kind === 'satisfy') {
      const requirementId = sourceRequirement ? relationship.sourceId : targetRequirement ? relationship.targetId : null;
      const elementId = requirementId === relationship.sourceId ? relationship.targetId : relationship.sourceId;
      if (requirementId) add(index.coveringElementsByRequirement, requirementId, elementId);
    }
  }

  for (const test of Object.values(repo.verificationCases)) {
    for (const requirementId of test.verifiesRequirementIds) add(index.verificationCasesByRequirement, requirementId, test.id);
  }
  for (const evidence of Object.values(repo.evidence)) {
    add(index.evidenceByRequirement, evidence.requirementId, evidence.id);
    add(index.evidenceByVerificationCase, evidence.verificationCaseId, evidence.id);
  }
  for (const artifact of Object.values(repo.artifacts)) {
    const requirementIds = (artifact as any).requirementIds ?? (artifact as any).verifiesRequirementIds ?? [];
    for (const requirementId of requirementIds) add(index.artifactsByRequirement, requirementId, artifact.id);
  }

  for (const map of [index.childrenByRequirement, index.parentsByRequirement, index.verificationCasesByRequirement, index.evidenceByRequirement, index.evidenceByVerificationCase, index.artifactsByRequirement, index.coveringElementsByRequirement]) {
    for (const [key, values] of map) map.set(key, sortedUnique(values));
  }
  for (const map of [index.relationshipsByEndpoint, index.relationshipsByKind]) {
    for (const [key, values] of map) map.set(key, [...values].sort((a, b) => a.id.localeCompare(b.id)));
  }
  return index;
}

export function findRequirementCycles(index: TraceabilityIndex): string[][] {
  const cycles: string[][] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const path: string[] = [];
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      const start = path.indexOf(id);
      if (start >= 0) cycles.push([...path.slice(start), id]);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id); path.push(id);
    for (const child of index.childrenByRequirement.get(id) ?? []) visit(child);
    path.pop(); visiting.delete(id); visited.add(id);
  };
  for (const id of [...index.requirementsById.keys()].sort()) visit(id);
  return cycles;
}
