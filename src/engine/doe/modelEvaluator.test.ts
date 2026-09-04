import { describe, it, expect } from 'vitest';
import { evaluateDOEModel, evaluateLegacyDOEEquation } from './modelEvaluator';
import { fitRSM, fitGMDH, fitTaguchi } from './statistics';
import { createXBridgesDOEBlock, createVLabDOEBlock } from './integration';
import type { DOEDeploymentModel } from './types';

describe('DOE Model Evaluator and Runtime Parity', () => {
  describe('RSM Evaluation and Parity', () => {
    const rawData = [
      [-1, -1, 3.2],
      [0, -1, 5.1],
      [1, -1, 8.9],
      [-1, 0, 4.4],
      [0, 0, 7.0],
      [1, 0, 11.2],
      [-1, 1, 6.5],
      [0, 1, 9.8],
      [1, 1, 14.8],
      [-1.414, 0, 3.8],
      [1.414, 0, 13.5],
      [0, -1.414, 4.6],
      [0, 1.414, 11.9]
    ];
    const headers = ['Speed', 'Feed', 'Yield'];
    const rsmResult = fitRSM({ headers, data: rawData });
    const deployment = rsmResult.deployment!;

    it('evaluates RSM with exact parity against engine predictions for all training points', () => {
      expect(deployment).toBeDefined();
      expect(deployment.modelType).toBe('RSM');

      for (let i = 0; i < rawData.length; i++) {
        const ins = [rawData[i][0], rawData[i][1]];
        const evalOutput = evaluateDOEModel(deployment, ins);
        const enginePred = rsmResult.predictions![i];
        expect(evalOutput).toBeCloseTo(enginePred, 6);
      }
    });

    it('handles negative and zero inputs correctly', () => {
      const zeroOutput = evaluateDOEModel(deployment, [0, 0]);
      expect(Number.isFinite(zeroOutput)).toBe(true);
      expect(zeroOutput).toBeCloseTo(deployment.rsm!.intercept, 4);

      const negOutput = evaluateDOEModel(deployment, [-1.5, -2.0]);
      expect(Number.isFinite(negOutput)).toBe(true);
    });
  });

  describe('GMDH Evaluation and Parity', () => {
    const rawData: number[][] = [];
    for (let i = 0; i < 20; i++) {
      const x1 = i * 0.4;
      const x2 = (i % 4) * 1.5;
      const y = 3.0 + 1.2 * x1 - 0.5 * x2 + 0.2 * x1 * x2;
      rawData.push([x1, x2, y]);
    }
    const headers = ['Pressure', 'Temp', 'Flow'];
    const gmdhResult = fitGMDH({ headers, data: rawData, polynomialOrder: 2, maxLayers: 3 });
    const deployment = gmdhResult.deployment!;

    it('evaluates GMDH with exact parity against engine predictions', () => {
      expect(deployment.modelType).toBe('GMDH');

      for (let i = 0; i < rawData.length; i++) {
        const ins = [rawData[i][0], rawData[i][1]];
        const evalOutput = evaluateDOEModel(deployment, ins);
        const enginePred = gmdhResult.predictions![i];
        expect(evalOutput).toBeCloseTo(enginePred, 4);
      }
    });

    it('throws typed error on malformed or missing GMDH layers', () => {
      const corruptDeployment: any = {
        ...deployment,
        gmdh: { polyOrder: 2, layers: [] }
      };
      expect(() => evaluateDOEModel(corruptDeployment, [1, 2])).toThrowError(/layers/i);
    });
  });

  describe('Taguchi Evaluation and Level Selection', () => {
    const rawData = [
      [1, 10, 100],
      [1, 20, 120],
      [2, 10, 140],
      [2, 20, 160]
    ];
    const headers = ['Pressure', 'Temp', 'Strength'];
    const taguchiResult = fitTaguchi({ headers, data: rawData, objective: 'larger' });
    const deployment = taguchiResult.deployment!;

    it('evaluates Taguchi with exact parity against engine predictions', () => {
      expect(deployment.modelType).toBe('Taguchi');

      for (let i = 0; i < rawData.length; i++) {
        const ins = [rawData[i][0], rawData[i][1]];
        const evalOutput = evaluateDOEModel(deployment, ins);
        const enginePred = taguchiResult.predictions![i];
        expect(evalOutput).toBeCloseTo(enginePred, 6);
      }
    });

    it('selects nearest factor level when inputs fall between levels', () => {
      // Pressure level 1 = 1, level 2 = 2. Input 1.2 is closest to 1.
      const outNear1 = evaluateDOEModel(deployment, [1.2, 11]);
      const outAt1 = evaluateDOEModel(deployment, [1.0, 10]);
      expect(outNear1).toBeCloseTo(outAt1, 6);
    });
  });

  describe('Security and Injection Prevention', () => {
    it('rejects code injection strings in legacy fallback equations', () => {
      const maliciousEquations = [
        'process.exit(1)',
        'require("child_process")',
        'global.constructor.constructor("return 1")()',
        'function() { while(true){} }',
        'eval("5 + 5")'
      ];

      for (const eq of maliciousEquations) {
        expect(() => evaluateLegacyDOEEquation(eq, ['X1'], [1])).toThrowError(/injection|invalid/i);
      }
    });

    it('safely evaluates benign legacy equations', () => {
      const eq = '12.5 + 2.4 * X1 - 1.1 * X2 + 0.5 * X1^2';
      const val = evaluateLegacyDOEEquation(eq, ['X1', 'X2'], [2, 3]);
      // 12.5 + 4.8 - 3.3 + 2.0 = 16.0
      expect(val).toBeCloseTo(16.0, 2);
    });
  });
});
