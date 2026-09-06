import type { SMTraceStep } from './smReferenceInterpreter';
import type { ActivityEvidence } from './smVerificationEvidence';

export interface SMCycleObservation {
  cycle: number;
  activeStates: readonly string[];
  variables: Readonly<Record<string, unknown>>;
  outputs: Readonly<Record<string, unknown>>;
  stateTimers: Readonly<Record<string, number>>;
  firedTransitions: readonly string[];
  executedActions: readonly string[];
  errorStatus: string | number;
  faultLatched: boolean;
}

export interface DifferentialDivergence {
  cycle: number;
  field: string;
  expected: unknown;
  actual: unknown;
  modelHash: string;
  inputVector?: Record<string, unknown>;
  replayCommand?: string;
}

export interface DifferentialEvidenceDetails {
  totalCycles: number;
  divergence: DifferentialDivergence | null;
  modelHash: string;
}

const canonicalEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return false;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!canonicalEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const keysA = Object.keys(a as Record<string, unknown>).sort();
  const keysB = Object.keys(b as Record<string, unknown>).sort();
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i++) {
    if (keysA[i] !== keysB[i]) return false;
    const key = keysA[i];
    if (!canonicalEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }
  return true;
};

export const compareCycleObservations = (
  reference: readonly SMCycleObservation[],
  candidate: readonly SMCycleObservation[],
  context: {
    modelHash: string;
    inputVectors?: readonly Record<string, unknown>[];
    replayCommand?: string;
  },
): ActivityEvidence<DifferentialEvidenceDetails> => {
  if (reference.length !== candidate.length) {
    const minLen = Math.min(reference.length, candidate.length);
    const divergence: DifferentialDivergence = {
      cycle: minLen,
      field: 'cycleCount',
      expected: reference.length,
      actual: candidate.length,
      modelHash: context.modelHash,
      inputVector: context.inputVectors?.[minLen],
      replayCommand: context.replayCommand,
    };
    return {
      activity: 'differential',
      status: 'FAIL',
      summary: `Differential trace cycle count mismatch: expected ${reference.length} cycles, got ${candidate.length}`,
      command: null,
      details: {
        totalCycles: candidate.length,
        divergence,
        modelHash: context.modelHash,
      },
    };
  }

  for (let i = 0; i < reference.length; i++) {
    const ref = reference[i];
    const can = candidate[i];

    const sortedRefStates = [...ref.activeStates].sort();
    const sortedCanStates = [...can.activeStates].sort();
    if (!canonicalEqual(sortedRefStates, sortedCanStates)) {
      const divergence: DifferentialDivergence = {
        cycle: ref.cycle,
        field: 'activeStates',
        expected: ref.activeStates,
        actual: can.activeStates,
        modelHash: context.modelHash,
        inputVector: context.inputVectors?.[i],
        replayCommand: context.replayCommand,
      };
      return {
        activity: 'differential',
        status: 'FAIL',
        summary: `Differential mismatch at cycle ${ref.cycle} in activeStates`,
        command: null,
        details: { totalCycles: reference.length, divergence, modelHash: context.modelHash },
      };
    }

    if (!canonicalEqual(ref.variables, can.variables)) {
      const divergence: DifferentialDivergence = {
        cycle: ref.cycle,
        field: 'variables',
        expected: ref.variables,
        actual: can.variables,
        modelHash: context.modelHash,
        inputVector: context.inputVectors?.[i],
        replayCommand: context.replayCommand,
      };
      return {
        activity: 'differential',
        status: 'FAIL',
        summary: `Differential mismatch at cycle ${ref.cycle} in variables`,
        command: null,
        details: { totalCycles: reference.length, divergence, modelHash: context.modelHash },
      };
    }

    if (!canonicalEqual(ref.outputs, can.outputs)) {
      const divergence: DifferentialDivergence = {
        cycle: ref.cycle,
        field: 'outputs',
        expected: ref.outputs,
        actual: can.outputs,
        modelHash: context.modelHash,
        inputVector: context.inputVectors?.[i],
        replayCommand: context.replayCommand,
      };
      return {
        activity: 'differential',
        status: 'FAIL',
        summary: `Differential mismatch at cycle ${ref.cycle} in outputs`,
        command: null,
        details: { totalCycles: reference.length, divergence, modelHash: context.modelHash },
      };
    }

    if (!canonicalEqual(ref.stateTimers, can.stateTimers)) {
      const divergence: DifferentialDivergence = {
        cycle: ref.cycle,
        field: 'stateTimers',
        expected: ref.stateTimers,
        actual: can.stateTimers,
        modelHash: context.modelHash,
        inputVector: context.inputVectors?.[i],
        replayCommand: context.replayCommand,
      };
      return {
        activity: 'differential',
        status: 'FAIL',
        summary: `Differential mismatch at cycle ${ref.cycle} in stateTimers`,
        command: null,
        details: { totalCycles: reference.length, divergence, modelHash: context.modelHash },
      };
    }

    if (!canonicalEqual(ref.firedTransitions, can.firedTransitions)) {
      const divergence: DifferentialDivergence = {
        cycle: ref.cycle,
        field: 'firedTransitions',
        expected: ref.firedTransitions,
        actual: can.firedTransitions,
        modelHash: context.modelHash,
        inputVector: context.inputVectors?.[i],
        replayCommand: context.replayCommand,
      };
      return {
        activity: 'differential',
        status: 'FAIL',
        summary: `Differential mismatch at cycle ${ref.cycle} in firedTransitions`,
        command: null,
        details: { totalCycles: reference.length, divergence, modelHash: context.modelHash },
      };
    }

    if (!canonicalEqual(ref.executedActions, can.executedActions)) {
      const divergence: DifferentialDivergence = {
        cycle: ref.cycle,
        field: 'executedActions',
        expected: ref.executedActions,
        actual: can.executedActions,
        modelHash: context.modelHash,
        inputVector: context.inputVectors?.[i],
        replayCommand: context.replayCommand,
      };
      return {
        activity: 'differential',
        status: 'FAIL',
        summary: `Differential mismatch at cycle ${ref.cycle} in executedActions`,
        command: null,
        details: { totalCycles: reference.length, divergence, modelHash: context.modelHash },
      };
    }

    if (ref.errorStatus !== can.errorStatus) {
      const divergence: DifferentialDivergence = {
        cycle: ref.cycle,
        field: 'errorStatus',
        expected: ref.errorStatus,
        actual: can.errorStatus,
        modelHash: context.modelHash,
        inputVector: context.inputVectors?.[i],
        replayCommand: context.replayCommand,
      };
      return {
        activity: 'differential',
        status: 'FAIL',
        summary: `Differential mismatch at cycle ${ref.cycle} in errorStatus`,
        command: null,
        details: { totalCycles: reference.length, divergence, modelHash: context.modelHash },
      };
    }

    if (ref.faultLatched !== can.faultLatched) {
      const divergence: DifferentialDivergence = {
        cycle: ref.cycle,
        field: 'faultLatched',
        expected: ref.faultLatched,
        actual: can.faultLatched,
        modelHash: context.modelHash,
        inputVector: context.inputVectors?.[i],
        replayCommand: context.replayCommand,
      };
      return {
        activity: 'differential',
        status: 'FAIL',
        summary: `Differential mismatch at cycle ${ref.cycle} in faultLatched`,
        command: null,
        details: { totalCycles: reference.length, divergence, modelHash: context.modelHash },
      };
    }
  }

  return {
    activity: 'differential',
    status: 'PASS',
    summary: `Differential equivalence confirmed across ${reference.length} cycles`,
    command: null,
    details: {
      totalCycles: reference.length,
      divergence: null,
      modelHash: context.modelHash,
    },
  };
};

export type VerificationStatus =
  | 'PASS'
  | 'FAIL'
  | 'NOT RUN'
  | 'NOT APPLICABLE'
  | 'UNSUPPORTED'
  | 'INTEGRATION REQUIRED'
  | 'BLOCKED';

export interface DivergenceInfo {
  tick: number;
  field: string;
  expected: any;
  actual: any;
}

export interface ReplayContext {
  modelHash: string;
  generatorVersion?: string;
  seed?: number;
  vectors?: any[];
}

export interface DifferentialResult {
  behavioralGenerationStatus: VerificationStatus;
  targetIntegrationStatus: VerificationStatus;
  productVerificationStatus: 'PASS' | 'FAIL' | 'INCOMPLETE';
  firstDivergence: DivergenceInfo | null;
  replayVectorJson?: string;
}

const CANONICAL_FIELDS = [
  'activeStates',
  'transitionIds',
  'exitActions',
  'transitionActions',
  'entryActions',
  'consumedEvents',
  'emittedEvents',
  'variables',
  'timers',
  'error',
] as const;

export function compareTraces(
  refTrace: readonly SMTraceStep[],
  genTrace: readonly SMTraceStep[],
  context: ReplayContext
): DifferentialResult {
  if (refTrace.length !== genTrace.length) {
    return makeFail(0, 'traceLength', refTrace.length, genTrace.length, context);
  }

  for (let i = 0; i < refTrace.length; i++) {
    const ref = refTrace[i];
    const gen = genTrace[i];

    if (ref.tick !== gen.tick) {
      return makeFail(ref.tick, 'tick', ref.tick, gen.tick, context);
    }

    for (const field of CANONICAL_FIELDS) {
      const refVal = JSON.stringify((ref as any)[field]);
      const genVal = JSON.stringify((gen as any)[field]);

      if (refVal !== genVal) {
        return makeFail(ref.tick, field, (ref as any)[field], (gen as any)[field], context);
      }
    }
  }

  return {
    behavioralGenerationStatus: 'PASS',
    targetIntegrationStatus: 'INTEGRATION REQUIRED',
    productVerificationStatus: 'INCOMPLETE',
    firstDivergence: null
  };
}

function makeFail(tick: number, field: string, expected: any, actual: any, context: ReplayContext): DifferentialResult {
  const firstDivergence = { tick, field, expected, actual };
  return {
    behavioralGenerationStatus: 'FAIL',
    targetIntegrationStatus: 'INTEGRATION REQUIRED',
    productVerificationStatus: 'INCOMPLETE',
    firstDivergence,
    replayVectorJson: JSON.stringify({
      modelHash: context.modelHash,
      generatorVersion: context.generatorVersion || '3.1',
      seed: context.seed,
      vectors: context.vectors || [],
      firstDivergence
    }, null, 2)
  };
}
