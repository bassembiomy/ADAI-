import type {
  BlockDefinition,
  PortDefinition,
  PropertyDefinition,
  SysmlDefinition,
  SysmlRelationship,
  SysmlRepository,
} from './model';
import type { SysmlDiagnostic } from './validation';

export interface ResolvedBlockFeatures {
  properties: PropertyDefinition[];
  ports: PortDefinition[];
  operations: string[];
  constraints: string[];
  diagnostics: SysmlDiagnostic[];
}

export interface BddRelationshipView extends SysmlRelationship {
  notation: 'solid-line' | 'filled-diamond' | 'hollow-diamond' | 'hollow-triangle' | 'dashed-arrow';
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
  const visited = new Set<string>();
  const visiting = new Set<string>();

  const merge = (current: BlockDefinition) => {
    if (visited.has(current.id)) return;
    if (visiting.has(current.id)) {
      diagnostics.push(diagnostic('INHERITANCE_CYCLE', current.id, 'supertypeIds', `Inheritance cycle includes ${current.id}`));
      return;
    }
    visiting.add(current.id);
    for (const parentId of current.supertypeIds ?? []) {
      const parent = asBlock(repo.definitions[parentId]);
      if (parent) merge(parent);
      else diagnostics.push(diagnostic('MISSING_SUPERTYPE', current.id, 'supertypeIds', `Supertype ${parentId} does not exist`));
    }
    for (const property of current.properties) {
      if (property.redefinesId) {
        const index = properties.findIndex(candidate => candidate.id === property.redefinesId);
        if (index >= 0) properties.splice(index, 1, property);
        else properties.push(property);
      } else if (!properties.some(candidate => candidate.id === property.id)) properties.push(property);
    }
    for (const port of current.ports) {
      const sameName = ports.findIndex(candidate => candidate.name === port.name);
      if (sameName >= 0) ports.splice(sameName, 1, port);
      else ports.push(port);
    }
    for (const operation of current.operations) if (!operations.includes(operation)) operations.push(operation);
    for (const constraint of current.constraints) if (!constraints.includes(constraint)) constraints.push(constraint);
    visiting.delete(current.id);
    visited.add(current.id);
  };
  merge(block);
  return { properties, ports, operations, constraints, diagnostics };
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
    if (!type || type.kind !== 'interface') diagnostics.push(diagnostic('MISSING_PORT_TYPE', port.id, 'typeId', `Port type ${port.typeId} must be an InterfaceDefinition`));
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
  if (kind === 'composition') return 'filled-diamond';
  if (kind === 'sharedAggregation') return 'hollow-diamond';
  if (kind === 'generalization') return 'hollow-triangle';
  if (kind === 'dependency' || kind === 'allocation') return 'dashed-arrow';
  return 'solid-line';
}

function diagnostic(code: string, elementId: string, propertyPath: string | undefined, message: string): SysmlDiagnostic {
  return { code, severity: 'error', elementId, propertyPath, message };
}
