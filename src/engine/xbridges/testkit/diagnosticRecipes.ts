/**
 * Diagnostic recipes (WP-13, plan section 5.2 "Diagnostics").
 *
 * One recipe per `code: '...'` literal the engine sources emit. `provoke` builds the smallest model a user could build
 * on the canvas that makes the engine emit the code; `clean` differs minimally and does not emit it. Both report the
 * diagnostics the engine returned, the major steps actually executed (`steps`) and the steps the run takes without the
 * problem (`plannedSteps`). Expected severities live in the acceptance test, never here.
 *
 * Live runs use runModel (the canvas loop; steps = samples - 1, 0 when compile refused). Batch-only codes
 * (Solvers.runFixedStep: simulation configuration, infinite stop time, unsupported solver) count steps with a wrapper
 * on the engine instance's computeOutputs (one top-level call per major step plus the final output evaluation).
 */
import { buildModel, runModel, type ModelSpec } from './model';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import type { ModelDiagnostic, SolverOptions, XModel } from '../types';

export interface DiagnosticRun { diagnostics: ModelDiagnostic[]; steps: number; plannedSteps: number }
export interface DiagnosticRecipe { provoke: () => DiagnosticRun; clean: () => DiagnosticRun; note: string }

type BlockSpec = ModelSpec['blocks'][number];

/** Live-canvas run settings: 4 full steps of 0.25 s, so a completed run has exactly 4 steps. */
interface LiveOptions { solver?: string; dt?: number; stopTime?: number; patch?: (m: XModel) => void }
const LIVE_DT = 0.25;
const LIVE_STOP = 1;

function live(spec: ModelSpec, opts: LiveOptions = {}): DiagnosticRun {
  const dt = opts.dt ?? LIVE_DT;
  const stopTime = opts.stopTime ?? LIVE_STOP;
  const model = buildModel(spec);
  opts.patch?.(model);
  const r = runModel(model, { solver: opts.solver ?? 'euler', dt, stopTime, probes: [] });
  return { diagnostics: r.diagnostics, steps: Math.max(0, r.t.length - 1), plannedSteps: Math.ceil(stopTime / dt - 1e-9) };
}

/** Batch run (Solvers.runFixedStep); steps = top-level output evaluations minus the final one. */
function batchSteps(spec: ModelSpec, options: SolverOptions): { diagnostics: ModelDiagnostic[]; steps: number } {
  const engine = new XbridgesEngine(buildModel(spec));
  let calls = 0;
  const original = engine.computeOutputs.bind(engine);
  engine.computeOutputs = ((time: number, temp?: Map<string, any>) => {
    if (temp === undefined) calls++;
    return original(time, temp);
  }) as typeof engine.computeOutputs;
  Solvers.runFixedStep(engine, options);
  return { diagnostics: [...engine.diagnostics], steps: Math.max(0, calls - 1) };
}

const VALID_BATCH: SolverOptions = { solver: 'euler', fixedStep: 0.25, startTime: 0, stopTime: 1 };
function batch(spec: ModelSpec, options: SolverOptions): DiagnosticRun {
  const planned = batchSteps(spec, VALID_BATCH).steps;
  const r = batchSteps(spec, options);
  return { diagnostics: r.diagnostics, steps: r.steps, plannedSteps: planned };
}

const konst = (id: string, value: unknown): BlockSpec => ({ id, type: 'Constant', params: { value } });
const term = (id: string): BlockSpec => ({ id, type: 'TERMINATOR' });

/** Constant -> block under test -> Terminator: every port is connected, so only the tested problem shows. */
function chain(block: BlockSpec, value: unknown = 1): ModelSpec {
  return { blocks: [konst('k', value), block, term('t')], wires: [`k.out -> ${block.id}.${INPUT_OF[block.type] ?? 'u'}`, `${block.id}.${OUTPUT_OF[block.type] ?? 'y'} -> t.u`] };
}
const INPUT_OF: Record<string, string> = { VectorDiv: 'in1', NOT: 'in', DOE_MODEL: 'in1' };
const OUTPUT_OF: Record<string, string> = { VectorDiv: 'out', NOT: 'out', DOE_MODEL: 'out' };

/** Recipe whose provoke and clean are live runs. */
function liveRecipe(note: string, p: [ModelSpec, LiveOptions?], c: [ModelSpec, LiveOptions?]): DiagnosticRecipe {
  return { note, provoke: () => live(p[0], p[1]), clean: () => live(c[0], c[1]) };
}

/** Constant -> Gain -> Terminator with an optional change on the Gain block. */
const gainChain = (gainParams: Record<string, unknown>): ModelSpec => chain({ id: 'g', type: 'GAIN', params: gainParams });

/** Unit Delay chain: Constant -> Unit Delay (sampleTime) -> Terminator. */
const delayChain = (sampleTime: unknown): ModelSpec => chain({ id: 'd', type: 'UNIT_DELAY', params: { sampleTime } });

/** Two Unit Delays in series with the given sample times. */
const twoDelays = (ts1: number, ts2: number): ModelSpec => ({
  blocks: [konst('k', 1), { id: 'd1', type: 'UNIT_DELAY', params: { sampleTime: ts1 } }, { id: 'd2', type: 'UNIT_DELAY', params: { sampleTime: ts2 } }, term('t')],
  wires: ['k.out -> d1.u', 'd1.y -> d2.u', 'd2.y -> t.u'],
});

/** Constant 1 summed with the output of a Gain that is fed back: y = 1 + gain * y (algebraic loop). */
const loopModel = (gain: number): ModelSpec => ({
  blocks: [konst('k', 1), { id: 's', type: 'Sum' }, { id: 'g', type: 'GAIN', params: { gain } }, term('t')],
  wires: ['k.out -> s.in1', 's.out -> g.u', 'g.y -> s.in2', 'g.y -> t.u'],
});

/** Integrator fed by a constant, then a Terminator (a continuous state, every port connected). */
const integratorChain = (): ModelSpec => chain({ id: 'i', type: 'INTEGRATOR' });

/** DOE_MODEL fed by a constant; `params` selects the model type and its configuration. */
const doeChain = (params: Record<string, unknown>, value: unknown = 1): ModelSpec =>
  chain({ id: 'm', type: 'DOE_MODEL', params: { inputNames: ['X1'], ...params } }, value);
const DOE_RSM = { modelType: 'RSM', equation: 'X1*2' };

/** Robot-vacuum blocks with typed ports (unit, frame, data type, sample rate); the source drives one target port. */
const robotWire = (from: [string, string, string], to: [string, string, string]): ModelSpec => ({
  blocks: [{ id: 'a', type: from[0] }, { id: 'b', type: to[0] }],
  wires: [`a.${from[1]} -> b.${to[1]}`],
});

const doeFault = (note: string, params: Record<string, unknown>, value: unknown = 1): DiagnosticRecipe => ({
  note,
  provoke: () => live(doeChain(params, value)),
  clean: () => live(doeChain(DOE_RSM)),
});

/** Ports of the DIMENSION_MISMATCH recipe: no library block declares output dimensions, so a model loaded with them is patched in. */
const withDimensions = (outDims: number[], inDims: number[]) => (m: XModel): void => {
  m.blocks.find((b) => b.id === 'g1')!.outputs[0].dimensions = outDims;
  m.blocks.find((b) => b.id === 'g2')!.inputs[0].dimensions = inDims;
};
const dimensionModel = (): ModelSpec => ({
  blocks: [konst('k', 1), { id: 'g1', type: 'GAIN' }, { id: 'g2', type: 'GAIN' }, term('t')],
  wires: ['k.out -> g1.u', 'g1.y -> g2.u', 'g2.y -> t.u'],
});

export const DIAGNOSTIC_RECIPES: Record<string, DiagnosticRecipe> = {
  ALGEBRAIC_LOOP: liveRecipe(
    'Sum -> Gain(0.5) -> back to the Sum input (direct-feedthrough loop that converges): XbridgesEngine.ts:390',
    [loopModel(0.5)],
    [{ ...loopModel(0.5), wires: loopModel(0.5).wires.filter((w) => w !== 'g.y -> s.in2') }],
  ),
  ALGEBRAIC_LOOP_NOT_CONVERGED: liveRecipe(
    'y = 1 + 1*y has no solution (singular loop Jacobian): XbridgesEngine.ts:583; clean uses gain 0.5',
    [loopModel(1)],
    [loopModel(0.5)],
  ),
  BLOCK_RUNTIME_FAULT: liveRecipe(
    "Extended Kalman Filter with the state function f typed as the undefined symbol 'abc' throws while executing: XbridgesEngine.ts:28 (reportBlockException)",
    [{ blocks: [{ id: 'e', type: 'EXTENDED_KALMAN_FILTER', params: { f: 'abc' } }, term('t')], wires: ['e.x_hat -> t.u'] }],
    [{ blocks: [{ id: 'e', type: 'EXTENDED_KALMAN_FILTER' }, term('t')], wires: ['e.x_hat -> t.u'] }],
  ),
  CONTINUOUS_STATES_WITH_DISCRETE_SOLVER: liveRecipe(
    'Integrator (continuous state) with the discrete solver: modelChecks.ts:178; clean uses the euler solver',
    [integratorChain(), { solver: 'discrete' }],
    [integratorChain(), { solver: 'euler' }],
  ),
  DATA_TYPE_MISMATCH: liveRecipe(
    'Localization covariance (float32) wired to the Visualization nav_state input (int32): XbridgesEngine.ts:198; clean wires it to comm_stats (float32)',
    [robotWire(['ROBOT_VACUUM_LOCALIZATION', 'covariance', ''], ['ROBOT_VACUUM_VISUALIZATION', 'nav_state', ''])],
    [robotWire(['ROBOT_VACUUM_LOCALIZATION', 'covariance', ''], ['ROBOT_VACUUM_VISUALIZATION', 'comm_stats', ''])],
  ),
  DIMENSION_MISMATCH: liveRecipe(
    'Gain output declared [3] wired to a Gain input declared [2] (ports patched in: no library block declares output dimensions): XbridgesEngine.ts:221',
    [dimensionModel(), { patch: withDimensions([3], [2]) }],
    [dimensionModel(), { patch: withDimensions([3], [3]) }],
  ),
  DISCRETE_BLOCK_CONTINUOUS_SAMPLE_TIME: liveRecipe(
    'Unit Delay with sample time 0: modelChecks.ts:159; clean uses 0.25',
    [delayChain(0)],
    [delayChain(0.25)],
  ),
  DIVIDE_BY_ZERO: liveRecipe(
    'Vector Divide with denominator 0: BlockDefinitions.ts:273 (VectorDiv, line 2290); clean denominator 2',
    [{ blocks: [konst('n', 1), konst('d', 0), { id: 'v', type: 'VectorDiv' }, term('t')], wires: ['n.out -> v.in1', 'd.out -> v.in2', 'v.out -> t.u'] }],
    [{ blocks: [konst('n', 1), konst('d', 2), { id: 'v', type: 'VectorDiv' }, term('t')], wires: ['n.out -> v.in1', 'd.out -> v.in2', 'v.out -> t.u'] }],
  ),
  EXECUTION_EXCEPTION: doeFault(
    'DOE_MODEL Taguchi with a null level entry throws inside execute; the code is only stored in nextState.lastFault (BlockDefinitions.ts:3350), the engine reports BLOCK_RUNTIME_FAULT',
    { modelType: 'Taguchi', grandMean: 0, factorLevels: [{ factorName: 'X1', means: [null] }] },
  ),
  FIXED_STEP_INVALID: {
    note: 'Batch run with fixed step 0: simulationConfig.ts:95 (via Solvers.runFixedStep)',
    provoke: () => batch(integratorChain(), { ...VALID_BATCH, fixedStep: 0 }),
    clean: () => batch(integratorChain(), VALID_BATCH),
  },
  FRAME_INCONSISTENCY: liveRecipe(
    'Lidar ranges (frame body) wired to the Mapping x_est input (frame world): XbridgesEngine.ts:188; clean wires them to lidar_ranges (body)',
    [robotWire(['ROBOT_VACUUM_LIDAR', 'ranges', ''], ['ROBOT_VACUUM_MAPPING', 'x_est', ''])],
    [robotWire(['ROBOT_VACUUM_LIDAR', 'ranges', ''], ['ROBOT_VACUUM_MAPPING', 'lidar_ranges', ''])],
  ),
  INVALID_GMDH_LAYERS: doeFault(
    'DOE_MODEL GMDH without layers; the code is only stored in nextState.lastFault (BlockDefinitions.ts:3293), the engine reports BLOCK_RUNTIME_FAULT',
    { modelType: 'GMDH' },
  ),
  INVALID_SAMPLE_TIME: liveRecipe(
    'Unit Delay with sample time -2: modelChecks.ts:151; clean uses 0.25',
    [delayChain(-2)],
    [delayChain(0.25)],
  ),
  INVALID_TAGUCHI_LEVELS: doeFault(
    'DOE_MODEL Taguchi without factor levels; the code is only stored in nextState.lastFault (BlockDefinitions.ts:3325), the engine reports BLOCK_RUNTIME_FAULT',
    { modelType: 'Taguchi' },
  ),
  LOGIC_NAN_INPUT: liveRecipe(
    'NaN into a NOT block: BlockDefinitions.ts:264 (logicNanDiagnostic), typed diagnostic from execute (XbridgesEngine.ts:510)',
    [chain({ id: 'n', type: 'NOT' }, NaN)],
    [chain({ id: 'n', type: 'NOT' }, 1)],
  ),
  MATH_DOMAIN_ERROR: liveRecipe(
    'asin of 2: BlockDefinitions.ts:269 (ASIN, line 4077); clean input 0.5',
    [chain({ id: 'a', type: 'ASIN' }, 2)],
    [chain({ id: 'a', type: 'ASIN' }, 0.5)],
  ),
  MISSING_FIS_CONFIG: liveRecipe(
    'Fuzzy Surface Viewer without a linked FIS: XbridgesEngine.ts:304; clean has a fisConfig object',
    [{ blocks: [{ id: 'f', type: 'FUZZY_SURFACE_VIEWER' }], wires: [] }],
    [{ blocks: [{ id: 'f', type: 'FUZZY_SURFACE_VIEWER', params: { fisConfig: { name: 'fis' } } }], wires: [] }],
  ),
  NON_FINITE_INPUT: doeFault(
    'DOE_MODEL GMDH with layers and a NaN input; the code is only stored in nextState.lastFault (BlockDefinitions.ts:3299), the engine reports BLOCK_RUNTIME_FAULT',
    { modelType: 'GMDH', layers: [[{ inputs: [0], coeffs: [0, 1, 0, 0, 0, 0] }]] },
    NaN,
  ),
  NO_MODEL_CONFIGURED: doeFault(
    'DOE_MODEL with an unknown model type; the code is only stored in nextState.lastFault (BlockDefinitions.ts:3347), the engine reports BLOCK_RUNTIME_FAULT',
    { modelType: 'Unknown' },
  ),
  NUMERICAL_INSTABILITY: liveRecipe(
    'Constant NaN output: XbridgesEngine.ts:455; clean constant 1',
    [chain({ id: 'g', type: 'GAIN' }, NaN)],
    [chain({ id: 'g', type: 'GAIN' }, 1)],
  ),
  PARAMETER_EMPTY: liveRecipe(
    "Delay length field left empty: parameterEvaluation.ts evaluate() (empty text); reported by modelChecks.ts:225",
    [chain({ id: 'd', type: 'DELAY', params: { delay_length: '' } })],
    [chain({ id: 'd', type: 'DELAY', params: { delay_length: 1 } })],
  ),
  PARAMETER_INVALID: liveRecipe(
    "Delay length 'abc' is not an expression: parameterEvaluation.ts:384 / invalid(); reported by modelChecks.ts:225",
    [chain({ id: 'd', type: 'DELAY', params: { delay_length: 'abc' } })],
    [chain({ id: 'd', type: 'DELAY', params: { delay_length: 1 } })],
  ),
  PARAMETER_NOT_INTEGER: liveRecipe(
    'Delay length 1.5: parameterEvaluation.ts integer kind; reported by modelChecks.ts:225',
    [chain({ id: 'd', type: 'DELAY', params: { delay_length: 1.5 } })],
    [chain({ id: 'd', type: 'DELAY', params: { delay_length: 1 } })],
  ),
  PARAMETER_OPTION_INVALID: liveRecipe(
    "Arcsine angle unit 'grads' is not radians or degrees: parameterEvaluation.ts option kind; reported by modelChecks.ts:225",
    [chain({ id: 'a', type: 'ASIN', params: { angle_unit: 'grads' } }, 0.5)],
    [chain({ id: 'a', type: 'ASIN', params: { angle_unit: 'degrees' } }, 0.5)],
  ),
  PARAMETER_OUT_OF_RANGE: liveRecipe(
    'Delay length 0 is below the minimum 1: parameterEvaluation.ts integer kind; reported by modelChecks.ts:225',
    [chain({ id: 'd', type: 'DELAY', params: { delay_length: 0 } })],
    [chain({ id: 'd', type: 'DELAY', params: { delay_length: 1 } })],
  ),
  RATE_TRANSITION_REQUIRED: liveRecipe(
    'Unit Delay 0.25 s feeding Unit Delay 0.5 s directly: modelChecks.ts:195; clean both 0.25 s',
    [twoDelays(0.25, 0.5)],
    [twoDelays(0.25, 0.25)],
  ),
  SAMPLE_RATE_MISMATCH: liveRecipe(
    'Localization x_est (50 Hz) wired to the Visualization x input (100 Hz): XbridgesEngine.ts:208; clean wires it to x_est (50 Hz)',
    [robotWire(['ROBOT_VACUUM_LOCALIZATION', 'x_est', ''], ['ROBOT_VACUUM_VISUALIZATION', 'x', ''])],
    [robotWire(['ROBOT_VACUUM_LOCALIZATION', 'x_est', ''], ['ROBOT_VACUUM_VISUALIZATION', 'x_est', ''])],
  ),
  SAMPLE_TIME_NOT_MULTIPLE_OF_FIXED_STEP: liveRecipe(
    'Unit Delay 0.3 s with a fixed step of 0.25 s: modelChecks.ts:169; clean 0.5 s',
    [delayChain(0.3)],
    [delayChain(0.5)],
  ),
  SIGNAL_TYPE_MISMATCH: liveRecipe(
    'Three-phase PWM gate (logical) wired to the inverter DC+ input (power): XbridgesEngine.ts:166; clean wires it to the gate input (logical)',
    [{ blocks: [{ id: 'a', type: 'THREE_PHASE_PWM' }, { id: 'b', type: 'THREE_PHASE_INVERTER' }], wires: ['a.ga -> b.vdc_p'] }],
    [{ blocks: [{ id: 'a', type: 'THREE_PHASE_PWM' }, { id: 'b', type: 'THREE_PHASE_INVERTER' }], wires: ['a.ga -> b.ga'] }],
  ),
  START_TIME_INVALID: {
    note: 'Batch run with a NaN start time: simulationConfig.ts:73 (via Solvers.runFixedStep)',
    provoke: () => batch(integratorChain(), { ...VALID_BATCH, startTime: Number.NaN }),
    clean: () => batch(integratorChain(), VALID_BATCH),
  },
  STOP_TIME_BEFORE_START: {
    note: 'Batch run with start 1 and stop 0: simulationConfig.ts:77 (via Solvers.runFixedStep)',
    provoke: () => batch(integratorChain(), { ...VALID_BATCH, startTime: 1, stopTime: 0 }),
    clean: () => batch(integratorChain(), VALID_BATCH),
  },
  STOP_TIME_INFINITE_BATCH: {
    note: 'Batch run with an infinite stop time: Solvers.ts:522 (runFixedStep)',
    provoke: () => batch(integratorChain(), { ...VALID_BATCH, stopTime: Number.POSITIVE_INFINITY }),
    clean: () => batch(integratorChain(), VALID_BATCH),
  },
  UNCONNECTED_INPUT_PORT: liveRecipe(
    'Gain input left open: modelChecks.ts:119',
    [{ blocks: [{ id: 'g', type: 'GAIN' }, term('t')], wires: ['g.y -> t.u'] }],
    [gainChain({})],
  ),
  UNCONNECTED_OUTPUT_PORT: liveRecipe(
    'Gain output left open: modelChecks.ts:128',
    [{ blocks: [konst('k', 1), { id: 'g', type: 'GAIN' }], wires: ['k.out -> g.u'] }],
    [gainChain({})],
  ),
  UNIT_INCONSISTENCY: liveRecipe(
    'Lidar angles (rad) wired to the Localization lidar_ranges input (m): XbridgesEngine.ts:178; clean wires ranges (m)',
    [robotWire(['ROBOT_VACUUM_LIDAR', 'angles', ''], ['ROBOT_VACUUM_LOCALIZATION', 'lidar_ranges', ''])],
    [robotWire(['ROBOT_VACUUM_LIDAR', 'ranges', ''], ['ROBOT_VACUUM_LOCALIZATION', 'lidar_ranges', ''])],
  ),
  UNSUPPORTED_SOLVER: {
    note: "Batch run with solver 'ode113' (declared, not implemented): Solvers.ts:564 (runFixedStep)",
    provoke: () => batch(integratorChain(), { ...VALID_BATCH, solver: 'ode113' }),
    clean: () => batch(integratorChain(), VALID_BATCH),
  },
};
