/**
 * Runtime numeric diagnostics (WP-09b, F-045). A block equation that returns a non-finite residual, reads a non-finite
 * input, or throws is never turned into a zero residual: it surfaces as a diagnostic naming the block and the row.
 *
 * Solver contract:
 *  - NonFiniteResidualError is RECOVERABLE. Newton treats a non-finite residual at a trial point as a failed iterate
 *    (the damped step is rejected); at the base point of an iteration it aborts the solve, and the physics engine
 *    rejects the step and halves h. At the minimum step it is rethrown, naming the block.
 *  - BlockEquationError (an equation threw) is NOT recoverable: it is rethrown immediately, never retried on zeros.
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

/** Residual from a solver-level evaluation that has no block owner (e.g. a unit-test equation set). */
export const anonymousNonFinite = (rowIndex: number, value: number): ResidualDiagnostic => ({
  kind: 'non-finite-residual', blockId: '', blockType: '', rowIndex, value,
  reason: `residual row ${rowIndex} is ${value}`,
});
