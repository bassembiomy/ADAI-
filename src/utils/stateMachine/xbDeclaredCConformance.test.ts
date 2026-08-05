import { describe, expect, it } from 'vitest';
import { compileAndRunCTrace, runInterpreterTrace } from './smCHarness';
import { compareSemanticTraces } from './smTrace';
import type { XBridgesTraceValue } from './smTrace';
import { XB_EXECUTABLE_C_CONFORMANCE_CASES } from './xbCConformanceCases';

const expectSignalValue = (
  actual: XBridgesTraceValue | undefined,
  expected: number | boolean | readonly number[],
): void => {
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual)).toBe(true);
    const actualValues = actual as readonly (number | boolean)[];
    expect(actualValues).toHaveLength(expected.length);
    expected.forEach((value, index) => {
      expect(actualValues[index] as number).toBeCloseTo(value, 5);
    });
    return;
  }
  if (typeof expected === 'number') {
    expect(actual as number).toBeCloseTo(expected, 5);
    return;
  }
  expect(actual).toBe(expected);
};

describe('declared X-Bridges strict-C99 conformance', { timeout: 120_000 }, () => {
  it.each(XB_EXECUTABLE_C_CONFORMANCE_CASES)(
    '$conformanceCaseId executes $id',
    (testCase) => {
      const fixture = {
        name: 'flat-priority' as const,
        model: testCase.model,
        steps: testCase.steps,
      };
      const interpreter = runInterpreterTrace(fixture);
      const compiledC = compileAndRunCTrace(fixture);

      expect(compareSemanticTraces(interpreter, compiledC)).toBeNull();
      const signals = interpreter.at(-1)?.xBridges.controller?.signals ?? {};
      for (const [signalId, expected] of Object.entries(testCase.expectedFinalSignals)) {
        expectSignalValue(signals[signalId], expected);
      }
    },
  );
});
