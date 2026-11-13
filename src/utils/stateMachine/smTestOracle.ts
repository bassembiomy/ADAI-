import {
  createRuntime,
  initializeRuntime,
  postInputEvent,
  resetRuntime,
  snapshotRuntime,
  stepRuntime,
  type SemanticRuntime,
} from './smInterpreter';
import type { SemanticModel, SemanticTransition } from './smSemanticModel';
import type { SMTestExpectation, SMTestOperation } from './smTestManifest';

/*
 * The oracle of the generated unit tests: the simulation (smInterpreter.ts).
 *
 * A test case is a list of operations (init, force a configuration, set timers and data, post input
 * events, queue local events, step). The oracle replays exactly that list on a simulation runtime, the
 * way the C test performs it on an instance, and the expected values of the C assertions are the
 * active set and the data the simulation ends with. Nothing is predicted by hand.
 */

export interface OracleResult {
  readonly activeStateIds: ReadonlySet<string>;
  readonly data: Readonly<Record<string, number | boolean>>;
  readonly timersMs: Readonly<Record<string, number>>;
  readonly error: string | null;
}

const UINT32_MAX = 0xffffffff;

const snapshot = (runtime: SemanticRuntime): OracleResult => {
  const frame = snapshotRuntime(runtime);
  return {
    activeStateIds: new Set(frame.activeStateIds),
    data: frame.data,
    timersMs: frame.stateTimersMs,
    error: frame.error,
  };
};

/** Replays the operations on a fresh simulation runtime. Null when an operation is not simulated. */
export const simulateOperations = (
  ir: SemanticModel,
  operations: readonly SMTestOperation[],
): OracleResult | null => {
  let runtime: SemanticRuntime | null = null;
  try {
    for (const op of operations) {
      if (op.kind === 'init') {
        runtime = createRuntime(ir);
        initializeRuntime(runtime);
        continue;
      }
      if (runtime === null) return null;
      switch (op.kind) {
        case 'reset':
          resetRuntime(runtime);
          break;
        case 'step':
          stepRuntime(runtime, op.deltaMs ?? ir.tickMs);
          break;
        case 'repeat-step':
          for (let cycle = 0; cycle < op.cycles; cycle++) stepRuntime(runtime, op.deltaMs ?? ir.tickMs);
          break;
        case 'post-event':
          postInputEvent(runtime, op.eventId);
          break;
        case 'queue-local-event':
          runtime.eventQueue.push(op.eventId);
          break;
        case 'set-variable':
          runtime.data[op.variableId] = op.value as number | boolean;
          break;
        case 'set-timer':
          runtime.stateTimersMs[ir.states[op.stateId].activityIndex] = op.valueMs;
          break;
        case 'force-configuration':
          runtime.stateActive.fill(false);
          runtime.stateTimersMs.fill(0);
          runtime.activeSlots.fill(null);
          for (const stateId of op.activeStateIds) runtime.stateActive[ir.states[stateId].activityIndex] = true;
          for (const slot of op.slots) runtime.activeSlots[slot.slot] = slot.stateId;
          runtime.entryPending = false;
          break;
        default:
          return null;
      }
    }
  } catch {
    return null;
  }
  return runtime === null ? null : snapshot(runtime);
};

/** The model with `transition` switched off: it never becomes enabled. */
export const withoutTransition = (ir: SemanticModel, transition: SemanticTransition): SemanticModel => ({
  ...ir,
  transitions: {
    ...ir.transitions,
    [transition.id]: {
      ...transition,
      eventId: null,
      triggerMode: 'condition',
      guard: { kind: 'literal', value: false },
      temporalThresholdMs: null,
    },
  },
});

export const sameResult = (left: OracleResult, right: OracleResult): boolean => {
  if (left.error !== right.error || left.activeStateIds.size !== right.activeStateIds.size) return false;
  for (const id of left.activeStateIds) if (!right.activeStateIds.has(id)) return false;
  for (const key of Object.keys(left.data)) if (!Object.is(left.data[key], right.data[key])) return false;
  for (const key of Object.keys(left.timersMs)) if (left.timersMs[key] !== right.timersMs[key]) return false;
  return true;
};

/** A timer as the C instance holds it: unsigned 32 bit, saturating. */
export const timerAsC = (valueMs: number): number => Math.min(valueMs, UINT32_MAX);

/**
 * Whether the test can read the variable back from the C instance exactly as the simulation holds it:
 * not fixed point (the instance stores the raw integer) and not fed by an input mapping (SM_Sync_IO
 * overwrites it from the channel).
 */
export const isObservableVariable = (ir: SemanticModel, variableId: string): boolean => {
  const variable = ir.variables[variableId];
  if (variable === undefined || variable.type === 'fixdt') return false;
  return !ir.ioMappings.some((mapping) => mapping.variableId === variableId && mapping.direction === 'read');
};

export interface ExpectationOptions {
  /** Restricts the variable expectations to these variables; all observable variables when absent. */
  readonly variableIds?: readonly string[];
  readonly states?: boolean;
  readonly errors?: boolean;
}

/** The C assertions for a result: every state active or inactive, every observable variable, no error. */
export const expectationsFromResult = (
  ir: SemanticModel,
  result: OracleResult,
  options: ExpectationOptions = {},
): SMTestExpectation[] => {
  const expectations: SMTestExpectation[] = [];
  if (options.states !== false) {
    const states = Object.values(ir.states).sort((a, b) => a.activityIndex - b.activityIndex);
    for (const state of states) {
      expectations.push(result.activeStateIds.has(state.id)
        ? { kind: 'active-state', layerId: state.layerId, stateId: state.id }
        : { kind: 'inactive-state', stateId: state.id });
    }
  }
  const variableIds = options.variableIds ?? Object.keys(ir.variables).sort();
  for (const variableId of variableIds) {
    if (!isObservableVariable(ir, variableId)) continue;
    const value = result.data[variableId];
    if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
      expectations.push({ kind: 'variable', variableId, value });
    }
  }
  if (options.errors !== false) expectations.push({ kind: 'error', code: null });
  return expectations;
};
