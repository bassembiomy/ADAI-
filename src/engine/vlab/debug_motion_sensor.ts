import { Edge, Node } from '@xyflow/react';
import { VLabPhysicsEngine } from './vlabPhysics';

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
for (let i = 0; i < 1000; i++) state = engine.simulateStep(nodes, edges, state, 0.001);
const system = (engine as any).currentSystem;
console.log('--- variables ---');
system.variableNames.forEach((n: string, i: number) => {
  console.log(i.toFixed(0).padStart(3), n.padEnd(45), state.x[i]?.toFixed(4));
});
console.log('--- scopeOutputs ---');
for (const [k, v] of system.scopeOutputs) console.log(k, JSON.stringify(v));
console.log('--- residuals at solution (should be ~0) ---');
if (system.residuals) {
  const r = system.residuals(state.x, state.dx ?? state.x, {} as any);
  r.forEach((v: number, i: number) => { if (Math.abs(v) > 1e-6) console.log('res', i, system.variableNames[i], v); });
}
