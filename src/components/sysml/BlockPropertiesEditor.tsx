import React from 'react';
import type { BlockData, ValuePropertyData } from '../../types/sysml_types';
import type { SysmlDiagnostic } from '../../engine/sysml/validation';

export interface AnnotatedValueProperty extends ValuePropertyData {
  originId: string;
  originName: string;
  isInherited: boolean;
}

export interface BlockPropertiesEditorProps {
  properties: ValuePropertyData[];
  typeOptions: Pick<BlockData, 'id' | 'name' | 'stereotype'>[];
  inheritedProperties: ValuePropertyData[];
  annotatedInheritedProperties?: AnnotatedValueProperty[];
  parentChain?: Array<{ id: string; name: string }>;
  diagnostics?: SysmlDiagnostic[];
  isAbstract?: boolean;
  maxVisibleInherited?: number;
  onChange: (properties: ValuePropertyData[]) => void;
  onRedefine?: (property: ValuePropertyData) => void;
  onSubset?: (property: ValuePropertyData) => void;
}

const PROPERTY_KINDS: NonNullable<ValuePropertyData['kind']>[] = ['value', 'part', 'reference', 'flow'];

// Canonical inheritance/governance codes surfaced in the inheritance panel
// (OMG SysML 1.6 ADIA profile; mirrors policy.ts + bdd.ts resolveInheritedFeatures).
const INHERITANCE_PANEL_CODES = new Set([
  'INHERITANCE_CYCLE',
  'LEAF_SPECIALIZATION',
  'ABSTRACT_INSTANTIATION',
  'MISSING_SUPERTYPE',
]);

// Deterministic capped render for large inherited-feature lists.
const DEFAULT_MAX_VISIBLE_INHERITED = 50;

export function createDefaultProperty(typeOptions: Pick<BlockData, 'id' | 'name' | 'stereotype'>[]): ValuePropertyData {
  const valueType = typeOptions.find(option => option.stereotype === 'valueType' || option.stereotype === 'enumeration');
  const blockType = typeOptions.find(option => option.stereotype === 'block');
  const selected = valueType ?? blockType ?? typeOptions[0];
  const kind: ValuePropertyData['kind'] = valueType ? 'value' : blockType ? 'part' : 'value';
  return {
    id: crypto.randomUUID(),
    name: 'property',
    type: selected?.name || '',
    typeId: selected?.id,
    kind,
    multiplicity: '1',
    unique: true,
  };
}

type OriginView = ValuePropertyData & { originId: string; originName: string };

function withOrigin(property: ValuePropertyData): OriginView {
  const candidate = property as ValuePropertyData & { originId?: string; originName?: string; inheritedFromId?: string };
  const originId = candidate.originId ?? candidate.inheritedFromId ?? 'Base';
  const originName = candidate.originName ?? candidate.inheritedFromId ?? 'Base';
  return { ...property, originId, originName };
}

export function BlockPropertiesEditor({
  properties,
  typeOptions,
  inheritedProperties,
  annotatedInheritedProperties,
  parentChain,
  diagnostics = [],
  isAbstract = false,
  maxVisibleInherited = DEFAULT_MAX_VISIBLE_INHERITED,
  onChange,
  onRedefine,
  onSubset,
}: BlockPropertiesEditorProps) {
  const update = (index: number, changes: Partial<ValuePropertyData>) => {
    onChange(properties.map((property, propertyIndex) => propertyIndex === index ? { ...property, ...changes } : property));
  };

  const remove = (index: number) => onChange(properties.filter((_, propertyIndex) => propertyIndex !== index));
  const add = () => onChange([...properties, createDefaultProperty(typeOptions)]);

  const handleRedefine = (inherited: ValuePropertyData) => {
    if (onRedefine) {
      onRedefine(inherited);
      return;
    }
    onChange([...properties, {
      id: crypto.randomUUID(),
      name: inherited.name,
      type: inherited.type,
      typeId: inherited.typeId,
      kind: inherited.kind,
      multiplicity: inherited.multiplicity,
      redefinesId: inherited.id,
    }]);
  };

  const handleSubset = (inherited: ValuePropertyData) => {
    if (onSubset) {
      onSubset(inherited);
      return;
    }
    onChange([...properties, {
      id: crypto.randomUUID(),
      name: `${inherited.name}Subset`,
      type: inherited.type,
      typeId: inherited.typeId,
      kind: inherited.kind,
      multiplicity: inherited.multiplicity,
      subsetsId: inherited.id,
    }]);
  };

  // Prefer annotated origin fields (bdd resolveInheritedFeatures); fall back
  // to the plain inherited list. Deterministic ordering (name, then id)
  // matches policy resolveInheritance stability.
  const annotatedSource: OriginView[] = annotatedInheritedProperties
    ?? inheritedProperties.map(withOrigin);
  const sortedInherited = [...annotatedSource].sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  );
  const visibleInherited = sortedInherited.slice(0, maxVisibleInherited);
  const hiddenInheritedCount = sortedInherited.length - visibleInherited.length;

  const inheritancePanelDiagnostics = diagnostics.filter(d => INHERITANCE_PANEL_CODES.has(d.code));
  const abstractGuidance = isAbstract
    ? 'This block is abstract and cannot be directly instantiated; specialize it with a concrete subtype'
    : undefined;
  const hasInheritanceSignal = (parentChain ?? []).length > 0
    || inheritancePanelDiagnostics.length > 0
    || abstractGuidance !== undefined;

  const diagnosticsFor = (elementId: string) => diagnostics.filter(d => d.elementId === elementId);

  return <div className="space-y-3" aria-label="Block properties">
    {properties.map((property, index) => <fieldset key={property.id} className="rounded border border-gray-700 p-2 space-y-2">
      <legend className="px-1 text-xs">Property {index + 1}</legend>
      <label className="block text-xs">Name
        <input aria-label={`Property ${index + 1} name`} value={property.name} onChange={event => update(index, { name: event.target.value })} className="w-full rounded border bg-transparent px-2 py-1" />
      </label>
      <label className="block text-xs">Property kind
        <select aria-label={`Property ${index + 1} kind`} value={property.kind || 'value'} onChange={event => update(index, { kind: event.target.value as ValuePropertyData['kind'] })} className="w-full rounded border bg-transparent px-2 py-1">
          {PROPERTY_KINDS.map(kind => <option key={kind} value={kind}>{kind}</option>)}
        </select>
      </label>
      <label className="block text-xs">Type
        <select aria-label={`Property ${index + 1} type`} value={property.typeId || property.type} onChange={event => {
          const selected = typeOptions.find(option => option.id === event.target.value);
          update(index, { typeId: event.target.value, type: selected?.name || event.target.value });
        }} className="w-full rounded border bg-transparent px-2 py-1">
          <option value="">Select a type</option>
          {typeOptions.map(option => <option key={option.id} value={option.id}>{option.name} «{option.stereotype}»</option>)}
        </select>
      </label>
      <label className="block text-xs">Multiplicity
        <input aria-label={`Property ${index + 1} multiplicity`} value={property.multiplicity || '1'} onChange={event => update(index, { multiplicity: event.target.value })} className="w-full rounded border bg-transparent px-2 py-1" />
      </label>
      <div className="flex flex-wrap gap-3 text-xs">
        <label><input type="checkbox" checked={!!property.ordered} onChange={event => update(index, { ordered: event.target.checked })} /> ordered</label>
        <label><input type="checkbox" checked={property.unique === false} onChange={event => update(index, { unique: !event.target.checked })} /> nonunique</label>
        <label><input type="checkbox" checked={!!property.isDerived} onChange={event => update(index, { isDerived: event.target.checked })} /> derived</label>
      </div>
      <label className="block text-xs">Default value
        <input value={property.defaultValue || ''} onChange={event => update(index, { defaultValue: event.target.value || undefined })} className="w-full rounded border bg-transparent px-2 py-1" />
      </label>
      <label className="block text-xs">Unit
        <input value={property.unit || ''} onChange={event => update(index, { unit: event.target.value || undefined })} className="w-full rounded border bg-transparent px-2 py-1" />
      </label>
      <label className="block text-xs">Dimension
        <input value={property.dimension || ''} onChange={event => update(index, { dimension: event.target.value || undefined })} className="w-full rounded border bg-transparent px-2 py-1" />
      </label>
      <label className="block text-xs">Redefines
        <select value={property.redefinesId || ''} onChange={event => update(index, { redefinesId: event.target.value || undefined })} className="w-full rounded border bg-transparent px-2 py-1">
          <option value="">None</option>
          {inheritedProperties.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
      </label>
      <label className="block text-xs">Subsets
        <select value={property.subsetsId || ''} onChange={event => update(index, { subsetsId: event.target.value || undefined })} className="w-full rounded border bg-transparent px-2 py-1">
          <option value="">None</option>
          {inheritedProperties.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
        </select>
      </label>
      {diagnosticsFor(property.id).length > 0 && (
        <div role="alert" className="space-y-1 rounded border border-red-700 bg-red-950/40 p-1.5 text-xs text-red-300">
          {diagnosticsFor(property.id).map((d, i) => (
            <div key={i} className="flex items-start gap-1">
              <span className="font-semibold text-red-400">[{d.code}]</span>
              <span>{d.message}</span>
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={() => remove(index)} className="rounded border px-2 py-1 text-xs">Remove property</button>
    </fieldset>)}
    <button type="button" onClick={add} className="rounded border px-2 py-1 text-xs">Add property</button>

    <div className="space-y-2 rounded border border-gray-800 bg-[#141414] p-2 text-xs" aria-label="Inheritance panel">
      <h4 className="font-semibold uppercase text-gray-400">Inheritance panel</h4>
      <div aria-label="Parent chain" className="text-gray-300">
        {(parentChain ?? []).length > 0
          ? parentChain!.map(ancestor => ancestor.name).join(' → ')
          : 'No supertypes — root block'}
      </div>
      {abstractGuidance !== undefined && (
        <div role="alert" className="flex items-start gap-1 text-amber-300">
          <span className="font-semibold text-amber-400">[ABSTRACT_INSTANTIATION]</span>
          <span>{abstractGuidance}</span>
        </div>
      )}
      {inheritancePanelDiagnostics.length > 0 && (
        <div role="alert" aria-label="Inheritance diagnostics" className="space-y-1 text-red-300">
          {inheritancePanelDiagnostics.map((d, i) => (
            <div key={i} className="flex items-start gap-1">
              <span className="font-semibold text-red-400">[{d.code}]</span>
              <span>{d.message}</span>
            </div>
          ))}
        </div>
      )}
      {!hasInheritanceSignal && (
        <div className="text-gray-500">No inheritance issues detected</div>
      )}
    </div>

    <div className="space-y-2 rounded border border-gray-800 bg-[#141414] p-2 text-xs">
      <h4 className="font-semibold uppercase text-gray-400">Inherited Features</h4>
      {sortedInherited.length === 0 ? (
        <div className="text-gray-500">No inherited features to display</div>
      ) : (
        <div role="list" aria-label="Inherited features">
          {visibleInherited.map(inherited => (
            <div
              key={inherited.id}
              role="listitem"
              aria-readonly="true"
              tabIndex={0}
              aria-label={`Inherited feature ${inherited.name} from ${inherited.originName}`}
              onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  handleRedefine(inherited);
                }
              }}
              className="flex items-center justify-between border-b border-gray-800 py-1"
            >
              <div>
                <span className="font-mono text-gray-300">{inherited.name}</span>
                <span className="text-gray-500"> : {inherited.typeId || inherited.type} [{inherited.kind || 'value'}]</span>
                <div className="text-[10px] text-gray-500">Inherited from {inherited.originName} ({inherited.originId})</div>
              </div>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => handleRedefine(inherited)}
                  className="rounded border border-gray-700 px-1.5 py-0.5 text-[10px] text-gray-300 hover:bg-gray-800"
                >
                  Redefine
                </button>
                <button
                  type="button"
                  onClick={() => handleSubset(inherited)}
                  className="rounded border border-gray-700 px-1.5 py-0.5 text-[10px] text-gray-300 hover:bg-gray-800"
                >
                  Subset
                </button>
              </div>
            </div>
          ))}
          {hiddenInheritedCount > 0 && (
            <div className="pt-1 text-gray-500">
              + {hiddenInheritedCount} more inherited features ({sortedInherited.length} total)
            </div>
          )}
        </div>
      )}
    </div>
  </div>;
}
