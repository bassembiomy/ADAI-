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
): boolean => {
  if (left === undefined || right === undefined) return left === right;
  const arraysEqual = <T>(
    leftItems: readonly T[],
    rightItems: readonly T[],
  ): boolean => leftItems.length === rightItems.length
    && leftItems.every((value, index) => Object.is(value, rightItems[index]));
  const recordsEqual = (
    leftRecord: Readonly<Record<string, unknown>>,
    rightRecord: Readonly<Record<string, unknown>>,
  ): boolean => {
    const leftKeys = Object.keys(leftRecord).sort();
    const rightKeys = Object.keys(rightRecord).sort();
    return arraysEqual(leftKeys, rightKeys)
      && leftKeys.every((key) =>
        Object.is(leftRecord[key], rightRecord[key]));
  };
  return left.sequence === right.sequence
    && Object.is(left.elapsedMs, right.elapsedMs)
    && arraysEqual(left.activeStateIds, right.activeStateIds)
    && arraysEqual(left.actions, right.actions)
    && recordsEqual(left.data, right.data)
    && recordsEqual(left.stateTimersMs, right.stateTimersMs)
    && recordsEqual(left.history, right.history)
    && recordsEqual(left.mappedOutputs, right.mappedOutputs)
    && left.ioEffects.safeOutputsApplied
      === right.ioEffects.safeOutputsApplied
    && left.ioEffects.watchdogKicks === right.ioEffects.watchdogKicks
    && left.error === right.error;
};

export const compareSemanticTraces = (
  expected: readonly SemanticTraceFrame[],
  actual: readonly SemanticTraceFrame[],
): TraceDifference | null => {
  for (
    let index = 0;
    index < Math.max(expected.length, actual.length);
    index += 1
  ) {
    if (!framesEqual(expected[index], actual[index])) {
      return {
        index,
        expected: expected[index],
        actual: actual[index],
      };
    }
  }
  return null;
};
