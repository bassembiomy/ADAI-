/**
 * WP-08: the single numeric-parameter path of the V-Lab engine.
 *
 * Every equation reads numeric parameters through `numericParam`. It replaces the old `params.X || default`
 * truthiness fallbacks, which silently turned a user-supplied 0 (or a typo) into the default value.
 *
 *  - missing (undefined / null / '')           -> the documented default
 *  - serialized `{ value, unit }` wrapper      -> unwrapped
 *  - number or numeric text ("1e-3", "-2.5E+4") -> that number (0 and negatives are legal values)
 *  - NaN, +-Infinity, malformed text, booleans -> VLabParamError with a structured diagnostic. NEVER a default.
 *
 * Physical bounds (R > 0, damping >= 0, ratio != 0, ...) live next to each parameter in vlabLibrary.ts
 * (`min`, `max`, `exclusiveMin`, `exclusiveMax`, `nonZero`) and are enforced before assembly by
 * `validateBlockParams`, which `validateTopology` reports through the same diagnostic path as wiring errors.
 */
import { VLAB_LIBRARY, type VLabBlock, type VLabParamSpec } from '../../utils/vlabLibrary';

export type ParamDiagnosticCode = 'invalid-parameter' | 'parameter-out-of-range';

export interface ParamDiagnostic {
  blockId: string;
  param: string;
  raw: unknown;
  reason: string;
  code: ParamDiagnosticCode;
}

export class VLabParamError extends Error {
  readonly diagnostics: ParamDiagnostic[];
  constructor(diagnostics: ParamDiagnostic[]) {
    super(`Invalid V-Lab parameter: ${diagnostics.map(d => d.reason).join(' | ')}`);
    this.name = 'VLabParamError';
    this.diagnostics = diagnostics;
  }
}

export type ParsedNumeric =
  | { kind: 'missing' }
  | { kind: 'ok'; value: number }
  | { kind: 'invalid'; raw: unknown; reason: string };

const NUMERIC_TEXT = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

export const unwrapParam = (raw: unknown): unknown => {
  let v = raw;
  while (v && typeof v === 'object' && !Array.isArray(v) && 'value' in (v as object)) v = (v as { value: unknown }).value;
  return v;
};

/** Classify one raw parameter value. Pure; never falls back. */
export function parseNumeric(raw: unknown): ParsedNumeric {
  const v = unwrapParam(raw);
  if (v === undefined || v === null) return { kind: 'missing' };
  if (typeof v === 'number') {
    return Number.isFinite(v) ? { kind: 'ok', value: v } : { kind: 'invalid', raw: v, reason: `${String(v)} is not a finite number` };
  }
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '') return { kind: 'missing' };
    if (!NUMERIC_TEXT.test(t)) return { kind: 'invalid', raw: v, reason: `"${v}" is not a number` };
    const n = Number(t);
    return Number.isFinite(n) ? { kind: 'ok', value: n } : { kind: 'invalid', raw: v, reason: `"${v}" is not a finite number` };
  }
  return { kind: 'invalid', raw: v, reason: `a ${Array.isArray(v) ? 'list' : typeof v} is not a number` };
}

/**
 * Numeric parameter `key` of `params`, or `fallback` when it is missing.
 * Throws VLabParamError (never returns the fallback) when the user supplied something that is not a finite number.
 * `blockId` is optional; the assembler fills it in when it catches the error.
 */
export function numericParam(params: Record<string, any> | undefined | null, key: string, fallback: number, blockId = ''): number {
  const r = parseNumeric(params?.[key]);
  if (r.kind === 'ok') return r.value;
  if (r.kind === 'missing') return fallback;
  throw new VLabParamError([{ blockId, param: key, raw: r.raw, reason: `Parameter "${key}"${blockId ? ` of "${blockId}"` : ''}: ${r.reason}.`, code: 'invalid-parameter' }]);
}

/** Text / enum parameter: missing or blank -> fallback, otherwise the (unwrapped) value as a string. */
export function stringParam(params: Record<string, any> | undefined | null, key: string, fallback: string): string {
  const v = unwrapParam(params?.[key]);
  if (v === undefined || v === null) return fallback;
  const s = String(v);
  return s.trim() === '' ? fallback : s;
}

/**
 * Numeric list parameter written as an array or as text ("[0 1 2]", "0, 1, 2", "[1; 2]").
 * Missing / blank -> fallback. Any non-numeric element throws VLabParamError.
 */
export function vectorParam(params: Record<string, any> | undefined | null, key: string, fallback: number[], blockId = ''): number[] {
  const v = unwrapParam(params?.[key]);
  if (v === undefined || v === null) return fallback;
  let items: unknown[];
  if (Array.isArray(v)) items = v;
  else if (typeof v === 'string') {
    const t = v.replace(/[[\]]/g, ' ').trim();
    if (t === '') return fallback;
    items = t.split(/[\s,;]+/).filter(Boolean);
  } else items = [v];
  const out: number[] = [];
  for (const item of items) {
    const r = parseNumeric(item);
    if (r.kind !== 'ok') {
      throw new VLabParamError([{
        blockId, param: key, raw: v, code: 'invalid-parameter',
        reason: `Parameter "${key}"${blockId ? ` of "${blockId}"` : ''}: list element ${JSON.stringify(item)} is not a number.`,
      }]);
    }
    out.push(r.value);
  }
  return out.length ? out : fallback;
}

/** Describe the bound of a spec, e.g. "> 0", ">= 0", "!= 0", "in [0, 1]". Empty when unbounded. */
export function describeBounds(spec: Pick<VLabParamSpec, 'min' | 'max' | 'exclusiveMin' | 'exclusiveMax' | 'nonZero'>): string {
  const parts: string[] = [];
  if (spec.min !== undefined) parts.push(`${spec.exclusiveMin ? '>' : '>='} ${spec.min}`);
  if (spec.max !== undefined) parts.push(`${spec.exclusiveMax ? '<' : '<='} ${spec.max}`);
  if (spec.nonZero) parts.push('!= 0');
  return parts.join(' and ');
}

/** Returns a violation text, or null when `value` satisfies the bounds of `spec`. */
export function boundViolation(value: number, spec: Pick<VLabParamSpec, 'min' | 'max' | 'exclusiveMin' | 'exclusiveMax' | 'nonZero'>): string | null {
  if (spec.min !== undefined && (spec.exclusiveMin ? value <= spec.min : value < spec.min)) return describeBounds(spec);
  if (spec.max !== undefined && (spec.exclusiveMax ? value >= spec.max : value > spec.max)) return describeBounds(spec);
  if (spec.nonZero && value === 0) return describeBounds(spec);
  return null;
}

const libraryIndex = (() => {
  let m: Map<string, VLabBlock> | null = null;
  return (type: string): VLabBlock | undefined => {
    if (!m) { m = new Map(); for (const d of VLAB_LIBRARY) for (const b of d.blocks) m.set(b.id, b); }
    return m.get(type);
  };
})();

/**
 * Check the numeric parameters of one block instance against the library: every numeric parameter must be missing
 * or a finite number, and finite values must satisfy the physical bounds of the library entry.
 * Parameters the library does not list are not checked here (the equation parse still rejects malformed text).
 */
export function validateBlockParams(blockId: string, blockType: string, params: Record<string, any> | undefined | null, label?: string): ParamDiagnostic[] {
  const lib = libraryIndex(blockType);
  if (!lib || !params) return [];
  const out: ParamDiagnostic[] = [];
  const who = `"${label || blockType}"${label && label !== blockType ? ` (${blockType})` : ''}`;
  for (const [key, spec] of Object.entries(lib.params ?? {})) {
    if (typeof spec.value !== 'number') continue; // text / list / enum parameter
    const r = parseNumeric(params[key]);
    if (r.kind === 'missing') continue;
    if (r.kind === 'invalid') {
      out.push({ blockId, param: key, raw: r.raw, code: 'invalid-parameter', reason: `Parameter "${key}" of ${who}: ${r.reason}.` });
      continue;
    }
    const bad = boundViolation(r.value, spec);
    if (bad) {
      out.push({
        blockId, param: key, raw: unwrapParam(params[key]), code: 'parameter-out-of-range',
        reason: `Parameter "${key}" (${spec.label}) of ${who} is ${r.value}${spec.unit ? ` ${spec.unit}` : ''}; it must be ${bad}.`,
      });
    }
  }
  return out;
}
