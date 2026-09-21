import { describe, expect, it } from 'vitest';
import { Edge, Node } from '@xyflow/react';
import { VLabPhysicsEngine } from './vlabPhysics';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';
import { blockEquations } from './vlabEquations';

type Model = { nodes: Node[]; edges: Edge[]; dt: number; steps: number };

const node = (id: string, type: string, params: Record<string, unknown> = {}): Node =>
  ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, params } } as any);

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string): Edge =>
  ({ id, source, target, sourceHandle, targetHandle });

const scalarScopeValue = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'value' in value) return Number((value as any).value);
  if (value && typeof value === 'object' && 'in1' in value) return Number((value as any).in1);
  if (Array.isArray(value) && value.length > 0) return Number(value[0]);
  throw new Error(`Scope did not return a scalar reading: ${JSON.stringify(value)}`);
};

const dummyCtx: any = { time: 0, dt: 0.01, prevStates: [], parameters: {}, states: [], stateDerivatives: [] };

const run = ({ nodes, edges, dt, steps }: Model) => {
  const engine = new VLabPhysicsEngine();
  let state: any = null;
  const readings: number[] = [];
  for (let index = 0; index < steps; index++) {
    state = engine.simulateStep(nodes, edges, state, dt);
    const reading = scalarScopeValue(state.scopeValues);
    expect(Number.isFinite(reading)).toBe(true);
    expect(state.x.every(Number.isFinite)).toBe(true);
    readings.push(reading);
  }
  return { state, readings };
};

describe('VLab Magnetic Circuit & Control Port Fixes', () => {
  describe('Issue 1: mag_flux_sensor & mag_mmf_sensor scope output', () => {
    it('measures magnetic flux with mag_flux_sensor and displays it on scope', () => {
      // MMF Source (100 A-t) -> Reluctance (1e5 A-t/Wb) -> Flux Sensor -> Return
      // Expected flux = MMF / R = 100 / 1e5 = 1e-3 Wb
      const { readings } = run({
        dt: 0.01,
        steps: 3,
        nodes: [
          node('src', 'mag_mmf_source', { MMF: 100 }),
          node('rel', 'reluctance', { R: 1e5 }),
          node('sensor', 'mag_flux_sensor'),
          node('ref', 'mag_ref'),
          node('scope', 'scope'),
        ],
        edges: [
          edge('e1', 'src', 'n_s', 'rel', 'n_t'),
          edge('e2', 'rel', 's_s', 'sensor', 'n_t'),
          edge('e3', 'sensor', 's_s', 'src', 's_t'),
          edge('e4', 'src', 's_s', 'ref', 'n_t'),
          edge('e5', 'sensor', 'phi_s', 'scope', 'in1_t'),
        ]
      });

      const finalReading = readings[readings.length - 1];
      expect(finalReading).toBeCloseTo(0.001, 5);
    });

    it('measures MMF difference with mag_mmf_sensor and displays it on scope', () => {
      // MMF Source (100 A-t) -> Reluctance (1e5 A-t/Wb)
      // MMF Sensor across Reluctance -> Scope
      // Expected MMF reading = 100 A-t
      const { readings } = run({
        dt: 0.01,
        steps: 3,
        nodes: [
          node('src', 'mag_mmf_source', { MMF: 100 }),
          node('rel', 'reluctance', { R: 1e5 }),
          node('sensor', 'mag_mmf_sensor'),
          node('ref', 'mag_ref'),
          node('scope', 'scope'),
        ],
        edges: [
          edge('e1', 'src', 'n_s', 'rel', 'n_t'),
          edge('e2', 'rel', 's_s', 'src', 's_t'),
          edge('e3', 'src', 's_s', 'ref', 'n_t'),
          edge('e4', 'rel', 'n_s', 'sensor', 'n_t'),
          edge('e5', 'rel', 's_s', 'sensor', 's_t'),
          edge('e6', 'sensor', 'f_s', 'scope', 'in1_t'),
        ]
      });

      const finalReading = readings[readings.length - 1];
      expect(finalReading).toBeCloseTo(100, 2);
    });
  });

  describe('Issue 2: Connecting ps_constant to variable_reluctance.ctrl and mag_controlled_mmf.src', () => {
    it('converges reliably when ps_constant drives variable_reluctance.ctrl', () => {
      // ps_constant (value: 200,000) drives variable_reluctance.ctrl
      // MMF Source (100 A-t) -> variable_reluctance -> Flux Sensor -> Scope
      // Expected flux = 100 / 200000 = 5e-4 Wb
      const { readings } = run({
        dt: 0.01,
        steps: 3,
        nodes: [
          node('ctrl', 'ps_constant', { value: 200000 }),
          node('v_rel', 'variable_reluctance', { Rmin: 1000 }),
          node('src', 'mag_mmf_source', { MMF: 100 }),
          node('sensor', 'mag_flux_sensor'),
          node('ref', 'mag_ref'),
          node('scope', 'scope'),
        ],
        edges: [
          edge('e_ctrl', 'ctrl', 'y_s', 'v_rel', 'ctrl_t'),
          edge('e1', 'src', 'n_s', 'v_rel', 'n_t'),
          edge('e2', 'v_rel', 's_s', 'sensor', 'n_t'),
          edge('e3', 'sensor', 's_s', 'src', 's_t'),
          edge('e4', 'src', 's_s', 'ref', 'n_t'),
          edge('e5', 'sensor', 'phi_s', 'scope', 'in1_t'),
        ]
      });

      const finalReading = readings[readings.length - 1];
      expect(finalReading).toBeCloseTo(0.0005, 5);
    });

    it('converges reliably when ps_constant drives mag_controlled_mmf.src', () => {
      // ps_constant (value: 50 A-t) drives mag_controlled_mmf.src
      // mag_controlled_mmf -> Reluctance (1e5 A-t/Wb) -> Flux Sensor -> Scope
      // Expected flux = 50 / 1e5 = 5e-4 Wb
      const { readings } = run({
        dt: 0.01,
        steps: 3,
        nodes: [
          node('ctrl', 'ps_constant', { value: 50 }),
          node('src', 'mag_controlled_mmf'),
          node('rel', 'reluctance', { R: 1e5 }),
          node('sensor', 'mag_flux_sensor'),
          node('ref', 'mag_ref'),
          node('scope', 'scope'),
        ],
        edges: [
          edge('e_src', 'ctrl', 'y_s', 'src', 'src_t'),
          edge('e1', 'src', 'n_s', 'rel', 'n_t'),
          edge('e2', 'rel', 's_s', 'sensor', 'n_t'),
          edge('e3', 'sensor', 's_s', 'src', 's_t'),
          edge('e4', 'src', 's_s', 'ref', 'n_t'),
          edge('e5', 'sensor', 'phi_s', 'scope', 'in1_t'),
        ]
      });

      const finalReading = readings[readings.length - 1];
      expect(finalReading).toBeCloseTo(0.0005, 5);
    });
  });

  describe('Issue 3: Permanent Magnet parameters (Hc, Lm, Rm)', () => {
    it('exposes Lm and Rm in library metadata for permanent_magnet', () => {
      const magDomain = VLAB_LIBRARY.find(d => d.type === 'Magnetic');
      const pm = magDomain?.blocks.find(b => b.id === 'permanent_magnet');
      expect(pm).toBeDefined();
      expect(pm!.params.Hc).toBeDefined();
      expect(pm!.params.Lm).toBeDefined();
      expect(pm!.params.Rm).toBeDefined();
      expect(pm!.params.Lm.unit).toBe('m');
      expect(pm!.params.Rm.unit).toBe('A-t/Wb');
    });

    it('applies Lm and Rm in permanent_magnet equation', () => {
      const factory = blockEquations['permanent_magnet'];
      expect(factory).toBeDefined();

      // Case 1: Ideal magnet (Rm = 0)
      // MMF = Hc * Lm = 1000 * 0.1 = 100
      const res1 = factory({
        across: [100, 0],
        dAcross: [0, 0],
        branch: [0.001],
        dBranch: [0],
        state: [],
        dState: [],
        ctx: dummyCtx,
        params: { Hc: 1000, Lm: 0.1, Rm: 0 },
        ports: ['n', 's'],
        nodeId: 'pm_test'
      });
      expect(res1[0]).toBeCloseTo(0, 5);

      // Case 2: Magnet with internal reluctance Rm = 1e5 and flux phi = 0.0005
      // MMF_internal = Hc * Lm - phi * Rm = 1000 * 0.1 - 0.0005 * 1e5 = 100 - 50 = 50 A-t
      const res2 = factory({
        across: [50, 0],
        dAcross: [0, 0],
        branch: [0.0005],
        dBranch: [0],
        state: [],
        dState: [],
        ctx: dummyCtx,
        params: { Hc: 1000, Lm: 0.1, Rm: 1e5 },
        ports: ['n', 's'],
        nodeId: 'pm_test'
      });
      expect(res2[0]).toBeCloseTo(0, 5);
    });
  });

  describe('Issue 4: Reluctance Force parameters (R0, K, k)', () => {
    it('exposes R0 and K in library metadata for reluctance_force', () => {
      const magDomain = VLAB_LIBRARY.find(d => d.type === 'Magnetic');
      const rf = magDomain?.blocks.find(b => b.id === 'reluctance_force');
      expect(rf).toBeDefined();
      expect(rf!.params.R0).toBeDefined();
      expect(rf!.params.K).toBeDefined();
      expect(rf!.params.R0.unit).toBe('A-t/Wb');
    });

    it('calculates force and reluctance correctly using K and R0', () => {
      const factory = blockEquations['reluctance_force'];
      expect(factory).toBeDefined();

      // phi = 0.02 Wb, x = 0.001 m, R0 = 1e6, K = 1e7
      // R = R0 + K * x = 1e6 + 1e7 * 0.001 = 1.01e6
      // dR/dx = K = 1e7
      // F = 0.5 * phi^2 * dR/dx = 0.5 * (0.02)^2 * 1e7 = 0.5 * 0.0004 * 1e7 = 2000 N
      // MMF drop = phi * R = 0.02 * 1.01e6 = 20200 A-t
      const res = factory({
        across: [20200, 0, 0.001, 0],
        dAcross: [0, 0, 0, 0],
        branch: [0.02, 2000],
        dBranch: [0, 0],
        state: [],
        dState: [],
        ctx: dummyCtx,
        params: { R0: 1e6, K: 1e7 },
        ports: ['n', 's', 'r', 'c'],
        nodeId: 'rf_test'
      });

      // Residual 0: (Vn - Vs) - phi * R
      expect(res[0]).toBeCloseTo(0, 3);
      // Residual 1: Force - 0.5 * phi^2 * dRdx
      expect(res[1]).toBeCloseTo(0, 3);
    });

    it('supports backwards compatibility with k parameter if K is not provided', () => {
      const factory = blockEquations['reluctance_force'];
      // R0 = 1e6, k = 10 => K = R0 * k = 1e7
      const res = factory({
        across: [20200, 0, 0.001, 0],
        dAcross: [0, 0, 0, 0],
        branch: [0.02, 2000],
        dBranch: [0, 0],
        state: [],
        dState: [],
        ctx: dummyCtx,
        params: { R0: 1e6, k: 10 },
        ports: ['n', 's', 'r', 'c'],
        nodeId: 'rf_test'
      });
      expect(res[0]).toBeCloseTo(0, 3);
      expect(res[1]).toBeCloseTo(0, 3);
    });
  });
});
