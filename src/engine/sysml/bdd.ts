import type {
  BlockDefinition,
  PortDefinition,
  PropertyDefinition,
  SysmlDefinition,
  SysmlRelationship,
  SysmlRepository,
} from './model';
import type { SysmlDiagnostic } from './validation';
import { resolveInheritance as resolveInheritancePolicy, policyDiagnosticsToSysml } from './policy';

export interface ResolvedBlockFeatures {
  properties: PropertyDefinition[];
  ports: PortDefinition[];
  operations: string[];
  constraints: string[];
  annotatedProperties?: Array<PropertyDefinition & { originId: string; originName: string; isInherited: boolean }>;
  annotatedPorts?: Array<PortDefinition & { originId: string; originName: string; isInherited: boolean }>;
  annotatedOperations?: Array<{ name: string; originId: string; originName: string; isInherited: boolean }>;
  annotatedConstraints?: Array<{ expression: string; originId: string; originName: string; isInherited: boolean }>;
  diagnostics: SysmlDiagnostic[];
}

export interface BddRelationshipView extends SysmlRelationship {
  notation: 'solid-line' | 'filled-diamond' | 'hollow-diamond' | 'hollow-triangle' | 'dashed-arrow';
}

export type BddRelationKind = 'association' | 'sharedAggregation' | 'composition' | 'generalization' | 'dependency' | 'allocation';

export type BddEdgeNotation = BddRelationshipView['notation'];

/**
 * Stable BDD-only edge notation lookup (OMG SysML 1.6, BDD relations only).
 * IBD connector symbols live in ibd.ts (connectorNotationFor) and are
 * intentionally disjoint; see VirtualizedDiagram diagramEdgeNotation for the
 * per-diagram-kind dispatcher.
 */
export const BDD_NOTATION_BY_KIND: Record<BddRelationKind, BddEdgeNotation> = {
  association: 'solid-line',
  composition: 'filled-diamond',
  sharedAggregation: 'hollow-diamond',
  generalization: 'hollow-triangle',
  dependency: 'dashed-arrow',
  allocation: 'dashed-arrow',
};

export function bddNotationForKind(kind: SysmlRelationship['kind']): BddEdgeNotation {
  if (kind === 'composition') return 'filled-diamond';
  if (kind === 'sharedAggregation') return 'hollow-diamond';
  if (kind === 'generalization') return 'hollow-triangle';
  if (kind === 'dependency' || kind === 'allocation') return 'dashed-arrow';
  return 'solid-line';
}

export interface BddView {
  elements: SysmlDefinition[];
  relationships: BddRelationshipView[];
  diagnostics: SysmlDiagnostic[];
}

const BDD_RELATIONSHIPS = new Set([
  'association', 'sharedAggregation', 'composition', 'generalization', 'dependency', 'allocation',
]);

export function resolveInheritedFeatures(repo: SysmlRepository, blockId: string): ResolvedBlockFeatures {
  const diagnostics: SysmlDiagnostic[] = [];
  const block = asBlock(repo.definitions[blockId]);
  if (!block) {
    return { properties: [], ports: [], operations: [], constraints: [], diagnostics: [diagnostic('BLOCK_NOT_FOUND', blockId, undefined, `Block ${blockId} does not exist`)] };
  }
  const properties: PropertyDefinition[] = [];
  const ports: PortDefinition[] = [];
  const operations: string[] = [];
  const constraints: string[] = [];
  const annotatedProperties: Array<PropertyDefinition & { originId: string; originName: string; isInherited: boolean }> = [];
  const annotatedPorts: Array<PortDefinition & { originId: string; originName: string; isInherited: boolean }> = [];
  const annotatedOperations: Array<{ name: string; originId: string; originName: string; isInherited: boolean }> = [];
  const annotatedConstraints: Array<{ expression: string; originId: string; originName: string; isInherited: boolean }> = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const merge = (current: BlockDefinition) => {
    if (visited.has(current.id)) return;
    if (visiting.has(current.id)) {
      diagnostics.push(diagnostic('INHERITANCE_CYCLE', current.id, 'supertypeIds', `Inheritance cycle includes ${current.id}`));
      return;
    }
    visiting.add(current.id);
    const isInherited = current.id !== block.id;
    for (const parentId of current.supertypeIds ?? []) {
      const parent = asBlock(repo.definitions[parentId]);
      if (parent) merge(parent);
      else diagnostics.push(diagnostic('MISSING_SUPERTYPE', current.id, 'supertypeIds', `Supertype ${parentId} does not exist`));
    }
    for (const property of current.properties) {
      const propWithOrigin: PropertyDefinition = {
        ...property,
        inheritedFromId: isInherited ? current.id : undefined,
      };
      if (property.redefinesId) {
        const index = properties.findIndex(candidate => candidate.id === property.redefinesId);
        if (index >= 0) properties.splice(index, 1, propWithOrigin);
        else properties.push(propWithOrigin);
      } else if (!properties.some(candidate => candidate.id === property.id)) {
        properties.push(propWithOrigin);
      }
      annotatedProperties.push({
        ...propWithOrigin,
        originId: current.id,
        originName: current.name,
        isInherited,
      });
    }
    for (const port of current.ports) {
      const portWithOrigin: PortDefinition = {
        ...port,
        inheritedFromId: isInherited ? current.id : undefined,
      };
      const sameName = ports.findIndex(candidate => candidate.name === port.name);
      if (sameName >= 0) ports.splice(sameName, 1, portWithOrigin);
      else ports.push(portWithOrigin);

      annotatedPorts.push({
        ...portWithOrigin,
        originId: current.id,
        originName: current.name,
        isInherited,
      });
    }
    for (const operation of current.operations) {
      if (!operations.includes(operation)) operations.push(operation);
      annotatedOperations.push({ name: operation, originId: current.id, originName: current.name, isInherited });
    }
    for (const constraint of current.constraints) {
      if (!constraints.includes(constraint)) constraints.push(constraint);
      annotatedConstraints.push({ expression: constraint, originId: current.id, originName: current.name, isInherited });
    }
    visiting.delete(current.id);
    visited.add(current.id);
  };
  merge(block);
  // Central policy is the source of truth for inheritance decisions. Merge its
  // typed diagnostics so BDD projections never diverge (OMG SysML 1.6, no v2 claim).
  for (const policyDiagnostic of policyDiagnosticsForBlock(repo, blockId)) {
    if (!diagnostics.some(d => diagnosticKey(d) === diagnosticKey(policyDiagnostic))) {
      diagnostics.push(policyDiagnostic);
    }
  }
  diagnostics.sort(compareDiagnostics);
  return {
    properties,
    ports,
    operations,
    constraints,
    annotatedProperties,
    annotatedPorts,
    annotatedOperations,
    annotatedConstraints,
    diagnostics,
  };
}

export function validateBlockDefinition(repo: SysmlRepository, blockId: string): SysmlDiagnostic[] {
  const block = asBlock(repo.definitions[blockId]);
  if (!block) return [diagnostic('BLOCK_NOT_FOUND', blockId, undefined, `Block ${blockId} does not exist`)];
  const diagnostics = [...resolveInheritedFeatures(repo, blockId).diagnostics];
  const featureNames = new Set<string>();

  for (const parentId of block.supertypeIds ?? []) {
    const parent = asBlock(repo.definitions[parentId]);
    if (parent?.isLeaf) diagnostics.push(diagnostic('LEAF_SPECIALIZATION', block.id, 'supertypeIds', `Leaf block ${parentId} cannot be specialized`));
  }
  for (const feature of [...block.properties, ...block.ports]) {
    if (featureNames.has(feature.name)) diagnostics.push(diagnostic('DUPLICATE_FEATURE_NAME', feature.id, 'name', `Feature name ${feature.name} is duplicated in ${block.id}`));
    featureNames.add(feature.name);
  }
  const inherited = inheritedProperties(repo, block);
  for (const property of block.properties) {
    const type = repo.definitions[property.typeId];
    if (!type || !validPropertyType(property.kind, type)) {
      diagnostics.push(diagnostic('MISSING_PROPERTY_TYPE', property.id, 'typeId', `Property type ${property.typeId} is missing or incompatible with ${property.kind}`));
    }
    if (property.redefinesId) {
      const original = inherited.find(candidate => candidate.id === property.redefinesId);
      if (!original || original.kind !== property.kind || original.typeId !== property.typeId || !multiplicityConforms(property, original)) {
        diagnostics.push(diagnostic('INCOMPATIBLE_REDEFINITION', property.id, 'redefinesId', `Property does not conform to redefined feature ${property.redefinesId}`));
      }
    }
    if (property.subsetsId) {
      const original = inherited.find(candidate => candidate.id === property.subsetsId);
      if (!original || original.kind !== property.kind || original.typeId !== property.typeId || !multiplicityIsSubset(property, original)) {
        diagnostics.push(diagnostic('INVALID_SUBSETTING_MULTIPLICITY', property.id, 'subsetsId', `Property is not a valid subset of ${property.subsetsId}`));
      }
    }
  }
  for (const port of block.ports) {
    const type = repo.definitions[port.typeId];
    if (port.kind === 'proxy') {
      if (!type || type.kind !== 'interface') {
        diagnostics.push(diagnostic('MISSING_PORT_TYPE', port.id, 'typeId', `Port type ${port.typeId} must be an InterfaceDefinition`));
      }
    } else if (port.kind === 'full') {
      if (!type || (type.kind !== 'block' && type.kind !== 'interface' && type.kind !== 'valueType')) {
        diagnostics.push(diagnostic('MISSING_PORT_TYPE', port.id, 'typeId', `Full port type ${port.typeId} must resolve to a valid definition`));
      }
    }
  }
  // resolveInheritedFeatures already merges central policy diagnostics; dedup
  // the explicit checks above against the policy source of truth.
  return dedupDiagnostics(diagnostics);
}

export function validateAssociationEnds(repo: SysmlRepository, relationshipId: string): SysmlDiagnostic[] {
  const diagnostics: SysmlDiagnostic[] = [];
  const rel = repo.relationships[relationshipId];
  if (!rel) {
    return [diagnostic('RELATIONSHIP_NOT_FOUND', relationshipId, undefined, `Relationship ${relationshipId} does not exist`)];
  }
  const source = repo.definitions[rel.sourceId];
  const target = repo.definitions[rel.targetId];

  // Validate multiplicities
  if (rel.sourceMultiplicity) {
    if (rel.sourceMultiplicity.lower < 0 || (rel.sourceMultiplicity.upper !== '*' && rel.sourceMultiplicity.upper < rel.sourceMultiplicity.lower)) {
      diagnostics.push(diagnostic('INVALID_MULTIPLICITY', rel.id, `relationships.${rel.id}.sourceMultiplicity`, `Source multiplicity is invalid`));
    }
    if (rel.kind === 'composition') {
      // Composition ownership at diamond end: composite end multiplicity upper must be at most 1
      if (rel.sourceMultiplicity.upper === '*' || rel.sourceMultiplicity.upper > 1) {
        diagnostics.push(diagnostic('INVALID_MULTIPLICITY', rel.id, `relationships.${rel.id}.sourceMultiplicity`, `Composition composite end multiplicity upper must be at most 1`));
      }
    }
  }

  if (rel.targetMultiplicity) {
    if (rel.targetMultiplicity.lower < 0 || (rel.targetMultiplicity.upper !== '*' && rel.targetMultiplicity.upper < rel.targetMultiplicity.lower)) {
      diagnostics.push(diagnostic('INVALID_MULTIPLICITY', rel.id, `relationships.${rel.id}.targetMultiplicity`, `Target multiplicity is invalid`));
    }
  }

  // Validate unique role names per classifier
  if (source && source.kind === 'block' && rel.sourceRole) {
    const duplicateProperty = source.properties.some(p => p.name === rel.sourceRole);
    if (duplicateProperty) {
      diagnostics.push(diagnostic('DUPLICATE_ROLE_NAME', rel.id, `relationships.${rel.id}.sourceRole`, `Role ${rel.sourceRole} collides with existing property in ${source.name}`));
    }
  }
  if (target && target.kind === 'block' && rel.targetRole) {
    const duplicateProperty = target.properties.some(p => p.name === rel.targetRole);
    if (duplicateProperty) {
      diagnostics.push(diagnostic('DUPLICATE_ROLE_NAME', rel.id, `relationships.${rel.id}.targetRole`, `Role ${rel.targetRole} collides with existing property in ${target.name}`));
    }
  }

  // Validate navigability flags
  if (rel.sourceNavigable === false && rel.targetNavigable === false) {
    diagnostics.push(diagnostic('NON_NAVIGABLE_ENDS', rel.id, `relationships.${rel.id}.navigability`, `At least one end must be navigable`));
  }

  return diagnostics;
}

export function deriveBddView(repo: SysmlRepository): BddView {
  const elements = Object.values(repo.definitions).sort((a, b) => a.id.localeCompare(b.id));
  const elementIds = new Set(elements.map(element => element.id));
  const relationships = Object.values(repo.relationships)
    .filter(relationship => BDD_RELATIONSHIPS.has(relationship.kind) && elementIds.has(relationship.sourceId) && elementIds.has(relationship.targetId))
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(relationship => ({ ...relationship, notation: notationFor(relationship.kind) }));
  const diagnostics = elements.flatMap(element => element.kind === 'block' ? validateBlockDefinition(repo, element.id) : []);
  return { elements, relationships, diagnostics };
}

function inheritedProperties(repo: SysmlRepository, block: BlockDefinition): PropertyDefinition[] {
  const result: PropertyDefinition[] = [];
  const visited = new Set<string>();
  const collect = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const parent = asBlock(repo.definitions[id]);
    if (!parent) return;
    for (const supertypeId of parent.supertypeIds ?? []) collect(supertypeId);
    result.push(...parent.properties);
  };
  for (const parentId of block.supertypeIds ?? []) collect(parentId);
  return result;
}

function validPropertyType(kind: PropertyDefinition['kind'], type: SysmlDefinition): boolean {
  if (kind === 'part') return type.kind === 'block';
  if (kind === 'value') return type.kind === 'valueType';
  return true;
}

function multiplicityConforms(candidate: PropertyDefinition, original: PropertyDefinition): boolean {
  return candidate.multiplicity.lower >= original.multiplicity.lower && upperAtMost(candidate.multiplicity.upper, original.multiplicity.upper);
}

function multiplicityIsSubset(candidate: PropertyDefinition, original: PropertyDefinition): boolean {
  return upperAtMost(candidate.multiplicity.upper, original.multiplicity.upper);
}

function upperAtMost(candidate: number | '*', original: number | '*'): boolean {
  if (original === '*') return true;
  return candidate !== '*' && candidate <= original;
}

function asBlock(definition: SysmlDefinition | undefined): BlockDefinition | undefined {
  return definition?.kind === 'block' ? definition : undefined;
}

function notationFor(kind: SysmlRelationship['kind']): BddRelationshipView['notation'] {
  return bddNotationForKind(kind);
}

function policyDiagnosticsForBlock(repo: SysmlRepository, blockId: string): SysmlDiagnostic[] {
  const resolution = resolveInheritancePolicy(repo, blockId);
  return policyDiagnosticsToSysml(blockId, resolution.diagnostics);
}

function diagnosticKey(diagnostic: SysmlDiagnostic): string {
  return `${diagnostic.code}:${diagnostic.elementId ?? ''}:${diagnostic.propertyPath ?? ''}:${diagnostic.message}`;
}

function compareDiagnostics(a: SysmlDiagnostic, b: SysmlDiagnostic): number {
  return a.code.localeCompare(b.code)
    || (a.elementId ?? '').localeCompare(b.elementId ?? '')
    || (a.propertyPath ?? '').localeCompare(b.propertyPath ?? '')
    || a.message.localeCompare(b.message);
}

function dedupDiagnostics(diagnostics: SysmlDiagnostic[]): SysmlDiagnostic[] {
  const seen = new Set<string>();
  const unique = diagnostics.filter(d => {
    const key = diagnosticKey(d);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort(compareDiagnostics);
  return unique;
}

function diagnostic(code: string, elementId: string, propertyPath: string | undefined, message: string): SysmlDiagnostic {
  return { code, severity: 'error', elementId, propertyPath, message };
}
