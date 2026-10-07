/**
 * WP-20a: committed signal history for the blocks that look back in time.
 *
 * A constant delay y(t) = u(t - tau), a sliding-window RMS or Fourier integral over the last W seconds and an N-sample moving
 * average all need the value the signal had a fixed time ago. A DAE has no memory of that kind, so the engine keeps it
 * explicitly:
 *  - a block that needs it registers a RECORDER in `blockHistory` (what vector to remember after each accepted step and how far
 *    back it ever looks);
 *  - `VLabPhysicsEngine.simulateStep` appends the recorded vector after every ACCEPTED step (`recordHistory`); a rejected or
 *    event-cut attempt never leaves a sample behind;
 *  - the history is plain data carried in the state object `simulateStep` returns (`state.history`), never a module-level
 *    cache: a new run (`prevState = null`) starts empty, two runs never share memory;
 *  - the equation reads it with `historyAt`, which interpolates linearly between the committed samples and, for a time inside
 *    the step being solved, between the last committed sample and the unknowns of the current attempt (implicit, so a delay
 *    shorter than the step is still consistent).
 */
import type { AssembledSystem, EquationContext, HistoryMemory } from './types';
import type { BlockEquationArgs } from './vlabEquations';
import { numericParam } from './vlabParams';

/** Times closer than this are the same instant (accumulated step sums are not exact multiples of the sample time). */
const SAME_TIME = 1e-12;

/**
 * Value at time `tq` of the recorded vector. `current` = the vector at ctx.time (this attempt's unknowns); `initial` = the value
 * before the run started (tq earlier than the first sample of the run).
 */
export function historyAt(ctx: EquationContext, nodeId: string, tq: number, current: number[], initial: number[]): number[] {
  if (tq >= ctx.time) return current;
  const h = ctx.history?.[nodeId];
  const lerp = (a: number[], b: number[], f: number): number[] => a.map((x, i) => x + f * ((b[i] ?? x) - x));
  if (!h || h.t.length === 0) {
    // first step of a run: nothing is committed yet; the signal is taken constant over the step, `initial` before it
    return tq < ctx.time - ctx.dt - SAME_TIME * Math.max(1, Math.abs(tq)) ? initial : current;
  }
  const { t, v } = h;
  if (tq < t[0] - SAME_TIME * Math.max(1, Math.abs(tq))) return initial;
  const last = t.length - 1;
  if (tq >= t[last]) {
    const span = ctx.time - t[last];
    return span > 0 ? lerp(v[last], current, (tq - t[last]) / span) : v[last];
  }
  // binary search for the interval [t[lo], t[lo + 1]] containing tq
  let lo = 0; let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (t[mid] <= tq) lo = mid; else hi = mid;
  }
  const dt = t[hi] - t[lo];
  return dt > 0 ? lerp(v[lo], v[hi], Math.max(0, (tq - t[lo]) / dt)) : v[hi];
}

/**
 * WP-20b: the last COMMITTED vector of a block that keeps discrete memory (sampled controllers, relays, counters, learning
 * agents), or `initial` before the first accepted step. It is the value the memory had at the end of the previous accepted step,
 * never a function of the attempt being solved, so a Newton iterate / a rejected attempt can not change it and no module-level
 * cache is needed. The equation computes its outputs from this vector and the current inputs; the block's recorder
 * (blockHistory.record, `first: 'initial'`) computes the NEXT vector from the accepted solution with the same function.
 */
export function committedMemory(ctx: EquationContext, nodeId: string, initial: number[]): number[] {
  const h = ctx.history?.[nodeId];
  if (!h) return initial;
  // strictly before the time being solved: a sample AT ctx.time belongs to a finished solve of this instant (a replay), not to its past
  let n = h.t.length - 1;
  while (n >= 0 && h.t[n] >= ctx.time - SAME_TIME * Math.max(1, Math.abs(ctx.time))) n--;
  return n >= 0 ? h.v[n] : initial;
}

/** Deep-enough copy (arrays are append-only, the recorded vectors are immutable): a replayed state never sees later samples. */
export function cloneHistory(h: HistoryMemory | undefined): HistoryMemory {
  const out: HistoryMemory = {};
  if (h) for (const [k, e] of Object.entries(h)) out[k] = { t: e.t.slice(), v: e.v.slice(), extended: e.extended };
  return out;
}

/**
 * Append the recorded vector of every history block at `tNow` (called by the engine after each accepted step).
 * The first sample of a run also covers the interval before it: an INPUT signal (`first: 'extend'`) is taken constant over
 * [tPrev, tNow] (the unknowns of the run's first solve are not meaningful at tPrev), a STATE (`first: 'state'`) takes its value
 * at tPrev from the vector before the step (its initial condition).
 */
export function recordHistory(
  system: AssembledSystem, memory: HistoryMemory, xBefore: number[], xAfter: number[], tPrev: number, tNow: number,
): void {
  for (const r of system.historyRecorders ?? []) {
    // the recorder sees the memory committed BEFORE this step (a discrete block advances it from there, WP-20b)
    const v = r.record(xAfter, tNow, memory);
    if (!v.every(Number.isFinite)) continue;
    const h = (memory[r.nodeId] ??= { t: [], v: [] });
    if (h.t.length === 0 && tPrev < tNow) {
      h.t.push(tPrev);
      h.v.push(r.first === 'initial' && r.initial ? r.initial() : r.first === 'state' ? r.record(xBefore, tPrev, memory) : v);
      if (r.first === 'extend') h.extended = true;
    }
    const n = h.t.length;
    if (n > 0 && tNow <= h.t[n - 1]) { h.v[n - 1] = v; continue; }
    if (n === 2 && h.extended) {
      // the unknowns of the first solve say nothing about the signal at the run start: extrapolate it linearly backwards from
      // the first two accepted steps (exact for a ramp, O(dt^2) for a smooth signal)
      const k = (h.t[1] - h.t[0]) / (tNow - h.t[1]);
      h.v[0] = h.v[1].map((x, i) => x - (v[i] - x) * k);
      h.extended = false;
    }
    h.t.push(tNow); h.v.push(v);
    // prune everything older than the look-back span, keeping one older sample for the interpolation
    const cutoff = tNow - r.span;
    let first = 0;
    while (first + 1 < h.t.length && h.t[first + 1] <= cutoff) first++;
    if (first > 0) { h.t.splice(0, first); h.v.splice(0, first); }
  }
}

const portValue = (a: BlockEquationArgs, id: string): number => {
  const i = a.ports.indexOf(id);
  const v = i >= 0 ? a.across[i] : 0;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
};

/** Sample period and window of the moving average: y(k) = sum(u(k-N+1:k))/N over samples taken every `ts` seconds. */
export const movingAverageSpec = (params: Record<string, any>): { n: number; ts: number } => {
  const n = Math.max(1, Math.round(numericParam(params, 'window', 10)));
  const ts = numericParam(params, 'ts', 0.01);
  return { n, ts };
};

/**
 * What each history block remembers. `record` runs on the solved unknowns of an accepted step; `span` [s] is the look-back.
 *  - ps_delay: the input u(t)
 *  - ps_moving_avg: the input u(t) (sampled on the block's own grid k*ts at read time)
 *  - ps_rms: the running integral Q(t) = int u^2 dt (state 0): y^2 = (Q(t) - Q(t - W)) / W
 *  - sym_comp_transform: the six running Fourier integrals (re, im of the +, -, 0 sequence at f0)
 */
export interface BlockHistorySpec {
  span: (params: Record<string, any>) => number;
  record: (a: BlockEquationArgs) => number[];
  /**
   * extend: an input signal, constant over the first step; state: a state, its value before the step is the initial condition;
   * initial (WP-20b): discrete memory of a sampled / event-driven block, the vector before the first step is `initial(params)`.
   */
  first: 'extend' | 'state' | 'initial';
  initial?: (params: Record<string, any>) => number[];
}

export const blockHistory: Record<string, BlockHistorySpec> = {
  ps_delay: {
    span: p => Math.max(0, numericParam(p, 'delay', 1)),
    record: a => [portValue(a, 'u')],
    first: 'extend',
  },
  ps_moving_avg: {
    span: p => { const { n, ts } = movingAverageSpec(p); return n * ts; },
    record: a => [portValue(a, 'u')],
    first: 'extend',
  },
  ps_rms: {
    span: p => Math.max(0, numericParam(p, 'window', 0.02)),
    record: a => [a.state[0]],
    first: 'state',
  },
  sym_comp_transform: {
    span: p => 1 / numericParam(p, 'freq', 50),
    record: a => a.state.slice(0, 6),
    first: 'state',
  },
};
