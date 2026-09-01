// src/engine/vlab/kernel/solvers/BDFSolver.test.ts
import { describe, it, expect } from 'vitest';
import { BDFSolver } from './BDFSolver';
import { CompiledPhysicalSystem, SolverConfiguration } from '../types';

describe('BDFSolver on Stiff / DAE System', () => {
  const decaySystem: CompiledPhysicalSystem = {
    id: 'decay',
    domains: ['electrical'],
    stateCount: 1,
    algebraicCount: 0,
    totalSize: 1,
    isDifferentialState: [true],
    variableNames: ['x'],
    residual: (t, x, dx, z, ctx, out) => {
      out[0] = dx[0] + 1000 * x[0];
    }
  };

  const config: SolverConfiguration = {
    id: 'sc',
    solver: 'bdf',
    startTime: 0,
    stopTime: 0.01,
    initialStep: 1e-4,
    minimumStep: 1e-6,
    maximumStep: 1e-3,
    relativeTolerance: 1e-3,
    absoluteTolerance: 1e-6,
    maximumIterations: 50,
    nonlinearTolerance: 1e-8,
    enableDiagnostics: true,
    enableLogging: true
  };

  it('should stably solve stiff system with Newton iterations without exploding', () => {
    const solver = new BDFSolver();
    const state = solver.initialize(decaySystem, config, [{ variableId: 'x', value: 1.0, source: 'user', priority: 1 }]);
    const res = solver.solve(state, config);
    const finalX = res.states['x'][res.states['x'].length - 1];
    expect(Math.abs(finalX)).toBeLessThan(0.02);
    expect(res.solverStatistics.convergenceStatus).toBe('CONVERGED');
  });
});
