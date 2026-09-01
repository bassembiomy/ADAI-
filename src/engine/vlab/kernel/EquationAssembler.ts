// src/engine/vlab/kernel/EquationAssembler.ts
import { PhysicalSystemIR, CompiledPhysicalSystem, SolverContext } from './types';

export class EquationAssembler {
  assembleRLC(ir: PhysicalSystemIR): CompiledPhysicalSystem {
    const R = ir.parameters.find(p => p.name === 'resistance')?.value || 100;
    const L = ir.parameters.find(p => p.name === 'inductance')?.value || 0.1;
    const C = ir.parameters.find(p => p.name === 'capacitance')?.value || 10e-6;
    const Vs = ir.parameters.find(p => p.name === 'voltage')?.value || 10;

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
