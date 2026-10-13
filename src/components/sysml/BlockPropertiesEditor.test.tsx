import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BlockPropertiesEditor, adaptPropertyKindForType, createDefaultProperty } from './BlockPropertiesEditor';

describe('BlockPropertiesEditor', () => {
  it('creates a valid default property when the first available type is a block', () => {
    const created = createDefaultProperty([
      { id: 'block', name: 'Motor', stereotype: 'block' },
      { id: 'real', name: 'Real', stereotype: 'valueType' },
    ]);
    expect(created.kind).toBe('value');
    expect(created.typeId).toBe('real');
  });

  it('creates a part property when only block types are available', () => {
    const created = createDefaultProperty([{ id: 'block', name: 'Motor', stereotype: 'block' }]);
    expect(created.kind).toBe('part');
    expect(created.typeId).toBe('block');
  });
  it('renders typed property semantics and accessible controls', () => {
    const html = renderToStaticMarkup(<BlockPropertiesEditor properties={[{ id: 'p', name: 'speed', type: 'Velocity', typeId: 'Velocity', kind: 'flow', multiplicity: '0..*', ordered: true, unique: false }]} typeOptions={[{ id: 'Velocity', name: 'Velocity', stereotype: 'valueType' }]} inheritedProperties={[]} onChange={() => {}} />);
    expect(html).toContain('Property kind');
    expect(html).toContain('Multiplicity');
    expect(html).toContain('Redefines');
    expect(html).toContain('Subsets');
    expect(html).toContain('ordered');
    expect(html).toContain('nonunique');
  });

  it('exposes inherited features with annotated origin, read-only state, and redefine/subset actions', () => {
    const html = renderToStaticMarkup(
      <BlockPropertiesEditor
        properties={[]}
        typeOptions={[{ id: 'Velocity', name: 'Velocity', stereotype: 'valueType' }]}
        inheritedProperties={[{ id: 'ip1', name: 'chassisId', type: 'Velocity', typeId: 'Velocity', kind: 'value', multiplicity: '1' }]}
        annotatedInheritedProperties={[{ id: 'ip1', name: 'chassisId', type: 'Velocity', typeId: 'Velocity', kind: 'value', multiplicity: '1', originId: 'BaseVehicle', originName: 'BaseVehicle', isInherited: true }]}
        onChange={() => {}}
      />
    );
    expect(html).toContain('Inherited from BaseVehicle');
    expect(html).toContain('aria-readonly="true"');
    expect(html).toContain('Redefine');
    expect(html).toContain('Subset');
  });

  it('renders an inheritance panel with parent chain, cycle/leaf diagnostics, and abstract guidance', () => {
    const html = renderToStaticMarkup(
      <BlockPropertiesEditor
        properties={[]}
        typeOptions={[{ id: 'Velocity', name: 'Velocity', stereotype: 'valueType' }]}
        inheritedProperties={[]}
        parentChain={[{ id: 'Base', name: 'Base' }]}
        isAbstract={true}
        diagnostics={[
          { code: 'LEAF_SPECIALIZATION', severity: 'error', elementId: 'b1', propertyPath: 'supertypeIds', message: 'Leaf block Base cannot be specialized' },
          { code: 'INHERITANCE_CYCLE', severity: 'error', elementId: 'b1', propertyPath: 'supertypeIds', message: 'Inheritance cycle includes b1' },
        ]}
        onChange={() => {}}
      />
    );
    expect(html).toContain('Inheritance panel');
    expect(html).toContain('Base');
    expect(html).toContain('[LEAF_SPECIALIZATION]');
    expect(html).toContain('[INHERITANCE_CYCLE]');
    expect(html).toContain('[ABSTRACT_INSTANTIATION]');
  });

  it('renders canonical diagnostic codes for type, multiplicity, and unit validation', () => {
    const html = renderToStaticMarkup(
      <BlockPropertiesEditor
        properties={[{ id: 'p', name: 'speed', type: '', kind: 'value', multiplicity: '0..*' }]}
        typeOptions={[{ id: 'Velocity', name: 'Velocity', stereotype: 'valueType' }]}
        inheritedProperties={[]}
        diagnostics={[
          { code: 'MISSING_PROPERTY_TYPE', severity: 'error', elementId: 'p', propertyPath: 'typeId', message: 'Property type is missing or incompatible with value' },
          { code: 'INVALID_SUBSETTING_MULTIPLICITY', severity: 'error', elementId: 'p', propertyPath: 'subsetsId', message: 'Property is not a valid subset' },
          { code: 'INCOMPATIBLE_REDEFINITION', severity: 'error', elementId: 'p', propertyPath: 'redefinesId', message: 'Property does not conform' },
        ]}
        onChange={() => {}}
      />
    );
    expect(html).toContain('[MISSING_PROPERTY_TYPE]');
    expect(html).toContain('[INVALID_SUBSETTING_MULTIPLICITY]');
    expect(html).toContain('[INCOMPATIBLE_REDEFINITION]');
  });

  it('supports keyboard navigation, announces an empty state, and caps large inherited lists with a count', () => {
    const withRows = renderToStaticMarkup(
      <BlockPropertiesEditor
        properties={[]}
        typeOptions={[{ id: 'Velocity', name: 'Velocity', stereotype: 'valueType' }]}
        inheritedProperties={[{ id: 'ip1', name: 'chassisId', type: 'Velocity', typeId: 'Velocity', kind: 'value', multiplicity: '1' }]}
        onChange={() => {}}
      />
    );
    expect(withRows).toContain('tabindex="0"');

    const empty = renderToStaticMarkup(
      <BlockPropertiesEditor
        properties={[]}
        typeOptions={[{ id: 'Velocity', name: 'Velocity', stereotype: 'valueType' }]}
        inheritedProperties={[]}
        onChange={() => {}}
      />
    );
    expect(empty).toContain('No inherited features');

    const many = Array.from({ length: 120 }, (_, i) => ({ id: `ip${i}`, name: `prop${String(i).padStart(3, '0')}`, type: 'Velocity', typeId: 'Velocity', kind: 'value' as const, multiplicity: '1' }));
    const capped = renderToStaticMarkup(
      <BlockPropertiesEditor
        properties={[]}
        typeOptions={[{ id: 'Velocity', name: 'Velocity', stereotype: 'valueType' }]}
        inheritedProperties={many}
        onChange={() => {}}
      />
    );
    expect(capped).toContain('120 total');
    expect(capped).toContain('more inherited features');
    expect(capped).not.toContain('prop119');
  });

  it('adapts property kind appropriately when a block or valueType is selected', () => {
    expect(adaptPropertyKindForType('value', 'block')).toBe('part');
    expect(adaptPropertyKindForType('part', 'valueType')).toBe('value');
    expect(adaptPropertyKindForType('part', 'enumeration')).toBe('value');
    expect(adaptPropertyKindForType('reference', 'block')).toBe('reference');
    expect(adaptPropertyKindForType('flow', 'valueType')).toBe('flow');
  });

  it('shows structural controls without value-only fields for part properties', () => {
    const html = renderToStaticMarkup(
      <BlockPropertiesEditor
        properties={[{ id: 'part', name: 'motor', type: 'Motor', typeId: 'motor', kind: 'part', multiplicity: '1' }]}
        typeOptions={[{ id: 'motor', name: 'Motor', stereotype: 'block' }]}
        inheritedProperties={[]}
        onChange={() => {}}
      />
    );
    expect(html).toContain('Composite part');
    expect(html).not.toContain('Default value');
    expect(html).not.toContain('Unit');
    expect(html).not.toContain('Dimension');
  });
});
