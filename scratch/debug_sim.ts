import { Node, Edge } from 'reactflow';
import { DAEAssembler } from '../src/engine/vlab/DAEAssembler';
import { VLabPhysicsEngine } from '../src/engine/vlab/vlabPhysics';
import { blockEquations } from '../src/engine/vlab/vlabEquations';

const engine = new VLabPhysicsEngine();

// force_source (10N) -> mass (1kg) -> spring (100 N/m) -> damper (5 N-s/m) -> ref
const nodes: Node[] = [
  { id: 'ref', data: { type: 'trans_ref' } } as any,
  { id: 'f_src', data: { type: 'force_source', params: { F: 10 } } } as any,
  { id: 'mass', data: { type: 'mass', params: { m: 1.0 } } } as any,
  { id: 'spring', data: { type: 'trans_spring', params: { k: 100 } } } as any,
  { id: 'damper', data: { type: 'trans_damper', params: { b: 5 } } } as any,
];

const edges: Edge[] = [
  { id: 'me1', source: 'f_src', target: 'mass', sourceHandle: 'a_s', targetHandle: 'p_t' },
  { id: 'me_ref1', source: 'f_src', target: 'ref', sourceHandle: 'b_s', targetHandle: 'p_t' },
  { id: 'me2', source: 'mass', target: 'spring', sourceHandle: 'p_s', targetHandle: 'r_t' },
  { id: 'me3', source: 'spring', target: 'ref', sourceHandle: 'c_s', targetHandle: 'p_t' },
  { id: 'me4', source: 'mass', target: 'damper', sourceHandle: 'p_s', targetHandle: 'r_t' },
  { id: 'me5', source: 'damper', target: 'ref', sourceHandle: 'c_s', targetHandle: 'p_t' },
];

console.log('--- ASSEMBLING SYSTEM ---');
const assembler = new DAEAssembler();
const system = assembler.assemble(nodes, edges);

console.log('System Size:', system.systemSize);
console.log('Variables:');
system.variableNames.forEach((name, idx) => {
  console.log(`  [${idx}]: ${name} (isDiff: ${system.isDifferentialState[idx]})`);
});

console.log('\nKirchhoff Nodes:');
system.kirchhoffNodes.forEach((kn, idx) => {
  console.log(`  Node ${kn.nodeId}: throughIndices: [${kn.throughIndices.join(', ')}], signs: [${kn.signs.join(', ')}]`);
});

const x0 = new Array(system.systemSize).fill(0);
const dx0 = new Array(system.systemSize).fill(0);
const ctx = {
  dt: 0.05,
  time: 0.05,
  parameters: {},
  prevStates: [...x0],
  states: [...x0],
  stateDerivatives: [...dx0]
};

const r0 = system.residuals(x0, dx0, ctx);
console.log('\nInitial Residuals (x=0, dx=0):');
r0.forEach((res, idx) => {
  console.log(`  [${idx}] ${system.variableNames[idx]}: residual = ${res}`);
});

console.log('\n--- SIMULATING STEP 1 ---');
const state = engine.simulateStep(nodes, edges, null, 0.05);
console.log('Step 1 State x:', state.x);
