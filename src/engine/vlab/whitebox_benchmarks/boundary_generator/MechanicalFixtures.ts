import { Node, Edge } from '@xyflow/react';
import { VLabTestBoundary } from './types';

const node = (id: string, type: string, params: Record<string, unknown> = {}): Node =>
  ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params } } as any);

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string): Edge =>
  ({ id, source, target, sourceHandle, targetHandle });

export class MechanicalFixtures {
  static createMassSpringDamper(F0: number, m: number, k: number, b: number, duration = 1.5): VLabTestBoundary {
    return {
      id: 'm_mass_spring_damper',
      name: 'Mass Spring Damper Step Response',
      domain: 'mechanical',
      dt: 0.0005,
      totalTime: duration,
      excitation: { type: 'step', sourceNodeId: 'f_src', amplitude: F0 },
      nodes: [
        node('ref', 'trans_ref'),
        node('f_src', 'force_source', { F: F0 }),
        node('mass', 'mass', { m }),
        node('spring', 'trans_spring', { k }),
        node('damper', 'trans_damper', { b }),
      ],
      edges: [
        edge('e1', 'f_src', 'a_s', 'mass', 'p_t'),
        edge('e2', 'f_src', 'b_s', 'ref', 'p_t'),
        edge('e3', 'mass', 'p_s', 'spring', 'r_t'),
        edge('e4', 'spring', 'c_s', 'ref', 'p_t'),
        edge('e5', 'mass', 'p_s', 'damper', 'r_t'),
        edge('e6', 'damper', 'c_s', 'ref', 'p_t'),
      ],
      probes: [{ id: 'p1', sourceNodeId: 'spring', sourceHandle: 'x', variableName: 'spring_state_x', unit: 'm' }],
    };
  }

  static createInertiaDamper(T0: number, J: number, b: number, duration = 0.5): VLabTestBoundary {
    return {
      id: 'm_inertia_damper',
      name: 'Inertia Damper Step Response',
      domain: 'mechanical',
      dt: 0.001,
      totalTime: duration,
      excitation: { type: 'step', sourceNodeId: 't_src', amplitude: T0 },
      nodes: [
        node('ref', 'rot_ref'),
        node('t_src', 'torque_source', { T: T0 }),
        node('J', 'inertia', { J }),
        node('damp', 'rot_damper', { b }),
      ],
      edges: [
        edge('e1', 't_src', 'r_s', 'J', 'r_t'),
        edge('e2', 't_src', 'c_s', 'ref', 'r_t'),
        edge('e3', 'J', 'r_s', 'damp', 'r_t'),
        edge('e4', 'damp', 'c_s', 'ref', 'r_t'),
      ],
      probes: [{ id: 'p1', sourceNodeId: 'J', sourceHandle: 'w', variableName: 'J', unit: 'rad/s' }],
    };
  }
}
