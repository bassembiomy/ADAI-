// src/engine/vlab/kernel/SolverManager.test.ts
import { describe, it, expect } from 'vitest';
import { SolverManager } from './SolverManager';
import { PhysicalSystemIR, CompiledPhysicalSystem, SolverConfiguration } from './types';

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
    states: [{ id: 's1', name: 'x', symbol: 'x', unit: '', sourceComponentId: '', preferred: true }],
    algebraicVariables: [],
    parameters: [],
    equations: [],
    connections: [],
    references: [],
    metadata: { nodeCount: 1, stateCount: 1, algebraicCount: 0, hasNonlinearities: false, isStiff: false, isDAE: false }
  };

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
    const config: SolverConfiguration = {
      id: 'sc',
      solver: 'auto',
      startTime: 0,
      stopTime: 0.1,
      initialStep: 0.01,
      minimumStep: 1e-6,
      maximumStep: 0.1,
      relativeTolerance: 1e-3,
      absoluteTolerance: 1e-6,
      maximumIterations: 50,
      nonlinearTolerance: 1e-8,
      enableDiagnostics: true,
      enableLogging: true
    };

    const result = manager.runJob({
      id: 'job1',
      networkId: 'net1',
      system: dummyIR,
      compiledSystem: dummySystem,
      solverConfiguration: config
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.time.length).toBeGreaterThan(1);
  });
});
