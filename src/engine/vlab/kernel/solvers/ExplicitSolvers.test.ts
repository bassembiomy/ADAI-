// src/engine/vlab/kernel/solvers/ExplicitSolvers.test.ts
import { describe, it, expect } from 'vitest';
import { EulerSolver } from './EulerSolver';
import { RK4Solver } from './RK4Solver';
import { AdaptiveRKSolver } from './AdaptiveRKSolver';
import { CompiledPhysicalSystem, SolverConfiguration } from '../types';

describe('Explicit ODE Solvers on Exponential Decay (dx/dt = -x, x(0) = 1.0)', () => {
  const decaySystem: CompiledPhysicalSystem = {
    id: 'decay',
    domains: ['electrical'],
    stateCount: 1,
    algebraicCount: 0,
    totalSize: 1,
    isDifferentialState: [true],
    variableNames: ['x'],
    residual: (t, x, dx, z, ctx, out) => {
      // F = dx/dt + x = 0 => dx/dt = -x
      out[0] = dx[0] + x[0];
    }
  };

  const config: SolverConfiguration = {
    id: 'sc',
    solver: 'euler',
    startTime: 0,
    stopTime: 1.0,
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

  it('EulerSolver should simulate decay accurately within O(h) tolerance', () => {
    const solver = new EulerSolver();
    const state = solver.initialize(decaySystem, config, [{ variableId: 'x', value: 1.0, source: 'user', priority: 1 }]);
    const res = solver.solve(state, config);
    const finalX = res.states['x'][res.states['x'].length - 1];
    const exact = Math.exp(-1.0);
    expect(Math.abs(finalX - exact)).toBeLessThan(0.01);
  });

  it('RK4Solver should simulate decay accurately with high precision', () => {
    const solver = new RK4Solver();
    const state = solver.initialize(decaySystem, config, [{ variableId: 'x', value: 1.0, source: 'user', priority: 1 }]);
    const res = solver.solve(state, config);
    const finalX = res.states['x'][res.states['x'].length - 1];
    const exact = Math.exp(-1.0);
    expect(Math.abs(finalX - exact)).toBeLessThan(1e-5);
  });

  it('AdaptiveRKSolver should adapt step size and satisfy tolerance', () => {
    const solver = new AdaptiveRKSolver();
    const state = solver.initialize(decaySystem, config, [{ variableId: 'x', value: 1.0, source: 'user', priority: 1 }]);
    const res = solver.solve(state, config);
    const finalX = res.states['x'][res.states['x'].length - 1];
    const exact = Math.exp(-1.0);
    expect(Math.abs(finalX - exact)).toBeLessThan(1e-4);
  });
});
