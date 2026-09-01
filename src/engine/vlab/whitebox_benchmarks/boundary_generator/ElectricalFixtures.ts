import { Node, Edge } from '@xyflow/react';
import { VLabTestBoundary } from './types';

const node = (id: string, type: string, params: Record<string, unknown> = {}): Node =>
  ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params } } as any);

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string): Edge =>
  ({ id, source, target, sourceHandle, targetHandle });

export class ElectricalFixtures {
  static createResistorDCCircuit(Vs: number, R: number): VLabTestBoundary {
    return {
      id: 'e_resistor_dc',
      name: 'Resistor DC Circuit',
      domain: 'electrical',
      dt: 0.001,
      totalTime: 0.05,
      excitation: { type: 'constant', sourceNodeId: 'src', amplitude: Vs },
      nodes: [
        node('src', 'dc_voltage', { V: Vs }),
        node('res', 'resistor', { R }),
        node('sensor', 'v_sensor'),
        node('scope', 'scope'),
        node('gnd', 'ground'),
      ],
      edges: [
        edge('src-res', 'src', 'p_s', 'res', 'p_t'),
        edge('res-gnd', 'res', 'n_s', 'gnd', 'a_t'),
        edge('src-gnd', 'src', 'n_s', 'gnd', 'a_t'),
        edge('res-sensor', 'res', 'p_s', 'sensor', 'p_t'),
        edge('sensor-gnd', 'sensor', 'n_s', 'gnd', 'a_t'),
        edge('sensor-scope', 'sensor', 'v_s', 'scope', 'in1_t'),
      ],
      probes: [{ id: 'p1', sourceNodeId: 'sensor', sourceHandle: 'v_s', variableName: 'V_resistor', unit: 'V' }],
    };
  }

  static createRCChargingCircuit(Vs: number, R: number, C: number, duration = 0.5): VLabTestBoundary {
    return {
      id: 'e_rc_charging',
      name: 'RC Charging Step Response',
      domain: 'electrical',
      dt: 0.001,
      totalTime: duration,
      excitation: { type: 'step', sourceNodeId: 'src', amplitude: Vs },
      nodes: [
        node('src', 'dc_voltage', { V: Vs }),
        node('res', 'resistor', { R }),
        node('cap', 'capacitor', { C }),
        node('sensor', 'v_sensor'),
        node('scope', 'scope'),
        node('gnd', 'ground'),
      ],
      edges: [
        edge('src-res', 'src', 'p_s', 'res', 'p_t'),
        edge('res-cap', 'res', 'n_s', 'cap', 'p_t'),
        edge('cap-gnd', 'cap', 'n_s', 'gnd', 'a_t'),
        edge('src-gnd', 'src', 'n_s', 'gnd', 'a_t'),
        edge('cap-sensor', 'cap', 'p_s', 'sensor', 'p_t'),
        edge('sensor-gnd', 'sensor', 'n_s', 'gnd', 'a_t'),
        edge('sensor-scope', 'sensor', 'v_s', 'scope', 'in1_t'),
      ],
      probes: [{ id: 'p1', sourceNodeId: 'sensor', sourceHandle: 'v_s', variableName: 'V_cap', unit: 'V' }],
    };
  }

  static createACSineCircuit(Vpk: number, f: number, R: number, duration = 0.04): VLabTestBoundary {
    return {
      id: 'e_ac_resistor',
      name: 'AC Voltage Source with Resistor',
      domain: 'electrical',
      dt: 0.0005,
      totalTime: duration,
      excitation: { type: 'sine', sourceNodeId: 'src', amplitude: Vpk, frequency: f },
      nodes: [
        node('src', 'ac_voltage', { Vpk, f }),
        node('res', 'resistor', { R }),
        node('sensor', 'v_sensor'),
        node('scope', 'scope'),
        node('gnd', 'ground'),
      ],
      edges: [
        edge('src-res', 'src', 'p_s', 'res', 'p_t'),
        edge('res-gnd', 'res', 'n_s', 'gnd', 'a_t'),
        edge('src-gnd', 'src', 'n_s', 'gnd', 'a_t'),
        edge('res-sensor', 'res', 'p_s', 'sensor', 'p_t'),
        edge('sensor-gnd', 'sensor', 'n_s', 'gnd', 'a_t'),
        edge('sensor-scope', 'sensor', 'v_s', 'scope', 'in1_t'),
      ],
      probes: [{ id: 'p1', sourceNodeId: 'sensor', sourceHandle: 'v_s', variableName: 'V_ac', unit: 'V' }],
    };
  }
}
