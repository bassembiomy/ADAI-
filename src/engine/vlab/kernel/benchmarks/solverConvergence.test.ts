// src/engine/vlab/kernel/benchmarks/solverConvergence.test.ts
import { describe, it, expect } from 'vitest';
import { EquationAssembler } from '../EquationAssembler';
import { RK4Solver } from '../solvers/RK4Solver';
import { PhysicalSystemIR, SolverConfiguration } from '../types';

describe('Timestep Convergence Testing (h, h/2, h/4)', () => {
  const assembler = new EquationAssembler();
  const rlcIR: PhysicalSystemIR = {
    id: 'rlc_conv',
    domains: ['electrical'],
    components: [],
    nodes: [],
    states: [
      { id: 'vc', name: 'V_C', symbol: 'V_C', unit: 'V', sourceComponentId: 'c1', preferred: true },
      { id: 'il', name: 'I_L', symbol: 'I_L', unit: 'A', sourceComponentId: 'l1', preferred: true }
    ],
    algebraicVariables: [],
    parameters: [
      { id: 'r', name: 'resistance', value: 100, componentId: 'r1' },
      { id: 'l', name: 'inductance', value: 0.1, componentId: 'l1' },
      { id: 'c', name: 'capacitance', value: 10e-6, componentId: 'c1' },
      { id: 'vs', name: 'voltage', value: 10, componentId: 'vs1' }
    ],
    equations: [],
    connections: [],
    references: [],
    metadata: { nodeCount: 3, stateCount: 2, algebraicCount: 0, hasNonlinearities: false, isStiff: false, isDAE: false }
  };

  const compiled = assembler.assembleRLC(rlcIR);

  const exactVc = (t: number) => {
    if (t <= 0) return 0;
    const omega0 = 1000;
    const zeta = 0.5;
    const omegad = 866.0254;
    return 10 * (1 - Math.exp(-zeta * omega0 * t) * (Math.cos(omegad * t) + (zeta / Math.sqrt(1 - zeta * zeta)) * Math.sin(omegad * t)));
  };

  it('RK4 demonstrates truncation error reduction with step halving across trajectory', () => {
    const solver = new RK4Solver();
    const baseConfig: SolverConfiguration = {
      id: 'sc_conv',
      solver: 'rk4',
      startTime: 0,
      stopTime: 0.01,
      initialStep: 5e-4,
      minimumStep: 1e-6,
      maximumStep: 5e-4,
      relativeTolerance: 1e-4,
      absoluteTolerance: 1e-6,
      maximumIterations: 50,
      nonlinearTolerance: 1e-8,
      enableDiagnostics: true,
      enableLogging: true
    };

    const calcRmse = (stepSize: number) => {
      const state = solver.initialize(compiled, { ...baseConfig, initialStep: stepSize }, []);
      const res = solver.solve(state, { ...baseConfig, initialStep: stepSize });
      let sumSq = 0;
      res.time.forEach((t, i) => {
        const err = res.states['V_C'][i] - exactVc(t);
        sumSq += err * err;
      });
      return Math.sqrt(sumSq / res.time.length);
    };

    const rmse1 = calcRmse(5e-4); // h = 500 us
    const rmse2 = calcRmse(2.5e-4); // h = 250 us
    const rmse3 = calcRmse(1.25e-4); // h = 125 us

    expect(rmse2).toBeLessThan(rmse1);
    expect(rmse3).toBeLessThan(rmse2);
    // Verify 4th order scaling: rmse1 / rmse2 approx (2)^4 = 16
    expect(rmse1 / rmse2).toBeGreaterThan(10);
  });
});
