// src/engine/xbridges/modelChecks.ts
// Compile-time model and parameter checks (Simulink-equivalent diagnostics).
// Pure functions: they take the flattened blocks / connections and the solver options (or null) and return diagnostics.
// Catalog: docs/superpowers/plans/2026-11-08-xbridges-simulink-diagnostics.md
import type { ModelDiagnostic, SolverOptions, XBlock } from './types';
import { parseMatrixEditorValue } from '../../utils/stateMachine/stateSpaceValidation';
import { evaluateParameter, type ParameterKind } from './parameterEvaluation';
import { XB_PARAMETER_SCHEMA } from './parameterSchema';

export interface FlatConnection {
  sourceBlock: string;
  sourcePort: string;
  targetBlock: string;
  targetPort: string;
}

/** Fixed-step solvers: every discrete sample time must be an integer multiple of the step size. */
const FIXED_STEP_SOLVERS = new Set(['euler', 'ode1', 'ode2', 'ode3', 'ode4', 'rk4', 'ode5', 'ode14x', 'fixedStep', 'discrete']);

/** Blocks that only make sense in discrete time (a continuous sample time of 0 is an error). */
const DISCRETE_ONLY_TYPES = new Set([
  'DISCRETE_TRANSFER_FUNCTION', 'INTEGRATOR_DISCRETE', 'UNIT_DELAY', 'DISCRETE_IMPULSE',
]);

const nameOf = (b: XBlock): string => b.label || b.type;
const fmt = (v: unknown): string => (typeof v === 'number' ? String(v) : JSON.stringify(v));

/**
 * Sample time of a block: `sampleTime`, or `sample_time` (alias used by the discrete integrator).
 * Returns null when the block does not specify one (or says "inherited"); NaN/Infinity are returned as is
 * so that INVALID_SAMPLE_TIME can report them.
 */
export function getBlockSampleTime(b: XBlock): number | null {
  const p = b.params || {};
  const raw = p.sampleTime !== undefined && p.sampleTime !== null ? p.sampleTime : p.sample_time;
  if (raw === undefined || raw === null) return null;
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (s === '' || Number.isNaN(Number(s))) return null; // 'inherited', 'auto', ...
    return Number(s);
  }
  if (typeof raw === 'number') return raw;
  return null;
}

/** True when the block is a discrete (periodic) sample-time block. */
export const isPeriodicSampleTime = (ts: number | null): ts is number => ts !== null && Number.isFinite(ts) && ts > 0;

const asNumberArray = (raw: unknown): number[] | null => {
  if (!Array.isArray(raw)) return null;
  return raw.map((v) => (typeof v === 'string' && v.trim() !== '' ? Number(v) : (v as number)));
};

const asMatrix = (raw: unknown): unknown[][] | null => {
  const v = parseMatrixEditorValue(raw);
  if (!Array.isArray(v) || v.length === 0) return null;
  return (Array.isArray(v[0]) ? v : [v]) as unknown[][];
};

const matrixDims = (m: unknown[][] | null): { rows: number; cols: number } | null => {
  if (!m || m.length === 0) return null;
  const cols = Array.isArray(m[0]) ? m[0].length : -1;
  if (cols <= 0) return null;
  return m.every((r) => Array.isArray(r) && r.length === cols) ? { rows: m.length, cols } : null;
};

const isNonFiniteNumber = (v: unknown): boolean => typeof v === 'number' && !Number.isFinite(v);

/** Schema entry (parameter name -> kind) of a block type; the type is matched case-insensitively like the engine does. */
export function parameterKindsOf(type: string): Record<string, ParameterKind> {
  const schema = XB_PARAMETER_SCHEMA as Record<string, Record<string, ParameterKind>>;
  if (schema[type]) return schema[type];
  const key = Object.keys(schema).find((k) => k.toLowerCase() === String(type).toLowerCase());
  return key ? schema[key] : {};
}

export interface ParameterProblem { param: string; raw: unknown; code: string; reason: string }
export interface BlockParameterEvaluation {
  /** Evaluated values of the parameters entered as text that evaluate to something different (numbers, arrays, booleans). */
  resolved: Record<string, unknown>;
  problems: ParameterProblem[];
}

/** Evaluates every schema parameter of a block that is set (Simulink: the block dialog's "Invalid setting" checks). */
export function evaluateBlockParameters(b: XBlock): BlockParameterEvaluation {
  const resolved: Record<string, unknown> = {};
  const problems: ParameterProblem[] = [];
  const params = b.params || {};
  for (const [param, kind] of Object.entries(parameterKindsOf(b.type))) {
    if (!(param in params) || params[param] === undefined) continue;
    const raw = params[param];
    const r = evaluateParameter(raw, kind);
    if (!r.ok) { problems.push({ param, raw, code: r.code, reason: r.reason }); continue; }
    // Only text needs resolving; numbers and arrays already stored as values keep their stored form.
    if (typeof raw === 'string' && kind.kind !== 'option' && JSON.stringify(r.value) !== JSON.stringify(raw)) resolved[param] = r.value;
  }
  return { resolved, problems };
}

export const describeParameterProblem = (b: XBlock, p: ParameterProblem): string =>
  `Invalid setting in block '${nameOf(b)}': parameter '${p.param}' = ${fmt(p.raw)} - ${p.reason}`;

const CONSTANT_INTEGER_RANGES: Readonly<Record<string, readonly [number, number]>> = {
  int8: [-128, 127], uint8: [0, 255], int16: [-32768, 32767], uint16: [0, 65535],
  int32: [-2147483648, 2147483647], uint32: [0, 4294967295],
};

/** A. Connectivity */
export function checkConnectivity(blocks: XBlock[], conns: FlatConnection[]): ModelDiagnostic[] {
  const out: ModelDiagnostic[] = [];
  const driven = new Set(conns.map((c) => `${c.targetBlock}.${c.targetPort}`));
  const used = new Set(conns.map((c) => `${c.sourceBlock}.${c.sourcePort}`));
  for (const b of blocks) {
    for (const p of b.inputs || []) {
      // Control ports (Enable/Reset) have defaults; 'object' ports (DOE link) are optional.
      if ((p.type as string) === 'control' || (p.type as string) === 'object') continue;
      if (!driven.has(`${b.id}.${p.id}`)) {
        out.push({
          severity: 'warning', code: 'UNCONNECTED_INPUT_PORT', blockIds: [b.id],
          message: `Input port '${p.name}' of block '${nameOf(b)}' is not connected; its default value ${fmt(p.value)} is used.`,
        });
      }
    }
    for (const p of b.outputs || []) {
      if ((p.type as string) === 'measurement') continue;
      if (!used.has(`${b.id}.${p.id}`)) {
        out.push({
          severity: 'warning', code: 'UNCONNECTED_OUTPUT_PORT', blockIds: [b.id],
          message: `Output port '${p.name}' of block '${nameOf(b)}' is not connected.`,
        });
      }
    }
  }
  return out;
}

/** B. Sample time and solver */
export function checkSampleTimes(blocks: XBlock[], conns: FlatConnection[], options: SolverOptions | null): ModelDiagnostic[] {
  const out: ModelDiagnostic[] = [];
  const ts = new Map<string, number | null>();
  const fixedStepSolver = !!options && FIXED_STEP_SOLVERS.has(options.solver as string);
  const h = options ? (Number.isFinite(options.fixedStep) && (options.fixedStep as number) > 0 ? (options.fixedStep as number) : 0.01) : 0;

  for (const b of blocks) {
    const t = getBlockSampleTime(b);
    ts.set(b.id, t);

    if (t !== null) {
      if (!(t === -1 || t === 0 || (Number.isFinite(t) && t > 0))) {
        out.push({
          severity: 'error', code: 'INVALID_SAMPLE_TIME', blockIds: [b.id],
          message: `Block '${nameOf(b)}' has invalid sample time ${fmt(t)}; use -1 (inherited), 0 (continuous) or a finite value > 0.`,
        });
        continue;
      }
      const discreteOnly = DISCRETE_ONLY_TYPES.has(b.type) || (b.type === 'STATE_SPACE' && b.params?.representation === 'discrete');
      if (discreteOnly && t === 0) {
        out.push({
          severity: 'error', code: 'DISCRETE_BLOCK_CONTINUOUS_SAMPLE_TIME', blockIds: [b.id],
          message: `Discrete block '${nameOf(b)}' cannot have a continuous sample time (0); set a sample time > 0.`,
        });
        continue;
      }
      if (fixedStepSolver && t > 0) {
        const r = t / h;
        const n = Math.round(r);
        if (n < 1 || Math.abs(r - n) > 1e-9 * Math.max(1, Math.abs(r))) {
          out.push({
            severity: 'error', code: 'SAMPLE_TIME_NOT_MULTIPLE_OF_FIXED_STEP', blockIds: [b.id],
            message: `Sample time ${fmt(t)} of block '${nameOf(b)}' is not an integer multiple of the fixed step size ${fmt(h)}.`,
          });
        }
      }
    }

    if (options && (options.solver as string) === 'discrete' && b.evaluateDerivatives) {
      out.push({
        severity: 'error', code: 'CONTINUOUS_STATES_WITH_DISCRETE_SOLVER', blockIds: [b.id],
        message: `Block '${nameOf(b)}' has continuous states, which the discrete solver cannot integrate; choose a continuous solver.`,
      });
    }
  }

  const byId = new Map(blocks.map((b) => [b.id, b]));
  const seen = new Set<string>();
  for (const c of conns) {
    const t1 = ts.get(c.sourceBlock);
    const t2 = ts.get(c.targetBlock);
    if (!isPeriodicSampleTime(t1 ?? null) || !isPeriodicSampleTime(t2 ?? null)) continue;
    if (Math.abs((t1 as number) - (t2 as number)) <= 1e-9 * Math.max(t1 as number, t2 as number)) continue;
    const key = `${c.sourceBlock}->${c.targetBlock}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      severity: 'warning', code: 'RATE_TRANSITION_REQUIRED', blockIds: [c.sourceBlock, c.targetBlock],
      message: `Block '${nameOf(byId.get(c.sourceBlock)!)}' (Ts=${fmt(t1)}) feeds block '${nameOf(byId.get(c.targetBlock)!)}' (Ts=${fmt(t2)}) directly. X-Bridges has no Rate Transition block: insert a Unit Delay (Delay, N = 1) whose sample time is the slower of the two, or give both blocks the same sample time.`,
    });
  }
  return out;
}

/** C. Parameter constraints */
export function checkParameters(blocks: XBlock[]): ModelDiagnostic[] {
  const out: ModelDiagnostic[] = [];
  const err = (b: XBlock, code: string, message: string) =>
    out.push({ severity: 'error', code, message, blockIds: [b.id] });

  const checkCoefficients = (b: XBlock, label: string, arr: number[] | null): boolean => {
    if (arr === null) return true;
    if (arr.length === 0) {
      err(b, 'PARAMETER_NOT_FINITE', `Block '${nameOf(b)}': ${label} is empty.`);
      return false;
    }
    const badIdx = arr.findIndex((v) => typeof v !== 'number' || !Number.isFinite(v));
    if (badIdx >= 0) {
      err(b, 'PARAMETER_NOT_FINITE', `Block '${nameOf(b)}': ${label} contains a non-finite value (${fmt(arr[badIdx])}).`);
      return false;
    }
    return true;
  };

  for (const b of blocks) {
    const p = b.params || {};
    for (const problem of evaluateBlockParameters(b).problems) {
      out.push({ severity: 'error', code: problem.code, message: describeParameterProblem(b, problem), blockIds: [b.id] });
    }
    switch (b.type) {
      case 'Sum': {
        const signs = typeof p.signs === 'string' ? p.signs : null;
        if (signs !== null) {
          const count = [...signs].filter((c) => c === '+' || c === '-').length;
          const n = p.numInputs === undefined ? null : Number(p.numInputs);
          if (/[^+\-|]/.test(signs)) {
            err(b, 'SUM_SIGNS_INVALID', `Block '${nameOf(b)}': the list of signs '${signs}' may only contain +, - and |.`);
          } else if (n !== null && Number.isFinite(n) && count !== n) {
            err(b, 'SUM_SIGNS_INVALID', `Block '${nameOf(b)}': the list of signs '${signs}' has ${count} signs but the block has ${n} inputs.`);
          }
        }
        break;
      }
      case 'Constant': {
        const outType = typeof p.output_type === 'string' ? p.output_type : 'auto';
        const range = CONSTANT_INTEGER_RANGES[outType];
        const ev = evaluateParameter(p.value, { kind: 'numeric' });
        if (range && ev.ok && typeof ev.value !== 'string' && typeof ev.value !== 'boolean') {
          for (const x of ([ev.value] as unknown[]).flat(2) as number[]) {
            if (!Number.isInteger(x)) {
              err(b, 'CONSTANT_VALUE_NOT_REPRESENTABLE', `Block '${nameOf(b)}': value ${x} is not an integer and cannot be represented as ${outType}.`);
            } else if (x < range[0] || x > range[1]) {
              err(b, 'CONSTANT_VALUE_OUT_OF_RANGE', `Block '${nameOf(b)}': value ${x} is outside the ${outType} range [${range[0]}, ${range[1]}].`);
            }
          }
        }
        break;
      }
      case 'TRANSFER_FUNCTION':
      case 'DISCRETE_TRANSFER_FUNCTION':
      case 'ZERO_POLE_GAIN': {
        const zpk = b.type === 'ZERO_POLE_GAIN' && Array.isArray(p.zeros) && Array.isArray(p.poles);
        if (zpk) {
          const zeros = asNumberArray(p.zeros)!;
          const poles = asNumberArray(p.poles)!;
          const okZ = checkCoefficients(b, 'zeros', zeros.length === 0 ? null : zeros);
          const okP = checkCoefficients(b, 'poles', poles.length === 0 ? null : poles);
          if (p.gain !== undefined && typeof p.gain === 'number' && !Number.isFinite(p.gain)) {
            err(b, 'PARAMETER_NOT_FINITE', `Block '${nameOf(b)}': gain is ${fmt(p.gain)}.`);
          }
          if (okZ && okP && zeros.length > poles.length) {
            err(b, 'TF_IMPROPER', `Zero-pole-gain block '${nameOf(b)}' has ${zeros.length} zeros but ${poles.length} poles; it must be causal (#zeros <= #poles).`);
          }
          break;
        }
        const num = asNumberArray(p.numerator);
        const den = asNumberArray(p.denominator);
        const okNum = checkCoefficients(b, 'numerator', num);
        const okDen = checkCoefficients(b, 'denominator', den);
        if (okDen && den && den[0] === 0) {
          err(b, 'TF_DENOMINATOR_LEADING_ZERO', `Block '${nameOf(b)}': the leading denominator coefficient is 0; it must be non-zero.`);
        } else if (okNum && okDen && num && den && num.length > den.length) {
          err(b, 'TF_IMPROPER', `Transfer function '${nameOf(b)}' is improper: numerator order ${num.length - 1} exceeds denominator order ${den.length - 1}.`);
        }
        break;
      }
      case 'GAIN': {
        const g = p.gain;
        const vals: unknown[] = Array.isArray(g) ? (g as unknown[]).flat(Infinity) : [g];
        const bad = vals.find(isNonFiniteNumber);
        if (bad !== undefined) err(b, 'PARAMETER_NOT_FINITE', `Block '${nameOf(b)}': gain is ${fmt(bad)}; it must be finite.`);
        break;
      }
      case 'SATURATION':
      case 'DEADZONE': {
        const lo = Number(p.lowerLimit);
        const hi = Number(p.upperLimit);
        if (Number.isNaN(lo) || Number.isNaN(hi)) {
          err(b, 'PARAMETER_NOT_FINITE', `Block '${nameOf(b)}': a limit is NaN.`);
        } else if (lo > hi) {
          err(b, 'LIMITS_INVALID', `Block '${nameOf(b)}': lower limit ${fmt(lo)} is greater than upper limit ${fmt(hi)}.`);
        }
        break;
      }
      case 'RATE_LIMITER': {
        const rise = Number(p.risingSlewRate);
        const fall = Number(p.fallingSlewRate);
        if (Number.isNaN(rise) || Number.isNaN(fall)) {
          err(b, 'PARAMETER_NOT_FINITE', `Block '${nameOf(b)}': a slew rate is NaN.`);
        } else if (rise < fall) {
          err(b, 'LIMITS_INVALID', `Block '${nameOf(b)}': rising slew rate ${fmt(rise)} must be >= falling slew rate ${fmt(fall)}.`);
        }
        break;
      }
      case 'PID_BASIC':
      case 'PID_CONTROLLER': {
        const mn = Number(p.min);
        const mx = Number(p.max);
        if (Number.isNaN(mn) || Number.isNaN(mx)) {
          err(b, 'PARAMETER_NOT_FINITE', `Block '${nameOf(b)}': an output limit is NaN.`);
        } else if (mn > mx) {
          err(b, 'LIMITS_INVALID', `Block '${nameOf(b)}': minimum output ${fmt(mn)} is greater than maximum output ${fmt(mx)}.`);
        }
        for (const k of ['Kp', 'Ki', 'Kd'] as const) {
          if (p[k] !== undefined && !Number.isFinite(Number(p[k]))) {
            err(b, 'PARAMETER_NOT_FINITE', `Block '${nameOf(b)}': gain ${k} is ${fmt(p[k])}; it must be finite.`);
          }
        }
        if (p.mode === 'PD' || p.mode === 'PID') {
          const N = Number(p.N);
          if (!(Number.isFinite(N) && N > 0)) {
            err(b, 'PID_FILTER_COEFFICIENT_INVALID', `Block '${nameOf(b)}': derivative filter coefficient N is ${fmt(p.N)}; it must be > 0.`);
          }
        }
        break;
      }
      case 'DELAY': {
        const n = Number(p.delay_length);
        if (!(Number.isInteger(n) && n >= 0)) {
          err(b, 'DELAY_LENGTH_INVALID', `Block '${nameOf(b)}': delay length ${fmt(p.delay_length)} must be a non-negative integer (0 = direct feedthrough).`);
        }
        break;
      }
      case 'STATE_SPACE': {
        const A = matrixDims(asMatrix(p.A));
        const B = matrixDims(asMatrix(p.B));
        const C = matrixDims(asMatrix(p.C));
        const D = matrixDims(asMatrix(p.D));
        if (!A || !B || !C || !D) {
          err(b, 'STATE_SPACE_DIMENSION_MISMATCH', `State-space block '${nameOf(b)}': A, B, C and D must each be a rectangular matrix.`);
          break;
        }
        const problems: string[] = [];
        if (A.rows !== A.cols) problems.push(`A is ${A.rows}x${A.cols} (must be square)`);
        if (B.rows !== A.rows) problems.push(`B has ${B.rows} rows (A has ${A.rows})`);
        if (C.cols !== A.rows) problems.push(`C has ${C.cols} columns (A has ${A.rows})`);
        if (D.rows !== C.rows) problems.push(`D has ${D.rows} rows (C has ${C.rows})`);
        if (D.cols !== B.cols) problems.push(`D has ${D.cols} columns (B has ${B.cols})`);
        if (problems.length > 0) {
          err(b, 'STATE_SPACE_DIMENSION_MISMATCH', `State-space block '${nameOf(b)}' has inconsistent dimensions: ${problems.join('; ')}.`);
        }
        break;
      }
      default:
        break;
    }
  }
  return out;
}

/** All compile-time checks. */
export function runModelChecks(blocks: XBlock[], conns: FlatConnection[], options: SolverOptions | null): ModelDiagnostic[] {
  return [
    ...checkConnectivity(blocks, conns),
    ...checkSampleTimes(blocks, conns, options),
    ...checkParameters(blocks),
  ];
}
