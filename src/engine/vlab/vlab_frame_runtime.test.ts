import { afterEach, describe, expect, it, vi } from 'vitest';
import { Node, Edge } from '@xyflow/react';
import { DAEAssembler } from './DAEAssembler';
import { VLabPhysicsEngine } from './vlabPhysics';
import { ImplicitSolver } from './ImplicitSolver';
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
const config = normalizeSolverConfiguration(node('config', 'solver_config'));
const prescribed = (type: string, reversed = false) => ({
  nodes: [
    node('world', 'world_frame'),
    node('transform', 'rigid_transform', { offset: '[1 0 0]' }),
    node('constraint', type, { dist: 1, angle: 0 }),
  ],
  edges: [
    edge('anchor', 'world', 'w', 'transform', reversed ? 'f' : 'b'),
    edge('base', 'world', 'w', 'constraint', 'b'),
    edge('follower', 'transform', reversed ? 'b' : 'f', 'constraint', 'f'),
  ],
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('Frame simulation diagnostics and retry policy', () => {
  it.each([
    'dist_constraint',
    'angle_constraint',
    'spherical_joint',
    'universal_joint',
  ])('reports FULLY_PRESCRIBED immediately for %s before solving', (type) => {
    for (const reversed of [false, true]) {
      const { nodes, edges } = prescribed(type, reversed);
      const spy = vi.spyOn(ImplicitSolver.prototype, 'solve');
      const started = performance.now();
      expect(() =>
        new VLabPhysicsEngine(config).simulateStep(nodes, edges, null, 0.01),
      ).toThrow(/FULLY_PRESCRIBED/);
      expect(spy).not.toHaveBeenCalled();
      expect(performance.now() - started).toBeLessThan(500);
    }
  });
  it('invalidates cached assembly when only a frame handle changes', () => {
    const { nodes, edges } = prescribed('spherical_joint');
    const initialEdges = edges.map((e) =>
      e.id === 'follower' ? { ...e, sourceHandle: 'b', targetHandle: 'b' } : e,
    );
    const engine = new VLabPhysicsEngine(config);
    // Isolate cache invalidation from convergence of a degenerate same-root joint.
    const spy = vi
      .spyOn(ImplicitSolver.prototype, 'solve')
      .mockImplementation((_residual, x) => x);
    const state = engine.simulateStep(nodes, initialEdges, null, 0.01);
    spy.mockRestore();
    expect(() => engine.simulateStep(nodes, edges, state, 0.01)).toThrow(
      /FULLY_PRESCRIBED/,
    );
  });
  it('keeps ordinary algebraic measurement processing on the one-solve path', () => {
    const nodes = [
      node('world', 'world_frame'),
      node('joint', 'spherical_joint'),
      node('gain', 'ps_gain', { gain: 2 }),
      node('scope', 'scope'),
    ];
    const edges = [
      edge('base', 'world', 'w', 'joint', 'b'),
      edge('measure', 'joint', 'f_reac', 'gain', 'u'),
      edge('output', 'gain', 'y', 'scope', 'in1'),
    ];
    const spy = vi.spyOn(ImplicitSolver.prototype, 'solve');
    const state = new VLabPhysicsEngine(config).simulateStep(
      nodes,
      edges,
      null,
      0.01,
    );
    expect(state.x.every(Number.isFinite)).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it.each([
    'capacitor',
    'inductor',
    'mass',
    'thermal_mass',
    'spring_damper_force',
    'ps_integrator_gen',
    'ps_moving_avg',
    'ps_smith_predictor',
    'quad_decoder',
    'resolver_to_digital',
  ])('does not classify %s as algebraic solely from state flags', (type) => {
    const system = new DAEAssembler().assemble([node('dynamic', type)], []);
    expect(system.isPurelyAlgebraic).toBe(false);
  });
  it.each(['auto', 'bdf', 'euler', 'rk4', 'rk_adaptive'])(
    'samples an algebraic discontinuity once with %s',
    (solver) => {
      const nodes = [
        node('input', 'ps_step', { time: 0.015, initial: -1, final: 1 }),
        node('limit', 'ps_saturation', { lower: -0.5, upper: 0.5 }),
        node('scope', 'scope'),
      ];
      const edges = [
        edge('input-limit', 'input', 'y', 'limit', 'u'),
        edge('limit-scope', 'limit', 'y', 'scope', 'in1'),
      ];
      const configuration = normalizeSolverConfiguration(
        node('config', 'solver_config', {
          solver,
          initialStep: 0.01,
          maximumStep: 0.01,
        }),
      );
      const engine = new VLabPhysicsEngine(configuration);
      const spy = vi.spyOn(ImplicitSolver.prototype, 'solve');
      const initial = engine.simulateStep(nodes, edges, null, 0.01);
      const result = engine.simulateStep(
        nodes,
        edges,
        { ...initial, useSdirk: true },
        0.01,
      );
      expect(spy).toHaveBeenCalledTimes(2);
      expect(result.scopeValues).toBeCloseTo(0.5, 7);
      expect(result.rejectedSteps).toBe(0);
      expect(result.useSdirk).toBe(false);
    },
  );
  it('does not escalate or retry an algebraic nonlinear solve failure', () => {
    const nodes = [
      node('world', 'world_frame'),
      node('joint', 'spherical_joint'),
    ];
    const edges = [edge('base', 'world', 'w', 'joint', 'b')];
    const spy = vi
      .spyOn(ImplicitSolver.prototype, 'solve')
      .mockImplementation(() => {
        throw new Error('nonlinear failure');
      });
    for (const configuration of [null, config]) {
      spy.mockClear();
      expect(() =>
        new VLabPhysicsEngine(configuration).simulateStep(
          nodes,
          edges,
          null,
          0.01,
        ),
      ).toThrow('nonlinear failure');
      expect(spy).toHaveBeenCalledTimes(1);
    }
  });
  it('retains FULLY_PRESCRIBED in the actual worker response consumed by the UI', async () => {
    const worker = { onmessage: null as any, postMessage: vi.fn() };
    vi.stubGlobal('self', worker);
    await import('./vlabWorker');
    const spy = vi.spyOn(ImplicitSolver.prototype, 'solve');
    for (const type of ['dist_constraint', 'universal_joint']) {
      const { nodes, edges } = prescribed(type);
      worker.onmessage({
        data: {
          requestId: 42,
          nodes,
          edges,
          configuration: config,
          previousState: null,
          dt: 0.01,
        },
      });
      expect(worker.postMessage).toHaveBeenLastCalledWith({
        requestId: 42,
        error: expect.stringContaining('FULLY_PRESCRIBED'),
      });
    }
    worker.onmessage({
      data: {
        requestId: 43,
        nodes: [node('joint', 'universal_joint', { axis1: '[0 0 0]' })],
        edges: [],
        configuration: config,
        previousState: null,
        dt: 0.01,
      },
    });
    expect(worker.postMessage).toHaveBeenLastCalledWith({
      requestId: 43,
      error: expect.stringContaining('INVALID_JOINT_PARAMETER'),
    });
    expect(spy).not.toHaveBeenCalled();
  });
});
