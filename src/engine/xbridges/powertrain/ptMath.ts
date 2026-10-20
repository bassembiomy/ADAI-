// Shared pure numerics for powertrain blocks.
import type { PtParamSpec } from './ptSpec';

export { prelookup, interpolateNd, lookupNd, validateBreakpoints, validateTable } from '../lookup/lookupCore';

export const rpm2radps = (rpm: number): number => (rpm * 2 * Math.PI) / 60;
export const radps2rpm = (w: number): number => (w * 60) / (2 * Math.PI);

/** Smooth sign: odd, bounded by 1, 0 at 0 and +-1 for |x| >= 10 w. */
export const smoothSign = (x: number, w: number): number => Math.tanh((4 * x) / w);

/** eta when power flows forward (torque*speed > 0), 1/eta when it flows back, 1 at zero power. */
export function powerFlowEfficiency(torqueIn: number, speedIn: number, eta: number): number {
  const p = torqueIn * speedIn;
  if (p > 0) return eta;
  if (p < 0) return 1 / eta;
  return 1;
}

const flat = (v: unknown): unknown[] => (Array.isArray(v) ? v.flatMap(flat) : [v]);

/** Returns a message naming the first offending parameter, or null when all are valid. */
export function validateParams(specs: PtParamSpec[], params: Record<string, any>): string | null {
  for (const s of specs) {
    const v = params[s.name];
    if (s.kind === 'enum') {
      if (!s.options || !s.options.includes(String(v))) return `Parameter ${s.name} must be one of ${(s.options ?? []).join(', ')}`;
      continue;
    }
    if (s.kind === 'vector' || s.kind === 'table') {
      const els = flat(v);
      if (!Array.isArray(v) || els.length === 0 || !els.every(e => typeof e === 'number' && Number.isFinite(e))) {
        return `Parameter ${s.name} must be a finite numeric ${s.kind}`;
      }
      continue;
    }
    if (typeof v !== 'number' || !Number.isFinite(v)) return `Parameter ${s.name} must be a finite number`;
    if (s.min !== undefined && (s.minExclusive ? v <= s.min : v < s.min)) {
      return `Parameter ${s.name} must be ${s.minExclusive ? '>' : '>='} ${s.min}`;
    }
    if (s.max !== undefined && (s.maxExclusive ? v >= s.max : v > s.max)) {
      return `Parameter ${s.name} must be ${s.maxExclusive ? '<' : '<='} ${s.max}`;
    }
  }
  return null;
}
