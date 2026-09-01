import { Node, Edge } from '@xyflow/react';
import { VLabTestBoundary } from './types';

const node = (id: string, type: string, params: Record<string, unknown> = {}): Node =>
  ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params } } as any);

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string): Edge =>
  ({ id, source, target, sourceHandle, targetHandle });

export class FluidFixtures {
  static createGasResistanceCircuit(Psource: number, k: number, duration = 0.02): VLabTestBoundary {
    return {
      id: 'f_gas_resistance',
      name: 'Gas Flow Resistance',
      domain: 'fluid',
      dt: 0.001,
      totalTime: duration,
      excitation: { type: 'constant', sourceNodeId: 'src', amplitude: Psource },
      nodes: [
        node('src', 'gas_pressure_source', { P: Psource }),
        node('res_flow', 'gas_resistance', { k }),
        node('reservoir', 'gas_fixed_res', { P: 101325 }),
      ],
      edges: [
        edge('e1', 'src', 'a_s', 'res_flow', 'a_t'),
        edge('e2', 'res_flow', 'b_s', 'reservoir', 'a_t'),
        edge('e3', 'src', 'b_s', 'reservoir', 'a_t'),
      ],
      probes: [{ id: 'p1', sourceNodeId: 'res_flow', sourceHandle: 'mass_flow', variableName: 'res_flow_branch_mass_flow', unit: 'kg/s' }],
    };
  }
}
