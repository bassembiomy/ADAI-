import { describe, it } from 'vitest';
import { VLabPhysicsEngine } from './vlabPhysics';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';
import { DAEAssembler } from './DAEAssembler';

const allBlocks = VLAB_LIBRARY.flatMap(d => d.blocks);

const reconstructLabNodes = (labNodes: any[]): any[] => {
  return labNodes.map(ln => {
    const baseBlock = allBlocks.find(b => b.id === ln.blockId);
    if (!baseBlock) return { id: ln.id, type: 'default', position: ln.position, data: { label: ln.label || ln.id, type: ln.blockId, params: {} } };
    const mergedParams = JSON.parse(JSON.stringify(baseBlock.params));
    if (ln.params) {
      Object.keys(ln.params).forEach(key => {
        if (mergedParams[key]) mergedParams[key].value = ln.params![key];
      });
    }
    const domain = VLAB_LIBRARY.find(d => d.blocks.some(b => b.id === ln.blockId))?.type;
    return { id: ln.id, type: 'default', position: ln.position, data: { label: ln.label || baseBlock.name, type: baseBlock.id, icon: baseBlock.icon, color: baseBlock.color, ports: baseBlock.ports, params: mergedParams, domain } };
  });
};

const blenderLab = {
  id: 'blender_mixer',
  nodes: [
    { id: 'dc_source', blockId: 'dc_voltage', position: { x: 50, y: 200 }, label: '24V Battery', params: { V: 24 } },
    { id: 'blender_motor', blockId: 'rotational_electromechanical_converter', position: { x: 250, y: 200 }, label: 'DC Motor', params: { K: 0.05, R: 2 } },
    { id: 'mixture_drag', blockId: 'rot_damper', position: { x: 450, y: 200 }, label: 'Mixture Viscosity', params: { b: 0.001 } },
    { id: 'blade_inertia', blockId: 'inertia', position: { x: 450, y: 350 }, label: 'Blade Inertia', params: { J: 0.0002 } },
    { id: 'speed_sensor', blockId: 'rot_motion_sensor', position: { x: 650, y: 200 }, label: 'Speed Sensor' },
    { id: 'blender_scope', blockId: 'scope', position: { x: 850, y: 150 }, label: 'Performance Monitor', params: { time_range: 5 } },
    { id: 'gnd', blockId: 'ground', position: { x: 150, y: 400 }, label: 'Common' }
  ],
  edges: [
    { id: 'be1', source: 'dc_source', target: 'blender_motor', sourceHandle: 'p_s', targetHandle: 'p_t' },
    { id: 'be1_ret', source: 'blender_motor', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
    { id: 'be1_gnd', source: 'dc_source', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
    { id: 'be2', source: 'blender_motor', target: 'mixture_drag', sourceHandle: 'r_s', targetHandle: 'r_t' },
    { id: 'be3', source: 'mixture_drag', target: 'blade_inertia', sourceHandle: 'r_s', targetHandle: 'r_t' },
    { id: 'be4', source: 'mixture_drag', target: 'speed_sensor', sourceHandle: 'r_s', targetHandle: 'r_t' },
    { id: 'be5', source: 'speed_sensor', target: 'blender_scope', sourceHandle: 'w_s', targetHandle: 'in1_t' }
  ]
};

describe('Debug Blender Mixer', () => {
  it('debugs one step', () => {
    const engine = new VLabPhysicsEngine();
    const nodes = reconstructLabNodes(blenderLab.nodes);
    const edges = blenderLab.edges;

    console.log("Assembling blender_mixer...");
    const originalWarn = console.warn;
    console.warn = (...args) => {
      console.log("[WARN]", ...args);
    };

    try {
      const state1 = engine.simulateStep(nodes, edges, null, 0.05);
      console.log("Variable Names and Values:");
      const sys = engine['currentSystem']!;
      sys.variableNames.forEach((name, idx) => {
        console.log(`  [${idx}] ${name}: ${state1.x[idx]}`);
      });
      console.log("Scope values:", state1.scopeValues);
    } catch (e: any) {
      console.log("Simulation crashed with:", e.message);
    }

    console.warn = originalWarn;
  });

  it('debugs vfd_inverter_drive', () => {
    const engine = new VLabPhysicsEngine();
    const lab = {
      nodes: [
        { id: 'dc_link', blockId: 'dc_voltage', position: { x: 50, y: 300 }, label: 'DC Link (600V)', params: { V: 600 } },
        { id: 'inverter', blockId: 'pwm_3ph_2level', position: { x: 300, y: 300 }, label: '3-Phase Inverter' },
        { id: 'vfd_controller', blockId: 'im_foc_ctrl', position: { x: 300, y: 100 }, label: 'VFD Controller', params: { mode: 1 } },
        { id: 'im_motor', blockId: 'ac_motor', position: { x: 550, y: 300 }, label: 'Induction Motor' },
        { id: 'ref_speed', blockId: 'ps_step', position: { x: 50, y: 100 }, label: 'Speed Reference', params: { time: 1, initial: 500, final: 1500 } },
        { id: 'vfd_scope', blockId: 'scope', position: { x: 800, y: 200 }, label: 'VFD Performance', params: { time_range: 5 } },
        { id: 'gnd', blockId: 'ground', position: { x: 300, y: 500 }, label: 'Common Ground' }
      ],
      edges: [
        { id: 've1', source: 'ref_speed', target: 'vfd_controller', sourceHandle: 'y_s', targetHandle: 'wr_ref_t' },
        { id: 've2', source: 'dc_link', target: 'inverter', sourceHandle: 'p_s', targetHandle: 'p_t' },
        { id: 've2_ret', source: 'dc_link', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
        { id: 've2_inv', source: 'inverter', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
        { id: 've3', source: 'vfd_controller', target: 'inverter', sourceHandle: 'vabc_s', targetHandle: 'vabc_t' },
        { id: 've4_a', source: 'inverter', target: 'im_motor', sourceHandle: 'a_s', targetHandle: 'a_t' },
        { id: 've4_b', source: 'inverter', target: 'im_motor', sourceHandle: 'b_s', targetHandle: 'b_t' },
        { id: 've4_c', source: 'inverter', target: 'im_motor', sourceHandle: 'c_s', targetHandle: 'c_t' },
        { id: 've4_n', source: 'im_motor', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
        { id: 've5', source: 'im_motor', target: 'vfd_scope', sourceHandle: 'r_s', targetHandle: 'in1_t' }
      ]
    };
    const nodes = reconstructLabNodes(lab.nodes);
    let state: any = null;
    for (let step = 0; step < 5; step++) {
      state = engine.simulateStep(nodes, lab.edges, state, 0.05);
      console.log(`Step ${step+1} Scope:`, state.scopeValues);
      console.log(`Step ${step+1} Variable Names and Values:`);
      const sys = engine['currentSystem']!;
      sys.variableNames.forEach((name, idx) => {
        console.log(`  [${idx}] ${name}: ${state.x[idx]}`);
      });
    }
  });

  it('debugs air_fryer_thermal', () => {
    const lab = {
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
    const assembler = new DAEAssembler();
    const system = assembler.assemble(nodes, lab.edges);
    const x0 = new Array(system.systemSize).fill(0);
    system.variableNames.forEach((name, idx) => {
      if (name.includes('state_temp') || (name.includes('Across_') && name.includes('thermal'))) {
        x0[idx] = 298.15;
      }
    });
    
    const ctx = {
      states: x0,
      dt: 0.05,
      time: 0.05,
      prevStates: x0,
      stateDerivatives: new Array(system.systemSize).fill(0),
      order: 1,
      parameters: {}
    };
    const res = (system as any).residuals(x0, ctx);
    console.log("Initial Residuals for x0 (ambient):");
    system.variableNames.forEach((name, idx) => {
      console.log(`  ${name}: val=${x0[idx]}, res=${res[idx]}`);
    });
  });
});
