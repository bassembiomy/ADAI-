import { describe, it, expect } from 'vitest';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';
import { VLabPhysicsEngine } from './vlabPhysics';
import { DAEAssembler } from './DAEAssembler';
import { computeRelativeAngleAxis } from './vlabFrameKinematics';
import { blockEquations } from './vlabEquations';
import { Node, Edge } from '@xyflow/react';
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
describe('ideal spherical joint', () => {
  it('declares Frame ports, typed measurements and no rotational damping', () => {
    const b = VLAB_LIBRARY.flatMap((d) => d.blocks).find((b) => b.id === 'spherical_joint')!;
    for (const id of ['b', 'f']) expect(b.ports.find((p) => p.id === id)?.domain).toBe('Frame');
    for (const id of ['fx', 'fy', 'fz', 'f_reac', 'rx', 'ry', 'rz'])
      expect(b.ports.find((p) => p.id === id)?.domain).toBe('Physical');
    expect(b.params.damping).toBeUndefined();
  });
  it('constrains translation and leaves every rotational coordinate free', () => {
    const evaluate = (rotation: number[]) =>
      blockEquations.spherical_joint({
        across: [
          [1, 2, 3, 0, 0, 0],
          [1, 2, 3, ...rotation],
        ],
        branch: [4, 5, 6],
        ports: ['b', 'f'],
        params: { damping: 100 },
        dAcross: [],
        dBranch: [],
        state: [],
        dState: [],
        ctx: {} as any,
        nodeId: 'joint',
      });
    for (const r of [
      [0, 0, 0],
      [1, 0, 0],
      [0, 2, 0],
      [0, 0, 3],
      [1, 2, 3],
    ])
      expect(evaluate(r)).toEqual([0, 0, 0]);
  });
  it('preserves an arbitrary follower orientation without transmitting torque', () => {
    const nodes = [node('world', 'world_frame'), node('joint', 'spherical_joint')];
    const edges = [edge('base', 'world', 'w', 'joint', 'b'), edge('follower', 'joint', 'f', 'joint', 'f')];
    const engine = new VLabPhysicsEngine();
    const initial = engine.simulateStep(nodes, edges, null, 0.01);
    const rotationIndices = ['Rx', 'Ry', 'Rz'].map((axis) =>
      initial.variableNames.findIndex((n) => n.includes('joint_f_' + axis)),
    );
    expect(rotationIndices.every((i) => i >= 0)).toBe(true);
    const x = [...initial.x];
    rotationIndices.forEach((index, i) => {
      x[index] = [0.4, -0.3, 0.7][i];
    });
    const result = engine.simulateStep(nodes, edges, { ...initial, x }, 0.01);
    rotationIndices.forEach((index, i) => expect(result.x[index]).toBeCloseTo([0.4, -0.3, 0.7][i], 8));
  });
  it('balances a 3D load and exposes its reaction through actual scopes', () => {
    const nodes = [
      node('world', 'world_frame'),
      node('joint', 'spherical_joint'),
      node('load', 'grav_field', { mass: 2, g: 5, direction: '[2 3 6]' }),
      node('scope', 'scope', { numSignals: 4 }),
    ];
    const edges = [
      edge('b', 'world', 'w', 'joint', 'b'),
      edge('f', 'joint', 'f', 'load', 'f'),
      ...['fx', 'fy', 'fz', 'f_reac'].map((p, i) => edge(p, 'joint', p, 'scope', 'in' + (i + 1))),
    ];
    const result = new VLabPhysicsEngine().simulateStep(nodes, edges, null, 0.01);
    const read = (name: string) => result.x[result.variableNames.indexOf(name)];
    expect(result.x.every(Number.isFinite)).toBe(true);
    for (const p of ['fx', 'fy', 'fz'])
      expect(read('joint_branch_' + p)).toBeCloseTo(-read('load_branch_' + p), 6);
    expect(read('joint_branch_signal_f_reac')).toBeCloseTo(10, 6);
    expect(result.variableNames.some((n) => n.startsWith('joint_branch_t'))).toBe(false);
    expect(result.scopeOutputs.scope.in4).toBeCloseTo(10, 6);
  });
  it.each(['grav_field', 'external_force'])('measures relative rotation from a rotated base under %s', (loadType) => {
    const nodes = [
      node('world', 'world_frame'),
      node('base', 'rigid_transform', { offset: '[1 2 3]', rotation: '[20 -15 30]' }),
      node('joint', 'spherical_joint'),
      node('load', loadType, { mass: 2, g: 5, direction: '[2 3 6]' }),
      ...(loadType === 'external_force' ? [node('force', 'ps_constant', { value: 10 })] : []),
      node('scope', 'scope', { numSignals: 3 }),
    ];
    const edges = [
      edge('anchor', 'world', 'w', 'base', 'b'),
      edge('b', 'base', 'f', 'joint', 'b'),
      edge('f', 'joint', 'f', 'load', 'f'),
      ...(loadType === 'external_force' ? [edge('force-input', 'force', 'y', 'load', 'in_fx')] : []),
      ...['rx', 'ry', 'rz'].map((p, i) => edge(p, 'joint', p, 'scope', 'in' + (i + 1))),
    ];
    const engine = new VLabPhysicsEngine();
    const initial = engine.simulateStep(nodes, edges, null, 0.01);
    const system = new DAEAssembler().assemble(nodes, edges);
    const joint = system.components.find((c) => c.blockId === 'joint')!;
    const index = (port: string, axis: string) =>
      system.variableNames.indexOf('Across_' + joint.portNodeMap.get(port) + '_' + axis + '_(frame)');
    const x = [...initial.x];
    ['Rx', 'Ry', 'Rz'].forEach((axis, i) => {
      x[index('f', axis)] = [0.4, -0.3, 0.7][i];
    });
    const result = engine.simulateStep(nodes, edges, { ...initial, x }, 0.01);
    const rotation = computeRelativeAngleAxis(
      ['Rx', 'Ry', 'Rz'].map((axis) => result.x[index('b', axis)]) as [number, number, number],
      [0.4, -0.3, 0.7],
    );
    ['rx', 'ry', 'rz'].forEach((_axis, i) =>
      expect(result.scopeOutputs.scope['in' + (i + 1)]).toBeCloseTo(rotation.angle * rotation.axis[i], 7),
    );
    ['Px', 'Py', 'Pz'].forEach((axis) =>
      expect(result.x[index('f', axis)] - result.x[index('b', axis)]).toBeCloseTo(0, 8),
    );
    for (const p of ['fx', 'fy', 'fz']) {
      expect(result.x[system.variableNames.indexOf('base_branch_' + p)]).toBeCloseTo(
        result.x[system.variableNames.indexOf('joint_branch_' + p)],
        7,
      );
    }
    for (const p of ['tx', 'ty', 'tz'])
      expect(result.x[system.variableNames.indexOf('base_branch_' + p)]).toBeCloseTo(0, 7);
    const residual = system.residuals(result.x, new Array(system.systemSize).fill(0), {
      dt: 0.01,
      time: result.time,
      parameters: {},
      prevStates: x,
      states: result.x,
      stateDerivatives: [],
    });
    expect(Math.max(...residual.map(Math.abs))).toBeLessThan(1e-7);
  });
});
