import { describe, it, expect } from 'vitest';
import {
  createXBridgesDOEBlock,
  createVLabDOEBlock,
  validateDOEModelResult,
  serializeDOEDeploymentModel,
  deserializeDOEDeploymentModel
} from './integration';
import { BLOCK_LIBRARY } from '../xbridges/BlockDefinitions';
import { blockEquations } from '../vlab/vlabEquations';
import type {
  DOEModelResult,
  DOEDeploymentModel,
  RSMDeployment,
  GMDHDeployment,
  TaguchiDeployment
} from './types';

describe('DOE Canonical Model and Integration Factories', () => {
  const mockRSMResult: DOEModelResult = {
    modelType: 'RSM',
    factorNames: ['Speed', 'Feed', 'Depth'],
    responseName: 'Roughness',
    equation: 'Y = 12.5 + 1.2*Speed - 0.5*Feed + 0.1*Speed*Feed',
    diagnostics: [],
    deployment: {
      schemaVersion: 1,
      modelType: 'RSM',
      factorOrder: ['Speed', 'Feed', 'Depth'],
      responseName: 'Roughness',
      trainingRowCount: 15,
      metrics: {
        rSquared: 0.96,
        adjustedRSquared: 0.94,
        rmse: 0.15
      },
      factorRanges: {
        Speed: { min: 100, max: 500 },
        Feed: { min: 0.1, max: 0.5 },
        Depth: { min: 0.5, max: 2.5 }
      },
      rsm: {
        intercept: 12.5,
        terms: [
          { name: 'Speed', factors: [0], powers: [1], coeff: 1.2 },
          { name: 'Feed', factors: [1], powers: [1], coeff: -0.5 },
          { name: 'Speed*Feed', factors: [0, 1], powers: [1, 1], coeff: 0.1 }
        ]
      }
    }
  };

  const mockGMDHResult: DOEModelResult = {
    modelType: 'GMDH',
    factorNames: ['Temp', 'Pressure'],
    responseName: 'Yield',
    equation: 'Y = f_GMDH(Temp, Pressure)',
    diagnostics: [],
    deployment: {
      schemaVersion: 1,
      modelType: 'GMDH',
      factorOrder: ['Temp', 'Pressure'],
      responseName: 'Yield',
      trainingRowCount: 20,
      metrics: {
        rSquared: 0.98,
        adjustedRSquared: 0.97,
        rmse: 0.08
      },
      gmdh: {
        polyOrder: 2,
        layers: [
          [
            {
              inputs: [0, 1],
              coeffs: [1.0, 0.5, 0.2, 0.05, 0.02, 0.01]
            }
          ]
        ]
      }
    }
  };

  const mockTaguchiResult: DOEModelResult = {
    modelType: 'Taguchi',
    factorNames: ['Voltage', 'Time'],
    responseName: 'Strength',
    equation: 'Y = f_Taguchi(Voltage, Time)',
    diagnostics: [],
    deployment: {
      schemaVersion: 1,
      modelType: 'Taguchi',
      factorOrder: ['Voltage', 'Time'],
      responseName: 'Strength',
      trainingRowCount: 9,
      metrics: {
        rSquared: 0.91,
        rmse: 0.4
      },
      taguchi: {
        grandMean: 45.2,
        factorLevels: [
          {
            factorName: 'Voltage',
            levels: [
              { level: 110, meanY: 42.0, snr: 32.4 },
              { level: 220, meanY: 48.4, snr: 33.7 }
            ]
          },
          {
            factorName: 'Time',
            levels: [
              { level: 10, meanY: 44.1, snr: 32.8 },
              { level: 20, meanY: 46.3, snr: 33.3 }
            ]
          }
        ]
      }
    }
  };

  it('generates correct X-Bridges DOE_MODEL block with ordered ports and canonical payload', () => {
    const block = createXBridgesDOEBlock(mockRSMResult);
    expect('data' in block).toBe(true);
    if ('data' in block) {
      expect(block.data.inputs.map((p: any) => p.name)).toEqual(mockRSMResult.factorNames);
      expect(block.data.outputs[0].name).toBe(mockRSMResult.responseName);
      expect(block.data.type).toBe('DOE_MODEL');
      expect(block.data.modelType).toBe('RSM');
      expect(block.data.deploymentModel).toBeDefined();
      expect(block.data.deploymentModel.schemaVersion).toBe(1);
    }
  });

  it('generates correct V-Lab doe_custom block with ordered input ports and canonical payload', () => {
    const block = createVLabDOEBlock(mockRSMResult);
    expect('data' in block).toBe(true);
    if ('data' in block) {
      const inputPorts = block.data.ports.filter((p: any) => p.type === 'input');
      expect(inputPorts.map((p: any) => p.label)).toEqual(mockRSMResult.factorNames);
      const outputPorts = block.data.ports.filter((p: any) => p.type === 'output');
      expect(outputPorts.map((p: any) => p.label)).toEqual([mockRSMResult.responseName]);
      expect(block.data.type).toBe('doe_custom');
      expect(block.data.deploymentModel).toBeDefined();
    }
  });

  it('validates GMDH deployment payload contract', () => {
    const deployment = mockGMDHResult.deployment!;
    expect(deployment.schemaVersion).toBe(1);
    expect(deployment.factorOrder).toEqual(mockGMDHResult.factorNames);
    expect(deployment.modelType).toBe('GMDH');
    expect(deployment.gmdh?.layers.length).toBeGreaterThan(0);

    const xblock = createXBridgesDOEBlock(mockGMDHResult);
    const vblock = createVLabDOEBlock(mockGMDHResult);
    expect('data' in xblock).toBe(true);
    expect('data' in vblock).toBe(true);
  });

  it('validates Taguchi deployment payload contract', () => {
    const deployment = mockTaguchiResult.deployment!;
    expect(deployment.schemaVersion).toBe(1);
    expect(deployment.factorOrder).toEqual(mockTaguchiResult.factorNames);
    expect(deployment.modelType).toBe('Taguchi');
    expect(deployment.taguchi?.factorLevels.length).toBe(2);

    const xblock = createXBridgesDOEBlock(mockTaguchiResult);
    const vblock = createVLabDOEBlock(mockTaguchiResult);
    expect('data' in xblock).toBe(true);
    expect('data' in vblock).toBe(true);
  });

  it('rejects RSM terms with out-of-bounds factor indices or invalid powers', () => {
    const badRSM: any = {
      modelType: 'RSM',
      factorNames: ['X1', 'X2'],
      responseName: 'Yield',
      deployment: {
        schemaVersion: 1,
        modelType: 'RSM',
        factorOrder: ['X1', 'X2'],
        responseName: 'Yield',
        trainingRowCount: 10,
        metrics: {},
        rsm: {
          intercept: 10,
          terms: [
            { name: 'BadIndex', factors: [5], powers: [1], coeff: 2 }, // factor 5 > 1
            { name: 'BadPower', factors: [0], powers: [0], coeff: 3 }   // power 0 is not positive
          ]
        }
      }
    };
    const diags = validateDOEModelResult(badRSM);
    const codes = diags.map(d => d.code);
    expect(codes).toContain('INVALID_FACTOR_INDEX');
    expect(codes).toContain('INVALID_TERM_POWER');
  });

  it('rejects GMDH neurons with invalid input indices', () => {
    const badGMDH: any = {
      modelType: 'GMDH',
      factorNames: ['X1', 'X2'],
      responseName: 'Yield',
      deployment: {
        schemaVersion: 1,
        modelType: 'GMDH',
        factorOrder: ['X1', 'X2'],
        responseName: 'Yield',
        trainingRowCount: 10,
        metrics: {},
        gmdh: {
          polyOrder: 2,
          layers: [
            [
              { inputs: [0, 99], coeffs: [1, 2, 3, 4, 5, 6] } // 99 out of range
            ]
          ]
        }
      }
    };
    const diags = validateDOEModelResult(badGMDH);
    const codes = diags.map(d => d.code);
    expect(codes).toContain('INVALID_NEURON_INPUT');
  });

  it('rejects Taguchi models with factor level count mismatch', () => {
    const badTaguchi: any = {
      modelType: 'Taguchi',
      factorNames: ['X1', 'X2'],
      responseName: 'Yield',
      deployment: {
        schemaVersion: 1,
        modelType: 'Taguchi',
        factorOrder: ['X1', 'X2'],
        responseName: 'Yield',
        trainingRowCount: 10,
        metrics: {},
        taguchi: {
          grandMean: 20,
          factorLevels: [
            { factorName: 'X1', levels: [{ level: 1, meanY: 15 }] }
            // Missing X2
          ]
        }
      }
    };
    const diags = validateDOEModelResult(badTaguchi);
    const codes = diags.map(d => d.code);
    expect(codes).toContain('FACTOR_LEVEL_COUNT_MISMATCH');
  });

  it('rejects invalid model results with typed diagnostics instead of producing a node', () => {
    // Missing response column
    const missingResponse: any = {
      modelType: 'RSM',
      factorNames: ['X1', 'X2'],
      responseName: '',
      deployment: { ...mockRSMResult.deployment, responseName: '' }
    };
    const res1 = createXBridgesDOEBlock(missingResponse);
    expect('data' in res1).toBe(false);
    expect('diagnostics' in res1).toBe(true);
    if ('diagnostics' in res1) {
      expect(res1.diagnostics.some((d: any) => d.code === 'MISSING_RESPONSE')).toBe(true);
    }

    // Duplicate factor names
    const duplicateFactors: any = {
      modelType: 'RSM',
      factorNames: ['Speed', 'Speed'],
      responseName: 'Y',
      deployment: { ...mockRSMResult.deployment, factorOrder: ['Speed', 'Speed'], responseName: 'Y' }
    };
    const res2 = createXBridgesDOEBlock(duplicateFactors);
    expect('data' in res2).toBe(false);
    if ('diagnostics' in res2) {
      expect(res2.diagnostics.some((d: any) => d.code === 'DUPLICATE_FACTORS')).toBe(true);
    }

    // Non-finite values in deployment
    const nonFiniteRSM: any = {
      ...mockRSMResult,
      deployment: {
        ...mockRSMResult.deployment,
        rsm: {
          intercept: NaN,
          terms: []
        }
      }
    };
    const res3 = createVLabDOEBlock(nonFiniteRSM);
    expect('data' in res3).toBe(false);
    if ('diagnostics' in res3) {
      expect(res3.diagnostics.some((d: any) => d.code === 'NON_FINITE_COEFFICIENT')).toBe(true);
    }

    // Unsupported model type
    const unsupported: any = {
      modelType: 'UNSUPPORTED_ALGO',
      factorNames: ['X1'],
      responseName: 'Y'
    };
    const res4 = createXBridgesDOEBlock(unsupported);
    expect('data' in res4).toBe(false);
    if ('diagnostics' in res4) {
      expect(res4.diagnostics.some((d: any) => d.code === 'UNSUPPORTED_MODEL_TYPE')).toBe(true);
    }
  });

  it('round-trips DOEDeploymentModel through JSON serialization without data loss or function references', () => {
    const models = [mockRSMResult.deployment!, mockGMDHResult.deployment!, mockTaguchiResult.deployment!];

    for (const model of models) {
      const json = serializeDOEDeploymentModel(model);
      expect(typeof json).toBe('string');
      // Verify no functions are in JSON
      const parsedRaw = JSON.parse(json);
      expect(typeof parsedRaw).toBe('object');

      const restored = deserializeDOEDeploymentModel(json);
      expect(restored).toEqual(model);
    }
  });

  describe('Runtime Execution Contract & Fault Propagation', () => {
    it('X-Bridges DOE_MODEL returns NaN, sets error and lastFault on non-finite inputs', () => {
      const xblock = createXBridgesDOEBlock(mockRSMResult, 'doe_block_1');
      expect('data' in xblock).toBe(true);
      if (!('data' in xblock)) return;

      const blockDef = BLOCK_LIBRARY['DOE_MODEL'];
      expect(blockDef).toBeDefined();

      const instance = blockDef('doe_block_1', xblock.data.params);

      // Execute with NaN input
      const resNaN = instance.execute([NaN, 1, 2], xblock.data.params, {}, 0);
      expect(Number.isNaN(resNaN.outputs[0])).toBe(true);
      expect(resNaN.error).toBeDefined();
      expect(resNaN.error).toContain('Non-finite');
      expect(resNaN.nextState?.lastFault?.code).toBe('NON_FINITE_INPUT');

      // Execute with valid input
      const resValid = instance.execute([1, 1, 1], xblock.data.params, {}, 0);
      expect(Number.isFinite(resValid.outputs[0])).toBe(true);
      expect(resValid.error).toBeUndefined();
      expect(resValid.nextState?.lastFault).toBeNull();
    });

    it('V-Lab doe_custom evaluates residual, returns NaN and attaches _runtimeDiagnostic on failure', () => {
      const vblock = createVLabDOEBlock(mockRSMResult, 'vlab_doe_1');
      expect('data' in vblock).toBe(true);
      if (!('data' in vblock)) return;

      const doeEquation = blockEquations['doe_custom'];
      expect(doeEquation).toBeDefined();

      const params = { ...vblock.data.params };
      const ctx: any = { parameters: {} };

      // Execute with non-finite input
      const residualNaN = doeEquation({
        across: [NaN, 1, 2],
        dAcross: [0, 0, 0],
        branch: [0],
        dBranch: [0],
        state: [],
        dState: [],
        ctx,
        params,
        ports: ['in1', 'in2', 'in3', 'out'],
        nodeId: 'vlab_doe_1'
      });

      expect(Number.isNaN(residualNaN[0])).toBe(true);
      expect(params._runtimeDiagnostic).toBeDefined();
      expect(params._runtimeDiagnostic?.code).toBe('NON_FINITE_INPUT');
      expect(ctx.parameters['vlab_doe_1_fault']?.code).toBe('NON_FINITE_INPUT');

      // Execute with valid input
      const residualValid = doeEquation({
        across: [0, 0, 0],
        dAcross: [0, 0, 0],
        branch: [12.5],
        dBranch: [0],
        state: [],
        dState: [],
        ctx,
        params,
        ports: ['in1', 'in2', 'in3', 'out'],
        nodeId: 'vlab_doe_1'
      });

      expect(params._runtimeDiagnostic).toBeNull();
      // branch[0] - Y: 12.5 - 12.5 = 0
      expect(residualValid[0]).toBeCloseTo(0, 4);
    });
  });

  describe('Legacy and Production Export Compatibility', () => {
    it('successfully creates blocks when given a production wrapped result with canonicalResult', () => {
      const productionWrappedRSM: any = {
        type: 'RSM',
        modelType: 'RSM',
        canonicalResult: mockRSMResult,
        deployment: mockRSMResult.deployment,
        Beta: [12.5, 1.2, -0.5],
        headers: ['Speed', 'Feed', 'Roughness'],
        r2: 0.96
      };

      const xblock = createXBridgesDOEBlock(productionWrappedRSM);
      const vblock = createVLabDOEBlock(productionWrappedRSM);

      expect('data' in xblock).toBe(true);
      expect('data' in vblock).toBe(true);
      if ('data' in xblock) {
        expect(xblock.data.modelType).toBe('RSM');
        expect(xblock.data.inputs.map((p: any) => p.name)).toEqual(['Speed', 'Feed', 'Depth']);
      }
    });

    it('successfully synthesizes DOEDeploymentModel for legacy RSM result without canonical deployment', () => {
      const legacyRSM: any = {
        type: 'RSM',
        headers: ['Speed', 'Feed', 'Roughness'],
        Beta: [10.0, 1.5, -0.8],
        r2: 0.92,
        r2_adj: 0.90,
        rmse: 0.25
      };

      const xblock = createXBridgesDOEBlock(legacyRSM);
      const vblock = createVLabDOEBlock(legacyRSM);

      expect('data' in xblock).toBe(true);
      expect('data' in vblock).toBe(true);
      if ('data' in xblock) {
        expect(xblock.data.type).toBe('DOE_MODEL');
        expect(xblock.data.modelType).toBe('RSM');
        expect(xblock.data.deploymentModel.schemaVersion).toBe(1);
        expect(xblock.data.deploymentModel.rsm?.intercept).toBe(10.0);
        expect(xblock.data.inputs.map((p: any) => p.name)).toEqual(['Speed', 'Feed']);
        expect(xblock.data.outputs[0].name).toBe('Roughness');
      }
    });
  });
});
