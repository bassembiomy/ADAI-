/**
 * Protection of the variable-step solvers against a chattering zero crossing (XBV-408), as Simulink's "Number of
 * consecutive zero crossings" limit (default 1000): the run stops with an error naming the block, never hangs.
 */
import type { XbridgesEngine } from './XbridgesEngine';
import { VectorUtils } from './VectorUtils';

/** Simulink default for "Number of consecutive zero crossings". */
export const MAX_CONSECUTIVE_ZERO_CROSSINGS = 1000;
/** Most internal steps of one live output step. */
export const MAX_INTERNAL_STEPS_LIVE = 100_000;
/** Most internal steps of one batch run. */
export const MAX_INTERNAL_STEPS_BATCH = 5_000_000;

/** The block whose zero-crossing function changed sign between the two evaluations, or null. */
export function crossingBlock(zcA: Map<string, number[]>, zcB: Map<string, number[]>): string | null {
  for (const [blockId, a] of zcA) {
    const b = zcB.get(blockId);
    if (b) for (let i = 0; i < a.length; i++) if (a[i] * b[i] < 0) return blockId;
  }
  return null;
}

/**
 * Bisection predicate of event location: a sign change or a landing exactly on zero (a value that is zero there has already
 * switched its block: output = duty > carrier is false at the edge). Zero values at the base are ignored.
 */
export function crossedOrTouched(zcA: Map<string, number[]>, zcB: Map<string, number[]>): boolean {
  for (const [blockId, a] of zcA) {
    const b = zcB.get(blockId);
    if (b) for (let i = 0; i < a.length; i++) if (a[i] !== 0 && a[i] * b[i] <= 0) return true;
  }
  return false;
}

function reportError(engine: XbridgesEngine, code: string, message: string) {
  if (!engine.diagnostics.some(d => d.code === code)) engine.diagnostics.push({ severity: 'error', code, message });
}

/** Message of the chatter diagnostic; the solver emits it with reportError(engine, 'ZERO_CROSSING_CHATTER', ...). */
export function chatterMessage(engine: XbridgesEngine, blockId: string | null, t: number, solver: string): string {
  const block = blockId !== null ? engine.getBlock(blockId) : undefined;
  const name = blockId === null ? 'a block' : `block '${blockId}'${block?.type ? ` (${block.type})` : ''}`;
  return `Zero crossing limit of ${MAX_CONSECUTIVE_ZERO_CROSSINGS} consecutive crossings exceeded at ${name}, t = ${t} (${solver}). ` +
    'The model chatters across a discontinuity (e.g. a sliding mode); use a fixed-step solver or add hysteresis / a dead band to the switching block.';
}

/**
 * Counts consecutive zero crossings as Simulink does: a crossing is consecutive only when its time lies within a tiny
 * window of the previous one (the resolution of the event location and rounding of t; never the user's minimum step); otherwise the count restarts.
 * A model with many genuine, well separated events (PWM at 20 kHz) therefore never reaches the limit.
 */
export class ConsecutiveCrossings {
  private last = Number.NaN;
  private count = 0;
  /** Registers a crossing located at `tEvent`; returns true when the limit is exceeded. */
  note(tEvent: number, locationTol: number): boolean {
    const window = Math.max(128 * Number.EPSILON * Math.abs(tEvent), 10 * locationTol);
    this.count = Number.isFinite(this.last) && Math.abs(tEvent - this.last) <= window ? this.count + 1 : 1;
    this.last = tEvent;
    return this.count > MAX_CONSECUTIVE_ZERO_CROSSINGS;
  }
}

export function reportStepBudget(engine: XbridgesEngine, limit: number, t: number, solver: string) {
  reportError(engine, 'STIFF_SOLVER_STEP_TOO_SMALL',
    `${solver} needed more than ${limit} internal steps and stopped at t = ${t}: the steps became too small to make progress. Loosen the tolerance or change the model.`);
}

/** Bracket of a scheduled event (a block's nextEventTime): half width well above the rounding of block phases, far below any step. */
export const scheduledHalfWidth = (tEvent: number) => Math.max(1e-12, 8 * Number.EPSILON * Math.abs(tEvent));

export interface ScheduledEvent { tLow: number; tHigh: number; scheduled: true }
/** Cache of the next scheduled event of one integration (it only changes once t has passed it). */
export interface ScheduleCache { next?: number }

/**
 * The next scheduled event of the engine inside (t, tEnd] as a bracket the solver steps to and crosses, null when none, or
 * 'close' when ONE block's own events are spaced closer than the minimum step (minimum-step violation: the requested accuracy
 * cannot be met). Events of different blocks may coincide or lie closer than the minimum step: the solver then lands on each.
 */
export function scheduledEvent(engine: XbridgesEngine, t: number, tEnd: number, hMin: number, cache: ScheduleCache): ScheduledEvent | null | 'close' {
  if (cache.next === undefined || cache.next <= t) {
    cache.next = engine.nextScheduledEvent(t) ?? Number.POSITIVE_INFINITY;
    if (Number.isFinite(cache.next) && engine.ownScheduledEventsCloserThan(t, scheduledHalfWidth, hMin)) return 'close';
  }
  const tn = cache.next;
  const d = scheduledHalfWidth(tn);
  // An event within d behind the interval end counts as at the end: the last stage may already see the value behind the jump.
  if (!(tn <= tEnd + d)) return null;
  // An event at the end of the interval is landed on from the left: no stage sees the value behind the jump.
  return { tLow: Math.max(t, tn - d), tHigh: Math.min(tn + d, tEnd), scheduled: true };
}

/**
 * Crosses the bracket [t, tHigh] of a scheduled event with one explicit (Euler) step of every state with derivative `k1`
 * (the left-hand derivative at t), so a state that does not depend on the event (x' = 1) advances by exactly the width.
 */
export function crossBracket(engine: XbridgesEngine, t: number, tHigh: number, k1: Map<string, any>): void {
  const w = tHigh - t;
  if (!(w > 0)) return;
  const cand = new Map<string, any>();
  k1.forEach((d, id) => {
    const block = engine.getBlock(id);
    if (block) cand.set(id, VectorUtils.integrateState(block.state, d, w));
  });
  engine.commitStateUpdates(cand);
}
