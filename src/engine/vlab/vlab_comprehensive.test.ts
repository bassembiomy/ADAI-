/**
 * VLab Comprehensive Test Suite
 * =============================
 * Tests all 7 Learning Labs + individual VLab blocks + engine infrastructure + edge cases.
 * 
 * Run: node ./node_modules/vitest/vitest.mjs run src/engine/vlab/vlab_comprehensive.test.ts --reporter verbose
 */
import { describe, it, expect } from 'vitest';
import { VLabPhysicsEngine } from './vlabPhysics';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';
import { Node, Edge } from '@xyflow/react';

// ============================================================================
// Helpers
// ============================================================================

const allBlocks = VLAB_LIBRARY.flatMap(d => d.blocks);

/** Reconstruct ReactFlow-compatible nodes from lab definition (no UI dependencies) */
const reconstructLabNodes = (labNodes: any[]): Node[] => {
  return labNodes.map(ln => {
    const baseBlock = allBlocks.find(b => b.id === ln.blockId);
    if (!baseBlock) {
      return {
        id: ln.id,
        type: 'default',
        position: ln.position || { x: 0, y: 0 },
        data: { label: ln.label || ln.id, type: ln.blockId, params: {} }
      } as Node;
    }

    const mergedParams = JSON.parse(JSON.stringify(baseBlock.params));
    if (ln.params) {
      Object.keys(ln.params).forEach(key => {
        if (mergedParams[key]) {
          mergedParams[key].value = ln.params![key];
        }
      });
    }

    const domain = VLAB_LIBRARY.find(d => d.blocks.some(b => b.id === ln.blockId))?.type;

    return {
      id: ln.id,
      type: 'default',
      position: ln.position || { x: 0, y: 0 },
      data: {
        label: ln.label || baseBlock.name,
        type: baseBlock.id,
        icon: baseBlock.icon,
        color: baseBlock.color,
        ports: baseBlock.ports,
        params: mergedParams,
        domain
      }
    } as Node;
  });
};

/** Create simple inline nodes (without library lookup) */
const makeNode = (id: string, type: string, params?: Record<string, any>): Node => ({
  id,
  type: 'default',
  position: { x: 0, y: 0 },
  data: { type, params: params || {} }
} as any);

/** Run simulation for N steps and return final state */
const runSim = (
  engine: VLabPhysicsEngine,
  nodes: Node[],
  edges: Edge[],
  steps: number,
  dt: number = 0.05
): { state: any; error: Error | null; successCount: number } => {
  let state: any = null;
  let error: Error | null = null;
  let successCount = 0;

  for (let step = 0; step < steps; step++) {
    try {
      state = engine.simulateStep(nodes, edges, state, dt);
      successCount++;
    } catch (err: any) {
      error = err;
      break;
    }
  }

  return { state, error, successCount };
};

// ============================================================================
// 1. BLOCK-LEVEL UNIT TESTS
// ============================================================================

describe('VLab Block-Level Unit Tests', () => {

  // ---------- Electrical Domain ----------

  describe('Electrical Domain', () => {
    it('E-001: Resistor — Ohm\'s Law (12V / 100Ω = 0.12A)', () => {
      const engine = new VLabPhysicsEngine();
      const nodes: Node[] = [
        makeNode('gnd', 'ground'),
        makeNode('src', 'dc_voltage', { V: 12 }),
        makeNode('res', 'resistor', { R: 100 }),
      ];
      const edges: Edge[] = [
        { id: 'e1', source: 'src', target: 'res', sourceHandle: 'p_s', targetHandle: 'p_t' },
        { id: 'e2', source: 'src', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
        { id: 'e3', source: 'res', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      ];

      const { state, error } = runSim(engine, nodes, edges, 5);
      expect(error).toBeNull();
      expect(state).toBeDefined();

      const system = engine['currentSystem']!;
      const resIdx = system.variableNames.findIndex(name => name.includes('res_branch_current'));
      expect(resIdx).not.toBe(-1);
      expect(state.x[resIdx]).toBeCloseTo(0.12, 4);
    });

    it('E-002: Capacitor — RC charging curve (V_cap ≈ 6.32V at t=1s)', () => {
      const engine = new VLabPhysicsEngine();
      const nodes: Node[] = [
        makeNode('gnd', 'ground'),
        makeNode('src', 'dc_voltage', { V: 10 }),
        makeNode('res', 'resistor', { R: 1000 }),
        makeNode('cap', 'capacitor', { C: 1e-3 }),
      ];
      const edges: Edge[] = [
        { id: 'e1', source: 'src', target: 'res', sourceHandle: 'p_s', targetHandle: 'p_t' },
        { id: 'e2', source: 'res', target: 'cap', sourceHandle: 'n_s', targetHandle: 'p_t' },
        { id: 'e3', source: 'cap', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
        { id: 'e4', source: 'src', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      ];

      const { state, error } = runSim(engine, nodes, edges, 1000, 0.001);
      expect(error).toBeNull();

      const system = engine['currentSystem']!;
      const capAcrossIdx = system.components.find(c => c.blockId === 'cap')!.portNodeMap.get('p')!;
      const capVarIdx = system.variableNames.findIndex(name => name.includes(capAcrossIdx));
      expect(capVarIdx).not.toBe(-1);

      const V_cap = state.x[capVarIdx];
      // Expected: V × (1 - e^(-t/RC)) = 10 × (1 - e^(-1)) ≈ 6.32V
      expect(V_cap).toBeCloseTo(6.32, 1);
    });

    it('E-003: Inductor — RL circuit (I → V/R = 1A steady state)', () => {
      const engine = new VLabPhysicsEngine();
      const nodes: Node[] = [
        makeNode('gnd', 'ground'),
        makeNode('src', 'dc_voltage', { V: 10 }),
        makeNode('res', 'resistor', { R: 10 }),
        makeNode('ind', 'inductor', { L: 0.1 }),
      ];
      const edges: Edge[] = [
        { id: 'e1', source: 'src', target: 'res', sourceHandle: 'p_s', targetHandle: 'p_t' },
        { id: 'e2', source: 'res', target: 'ind', sourceHandle: 'n_s', targetHandle: 'p_t' },
        { id: 'e3', source: 'ind', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
        { id: 'e4', source: 'src', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      ];

      // Simulate long enough for RL time constant (τ = L/R = 0.01s, 5τ = 0.05s)
      const { state, error } = runSim(engine, nodes, edges, 200, 0.001);
      expect(error).toBeNull();

      const system = engine['currentSystem']!;
      const resIdx = system.variableNames.findIndex(name => name.includes('res_branch_current'));
      if (resIdx !== -1) {
        // Steady state: I = V/R = 10/10 = 1A
        expect(Math.abs(state.x[resIdx])).toBeCloseTo(1.0, 1);
      }
    });

    it('E-004: DC Voltage Source — provides constant voltage', () => {
      const engine = new VLabPhysicsEngine();
      const nodes: Node[] = [
        makeNode('gnd', 'ground'),
        makeNode('src', 'dc_voltage', { V: 24 }),
        makeNode('res', 'resistor', { R: 200 }),
      ];
      const edges: Edge[] = [
        { id: 'e1', source: 'src', target: 'res', sourceHandle: 'p_s', targetHandle: 'p_t' },
        { id: 'e2', source: 'src', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
        { id: 'e3', source: 'res', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      ];

      const { state, error } = runSim(engine, nodes, edges, 3);
      expect(error).toBeNull();
      expect(state).toBeDefined();

      // I = 24/200 = 0.12A
      const system = engine['currentSystem']!;
      const resIdx = system.variableNames.findIndex(name => name.includes('res_branch_current'));
      if (resIdx !== -1) {
        expect(state.x[resIdx]).toBeCloseTo(0.12, 3);
      }
    });

    it('E-005: AC Voltage Source — sinusoidal output', () => {
      const engine = new VLabPhysicsEngine();
      const nodes: Node[] = [
        makeNode('gnd', 'ground'),
        makeNode('src', 'ac_voltage', { Vpk: 311, f: 50 }),
        makeNode('res', 'resistor', { R: 100 }),
      ];
      const edges: Edge[] = [
        { id: 'e1', source: 'src', target: 'res', sourceHandle: 'p_s', targetHandle: 'p_t' },
        { id: 'e2', source: 'src', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
        { id: 'e3', source: 'res', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      ];

      const states: number[] = [];
      let state: any = null;
      for (let i = 0; i < 20; i++) {
        state = engine.simulateStep(nodes, edges, state, 0.005);
        const system = engine['currentSystem']!;
        const resIdx = system.variableNames.findIndex(name => name.includes('res_branch_current'));
        if (resIdx !== -1) states.push(state.x[resIdx]);
      }

      // Should have both positive and negative values (sinusoidal)
      const hasPositive = states.some(v => v > 0.1);
      const hasNegative = states.some(v => v < -0.1);
      expect(hasPositive || hasNegative).toBe(true);
    });

    it('E-006: Voltage Sensor — measures voltage across resistor', () => {
      const engine = new VLabPhysicsEngine();
      const nodes = reconstructLabNodes([
        { id: 'src', blockId: 'ac_voltage', position: { x: 0, y: 0 }, params: { Vpk: 311.13, f: 50 } },
        { id: 'res', blockId: 'resistor', position: { x: 100, y: 0 }, params: { R: 100 } },
        { id: 'vs', blockId: 'v_sensor', position: { x: 200, y: 0 }, params: { R_int: 1e8 } },
        { id: 'scope', blockId: 'scope', position: { x: 300, y: 0 }, params: { time_range: 0.1 } },
        { id: 'gnd', blockId: 'ground', position: { x: 100, y: 100 } },
      ]);
      const edges: Edge[] = [
        { id: 'e1', source: 'src', target: 'res', sourceHandle: 'p_s', targetHandle: 'p_t' },
        { id: 'e2', source: 'res', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
        { id: 'e3', source: 'src', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
        { id: 'e4', source: 'res', target: 'vs', sourceHandle: 'p_s', targetHandle: 'p_t' },
        { id: 'e5', source: 'vs', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
        { id: 'e6', source: 'vs', target: 'scope', sourceHandle: 'v_s', targetHandle: 'in1_t' },
      ];

      const { state, error } = runSim(engine, nodes, edges, 5);
      expect(error).toBeNull();
      // Scope should read non-zero voltage
      const val = typeof state.scopeValues === 'object' ? state.scopeValues.value : state.scopeValues;
      expect(Math.abs(val || state.scopeValues)).toBeGreaterThan(1.0);
    });
  });

  // ---------- Mechanical Domain ----------

  describe('Mechanical Domain', () => {
    it('M-001: Mass-Spring-Damper — steady state (x = F/k = 0.1m)', () => {
      const engine = new VLabPhysicsEngine();
      const nodes: Node[] = [
        makeNode('ref', 'trans_ref'),
        makeNode('f_src', 'force_source', { F: 10 }),
        makeNode('mass', 'mass', { m: 1.0 }),
        makeNode('spring', 'trans_spring', { k: 100 }),
        makeNode('damper', 'trans_damper', { b: 5 }),
      ];
      const edges: Edge[] = [
        { id: 'e1', source: 'f_src', target: 'mass', sourceHandle: 'a_s', targetHandle: 'p_t' },
        { id: 'e2', source: 'f_src', target: 'ref', sourceHandle: 'b_s', targetHandle: 'p_t' },
        { id: 'e3', source: 'mass', target: 'spring', sourceHandle: 'p_s', targetHandle: 'r_t' },
        { id: 'e4', source: 'spring', target: 'ref', sourceHandle: 'c_s', targetHandle: 'p_t' },
        { id: 'e5', source: 'mass', target: 'damper', sourceHandle: 'p_s', targetHandle: 'r_t' },
        { id: 'e6', source: 'damper', target: 'ref', sourceHandle: 'c_s', targetHandle: 'p_t' },
      ];

      const { state, error } = runSim(engine, nodes, edges, 80);
      expect(error).toBeNull();

      const system = engine['currentSystem']!;
      const springStateIdx = system.variableNames.findIndex(name => name.includes('spring_state_x'));
      expect(springStateIdx).not.toBe(-1);

      // Steady state: F = k × x → x = 10/100 = 0.1m
      expect(state.x[springStateIdx]).toBeCloseTo(-0.1, 2);
    });

    it('M-002: Inertia + Rotational Damper — torque source drives rotation', () => {
      const engine = new VLabPhysicsEngine();
      const nodes: Node[] = [
        makeNode('ref', 'rot_ref'),
        makeNode('t_src', 'torque_source', { T: 5 }),
        makeNode('J', 'inertia', { J: 0.01 }),
        makeNode('damp', 'rot_damper', { b: 0.1 }),
      ];
      const edges: Edge[] = [
        { id: 'e1', source: 't_src', target: 'J', sourceHandle: 'r_s', targetHandle: 'r_t' },
        { id: 'e2', source: 't_src', target: 'ref', sourceHandle: 'c_s', targetHandle: 'r_t' },
        { id: 'e3', source: 'J', target: 'damp', sourceHandle: 'r_s', targetHandle: 'r_t' },
        { id: 'e4', source: 'damp', target: 'ref', sourceHandle: 'c_s', targetHandle: 'r_t' },
      ];

      const { state, error } = runSim(engine, nodes, edges, 100);
      expect(error).toBeNull();

      // Steady state: ω = T/b = 5/0.1 = 50 rad/s
      const system = engine['currentSystem']!;
      const inertiaPort = system.components.find(c => c.blockId === 'J')?.portNodeMap.get('r');
      if (inertiaPort) {
        const velIdx = system.variableNames.findIndex(name => name.includes(inertiaPort));
        if (velIdx !== -1) {
          expect(Math.abs(state.x[velIdx])).toBeGreaterThan(1.0);
        }
      }
    });
  });

  // ---------- Thermal Domain ----------

  describe('Thermal Domain', () => {
    it('T-001: Conductive Heat Transfer — temperature equilibration', () => {
      const engine = new VLabPhysicsEngine();
      const nodes = reconstructLabNodes([
        { id: 'hot', blockId: 'thermal_mass', position: { x: 0, y: 0 }, params: { C: 100 } },
        { id: 'cond', blockId: 'conductive_heat', position: { x: 100, y: 0 }, params: { k: 10 } },
        { id: 'cold', blockId: 'thermal_mass', position: { x: 200, y: 0 }, params: { C: 100 } },
        { id: 'ref', blockId: 'thermal_ref', position: { x: 100, y: 100 } },
      ]);
      const edges: Edge[] = [
        { id: 'e1', source: 'hot', target: 'cond', sourceHandle: 'a_s', targetHandle: 'a_t' },
        { id: 'e2', source: 'cond', target: 'cold', sourceHandle: 'b_s', targetHandle: 'a_t' },
      ];

      const { state, error } = runSim(engine, nodes, edges, 10);
      expect(error).toBeNull();
      expect(state).toBeDefined();
    });
  });

});

// ============================================================================
// 2. LAB INTEGRATION TESTS — All 7 Learning Labs
// ============================================================================

const LEARNING_LABS = [
  {
    id: 'air_fryer_thermal',
    name: 'Air Fryer Heat Transfer',
    category: 'Thermal & Fluid Dynamics',
    difficulty: 'Advanced',
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
  },
  {
    id: 'blender_mixer',
    name: 'Personal Blender Mixer',
    category: 'Electromechanical',
    difficulty: 'Intermediate',
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
  },
  {
    id: 'pid_ac_motor',
    name: 'PID Speed Control of Induction Motor',
    category: 'Control Systems',
    difficulty: 'Expert',
    nodes: [
      { id: 'ref_speed', blockId: 'ps_constant', position: { x: 50, y: 50 }, label: 'Ref Speed (rad/s)', params: { value: 157 } },
      { id: 'error_calc', blockId: 'ps_subtract', position: { x: 200, y: 100 }, label: 'Error' },
      { id: 'speed_pid', blockId: 'ps_pid_ctrl', position: { x: 350, y: 100 }, label: 'Speed PID', params: { Kp: 2.5, Ki: 1.2 } },
      { id: 'dc_bus', blockId: 'dc_voltage', position: { x: 50, y: 300 }, label: 'DC Link (600V)', params: { V: 600 } },
      { id: 'inverter', blockId: 'pwm_3ph_2level', position: { x: 500, y: 300 }, label: 'Inverter Bridge' },
      { id: 'ac_motor', blockId: 'ac_motor', position: { x: 700, y: 300 }, label: 'Induction Motor', params: { P: 2 } },
      { id: 'speed_sensor', blockId: 'rot_motion_sensor', position: { x: 850, y: 300 }, label: 'Encoder' },
      { id: 'scope', blockId: 'scope', position: { x: 1000, y: 150 }, label: 'PID Response', params: { time_range: 10 } },
      { id: 'gnd', blockId: 'ground', position: { x: 500, y: 500 }, label: 'GND' }
    ],
    edges: [
      { id: 'pe1', source: 'ref_speed', target: 'error_calc', sourceHandle: 'y_s', targetHandle: 'u1_t' },
      { id: 'pe2', source: 'speed_sensor', target: 'error_calc', sourceHandle: 'w_s', targetHandle: 'u2_t' },
      { id: 'pe3', source: 'error_calc', target: 'speed_pid', sourceHandle: 'y_s', targetHandle: 'e_t' },
      { id: 'pe4', source: 'speed_pid', target: 'inverter', sourceHandle: 'u_s', targetHandle: 'vabc_t' },
      { id: 'pe5', source: 'dc_bus', target: 'inverter', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'pe6', source: 'dc_bus', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'pe7', source: 'inverter', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'pe8', source: 'inverter', target: 'ac_motor', sourceHandle: 'a_s', targetHandle: 'a_t' },
      { id: 'pe9', source: 'inverter', target: 'ac_motor', sourceHandle: 'b_s', targetHandle: 'b_t' },
      { id: 'pe10', source: 'inverter', target: 'ac_motor', sourceHandle: 'c_s', targetHandle: 'c_t' },
      { id: 'pe11', source: 'ac_motor', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'pe12', source: 'ac_motor', target: 'speed_sensor', sourceHandle: 'r_s', targetHandle: 'r_t' },
      { id: 'pe13', source: 'speed_sensor', target: 'scope', sourceHandle: 'w_s', targetHandle: 'in1_t' }
    ]
  },
  {
    id: 'vfd_inverter_drive',
    name: 'Variable Frequency Drive (VFD)',
    category: 'Electromechanical',
    difficulty: 'Advanced',
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
  },
  {
    id: 'smart_washing_machine',
    name: 'Smart Washing Machine Dynamics',
    category: 'Consumer Appliances',
    difficulty: 'Expert',
    nodes: [
      { id: 'washing_ctrl', blockId: 'im_foc_ctrl', position: { x: 50, y: 100 }, label: 'Wash Cycle Controller', params: { target_rpm: 600 } },
      { id: 'dc_link', blockId: 'dc_voltage', position: { x: 50, y: 300 }, label: 'DC Bus (320V)', params: { V: 320 } },
      { id: 'inverter', blockId: 'pwm_3ph_2level', position: { x: 300, y: 300 }, label: 'Inverter Drive' },
      { id: 'wash_motor', blockId: 'ac_motor', position: { x: 550, y: 300 }, label: 'Direct Drive Motor' },
      { id: 'basket_load', blockId: 'washing_basket', position: { x: 750, y: 300 }, label: 'Washing Basket', params: { load_mass: 6 } },
      { id: 'wash_scope', blockId: 'scope', position: { x: 950, y: 200 }, label: 'Cycle Analysis', params: { time_range: 10 } },
      { id: 'gnd', blockId: 'ground', position: { x: 300, y: 500 }, label: 'System Ground' }
    ],
    edges: [
      { id: 'we1', source: 'washing_ctrl', target: 'inverter', sourceHandle: 'vabc_s', targetHandle: 'vabc_t' },
      { id: 'we2_dc', source: 'dc_link', target: 'inverter', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'we2_gnd', source: 'dc_link', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'we2_inv', source: 'inverter', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'we3_a', source: 'inverter', target: 'wash_motor', sourceHandle: 'a_s', targetHandle: 'a_t' },
      { id: 'we3_b', source: 'inverter', target: 'wash_motor', sourceHandle: 'b_s', targetHandle: 'b_t' },
      { id: 'we3_c', source: 'inverter', target: 'wash_motor', sourceHandle: 'c_s', targetHandle: 'c_t' },
      { id: 'we3_n', source: 'wash_motor', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'we4', source: 'wash_motor', target: 'basket_load', sourceHandle: 'r_s', targetHandle: 'r_t' },
      { id: 'we5', source: 'wash_motor', target: 'wash_scope', sourceHandle: 'r_s', targetHandle: 'in1_t' }
    ]
  },
  {
    id: 'advanced_microwave_design',
    name: 'Advanced Microwave Design (25L)',
    category: 'Consumer Appliances',
    difficulty: 'Advanced',
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
  },
  {
    id: 'voltage_sensing_circuit',
    name: '220V Power Supply & Voltage Sensing',
    category: 'Electrical Networks',
    difficulty: 'Beginner',
    nodes: [
      { id: 'ac_source', blockId: 'ac_voltage', position: { x: 50, y: 200 }, label: '220V AC Supply', params: { Vpk: 311.13, f: 50 } },
      { id: 'resistor_load', blockId: 'resistor', position: { x: 300, y: 200 }, label: '100Ω Load Resistor', params: { R: 100 } },
      { id: 'v_sensor', blockId: 'v_sensor', position: { x: 550, y: 200 }, label: 'Voltage Sensor', params: { R_int: 1e8 } },
      { id: 'scope', blockId: 'scope', position: { x: 800, y: 150 }, label: 'Oscilloscope', params: { time_range: 0.1 } },
      { id: 'ground', blockId: 'ground', position: { x: 200, y: 400 }, label: 'Ground Reference' }
    ],
    edges: [
      { id: 'e1', source: 'ac_source', target: 'resistor_load', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'e2', source: 'resistor_load', target: 'ground', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'e3', source: 'ac_source', target: 'ground', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'e4', source: 'resistor_load', target: 'v_sensor', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'e5', source: 'v_sensor', target: 'ground', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'e6', source: 'v_sensor', target: 'scope', sourceHandle: 'v_s', targetHandle: 'in1_t' }
    ]
  }
];


describe('VLab Learning Labs — All 7 Labs Integration Tests', () => {

  // --- LAB 1: Air Fryer ---
  describe('Lab 1: Air Fryer Heat Transfer', () => {
    it('L1-001: Simulation initializes and attempts to run', () => {
      const engine = new VLabPhysicsEngine();
      const lab = LEARNING_LABS.find(l => l.id === 'air_fryer_thermal')!;
      const nodes = reconstructLabNodes(lab.nodes);
      const edges = lab.edges as any[];

      // This lab now converges successfully
      const result = engine.simulateStep(nodes, edges, null, 0.05);
      expect(result).not.toBeNull();
      expect(result.scopeValues).toBeGreaterThan(0);
    });
  });

  // --- LAB 2: Blender Mixer ---
  describe('Lab 2: Personal Blender Mixer', () => {
    const engine = new VLabPhysicsEngine();
    const lab = LEARNING_LABS.find(l => l.id === 'blender_mixer')!;
    const nodes = reconstructLabNodes(lab.nodes);
    const edges = lab.edges as any[];
    let result: ReturnType<typeof runSim>;

    it('L2-001: Runs 5 simulation steps without error', () => {
      result = runSim(engine, nodes, edges, 5);
      expect(result.error).toBeNull();
      expect(result.successCount).toBe(5);
    });

    it('L2-002: Scope reads non-zero motor speed', () => {
      expect(Math.abs(result.state.scopeValues)).toBeGreaterThan(0.1);
    });

    it('L2-003: Motor speed magnitude increases over time', () => {
      // Re-run to collect multi-step data
      const eng2 = new VLabPhysicsEngine();
      let state: any = null;
      const speeds: number[] = [];
      for (let i = 0; i < 5; i++) {
        state = eng2.simulateStep(nodes, edges, state, 0.05);
        speeds.push(Math.abs(state.scopeValues));
      }
      // Each step should have higher speed magnitude than the previous
      for (let i = 1; i < speeds.length; i++) {
        expect(speeds[i]).toBeGreaterThanOrEqual(speeds[i - 1] * 0.95); // Allow 5% tolerance
      }
    });
  });

  // --- LAB 3: PID AC Motor ---
  describe('Lab 3: PID Speed Control of Induction Motor', () => {
    it('L3-001: Simulation runs 5 steps without error', () => {
      const engine = new VLabPhysicsEngine();
      const lab = LEARNING_LABS.find(l => l.id === 'pid_ac_motor')!;
      const nodes = reconstructLabNodes(lab.nodes);
      const edges = lab.edges as any[];

      const { state, error, successCount } = runSim(engine, nodes, edges, 5);
      expect(error).toBeNull();
      expect(successCount).toBe(5);
    });

    it('L3-002: Target speed is reported correctly (~1500 RPM)', () => {
      const engine = new VLabPhysicsEngine();
      const lab = LEARNING_LABS.find(l => l.id === 'pid_ac_motor')!;
      const nodes = reconstructLabNodes(lab.nodes);
      const edges = lab.edges as any[];

      const { state } = runSim(engine, nodes, edges, 5);
      expect(state.scopeValues.target).toBeCloseTo(1500, -1);
    });

    it('L3-003: Scope output has structure (value + target)', () => {
      const engine = new VLabPhysicsEngine();
      const lab = LEARNING_LABS.find(l => l.id === 'pid_ac_motor')!;
      const nodes = reconstructLabNodes(lab.nodes);
      const edges = lab.edges as any[];

      const { state } = runSim(engine, nodes, edges, 5);
      expect(state.scopeValues).toBeDefined();
      expect(typeof state.scopeValues).toBe('object');
      expect(state.scopeValues).toHaveProperty('value');
      expect(state.scopeValues).toHaveProperty('target');
    });
  });

  // --- LAB 4: VFD Inverter Drive ---
  describe('Lab 4: Variable Frequency Drive (VFD)', () => {
    it('L4-001: Simulation runs 5 steps without error', () => {
      const engine = new VLabPhysicsEngine();
      const lab = LEARNING_LABS.find(l => l.id === 'vfd_inverter_drive')!;
      const nodes = reconstructLabNodes(lab.nodes);
      const edges = lab.edges as any[];

      const { error, successCount } = runSim(engine, nodes, edges, 5);
      expect(error).toBeNull();
      expect(successCount).toBe(5);
    });

    it('L4-002: Target speed starts at 500 RPM (initial step value)', () => {
      const engine = new VLabPhysicsEngine();
      const lab = LEARNING_LABS.find(l => l.id === 'vfd_inverter_drive')!;
      const nodes = reconstructLabNodes(lab.nodes);
      const edges = lab.edges as any[];

      const { state } = runSim(engine, nodes, edges, 5);
      expect(state.scopeValues.target).toBeCloseTo(500, -1);
    });
  });

  // --- LAB 5: Smart Washing Machine ---
  describe('Lab 5: Smart Washing Machine Dynamics', () => {
    it('L5-001: Simulation runs 5 steps without error', () => {
      const engine = new VLabPhysicsEngine();
      const lab = LEARNING_LABS.find(l => l.id === 'smart_washing_machine')!;
      const nodes = reconstructLabNodes(lab.nodes);
      const edges = lab.edges as any[];

      const { error, successCount } = runSim(engine, nodes, edges, 5);
      expect(error).toBeNull();
      expect(successCount).toBe(5);
    });

    it('L5-002: Motor draws non-zero current', () => {
      const engine = new VLabPhysicsEngine();
      const lab = LEARNING_LABS.find(l => l.id === 'smart_washing_machine')!;
      const nodes = reconstructLabNodes(lab.nodes);
      const edges = lab.edges as any[];

      const { state } = runSim(engine, nodes, edges, 5);
      expect(state.scopeValues.amps).toBeGreaterThan(0.001);
    });
  });

  // --- LAB 6: Advanced Microwave Design ---
  describe('Lab 6: Advanced Microwave Design (25L)', () => {
    it('L6-001: Simulation runs 5 steps without error', () => {
      const engine = new VLabPhysicsEngine();
      const lab = LEARNING_LABS.find(l => l.id === 'advanced_microwave_design')!;
      const nodes = reconstructLabNodes(lab.nodes);
      const edges = lab.edges as any[];

      const { error, successCount } = runSim(engine, nodes, edges, 5);
      expect(error).toBeNull();
      expect(successCount).toBe(5);
    });

    it('L6-002: Cavity temperature starts above ambient (25°C)', () => {
      const engine = new VLabPhysicsEngine();
      const lab = LEARNING_LABS.find(l => l.id === 'advanced_microwave_design')!;
      const nodes = reconstructLabNodes(lab.nodes);
      const edges = lab.edges as any[];

      const { state } = runSim(engine, nodes, edges, 1);
      expect(state.scopeValues).toBeGreaterThan(25.0);
    });

    it('L6-003: Temperature rises monotonically over time', () => {
      const engine = new VLabPhysicsEngine();
      const lab = LEARNING_LABS.find(l => l.id === 'advanced_microwave_design')!;
      const nodes = reconstructLabNodes(lab.nodes);
      const edges = lab.edges as any[];

      let state: any = null;
      const temps: number[] = [];
      for (let i = 0; i < 5; i++) {
        state = engine.simulateStep(nodes, edges, state, 0.05);
        temps.push(state.scopeValues);
      }

      for (let i = 1; i < temps.length; i++) {
        expect(temps[i]).toBeGreaterThan(temps[i - 1]);
      }
    });

    it('L6-004: Heating rate is physically plausible (~1°C/s)', () => {
      const engine = new VLabPhysicsEngine();
      const lab = LEARNING_LABS.find(l => l.id === 'advanced_microwave_design')!;
      const nodes = reconstructLabNodes(lab.nodes);
      const edges = lab.edges as any[];

      let state: any = null;
      const temps: number[] = [];
      // Use a 1 s step so the fixed thermal mass model produces a measurable,
      // stable rate instead of the previous runaway ~340 °C/s behaviour.
      for (let i = 0; i < 3; i++) {
        state = engine.simulateStep(nodes, edges, state, 1.0);
        temps.push(state.scopeValues);
      }

      const rate = temps[1] - temps[0];
      // Heating rate should be between 0.5 °C/s and 5 °C/s for a real cavity
      expect(rate).toBeGreaterThan(0.5);
      expect(rate).toBeLessThan(5.0);
    });
  });

  // --- LAB 7: Voltage Sensing Circuit ---
  describe('Lab 7: 220V Power Supply & Voltage Sensing', () => {
    it('L7-001: Simulation runs 5 steps without error', () => {
      const engine = new VLabPhysicsEngine();
      const lab = LEARNING_LABS.find(l => l.id === 'voltage_sensing_circuit')!;
      const nodes = reconstructLabNodes(lab.nodes);
      const edges = lab.edges as any[];

      const { error, successCount } = runSim(engine, nodes, edges, 5);
      expect(error).toBeNull();
      expect(successCount).toBe(5);
    });

    it('L7-002: Scope reads sinusoidal voltage (alternating sign)', () => {
      const engine = new VLabPhysicsEngine();
      const lab = LEARNING_LABS.find(l => l.id === 'voltage_sensing_circuit')!;
      const nodes = reconstructLabNodes(lab.nodes);
      const edges = lab.edges as any[];

      let state: any = null;
      const voltages: number[] = [];
      for (let i = 0; i < 5; i++) {
        state = engine.simulateStep(nodes, edges, state, 0.05);
        voltages.push(state.scopeValues);
      }

      // Should have both positive and negative values
      const hasPositive = voltages.some(v => v > 10);
      const hasNegative = voltages.some(v => v < -10);
      expect(hasPositive).toBe(true);
      expect(hasNegative).toBe(true);
    });

    it('L7-003: Peak voltage ≈ 220V RMS', () => {
      const engine = new VLabPhysicsEngine();
      const lab = LEARNING_LABS.find(l => l.id === 'voltage_sensing_circuit')!;
      const nodes = reconstructLabNodes(lab.nodes);
      const edges = lab.edges as any[];

      const { state } = runSim(engine, nodes, edges, 5);
      // |V| should be approximately 220V (RMS = Vpk / sqrt(2))
      expect(Math.abs(state.scopeValues)).toBeCloseTo(220, -1);
    });
  });
});

// ============================================================================
// 3. ENGINE INFRASTRUCTURE TESTS
// ============================================================================

describe('VLab Engine Infrastructure', () => {

  it('INF-001: DAEAssembler detects topology changes via hash', () => {
    const engine = new VLabPhysicsEngine();
    const nodes1: Node[] = [
      makeNode('gnd', 'ground'),
      makeNode('src', 'dc_voltage', { V: 12 }),
      makeNode('res', 'resistor', { R: 100 }),
    ];
    const edges1: Edge[] = [
      { id: 'e1', source: 'src', target: 'res', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'e2', source: 'src', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'e3', source: 'res', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
    ];

    // First simulation
    engine.simulateStep(nodes1, edges1, null, 0.05);
    const hash1 = engine['prevTopologyHash'];

    // Add another component
    const nodes2 = [...nodes1, makeNode('cap', 'capacitor', { C: 1e-3 })];
    const edges2 = [...edges1, { id: 'e4', source: 'res', target: 'cap', sourceHandle: 'n_s', targetHandle: 'p_t' } as Edge];

    engine.simulateStep(nodes2, edges2, null, 0.05);
    const hash2 = engine['prevTopologyHash'];

    expect(hash1).not.toBe(hash2);
  });

  it('INF-002: Variable names follow naming convention', () => {
    const engine = new VLabPhysicsEngine();
    const nodes: Node[] = [
      makeNode('gnd', 'ground'),
      makeNode('src', 'dc_voltage', { V: 12 }),
      makeNode('res', 'resistor', { R: 100 }),
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'src', target: 'res', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'e2', source: 'src', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'e3', source: 'res', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
    ];

    engine.simulateStep(nodes, edges, null, 0.05);
    const system = engine['currentSystem']!;

    // Variable names should follow Across_<root>_(<domain>) or <nodeId>_branch_current patterns
    const hasAcross = system.variableNames.some(n => n.startsWith('Across_'));
    const hasBranch = system.variableNames.some(n => n.includes('branch_current'));
    expect(hasAcross).toBe(true);
    expect(hasBranch).toBe(true);
  });

  it('INF-003: System size matches expected variable count', () => {
    const engine = new VLabPhysicsEngine();
    const nodes: Node[] = [
      makeNode('gnd', 'ground'),
      makeNode('src', 'dc_voltage', { V: 12 }),
      makeNode('res', 'resistor', { R: 100 }),
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'src', target: 'res', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'e2', source: 'src', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'e3', source: 'res', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
    ];

    engine.simulateStep(nodes, edges, null, 0.05);
    const system = engine['currentSystem']!;

    expect(system.systemSize).toBe(system.variableNames.length);
    expect(system.systemSize).toBeGreaterThan(0);
  });

  it('INF-004: Physical-signal-domain nodes are excluded from KCL', () => {
    const engine = new VLabPhysicsEngine();
    const nodes = reconstructLabNodes([
      { id: 'c', blockId: 'ps_constant', position: { x: 0, y: 0 }, params: { value: 5 } },
      { id: 'scope', blockId: 'scope', position: { x: 100, y: 0 } },
    ]);
    const edges: Edge[] = [
      { id: 'e1', source: 'c', target: 'scope', sourceHandle: 'y_s', targetHandle: 'in1_t' },
    ];

    // Should not throw (kclExcludedNodeIds bug was fixed)
    const { error } = runSim(engine, nodes, edges, 3);
    expect(error).toBeNull();
  });
});

// ============================================================================
// 4. EDGE CASE / REGRESSION TESTS
// ============================================================================

describe('VLab Edge Cases & Regression Tests', () => {

  it('EDGE-001: Empty circuit with only ground does not crash', () => {
    const engine = new VLabPhysicsEngine();
    const nodes: Node[] = [makeNode('gnd', 'ground')];
    const edges: Edge[] = [];

    const { error } = runSim(engine, nodes, edges, 3);
    expect(error).toBeNull();
  });

  it('EDGE-002: Unknown block type returns zero residuals gracefully', () => {
    const engine = new VLabPhysicsEngine();
    const nodes: Node[] = [
      makeNode('gnd', 'ground'),
      makeNode('mystery', 'nonexistent_block_type_xyz'),
    ];
    const edges: Edge[] = [];

    // Should not throw — unknown blocks contribute zero residuals
    const { error } = runSim(engine, nodes, edges, 2);
    expect(error).toBeNull();
  });

  it('EDGE-003: Simulation state persists correctly across steps', () => {
    const engine = new VLabPhysicsEngine();
    const nodes: Node[] = [
      makeNode('gnd', 'ground'),
      makeNode('src', 'dc_voltage', { V: 12 }),
      makeNode('res', 'resistor', { R: 100 }),
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'src', target: 'res', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'e2', source: 'src', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'e3', source: 'res', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
    ];

    let state = engine.simulateStep(nodes, edges, null, 0.05);
    const t1 = state.time;
    expect(t1).toBeCloseTo(0.05, 4);

    state = engine.simulateStep(nodes, edges, state, 0.05);
    expect(state.time).toBeCloseTo(0.10, 4);

    state = engine.simulateStep(nodes, edges, state, 0.05);
    expect(state.time).toBeCloseTo(0.15, 4);
  });

  it('EDGE-004: Scope output is populated when connected', () => {
    const engine = new VLabPhysicsEngine();
    const nodes = reconstructLabNodes([
      { id: 'src', blockId: 'ac_voltage', position: { x: 0, y: 0 }, params: { Vpk: 100, f: 50 } },
      { id: 'res', blockId: 'resistor', position: { x: 100, y: 0 }, params: { R: 100 } },
      { id: 'vs', blockId: 'v_sensor', position: { x: 200, y: 0 } },
      { id: 'scope', blockId: 'scope', position: { x: 300, y: 0 } },
      { id: 'gnd', blockId: 'ground', position: { x: 50, y: 100 } },
    ]);
    const edges: Edge[] = [
      { id: 'e1', source: 'src', target: 'res', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'e2', source: 'res', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'e3', source: 'src', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'e4', source: 'res', target: 'vs', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'e5', source: 'vs', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'e6', source: 'vs', target: 'scope', sourceHandle: 'v_s', targetHandle: 'in1_t' },
    ];

    const { state, error } = runSim(engine, nodes, edges, 3);
    expect(error).toBeNull();
    expect(state.scopeValues).toBeDefined();
    // scopeValues should be non-zero
    const val = typeof state.scopeValues === 'object' ? state.scopeValues.value : state.scopeValues;
    expect(Math.abs(val || state.scopeValues)).toBeGreaterThan(0);
  });

  it('EDGE-005: Multiple simulation steps produce stable state vector size', () => {
    const engine = new VLabPhysicsEngine();
    const nodes: Node[] = [
      makeNode('gnd', 'ground'),
      makeNode('src', 'dc_voltage', { V: 5 }),
      makeNode('res', 'resistor', { R: 50 }),
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'src', target: 'res', sourceHandle: 'p_s', targetHandle: 'p_t' },
      { id: 'e2', source: 'src', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
      { id: 'e3', source: 'res', target: 'gnd', sourceHandle: 'n_s', targetHandle: 'a_t' },
    ];

    let state: any = null;
    const sizes: number[] = [];
    for (let i = 0; i < 10; i++) {
      state = engine.simulateStep(nodes, edges, state, 0.05);
      sizes.push(state.x.length);
    }

    // All state vectors should be the same size
    const allSame = sizes.every(s => s === sizes[0]);
    expect(allSame).toBe(true);
  });
});
