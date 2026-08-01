import { describe, expect, it } from 'vitest';
import {
  createXBBoundaryMapping,
  listXBBoundaryTargets,
  pruneXBBoundaryMappings,
  reconcileXBBoundaryMappings,
  repairLegacyXBBoundaryMappings,
  syncXBBoundaryNodeMetadata,
} from './xbBoundaryMappings';

const nodes = [
  {
    id: 'input', type: 'xblock',
    data: {
      type: 'Inport', params: { smVarId: 'x' },
      inputs: [{ id: 'in', direction: 'input' }],
      outputs: [{ id: 'out', direction: 'output' }],
    },
  },
  {
    id: 'output', type: 'xblock',
    data: {
      type: 'Outport', params: { smVarId: 'x' },
      inputs: [{ id: 'in', direction: 'input' }],
      outputs: [{ id: 'out', direction: 'output' }],
    },
  },
];

const nodesWithStaleIds = [
  {
    id: 'input', type: 'xblock',
    data: {
      type: 'Inport', params: { smVarId: 'stale-in' },
      inputs: [{ id: 'in', direction: 'input' }],
      outputs: [{ id: 'out', direction: 'output' }],
    },
  },
  {
    id: 'output', type: 'xblock',
    data: {
      type: 'Outport', params: { smVarId: 'stale-out' },
      inputs: [{ id: 'in', direction: 'input' }],
      outputs: [{ id: 'out', direction: 'output' }],
    },
  },
];

const canonicalNodes = [
  {
    id: 'input', type: 'Inport', label: 'Setpoint',
    parameters: {
      smVarId: 'x',
      inputs: [{ id: 'in', direction: 'input' }],
      outputs: [{ id: 'out', direction: 'output' }],
    },
  },
  {
    id: 'output', type: 'Outport',
    parameters: {
      smVarId: 'y',
      inputs: [{ id: 'in', direction: 'input' }],
      outputs: [{ id: 'out', direction: 'output' }],
    },
  },
];

const canonical = [
  { smVarId: 'x', blockId: 'input', portId: 'in', direction: 'in' as const },
  { smVarId: 'x', blockId: 'output', portId: 'out', direction: 'out' as const },
];

describe('listXBBoundaryTargets', () => {
  it('resolves boundary ports from legacy React Flow nodes', () => {
    expect(listXBBoundaryTargets(nodes, 'in')).toEqual([
      { blockId: 'input', portId: 'in', direction: 'in', label: 'input' },
    ]);
    expect(listXBBoundaryTargets(nodes, 'out')).toEqual([
      { blockId: 'output', portId: 'out', direction: 'out', label: 'output' },
    ]);
  });

  it('resolves boundary ports from canonical XBNodeV1 nodes, sorted deterministically', () => {
    expect(listXBBoundaryTargets(canonicalNodes, 'in')).toEqual([
      { blockId: 'input', portId: 'in', direction: 'in', label: 'Setpoint' },
    ]);
    expect(listXBBoundaryTargets(canonicalNodes, 'out')).toEqual([
      { blockId: 'output', portId: 'out', direction: 'out', label: 'output' },
    ]);
  });

  it('rejects wrong-direction ports and non-boundary blocks', () => {
    const mixed = [
      ...nodes,
      {
        id: 'gain', type: 'xblock',
        data: {
          type: 'GAIN', params: {},
          inputs: [{ id: 'u', direction: 'input' }],
          outputs: [{ id: 'y', direction: 'output' }],
        },
      },
    ];
    expect(listXBBoundaryTargets(mixed, 'in')).toEqual([
      { blockId: 'input', portId: 'in', direction: 'in', label: 'input' },
    ]);
    expect(listXBBoundaryTargets(mixed, 'out')).toEqual([
      { blockId: 'output', portId: 'out', direction: 'out', label: 'output' },
    ]);
  });
});

describe('createXBBoundaryMapping', () => {
  it('builds a canonical mapping record from a resolved target', () => {
    expect(createXBBoundaryMapping('x', listXBBoundaryTargets(nodes, 'in')[0]))
      .toEqual({ smVarId: 'x', blockId: 'input', portId: 'in', direction: 'in' });
  });
});

describe('syncXBBoundaryNodeMetadata', () => {
  it('overwrites stale legacy params.smVarId with the canonical variable ID', () => {
    expect(syncXBBoundaryNodeMetadata(nodesWithStaleIds, canonical))
      .toMatchObject([
        { data: { params: { smVarId: 'x' } } },
        { data: { params: { smVarId: 'x' } } },
      ]);
  });

  it('mirrors into canonical parameters.smVarId without mutating the input', () => {
    const synced = syncXBBoundaryNodeMetadata(
      canonicalNodes,
      [{ smVarId: 'z', blockId: 'input', portId: 'in', direction: 'in' as const }],
    );
    expect(synced[0]).toMatchObject({ parameters: { smVarId: 'z' } });
    expect(canonicalNodes[0].parameters.smVarId).toBe('x');
  });

  it('keeps canonical mappings stable across metadata sync and reloads', () => {
    const inputMapping = createXBBoundaryMapping('x', listXBBoundaryTargets(nodes, 'in')[0]);
    const syncedInput = syncXBBoundaryNodeMetadata(nodes, [inputMapping]);
    const reloadedInput = structuredClone(syncedInput);
    const reconciledInput = reconcileXBBoundaryMappings(reloadedInput, [inputMapping], new Set(['x']));

    expect(reconciledInput).toEqual([inputMapping]);

    const outputMapping = createXBBoundaryMapping('x', listXBBoundaryTargets(nodes, 'out')[0]);
    expect(outputMapping).toEqual({ smVarId: 'x', blockId: 'output', portId: 'out', direction: 'out' });
    const syncedOutput = syncXBBoundaryNodeMetadata(reloadedInput, [outputMapping]);
    const reloadedOutput = structuredClone(syncedOutput);
    const reconciledOutput = reconcileXBBoundaryMappings(reloadedOutput, [outputMapping], new Set(['x']));

    expect(reconciledOutput).toEqual([outputMapping]);
    expect([inputMapping, ...reconciledInput, outputMapping, ...reconciledOutput]
      .every(mapping => Object.values(mapping).every(value => typeof value === 'string' && value.length > 0)))
      .toBe(true);
  });
});

describe('reconcileXBBoundaryMappings', () => {
  it('derives complete mappings from valid node metadata', () => {
    expect(reconcileXBBoundaryMappings(nodes, [], new Set(['x']))).toEqual(canonical);
  });

  it('preserves already-complete canonical mappings', () => {
    expect(reconcileXBBoundaryMappings(nodes, canonical, new Set(['x'])))
      .toEqual(canonical);
  });

  it('drops incomplete mappings but preserves complete unknown-variable mappings for validation', () => {
    const nodesWithoutMetadata = nodes.map(node => ({
      ...node,
      data: { ...node.data, params: {} },
    }));
    const incomplete = { smVarId: '', blockId: 'input', portId: 'in', direction: 'in' as const };
    const unknown = { smVarId: 'stale', blockId: 'input', portId: 'in', direction: 'in' as const };

    expect(reconcileXBBoundaryMappings(nodesWithoutMetadata, [incomplete, unknown], new Set(['x'])))
      .toEqual([unknown]);
  });

  it('rejects an absent target tuple even when concatenated target fields collide', () => {
    const collisionTargets = [
      {
        id: 'a', type: 'xblock',
        data: {
          type: 'Inport', params: {},
          inputs: [{ id: 'bc', direction: 'input' }],
          outputs: [],
        },
      },
      {
        id: 'ab', type: 'xblock',
        data: {
          type: 'Inport', params: {},
          inputs: [],
          outputs: [],
        },
      },
    ];
    const absentButColliding = {
      smVarId: 'x', blockId: 'ab', portId: 'c', direction: 'in' as const,
    };

    expect(reconcileXBBoundaryMappings(collisionTargets, [absentButColliding], new Set(['x'])))
      .toEqual([]);
  });

  it('does not import variables that do not exist', () => {
    expect(reconcileXBBoundaryMappings(nodes, [], new Set(['other']))).toEqual([]);
  });

  it('never guesses among multiple compatible ports on one boundary block', () => {
    const ambiguous = [
      {
        id: 'input', type: 'xblock',
        data: {
          type: 'Inport', params: { smVarId: 'x' },
          inputs: [
            { id: 'a', direction: 'input' },
            { id: 'b', direction: 'input' },
          ],
          outputs: [],
        },
      },
    ];
    expect(reconcileXBBoundaryMappings(ambiguous, [], new Set(['x']))).toEqual([]);
  });
});

describe('pruneXBBoundaryMappings', () => {
  it('drops mappings whose boundary block was deleted', () => {
    expect(pruneXBBoundaryMappings(canonical, [nodes[0]])).toEqual([canonical[0]]);
  });
});

describe('repairLegacyXBBoundaryMappings', () => {
  const legacyModel = {
    nodes,
    edges: [],
    mappings: [
      { smVarId: 'x', blockId: '', portId: '', direction: 'in' as const },
      { smVarId: 'x', blockId: '', portId: '', direction: 'out' as const },
    ],
  };

  it('repairs blank legacy targets while preserving canonical mappings over stale node metadata', () => {
    const repaired = repairLegacyXBBoundaryMappings({
      ...legacyModel,
      mappings: [
        { smVarId: 'x', blockId: 'input', portId: 'in', direction: 'in' as const },
        legacyModel.mappings[1],
      ],
    }, new Set(['x']));

    expect(repaired.diagnostics).toEqual([]);
    expect(repaired.model).toMatchObject({
      mappings: [
        { smVarId: 'x', blockId: 'input', portId: 'in', direction: 'in' },
        { smVarId: 'x', blockId: 'output', portId: 'out', direction: 'out' },
      ],
    });
  });

  it('imports an unambiguous metadata-only legacy boundary mapping', () => {
    const repaired = repairLegacyXBBoundaryMappings({
      ...legacyModel,
      nodes: [nodes[0]],
      mappings: [],
    }, new Set(['x']));

    expect(repaired.diagnostics).toEqual([]);
    expect(repaired.model).toMatchObject({
      mappings: [
        { smVarId: 'x', blockId: 'input', portId: 'in', direction: 'in' },
      ],
    });
  });

  it('repairs a partially blank target using its specified boundary block', () => {
    const repaired = repairLegacyXBBoundaryMappings({
      ...legacyModel,
      nodes: [nodes[0]],
      mappings: [
        { smVarId: 'x', blockId: 'input', portId: '', direction: 'in' as const },
      ],
    }, new Set(['x']));

    expect(repaired.diagnostics).toEqual([]);
    expect(repaired.model).toMatchObject({
      mappings: [
        { smVarId: 'x', blockId: 'input', portId: 'in', direction: 'in' },
      ],
    });
  });

  it('fails closed when multiple compatible input boundaries make a blank target ambiguous', () => {
    const repaired = repairLegacyXBBoundaryMappings({
      ...legacyModel,
      nodes: [...nodes, { ...nodes[0], id: 'input-2' }],
    }, new Set(['x']));

    expect(repaired.model).toMatchObject({
      mappings: [
        legacyModel.mappings[0],
        { smVarId: 'x', blockId: 'output', portId: 'out', direction: 'out' },
      ],
    });
    expect(repaired.diagnostics).toContainEqual(expect.objectContaining({
      message: 'Mapping at index 0 cannot infer an input boundary because 2 compatible Inport ports exist.',
    }));
  });

  it('rejects a blank target that references an unknown state-machine variable', () => {
    const repaired = repairLegacyXBBoundaryMappings(legacyModel, new Set());

    expect(repaired.model).toMatchObject({
      mappings: legacyModel.mappings,
    });
    expect(repaired.diagnostics).toContainEqual(expect.objectContaining({
      message: "Mapping at index 0 references unknown state-machine variable 'x'.",
    }));
  });
});
