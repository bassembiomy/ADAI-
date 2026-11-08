/**
 * Acceptance tests — simulation and embedded code generation give the same numbers (review finding R8, R9).
 * Plan: docs/superpowers/plans/2026-11-08-xbridges-final-simulink-review.md
 *
 * For each code-generation-capable block, a unit-constant input is run
 *  (a) in the simulation engine with the discrete solver, sampling the output at t = k*Ts, and
 *  (b) in the embedded interpreter (the reference for the generated C), one tick per Ts,
 * and the two sequences must be equal. Control ports with a default value (PID Enable = 1, Reset = 0) may be left
 * unconnected in both paths (R9): the embedded path uses the port default instead of rejecting the model.
 */
import { describe, expect, it } from 'vitest';
import { BLOCK_LIBRARY } from '../../engine/xbridges/BlockDefinitions';
import { XbridgesEngine } from '../../engine/xbridges/XbridgesEngine';
import { Solvers } from '../../engine/xbridges/Solvers';
import { DEFAULT_XB_EMBEDDED_LIMITS } from './xbEmbeddedProfile';
import type { XBPersistedModelV1, XBTargetCapabilities } from './xbModel';
import { buildXBSemanticModel } from './xbSemanticBuilder';
import { validateXBModel } from './xbSemanticValidator';
import { createXBRuntime, stepXBState } from './xbInterpreter';

const target: XBTargetCapabilities = {
  supportsFloat16: false,
  supportsFloat32: true,
  supportsFloat64: true,
  supportsMathLibrary: true,
  maxVectorLength: 16,
  maxMatrixDimension: 8,
  embeddedLimits: DEFAULT_XB_EMBEDDED_LIMITS,
};
const Ts = 0.1;
const K = 6;

const simulate = (type: string, params: Record<string, unknown>, inPort: string, outPort: string): number[] => {
  const values: number[] = [];
  for (let k = 0; k < K; k++) {
    const e = new XbridgesEngine({
      blocks: [BLOCK_LIBRARY.Constant('k', { value: 1 }), BLOCK_LIBRARY[type]('b', params), BLOCK_LIBRARY.TERMINATOR('t', {})],
      connections: [
        { sourceBlock: 'k', sourcePort: 'out', targetBlock: 'b', targetPort: inPort },
        { sourceBlock: 'b', sourcePort: outPort, targetBlock: 't', targetPort: 'u' },
      ],
    } as any);
    Solvers.runFixedStep(e, { solver: 'discrete', startTime: 0, stopTime: k * Ts, fixedStep: Ts } as any);
    values.push(Number(e.getSignalValue('b', outPort)));
  }
  return values;
};

const embeddedModel = (type: string, params: Record<string, unknown>, inPort: string): XBPersistedModelV1 => {
  const blk = BLOCK_LIBRARY[type]('b', params);
  const kb = BLOCK_LIBRARY.Constant('k', { value: 1 });
  const port = (p: any) => ({ id: p.id, direction: p.direction, shape: 'scalar', dataType: 'float64' });
  return {
    schemaVersion: 1,
    nodes: [
      { id: 'k', type: 'Constant', parameters: { ...(kb.params as any), inputs: [], outputs: kb.outputs.map(port) } },
      { id: 'b', type, parameters: { ...(blk.params as any), inputs: blk.inputs.map(port), outputs: blk.outputs.map(port) } },
    ],
    edges: [{ id: 'e', sourceNodeId: 'k', sourcePortId: 'out', targetNodeId: 'b', targetPortId: inPort }],
    mappings: [],
    solver: { kind: 'discrete', stepSeconds: Ts },
    policy: { memory: 'reset', numericFault: 'escalate' },
  };
};

const embedded = (type: string, params: Record<string, unknown>, inPort: string, outPort: string): number[] => {
  const model = embeddedModel(type, params, inPort);
  expect(validateXBModel(model, {}, target).filter((d) => d.severity === 'error')).toEqual([]);
  const result = buildXBSemanticModel({ stateId: 's', model, variables: {}, target, baseTickMs: Ts * 1000 });
  expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  const runtime = createXBRuntime(result.ir!);
  const values: number[] = [];
  for (let k = 0; k < K; k++) {
    stepXBState(runtime, {});
    values.push(Number(runtime.signals[`b:${outPort}`][0]));
  }
  return values;
};

const round = (xs: number[]) => xs.map((x) => Math.round(x * 1e9) / 1e9);

describe('R8 discrete integrator: simulation = embedded for every method (Simulink difference equations)', () => {
  const cases: [string, number[]][] = [
    ['forward_euler', [0, 0.1, 0.2, 0.3, 0.4, 0.5]],
    ['backward_euler', [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]],
    ['tustin', [0.05, 0.15, 0.25, 0.35, 0.45, 0.55]],
  ];
  it.each(cases)('%s', (method, expected) => {
    const params = { sample_time: Ts, method };
    expect(round(simulate('INTEGRATOR_DISCRETE', params, 'u', 'y'))).toEqual(expected);
    expect(round(embedded('INTEGRATOR_DISCRETE', params, 'u', 'y'))).toEqual(expected);
  });
});

describe('R9 PID with unconnected Enable/Reset: embedded uses the port defaults like the simulation', () => {
  it.each([
    ['PI', { Kp: 1, Ki: 2, Kd: 0, mode: 'PI', sampleTime: Ts }],
    ['PID', { Kp: 1, Ki: 2, Kd: 0.05, N: 10, mode: 'PID', sampleTime: Ts }],
  ])('PID_BASIC %s', (_name, params) => {
    const sim = round(simulate('PID_BASIC', params, 'e', 'u'));
    expect(sim[0]).not.toBe(0);
    expect(round(embedded('PID_BASIC', params, 'e', 'u'))).toEqual(sim);
  });
});

describe('parity guards (already aligned)', () => {
  it('UNIT_DELAY', () => {
    const params = { sampleTime: Ts };
    expect(round(embedded('UNIT_DELAY', params, 'u', 'y'))).toEqual(round(simulate('UNIT_DELAY', params, 'u', 'y')));
  });
});
