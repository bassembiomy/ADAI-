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
    // Hook into console.warn to capture solver warning
    const originalWarn = console.warn;
    console.warn = (...args) => {
      console.log("[WARN]", ...args);
    };

    try {
      engine.simulateStep(nodes, edges, null, 0.05);
    } catch (e: any) {
      console.log("Simulation crashed with:", e.message);
    }

    console.warn = originalWarn;
  });
});
