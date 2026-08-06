import { describe, expect, it } from 'vitest';
import { compileAndRunCTrace, runInterpreterTrace } from './smCHarness';
import { compareSemanticTraces } from './smTrace';
import { XB_EXECUTABLE_C_CASES } from './xbCConformanceCases';

describe('X-Bridges Declared C Conformance', () => {
  it.each(Object.entries(XB_EXECUTABLE_C_CASES))(
    'compiles and executes %s matching canonical interpreter trace',
    { timeout: 60_000 },
    (id, testCase) => {
      const expected = runInterpreterTrace(testCase.fixture);
      const actual = compileAndRunCTrace(testCase.fixture);
      const diff = compareSemanticTraces(expected, actual, testCase.tolerance);
      expect(diff, `Mismatch in case ${id}: ${JSON.stringify(diff)}`).toBeNull();
    },
  );
});
