import { parseMultiplicity } from '../engine/sysml/model';
import type { BlockData, RelationshipData, ValuePropertyData } from '../types/sysml_types';

export interface PropertyValidationResult { valid: boolean; codes: string[]; messages: string[]; }

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;
const OPERATION = /^[A-Za-z_][A-Za-z0-9_]*(?:\s*\([^\n]*\))?(?:\s*:\s*[A-Za-z_][A-Za-z0-9_:]*)?$/;
const REQUIREMENT_ID = /^[A-Za-z][A-Za-z0-9._-]*$/;
const PORT_DIRECTIONS = new Set(['in', 'out', 'inout']);
const REQUIREMENT_STATUSES = new Set(['Draft', 'Approved', 'Implemented', 'Verified', 'Failed', 'Stale', 'Retired']);

export function validateLegacyBlockEdit(
  blocks: readonly BlockData[], relationships: readonly RelationshipData[], blockId: string,
): PropertyValidationResult {
  const block = blocks.find(item => item.id === blockId);
  if (!block) return { valid: false, codes: ['BLOCK_NOT_FOUND'], messages: [`Block ${blockId} does not exist`] };
  const codes: string[] = [];
  const messages: string[] = [];
  const add = (code: string, message: string) => { codes.push(code); messages.push(message); };
  if (!IDENTIFIER.test(block.name.trim())) add('INVALID_BLOCK_NAME', `Block name "${block.name}" must be a valid SysML identifier`);
  if ((block.namespace ?? []).some(segment => !IDENTIFIER.test(segment))) add('INVALID_NAMESPACE', 'Namespace segments must be valid SysML identifiers');
  if (block.stereotype === 'requirement') {
    if (!block.reqId || !REQUIREMENT_ID.test(block.reqId)) add('INVALID_REQUIREMENT_ID', `Requirement ID "${block.reqId || ''}" is invalid`);
    if (block.status && !REQUIREMENT_STATUSES.has(block.status)) add('INVALID_REQUIREMENT_STATUS', `Requirement status "${block.status}" is not supported`);
  }
  for (const operation of block.operations) {
    if (!OPERATION.test(operation.trim())) add('INVALID_OPERATION_SIGNATURE', `Operation "${operation}" is not a valid SysML signature`);
  }
  for (const constraint of block.constraints) {
    if (!constraint.trim()) add('EMPTY_CONSTRAINT', 'Constraints cannot be empty');
  }
  for (const port of block.ports) {
    if (!IDENTIFIER.test(port.name.trim())) add('INVALID_PORT_NAME', `Port name "${port.name}" must be a valid SysML identifier`);
    if (!port.type.trim()) add('MISSING_PORT_TYPE', `Port ${port.name || port.id} must have a type`);
    if (port.direction && !PORT_DIRECTIONS.has(port.direction)) add('INVALID_PORT_DIRECTION', `Port ${port.name || port.id} has invalid direction ${port.direction}`);
  }
  const propertyResult = validateLegacyBlockProperties(blocks, relationships, blockId);
  propertyResult.codes.forEach((code, index) => add(code, propertyResult.messages[index] ?? code));
  return { valid: codes.length === 0, codes: [...new Set(codes)], messages };
}

export function validateLegacyBlockProperties(
  blocks: readonly BlockData[], relationships: readonly RelationshipData[], blockId: string,
): PropertyValidationResult {
  const block = blocks.find(item => item.id === blockId);
  if (!block) return { valid: false, codes: ['BLOCK_NOT_FOUND'], messages: [`Block ${blockId} does not exist`] };
  const codes: string[] = [];
  const messages: string[] = [];
  const add = (code: string, message: string) => { codes.push(code); messages.push(message); };
  const names = new Set<string>();
  const inherited = inheritedProperties(blocks, relationships, blockId);
  for (const property of block.properties) {
    if (names.has(property.name)) add('DUPLICATE_PROPERTY_NAME', `Property name ${property.name} is duplicated`);
    names.add(property.name);
    let parsed: ReturnType<typeof parseMultiplicity> | undefined;
    try { parsed = parseMultiplicity(property.multiplicity || '1'); } catch { add('INVALID_MULTIPLICITY', `${property.name} has invalid multiplicity ${property.multiplicity}`); }
    const typeId = property.typeId || property.type;
    const type = blocks.find(item => item.id === typeId || item.name === typeId);
    if (!type || !validType(property.kind || 'value', type.stereotype)) add('INVALID_PROPERTY_TYPE', `${property.name} has incompatible type ${typeId}`);
    if (property.redefinesId) {
      const original = inherited.find(item => item.id === property.redefinesId);
      if (!original || (original.kind || 'value') !== (property.kind || 'value') || (original.typeId || original.type) !== typeId || !parsed || !multiplicityAtMost(parsed, safeParse(original.multiplicity))) {
        add('INCOMPATIBLE_REDEFINITION', `${property.name} cannot redefine ${property.redefinesId}`);
      }
    }
    if (property.subsetsId) {
      const original = inherited.find(item => item.id === property.subsetsId);
      if (!original || (original.kind || 'value') !== (property.kind || 'value') || (original.typeId || original.type) !== typeId || !parsed || !multiplicityAtMost(parsed, safeParse(original.multiplicity))) {
        add('INVALID_SUBSETTING', `${property.name} is not a valid subset of ${property.subsetsId}`);
      }
    }
  }
  return { valid: codes.length === 0, codes: [...new Set(codes)], messages };
}

export function inheritedProperties(blocks: readonly BlockData[], relationships: readonly RelationshipData[], blockId: string): ValuePropertyData[] {
  const result: ValuePropertyData[] = [];
  const visited = new Set<string>();
  const collect = (id: string) => {
    if (visited.has(id)) return;
    visited.add(id);
    const parents = relationships.filter(item => item.type === 'generalization' && item.sourceId === id).map(item => item.targetId);
    for (const parentId of parents) collect(parentId);
    const block = blocks.find(item => item.id === id);
    if (block && id !== blockId) result.push(...block.properties);
  };
  collect(blockId);
  return result;
}

export function formatLegacyProperty(property: ValuePropertyData): string {
  const modifiers = [property.ordered ? 'ordered' : '', property.unique === false ? 'nonunique' : property.unique ? 'unique' : ''].filter(Boolean);
  return [
    `${property.isDerived ? '/' : ''}${property.name}: ${property.typeId || property.type} [${property.multiplicity || '1'}]`,
    modifiers.length ? `{${modifiers.join(', ')}}` : '',
    `«${property.kind || 'value'}»`,
    property.unit ? `{unit=${property.unit}}` : '',
    property.dimension ? `{dimension=${property.dimension}}` : '',
    property.redefinesId ? `redefines ${property.redefinesId}` : '',
    property.subsetsId ? `subsets ${property.subsetsId}` : '',
  ].filter(Boolean).join(' ');
}

function validType(kind: NonNullable<ValuePropertyData['kind']>, stereotype: string): boolean {
  if (kind === 'value') return stereotype === 'valueType' || stereotype === 'enumeration';
  if (kind === 'part') return stereotype === 'block';
  if (kind === 'flow') return ['valueType', 'enumeration', 'interface', 'interfaceBlock'].includes(stereotype);
  return ['block', 'interface', 'interfaceBlock', 'valueType', 'enumeration'].includes(stereotype);
}
function safeParse(value?: string) { try { return parseMultiplicity(value || '1'); } catch { return undefined; } }
function multiplicityAtMost(candidate: ReturnType<typeof parseMultiplicity>, original?: ReturnType<typeof parseMultiplicity>): boolean {
  if (!original) return false;
  if (candidate.lower < original.lower) return false;
  return original.upper === '*' || (candidate.upper !== '*' && candidate.upper <= original.upper);
}
