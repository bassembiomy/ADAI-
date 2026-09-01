import { Node, Edge } from '@xyflow/react';
import { VLabTestBoundary } from './types';

const node = (id: string, type: string, params: Record<string, unknown> = {}): Node =>
  ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params } } as any);

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string): Edge =>
  ({ id, source, target, sourceHandle, targetHandle });

export class ThermalFixtures {
  static createThermalConductionCircuit(Thot: number, k: number, duration = 0.05): VLabTestBoundary {
    return {
      id: 't_conduction',
      name: 'Thermal Conduction Circuit',
      domain: 'thermal',
      dt: 0.005,
      totalTime: duration,
      excitation: { type: 'constant', sourceNodeId: 'source', amplitude: Thot },
      nodes: [
        node('source', 'temp_src', { T: Thot }),
        node('link', 'conductive_heat', { k }),
        node('reference', 'thermal_ref'),
        node('sensor', 'temp_sensor'),
        node('scope', 'scope'),
      ],
      edges: [
        edge('e1', 'source', 'a_s', 'link', 'a_t'),
        edge('e2', 'link', 'b_s', 'reference', 'a_t'),
        edge('e3', 'source', 'a_s', 'sensor', 'a_t'),
        edge('e4', 'sensor', 'b_s', 'reference', 'a_t'),
        edge('e5', 'sensor', 't_s', 'scope', 'in1_t'),
      ],
      probes: [{ id: 'p1', sourceNodeId: 'sensor', sourceHandle: 't_s', variableName: 'T_sensor', unit: 'K' }],
    };
  }

  static createThermalMassTransient(Thot: number, k: number, C: number, duration = 2.0): VLabTestBoundary {
    return {
      id: 't_mass_transient',
      name: 'Thermal Mass Heating Transient',
      domain: 'thermal',
      dt: 0.01,
      totalTime: duration,
      excitation: { type: 'constant', sourceNodeId: 'source', amplitude: Thot },
      nodes: [
        node('source', 'temp_src', { T: Thot }),
        node('link', 'conductive_heat', { k }),
        node('mass', 'thermal_mass', { C }),
        node('sensor', 'temp_sensor'),
        node('reference', 'thermal_ref'),
        node('scope', 'scope'),
      ],
      edges: [
        edge('e1', 'source', 'a_s', 'link', 'a_t'),
        edge('e2', 'link', 'b_s', 'mass', 'a_t'),
        edge('e3', 'mass', 'a_s', 'sensor', 'a_t'),
        edge('e4', 'sensor', 'b_s', 'reference', 'a_t'),
        edge('e5', 'sensor', 't_s', 'scope', 'in1_t'),
      ],
      probes: [{ id: 'p1', sourceNodeId: 'sensor', sourceHandle: 't_s', variableName: 'T_mass', unit: 'K' }],
    };
  }
}
