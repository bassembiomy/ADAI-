import { parseMultiplicity } from '../engine/sysml/model';
import type { BlockData, RelationshipData, ValuePropertyData } from '../types/sysml_types';

export interface PropertyValidationResult { valid: boolean; codes: string[]; messages: string[]; }

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
