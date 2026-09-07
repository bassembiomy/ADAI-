import { describe, expect, it } from 'vitest';
import { Edge, Node } from '@xyflow/react';
import { VLabPhysicsEngine } from './vlabPhysics';

describe('Pressure sensor output', () => {
  it('forwards the measured hydraulic pressure to its physical output', () => {
    const nodes: Node[] = [
      { id: 'source', data: { type: 'pressure_source', params: { P: 250000 } } } as any,
      { id: 'sensor', data: { type: 'pressure_sensor', params: {} } } as any,
      { id: 'scope', data: { type: 'scope', params: { numSignals: { value: 1 } } } } as any,
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'source', target: 'sensor', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'e2', source: 'sensor', target: 'scope', sourceHandle: 'out_s', targetHandle: 'in1_t' },
    ];

    const engine = new VLabPhysicsEngine();
    const state = engine.simulateStep(nodes, edges, null, 0.05);

    expect(state.perScopeValues.scope).toBeCloseTo(250000, 6);
  });
});
