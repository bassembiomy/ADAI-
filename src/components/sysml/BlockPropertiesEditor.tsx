import React from 'react';
import type { BlockData, ValuePropertyData } from '../../types/sysml_types';

interface BlockPropertiesEditorProps {
  properties: ValuePropertyData[];
  typeOptions: Pick<BlockData, 'id' | 'name' | 'stereotype'>[];
  inheritedProperties: ValuePropertyData[];
  onChange: (properties: ValuePropertyData[]) => void;
}

const PROPERTY_KINDS: NonNullable<ValuePropertyData['kind']>[] = ['value', 'part', 'reference', 'flow'];

export function BlockPropertiesEditor({ properties, typeOptions, inheritedProperties, onChange }: BlockPropertiesEditorProps) {
  const update = (index: number, changes: Partial<ValuePropertyData>) => {
    onChange(properties.map((property, propertyIndex) => propertyIndex === index ? { ...property, ...changes } : property));
  };

  const remove = (index: number) => onChange(properties.filter((_, propertyIndex) => propertyIndex !== index));
  const add = () => onChange([...properties, {
    id: crypto.randomUUID(),
    name: 'property',
    type: typeOptions[0]?.name || '',
    typeId: typeOptions[0]?.id,
    kind: 'value',
    multiplicity: '1',
    unique: true,
  }]);

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
      <button type="button" onClick={() => remove(index)} className="rounded border px-2 py-1 text-xs">Remove property</button>
    </fieldset>)}
    <button type="button" onClick={add} className="rounded border px-2 py-1 text-xs">Add property</button>
  </div>;
}
