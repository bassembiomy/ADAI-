import { EquationContext } from './types';

export const blockEquations: Record<string, (x: number[], ctx: EquationContext, params: any) => number> = {
  Resistor: (x, ctx, params) => {
    // V = I * R => V - I*R = 0
    const [v1, v2, i] = x;
    const R = params.resistance || 100;
    return (v1 - v2) - i * R;
  },
  Source: (x, ctx, params) => {
    const [v1] = x;
    const targetV = params.voltage || 5;
    return v1 - targetV;
  },
  Capacitor: (x, ctx, params) => {
    // i = C * dv/dt => i - C * (v(t) - v(t-dt))/dt = 0
    const [v1, v2, i] = x;
    const [v1Prev, v2Prev] = ctx.prevStates;
    const C = params.capacitance || 1e-6;
    const dv = (v1 - v2) - (v1Prev - v2Prev);
    return i - C * (dv / ctx.dt);
  }
};
