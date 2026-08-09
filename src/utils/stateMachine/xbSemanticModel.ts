import type { ModelDiagnostic } from './smModel';
import type { SemanticVariable, SemanticVariableSymbol, XBOwnerState } from './smSemanticModel';
import type {
  XBParameterValue,
  XBPersistedModelV1,
  XBStatePolicy,
  XBTargetCapabilities,
} from './xbModel';

export interface XBSemanticMapping {
  readonly sourceVariableId: string;
  readonly variable: SemanticVariableSymbol;
  readonly variableId: string;
  readonly signalId: string;
  readonly blockId: string;
  readonly portId: string;
  readonly direction: 'in' | 'out';
  readonly numericType: XBNumericType;
}

export interface XBSemanticModel {
  readonly stateId: string;
  readonly ownerState: XBOwnerState;
  readonly executionOrder: readonly string[];
  readonly operations: Readonly<Record<string, XBSemanticOperation>>;
  readonly signals: Readonly<Record<string, XBSemanticSignal>>;
  readonly mappings: readonly XBSemanticMapping[];
  readonly solver: {
    readonly kind: 'euler' | 'rk4';
    /** Canonical fixed solver interval, validated against the base tick. */
    readonly stepSeconds: number;
    readonly substepsPerTick: number;
  };
  readonly policy: XBStatePolicy;
}

export interface XBSemanticBuildInput {
  readonly stateId: string;
  readonly ownerState?: XBOwnerState;
  readonly variableSymbols?: ReadonlyMap<string, SemanticVariableSymbol>;
  readonly model: XBPersistedModelV1;
  readonly variables: Readonly<Record<string, SemanticVariable>>;
  readonly target: XBTargetCapabilities;
  readonly baseTickMs: number;
}

import type { XBNumericType, XBShape } from './xbNumeric';
import type { XBOverflowMode, XBRoundingMode } from './xbNumeric';

export type XBSignalLayout = 'scalar' | 'contiguous' | 'row-major';
export type XBSignalStorage = 'native' | 'stored-integer';

/** Compile-time integer schedule measured exclusively in solver substeps. */
export interface XBSemanticSchedule {
  readonly periodSubsteps: number;
  readonly offsetSubsteps: number;
  readonly initialCounter: number;
  readonly counterIncrement: number;
  readonly hold: 'none' | 'zero-order';
}

/** One resolved block port, including its source when the port is an input. */
export interface XBSemanticSignal {
  readonly id: string;
  readonly nodeId: string;
  readonly portId: string;
  readonly direction: 'input' | 'output';
  readonly sourceSignalId: string | null;
  readonly shape: XBShape;
  readonly dimensions: readonly number[];
  readonly elementCount: number;
  readonly layout: XBSignalLayout;
  readonly numericType: XBNumericType;
  readonly storage: XBSignalStorage;
}

export interface XBSemanticConversion {
  readonly destinationType: XBNumericType;
  readonly rounding: Exclude<XBRoundingMode, 'simplest'>;
  readonly overflow: XBOverflowMode;
  readonly mode: 'real-world-value' | 'stored-integer-reinterpretation';
}

export interface XBSemanticStateSlot {
  readonly id: string;
  /** Stable block-local state identity, independent of any exposed output. */
  readonly role: string;
  /** Optional output signal that exposes this state during read-before-update. */
  readonly signalId: string | null;
  readonly numericType: XBNumericType;
  readonly shape: XBShape;
  readonly initialValues: readonly (number | boolean)[];
}

/** Constrained roles for noise block state slots. */
export type XBNoiseStateSlotRole = 'rng_state' | 'spare_normal' | 'has_spare_normal';

export interface XBNoiseStateSlot extends XBSemanticStateSlot {
  readonly role: XBNoiseStateSlotRole;
}

export interface XBSemanticStateBoundary {
  readonly outputPhase: 'read-before-update';
  readonly updatePhase: 'after-direct-feedthrough';
  readonly slots: readonly XBSemanticStateSlot[];
}

/** Recoverable numeric-fault behavior resolved at the semantic boundary. */
export interface XBNumericFaultContract {
  readonly fallback: 'zero' | 'previous-value';
  /** Existing model-owned error/e output when the block declares one. */
  readonly errorSignalId: string | null;
}

/** Resolved and normalized PID parameters for the advanced PID controller. */
export interface XBPidParameters {
  readonly mode: 'continuous' | 'discrete';
  readonly kp: number;
  readonly ki: number;
  readonly kd: number;
  readonly filterN: number;
  readonly beta: number;
  readonly gamma: number;
  readonly minimum: number;
  readonly maximum: number;
  readonly method: 'ForwardEuler' | 'BackwardEuler' | 'Trapezoidal';
  readonly sampleTime: number;
}

export interface XBStepOperationParameters {
  readonly initialValue: number;
  readonly finalValue: number;
  readonly threshold: {
    readonly milliseconds: number;
    readonly alignment: 'ceil-to-tick' | 'exact';
  };
  readonly timerSource: {
    readonly kind: 'stateElapsedTime';
    readonly stateId: string;
    readonly stateIndexSymbol: string;
  };
}

export interface XBDelayParameters {
  readonly delayLength: number;
  readonly initialCondition: number;
  readonly samplePeriod: number;
  readonly isUnitDelay: boolean;
}

/** A generic operation description interpreted or rendered by later stages. */
export interface XBSemanticOperation {
  readonly id: string;
  readonly type: string;
  readonly inputSignalIds: readonly string[];
  readonly outputSignalIds: readonly string[];
  readonly parameters: Readonly<Record<string, XBParameterValue>>;
  readonly directFeedthrough: boolean;
  readonly stateful: boolean;
  readonly conversion: XBSemanticConversion | null;
  readonly state: XBSemanticStateBoundary | null;
  readonly schedule: XBSemanticSchedule;
  /** Present on every builder-produced operation; optional for legacy IR fixtures. */
  readonly numericFault?: XBNumericFaultContract;
  readonly pidParameters?: XBPidParameters;
  readonly stepParameters?: XBStepOperationParameters;
  readonly delayParameters?: XBDelayParameters;
}


export interface XBSemanticMapping {
  readonly variableId: string;
  readonly signalId: string;
  readonly blockId: string;
  readonly portId: string;
  readonly direction: 'in' | 'out';
  readonly numericType: XBNumericType;
}

export interface XBSemanticModel {
  readonly stateId: string;
  readonly executionOrder: readonly string[];
  readonly operations: Readonly<Record<string, XBSemanticOperation>>;
  readonly signals: Readonly<Record<string, XBSemanticSignal>>;
  readonly mappings: readonly XBSemanticMapping[];
  readonly solver: {
    readonly kind: 'euler' | 'rk4';
    /** Canonical fixed solver interval, validated against the base tick. */
    readonly stepSeconds: number;
    readonly substepsPerTick: number;
  };
  readonly policy: XBStatePolicy;
}

export interface XBSemanticBuildInput {
  readonly stateId: string;
  readonly model: XBPersistedModelV1;
  readonly variables: Readonly<Record<string, SemanticVariable>>;
  readonly target: XBTargetCapabilities;
  readonly baseTickMs: number;
}

export interface XBSemanticBuildResult {
  readonly ir?: XBSemanticModel;
  readonly diagnostics: readonly ModelDiagnostic[];
}

const deepFreeze = <T>(value: T, seen = new WeakSet<object>()): T => {
  if (value === null || typeof value !== 'object') return value;
  const object = value as object;
  if (seen.has(object)) return value;
  seen.add(object);
  for (const child of Object.values(object)) deepFreeze(child, seen);
  return Object.freeze(value);
};

export const freezeXBSemanticModel = (
  model: XBSemanticModel,
): XBSemanticModel => deepFreeze(model);
