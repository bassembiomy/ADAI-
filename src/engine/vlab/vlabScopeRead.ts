/**
 * Scope / probe read path (WP-09b). A scope channel is a SCALAR measurement of one signal output. Anything else
 * (a vector, a Frame value, a non-finite number, a variable that does not exist) is a diagnostic, never coerced:
 * no `[0]`, no `Number(x)`, no `|| 0`.
 */
export type ScopeReadCode = 'frame' | 'vector' | 'non-finite' | 'out-of-range';

export interface ScopeReadDiagnostic {
  code: ScopeReadCode;
  scopeId: string;
  /** 1-based scope channel */
  channel: number;
  variable?: string;
  reason: string;
}

export class ScopeReadError extends Error {
  readonly diagnostic: ScopeReadDiagnostic;
  constructor(diagnostic: ScopeReadDiagnostic) {
    super(`V-Lab scope read failed: ${diagnostic.reason}`);
    this.name = 'ScopeReadError';
    this.diagnostic = diagnostic;
  }
}

/** Across variable of one Frame coordinate (`Across_<net>_Px_(frame)`): six of them make one Frame value. */
export const FRAME_COORDINATE_VARIABLE = /_(Px|Py|Pz|Rx|Ry|Rz)_\((frame|multibodyframe)\)$/;

export interface ScopeReadContext { scopeId: string; channel: number; variable?: string }

const fail = (code: ScopeReadCode, ctx: ScopeReadContext, what: string): never => {
  throw new ScopeReadError({
    code, scopeId: ctx.scopeId, channel: ctx.channel, variable: ctx.variable,
    reason: `scope "${ctx.scopeId}" channel ${ctx.channel}${ctx.variable ? ` (${ctx.variable})` : ''}: ${what}`,
  });
};

/** The one place a raw solver / probe value becomes a scope sample. */
export function scalarSample(value: unknown, ctx: ScopeReadContext): number {
  if (ctx.variable && FRAME_COORDINATE_VARIABLE.test(ctx.variable)) {
    return fail('frame', ctx, 'reads a Frame coordinate; a Frame is not a scalar signal (use a Transform Sensor for its components)');
  }
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    return fail('vector', ctx, `received a vector of ${(value as ArrayLike<number>).length} components; expose its components or its magnitude explicitly`);
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fail('non-finite', ctx, `value ${String(value)} is not a finite number`);
  }
  return value;
}

/** Scalar sample of unknown `index` of the solved vector. */
export function readSolvedVariable(x: ArrayLike<number>, variableNames: readonly string[], index: number, ctx: Omit<ScopeReadContext, 'variable'>): number {
  if (!Number.isInteger(index) || index < 0 || index >= x.length) {
    return fail('out-of-range', ctx, `variable index ${index} is outside the ${x.length} solved unknowns`);
  }
  return scalarSample(x[index], { ...ctx, variable: variableNames[index] });
}
