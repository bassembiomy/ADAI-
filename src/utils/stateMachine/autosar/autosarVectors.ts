/**
 * Browser-safe oracle of the AUTOSAR SWC: seeded input vectors (values and read statuses) and the per-cycle
 * expectations computed by ADIA's semantic interpreter. Used by the generator (back-to-back test shipped in the
 * package) and by the verifier (differential gate), so both compare against exactly the same model of the component.
 * No Node import here: this module is part of the renderer bundle.
 */
import { createRuntime, faultRuntime, initializeRuntime, stepRuntime, type SemanticRuntime } from '../smInterpreter';
import type { SemanticModel } from '../smSemanticModel';
import { INTEGER_RANGES, isFloatPortType, type AutosarPort, type AutosarPortModel } from './autosarPorts';

/** Default of `<SWCU>_RTE_ERROR_LIMIT` in the generated component header. */
export const AUTOSAR_DEFAULT_RTE_ERROR_LIMIT = 10;
/** The component is re-initialised every this many cycles, so a latched fault does not hide the rest of the run. */
export const AUTOSAR_EPISODE_CYCLES = 25;

/** Read status codes of a vector: the C side maps them to RTE_E_OK, RTE_E_LOST_DATA and RTE_E_NO_DATA. */
export const READ_OK = 0;
export const READ_LOST_DATA = 1;
export const READ_FAILED = 2;

/** mulberry32: small, fast, fully specified 32-bit PRNG (the vectors are generated in TS and handed to C as a table). */
export const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const FLOAT_BOUNDARIES = [0, 1, -1, 0.5, -0.5, 100, -100, 1000000, -1000000, 0.0009765625, -0.0009765625];

/** Deterministic type-correct value: boundaries (20 %), small magnitudes near typical thresholds (30 %), uniform (50 %). */
export const drawValue = (platformType: string, random: () => number): number => {
  const selector = random();
  const pick = random();
  if (platformType === 'boolean') return pick < 0.5 ? 0 : 1;
  // 5 %: exactly zero, so divisors of zero are drawn on purpose (the model faults, the core must too).
  if (selector < 0.05) return 0;
  if (isFloatPortType(platformType)) {
    if (selector < 0.2) return FLOAT_BOUNDARIES[Math.floor(pick * FLOAT_BOUNDARIES.length)];
    if (selector < 0.5) return (Math.floor(pick * 801) - 400) / 4;
    // k / 1024 with |k| <= 2^20 is exactly representable in float32 and float64.
    return (Math.floor(pick * 2097153) - 1048576) / 1024;
  }
  const [min, max] = INTEGER_RANGES[platformType] ?? INTEGER_RANGES.sint32;
  if (selector < 0.2) {
    const boundaries = [min, min + 1, max - 1, max, 0, 1, -1].filter((value) => value >= min && value <= max);
    return boundaries[Math.floor(pick * boundaries.length)];
  }
  if (selector < 0.5) {
    const low = Math.max(min, -200);
    const high = Math.min(max, 200);
    return low + Math.floor(pick * (high - low + 1));
  }
  return min + Math.floor(pick * (max - min + 1));
};

export interface OracleOptions {
  cycles: number;
  seed: number;
  episodeCycles?: number;
  errorLimit?: number;
}

export interface OracleRun {
  cycles: number;
  episodeCycles: number;
  /** Per required port, per cycle: the value the RTE stub delivers (may be non-finite for floats). */
  values: number[][];
  /** Per required port, per cycle: READ_OK, READ_LOST_DATA or READ_FAILED. */
  status: number[][];
  /**
   * Expected observations: [ActiveState, ErrorStatus != 0, ...provided port values]. Row 0 follows Init, then
   * one row after every cycle, plus one extra row after each re-initialisation (every `episodeCycles` cycles).
   */
  rows: number[][];
  /** Cycles that ran with the core fault latched. */
  faultCycles: number;
}

const initialNumber = (port: AutosarPort): number => Number(port.initValue);

/** The value a port presents to the core after the component's input conditioning (null: the data is left unchanged). */
const conditioned = (port: AutosarPort, value: number, accepted: boolean): number | null => {
  const policy = port.invalidInputPolicy ?? 'reject';
  if (!accepted) return policy === 'default' ? initialNumber(port) : null;
  if (port.platformType === 'boolean') return value !== 0 ? 1 : 0;
  let result = value;
  if (policy === 'clamp') {
    if (port.clampMax !== undefined && result > port.clampMax) result = port.clampMax;
    if (port.clampMin !== undefined && result < port.clampMin) result = port.clampMin;
  }
  return result;
};

const drawNonFinite = (random: () => number): number => {
  const pick = random();
  return pick < 0.34 ? Number.NaN : pick < 0.67 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
};

/**
 * Steps the interpreter exactly like the component: per cycle the conditioned inputs are written to the model
 * variables, a port whose policy is `diagnostic-fault` and whose consecutive failures reached the limit latches the
 * fault, the model steps by the period, and the provided ports are observed (safe values while faulted).
 */
export const runAutosarOracle = (
  ir: SemanticModel,
  ports: AutosarPortModel,
  options: OracleOptions,
): OracleRun => {
  const episodeCycles = options.episodeCycles ?? AUTOSAR_EPISODE_CYCLES;
  const limit = options.errorLimit ?? AUTOSAR_DEFAULT_RTE_ERROR_LIMIT;
  const random = mulberry32(options.seed);
  const values: number[][] = ports.required.map(() => []);
  const status: number[][] = ports.required.map(() => []);
  const burst: number[] = ports.required.map(() => 0);
  const failures: number[] = ports.required.map(() => 0);

  // Oracle: ADIA's semantic interpreter, stepped exactly like the SWC cycle (inputs, step(period), outputs).
  const stateNumber = new Map(Object.values(ir.states)
    .sort((left, right) => left.activityIndex - right.activityIndex)
    .map((state, index) => [state.id, index + 1]));
  const runtime = createRuntime(ir);
  // A latched model error is a fault: the core exits every state and enters the safe state (safety mode), which is
  // the configuration the interpreter itself defines in enterFaultConfiguration. The interpreter applies it for
  // timing and X-Bridges errors but not for a RUNTIME_EVALUATION_ERROR (it freezes the configuration); the oracle
  // maps that case to the fault configuration. Reported as a known divergence of the interpreter.
  const faultState = ir.safetyMode && ir.safeStateId !== null ? (stateNumber.get(ir.safeStateId) ?? -1) : 0;
  const observe = (target: SemanticRuntime): number[] => [
    target.error !== null
      ? faultState
      : target.activeSlots[0] === null || target.activeSlots[0] === undefined ? 0 : (stateNumber.get(target.activeSlots[0]) ?? -1),
    target.error === null ? 0 : 1,
    ...ports.provided.map((port) => (target.error !== null && port.safeValue !== undefined
      ? Number(port.safeValue)
      : Number(target.data[port.variableId]))),
  ];
  const reinitialise = (): void => {
    initializeRuntime(runtime);
    failures.fill(0);
  };

  reinitialise();
  const rows: number[][] = [observe(runtime)];
  let faultCycles = 0;
  for (let cycle = 0; cycle < options.cycles; cycle += 1) {
    if (cycle > 0 && cycle % episodeCycles === 0) {
      reinitialise();
      rows.push(observe(runtime));
    }
    ports.required.forEach((port, position) => {
      let value = drawValue(port.platformType, random);
      if (isFloatPortType(port.platformType) && random() < 0.02) value = drawNonFinite(random);
      if (burst[position] === 0 && random() < 0.04) burst[position] = 1 + Math.floor(random() * (limit + 3));
      let code = random() < 0.1 ? READ_LOST_DATA : READ_OK;
      if (burst[position] > 0) {
        burst[position] -= 1;
        code = READ_FAILED;
      }
      values[position].push(value);
      status[position].push(code);
      const accepted = code !== READ_FAILED && (!isFloatPortType(port.platformType) || Number.isFinite(value));
      failures[position] = accepted ? 0 : Math.min(failures[position] + 1, limit);
      const next = conditioned(port, value, accepted);
      if (next !== null) runtime.data[port.variableId] = port.platformType === 'boolean' ? next !== 0 : next;
    });
    const diagnostic = ports.required.some((port, position) =>
      port.invalidInputPolicy === 'diagnostic-fault' && failures[position] >= limit);
    if (diagnostic && runtime.error === null) faultRuntime(runtime);
    stepRuntime(runtime, ir.tickMs);
    if (runtime.error !== null) faultCycles += 1;
    rows.push(observe(runtime));
  }
  return { cycles: options.cycles, episodeCycles, values, status, rows, faultCycles };
};

/** Comparison rule of the differential gate and of the shipped back-to-back test. */
export const withinTolerance = (expected: number, actual: number, float: boolean): boolean => {
  if (expected === actual) return true;
  if (!float || !Number.isFinite(expected) || !Number.isFinite(actual)) return false;
  return Math.abs(expected - actual) <= 1e-12 * Math.max(Math.abs(expected), Math.abs(actual));
};
