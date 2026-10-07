/**
 * Runtime numeric diagnostics (WP-09b, F-045). A block equation that returns a non-finite residual, reads a non-finite
 * input, or throws is never turned into a zero residual: it surfaces as a diagnostic naming the block and the row.
 *
 * Solver contract:
 *  - NonFiniteResidualError is RECOVERABLE. Newton treats a non-finite residual at a trial point as a failed iterate
 *    (the damped step is rejected); at the base point of an iteration it aborts the solve, and the physics engine
 *    rejects the step and halves h. At the minimum step it is rethrown, naming the block.
 *  - BlockEquationError (an equation threw) is NOT recoverable: it is rethrown immediately, never retried on zeros.
 *  - SolverConvergenceError (Newton missed the tolerance, WP-31b) is recoverable above the minimum step; at the minimum step
 *    the engine throws VLabSolverDiagnosticError naming the worst residual rows. No state is accepted unconverged (F-050).
 */
export type ResidualDiagnosticKind = 'non-finite-residual' | 'non-finite-input' | 'equation-threw';

export interface ResidualDiagnostic {
  kind: ResidualDiagnosticKind;
  blockId: string;
  blockType: string;
  /** row inside the block's own equation vector (-1 when the failure is not tied to a row) */
  rowIndex: number;
  /** name of the unknown that owns the row, or of the non-finite input */
  variable?: string;
  /** the offending value (NaN / Infinity) */
  value?: number;
  /** message of the thrown equation error */
  error?: string;
  reason: string;
}

const summarize = (diagnostics: ResidualDiagnostic[]) =>
  diagnostics.slice(0, 3).map(d => d.reason).join(' | ') + (diagnostics.length > 3 ? ` (+${diagnostics.length - 3} more)` : '');

export class NonFiniteResidualError extends Error {
  readonly diagnostics: ResidualDiagnostic[];
  readonly recoverable = true;
  constructor(diagnostics: ResidualDiagnostic[]) {
    super(`Non-finite V-Lab residual: ${summarize(diagnostics)}`);
    this.name = 'NonFiniteResidualError';
    this.diagnostics = diagnostics;
  }
  get diagnostic(): ResidualDiagnostic { return this.diagnostics[0]; }
}

export class BlockEquationError extends Error {
  readonly diagnostics: ResidualDiagnostic[];
  readonly recoverable = false;
  constructor(diagnostics: ResidualDiagnostic[], readonly cause?: unknown) {
    super(`V-Lab block equation failed: ${summarize(diagnostics)}`);
    this.name = 'BlockEquationError';
    this.diagnostics = diagnostics;
  }
  get diagnostic(): ResidualDiagnostic { return this.diagnostics[0]; }
}

/**
 * WP-31b (F-051): a (near-)singular pivot met by the LU factorization of the Newton matrix. `column` is the unknown
 * (global index) whose pivot vanished after row/column equilibration; `pivot` is the equilibrated magnitude.
 */
export interface SingularPivot { column: number; pivot: number }

export class SingularMatrixError extends Error {
  constructor(readonly pivots: SingularPivot[]) {
    super(`Singular Newton matrix: no usable pivot for unknown(s) ${pivots.map(p => `#${p.column} (|pivot| ${p.pivot.toExponential(2)})`).join(', ')}`);
    this.name = 'SingularMatrixError';
  }
}

/**
 * WP-31b (F-050): Newton did not reach the nonlinear tolerance. Carries the best iterate and its residual vector so the
 * physics engine can name the rows (and their blocks) that did not converge. RECOVERABLE above the minimum step.
 */
export class SolverConvergenceError extends Error {
  constructor(
    message: string,
    readonly bestX: number[],
    readonly residual: number[],
    readonly residualNorm: number,
    readonly singular?: SingularPivot[],
  ) {
    super(message);
    this.name = 'SolverConvergenceError';
  }
}

export interface WorstResidualRow { blockId: string; blockType: string; row: number; variable: string; value: number }

export interface SolverDiagnostic {
  /** simulation time at the start of the failed step [s] */
  time: number;
  /** step size of the failed attempt [s] */
  h: number;
  reason: string;
  /** largest |residual| rows of the best Newton iterate, worst first */
  worstResidualRows: WorstResidualRow[];
  /** unknowns whose pivot vanished (singular Newton matrix), if that was the cause */
  singularUnknowns?: { variable: string; blockId: string }[];
  /** blocks of the model (id: type) */
  blocks: string[];
}

/** WP-31b: the solver cannot advance (non-convergence at the minimum step, or the per-call work budget is exhausted). NOT recoverable. */
export class VLabSolverDiagnosticError extends Error {
  readonly recoverable = false;
  constructor(message: string, readonly diagnostic: SolverDiagnostic) {
    const rows = diagnostic.worstResidualRows.slice(0, 3)
      .map(r => `${r.blockId || '?'}(${r.blockType || '?'}) row ${r.row} [${r.variable}] = ${r.value.toExponential(3)}`).join('; ');
    super(`${message}${rows ? ` Worst residual rows: ${rows}.` : ''}`);
    this.name = 'VLabSolverDiagnosticError';
  }
}

/** Residual from a solver-level evaluation that has no block owner (e.g. a unit-test equation set). */
export const anonymousNonFinite = (rowIndex: number, value: number): ResidualDiagnostic => ({
  kind: 'non-finite-residual', blockId: '', blockType: '', rowIndex, value,
  reason: `residual row ${rowIndex} is ${value}`,
});

/**
 * WP-31c: the caller cancelled the step (worker cancel flag, see VLabPhysicsEngine.setCancellation). Checked once per solver attempt, so
 * a long step stops within one Newton solve. NOT recoverable; no state is returned.
 */
export class VLabCancelledError extends Error {
  readonly recoverable = false;
  constructor(readonly time: number, readonly acceptedSteps: number) {
    super(`V-Lab step cancelled at t=${time} after ${acceptedSteps} accepted solver step(s).`);
    this.name = 'VLabCancelledError';
  }
}
