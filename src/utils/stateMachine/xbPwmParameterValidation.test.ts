import { describe, expect, it } from 'vitest';
import type { SemanticVariable } from './smSemanticModel';
import { DEFAULT_XB_EMBEDDED_LIMITS } from './xbEmbeddedProfile';
import type { XBParameterValue, XBPersistedModelV1, XBTargetCapabilities } from './xbModel';
import { validateXBModel } from './xbSemanticValidator';
import { setXBConformanceStatus } from './xbConformanceStatus';

/*
 * PWM / SVPWM period parameters: Ts (SVPWM_CORE, SVPWM_GATE_GENERATOR, SVPWM_MODULATOR) and frequency
 * (PWM_GENERATOR, THREE_PHASE_PWM) must be finite and > 0 when present. An absent parameter takes the kernel default.
 */

const target: XBTargetCapabilities = {
  supportsFloat16: false,
  supportsFloat32: true,
  supportsFloat64: false,
  supportsMathLibrary: false,
  maxVectorLength: 8,
  maxMatrixDimension: 4,
  embeddedLimits: DEFAULT_XB_EMBEDDED_LIMITS,
};

const variables: Readonly<Record<string, SemanticVariable>> = {
  speed: { id: 'speed', name: 'speed', cName: 'speed', type: 'float', initialValue: 0 },
};

const PERIOD_BLOCKS: ReadonlyArray<readonly [string, string]> = [
  ['SVPWM_CORE', 'Ts'],
  ['SVPWM_GATE_GENERATOR', 'Ts'],
  ['SVPWM_MODULATOR', 'Ts'],
  ['PWM_GENERATOR', 'frequency'],
  ['THREE_PHASE_PWM', 'frequency'],
];

const modelWith = (type: string, parameters: Record<string, XBParameterValue>): XBPersistedModelV1 => ({
  schemaVersion: 1,
  nodes: [{ id: 'pwm', type, parameters: { inputs: [], outputs: [], ...parameters } }],
  edges: [],
  mappings: [],
  solver: { kind: 'euler', stepSeconds: 0.00001 },
  policy: { memory: 'reset', numericFault: 'escalate' },
});

const parameterCodes = (input: XBPersistedModelV1): string[] =>
  validateXBModel(input, variables, target)
    .map((diagnostic) => diagnostic.code)
    .filter((code) => code === 'XB_PARAMETER_OUT_OF_RANGE');

describe('XB_PARAMETER_OUT_OF_RANGE for PWM period parameters', () => {
  for (const [type, key] of PERIOD_BLOCKS) {
    describe(type, () => {
      it.each([
        ['zero', 0],
        ['negative', -1],
        ['NaN', Number.NaN],
        ['Infinity', Number.POSITIVE_INFINITY],
        ['non-numeric string', 'fast'],
      ])('rejects %s', (_label, value) => {
        setXBConformanceStatus('T10-C99-DISCONTINUOUS', 'PASS');
        expect(parameterCodes(modelWith(type, { [key]: value as XBParameterValue }))).toEqual(['XB_PARAMETER_OUT_OF_RANGE']);
      });

      it('accepts a positive value and an absent parameter (kernel default)', () => {
        setXBConformanceStatus('T10-C99-DISCONTINUOUS', 'PASS');
        expect(parameterCodes(modelWith(type, { [key]: key === 'Ts' ? 0.0001 : 5000 }))).toEqual([]);
        expect(parameterCodes(modelWith(type, {}))).toEqual([]);
      });
    });
  }

  it('does not add a parameter rule to SWITCHING_TIME_CALCULATOR, whose Ts comes from an input port', () => {
    setXBConformanceStatus('T10-C99-DISCONTINUOUS', 'PASS');
    expect(parameterCodes(modelWith('SWITCHING_TIME_CALCULATOR', { Ts: 0 }))).toEqual([]);
  });
});
