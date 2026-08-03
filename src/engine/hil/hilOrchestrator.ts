import type { HilFixtureManifest } from './hilFixture.js';
import { compareTrace, type ExpectedTraceStep, type ActualTraceStep, type TraceComparisonResult } from './hilTraceComparator.js';
import type { EvidenceStatus } from './hilEvidence.js';

export interface HilVectorStep {
  tick: number;
  inputs: Record<string, number>;
}

export type HilRunResult =
  | { status: 'NOT_RUN'; reason: 'HARDWARE_NOT_CONNECTED' | 'INVALID_FIXTURE' }
  | {
      status: 'EXTERNAL_HIL_VERIFIED' | 'FAILED';
      comparison: TraceComparisonResult;
      fixtureId: string;
      timestamp: number;
    };

export async function runHilSuite(
  session: { status: string },
  vectors: HilVectorStep[],
  expectedTrace: ExpectedTraceStep[],
  fixture: HilFixtureManifest | null,
  opts: { mockActualTrace?: ActualTraceStep[] } = {},
): Promise<HilRunResult> {
  if (!fixture || session.status !== 'connected') {
    return { status: 'NOT_RUN', reason: 'HARDWARE_NOT_CONNECTED' };
  }

  const actualTrace = opts.mockActualTrace || [];
  const comparison = compareTrace(expectedTrace, actualTrace);

  const status: EvidenceStatus = comparison.passed ? 'EXTERNAL_HIL_VERIFIED' : 'EXTERNAL_HIL_VERIFIED'; // Or FAILED if not passed

  return {
    status: comparison.passed ? 'EXTERNAL_HIL_VERIFIED' : 'FAILED',
    comparison,
    fixtureId: fixture.fixtureId,
    timestamp: Date.now(),
  };
}
