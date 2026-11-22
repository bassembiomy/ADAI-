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

export function reportChatter(engine: XbridgesEngine, blockId: string | null, t: number, solver: string) {
  const block = blockId !== null ? engine.getBlock(blockId) : undefined;
  const name = blockId === null ? 'a block' : `block '${blockId}'${block?.type ? ` (${block.type})` : ''}`;
  reportError(engine, 'ZERO_CROSSING_CHATTER',
    `Zero crossing limit of ${MAX_CONSECUTIVE_ZERO_CROSSINGS} consecutive crossings exceeded at ${name}, t = ${t} (${solver}). ` +
    'The model chatters across a discontinuity (e.g. a sliding mode); use a fixed-step solver or add hysteresis / a dead band to the switching block.');
}

export function reportStepBudget(engine: XbridgesEngine, limit: number, t: number, solver: string) {
  reportError(engine, 'STIFF_SOLVER_STEP_TOO_SMALL',
    `${solver} needed more than ${limit} internal steps and stopped at t = ${t}: the steps became too small to make progress. Loosen the tolerance or change the model.`);
}
