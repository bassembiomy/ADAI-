import { describe, it, expect } from 'vitest';
import {
  fitRSM,
  fitGMDH,
  fitTaguchi,
  fDistPValue,
  tDistCritical
} from './statistics';

describe('DOE Statistical Engine - Analytical Oracles and Invariants', () => {
  describe('RSM Mathematical Correctness', () => {
    it('accurately recovers known linear model coefficients without interaction', () => {
      // Y = 0 + 2*X
      const linearData = [
        [0, 0],
        [1, 2],
        [2, 4],
        [3, 6],
        [4, 8],
        [5, 10]
      ];
      const result = fitRSM({
        headers: ['X', 'Y'],
        data: linearData
      });

      expect(result.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
      expect(result.details?.physicalCoefficients).toBeDefined();
      const coeffs = result.details!.physicalCoefficients as number[];
      // Beta[0] = intercept ≈ 0, Beta[1] = X coeff ≈ 2, Beta[2] = X^2 coeff ≈ 0
      expect(coeffs[0]).toBeCloseTo(0, 4);
      expect(coeffs[1]).toBeCloseTo(2, 4);
      expect(coeffs[2]).toBeCloseTo(0, 4);

      expect(result.rSquared).toBeCloseTo(1.0, 5);
      expect(result.rmse).toBeCloseTo(0.0, 5);
      expect(result.deployment?.modelType).toBe('RSM');
      expect(result.deployment?.schemaVersion).toBe(1);
    });

    it('recovers known full quadratic surface with interaction', () => {
      // True equation: Y = 5.0 + 2.0*X1 - 3.0*X2 + 1.5*X1^2 + 0.8*X2^2 + 2.5*X1*X2
      const factors: [number, number][] = [
        [-1, -1], [0, -1], [1, -1],
        [-1,  0], [0,  0], [1,  0],
        [-1,  1], [0,  1], [1,  1],
        [-1.414, 0], [1.414, 0], [0, -1.414], [0, 1.414] // CCD points
      ];

      const data = factors.map(([x1, x2]) => {
        const y = 5.0 + 2.0 * x1 - 3.0 * x2 + 1.5 * x1 * x1 + 0.8 * x2 * x2 + 2.5 * x1 * x2;
        return [x1, x2, y];
      });

      const result = fitRSM({
        headers: ['X1', 'X2', 'Response'],
        data
      });

      expect(result.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
      const beta = result.details!.physicalCoefficients as number[];
      // Intercept = 5.0
      expect(beta[0]).toBeCloseTo(5.0, 2);
      // X1 = 2.0, X2 = -3.0
      expect(beta[1]).toBeCloseTo(2.0, 2);
      expect(beta[2]).toBeCloseTo(-3.0, 2);
      // X1^2 = 1.5, X2^2 = 0.8
      expect(beta[3]).toBeCloseTo(1.5, 2);
      expect(beta[4]).toBeCloseTo(0.8, 2);
      // X1*X2 = 2.5
      expect(beta[5]).toBeCloseTo(2.5, 2);

      expect(result.rSquared).toBeCloseTo(1.0, 4);
    });

    it('reports diagnostic for constant response (zero variance)', () => {
      const data = [
        [1, 10],
        [2, 10],
        [3, 10],
        [4, 10]
      ];
      const result = fitRSM({
        headers: ['X', 'Y'],
        data
      });

      expect(result.diagnostics.some(d => d.code === 'ZERO_VARIANCE_RESPONSE')).toBe(true);
    });

    it('reports diagnostic for rank-deficient or insufficient design points', () => {
      // 2 factors full quadratic requires at least 6 points; provide only 4
      const insufficient = [
        [1, 2, 10],
        [2, 3, 20],
        [3, 4, 30],
        [4, 5, 40]
      ];
      const result = fitRSM({
        headers: ['X1', 'X2', 'Y'],
        data: insufficient
      });

      expect(result.diagnostics.some(d => d.code === 'INSUFFICIENT_DEGREES_OF_FREEDOM' || d.code === 'RANK_DEFICIENT')).toBe(true);
    });

    it('rejects non-finite values in inputs', () => {
      const invalid = [
        [1, 10],
        [2, NaN],
        [3, 30]
      ];
      const result = fitRSM({
        headers: ['X', 'Y'],
        data: invalid
      });

      expect(result.diagnostics.some(d => d.code === 'NON_FINITE_INPUT')).toBe(true);
    });
  });

  describe('Taguchi Analysis and Replicate S/N Ratios', () => {
    it('computes exact S/N ratios for larger-is-better objective with replicates', () => {
      // Trial 1: values [10, 20] -> y^2 = [100, 400], mean(1/y^2) = (0.01 + 0.0025)/2 = 0.00625 -> -10*log10(0.00625) ≈ 22.0412
      // Trial 2: values [30, 40] -> y^2 = [900, 1600], mean(1/y^2) = (1/900 + 1/1600)/2 = 0.000868055 -> -10*log10(0.000868055) ≈ 30.6145
      const replicatedData = [
        [1, 10],
        [1, 20],
        [2, 30],
        [2, 40]
      ];

      const result = fitTaguchi({
        headers: ['FactorA', 'Quality'],
        data: replicatedData,
        objective: 'larger'
      });

      expect(result.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
      expect(result.deployment?.modelType).toBe('Taguchi');
      const taguchi = result.deployment!.taguchi!;
      expect(taguchi.factorLevels).toHaveLength(1);
      const factorA = taguchi.factorLevels[0];
      expect(factorA.levels[0].snr).toBeCloseTo(22.0412, 2);
      expect(factorA.levels[1].snr).toBeCloseTo(30.6145, 2);
    });

    it('computes exact S/N ratios for smaller-is-better objective', () => {
      // Trial: values [2, 4] -> mean(y^2) = (4 + 16)/2 = 10 -> -10*log10(10) = -10.0 dB
      const data = [
        [1, 2],
        [1, 4],
        [2, 1],
        [2, 3]
      ];

      const result = fitTaguchi({
        headers: ['FactorA', 'Defects'],
        data,
        objective: 'smaller'
      });

      const snr1 = result.deployment!.taguchi!.factorLevels[0].levels[0].snr!;
      expect(snr1).toBeCloseTo(-10.0, 2);
    });

    it('computes exact S/N ratios for nominal-is-best and target objectives', () => {
      const data = [
        [1, 9.8],
        [1, 10.2],
        [2, 19.5],
        [2, 20.5]
      ];

      const resNominal = fitTaguchi({
        headers: ['F1', 'Y'],
        data,
        objective: 'nominal'
      });
      expect(resNominal.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);

      const resTarget = fitTaguchi({
        headers: ['F1', 'Y'],
        data,
        objective: 'target',
        targetValue: 10.0
      });
      expect(resTarget.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
    });
  });

  describe('GMDH Polynomial Network Fit', () => {
    it('fits polynomial network and preserves multi-layer deployment model', () => {
      const data: number[][] = [];
      for (let i = 0; i < 20; i++) {
        const x1 = i * 0.5;
        const x2 = (i % 5) * 1.0;
        const y = 2.0 + 1.5 * x1 - 0.7 * x2 + 0.1 * x1 * x2;
        data.push([x1, x2, y]);
      }

      const result = fitGMDH({
        headers: ['X1', 'X2', 'Y'],
        data,
        polynomialOrder: 2,
        maxLayers: 4
      });

      expect(result.diagnostics.filter(d => d.severity === 'error')).toHaveLength(0);
      expect(result.deployment?.modelType).toBe('GMDH');
      expect(result.deployment?.gmdh?.layers.length).toBeGreaterThan(0);
      expect(result.rSquared).toBeGreaterThan(0.8);
    });
  });

  describe('Statistical Distribution Helpers', () => {
    it('computes accurate F-distribution p-values and critical t-values', () => {
      // F(1, 10) = 4.96 has p ≈ 0.05
      const p = fDistPValue(4.9646, 1, 10);
      expect(p).toBeCloseTo(0.05, 2);

      // t(10, 0.05 two-tailed) ≈ 2.228
      const tc = tDistCritical(10, 0.05);
      expect(tc).toBeCloseTo(2.228, 2);
    });
  });
});
