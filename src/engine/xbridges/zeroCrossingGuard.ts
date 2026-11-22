/**
 * Protection of the variable-step solvers against a chattering zero crossing (XBV-408), as Simulink's "Number of
 * consecutive zero crossings" limit (default 1000): the run stops with an error naming the block, never hangs.
 */
import type { XbridgesEngine } from './XbridgesEngine';

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
 * window of the previous one (the resolution of the event location, hMin, rounding of t); otherwise the count restarts.
 * A model with many genuine, well separated events (PWM at 20 kHz) therefore never reaches the limit.
 */
export class ConsecutiveCrossings {
  private last = Number.NaN;
  private count = 0;
  /** Registers a crossing located at `tEvent`; returns true when the limit is exceeded. */
  note(tEvent: number, hMin: number, locationTol: number): boolean {
    const window = Math.max(10 * hMin, 128 * Number.EPSILON * Math.abs(tEvent), 10 * locationTol);
    this.count = Number.isFinite(this.last) && Math.abs(tEvent - this.last) <= window ? this.count + 1 : 1;
    this.last = tEvent;
    return this.count > MAX_CONSECUTIVE_ZERO_CROSSINGS;
  }
}

export function reportStepBudget(engine: XbridgesEngine, limit: number, t: number, solver: string) {
  reportError(engine, 'STIFF_SOLVER_STEP_TOO_SMALL',
    `${solver} needed more than ${limit} internal steps and stopped at t = ${t}: the steps became too small to make progress. Loosen the tolerance or change the model.`);
}
