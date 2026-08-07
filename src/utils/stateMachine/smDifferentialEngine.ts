import type { SMTraceStep } from './smReferenceInterpreter';

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
