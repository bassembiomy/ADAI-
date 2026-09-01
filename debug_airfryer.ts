import { VLabPhysicsEngine } from './src/engine/vlab/vlabPhysics.ts';
import { DAEAssembler } from './src/engine/vlab/DAEAssembler.ts';
import { Node, Edge } from '@xyflow/react';

const reconstructLabNodes = (nodes: any[]): Node[] => {
  return nodes.map(n => ({
    id: n.id,
    type: 'default',
    position: n.position,
    data: {
      type: n.blockId,
      blockId: n.blockId,
      label: n.label,
      params: n.params
    }
  }));
};

const lab = {
  id: 'air_fryer_thermal',
  nodes: [
    { id: 'ac_supply', blockId: 'ac_voltage', position: { x: 50, y: 200 }, label: '230V AC Supply', params: { Vpk: 325, f: 50 } },
    { id: 'heating_element', blockId: 'thermal_resistor', position: { x: 250, y: 200 }, label: 'Heating Element', params: { Rth: 35 } },
    { id: 'convection_link', blockId: 'convective_heat', position: { x: 450, y: 100 }, label: 'Convection Interface', params: { h: 80, A: 0.15 } },
    { id: 'air_chamber', blockId: 'ma_chamber', position: { x: 650, y: 200 }, label: 'Cooking Basket (Air)', params: { V: 0.005 } },
    { id: 'circulation_fan', blockId: 'ma_pressure_source', position: { x: 650, y: 400 }, label: 'Air Circulation Fan', params: { P: 150 } },
    { id: 'fan_ctrl', blockId: 'ps_constant', position: { x: 650, y: 550 }, label: 'Fan Speed Ctrl', params: { value: 0.8 } },
    { id: 'temp_sensor', blockId: 'temp_sensor', position: { x: 850, y: 200 }, label: 'Basket Temp Sensor' },
    { id: 'thermal_scope', blockId: 'scope', position: { x: 1050, y: 150 }, label: 'Temp Monitor', params: { time_range: 300 } },
    { id: 'ground', blockId: 'ground', position: { x: 200, y: 400 }, label: 'PE Ground' }
  ],
  edges: [
    { id: 'e1', source: 'ac_supply', target: 'heating_element', sourceHandle: 'p_s', targetHandle: 'a_t' },
    { id: 'e1_ret', source: 'heating_element', target: 'ground', sourceHandle: 'b_s', targetHandle: 'a_t' },
    { id: 'e1_gnd', source: 'ac_supply', target: 'ground', sourceHandle: 'n_s', targetHandle: 'a_t' },
    { id: 'e2', source: 'heating_element', target: 'convection_link', sourceHandle: 'h_s', targetHandle: 'a_t' },
    { id: 'e3', source: 'convection_link', target: 'air_chamber', sourceHandle: 'b_s', targetHandle: 'h_t' },
    { id: 'e4', source: 'fan_ctrl', target: 'circulation_fan', sourceHandle: 'y_s', targetHandle: 's_t' },
    { id: 'e5', source: 'circulation_fan', target: 'air_chamber', sourceHandle: 'b_s', targetHandle: 'a_t' },
    { id: 'e6', source: 'air_chamber', target: 'temp_sensor', sourceHandle: 'h_s', targetHandle: 'a_t' },
    { id: 'e7', source: 'temp_sensor', target: 'thermal_scope', sourceHandle: 't_s', targetHandle: 'in1_t' }
  ]
};

const nodes = reconstructLabNodes(lab.nodes);
const edges = lab.edges as any[];

const assembler = new DAEAssembler();
const system = assembler.assemble(nodes, edges);
console.log('Variable Names:');
system.variableNames.forEach((name, idx) => console.log(`  [${idx}] ${name}`));
console.log('Scope outputs:', system.scopeOutputs);

const engine = new VLabPhysicsEngine();
let state: any = null;
const dt = 0.05;
for (let step = 0; step < 5; step++) {
  state = engine.simulateStep(nodes, edges, state, dt);
  console.log(`\nStep ${step + 1}:`);
  console.log('  scopeValues:', state.scopeValues);
  system.variableNames.forEach((name, idx) => {
    console.log(`  [${idx}] ${name}: ${state.x[idx]}`);
  });
}
