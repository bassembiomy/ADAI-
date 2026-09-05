import { Edge, Node } from '@xyflow/react';
import { VLabPhysicsEngine } from './vlabPhysics';

// Same model WITHOUT the motion sensor: pure torque source + inertia.
const nodes: Node[] = [
  { id: 'src', data: { type: 'torque_source', params: { T: 5 } } } as any,
  { id: 'load', data: { type: 'inertia', params: { J: 0.01 } } } as any,
  { id: 'sensor', data: { type: 'rot_motion_sensor', params: {} } } as any,
  { id: 'scope1', data: { type: 'scope', params: { numSignals: { value: 2 } } } } as any,
];
const edges: Edge[] = [
  { id: 'e1', source: 'src', target: 'load', sourceHandle: 'r_s', targetHandle: 'r_t' },
  { id: 'e2', source: 'src', target: 'sensor', sourceHandle: 'r_s', targetHandle: 'r_t' },
  { id: 'e3', source: 'sensor', target: 'scope1', sourceHandle: 'w_s', targetHandle: 'in1_t' },
  { id: 'e4', source: 'sensor', target: 'scope1', sourceHandle: 'a_s', targetHandle: 'in2_t' },
];

const engine = new VLabPhysicsEngine();
let state: any = null;
for (let i = 0; i < 1000; i++) {
  state = engine.simulateStep(nodes, edges, state, 0.001);
  if (i % 200 === 199) {
    const w = state.x[0];
    console.log(`step ${i + 1}: omega=${w.toFixed(3)} (expected -${(5 / 0.01) * ((i + 1) * 0.001)})`);
  }
}
console.log('final omega:', state.x[0], 'theta:', state.x[11]);

// Baseline: no sensor at all
const nodes2: Node[] = [
  { id: 'src', data: { type: 'torque_source', params: { T: 5 } } } as any,
  { id: 'load', data: { type: 'inertia', params: { J: 0.01 } } } as any,
];
const edges2: Edge[] = [
  { id: 'e1', source: 'src', target: 'load', sourceHandle: 'r_s', targetHandle: 'r_t' },
];
const engine2 = new VLabPhysicsEngine();
let st2: any = null;
for (let i = 0; i < 1000; i++) st2 = engine2.simulateStep(nodes2, edges2, st2, 0.001);
const sys2 = (engine2 as any).currentSystem;
console.log('--- baseline (no sensor) variables ---');
sys2.variableNames.forEach((n: string, i: number) => console.log(i, n, st2.x[i]));
