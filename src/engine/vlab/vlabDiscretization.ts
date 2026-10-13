import type { EquationContext } from './types';

/**
 * Single source of the time discretisation d/dt used by every V-Lab derivative (across, branch and internal states).
 *
 * The active stencil comes from the EquationContext, never from a per-variable flag:
 *   - BDF1 (startup, after a reset or an event, SDIRK stages with prevStates = stage base value z and dt = h*gamma):
 *       x' ~= (x - x1) / h
 *   - variable-step BDF2 with w = h / h_prev (Hairer & Wanner IV.5 / Shampine & Gear):
 *       x' ~= ( x (1 + 2w)/(1 + w) - x1 (1 + w) + x2 w^2/(1 + w) ) / h
 * The coefficients apply to EVERY variable, so a derivative formed from a node voltage (C d(Vp - Vn)/dt) or a branch
 * current (L dI/dt) has the same order as one formed from an integrator state.
 */
export interface DdtStencil { a0: number; a1: number; a2: number; order: 1 | 2 }

export function ddtStencil(ctx: Pick<EquationContext, 'dt' | 'order' | 'prevPrevStates' | 'prevDt'>): DdtStencil {
  const h = ctx.dt;
  if (ctx.order === 2 && ctx.prevPrevStates && typeof ctx.prevDt === 'number' && ctx.prevDt > 0) {
    const w = h / ctx.prevDt;
    return { a0: (1 + 2 * w) / ((1 + w) * h), a1: -(1 + w) / h, a2: (w * w) / ((1 + w) * h), order: 2 };
  }
  return { a0: 1 / h, a1: -1 / h, a2: 0, order: 1 };
}

/** d/dt of variable `idx` whose current iterate is `value`, using the active stencil. */
export function ddt(ctx: EquationContext, value: number, idx: number, stencil: DdtStencil = ddtStencil(ctx)): number {
  if (stencil.order === 2) return stencil.a0 * value + stencil.a1 * ctx.prevStates[idx] + stencil.a2 * ctx.prevPrevStates![idx];
  return (value - ctx.prevStates[idx]) / ctx.dt;
}

/**
 * d/dt of the whole unknown vector (every variable, algebraic ones included). firstOrderOnly[i] pins variable i to the
 * BDF1 stencil with the same stage dt: multibody frame poses, whose held (rank-revealing) coordinates and whose joint
 * rates (vlabJointCore: w = d(angle)/dt from the backward difference over ctx.dt, F-058) are defined by (x - x1)/dt.
 * Because every variable now shares the same ctx.dt, an SDIRK stage (dt = h*gamma) is consistent for all of them.
 */
export function ddtVector(x: number[], ctx: EquationContext, firstOrderOnly?: boolean[]): number[] {
  const s = ddtStencil(ctx);
  if (s.order === 1 || !firstOrderOnly) return x.map((v, i) => ddt(ctx, v, i, s));
  return x.map((v, i) => (firstOrderOnly[i] ? (v - ctx.prevStates[i]) / ctx.dt : ddt(ctx, v, i, s)));
}