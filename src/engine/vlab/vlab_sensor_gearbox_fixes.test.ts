import { describe, expect, it } from 'vitest';
import { Edge, Node } from '@xyflow/react';
import { VLabPhysicsEngine } from './vlabPhysics';
import { normalizeLegacyVLabGraph } from '../../components/vlab/vlabModelMigration';

type Model = { nodes: Node[]; edges: Edge[]; dt: number; steps: number };

const node = (id: string, type: string, params: Record<string, unknown> = {}): Node =>
  ({ id, type: 'default', position: { x: 0, y: 0 }, data: { type, blockId: type, params } } as any);

const edge = (id: string, source: string, sourceHandle: string, target: string, targetHandle: string): Edge =>
  ({ id, source, target, sourceHandle, targetHandle });

const scalarScopeValue = (value: unknown): number => {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'value' in value) return Number((value as any).value);
  if (value && typeof value === 'object' && 'in1' in value) return Number((value as any).in1);
  if (Array.isArray(value) && value.length > 0) return Number(value[0]);
  throw new Error(`Scope did not return a scalar reading: ${JSON.stringify(value)}`);
};

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

describe('VLab MMF Sensor, Angular Velocity Source, and Gear Box Port Alignment', () => {
  describe('Issue 1: mag_mmf_sensor is an across sensor (parallel); the flux sensor is the series one', () => {
    const base = (mmfParallel: boolean) => ({
      dt: 0.01,
      steps: 3,
      nodes: [
        node('src', 'mag_mmf_source', { MMF: 100 }),
        node('mmf_sensor', 'mag_mmf_sensor'),
        node('flux_sensor', 'mag_flux_sensor'),
        node('rel', 'reluctance', { R: 1e6 }),
        node('ref', 'mag_ref'),
        node('scope', 'scope'),
        node('mscope', 'scope'),
      ],
      edges: mmfParallel ? [
        edge('e1', 'src', 'n_s', 'flux_sensor', 'n_t'),
        edge('e3', 'flux_sensor', 's_s', 'rel', 'n_t'),
        edge('e4', 'rel', 's_s', 'src', 's_t'),
        edge('e5', 'src', 's_s', 'ref', 'n_t'),
        edge('e6', 'flux_sensor', 'phi_s', 'scope', 'in1_t'),
        edge('e7', 'mmf_sensor', 'n_s', 'rel', 'n_t'),
        edge('e8', 'mmf_sensor', 's_s', 'rel', 's_t'),
        edge('e9', 'mmf_sensor', 'f_s', 'mscope', 'in1_t'),
      ] : [
        edge('e1', 'src', 'n_s', 'mmf_sensor', 'n_t'),
        edge('e2', 'mmf_sensor', 's_s', 'flux_sensor', 'n_t'),
        edge('e3', 'flux_sensor', 's_s', 'rel', 'n_t'),
        edge('e4', 'rel', 's_s', 'src', 's_t'),
        edge('e5', 'src', 's_s', 'ref', 'n_t'),
        edge('e6', 'flux_sensor', 'phi_s', 'scope', 'in1_t'),
      ],
    });

    it('parallel MMF sensor reads mmf = R * phi and the series flux sensor reads phi = mmf / R', () => {
      const { state } = run(base(true));
      const at = (name: string) => state.x[state.variableNames.indexOf(name)];
      expect(at('flux_sensor_branch_signal_phi')).toBeCloseTo(100 / 1e6, 9);
      expect(at('mmf_sensor_branch_signal_f')).toBeCloseTo(1e6 * (100 / 1e6), 6);
    });

    it('an MMF sensor wired in series is rejected before the solve (it would cut the flux path)', () => {
      const m = base(false);
      expect(() => new VLabPhysicsEngine().simulateStep(m.nodes, m.edges, null, 0.01)).toThrow(/MMF Sensor.*in series.*Connect it in parallel.*Flux Sensor in series/);
    });
  });

  describe('Issue 2: ang_vel_source reads params.omega; a legacy params.w is migrated to omega when the model loads', () => {
    it('drives velocity according to params.omega', () => {
      const { readings } = run({
        dt: 0.01,
        steps: 3,
        nodes: [
          node('src', 'ang_vel_source', { omega: 25 }),
          node('sensor', 'rot_motion_sensor'),
          node('damper', 'rot_damper', { b: 1 }),
          node('ref', 'rot_ref'),
          node('scope', 'scope'),
        ],
        edges: [
          edge('e1', 'src', 'r_s', 'sensor', 'r_t'),
          edge('e2', 'src', 'c_s', 'ref', 'r_t'),
          edge('e3', 'sensor', 'c_s', 'ref', 'r_t'),
          edge('e4', 'sensor', 'r_s', 'damper', 'r_t'),
          edge('e5', 'damper', 'c_s', 'ref', 'r_t'),
          edge('e6', 'sensor', 'w_s', 'scope', 'in1_t'),
        ]
      });

      const finalReading = readings[readings.length - 1];
      expect(finalReading).toBeCloseTo(25, 2);
    });

    it('a saved model with params.w is migrated to params.omega on load and drives the same velocity', () => {
      const { readings } = run({
        dt: 0.01,
        steps: 3,
        nodes: normalizeLegacyVLabGraph([
          node('src', 'ang_vel_source', { w: 35 }),
          node('sensor', 'rot_motion_sensor'),
          node('damper', 'rot_damper', { b: 1 }),
          node('ref', 'rot_ref'),
          node('scope', 'scope'),
        ] as any, []).nodes as Node[],
        edges: [
          edge('e1', 'src', 'r_s', 'sensor', 'r_t'),
          edge('e2', 'src', 'c_s', 'ref', 'r_t'),
          edge('e3', 'sensor', 'c_s', 'ref', 'r_t'),
          edge('e4', 'sensor', 'r_s', 'damper', 'r_t'),
          edge('e5', 'damper', 'c_s', 'ref', 'r_t'),
          edge('e6', 'sensor', 'w_s', 'scope', 'in1_t'),
        ]
      });

      const finalReading = readings[readings.length - 1];
      expect(finalReading).toBeCloseTo(35, 2);
    });
  });

  describe('Issue 3: gear_box uses s1 and s2 ports unified across library, DAE, and equations', () => {
    it('scales velocity correctly across s1 and s2 (w2 = w1 / ratio)', () => {
      // Angular velocity source (20 rad/s) drives gear_box s1
      // Gearbox ratio = 2
      // Shaft s2 drives rot_motion_sensor -> Scope
      // Expected velocity = 20 / 2 = 10 rad/s
      const { readings } = run({
        dt: 0.01,
        steps: 3,
        nodes: [
          node('src', 'ang_vel_source', { omega: 20 }),
          node('gear', 'gear_box', { ratio: 2 }),
          node('sensor', 'rot_motion_sensor'),
          node('damper', 'rot_damper', { b: 0.5 }),
          node('ref', 'rot_ref'),
          node('scope', 'scope'),
        ],
        edges: [
          edge('e1', 'src', 'r_s', 'gear', 's1_t'),
          edge('e2', 'src', 'c_s', 'ref', 'r_t'),
          edge('e3', 'gear', 's2_s', 'sensor', 'r_t'),
          edge('e4', 'sensor', 'c_s', 'ref', 'r_t'),
          edge('e5', 'gear', 's2_s', 'damper', 'r_t'),
          edge('e6', 'damper', 'c_s', 'ref', 'r_t'),
          edge('e7', 'sensor', 'w_s', 'scope', 'in1_t'),
        ]
      });

      const finalReading = readings[readings.length - 1];
      expect(finalReading).toBeCloseTo(10, 2);
    });
  });
});
