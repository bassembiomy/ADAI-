import { describe, it, expect } from 'vitest';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';
import { blockEquations } from './vlabEquations';
import { VLabPhysicsEngine } from './vlabPhysics';
import { Node, Edge } from '@xyflow/react';

const node = (id: string, type: string, params: Record<string, any> = {}): Node => ({
  id,
  type: 'default',
  position: { x: 0, y: 0 },
  data: { type, params }
} as any);

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string): Edge => ({
  id,
  source,
  target,
  sourceHandle,
  targetHandle
});

describe('Thermal Blocks Standardization & Verification', () => {
  const engine = new VLabPhysicsEngine();

  describe('Part 1: Library Domain & Parameter Definitions', () => {
    const thermalDomain = VLAB_LIBRARY.find(d => d.type === 'Thermal');
    const electricalDomain = VLAB_LIBRARY.find(d => d.type === 'Electrical');

    it('defines Thermal Resistor with both R (Ω) and Rth (K/W) and correct port domains', () => {
      // thermal_resistor may be in Electrical or Thermal
      const thermalResistor = electricalDomain?.blocks.find(b => b.id === 'thermal_resistor')
        || thermalDomain?.blocks.find(b => b.id === 'thermal_resistor');
      expect(thermalResistor).toBeDefined();
      expect(thermalResistor!.params.R).toBeDefined();
      expect(thermalResistor!.params.R.unit).toBe('Ω');
      expect(thermalResistor!.params.Rth).toBeDefined();
      expect(thermalResistor!.params.Rth.unit).toBe('K/W');

      const portA = thermalResistor!.ports.find(p => p.id === 'a');
      const portB = thermalResistor!.ports.find(p => p.id === 'b');
      const portH = thermalResistor!.ports.find(p => p.id === 'h');
      expect(portA?.domain).toBe('Electrical');
      expect(portB?.domain).toBe('Electrical');
      expect(portH?.domain).toBe('Thermal');
    });

    it('defines explicit Thermal domain on conductive_heat ports a and b', () => {
      const block = thermalDomain?.blocks.find(b => b.id === 'conductive_heat');
      expect(block).toBeDefined();
      expect(block!.ports.find(p => p.id === 'a')?.domain).toBe('Thermal');
      expect(block!.ports.find(p => p.id === 'b')?.domain).toBe('Thermal');
    });

    it('defines explicit Thermal domain on convective_heat ports a and b', () => {
      const block = thermalDomain?.blocks.find(b => b.id === 'convective_heat');
      expect(block).toBeDefined();
      expect(block!.ports.find(p => p.id === 'a')?.domain).toBe('Thermal');
      expect(block!.ports.find(p => p.id === 'b')?.domain).toBe('Thermal');
    });

    it('defines explicit Thermal domain on radiative_heat ports a and b', () => {
      const block = thermalDomain?.blocks.find(b => b.id === 'radiative_heat');
      expect(block).toBeDefined();
      expect(block!.ports.find(p => p.id === 'a')?.domain).toBe('Thermal');
      expect(block!.ports.find(p => p.id === 'b')?.domain).toBe('Thermal');
    });

    it('defines explicit Thermal domain on thermal_mass port a', () => {
      const block = thermalDomain?.blocks.find(b => b.id === 'thermal_mass');
      expect(block).toBeDefined();
      expect(block!.ports.find(p => p.id === 'a')?.domain).toBe('Thermal');
    });

    it('defines explicit Thermal domain on thermal_ref port a', () => {
      const block = thermalDomain?.blocks.find(b => b.id === 'thermal_ref');
      expect(block).toBeDefined();
      expect(block!.ports.find(p => p.id === 'a')?.domain).toBe('Thermal');
    });

    it('defines explicit Thermal domain on heat_flow_sensor ports a and b, and Physical on h', () => {
      const block = thermalDomain?.blocks.find(b => b.id === 'heat_flow_sensor');
      expect(block).toBeDefined();
      expect(block!.ports.find(p => p.id === 'a')?.domain).toBe('Thermal');
      expect(block!.ports.find(p => p.id === 'b')?.domain).toBe('Thermal');
      expect(block!.ports.find(p => p.id === 'h')?.domain).toBe('Physical');
    });

    it('defines explicit Thermal domain on temp_sensor ports a and b, and Physical on t', () => {
      const block = thermalDomain?.blocks.find(b => b.id === 'temp_sensor');
      expect(block).toBeDefined();
      expect(block!.ports.find(p => p.id === 'a')?.domain).toBe('Thermal');
      expect(block!.ports.find(p => p.id === 'b')?.domain).toBe('Thermal');
      expect(block!.ports.find(p => p.id === 't')?.domain).toBe('Physical');
    });

    it('defines explicit Thermal domain on heat_src ports a and b', () => {
      const block = thermalDomain?.blocks.find(b => b.id === 'heat_src');
      expect(block).toBeDefined();
      expect(block!.ports.find(p => p.id === 'a')?.domain).toBe('Thermal');
      expect(block!.ports.find(p => p.id === 'b')?.domain).toBe('Thermal');
    });

    it('defines explicit Thermal domain on temp_src port a', () => {
      const block = thermalDomain?.blocks.find(b => b.id === 'temp_src');
      expect(block).toBeDefined();
      expect(block!.ports.find(p => p.id === 'a')?.domain).toBe('Thermal');
    });

    it('defines explicit Thermal domain on ctrl_heat_src ports a and b, and Physical on s', () => {
      const block = thermalDomain?.blocks.find(b => b.id === 'ctrl_heat_src');
      expect(block).toBeDefined();
      expect(block!.ports.find(p => p.id === 'a')?.domain).toBe('Thermal');
      expect(block!.ports.find(p => p.id === 'b')?.domain).toBe('Thermal');
      expect(block!.ports.find(p => p.id === 's')?.domain).toBe('Physical');
    });

    it('defines explicit Thermal domain on ctrl_temp_src ports a and b, and Physical on s', () => {
      const block = thermalDomain?.blocks.find(b => b.id === 'ctrl_temp_src');
      expect(block).toBeDefined();
      expect(block!.ports.find(p => p.id === 'a')?.domain).toBe('Thermal');
      expect(block!.ports.find(p => p.id === 'b')?.domain).toBe('Thermal');
      expect(block!.ports.find(p => p.id === 's')?.domain).toBe('Physical');
    });
  });

  describe('Part 2: Physics Engine Equations Unit Verification', () => {
    it('heat_src accepts Q = 0 without defaulting to 100', () => {
      const factory = blockEquations['heat_src'];
      expect(factory).toBeDefined();
      const res = factory({
        across: [300, 300],
        dAcross: [0, 0],
        branch: [0],
        dBranch: [0],
        state: [],
        dState: [],
        ctx: {} as any,
        params: { Q: 0 },
        ports: ['a', 'b'],
        nodeId: 'test_heat_src'
      });
      // residual branch[0] - Q should be 0 - 0 = 0
      expect(res[0]).toBe(0);
    });

    it('temp_src accepts T = 0 K without defaulting to 293.15', () => {
      const factory = blockEquations['temp_src'];
      expect(factory).toBeDefined();
      const res = factory({
        across: [0],
        dAcross: [0],
        branch: [0],
        dBranch: [0],
        state: [],
        dState: [],
        ctx: {} as any,
        params: { T: 0 },
        ports: ['a'],
        nodeId: 'test_temp_src'
      });
      // residual across[0] - T should be 0 - 0 = 0
      expect(res[0]).toBe(0);
    });

    it('temp_sensor computes differential temperature Ta - Tb', () => {
      const factory = blockEquations['temp_sensor'];
      expect(factory).toBeDefined();
      const res = factory({
        across: [350, 300],
        dAcross: [0, 0],
        branch: [0, 50],
        dBranch: [0, 0],
        state: [],
        dState: [],
        ctx: {} as any,
        params: {},
        ports: ['a', 'b', 't'],
        nodeId: 'test_temp_sensor'
      });
      // branch[0] is zero heat flow: 0
      // branch[1] - (Ta - Tb) = 50 - (350 - 300) = 0
      expect(res[0]).toBe(0);
      expect(res[1]).toBe(0);
    });

    it('ctrl_heat_src reads physical control port s rather than port b', () => {
      const factory = blockEquations['ctrl_heat_src'];
      expect(factory).toBeDefined();
      // ports: ['a', 'b', 's']
      // across: [320 (Ta), 290 (Tb), 75 (Signal S)]
      // branch[0]: 75 (heat flow)
      const res = factory({
        across: [320, 290, 75],
        dAcross: [0, 0, 0],
        branch: [75],
        dBranch: [0],
        state: [],
        dState: [],
        ctx: {} as any,
        params: {},
        ports: ['a', 'b', 's'],
        nodeId: 'test_ctrl_heat_src'
      });
      // branch[0] - S = 75 - 75 = 0
      expect(res[0]).toBe(0);
    });

    it('ctrl_temp_src enforces Ta - Tb = S reading from port s', () => {
      const factory = blockEquations['ctrl_temp_src'];
      expect(factory).toBeDefined();
      // ports: ['a', 'b', 's']
      // across: [340 (Ta), 300 (Tb), 40 (Signal S)]
      const res = factory({
        across: [340, 300, 40],
        dAcross: [0, 0, 0],
        branch: [10],
        dBranch: [0],
        state: [],
        dState: [],
        ctx: {} as any,
        params: {},
        ports: ['a', 'b', 's'],
        nodeId: 'test_ctrl_temp_src'
      });
      // (Ta - Tb) - S = (340 - 300) - 40 = 0
      expect(res[0]).toBe(0);
    });
  });

  describe('Part 3: Network Simulation Verification', () => {
    it('simulates temperature source, conductive link, and differential temperature sensor', () => {
      // temp_src (350K) -> conductive_heat (k=2) -> thermal_ref (293.15K)
      // temp_sensor a -> temp_src, b -> thermal_ref
      // Scope reads 350 - 293.15 = 56.85 K
      const nodes: Node[] = [
        node('src', 'temp_src', { T: 350 }),
        node('cond', 'conductive_heat', { k: 2 }),
        node('ref', 'thermal_ref', {}),
        node('sensor', 'temp_sensor', {}),
        node('scope', 'scope', { numSignals: 1 })
      ];
      const edges: Edge[] = [
        edge('e1', 'src', 'a_s', 'cond', 'a_t'),
        edge('e2', 'cond', 'b_s', 'ref', 'a_t'),
        edge('e3', 'src', 'a_s', 'sensor', 'a_t'),
        edge('e4', 'sensor', 'b_s', 'ref', 'a_t'),
        edge('e5', 'sensor', 't_s', 'scope', 'in1_t')
      ];

      let state: any = null;
      for (let i = 0; i < 3; i++) {
        state = engine.simulateStep(nodes, edges, state, 0.01);
      }
      expect(state).toBeDefined();
      const val = typeof state.scopeValues === 'object' ? state.scopeValues.value : state.scopeValues;
      expect(val).toBeCloseTo(350 - 293.15, 2);
    });

    it('simulates heat flow source into conductive path and measures heat with heat_flow_sensor', () => {
      // heat_src (Q=50W) -> heat_flow_sensor -> conductive_heat (k=1) -> thermal_ref (293.15K)
      const nodes: Node[] = [
        node('q_src', 'heat_src', { Q: 50 }),
        node('q_sensor', 'heat_flow_sensor', {}),
        node('cond', 'conductive_heat', { k: 1 }),
        node('ref', 'thermal_ref', {}),
        node('scope', 'scope', { numSignals: 1 })
      ];
      const edges: Edge[] = [
        edge('e1', 'q_src', 'b_s', 'q_sensor', 'a_t'),
        edge('e_ret', 'q_src', 'a_s', 'ref', 'a_t'),
        edge('e2', 'q_sensor', 'b_s', 'cond', 'a_t'),
        edge('e3', 'cond', 'b_s', 'ref', 'a_t'),
        edge('e4', 'q_sensor', 'h_s', 'scope', 'in1_t')
      ];

      let state: any = null;
      for (let i = 0; i < 3; i++) {
        state = engine.simulateStep(nodes, edges, state, 0.01);
      }
      expect(state).toBeDefined();
      const val = typeof state.scopeValues === 'object' ? state.scopeValues.value : state.scopeValues;
      expect(val).toBeCloseTo(50, 1);
    });

    it('simulates controlled temperature source driven by ps_constant', () => {
      // ps_constant (val = 30) -> ctrl_temp_src port s
      // ctrl_temp_src port b -> thermal_ref (293.15K)
      // temp_sensor measures port a relative to port b
      const nodes: Node[] = [
        node('ps', 'ps_constant', { value: 30 }),
        node('ctrl_src', 'ctrl_temp_src', {}),
        node('cond', 'conductive_heat', { k: 5 }),
        node('ref', 'thermal_ref', {}),
        node('sensor', 'temp_sensor', {}),
        node('scope', 'scope', { numSignals: 1 })
      ];
      const edges: Edge[] = [
        edge('e_ctrl', 'ps', 'y_s', 'ctrl_src', 's_t'),
        edge('e_base', 'ctrl_src', 'b_s', 'ref', 'a_t'),
        edge('e_out', 'ctrl_src', 'a_s', 'cond', 'a_t'),
        edge('e_load', 'cond', 'b_s', 'ref', 'a_t'),
        edge('e_sa', 'ctrl_src', 'a_s', 'sensor', 'a_t'),
        edge('e_sb', 'ctrl_src', 'b_s', 'sensor', 'b_t'),
        edge('e_sc', 'sensor', 't_s', 'scope', 'in1_t')
      ];

      let state: any = null;
      for (let i = 0; i < 3; i++) {
        state = engine.simulateStep(nodes, edges, state, 0.01);
      }
      expect(state).toBeDefined();
      const val = typeof state.scopeValues === 'object' ? state.scopeValues.value : state.scopeValues;
      expect(val).toBeCloseTo(30, 1);
    });

    it('simulates controlled heat source driven by ps_constant', () => {
      // ps_constant (val = 40) -> ctrl_heat_src port s
      // ctrl_heat_src injects heat into heat_flow_sensor -> conductive_heat (k=2) -> ref
      const nodes: Node[] = [
        node('ps', 'ps_constant', { value: 40 }),
        node('ctrl_q', 'ctrl_heat_src', {}),
        node('sensor', 'heat_flow_sensor', {}),
        node('cond', 'conductive_heat', { k: 2 }),
        node('ref', 'thermal_ref', {}),
        node('scope', 'scope', { numSignals: 1 })
      ];
      const edges: Edge[] = [
        edge('e_ctrl', 'ps', 'y_s', 'ctrl_q', 's_t'),
        edge('e_ret', 'ctrl_q', 'a_s', 'ref', 'a_t'),
        edge('e_inject', 'ctrl_q', 'b_s', 'sensor', 'a_t'),
        edge('e_load', 'sensor', 'b_s', 'cond', 'a_t'),
        edge('e_ground', 'cond', 'b_s', 'ref', 'a_t'),
        edge('e_out', 'sensor', 'h_s', 'scope', 'in1_t')
      ];

      let state: any = null;
      for (let i = 0; i < 3; i++) {
        state = engine.simulateStep(nodes, edges, state, 0.01);
      }
      expect(state).toBeDefined();
      const val = typeof state.scopeValues === 'object' ? state.scopeValues.value : state.scopeValues;
      expect(val).toBeCloseTo(40, 1);
    });

    it('simulates thermal_resistor with electrical and thermal coupling', () => {
      // dc_voltage (10V) -> thermal_resistor (R=10Ω) -> ground
      // Current = 1A, Power = 10W generated at port h
      // port h -> convective_heat (h=10, A=1) -> thermal_ref
      const nodes: Node[] = [
        node('v_dc', 'dc_voltage', { V: 10 }),
        node('gnd', 'ground', {}),
        node('r_th', 'thermal_resistor', { R: 10, Rth: 5 }),
        node('q_sensor', 'heat_flow_sensor', {}),
        node('conv', 'convective_heat', { h: 10, A: 1 }),
        node('t_ref', 'thermal_ref', {}),
        node('scope', 'scope', { numSignals: 1 })
      ];
      const edges: Edge[] = [
        // Electrical loop
        edge('e_v_p', 'v_dc', 'p_s', 'r_th', 'a_t'),
        edge('e_v_n', 'r_th', 'b_s', 'gnd', 'a_t'),
        edge('e_v_gnd', 'v_dc', 'n_s', 'gnd', 'a_t'),
        // Thermal loop: heat generation at h
        edge('e_th_h', 'r_th', 'h_s', 'q_sensor', 'a_t'),
        edge('e_th_flow', 'q_sensor', 'b_s', 'conv', 'a_t'),
        edge('e_conv_ref', 'conv', 'b_s', 't_ref', 'a_t'),
        edge('e_scope', 'q_sensor', 'h_s', 'scope', 'in1_t')
      ];

      let state: any = null;
      for (let i = 0; i < 3; i++) {
        state = engine.simulateStep(nodes, edges, state, 0.01);
      }
      expect(state).toBeDefined();
      const val = typeof state.scopeValues === 'object' ? state.scopeValues.value : state.scopeValues;
      // P = I^2 * R = (10V/10Ω)^2 * 10Ω = 10W
      expect(val).toBeCloseTo(10, 1);
    });
  });
});
