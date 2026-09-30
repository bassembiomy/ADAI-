import { describe, expect, it } from 'vitest';
import { blockEquations } from './vlabEquations';
import type { EquationContext } from './types';

interface PmsmOverrides {
  across?: number[];
  branch?: number[];
  dBranch?: number[];
  state?: number[];
  dState?: number[];
  params?: Record<string, number>;
  gridFrequency?: number;
}

const residuals = (overrides: PmsmOverrides = {}) => {
  const context: EquationContext = {
    dt: 0.001,
    time: 0,
    parameters: overrides.gridFrequency === undefined ? {} : { grid_freq: overrides.gridFrequency },
    prevStates: [],
    states: [],
    stateDerivatives: []
  };

  return blockEquations.pmsm({
    across: overrides.across ?? [10, -5, -5, 0, 100],
    dAcross: [0, 0, 0, 0, 0],
    branch: overrides.branch ?? [1, 1.2320508075688772, -2.232050807568877, 0],
    dBranch: overrides.dBranch ?? [2, -1, -1, 0],
    state: overrides.state ?? [0, 100],
    dState: overrides.dState ?? [100, 3],
    params: overrides.params ?? {
      Rs: 0.1,
      pole_pairs: 4,
      Ld: 0.005,
      Lq: 0.006,
      flux: 0.1,
      J: 0.02,
      B: 0.002
    },
    ctx: context,
    ports: ['a', 'b', 'c', 'n', 'r'],
    nodeId: 'pmsm'
  });
};

describe('PMSM rotor-fixed dq model', () => {
  it('uses Ld and Lq with branch-current derivatives', () => {
    const baseline = residuals();
    const changedLd = residuals({
      params: { Rs: 0.1, pole_pairs: 4, Ld: 0.01, Lq: 0.006, flux: 0.1, J: 0.02, B: 0.002 }
    });
    const changedLq = residuals({
      dBranch: [0, 1, -1, 0],
      params: { Rs: 0.1, pole_pairs: 4, Ld: 0.005, Lq: 0.012, flux: 0.1, J: 0.02, B: 0.002 }
    });
    const baselineQ = residuals({ dBranch: [0, 1, -1, 0] });

    expect(changedLd[0]).not.toBeCloseTo(baseline[0]);
    expect(changedLq[1]).not.toBeCloseTo(baselineQ[1]);
  });

  it('uses permanent-magnet flux and rotor speed in q-axis back-EMF', () => {
    const lowFlux = residuals({
      across: [0, 0, 0, 0, 100],
      branch: [0, 0, 0, 0],
      dBranch: [0, 0, 0, 0],
      params: { Rs: 0.1, pole_pairs: 4, Ld: 0.005, Lq: 0.005, flux: 0.05, J: 0.02, B: 0.002 }
    });
    const highFlux = residuals({
      across: [0, 0, 0, 0, 100],
      branch: [0, 0, 0, 0],
      dBranch: [0, 0, 0, 0],
      params: { Rs: 0.1, pole_pairs: 4, Ld: 0.005, Lq: 0.005, flux: 0.1, J: 0.02, B: 0.002 }
    });

    expect(highFlux[1]).not.toBeCloseTo(lowFlux[1]);
  });

  it('computes torque from dq currents, flux, and saliency', () => {
    const surfacePmsm = residuals({
      params: { Rs: 0.1, pole_pairs: 4, Ld: 0.005, Lq: 0.005, flux: 0.1, J: 0.02, B: 0.002 }
    });
    const salientPmsm = residuals({
      params: { Rs: 0.1, pole_pairs: 4, Ld: 0.009, Lq: 0.005, flux: 0.1, J: 0.02, B: 0.002 }
    });
    const strongerMagnets = residuals({
      params: { Rs: 0.1, pole_pairs: 4, Ld: 0.005, Lq: 0.005, flux: 0.2, J: 0.02, B: 0.002 }
    });

    expect(salientPmsm[5]).not.toBeCloseTo(surfacePmsm[5]);
    expect(strongerMagnets[5]).not.toBeCloseTo(surfacePmsm[5]);
  });

  it('uses rotor angle for the abc-to-dq transform', () => {
    const angleZero = residuals({ state: [0, 100] });
    const quarterElectricalTurn = residuals({ state: [Math.PI / 8, 100] });

    expect(quarterElectricalTurn.slice(0, 2)).not.toEqual(angleZero.slice(0, 2));
  });

  it('does not depend on a global grid-frequency fallback', () => {
    expect(residuals({ gridFrequency: 100 })).toEqual(residuals({ gridFrequency: 1000 }));
  });

  it('responds to source frequency through the generated phase voltages', () => {
    const sourceVoltages = (frequency: number) => {
      const sourceResiduals = blockEquations.three_phase_source({
        across: [0, 0, 0],
        dAcross: [0, 0, 0],
        branch: [0, 0, 0],
        dBranch: [0, 0, 0],
        state: [],
        dState: [],
        params: { Vrms: 400, f: frequency },
        ctx: {
          dt: 0.001,
          time: 0.003,
          parameters: {},
          prevStates: [],
          states: [],
          stateDerivatives: []
        },
        ports: ['a', 'b', 'c'],
        nodeId: 'source'
      });
      return sourceResiduals.map(value => -value);
    };

    const at25Hz = residuals({
      across: [...sourceVoltages(25), 0, 0],
      branch: [0, 0, 0, 0],
      dBranch: [0, 0, 0, 0],
      state: [0, 0],
      dState: [0, 0]
    });
    const at75Hz = residuals({
      across: [...sourceVoltages(75), 0, 0],
      branch: [0, 0, 0, 0],
      dBranch: [0, 0, 0, 0],
      state: [0, 0],
      dState: [0, 0]
    });

    expect(at25Hz.slice(0, 3)).not.toEqual(at75Hz.slice(0, 3));
  });
});
