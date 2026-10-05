import { describe, it, expect } from 'vitest';
import { Node, Edge } from '@xyflow/react';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';
import { blockEquations, BlockEquationArgs } from './vlabEquations';
import { VLabPhysicsEngine } from './vlabPhysics';
import { DAEAssembler } from './DAEAssembler';
import {
  universalJointKinematics,
  universalJointParameters,
  frameAngularVelocity,
} from './vlabUniversalJoint';
import { normalizeSolverConfiguration } from './kernel/PhysicalNetworkExtractor';

const node = (id: string, type: string, params = {}): Node => ({
  id,
  position: { x: 0, y: 0 },
  data: { type, params },
});
const edge = (
  id: string,
  source: string,
  sourceHandle: string,
  target: string,
  targetHandle: string,
): Edge => ({ id, source, sourceHandle, target, targetHandle });
const evaluate = (
  rotation = [0, 0, 0],
  rates = [0, 0, 0],
  params = {},
  branch = new Array(7).fill(0),
) =>
  blockEquations.universal_joint({
    across: [
      [0, 0, 0, 0, 0, 0],
      [0, 0, 0, ...rotation],
    ],
    dAcross: [new Array(6).fill(0), [0, 0, 0, ...rates]],
    branch,
    params: { damping: 0, ...params },
    ports: ['b', 'f'],
    dBranch: [],
    state: [],
    dState: [],
    ctx: {} as any,
    nodeId: 'joint',
  } satisfies BlockEquationArgs);

describe('universal Frame joint', () => {
  it.each(
    ['auto', 'bdf'].flatMap((method) =>
      [false, true].map((reversed) => ({ method, reversed })),
    ),
  )(
    'starts from a rotated anchored base without artificial angular motion: %j',
    ({ method, reversed }) => {
      const nodes = [
        node('world', 'world_frame'),
        node('base', 'rigid_transform', {
          offset: '[1 2 3]',
          rotation: '[20 -15 30]',
        }),
        node('joint', 'universal_joint', { damping: 0 }),
        node('load', 'grav_field', { mass: 2, g: 5 }),
        node('scope', 'scope', { numSignals: 2 }),
      ];
      const edges = [
        edge('anchor', 'world', 'w', 'base', reversed ? 'f' : 'b'),
        edge('base', 'base', reversed ? 'b' : 'f', 'joint', 'b'),
        edge('load', 'joint', 'f', 'load', 'f'),
        edge('w1', 'joint', 'w1', 'scope', 'in1'),
        edge('w2', 'joint', 'w2', 'scope', 'in2'),
      ];
      const engine = new VLabPhysicsEngine(
        normalizeSolverConfiguration(
          node('config', 'solver_config', { solver: method }),
        ),
      );
      engine.setStepBudget({ maxStepAttempts: 8, wallClockMs: 3000 });
      const result = engine.simulateStep(nodes, edges, null, 0.01);
      // Angular-rate precision also includes pose residual tolerance / dt.
      expect(result.scopeOutputs.scope.in1).toBeCloseTo(0, 6);
      expect(result.scopeOutputs.scope.in2).toBeCloseTo(0, 6);
      expect(result.x.every(Number.isFinite)).toBe(true);
    },
  );
  it('normalizes and orthogonalizes nonparallel axes and measures combined angles', () => {
    const params = universalJointParameters(
      { axis1: '[4 0 0]', axis2: '[2 3 0]', damping: 0 },
      'joint',
    );
    expect(params.axis1).toEqual([1, 0, 0]);
    expect(params.axis2).toEqual([0, 1, 0]);
    const a = 0.6,
      b = -0.4;
    const r = [
      Math.atan2(Math.sin(a), Math.cos(a) * Math.cos(b)),
      Math.asin(Math.cos(a) * Math.sin(b)),
      Math.atan2(Math.sin(a) * Math.sin(b), Math.cos(b)),
    ];
    const k = universalJointKinematics(
      [0, 0, 0, 0, 0, 0],
      [0, 0, 0, ...r],
      new Array(6).fill(0),
      new Array(6).fill(0),
      params,
    );
    expect(k.angle1).toBeCloseTo(a, 10);
    expect(k.angle2).toBeCloseTo(b, 10);
    expect(k.constraint).toBeCloseTo(0, 10);
    expect(frameAngularVelocity([0, Math.PI / 2, 0], [2, 3, 4])).toEqual([
      expect.closeTo(0, 10),
      3,
      2,
    ]);
  });
  it('preserves a freely chosen combined pose and measures it in real scopes', () => {
    const nodes = [
      node('world', 'world_frame'),
      node('joint', 'universal_joint', { damping: 0 }),
      node('scope', 'scope', { numSignals: 2 }),
    ];
    const edges = [
      edge('b', 'world', 'w', 'joint', 'b'),
      edge('f', 'joint', 'f', 'joint', 'f'),
      edge('a1', 'joint', 'angle1', 'scope', 'in1'),
      edge('a2', 'joint', 'angle2', 'scope', 'in2'),
    ];
    const engine = new VLabPhysicsEngine();
    engine.setStepBudget({ maxStepAttempts: 10, wallClockMs: 3000 });
    const initial = engine.simulateStep(nodes, edges, null, 0.01);
    const a = 0.5,
      b = 0.3;
    const r = [
      Math.atan2(Math.sin(a), Math.cos(a) * Math.cos(b)),
      Math.asin(Math.cos(a) * Math.sin(b)),
      Math.atan2(Math.sin(a) * Math.sin(b), Math.cos(b)),
    ];
    const x = [...initial.x];
    const indices = ['Rx', 'Ry', 'Rz'].map((axis) =>
      initial.variableNames.findIndex((n) => n.includes('joint_f_' + axis)),
    );
    indices.forEach((idx, i) => {
      x[idx] = r[i];
    });
    const result = engine.simulateStep(nodes, edges, { ...initial, x }, 0.01);
    indices.forEach((idx, i) => expect(result.x[idx]).toBeCloseTo(r[i], 7));
    expect(result.scopeOutputs.scope.in1).toBeCloseTo(a, 7);
    expect(result.scopeOutputs.scope.in2).toBeCloseTo(b, 7);
    expect(result.x.every(Number.isFinite)).toBe(true);
  });
  it('declares Frame ports and typed measurements', () => {
    const block = VLAB_LIBRARY.flatMap((d) => d.blocks).find(
      (b) => b.id === 'universal_joint',
    )!;
    for (const p of ['b', 'f'])
      expect(block.ports.find((v) => v.id === p)?.domain).toBe('Frame');
    for (const [p, unit] of Object.entries({
      angle1: 'rad',
      angle2: 'rad',
      w1: 'rad/s',
      w2: 'rad/s',
      fx: 'N',
      fy: 'N',
      fz: 'N',
      f_reac: 'N',
      t_reac: 'N*m',
    })) {
      expect(block.ports.find((v) => v.id === p)).toMatchObject({
        domain: 'Physical',
        unit,
      });
    }
    expect(block.params).toHaveProperty('axis1');
    expect(block.params).toHaveProperty('axis2');
  });
  it('permits both finite rotations and rejects the third', () => {
    // Rf = Rx(a)*Ry(b), converted to the engine's Rz*Ry*Rx convention.
    const a = 0.6,
      b = -0.4;
    const r = [
      Math.atan2(Math.sin(a), Math.cos(a) * Math.cos(b)),
      Math.asin(Math.cos(a) * Math.sin(b)),
      Math.atan2(Math.sin(a) * Math.sin(b), Math.cos(b)),
    ];
    expect(evaluate(r)).toHaveLength(7);
    expect(Math.max(...evaluate(r).map(Math.abs))).toBeLessThan(1e-10);
    expect(Math.abs(evaluate([0, 0, 0.3])[3])).toBeGreaterThan(0.1);
  });
  it('preserves zero damping and damps only permitted angular velocities', () => {
    expect(evaluate([0, 0, 0], [2, 3, 4])).toEqual(new Array(7).fill(0));
    const res = evaluate([0, 0, 0], [2, 3, 4], { damping: 5 });
    expect(res.slice(4)).toEqual([10, 15, 0]);
  });
  it('uses transported axes and spatial velocity when the base is rotated', () => {
    const axes = universalJointParameters(
      { axis1: '[0 0 2]', axis2: '[0 3 1]', damping: 0 },
      'joint',
    );
    const B = [1, 2, 3, 0.4, -0.3, 0.6];
    const k = universalJointKinematics(
      B,
      B,
      [0, 0, 0, 2, 3, 4],
      [0, 0, 0, 2, 3, 4],
      axes,
    );
    expect(k.constraint).toBeCloseTo(0, 12);
    expect(k.angle1).toBeCloseTo(0, 12);
    expect(k.angle2).toBeCloseTo(0, 12);
    expect(k.w1).toBe(0);
    expect(k.w2).toBe(0);
  });
  it.each([
    { axis1: '[0 0 0]' },
    { axis2: '[2 0 0]' },
    { axis1: '[NaN 0 1]' },
    { axis2: '[1 2]' },
    { damping: -1 },
  ])('rejects invalid parameters before solving: %j', (params) => {
    expect(() =>
      new VLabPhysicsEngine().simulateStep(
        [node('joint', 'universal_joint', params)],
        [],
        null,
        0.01,
      ),
    ).toThrow(/INVALID_JOINT_PARAMETER/);
  });
  it.each(
    [
      { params: { damping: 0 }, torquePort: 'in_tz', reaction: -7 },
      {
        params: { damping: 0, axis1: '[0 0 4]', axis2: '[0 3 0]' },
        torquePort: 'in_tx',
        reaction: 7,
      },
    ].flatMap((example) =>
      ['unconfigured', 'auto', 'bdf'].map((method) => ({ ...example, method })),
    ),
  )(
    'balances a known force and constrained torque through actual scopes: %j',
    ({ params, torquePort, reaction, method }) => {
      const signals = [
        'fx',
        'fy',
        'fz',
        'f_reac',
        't_reac',
        'angle1',
        'angle2',
        'w1',
        'w2',
      ];
      const nodes = [
        node('world', 'world_frame'),
        node('base', 'rigid_transform', {
          offset: '[1 2 3]',
          rotation: '[0 0 0]',
        }),
        node('joint', 'universal_joint', params),
        node('load', 'external_force'),
        node('force', 'ps_constant', { value: 12 }),
        node('forceY', 'ps_constant', { value: -5 }),
        node('forceZ', 'ps_constant', { value: 3 }),
        node('torque', 'ps_constant', { value: 7 }),
        node('scope', 'scope', { numSignals: signals.length }),
      ];
      const edges = [
        edge('anchor', 'world', 'w', 'base', 'b'),
        edge('b', 'base', 'f', 'joint', 'b'),
        edge('f', 'joint', 'f', 'load', 'f'),
        edge('force', 'force', 'y', 'load', 'in_fx'),
        edge('fy', 'forceY', 'y', 'load', 'in_fy'),
        edge('fz', 'forceZ', 'y', 'load', 'in_fz'),
        edge('torque', 'torque', 'y', 'load', torquePort),
        ...signals.map((p, i) => edge(p, 'joint', p, 'scope', 'in' + (i + 1))),
      ];
      const engine = new VLabPhysicsEngine(
        method === 'unconfigured'
          ? undefined
          : normalizeSolverConfiguration(
              node('config', 'solver_config', { solver: method }),
            ),
      );
      engine.setStepBudget({ maxStepAttempts: 10, wallClockMs: 3000 });
      const started = performance.now();
      let result = engine.simulateStep(nodes, edges, null, 0.01);
      for (let i = 0; i < 3; i++)
        result = engine.simulateStep(nodes, edges, result, 0.01);
      expect(performance.now() - started).toBeLessThan(1500);
      expect(result.x.every(Number.isFinite)).toBe(true);
      expect(result.scopeOutputs.scope.in1).toBeCloseTo(-12, 6);
      expect(result.scopeOutputs.scope.in2).toBeCloseTo(5, 6);
      expect(result.scopeOutputs.scope.in3).toBeCloseTo(-3, 6);
      expect(result.scopeOutputs.scope.in4).toBeCloseTo(
        Math.hypot(12, 5, 3),
        6,
      );
      expect(result.scopeOutputs.scope.in5).toBeCloseTo(reaction, 6);
      const system = new DAEAssembler().assemble(nodes, edges);
      expect(system.isPurelyAlgebraic).toBe(false);
      const comp = system.components.find((c) => c.blockId === 'joint')!;
      const read = (name: string) =>
        result.x[system.variableNames.indexOf(name)];
      for (const name of ['fx', 'fy', 'fz', 'tx', 'ty', 'tz']) {
        expect(read('joint_branch_' + name)).toBeCloseTo(
          -read('load_branch_' + name),
          6,
        );
        expect(read('base_branch_' + name)).toBeCloseTo(
          read('joint_branch_' + name),
          6,
        );
      }
      const residuals = system.residuals(
        result.x,
        new Array(system.systemSize).fill(0),
        {
          dt: 0.01,
          time: result.time,
          parameters: {},
          prevStates: result.x,
          states: result.x,
          stateDerivatives: [],
        },
      );
      expect(Math.max(...residuals.map(Math.abs))).toBeLessThan(1e-7);
      for (const axis of ['Px', 'Py', 'Pz']) {
        const idx = (port: string) =>
          system.variableNames.indexOf(
            'Across_' + comp.portNodeMap.get(port) + '_' + axis + '_(frame)',
          );
        expect(result.x[idx('f')] - result.x[idx('b')]).toBeCloseTo(0, 7);
      }
    },
  );
  it.each([
    { torque: 'tx', rate: 'w1', angle: 'angle1' },
    { torque: 'ty', rate: 'w2', angle: 'angle2' },
  ])(
    'moves along a permitted axis and balances its damping torque in real simulation: %j',
    ({ torque, rate, angle }) => {
      const nodes = [
        node('world', 'world_frame'),
        node('joint', 'universal_joint', { damping: 4 }),
        node('load', 'external_force'),
        node('torque', 'ps_constant', { value: 2 }),
        node('scope', 'scope', { numSignals: 2 }),
      ];
      const edges = [
        edge('b', 'world', 'w', 'joint', 'b'),
        edge('f', 'joint', 'f', 'load', 'f'),
        edge('torque', 'torque', 'y', 'load', 'in_' + torque),
        edge('rate', 'joint', rate, 'scope', 'in1'),
        edge('angle', 'joint', angle, 'scope', 'in2'),
      ];
      const engine = new VLabPhysicsEngine();
      engine.setStepBudget({ maxStepAttempts: 10, wallClockMs: 3000 });
      const first = engine.simulateStep(nodes, edges, null, 0.01);
      const second = engine.simulateStep(nodes, edges, first, 0.01);
      expect(second.scopeOutputs.scope.in1).toBeCloseTo(0.5, 5);
      expect(
        second.scopeOutputs.scope.in2 - first.scopeOutputs.scope.in2,
      ).toBeCloseTo(0.005, 5);
      expect(
        second.x[second.variableNames.indexOf('joint_branch_' + torque)],
      ).toBeCloseTo(-2, 6);
      expect(second.x.every(Number.isFinite)).toBe(true);
    },
  );
});
