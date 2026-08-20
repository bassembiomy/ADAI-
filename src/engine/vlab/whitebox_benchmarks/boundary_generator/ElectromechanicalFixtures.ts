import { Node, Edge } from 'reactflow';
import { VLabTestBoundary } from './types';

const node = (id: string, type: string, params: Record<string, unknown> = {}): Node =>
  ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params } } as any);

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string): Edge =>
  ({ id, source, target, sourceHandle, targetHandle });

export class ElectromechanicalFixtures {
  static createDCMotorCircuit(
    Va: number,
    K: number,
    R: number,
    b: number,
    J: number,
    duration = 0.05
  ): VLabTestBoundary {
    return {
      id: 'em_dc_motor',
      name: 'DC Motor Electromechanical Spin-Up',
      domain: 'electromechanical',
      dt: 0.001,
      totalTime: duration,
      excitation: { type: 'step', sourceNodeId: 'dc_source', amplitude: Va },
      nodes: [
        node('dc_source', 'dc_voltage', { V: Va }),
        node('blender_motor', 'rotational_electromechanical_converter', { K, R }),
        node('mixture_drag', 'rot_damper', { b }),
        node('blade_inertia', 'inertia', { J }),
        node('speed_sensor', 'rot_motion_sensor'),
        node('blender_scope', 'scope'),
        node('gnd', 'ground'),
      ],
      edges: [
        edge('be1', 'dc_source', 'p_s', 'blender_motor', 'p_t'),
        edge('be1_ret', 'blender_motor', 'n_s', 'gnd', 'a_t'),
        edge('be1_gnd', 'dc_source', 'n_s', 'gnd', 'a_t'),
        edge('be2', 'blender_motor', 'r_s', 'mixture_drag', 'r_t'),
        edge('be3', 'mixture_drag', 'r_s', 'blade_inertia', 'r_t'),
        edge('be4', 'mixture_drag', 'r_s', 'speed_sensor', 'r_t'),
        edge('be5', 'speed_sensor', 'w_s', 'blender_scope', 'in1_t'),
      ],
      probes: [{ id: 'p1', sourceNodeId: 'speed_sensor', sourceHandle: 'w_s', variableName: 'speed', unit: 'rad/s' }],
    };
  }
}
