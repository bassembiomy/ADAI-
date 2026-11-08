/**
 * Simulink-style evaluation of block parameter text (MATLAB expressions).
 * Contract: docs/superpowers/plans/2026-11-08-xbridges-parameter-errors.md (WP1). Implementation pending (Sonnet).
 */
export type ParameterKind =
  | { kind: 'number' }
  | { kind: 'numeric' }
  | { kind: 'vector' }
  | { kind: 'matrix' }
  | { kind: 'integer'; min?: number; max?: number }
  | { kind: 'positive' }
  | { kind: 'nonnegative' }
  | { kind: 'sampleTime' }
  | { kind: 'boolean' }
  | { kind: 'option'; options: readonly string[] };

export type ParameterErrorCode =
  | 'PARAMETER_EMPTY'
  | 'PARAMETER_INVALID'
  | 'PARAMETER_NOT_INTEGER'
  | 'PARAMETER_OUT_OF_RANGE'
  | 'PARAMETER_OPTION_INVALID';

export type ParameterEvaluation =
  | { ok: true; value: number | number[] | number[][] | boolean | string }
  | { ok: false; code: ParameterErrorCode; reason: string };

export function evaluateParameter(_raw: unknown, _kind: ParameterKind): ParameterEvaluation {
  throw new Error('evaluateParameter: not implemented yet');
}
