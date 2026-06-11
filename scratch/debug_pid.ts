import { Node, Edge } from 'reactflow';
import { VLabPhysicsEngine } from '../src/engine/vlab/vlabPhysics';

const engine = new VLabPhysicsEngine();

// ps_constant (ref = 5) -> ps_subtract (error) -> ps_pid_ctrl (output)
const nodes: Node[] = [
  { id: 'ref', data: { type: 'ps_constant', params: { value: 5.0 } } } as any,
  { id: 'sub', data: { type: 'ps_subtract' } } as any,
  { id: 'pid', data: { type: 'ps_pid_ctrl', params: { Kp: 2.0, Ki: 1.0, Kd: 0.1 } } } as any,
];

const edges: Edge[] = [
  { id: 'ce1', source: 'ref', target: 'sub', sourceHandle: 'y_s', targetHandle: 'u1_t' },
  { id: 'ce2', source: 'pid', target: 'sub', sourceHandle: 'u_s', targetHandle: 'u2_t' },
  { id: 'ce3', source: 'sub', target: 'pid', sourceHandle: 'y_s', targetHandle: 'e_t' },
];

let state: any = null;
const dt = 0.05;

console.log('step | time | ref | pid_out | error | integral | filter');
console.log('---------------------------------------------------------');

for (let step = 1; step <= 80; step++) {
  state = engine.simulateStep(nodes, edges, state, dt);
  
  const system = engine['currentSystem']!;
  const pidOutNode = system.components.find(c => c.blockId === 'pid')!.portNodeMap.get('u')!;
  const pidOutIdx = system.variableNames.findIndex(name => name.includes(pidOutNode));
  const errorNode = system.components.find(c => c.blockId === 'pid')!.portNodeMap.get('e')!;
  const errorIdx = system.variableNames.findIndex(name => name.includes(errorNode));
  
  const integralIdx = system.variableNames.findIndex(name => name.includes('pid_state_integral'));
  const filterIdx = system.variableNames.findIndex(name => name.includes('pid_state_filter'));
  
  const pid_out = state.x[pidOutIdx];
  const err = state.x[errorIdx];
  const integral = state.x[integralIdx];
  const filter = state.x[filterIdx];
  
  console.log(`${step.toString().padStart(4)} | ${state.time.toFixed(2)} | 5.0 | ${pid_out.toFixed(4)} | ${err.toFixed(4)} | ${integral.toFixed(4)} | ${filter.toFixed(4)}`);
}
