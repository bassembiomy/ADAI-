export interface ExpectedTraceStep {
  tick: number;
  states: Record<string, string>;
  variables: Record<string, number>;
}

export interface ActualTraceStep {
  tick: number;
  states: Record<string, string>;
  variables: Record<string, number>;
}

export interface TraceComparisonOptions {
  floatTolerance?: number;
}

export interface FirstDivergence {
  stimulusIndex: number;
  field: string;
  expected: unknown;
  actual: unknown;
}

export interface TraceComparisonResult {
  passed: boolean;
  firstDivergence?: FirstDivergence;
}

export function compareTrace(
  expected: ExpectedTraceStep[],
  actual: ActualTraceStep[],
  options: TraceComparisonOptions = {},
): TraceComparisonResult {
  const tolerance = options.floatTolerance ?? 1e-4;

  const count = Math.min(expected.length, actual.length);
  for (let i = 0; i < count; i++) {
    const expStep = expected[i];
    const actStep = actual[i];

    // Check states
    for (const [region, expState] of Object.entries(expStep.states)) {
      const actState = actStep.states[region];
      if (actState !== expState) {
        return {
          passed: false,
          firstDivergence: {
            stimulusIndex: i,
            field: `regions.${region}`,
            expected: expState,
            actual: actState,
          },
        };
      }
    }

    // Check variables
    for (const [varName, expVal] of Object.entries(expStep.variables)) {
      const actVal = actStep.variables[varName];
      if (actVal === undefined || Math.abs(actVal - expVal) > tolerance) {
        return {
          passed: false,
          firstDivergence: {
            stimulusIndex: i,
            field: `variables.${varName}`,
            expected: expVal,
            actual: actVal,
          },
        };
      }
    }
  }

  if (expected.length !== actual.length) {
    return {
      passed: false,
      firstDivergence: {
        stimulusIndex: count,
        field: 'trace.length',
        expected: expected.length,
        actual: actual.length,
      },
    };
  }

  return { passed: true };
}
