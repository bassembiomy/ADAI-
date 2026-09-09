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
});
