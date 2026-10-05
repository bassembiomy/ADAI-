import { describe, expect, it } from 'vitest';
import { blockEquations } from './vlabEquations';
import type { EquationContext } from './types';

const context: EquationContext = {
  dt: 0.001,
  time: 0,
  parameters: {},
  prevStates: [],
  states: [],
  stateDerivatives: []
};

interface BldcOverrides {
  across?: number[];
  branch?: number[];
  dBranch?: number[];
  state?: number[];
  dState?: number[];
  params?: Record<string, number>;
}

const residuals = (overrides: BldcOverrides = {}) => blockEquations.bldc_motor({
  across: overrides.across ?? [24, -12, -12, 0, 100],
  dAcross: [0, 0, 0, 0, 0],
  branch: overrides.branch ?? [2, -1, -1, 0],
  dBranch: overrides.dBranch ?? [10, -5, -5, 0],
  state: overrides.state ?? [Math.PI / 8, 100],
  dState: overrides.dState ?? [100, 3],
  params: overrides.params ?? { Rs: 0.2, Ls: 0.002, Ke: 0.1, Kt: 0.1, P: 4, J: 0.02, B: 0.002 },
  ctx: context,
  ports: ['a', 'b', 'c', 'g', 'r'],
  nodeId: 'bldc'
});

describe('BLDC Motor physical phase model', () => {
  it('uses phase inductance in every electrical residual', () => {
    const lowInductance = residuals({ params: { Rs: 0.2, Ls: 0.002, Ke: 0.1, Kt: 0.1, P: 4, J: 0.02, B: 0.002 } });
    const highInductance = residuals({ params: { Rs: 0.2, Ls: 0.004, Ke: 0.1, Kt: 0.1, P: 4, J: 0.02, B: 0.002 } });

    expect(highInductance[0]).not.toBeCloseTo(lowInductance[0]);
    expect(highInductance[1]).not.toBeCloseTo(lowInductance[1]);
    expect(highInductance[2]).not.toBeCloseTo(lowInductance[2]);
  });

  it('changes trapezoidal phase back-EMF with rotor angle', () => {
    const angleZero = residuals({
      across: [0, 0, 0, 0, 100],
      branch: [0, 0, 0, 0],
      dBranch: [0, 0, 0, 0],
      state: [0, 100]
    });
    const angleShifted = residuals({
      across: [0, 0, 0, 0, 100],
      branch: [0, 0, 0, 0],
      dBranch: [0, 0, 0, 0],
      state: [Math.PI / 24, 100]
    });

    expect(angleZero.slice(0, 3)).not.toEqual(angleShifted.slice(0, 3));
    expect(angleZero.slice(0, 3).every(Number.isFinite)).toBe(true);
    expect(angleShifted.slice(0, 3).every(Number.isFinite)).toBe(true);
  });

  it('uses Kt for torque independently from Ke', () => {
    const baseline = residuals();
    const changedKt = residuals({
      params: { Rs: 0.2, Ls: 0.002, Ke: 0.1, Kt: 0.2, P: 4, J: 0.02, B: 0.002 }
    });
    const changedKe = residuals({
      params: { Rs: 0.2, Ls: 0.002, Ke: 0.2, Kt: 0.1, P: 4, J: 0.02, B: 0.002 }
    });

    expect(changedKt.slice(0, 3)).toEqual(baseline.slice(0, 3));
    expect(changedKt[5]).not.toBeCloseTo(baseline[5]);
    expect(changedKe.slice(0, 3)).not.toEqual(baseline.slice(0, 3));
    expect(changedKe[5]).toBeCloseTo(baseline[5]);
  });
});
