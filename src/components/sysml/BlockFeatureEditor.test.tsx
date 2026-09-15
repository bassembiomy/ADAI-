import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BlockFeatureEditor } from './BlockFeatureEditor';
import type { BlockDefinition, SysmlDefinition } from '../../engine/sysml/model';

describe('BlockFeatureEditor', () => {
  const definitions: Record<string, SysmlDefinition> = {
    Real: { id: 'Real', name: 'Real', namespace: [], kind: 'valueType', unit: 'kg', dimension: 'mass' },
    PowerIF: { id: 'PowerIF', name: 'PowerIF', namespace: [], kind: 'interface', features: ['voltage'] },
    EngineBlock: { id: 'EngineBlock', name: 'EngineBlock', namespace: [], kind: 'block', isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [] },
  };

  const currentBlock: BlockDefinition = {
    id: 'Vehicle',
    name: 'Vehicle',
    namespace: [],
    kind: 'block',
    isAbstract: true,
    isLeaf: false,
    properties: [
      { id: 'p1', name: 'speed', kind: 'value', typeId: 'Real', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } },
    ],
    ports: [
      { id: 'port1', name: 'powerIn', kind: 'proxy', typeId: 'PowerIF', direction: 'in', isConjugated: true, multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } },
      { id: 'port2', name: 'motor', kind: 'full', typeId: 'EngineBlock', direction: 'inout', isConjugated: false, multiplicity: { lower: 1, upper: 1, ordered: false, unique: true } },
    ],
    operations: ['start()'],
    constraints: ['speed >= 0'],
  };

  const inheritedFeatures = {
    properties: [
      { id: 'ip1', name: 'chassisId', kind: 'value' as const, typeId: 'Real', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true }, inheritedFromId: 'BaseVehicle' },
    ],
    ports: [],
    operations: ['baseCheck()'],
    constraints: [],
  };

  it('renders typed selectors for ValueType, Block, Interface and explicit property kinds', () => {
    const html = renderToStaticMarkup(
      <BlockFeatureEditor
        block={currentBlock}
        definitions={definitions}
        inheritedFeatures={inheritedFeatures}
        onChange={vi.fn()}
      />
    );

    // Semantic editor class
    expect(html).toContain('sysml-editor');

    // Property kind selector
    expect(html).toContain('value');
    expect(html).toContain('part');
    expect(html).toContain('reference');
    expect(html).toContain('flow');

    // Type options with stereotypes
    expect(html).toContain('Real «valueType»');
    expect(html).toContain('EngineBlock «block»');
    expect(html).toContain('PowerIF «interface»');

    // Full / Proxy port terminology and conjugation
    expect(html).toContain('proxy');
    expect(html).toContain('full');
    expect(html).toContain('Conjugated');

    // Inherited features labeled with origin
    expect(html).toContain('Inherited from BaseVehicle');
    expect(html).toContain('chassisId');
    expect(html).toContain('Redefine');
    expect(html).toContain('Subset');
  });

  it('exposes inherited features with annotated origin, read-only state, and redefine/subset actions', () => {
    const html = renderToStaticMarkup(
      <BlockFeatureEditor
        block={currentBlock}
        definitions={definitions}
        inheritedFeatures={{
          ...inheritedFeatures,
          annotatedProperties: [
            { id: 'ip1', name: 'chassisId', kind: 'value', typeId: 'Real', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true }, originId: 'BaseVehicle', originName: 'BaseVehicle', isInherited: true },
          ],
        }}
        onChange={vi.fn()}
      />
    );

    expect(html).toContain('Inherited from BaseVehicle');
    expect(html).toContain('aria-readonly="true"');
    expect(html).toContain('Redefine');
    expect(html).toContain('Subset');
  });

  it('renders an inheritance panel with parent chain, cycle/leaf diagnostics, and abstract guidance in deterministic order', () => {
    const html = renderToStaticMarkup(
      <BlockFeatureEditor
        block={currentBlock}
        definitions={definitions}
        inheritedFeatures={{
          ...inheritedFeatures,
          annotatedProperties: [
            { id: 'ip2', name: 'zProp', kind: 'value', typeId: 'Real', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true }, originId: 'Mid', originName: 'Mid', isInherited: true },
            { id: 'ip1', name: 'aProp', kind: 'value', typeId: 'Real', multiplicity: { lower: 1, upper: 1, ordered: false, unique: true }, originId: 'Base', originName: 'Base', isInherited: true },
          ],
        }}
        parentChain={[{ id: 'Base', name: 'Base' }, { id: 'Mid', name: 'Mid' }]}
        diagnostics={[
          { code: 'LEAF_SPECIALIZATION', severity: 'error', elementId: 'Vehicle', propertyPath: 'supertypeIds', message: 'Leaf block Base cannot be specialized' },
          { code: 'INHERITANCE_CYCLE', severity: 'error', elementId: 'Vehicle', propertyPath: 'supertypeIds', message: 'Inheritance cycle includes Vehicle' },
        ]}
        onChange={vi.fn()}
      />
    );

    expect(html).toContain('Inheritance panel');
    expect(html).toContain('Base');
    expect(html).toContain('Mid');
    expect(html).toContain('[LEAF_SPECIALIZATION]');
    expect(html).toContain('[INHERITANCE_CYCLE]');
    expect(html).toContain('[ABSTRACT_INSTANTIATION]');
    // Deterministic ordering: aProp renders before zProp
    expect(html.indexOf('aProp')).toBeLessThan(html.indexOf('zProp'));
  });

  it('renders canonical diagnostic codes for type, multiplicity, and unit validation', () => {
    const html = renderToStaticMarkup(
      <BlockFeatureEditor
        block={currentBlock}
        definitions={definitions}
        inheritedFeatures={inheritedFeatures}
        diagnostics={[
          { code: 'MISSING_PROPERTY_TYPE', severity: 'error', elementId: 'p1', propertyPath: 'typeId', message: 'Property type Real is missing or incompatible with value' },
          { code: 'INCOMPATIBLE_REDEFINITION', severity: 'error', elementId: 'p1', propertyPath: 'redefinesId', message: 'Property does not conform to redefined feature ip1' },
          { code: 'INVALID_SUBSETTING_MULTIPLICITY', severity: 'error', elementId: 'p1', propertyPath: 'subsetsId', message: 'Property is not a valid subset of ip1' },
        ]}
        onChange={vi.fn()}
      />
    );

    expect(html).toContain('[MISSING_PROPERTY_TYPE]');
    expect(html).toContain('[INCOMPATIBLE_REDEFINITION]');
    expect(html).toContain('[INVALID_SUBSETTING_MULTIPLICITY]');
  });

  it('supports keyboard navigation on inherited rows and announces an empty state', () => {
    const withRows = renderToStaticMarkup(
      <BlockFeatureEditor
        block={currentBlock}
        definitions={definitions}
        inheritedFeatures={inheritedFeatures}
        onChange={vi.fn()}
      />
    );
    expect(withRows).toContain('tabindex="0"');

    const emptyBlock: BlockDefinition = { ...currentBlock, properties: [], ports: [] };
    const empty = renderToStaticMarkup(
      <BlockFeatureEditor block={emptyBlock} definitions={definitions} onChange={vi.fn()} />
    );
    expect(empty).toContain('No inherited features');
  });

  it('caps large inherited-feature lists deterministically with a count', () => {
    const many = Array.from({ length: 120 }, (_, i) => ({
      id: `ip${i}`, name: `prop${String(i).padStart(3, '0')}`, kind: 'value' as const, typeId: 'Real',
      multiplicity: { lower: 1, upper: 1 as const, ordered: false, unique: true },
      originId: 'Base', originName: 'Base', isInherited: true,
    }));
    const html = renderToStaticMarkup(
      <BlockFeatureEditor
        block={currentBlock}
        definitions={definitions}
        inheritedFeatures={{ properties: [], ports: [], operations: [], constraints: [], annotatedProperties: many }}
        onChange={vi.fn()}
      />
    );
    expect(html).toContain('120 total');
    expect(html).toContain('more inherited features');
    expect(html).not.toContain('prop119');
  });
});
