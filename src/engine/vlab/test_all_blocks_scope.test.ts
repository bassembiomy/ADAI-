import { describe, it, expect, afterAll } from 'vitest';
import { VLabPhysicsEngine } from './vlabPhysics';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';
import { blockEquations } from './vlabEquations';
import { Node, Edge } from '@xyflow/react';

// Helper to check if a block has an equation factory
const hasEquationFactory = (blockId: string): boolean => {
  return !!blockEquations[blockId];
};

// Per-block limits: 3 steps per block, each bounded to 3 s wall clock / 2000 step attempts,
// plus a vitest timeout as a backstop for the async path.
const PER_STEP_ATTEMPT_LIMIT = 2000;
const PER_STEP_WALL_CLOCK_MS = 3000;
const PER_BLOCK_TIMEOUT_MS = 30000;

// F-012: blocks whose minimal fixture is well-posed enough yet the solver still fails.
// Not fixed here; the equations belong to the named domain work package.
const KNOWN_SOLVER_FAILURES: Record<string, { finding: string; wp: string; diagnosis: string }> = {
  gas_reservoir: {
    finding: 'F-012', wp: 'WP-10..21 (gas domain)',
    diagnosis: 'Newton fails with s=5 driven: port s variable stays at ~P/2 while across[0]-across[1] residual is 5e4; gas ports are not wired by the fixture and no gas reference exists',
  },
  ma_pressure_source: {
    finding: 'F-012', wp: 'WP-10..21 (moist-air/fluid domain)',
    diagnosis: 'a/b fluid ports float with no reference or flow path; branch variable diverges (2.5e12) -> singular Jacobian',
  },
  mass_flow_source: {
    finding: 'F-012', wp: 'WP-10..21 (fluid/steam domain)',
    diagnosis: 'ideal mass-flow source into a dead-end port: KCL forces branch=0 while equation demands mdot (needs a sink/reservoir); fixture has none',
  },
  dist_constraint: {
    finding: 'F-012', wp: 'WP-10..21 (multibody)',
    diagnosis: 'frame ports b/f are unconnected by the fixture (no multibody world/rigid body); constraint rows unbalanced',
  },
  luenberger_observer: {
    finding: 'F-012', wp: 'WP-10..21 (control/estimators)',
    diagnosis: 'scalar ODE dxhat=-xhat+u+L(y-xhat) collapses the step to 1e-6 and times out; equation ignores matrix A and the state/branch mapping needs review',
  },
};

// Blocks that are themselves ideal voltage sources: their ports are loaded, never driven.
const ELECTRICAL_SOURCE_DUTS = ['three_phase_source'];

describe('VLab All Blocks, Solver, and Scope Diagnostic Test Suite', () => {
  const allBlocks = VLAB_LIBRARY.flatMap(d => d.blocks);

  // We write a diagnostic report to console and return detailed status
  const diagnosticResults: any[] = [];

  allBlocks.forEach(block => {
    // Skip scope and ground as they are test harness components
    if (block.id === 'scope' || block.id === 'ground') {
      return;
    }

    // Documented, still-failing blocks run under it.fails so the suite stays green while
    // any NEW solver error (or a fix that makes one of these pass) is a loud failure.
    const known = KNOWN_SOLVER_FAILURES[block.id];
    const run = known ? it.fails : it;

    run(`Tests block: ${block.id} (${block.name})${known ? ` [known failure ${known.finding} -> ${known.wp}]` : ''}`, () => {
      const engine = new VLabPhysicsEngine();
      // A synchronous solver loop cannot be interrupted by vitest's test timeout, so
      // bound every simulateStep inside the engine: a non-convergent block must throw
      // a diagnosable error (recorded as a solver error below) instead of hanging the suite.
      engine.setStepBudget({ maxStepAttempts: PER_STEP_ATTEMPT_LIMIT, wallClockMs: PER_STEP_WALL_CLOCK_MS });
      const nodes: Node[] = [];
      const edges: Edge[] = [];

      // 1. Create the Device Under Test (DUT) node
      const dutParams: Record<string, any> = {};
      Object.entries(block.params || {}).forEach(([k, v]: [string, any]) => {
        dutParams[k] = v.value;
      });

      nodes.push({
        id: 'dut',
        type: 'default',
        position: { x: 200, y: 200 },
        data: {
          type: block.id,
          params: dutParams,
          ports: block.ports
        }
      } as any);

      // 2. Identify ports and setup support nodes (sources/references/scopes)
      let scopeConnected = false;

      block.ports.forEach((port, idx) => {
        const portId = port.id;
        const domain = (port.domain || VLAB_LIBRARY.find(d => d.blocks.some(b => b.id === block.id))?.type || 'Electrical').toLowerCase();
        
        const portKey = `dut_${portId}`;

        if (domain === 'electrical') {
          // Ideal voltage-source DUTs must not be driven by another ideal source.
          if (['p', 'p1', 'a', 'in_p', 'c', 'd'].includes(portId) && !ELECTRICAL_SOURCE_DUTS.includes(block.id)) {
            // Electrical source node
            const srcId = `src_elec_${portId}`;
            nodes.push({
              id: srcId,
              type: 'default',
              position: { x: 50, y: 100 * idx },
              data: { type: 'dc_voltage', params: { V: 12 } }
            } as any);
            // Ground node
            if (!nodes.some(n => n.id === 'gnd')) {
              nodes.push({
                id: 'gnd',
                type: 'default',
                position: { x: 50, y: 400 },
                data: { type: 'ground' }
              } as any);
            }
            // Connections
            edges.push({ id: `e_src_${portId}`, source: srcId, target: 'dut', sourceHandle: 'p_s', targetHandle: `${portId}_t` });
            edges.push({ id: `e_gnd_${portId}`, source: srcId, target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' });
          } else {
            // Load the port with a resistor to ground (a hard short across an ideal source or
            // output stage is an ill-posed fixture, F-012).
            if (!nodes.some(n => n.id === 'gnd')) {
              nodes.push({
                id: 'gnd',
                type: 'default',
                position: { x: 50, y: 400 },
                data: { type: 'ground' }
              } as any);
            }
            nodes.push({
              id: `load_elec_${portId}`,
              type: 'default',
              position: { x: 120, y: 100 * idx },
              data: { type: 'resistor', params: { R: 1000 } }
            } as any);
            edges.push({ id: `e_load_conn_${portId}`, source: 'dut', target: `load_elec_${portId}`, sourceHandle: `${portId}_s`, targetHandle: 'p_t' });
            edges.push({ id: `e_load_gnd_${portId}`, source: `load_elec_${portId}`, target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' });
          }
        } 
        else if (domain === 'rotational') {
          if (['r', 'r1', 'r2', 's1'].includes(portId)) {
            const srcId = `src_rot_${portId}`;
            nodes.push({
              id: srcId,
              type: 'default',
              position: { x: 50, y: 100 * idx },
              data: { type: 'torque_source', params: { T: 5 } }
            } as any);
            if (!nodes.some(n => n.id === 'ref_rot')) {
              nodes.push({
                id: 'ref_rot',
                type: 'default',
                position: { x: 50, y: 500 },
                data: { type: 'rot_ref' }
              } as any);
            }
            edges.push({ id: `e_rot_src_${portId}`, source: srcId, target: 'dut', sourceHandle: 'r_s', targetHandle: `${portId}_t` });
            edges.push({ id: `e_rot_ref_${portId}`, source: srcId, target: 'ref_rot', sourceHandle: 'c_s', targetHandle: 'r_t' });
            // F-012: an ideal torque source needs an inertia to drive; without one a source/sensor
            // DUT sees source-vs-source (or source-vs-nothing), which is an ill-posed circuit.
            nodes.push({
              id: `load_rot_${portId}`,
              type: 'default',
              position: { x: 120, y: 100 * idx },
              data: { type: 'inertia', params: { J: 0.01 } }
            } as any);
            edges.push({ id: `e_rot_load_${portId}`, source: 'dut', target: `load_rot_${portId}`, sourceHandle: `${portId}_s`, targetHandle: 'r_t' });
          } else {
            if (!nodes.some(n => n.id === 'ref_rot')) {
              nodes.push({
                id: 'ref_rot',
                type: 'default',
                position: { x: 50, y: 500 },
                data: { type: 'rot_ref' }
              } as any);
            }
            edges.push({ id: `e_rot_ref_conn_${portId}`, source: 'dut', target: 'ref_rot', sourceHandle: `${portId}_s`, targetHandle: 'r_t' });
          }
        } 
        else if (domain === 'translational') {
          if (['r', 'p', 'a'].includes(portId)) {
            const srcId = `src_trans_${portId}`;
            nodes.push({
              id: srcId,
              type: 'default',
              position: { x: 50, y: 100 * idx },
              data: { type: 'force_source', params: { F: 10 } }
            } as any);
            if (!nodes.some(n => n.id === 'ref_trans')) {
              nodes.push({
                id: 'ref_trans',
                type: 'default',
                position: { x: 50, y: 600 },
                data: { type: 'trans_ref' }
              } as any);
            }
            edges.push({ id: `e_trans_src_${portId}`, source: srcId, target: 'dut', sourceHandle: 'a_s', targetHandle: `${portId}_t` });
            edges.push({ id: `e_trans_ref_${portId}`, source: srcId, target: 'ref_trans', sourceHandle: 'b_s', targetHandle: 'p_t' });
            // F-012: ideal force source drives a mass (see rotational branch above).
            nodes.push({
              id: `load_trans_${portId}`,
              type: 'default',
              position: { x: 120, y: 100 * idx },
              data: { type: 'mass', params: { m: 1 } }
            } as any);
            edges.push({ id: `e_trans_load_${portId}`, source: 'dut', target: `load_trans_${portId}`, sourceHandle: `${portId}_s`, targetHandle: 'p_t' });
          } else {
            if (!nodes.some(n => n.id === 'ref_trans')) {
              nodes.push({
                id: 'ref_trans',
                type: 'default',
                position: { x: 50, y: 600 },
                data: { type: 'trans_ref' }
              } as any);
            }
            edges.push({ id: `e_trans_ref_conn_${portId}`, source: 'dut', target: 'ref_trans', sourceHandle: `${portId}_s`, targetHandle: 'p_t' });
          }
        }
        else if (domain === 'thermal') {
          if (block.id === 'thermal_ref') {
            const srcId = 'src_thermal_ref_driver';
            const condId = 'cond_thermal_ref_driver';
            if (!nodes.some(n => n.id === srcId)) {
              nodes.push({
                id: srcId,
                type: 'default',
                position: { x: 50, y: 100 },
                data: { type: 'temp_src', params: { T: 350 } }
              } as any);
              nodes.push({
                id: condId,
                type: 'default',
                position: { x: 150, y: 100 },
                data: { type: 'conductive_heat', params: { k: 2 } }
              } as any);
              edges.push({ id: 'e_ref_src_cond', source: srcId, target: condId, sourceHandle: 'a_s', targetHandle: 'a_t' });
              edges.push({ id: 'e_ref_cond_dut', source: condId, target: 'dut', sourceHandle: 'b_s', targetHandle: 'a_t' });
            }
          } else if (block.id === 'temp_src') {
            const condId = 'cond_temp_src_load';
            if (!nodes.some(n => n.id === condId)) {
              nodes.push({
                id: condId,
                type: 'default',
                position: { x: 150, y: 100 },
                data: { type: 'conductive_heat', params: { k: 2 } }
              } as any);
              if (!nodes.some(n => n.id === 'ref_thermal')) {
                nodes.push({
                  id: 'ref_thermal',
                  type: 'default',
                  position: { x: 50, y: 700 },
                  data: { type: 'thermal_ref' }
                } as any);
              }
              edges.push({ id: 'e_ts_dut_cond', source: 'dut', target: condId, sourceHandle: 'a_s', targetHandle: 'a_t' });
              edges.push({ id: 'e_ts_cond_ref', source: condId, target: 'ref_thermal', sourceHandle: 'b_s', targetHandle: 'a_t' });
            }
          } else if (block.id === 'heat_flow_sensor' || block.id === 'ctrl_temp_src') {
            if (portId === 'a') {
              const srcId = `src_thermal_${portId}`;
              nodes.push({
                id: srcId,
                type: 'default',
                position: { x: 50, y: 100 * idx },
                data: { type: 'temp_src', params: { T: 350 } }
              } as any);
              edges.push({ id: `e_thermal_src_${portId}`, source: srcId, target: 'dut', sourceHandle: 'a_s', targetHandle: 'a_t' });
            } else if (portId === 'b') {
              const condId = `cond_link_${portId}`;
              nodes.push({
                id: condId,
                type: 'default',
                position: { x: 150, y: 100 * idx },
                data: { type: 'conductive_heat', params: { k: 2 } }
              } as any);
              if (!nodes.some(n => n.id === 'ref_thermal')) {
                nodes.push({
                  id: 'ref_thermal',
                  type: 'default',
                  position: { x: 50, y: 700 },
                  data: { type: 'thermal_ref' }
                } as any);
              }
              edges.push({ id: `e_sensor_to_cond`, source: 'dut', target: condId, sourceHandle: 'b_s', targetHandle: 'a_t' });
              edges.push({ id: `e_cond_to_ref`, source: condId, target: 'ref_thermal', sourceHandle: 'b_s', targetHandle: 'a_t' });
            }
          } else if (['a', 'h'].includes(portId)) {
            const srcId = `src_thermal_${portId}`;
            nodes.push({
              id: srcId,
              type: 'default',
              position: { x: 50, y: 100 * idx },
              data: { type: 'temp_src', params: { T: 350 } }
            } as any);
            edges.push({ id: `e_thermal_src_${portId}`, source: srcId, target: 'dut', sourceHandle: 'a_s', targetHandle: `${portId}_t` });
          } else {
            if (!nodes.some(n => n.id === 'ref_thermal')) {
              nodes.push({
                id: 'ref_thermal',
                type: 'default',
                position: { x: 50, y: 700 },
                data: { type: 'thermal_ref' }
              } as any);
            }
            edges.push({ id: `e_thermal_ref_conn_${portId}`, source: 'dut', target: 'ref_thermal', sourceHandle: `${portId}_s`, targetHandle: 'a_t' });
          }
        }
        else if (domain === 'physical') {
          const isInput = ['u', 'u1', 'u2', 'e', 'ref', 'ctrl', 'in', 'in1', 'in2', 'in3', 'vgs', 'vds', 'vge', 'vce', 'wr_ref', 'target_rpm', 'x1', 'x2', 'target', 'lr', 'error', 'reward', 'reset', 'w_ref', 'tl', 's'].includes(portId.toLowerCase());
          
          if (isInput) {
            const srcId = `src_ps_${portId}`;
            nodes.push({
              id: srcId,
              type: 'default',
              position: { x: 50, y: 100 * idx },
              data: { type: 'ps_constant', params: { value: 5.0 } }
            } as any);
            edges.push({ id: `e_ps_src_${portId}`, source: srcId, target: 'dut', sourceHandle: 'y_s', targetHandle: `${portId}_t` });
          } else {
            // Output port! Connect to a scope
            if (!scopeConnected) {
              if (!nodes.some(n => n.id === 'diag_scope')) {
                nodes.push({
                  id: 'diag_scope',
                  type: 'default',
                  position: { x: 400, y: 200 },
                  data: { type: 'scope' }
                } as any);
              }
              edges.push({ id: `e_scope_${portId}`, source: 'dut', target: 'diag_scope', sourceHandle: `${portId}_s`, targetHandle: 'in1_t' });
              scopeConnected = true;
            }
          }
        }
      });

      // If no scope is connected yet, we connect a sensor to measure its output port
      if (!scopeConnected && block.ports.length > 0) {
        const firstPort = block.ports[0];
        const domain = (firstPort.domain || VLAB_LIBRARY.find(d => d.blocks.some(b => b.id === block.id))?.type || 'Electrical').toLowerCase();
        
        if (!nodes.some(n => n.id === 'diag_scope')) {
          nodes.push({
            id: 'diag_scope',
            type: 'default',
            position: { x: 400, y: 200 },
            data: { type: 'scope' }
          } as any);
        }

        if (domain === 'electrical') {
          nodes.push({
            id: 'diag_v_sensor',
            type: 'default',
            position: { x: 300, y: 150 },
            data: { type: 'v_sensor' }
          } as any);
          edges.push({ id: 'e_sensor_to_dut', source: 'dut', target: 'diag_v_sensor', sourceHandle: `${firstPort.id}_s`, targetHandle: 'p_t' });
          edges.push({ id: 'e_sensor_to_scope', source: 'diag_v_sensor', target: 'diag_scope', sourceHandle: 'v_s', targetHandle: 'in1_t' });
        } else if (domain === 'rotational') {
          nodes.push({
            id: 'diag_w_sensor',
            type: 'default',
            position: { x: 300, y: 150 },
            data: { type: 'rot_motion_sensor' }
          } as any);
          edges.push({ id: 'e_sensor_to_dut', source: 'dut', target: 'diag_w_sensor', sourceHandle: `${firstPort.id}_s`, targetHandle: 'r_t' });
          edges.push({ id: 'e_sensor_to_scope', source: 'diag_w_sensor', target: 'diag_scope', sourceHandle: 'w_s', targetHandle: 'in1_t' });
        } else if (domain === 'translational') {
          nodes.push({
            id: 'diag_v_sensor',
            type: 'default',
            position: { x: 300, y: 150 },
            data: { type: 'trans_motion_sensor' }
          } as any);
          edges.push({ id: 'e_sensor_to_dut', source: 'dut', target: 'diag_v_sensor', sourceHandle: `${firstPort.id}_s`, targetHandle: 'r_t' });
          edges.push({ id: 'e_sensor_to_scope', source: 'diag_v_sensor', target: 'diag_scope', sourceHandle: 'v_s', targetHandle: 'in1_t' });
        } else if (domain === 'thermal') {
          nodes.push({
            id: 'diag_t_sensor',
            type: 'default',
            position: { x: 300, y: 150 },
            data: { type: 'temp_sensor' }
          } as any);
          edges.push({ id: 'e_sensor_to_dut', source: 'dut', target: 'diag_t_sensor', sourceHandle: `${firstPort.id}_s`, targetHandle: 'a_t' });
          edges.push({ id: 'e_sensor_to_scope', source: 'diag_t_sensor', target: 'diag_scope', sourceHandle: 't_s', targetHandle: 'in1_t' });
        }
      }

      // 3. Simulate and collect diagnostic data
      let state: any = null;
      let errorOccurred = false;
      let errorMessage = '';
      let scopeReadings: number[] = [];

      try {
        for (let step = 0; step < 3; step++) {
          state = engine.simulateStep(nodes, edges, state, 0.05);
          const val = state.scopeValues;
          const readVal = typeof val === 'object' ? (val.value !== undefined ? val.value : 0) : (val !== undefined ? val : 0);
          scopeReadings.push(readVal);
        }
      } catch (err: any) {
        errorOccurred = true;
        errorMessage = err.message;
      }

      const eqFactory = hasEquationFactory(block.id);
      const isZero = scopeReadings.length > 0 && scopeReadings.every(r => Math.abs(r) < 1e-12);
      
      const status = {
        id: block.id,
        name: block.name,
        hasEquationFactory: eqFactory,
        simulationSuccess: !errorOccurred,
        solverError: errorMessage,
        scopeReadings,
        isScopeAlwaysZero: isZero
      };

      diagnosticResults.push(status);
      // F-012: a solver error is a test failure (it used to be swallowed).
      expect(errorOccurred, `solver error for ${block.id}: ${errorMessage}`).toBe(false);
    }, PER_BLOCK_TIMEOUT_MS);
  });

  afterAll(() => {
    // Generate a beautiful markdown report of all library blocks
    console.log('\n======================================================================');
    console.log('                    VLAB BLOCK DIAGNOSTIC REPORT                      ');
    console.log('======================================================================\n');
    console.log('| Block ID | Name | Eq. Factory? | Sim Success? | Scope Readings | Status |');
    console.log('|---|---|---|---|---|---|');
    
    diagnosticResults.forEach(r => {
      let statusStr = '✅ OK';
      if (!r.hasEquationFactory) {
        statusStr = '⚠️ Missing Eq Factory (Shows 0)';
      } else if (!r.simulationSuccess) {
        statusStr = `❌ Sim Error: ${r.solverError.slice(0, 35)}...`;
      } else if (r.isScopeAlwaysZero) {
        statusStr = '⚠️ Scope reads 0 (No signal propagation)';
      }
      
      console.log(`| \`${r.id}\` | ${r.name} | ${r.hasEquationFactory ? 'Yes' : 'No'} | ${r.simulationSuccess ? 'Yes' : 'No'} | ${JSON.stringify(r.scopeReadings)} | ${statusStr} |`);
    });
    console.log('\n======================================================================\n');
  });
});
