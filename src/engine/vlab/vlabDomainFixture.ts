/**
 * Domain-correct single-block test network (WP-07, F-028).
 *
 * Builds `dut` plus the supporting sources / loads / references / scope it needs, wiring every port to a block
 * of ITS OWN domain through exact port ids, so the network passes the pre-simulation topology validation
 * (same-domain wires, signal out->in only, every required port connected). Shared by the validation harness
 * and the all-blocks scope diagnostic. Earlier the harness wired `dc_voltage.p` into every DUT's `p` regardless
 * of domain and used the non-existent block type `thermal_reference`.
 */
import type { Node, Edge } from '@xyflow/react';
import { VLAB_LIBRARY, type VLabBlock } from '../../utils/vlabLibrary';
import { requiredPortsOf } from './vlabTopologyValidation';
import { DAEAssembler } from './DAEAssembler';
import { assertStructurallyWellPosed } from './vlabStructure';

/** Blocks that are themselves ideal voltage sources: their ports are loaded, never driven. */
const ELECTRICAL_SOURCE_DUTS = ['three_phase_source'];

/** Absolute-pressure command must agree with the atmospheric reference of an unconnected Fluid port. */
const PS_INPUT_VALUE: Record<string, number> = { ctrl_pressure_source: 101325 };

/** Legacy vocabulary of inputs that were always driven by the old all-blocks fixture (kept so behaviour is unchanged). */
const LEGACY_DRIVEN_INPUTS = new Set(['u', 'u1', 'u2', 'e', 'ref', 'ctrl', 'in', 'in1', 'in2', 'in3', 'vgs', 'vds', 'vge', 'vce', 'wr_ref', 'target_rpm', 'x1', 'x2', 'target', 'lr', 'error', 'reward', 'reset', 'w_ref', 'tl', 's']);

export interface DomainFixture {
  nodes: Node[];
  edges: Edge[];
  /** a scope is wired to a measurable output of the DUT */
  scopeConnected: boolean;
}

const lower = (s?: string) => (s || '').toLowerCase();

/** How a conserving port that has no source of its own is closed: tied straight to the domain reference, or through a load. */
type Termination = 'reference' | 'load';

/**
 * Domain-correct fixture that is also structurally well-posed (WP-09a). The first attempt ties unsourced conserving
 * ports straight to their domain reference. Blocks that determine their through variables only from the network
 * around them (pressure/flow sources, flow sensors, chambers, gears, converters, ...) are structurally singular when
 * every port is pinned like that; for those the unsourced ports are closed through a resistive load to the reference.
 */
export function buildDomainFixture(block: VLabBlock, dutParams: Record<string, any>): DomainFixture {
  const direct = buildFixture(block, dutParams, 'reference');
  if (isStructurallyWellPosed(direct)) return direct;
  const loaded = buildFixture(block, dutParams, 'load');
  return isStructurallyWellPosed(loaded) ? loaded : direct;
}

function isStructurallyWellPosed(fixture: DomainFixture): boolean {
  const e = console.error; const w = console.warn;
  console.error = () => {}; console.warn = () => {};
  try {
    assertStructurallyWellPosed(new DAEAssembler().assemble(fixture.nodes, fixture.edges));
    return true;
  } catch {
    return false; // the caller keeps the original fixture; the consumer reports the real error
  } finally {
    console.error = e; console.warn = w;
  }
}

function buildFixture(block: VLabBlock, dutParams: Record<string, any>, termination: Termination): DomainFixture {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const has = (id: string) => nodes.some(n => n.id === id);
  const addNode = (id: string, type: string, x: number, y: number, params?: Record<string, any>) => {
    if (has(id)) return;
    nodes.push({ id, type: 'default', position: { x, y }, data: params ? { type, params } : { type } } as any);
  };
  const wire = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string) =>
    edges.push({ id, source, target, sourceHandle, targetHandle } as Edge);

  nodes.push({
    id: 'dut', type: 'default', position: { x: 200, y: 200 },
    data: { type: block.id, params: dutParams, ports: block.ports },
  } as any);

  const required = requiredPortsOf(block.id);
  const requiredSignal = new Set(required.signal);
  const requiredConserving = new Set(required.conserving);
  let scopeConnected = false;
  const connected = new Set<string>();

  block.ports.forEach((port, idx) => {
    const portId = port.id;
    const domain = lower(port.domain);

    if (domain === 'electrical') {
      addNode('gnd', 'ground', 50, 400);
      if (['p', 'p1', 'a', 'in_p', 'c', 'd'].includes(portId) && !ELECTRICAL_SOURCE_DUTS.includes(block.id)) {
        const srcId = `src_elec_${portId}`;
        addNode(srcId, 'dc_voltage', 50, 100 * idx, { V: 12 });
        wire(`e_src_${portId}`, srcId, 'p_s', 'dut', `${portId}_t`);
        wire(`e_gnd_${portId}`, srcId, 'n_s', 'gnd', 'a_t');
      } else {
        // load the port with a resistor to ground (a hard short across an ideal source or output stage is ill-posed)
        addNode(`load_elec_${portId}`, 'resistor', 120, 100 * idx, { R: 1000 });
        wire(`e_load_conn_${portId}`, 'dut', `${portId}_s`, `load_elec_${portId}`, 'p_t');
        wire(`e_load_gnd_${portId}`, `load_elec_${portId}`, 'n_s', 'gnd', 'a_t');
      }
      connected.add(portId);
    } else if (domain === 'rotational') {
      addNode('ref_rot', 'rot_ref', 50, 500);
      if (['r', 'r1', 'r2', 's1'].includes(portId)) {
        const srcId = `src_rot_${portId}`;
        addNode(srcId, 'torque_source', 50, 100 * idx, { T: 5 });
        wire(`e_rot_src_${portId}`, srcId, 'r_s', 'dut', `${portId}_t`);
        wire(`e_rot_ref_${portId}`, srcId, 'c_s', 'ref_rot', 'r_t');
        // an ideal torque source needs an inertia to drive
        addNode(`load_rot_${portId}`, 'inertia', 120, 100 * idx, { J: 0.01 });
        wire(`e_rot_load_${portId}`, 'dut', `${portId}_s`, `load_rot_${portId}`, 'r_t');
      } else if (termination === 'load') {
        addNode(`term_rot_${portId}`, 'rot_damper', 120, 100 * idx, { b: 0.1 });
        wire(`e_rot_term_${portId}`, 'dut', `${portId}_s`, `term_rot_${portId}`, 'r_t');
        wire(`e_rot_term_ref_${portId}`, `term_rot_${portId}`, 'c_s', 'ref_rot', 'r_t');
      } else {
        wire(`e_rot_ref_conn_${portId}`, 'dut', `${portId}_s`, 'ref_rot', 'r_t');
      }
      connected.add(portId);
    } else if (domain === 'translational') {
      addNode('ref_trans', 'trans_ref', 50, 600);
      if (['r', 'p', 'a'].includes(portId)) {
        const srcId = `src_trans_${portId}`;
        addNode(srcId, 'force_source', 50, 100 * idx, { F: 10 });
        wire(`e_trans_src_${portId}`, srcId, 'a_s', 'dut', `${portId}_t`);
        wire(`e_trans_ref_${portId}`, srcId, 'b_s', 'ref_trans', 'p_t');
        // an ideal force source drives a mass
        addNode(`load_trans_${portId}`, 'mass', 120, 100 * idx, { m: 1 });
        wire(`e_trans_load_${portId}`, 'dut', `${portId}_s`, `load_trans_${portId}`, 'p_t');
      } else if (termination === 'load') {
        addNode(`term_trans_${portId}`, 'trans_damper', 120, 100 * idx, { b: 10 });
        wire(`e_trans_term_${portId}`, 'dut', `${portId}_s`, `term_trans_${portId}`, 'r_t');
        wire(`e_trans_term_ref_${portId}`, `term_trans_${portId}`, 'c_s', 'ref_trans', 'p_t');
      } else {
        wire(`e_trans_ref_conn_${portId}`, 'dut', `${portId}_s`, 'ref_trans', 'p_t');
      }
      connected.add(portId);
    } else if (domain === 'thermal') {
      if (block.id === 'thermal_ref') {
        if (!has('src_thermal_ref_driver')) {
          addNode('src_thermal_ref_driver', 'temp_src', 50, 100, { T: 350 });
          addNode('cond_thermal_ref_driver', 'conductive_heat', 150, 100, { k: 2 });
          wire('e_ref_src_cond', 'src_thermal_ref_driver', 'a_s', 'cond_thermal_ref_driver', 'a_t');
          wire('e_ref_cond_dut', 'cond_thermal_ref_driver', 'b_s', 'dut', 'a_t');
        }
      } else if (block.id === 'temp_src') {
        if (!has('cond_temp_src_load')) {
          addNode('cond_temp_src_load', 'conductive_heat', 150, 100, { k: 2 });
          addNode('ref_thermal', 'thermal_ref', 50, 700);
          wire('e_ts_dut_cond', 'dut', 'a_s', 'cond_temp_src_load', 'a_t');
          wire('e_ts_cond_ref', 'cond_temp_src_load', 'b_s', 'ref_thermal', 'a_t');
        }
      } else if (block.id === 'heat_flow_sensor' || block.id === 'ctrl_temp_src') {
        if (portId === 'a') {
          addNode(`src_thermal_${portId}`, 'temp_src', 50, 100 * idx, { T: 350 });
          wire(`e_thermal_src_${portId}`, `src_thermal_${portId}`, 'a_s', 'dut', 'a_t');
        } else if (portId === 'b') {
          addNode(`cond_link_${portId}`, 'conductive_heat', 150, 100 * idx, { k: 2 });
          addNode('ref_thermal', 'thermal_ref', 50, 700);
          wire('e_sensor_to_cond', 'dut', 'b_s', `cond_link_${portId}`, 'a_t');
          wire('e_cond_to_ref', `cond_link_${portId}`, 'b_s', 'ref_thermal', 'a_t');
        }
      } else if (['a', 'h'].includes(portId)) {
        addNode(`src_thermal_${portId}`, 'temp_src', 50, 100 * idx, { T: 350 });
        wire(`e_thermal_src_${portId}`, `src_thermal_${portId}`, 'a_s', 'dut', `${portId}_t`);
      } else if (termination === 'load') {
        addNode('ref_thermal', 'thermal_ref', 50, 700);
        addNode(`term_thermal_${portId}`, 'conductive_heat', 120, 100 * idx, { k: 2 });
        wire(`e_thermal_term_${portId}`, 'dut', `${portId}_s`, `term_thermal_${portId}`, 'a_t');
        wire(`e_thermal_term_ref_${portId}`, `term_thermal_${portId}`, 'b_s', 'ref_thermal', 'a_t');
      } else {
        addNode('ref_thermal', 'thermal_ref', 50, 700);
        wire(`e_thermal_ref_conn_${portId}`, 'dut', `${portId}_s`, 'ref_thermal', 'a_t');
      }
      connected.add(portId);
    } else if (domain === 'physical') {
      const wantsDrive = port.direction === 'in' && (LEGACY_DRIVEN_INPUTS.has(portId.toLowerCase()) || requiredSignal.has(portId));
      if (wantsDrive) {
        const srcId = `src_ps_${portId}`;
        addNode(srcId, 'ps_constant', 50, 100 * idx, { value: PS_INPUT_VALUE[block.id] ?? 5.0 });
        wire(`e_ps_src_${portId}`, srcId, 'y_s', 'dut', `${portId}_t`);
        connected.add(portId);
      } else if (port.direction === 'out' && !scopeConnected) {
        addNode('diag_scope', 'scope', 400, 200);
        wire(`e_scope_${portId}`, 'dut', `${portId}_s`, 'diag_scope', 'in1_t');
        scopeConnected = true;
        connected.add(portId);
      }
    }
  });

  // Required conserving ports of domains this fixture has no source/load for are tied to that domain's reference.
  const REFERENCE: Record<string, { type: string; port: string }> = {
    magnetic: { type: 'mag_ref', port: 'n' },
    fluid: { type: 'fluid_ref', port: 'p' },
    gas: { type: 'gas_ref', port: 'g' },
    isothermal_liquid: { type: 'hydraulic_reference_il', port: 'a' },
  };
  // Load that closes a port through a resistive path to the reference (termination 'load').
  const LOAD: Record<string, { type: string; a: string; b: string; params: Record<string, any> }> = {
    magnetic: { type: 'reluctance', a: 'n', b: 's', params: { R: 1e6 } },
    fluid: { type: 'fluid_resistance', a: 'p', b: 'n', params: { Rf: 1e5 } },
    gas: { type: 'gas_resistance', a: 'a', b: 'b', params: { k: 1 } },
    isothermal_liquid: { type: 'pipe_il', a: 'a', b: 'b', params: { R: 1e5 } },
  };
  for (const port of block.ports) {
    const d = lower(port.domain);
    if (connected.has(port.id) || !REFERENCE[d]) continue;
    const ref = REFERENCE[d];
    if (termination === 'load') {
      // every still-unsourced conserving port of these domains is closed through a load
      const load = LOAD[d];
      addNode(`ref_${d}`, ref.type, 50, 800);
      addNode(`term_${d}_${port.id}`, load.type, 120, 800, load.params);
      wire(`e_term_${d}_${port.id}`, 'dut', `${port.id}_s`, `term_${d}_${port.id}`, `${load.a}_t`);
      wire(`e_term_ref_${d}_${port.id}`, `term_${d}_${port.id}`, `${load.b}_s`, `ref_${d}`, `${ref.port}_t`);
      connected.add(port.id);
      continue;
    }
    if (!requiredConserving.has(port.id)) continue;
    addNode(`ref_${d}`, ref.type, 50, 800);
    wire(`e_ref_${d}_${port.id}`, 'dut', `${port.id}_s`, `ref_${d}`, `${ref.port}_t`);
  }

  // No measurable output: read a conserving port through a sensor of its own domain.
  if (!scopeConnected && block.ports.length > 0) {
    const first = block.ports[0];
    const domain = lower(first.domain) || lower(VLAB_LIBRARY.find(d => d.blocks.some(b => b.id === block.id))?.type) || 'electrical';
    const sensorBy: Record<string, { type: string; sensorPort: string; out: string; id: string }> = {
      electrical: { id: 'diag_v_sensor', type: 'v_sensor', sensorPort: 'p', out: 'v' },
      rotational: { id: 'diag_w_sensor', type: 'rot_motion_sensor', sensorPort: 'r', out: 'w' },
      translational: { id: 'diag_v_sensor', type: 'trans_motion_sensor', sensorPort: 'r', out: 'v' },
      thermal: { id: 'diag_t_sensor', type: 'temp_sensor', sensorPort: 'a', out: 't' },
    };
    const s = sensorBy[domain];
    addNode('diag_scope', 'scope', 400, 200);
    if (s) {
      addNode(s.id, s.type, 300, 150);
      wire('e_sensor_to_dut', 'dut', `${first.id}_s`, s.id, `${s.sensorPort}_t`);
      wire('e_sensor_to_scope', s.id, `${s.out}_s`, 'diag_scope', 'in1_t');
      scopeConnected = true;
    }
  }

  return { nodes, edges, scopeConnected };
}
