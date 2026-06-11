import { describe, it } from 'vitest';
import { VLabPhysicsEngine } from './vlabPhysics';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';

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

const microwaveLab = {
  id: 'advanced_microwave_design',
  nodes: [
    { id: 'pwr_ac', blockId: 'ac_voltage', position: { x: 50, y: 300 }, label: 'AC Supply (230V)', params: { Vpk: 325, f: 50 } },
    { id: 'mw_inverter', blockId: 'microwave_inverter', position: { x: 250, y: 150 }, label: 'HV Inverter', params: { v_out: 4000 } },
    { id: 'mw_magnetron', blockId: 'magnetron', position: { x: 450, y: 100 }, label: '900W Magnetron', params: { efficiency: 65 } },
    { id: 'mw_heater', blockId: 'upper_heater', position: { x: 450, y: 250 }, label: 'Upper Heater', params: { resistance: 35 } },
    { id: 'mw_steam', blockId: 'steam_generator', position: { x: 450, y: 400 }, label: '800W Steam Gen', params: { power: 800 } },
    { id: 'mw_cavity', blockId: 'microwave_cavity', position: { x: 700, y: 250 }, label: '25L Cavity', params: { volume: 25 } },
    { id: 'mw_scope', blockId: 'scope', position: { x: 900, y: 250 }, label: 'Temp Analysis', params: { time_range: 30 } },
    { id: 'mw_ground', blockId: 'ground', position: { x: 300, y: 500 }, label: 'Circuit Ground', params: {} }
  ],
  edges: [
    { id: 'me1', source: 'pwr_ac', target: 'mw_inverter', sourceHandle: 'p_s', targetHandle: 'ac_in_t' },
    { id: 'me2', source: 'mw_inverter', target: 'mw_magnetron', sourceHandle: 'hv_out_s', targetHandle: 'p_t' },
    { id: 'me3', source: 'pwr_ac', target: 'mw_heater', sourceHandle: 'p_s', targetHandle: 'p_t' },
    { id: 'me4', source: 'pwr_ac', target: 'mw_steam', sourceHandle: 'p_s', targetHandle: 'p_t' },
    { id: 'me5', source: 'mw_magnetron', target: 'mw_cavity', sourceHandle: 'h_s', targetHandle: 'h1_t' },
    { id: 'me6', source: 'mw_heater', target: 'mw_cavity', sourceHandle: 'h_s', targetHandle: 'h2_t' },
    { id: 'me7', source: 'mw_steam', target: 'mw_cavity', sourceHandle: 's_s', targetHandle: 'h3_t' },
    { id: 'me8', source: 'mw_cavity', target: 'mw_scope', sourceHandle: 't_s', targetHandle: 'in1_t' },
    { id: 'mg1', source: 'pwr_ac', target: 'mw_ground', sourceHandle: 'n_s', targetHandle: 'a_t' },
    { id: 'mg2', source: 'mw_magnetron', target: 'mw_ground', sourceHandle: 'n_s', targetHandle: 'a_t' },
    { id: 'mg3', source: 'mw_heater', target: 'mw_ground', sourceHandle: 'n_s', targetHandle: 'a_t' },
    { id: 'mg4', source: 'mw_steam', target: 'mw_ground', sourceHandle: 'n_s', targetHandle: 'a_t' }
  ]
};

describe('Debug Microwave', () => {
  it('prints Jacobian and residuals', () => {
    const engine = new VLabPhysicsEngine();
    const nodes = reconstructLabNodes(microwaveLab.nodes);
    const edges = microwaveLab.edges;

    const system = engine['assembler'].assemble(nodes, edges);
    console.log("System variables count:", system.systemSize);
    console.log("Variables:", system.variableNames);

    const x = new Array(system.systemSize).fill(0);
    // Initialize temperature variables to 293.15 to avoid singularity
    system.variableNames.forEach((name, idx) => {
      if (name.includes('thermal') || name.includes('temp') || name.includes('cavity')) {
        x[idx] = 293.15;
      }
    });

    const ctx = {
      dt: 0.05,
      time: 0.05,
      parameters: {},
      prevStates: [...x],
      states: x,
      stateDerivatives: new Array(system.systemSize).fill(0)
    };

    const dx = x.map((val, idx) => (val - ctx.prevStates[idx]) / ctx.dt);
    const fx = system.residuals(x, dx, ctx);
    console.log("\nInitial residuals fx at initial x:", fx);

    // Let's compute Jacobian
    const J = engine['solver']['computeJacobian']((solveX, solveCtx) => {
      const solveDx = solveX.map((val, idx) => (val - solveCtx.prevStates[idx]) / ctx.dt);
      return system.residuals(solveX, solveDx, solveCtx);
    }, x, fx, ctx);

    console.log("\nJacobian J row-by-row:");
    J.forEach((row, i) => {
      console.log(`Row ${i} (${system.variableNames[i]}):`, JSON.stringify(row));
    });
  });
});
