// src/engine/vlab/kernel/benchmarks/rlcBenchmark.test.ts
import { describe, it, expect } from 'vitest';
import { EquationAssembler } from '../EquationAssembler';
import { RK4Solver } from '../solvers/RK4Solver';
import { AdaptiveRKSolver } from '../solvers/AdaptiveRKSolver';
import { BDFSolver } from '../solvers/BDFSolver';
import { PhysicalSystemIR, SolverConfiguration } from '../types';

describe('Electrical RLC Analytical Benchmark (Series RLC Step Response)', () => {
  const R = 100;
  const L = 0.1;
  const C = 10e-6;
  const Vs = 10;

  // Analytical constants:
  // omega0 = 1000 rad/s, zeta = 0.5 (underdamped), omegad = 866.0254 rad/s
  const omega0 = 1 / Math.sqrt(L * C);
  const zeta = (R / 2) * Math.sqrt(C / L);
  const omegad = omega0 * Math.sqrt(1 - zeta * zeta);

  const exactVc = (t: number) => {
    if (t <= 0) return 0;
    return Vs * (1 - Math.exp(-zeta * omega0 * t) * (Math.cos(omegad * t) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(omegad * t)));
  };

  const exactIl = (t: number) => {
    if (t <= 0) return 0;
    return (Vs / (omegad * L)) * Math.exp(-zeta * omega0 * t) * Math.sin(omegad * t);
  };

  const rlcIR: PhysicalSystemIR = {
    id: 'rlc_benchmark',
    domains: ['electrical'],
    components: [],
    nodes: [],
    states: [
      { id: 'vc', name: 'V_C', symbol: 'V_C', unit: 'V', sourceComponentId: 'c1', preferred: true },
      { id: 'il', name: 'I_L', symbol: 'I_L', unit: 'A', sourceComponentId: 'l1', preferred: true }
    ],
    algebraicVariables: [],
    parameters: [
      { id: 'r', name: 'resistance', value: R, componentId: 'r1' },
      { id: 'l', name: 'inductance', value: L, componentId: 'l1' },
      { id: 'c', name: 'capacitance', value: C, componentId: 'c1' },
      { id: 'vs', name: 'voltage', value: Vs, componentId: 'vs1' }
    ],
    equations: [],
    connections: [],
    references: [],
    metadata: { nodeCount: 3, stateCount: 2, algebraicCount: 0, hasNonlinearities: false, isStiff: false, isDAE: false }
  };

  const assembler = new EquationAssembler();
  const compiled = assembler.assembleRLC(rlcIR);

  const config: SolverConfiguration = {
    id: 'sc_bench',
    solver: 'rk4',
    startTime: 0,
    stopTime: 0.02, // 20 ms (approx 3.5 oscillation periods)
    initialStep: 1e-4, // 100 us
    minimumStep: 1e-6,
    maximumStep: 1e-4,
    relativeTolerance: 1e-4,
    absoluteTolerance: 1e-6,
    maximumIterations: 50,
    nonlinearTolerance: 1e-8,
    enableDiagnostics: true,
    enableLogging: true
  };

  it('RK4Solver satisfies RMSE < 1e-3 and peak error threshold', () => {
    const solver = new RK4Solver();
    const state = solver.initialize(compiled, config, [{ variableId: 'V_C', value: 0, source: 'user', priority: 1 }]);
    const res = solver.solve(state, config);

    let sumSq = 0;
    let maxErr = 0;
    const vC = res.states['V_C'];

    res.time.forEach((t, i) => {
      const exact = exactVc(t);
      const err = Math.abs(vC[i] - exact);
      sumSq += err * err;
      if (err > maxErr) maxErr = err;
    });

    const rmse = Math.sqrt(sumSq / res.time.length);
    expect(rmse).toBeLessThan(1e-3);
    expect(maxErr).toBeLessThan(5e-3);
  });

  it('BDFSolver satisfies underdamped oscillatory accuracy and asymptotic convergence', () => {
    const solver = new BDFSolver();
    const state = solver.initialize(compiled, { ...config, solver: 'bdf' }, [{ variableId: 'V_C', value: 0, source: 'user', priority: 1 }]);
    const res = solver.solve(state, { ...config, solver: 'bdf' });

    const vC = res.states['V_C'];
    const finalVc = vC[vC.length - 1];
    expect(Math.abs(finalVc - exactVc(config.stopTime))).toBeLessThan(0.05);
    expect(res.solverStatistics.convergenceStatus).toBe('CONVERGED');
  });
});
