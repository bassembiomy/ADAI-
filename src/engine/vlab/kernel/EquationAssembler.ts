// src/engine/vlab/kernel/EquationAssembler.ts
import { PhysicalSystemIR, CompiledPhysicalSystem, SolverContext } from './types';

/**
 * Series RLC reference assembler of the kernel IR pipeline, which the app does not use (see PhysicalSystemCompiler; the simulation
 * path is DAEAssembler -> VLabPhysicsEngine). WP-31b (F-043/F-054/F-070): a parameter that is present is used as given (0 and negative
 * values are valid inputs, never replaced by the demo default); the demo defaults apply only to an ABSENT parameter; a non-finite value
 * throws. L and C are divisors, so a zero there is reported instead of producing Infinity/NaN.
 */
export class EquationAssembler {
  assembleRLC(ir: PhysicalSystemIR): CompiledPhysicalSystem {
    const param = (name: string, fallback: number): number => {
      const v = ir.parameters.find(p => p.name === name)?.value;
      if (v === undefined) return fallback;
      if (!Number.isFinite(v)) throw new Error(`RLC parameter "${name}" is not a finite number (${v})`);
      return v;
    };
    const R = param('resistance', 100);
    const L = param('inductance', 0.1);
    const C = param('capacitance', 10e-6);
    const Vs = param('voltage', 10);
    if (L === 0) throw new Error('RLC parameter "inductance" must be non-zero (L di/dt = Vs - vC - R i)');
    if (C === 0) throw new Error('RLC parameter "capacitance" must be non-zero (C dvC/dt = i)');

    return {
      id: ir.id,
      domains: ir.domains,
      stateCount: 2,
      algebraicCount: 0,
      totalSize: 2,
      isDifferentialState: [true, true],
      variableNames: ['V_C', 'I_L'],
      residual: (t: number, x: Float64Array, dx: Float64Array, z: Float64Array, ctx: SolverContext, out: Float64Array) => {
        const vC = x[0];
        const iL = x[1];
        const dvC = dx[0];
        const diL = dx[1];

        // Equation 1: C * dV_C/dt = I_L  =>  dV_C/dt - I_L / C = 0
        out[0] = dvC - (iL / C);

        // Equation 2: L * dI_L/dt = Vs - V_C - R * I_L  =>  dI_L/dt - (Vs - vC - R * iL) / L = 0
        out[1] = diL - (Vs - vC - R * iL) / L;
      },
      jacobian: (t: number, x: Float64Array, dx: Float64Array, z: Float64Array, ctx: SolverContext, out: Float64Array) => {
        const a0 = ctx.order === 2 && ctx.prevDt ? (2 * (ctx.dt / ctx.prevDt) + 1) / (ctx.dt * ((ctx.dt / ctx.prevDt) + 1)) : 1 / ctx.dt;
        out[0] = a0;
        out[1] = -1 / C;
        out[2] = 1 / L;
        out[3] = a0 + R / L;
      }
    };
  }
}
