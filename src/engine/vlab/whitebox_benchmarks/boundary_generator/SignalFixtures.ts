import { Node, Edge } from 'reactflow';
import { VLabTestBoundary } from './types';

const node = (id: string, type: string, params: Record<string, unknown> = {}): Node =>
  ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params } } as any);

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string): Edge =>
  ({ id, source, target, sourceHandle, targetHandle });

export class SignalFixtures {
  static createGainSaturationCircuit(
    gain: number,
    upper: number,
    lower: number,
    inputVal: number
  ): VLabTestBoundary {
    return {
      id: 'sig_gain_sat',
      name: 'Signal Gain & Saturation',
      domain: 'signal',
      dt: 0.001,
      totalTime: 0.01,
      excitation: { type: 'constant', sourceNodeId: 'const', amplitude: inputVal },
      nodes: [
        node('const', 'ps_constant', { value: inputVal }),
        node('gain', 'ps_gain', { gain }),
        node('sat', 'ps_saturation', { upper, lower }),
        node('scope', 'scope'),
      ],
      edges: [
        edge('e1', 'const', 'y_s', 'gain', 'u_t'),
        edge('e2', 'gain', 'y_s', 'sat', 'u_t'),
        edge('e3', 'sat', 'y_s', 'scope', 'in1_t'),
      ],
      probes: [{ id: 'p1', sourceNodeId: 'sat', sourceHandle: 'y_s', variableName: 'clamped_out', unit: '1' }],
    };
  }
}
