import { describe, expect, it } from 'vitest';
import type { XBPersistedModelV1 } from './xbModel';
import { flattenXBSubsystems } from './xbSubsystemFlattener';
import { XB_EXECUTABLE_C_CASES } from './xbCConformanceCases';
import { validateXBModel } from './xbSemanticValidator';

describe('flattenXBSubsystems', () => {
  it('flattens a single-level subsystem and rewires edges to Inport/Outport', () => {
    const model: XBPersistedModelV1 = {
      version: 1,
      solver: { kind: 'euler', stepSeconds: 0.01 },
      nodes: [
        { id: 'const1', type: 'Constant', parameters: { value: 5 }, parentId: 'root' },
        { id: 'sub1', type: 'Subsystem', parameters: { name: 'MySub' }, parentId: 'root' },
        { id: 'in1', type: 'Inport', parameters: {}, parentId: 'sub1' },
        { id: 'gain1', type: 'Gain', parameters: { gain: 2 }, parentId: 'sub1' },
        { id: 'out1', type: 'Outport', parameters: {}, parentId: 'sub1' },
        { id: 'term1', type: 'Terminator', parameters: {}, parentId: 'root' },
      ],
      edges: [
        { id: 'e1', sourceNodeId: 'const1', sourcePortId: 'out', targetNodeId: 'sub1', targetPortId: 'in1' },
        { id: 'e2', sourceNodeId: 'in1', sourcePortId: 'out', targetNodeId: 'gain1', targetPortId: 'u' },
        { id: 'e3', sourceNodeId: 'gain1', sourcePortId: 'y', targetNodeId: 'out1', targetPortId: 'in' },
        { id: 'e4', sourceNodeId: 'sub1', sourcePortId: 'out1', targetNodeId: 'term1', targetPortId: 'in' },
      ],
    };

    const flattened = flattenXBSubsystems(model);

    expect(flattened.nodes.map(n => n.id)).not.toContain('sub1');
    expect(flattened.nodes.find(n => n.id === 'gain1')?.parentId).toBe('root');

    // Verify rewired edges
    const rewiredE1 = flattened.edges.find(e => e.id === 'e1');
    expect(rewiredE1?.targetNodeId).toBe('in1');

    const rewiredE4 = flattened.edges.find(e => e.id === 'e4');
    expect(rewiredE4?.sourceNodeId).toBe('out1');
  });

  it('validates a model containing subsystems without diagnostics', () => {
    const caseDef = XB_EXECUTABLE_C_CASES['subsystem_gain_sum'];
    const model = caseDef.fixture.model.states.find(s => s.id === 'controller')?.xBridgesModel;
    expect(model).toBeDefined();
    const flattened = flattenXBSubsystems(model!);
    const diagnostics = validateXBModel(flattened, {}, {
      supportsMathLibrary: true,
      maxVectorLength: 64,
      maxMatrixDimension: 64,
      supportsFloat16: false,
      supportsFloat32: true,
      supportsFloat64: true,
    });
    expect(diagnostics).toEqual([]);
  });
});
