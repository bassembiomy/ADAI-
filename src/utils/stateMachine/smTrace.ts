export type XBridgesTraceScalar = number | boolean;
export type XBridgesTraceValue =
  | XBridgesTraceScalar
  | XBridgesTraceScalar[]
  | XBridgesTraceScalar[][];

export interface XBridgesStateTrace {
  signals: Record<string, XBridgesTraceValue>;
  blockState: Record<string, Record<string, XBridgesTraceValue>>;
  faults: string[];
}

export interface SemanticTraceFrame {
  sequence: number;
  elapsedMs: number;
  activeStateIds: string[];
  actions: string[];
  data: Record<string, number | boolean>;
  stateTimersMs: Record<string, number>;
  history: Record<string, string | null>;
  mappedOutputs: Record<string, number | boolean>;
  ioEffects: {
    safeOutputsApplied: number;
    watchdogKicks: number;
  };
  xBridges: Record<string, XBridgesStateTrace>;
  error: string | null;
}

export interface TraceDifference {
  index: number;
  expected: SemanticTraceFrame | undefined;
  actual: SemanticTraceFrame | undefined;
}

export const xBridgesTraceAction = (stateLabel: string): string =>
  `xbridges:${stateLabel}`;

const framesEqual = (
  left: SemanticTraceFrame | undefined,
  right: SemanticTraceFrame | undefined,
  tolerance?: Readonly<{ absolute: number; relative: number }>
): boolean => {
  if (left === undefined || right === undefined) return left === right;
  const arraysEqual = <T>(
    leftItems: readonly T[],
    rightItems: readonly T[],
  ): boolean => leftItems.length === rightItems.length
    && leftItems.every((value, index) => Object.is(value, rightItems[index]));
  const valuesEqual = (leftValue: unknown, rightValue: unknown): boolean => {
    if (Object.is(leftValue, rightValue)) return true;
    if (typeof leftValue === 'number' && typeof rightValue === 'number' && tolerance) {
      if (Number.isNaN(leftValue) && Number.isNaN(rightValue)) return true;
      const diff = Math.abs(leftValue - rightValue);
      if (diff <= tolerance.absolute) return true;
      if (diff <= Math.max(Math.abs(leftValue), Math.abs(rightValue)) * tolerance.relative) return true;
    }
    if (Array.isArray(leftValue) || Array.isArray(rightValue)) {
      return Array.isArray(leftValue) && Array.isArray(rightValue)
        && leftValue.length === rightValue.length
        && leftValue.every((value, index) =>
          valuesEqual(value, rightValue[index]));
    }
    if (
      leftValue === null || rightValue === null
      || typeof leftValue !== 'object' || typeof rightValue !== 'object'
    ) return false;
    const leftRecord = leftValue as Readonly<Record<string, unknown>>;
    const rightRecord = rightValue as Readonly<Record<string, unknown>>;
    const leftKeys = Object.keys(leftRecord).sort();
    const rightKeys = Object.keys(rightRecord).sort();
    return arraysEqual(leftKeys, rightKeys)
      && leftKeys.every((key) => valuesEqual(leftRecord[key], rightRecord[key]));
  };
  return left.sequence === right.sequence
    && Object.is(left.elapsedMs, right.elapsedMs)
    && arraysEqual(left.activeStateIds, right.activeStateIds)
    && arraysEqual(left.actions, right.actions)
    && valuesEqual(left.data, right.data)
    && valuesEqual(left.stateTimersMs, right.stateTimersMs)
    && valuesEqual(left.history, right.history)
    && valuesEqual(left.mappedOutputs, right.mappedOutputs)
    && valuesEqual(left.xBridges, right.xBridges)
    && left.ioEffects.safeOutputsApplied
      === right.ioEffects.safeOutputsApplied
    && left.ioEffects.watchdogKicks === right.ioEffects.watchdogKicks
    && left.error === right.error;
};

export const compareSemanticTraces = (
  expected: readonly SemanticTraceFrame[],
  actual: readonly SemanticTraceFrame[],
  tolerance?: Readonly<{ absolute: number; relative: number }>
): TraceDifference | null => {
  for (
    let index = 0;
    index < Math.max(expected.length, actual.length);
    index += 1
  ) {
    if (!framesEqual(expected[index], actual[index], tolerance)) {
      return {
        index,
        expected: expected[index],
        actual: actual[index],
      };
    }
  }
  return null;
};
