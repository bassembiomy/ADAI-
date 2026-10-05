import { describe, it, expect, vi } from 'vitest';
import {
  normalizeVector3,
  computeRelativeAngleAxis,
} from './vlabFrameKinematics';
import { blockEquations, BlockEquationArgs } from './vlabEquations';
import { DAEAssembler } from './DAEAssembler';
import { VLabPhysicsEngine } from './vlabPhysics';
import { normalizeSolverConfiguration } from './kernel/PhysicalNetworkExtractor';
import { ImplicitSolver } from './ImplicitSolver';
import { Node, Edge } from '@xyflow/react';
import {
  validateMultibodyConstraintTopology,
  MultibodyConstraintDiagnosticError,
  ConstraintTopology,
} from './vlabConstraintDiagnostics';

const PI = Math.PI;

const baseArgs = (overrides: Partial<BlockEquationArgs>): BlockEquationArgs => ({
  across: [], dAcross: [], branch: [], dBranch: [], state: [], dState: [],
  ctx: {} as any, params: {}, ports: [], nodeId: 'n1',
  ...overrides,
});

describe('normalizeVector3', () => {
  it('normalizes a well-defined vector', () => {
    const result = normalizeVector3([0, 3, 4]);
    expect(result.unit[0]).toBeCloseTo(0, 10);
    expect(result.unit[1]).toBeCloseTo(0.6, 10);
    expect(result.unit[2]).toBeCloseTo(0.8, 10);
    expect(result.magnitude).toBeCloseTo(5, 10);
    expect(result.defined).toBe(true);
  });

  it('flags a zero vector as undefined', () => {
    const result = normalizeVector3([0, 0, 0]);
    expect(result.unit).toEqual([0, 0, 0]);
    expect(result.magnitude).toBeCloseTo(0, 10);
    expect(result.defined).toBe(false);
  });
});

describe('computeRelativeAngleAxis', () => {
  it('computes a quarter turn about Y', () => {
    const result = computeRelativeAngleAxis([0, 0, 0], [0, PI / 2, 0]);
    expect(result.angle).toBeCloseTo(PI / 2, 10);
    expect(result.axis[0]).toBeCloseTo(0, 8);
    expect(result.axis[1]).toBeCloseTo(1, 8);
    expect(result.axis[2]).toBeCloseTo(0, 8);
    expect(result.axisDefined).toBe(true);
  });

  it('flags coincident orientations as a zero, undefined-axis rotation', () => {
    const result = computeRelativeAngleAxis([0, 0, 0], [0, 0, 0]);
    expect(result.angle).toBeCloseTo(0, 10);
    expect(result.axis).toEqual([0, 0, 0]);
    expect(result.axisDefined).toBe(false);
  });

  it('handles the half-turn (PI) singularity about Z', () => {
    const result = computeRelativeAngleAxis([0, 0, 0], [0, 0, PI]);
    expect(Number.isFinite(result.angle)).toBe(true);
    expect(result.angle).toBeCloseTo(PI, 8);
    expect(Math.abs(result.axis[2])).toBeCloseTo(1, 6);
  });
});

describe('dist_constraint equation: lambda mapped onto a 3D reaction force', () => {
  it('balances a satisfied distance constraint along the B->F direction', () => {
    const res = blockEquations.dist_constraint(baseArgs({
      across: [[0, 0, 0, 0, 0, 0], [0, 3, 4, 0, 0, 0]],
      branch: [10, 0, 6, 8, 5, 10],
      params: { dist: 5 },
      ports: ['b', 'f', 'd', 'f_reac'],
      nodeId: 'd1',
    }));
    for (const r of res) expect(r).toBeCloseTo(0, 10);
  });

  it('is satisfied at zero target when B and F coincide (fallback axis, lambda=0)', () => {
    // No direction exists at exact coincidence; the equation falls back to a
    // fixed axis [0,0,1] rather than branching or throwing, so the "distance"
    // row is trivially satisfied (0 - 0 = 0) and, with nothing else loading
    // this frame, lambda converges to 0 via the branch rows below.
    const res = blockEquations.dist_constraint(baseArgs({
      across: [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]],
      branch: [0, 0, 0, 0],
      params: { dist: 0 },
      ports: ['b', 'f'],
      nodeId: 'd1',
    }));
    for (const r of res) expect(r).toBeCloseTo(0, 10);
  });

  it('stays finite and continuous at a nonzero target with coincident frames', () => {
    // No throw: a transient Newton iterate lands exactly here on the very
    // first residual evaluation of any simulation (every new frame variable
    // starts at 0), even for an otherwise well-posed model. The fallback
    // axis [0,0,1] gives Newton a concrete, finite gradient to follow instead
    // of aborting the whole residual vector.
    const res = blockEquations.dist_constraint(baseArgs({
      across: [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]],
      branch: [1, 0, 0, 0],
      params: { dist: 5 },
      ports: ['b', 'f'],
      nodeId: 'd1',
    }));
    expect(res.every(Number.isFinite)).toBe(true);
    expect(res[0]).toBeCloseTo(-5, 10); // actualDist(0) - target(5)
    expect(res[3]).toBeCloseTo(-1, 10); // fz(0) - lambda(1)*axis.z(1)
  });
});

describe('angle_constraint equation: lambda mapped onto a 3D reaction torque', () => {
  it('balances a satisfied angle constraint along the relative rotation axis', () => {
    const res = blockEquations.angle_constraint(baseArgs({
      across: [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, PI / 2, 0]],
      branch: [12, 0, 12, 0, 90, 12],
      params: { angle: 90 },
      ports: ['b', 'f', 'ang', 't_reac'],
      nodeId: 'a1',
    }));
    for (const r of res) expect(Math.abs(r)).toBeLessThan(1e-10);
  });

  it('is satisfied at zero target when orientations coincide (fallback axis, lambda=0)', () => {
    const res = blockEquations.angle_constraint(baseArgs({
      across: [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]],
      branch: [0, 0, 0, 0],
      params: { angle: 0 },
      ports: ['b', 'f'],
      nodeId: 'a1',
    }));
    for (const r of res) expect(r).toBeCloseTo(0, 10);
  });

  it('stays finite and continuous at a nonzero target with coincident orientations', () => {
    const res = blockEquations.angle_constraint(baseArgs({
      across: [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]],
      branch: [1, 0, 0, 0],
      params: { angle: 90 },
      ports: ['b', 'f'],
      nodeId: 'a1',
    }));
    expect(res.every(Number.isFinite)).toBe(true);
    expect(res[0]).toBeCloseTo(-Math.PI / 2, 10); // actualAngle(0) - target(90deg)
    expect(res[3]).toBeCloseTo(-1, 10); // tz(0) - lambda(1)*axis.z(1)
  });
});

describe('DAEAssembler branch layout for constraint reactions', () => {
  it('allocates an internal lambda plus fx/fy/fz/signal_d/signal_f for dist_constraint', () => {
    const assembler = new DAEAssembler();
    const nodes: Node[] = [
      { id: 'd1', type: 'default', position: { x: 0, y: 0 }, data: { type: 'dist_constraint' } } as any,
    ];
    const system = assembler.assemble(nodes, []);
    const names = [
      'd1_branch_lambda', 'd1_branch_fx', 'd1_branch_fy', 'd1_branch_fz',
      'd1_branch_signal_d', 'd1_branch_signal_f',
    ];
    for (const name of names) {
      expect(system.variableNames).toContain(name);
    }
  });

  it('allocates an internal lambda plus tx/ty/tz/signal_ang/signal_t for angle_constraint', () => {
    const assembler = new DAEAssembler();
    const nodes: Node[] = [
      { id: 'a1', type: 'default', position: { x: 0, y: 0 }, data: { type: 'angle_constraint' } } as any,
    ];
    const system = assembler.assemble(nodes, []);
    const names = [
      'a1_branch_lambda', 'a1_branch_tx', 'a1_branch_ty', 'a1_branch_tz',
      'a1_branch_signal_ang', 'a1_branch_signal_t',
    ];
    for (const name of names) {
      expect(system.variableNames).toContain(name);
    }
  });
});

describe('validateMultibodyConstraintTopology', () => {
  it('throws FULLY_PRESCRIBED when a constraint links two already-prescribed frames', () => {
    const constraints: ConstraintTopology[] = [
      { blockId: 'dist_c', type: 'dist_constraint', baseRoot: 'frame-a', followerRoot: 'frame-b' },
    ];
    const prescribed = new Set(['frame-a', 'frame-b']);
    try {
      validateMultibodyConstraintTopology(constraints, prescribed);
      expect.fail('expected a MultibodyConstraintDiagnosticError to be thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(MultibodyConstraintDiagnosticError);
      expect(e.code).toBe('FULLY_PRESCRIBED');
      expect(e.blockId).toBe('dist_c');
    }
  });

  it('does not reject a constraint whose base and follower are the same already-prescribed root', () => {
    const constraints: ConstraintTopology[] = [
      { blockId: 'dist_c', type: 'dist_constraint', baseRoot: 'world', followerRoot: 'world' },
    ];
    expect(() => validateMultibodyConstraintTopology(constraints, new Set(['world']))).not.toThrow();
  });

  it('throws DUPLICATE_CONSTRAINT for two constraints spanning the same frame pair, naming both blocks', () => {
    const constraints: ConstraintTopology[] = [
      { blockId: 'dist_a', type: 'dist_constraint', baseRoot: 'frame-a', followerRoot: 'frame-b' },
      { blockId: 'dist_b', type: 'dist_constraint', baseRoot: 'frame-b', followerRoot: 'frame-a' },
    ];
    try {
      validateMultibodyConstraintTopology(constraints, new Set());
      expect.fail('expected a MultibodyConstraintDiagnosticError to be thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(MultibodyConstraintDiagnosticError);
      expect(e.code).toBe('DUPLICATE_CONSTRAINT');
      expect(e.message).toContain('dist_a');
      expect(e.message).toContain('dist_b');
    }
  });
});

describe('UNDEFINED_DIRECTION: static same-root check in DAEAssembler', () => {
  // A transient numeric coincidence during Newton iteration is handled by
  // the continuous fallback axis in the equations themselves (see above) —
  // it is never a structural error. But both ports wired to the LITERAL SAME
  // frame stay coincident at every possible position, so a nonzero target is
  // impossible to satisfy no matter what the solver does. That is a static,
  // purely topological fact, checked once in assemble() before any solving.
  it('rejects a dist_constraint whose b and f both connect to the same frame with dist != 0', () => {
    const assembler = new DAEAssembler();
    const nodes: Node[] = [
      { id: 'world', type: 'default', position: { x: 0, y: 0 }, data: { type: 'world_frame' } } as any,
      { id: 'd1', type: 'default', position: { x: 100, y: 0 }, data: { type: 'dist_constraint', params: { dist: { value: 5 } } } } as any,
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'world', target: 'd1', sourceHandle: 'w', targetHandle: 'b' },
      { id: 'e2', source: 'world', target: 'd1', sourceHandle: 'w', targetHandle: 'f' },
    ];
    try {
      assembler.assemble(nodes, edges);
      expect.fail('expected a MultibodyConstraintDiagnosticError to be thrown');
    } catch (e: any) {
      expect(e).toBeInstanceOf(MultibodyConstraintDiagnosticError);
      expect(e.code).toBe('UNDEFINED_DIRECTION');
      expect(e.message).toContain('d1');
    }
  });

  it('allows the same wiring when dist = 0 (trivially satisfied)', () => {
    const assembler = new DAEAssembler();
    const nodes: Node[] = [
      { id: 'world', type: 'default', position: { x: 0, y: 0 }, data: { type: 'world_frame' } } as any,
      { id: 'd1', type: 'default', position: { x: 100, y: 0 }, data: { type: 'dist_constraint', params: { dist: { value: 0 } } } } as any,
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'world', target: 'd1', sourceHandle: 'w', targetHandle: 'b' },
      { id: 'e2', source: 'world', target: 'd1', sourceHandle: 'w', targetHandle: 'f' },
    ];
    expect(() => assembler.assemble(nodes, edges)).not.toThrow();
  });
});

// Certification includes assembly, startup and the workspace simulation engine.
describe('Constraint reaction certification (simulation path)', () => {
  const solveOnce = (nodes: Node[], edges: Edge[]) => {
    let state;
    for (const solver of [undefined, 'auto', 'bdf'] as const) {
      const configuration = solver ? normalizeSolverConfiguration({ id: 'config', position: { x: 0, y: 0 }, data: { params: { solver, initialStep: 0.001, maximumStep: 0.001 } } } as Node) : null;
      const engine = new VLabPhysicsEngine(configuration);
      const spy = vi.spyOn(ImplicitSolver.prototype, 'solve');
      const started = performance.now();
      state = undefined;
      try {
        for (let i = 0; i < 5; i++) {
          state = engine.simulateStep(nodes, edges, state, 0.001);
          expect(state.x.every(Number.isFinite)).toBe(true);
          expect(state.rejectedSteps).toBe(0);
          expect(state.useSdirk).toBe(false);
        }
        expect(spy).toHaveBeenCalledTimes(5);
        expect(performance.now() - started).toBeLessThan(1500);
        expect(state!.time).toBeCloseTo(0.005, 12);
      } finally { spy.mockRestore(); }
    }
    const read = (name: string) => state!.x[state!.variableNames.indexOf(name)];
    return { read };
  };

  it('zero reaction: trilateration pins a free frame with 3 independent dist_constraints', () => {
    // A1=[5,0,0], A2=[0,5,0], A3=[0,0,5] (each independently anchored to
    // world), target point P=[1,1,1] — |P-Ai| is identical for all three by
    // construction, so the geometry is already self-consistent and every
    // dist_c should settle with zero reaction. No single dist_constraint has
    // both endpoints prescribed (only each Ai is), so none is rejected; the
    // 3 independent equations together remove the translational null space
        // that a lone constraint would leave.
    const d = Math.sqrt((1 - 5) ** 2 + 1 + 1);
    const nodes: Node[] = [
      { id: 'world', type: 'default', position: { x: 0, y: 0 }, data: { type: 'world_frame' } } as any,
      { id: 't1', type: 'default', position: { x: 50, y: 0 }, data: { type: 'rigid_transform', params: { offset: { value: '[5 0 0]' } } } } as any,
      { id: 't2', type: 'default', position: { x: 50, y: 50 }, data: { type: 'rigid_transform', params: { offset: { value: '[0 5 0]' } } } } as any,
      { id: 't3', type: 'default', position: { x: 50, y: 100 }, data: { type: 'rigid_transform', params: { offset: { value: '[0 0 5]' } } } } as any,
      { id: 'd1', type: 'default', position: { x: 150, y: 0 }, data: { type: 'dist_constraint', params: { dist: { value: d } } } } as any,
      { id: 'd2', type: 'default', position: { x: 150, y: 50 }, data: { type: 'dist_constraint', params: { dist: { value: d } } } } as any,
      { id: 'd3', type: 'default', position: { x: 150, y: 100 }, data: { type: 'dist_constraint', params: { dist: { value: d } } } } as any,
    ];
    const edges: Edge[] = [
      { id: 'e0', source: 'world', target: 't1', sourceHandle: 'w', targetHandle: 'b' },
      { id: 'e1', source: 'world', target: 't2', sourceHandle: 'w', targetHandle: 'b' },
      { id: 'e2', source: 'world', target: 't3', sourceHandle: 'w', targetHandle: 'b' },
      { id: 'e3', source: 't1', target: 'd1', sourceHandle: 'f', targetHandle: 'b' },
      { id: 'e4', source: 't2', target: 'd2', sourceHandle: 'f', targetHandle: 'b' },
      { id: 'e5', source: 't3', target: 'd3', sourceHandle: 'f', targetHandle: 'b' },
      { id: 'e6', source: 'd1', target: 'd2', sourceHandle: 'f', targetHandle: 'f' },
      { id: 'e7', source: 'd2', target: 'd3', sourceHandle: 'f', targetHandle: 'f' },
    ];

    const { read } = solveOnce(nodes, edges);
    for (const id of ['d1', 'd2', 'd3']) {
      expect(read(`${id}_branch_signal_d`)).toBeCloseTo(d, 6);
      expect(Math.abs(read(`${id}_branch_signal_f`))).toBeLessThan(1e-6);
    }
  });

  it('known load: dist_constraint reaction magnitude equals an applied external_force', () => {
    // t_f is anchored to world at offset [0,3,4] (|offset|=5, matching the
    // target). dist_c's other end is free, loaded only by an external_force
    // of [0,6,8] (magnitude 10) — this fixes the otherwise-undefined
    // direction (lambda*n must balance the applied load) and the resulting
    // reaction magnitude must equal the applied load's magnitude.
    const nodes: Node[] = [
      { id: 'world', type: 'default', position: { x: 0, y: 0 }, data: { type: 'world_frame' } } as any,
      { id: 't_f', type: 'default', position: { x: 100, y: 0 }, data: { type: 'rigid_transform', params: { offset: { value: '[0 3 4]' } } } } as any,
      { id: 'dist_c', type: 'default', position: { x: 200, y: 0 }, data: { type: 'dist_constraint', params: { dist: { value: 5 } } } } as any,
      { id: 'cy', type: 'default', position: { x: 0, y: 50 }, data: { type: 'ps_constant', params: { value: { value: 6 } } } } as any,
      { id: 'cz', type: 'default', position: { x: 0, y: 100 }, data: { type: 'ps_constant', params: { value: { value: 8 } } } } as any,
      { id: 'ext', type: 'default', position: { x: 100, y: 100 }, data: { type: 'external_force', params: { force_scale: { value: 1 } } } } as any,
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'world', target: 't_f', sourceHandle: 'w', targetHandle: 'b' },
      { id: 'e2', source: 't_f', target: 'dist_c', sourceHandle: 'f', targetHandle: 'f' },
      { id: 'e3', source: 'cy', target: 'ext', sourceHandle: 'y', targetHandle: 'in_fy' },
      { id: 'e4', source: 'cz', target: 'ext', sourceHandle: 'y', targetHandle: 'in_fz' },
      { id: 'e5', source: 'ext', target: 'dist_c', sourceHandle: 'f', targetHandle: 'b' },
    ];

    const { read } = solveOnce(nodes, edges);
    expect(read('dist_c_branch_signal_d')).toBeCloseTo(5, 6);
    expect(read('dist_c_branch_signal_f')).toBeCloseTo(10, 5); // |[0,6,8]| = 10
  });

  it('known load: angle_constraint reaction magnitude equals an applied external torque', () => {
    // t_f is anchored to world with rotation [0,0,30] (deg), matching the
    // angle_c target of 30deg relative to the (identity) world/free-frame
    // orientation. The free side is loaded only by a torque of magnitude 7
    // about Z via external_force's torque inputs, fixing the axis.
    const nodes: Node[] = [
      { id: 'world', type: 'default', position: { x: 0, y: 0 }, data: { type: 'world_frame' } } as any,
      { id: 't_f', type: 'default', position: { x: 100, y: 0 }, data: { type: 'rigid_transform', params: { rotation: { value: '[0 0 30]' } } } } as any,
      { id: 'angle_c', type: 'default', position: { x: 200, y: 0 }, data: { type: 'angle_constraint', params: { angle: { value: 30 } } } } as any,
      { id: 'ctz', type: 'default', position: { x: 0, y: 100 }, data: { type: 'ps_constant', params: { value: { value: 7 } } } } as any,
      { id: 'ext', type: 'default', position: { x: 100, y: 100 }, data: { type: 'external_force', params: { torque_scale: { value: 1 } } } } as any,
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'world', target: 't_f', sourceHandle: 'w', targetHandle: 'b' },
      { id: 'e2', source: 't_f', target: 'angle_c', sourceHandle: 'f', targetHandle: 'f' },
      { id: 'e3', source: 'ctz', target: 'ext', sourceHandle: 'y', targetHandle: 'in_tz' },
      { id: 'e4', source: 'ext', target: 'angle_c', sourceHandle: 'f', targetHandle: 'b' },
    ];

    const { read } = solveOnce(nodes, edges);
    expect(read('angle_c_branch_signal_ang')).toBeCloseTo(30, 4);
    expect(read('angle_c_branch_signal_t')).toBeCloseTo(7, 5);
  });
});
