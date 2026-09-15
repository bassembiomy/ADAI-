// src/engine/vlab/kernel/SolverManager.test.ts
import { describe, it, expect } from 'vitest';
import { SolverManager } from './SolverManager';
import { PhysicalSystemIR, CompiledPhysicalSystem, SolverConfiguration, SimulationJob } from './types';

describe('SolverManager', () => {
  const manager = new SolverManager();

  const dummySystem: CompiledPhysicalSystem = {
    id: 'sys',
    domains: ['electrical'],
    stateCount: 1,
    algebraicCount: 0,
    totalSize: 1,
    isDifferentialState: [true],
    variableNames: ['x'],
    residual: (t, x, dx, z, ctx, out) => { out[0] = dx[0] + x[0]; }
  };

  const dummyIR: PhysicalSystemIR = {
    id: 'sys_ir',
    domains: ['electrical'],
    components: [],
    nodes: [],
    states: [{ id: 's1', name: 'x', symbol: 'x', unit: '', initialValue: 1, sourceComponentId: '', preferred: true }],
    algebraicVariables: [],
    parameters: [],
    equations: [],
    connections: [],
    references: [],
    metadata: { nodeCount: 1, stateCount: 1, algebraicCount: 0, hasNonlinearities: false, isStiff: false, isDAE: false }
  };

  const createConfiguration = (overrides: Partial<SolverConfiguration> = {}): SolverConfiguration => ({
    id: 'sc',
    solver: 'euler',
    startTime: 0,
    stopTime: 0.3,
    initialStep: 0.1,
    minimumStep: 1e-6,
    maximumStep: 0.1,
    relativeTolerance: 1e-3,
    absoluteTolerance: 1e-6,
    maximumIterations: 50,
    nonlinearTolerance: 1e-8,
    enableDiagnostics: true,
    enableLogging: true,
    ...overrides
  });

  const createJob = (solverConfiguration = createConfiguration()): SimulationJob => ({
    id: 'job1',
    networkId: 'net1',
    system: dummyIR,
    compiledSystem: dummySystem,
    solverConfiguration
  });

  it('should recommend Adaptive RK for smooth ODE systems', () => {
    const rec = manager.recommendSolver(dummyIR);
    expect(rec.recommended).toBe('rk_adaptive');
  });

  it('should recommend BDF for DAE systems', () => {
    const daeIR: PhysicalSystemIR = {
      ...dummyIR,
      metadata: { ...dummyIR.metadata, isDAE: true, algebraicCount: 2 }
    };
    const rec = manager.recommendSolver(daeIR);
    expect(rec.recommended).toBe('bdf');
  });

  it('should execute simulation job with Auto solver selection', () => {
    const result = manager.runJob(createJob(createConfiguration({ solver: 'auto', stopTime: 0.1, initialStep: 0.01 })));

    expect(result.status).toBe('SUCCESS');
    expect(result.time.length).toBeGreaterThan(1);
  });

  it('applies a validated configuration update at the next boundary without losing output history', () => {
    const runtime = new SolverManager().createRuntimeJob(createJob());

    expect(runtime.step().accepted).toBe(true);
    const beforeUpdate = runtime.getResult();

    const update = runtime.updateConfiguration(createConfiguration({
      stopTime: 0.14,
      maximumStep: 0.02,
      relativeTolerance: 1e-9,
      absoluteTolerance: 1e-10
    }));

    expect(update.valid).toBe(true);
    const nextBoundary = runtime.step();
    expect(nextBoundary).toMatchObject({ accepted: true, dt: 0.02 });
    expect(nextBoundary.time).toBeCloseTo(0.12);
    expect(runtime.getResult().time.slice(0, beforeUpdate.time.length)).toEqual(beforeUpdate.time);
    expect(runtime.getResult().states.x.slice(0, beforeUpdate.states.x.length)).toEqual(beforeUpdate.states.x);

    const result = runtime.runToCompletion();
    expect(result.time.at(-1)).toBeCloseTo(0.14);
    expect(result.solverStatistics.maxStepUsed).toBeCloseTo(0.1);
    expect(result.solverStatistics.minStepUsed).toBeCloseTo(0.02);
  });

  it('switches solver methods at a boundary while retaining the current state and output history', () => {
    const runtime = new SolverManager().createRuntimeJob(createJob());

    runtime.step();
    const beforeUpdate = runtime.getResult();
    const update = runtime.updateConfiguration(createConfiguration({ solver: 'rk4' }));

    expect(update.valid).toBe(true);
    expect(runtime.step()).toMatchObject({ accepted: true, time: 0.2 });
    const afterUpdate = runtime.getResult();

    expect(afterUpdate.time.slice(0, beforeUpdate.time.length)).toEqual(beforeUpdate.time);
    expect(afterUpdate.states.x[1]).toBeCloseTo(beforeUpdate.states.x[1]);
    expect(afterUpdate.states.x[2]).toBeCloseTo(0.81435368, 6);
  });

  it('uses updated tolerances at the next adaptive solver boundary', () => {
    const runtime = new SolverManager().createRuntimeJob(createJob(createConfiguration({
      solver: 'rk_adaptive',
      relativeTolerance: 1,
      absoluteTolerance: 1,
      maximumStep: 0.1
    })));

    expect(runtime.step().accepted).toBe(true);
    expect(runtime.updateConfiguration(createConfiguration({
      solver: 'rk_adaptive',
      relativeTolerance: 1e-15,
      absoluteTolerance: 1e-15,
      maximumStep: 0.1
    })).valid).toBe(true);

    expect(runtime.step()).toMatchObject({ accepted: false, time: 0.1, dt: 0.1 });
    expect(runtime.getResult().time).toEqual([0, 0.1]);
  });

  it('marks an externally stepped job as failed after a rejection at the minimum step', () => {
    const runtime = new SolverManager().createRuntimeJob(createJob(createConfiguration({
      solver: 'rk_adaptive',
      minimumStep: 0.1,
      maximumStep: 0.1,
      relativeTolerance: 1e-15,
      absoluteTolerance: 1e-15
    })));

    expect(runtime.step()).toMatchObject({ accepted: false, complete: true, time: 0, dt: 0.1 });
    expect(runtime.getResult()).toMatchObject({
      status: 'FAILED',
      solverStatistics: { convergenceStatus: 'FAILED', rejectedSteps: 1 }
    });
    expect(runtime.step()).toMatchObject({ accepted: false, complete: true, time: 0, dt: 0 });
    expect(runtime.getResult().solverStatistics.rejectedSteps).toBe(1);
  });

  it('keeps the active configuration when an invalid update is rejected', () => {
    const runtime = new SolverManager().createRuntimeJob(createJob());

    const update = runtime.updateConfiguration(createConfiguration({ maximumStep: 0 }));

    expect(update.valid).toBe(false);
    expect(update.errors).toContain('maximumStep must be a finite positive number or auto');
    expect(runtime.getConfiguration().maximumStep).toBe(0.1);
    expect(runtime.step()).toMatchObject({ accepted: true, dt: 0.1 });
  });
});
