export interface CandidateEvaluationRecord {
  readonly iteration: number;
  readonly parameters: Record<string, number>;
  readonly score: number;
  readonly metricValue?: number;
  readonly proofStatus: 'proved' | 'refused' | 'cancelled';
  readonly engineRunId?: string;
  readonly modelHash?: string;
  readonly constraintViolations: string[];
}

export interface OptimizationReport {
  readonly status: 'optimal_found' | 'budget_exhausted' | 'no_feasible_solution' | 'refused';
  readonly objective: string;
  readonly targetMetric: string;
  readonly direction: 'minimize' | 'maximize';
  readonly totalEvaluated: number;
  readonly bestRecord?: CandidateEvaluationRecord;
  readonly history: readonly CandidateEvaluationRecord[];
  readonly reason?: string;
}
