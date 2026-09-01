// src/engine/vlab/kernel/SystemAnalyzer.ts
import { PhysicalSystemIR, SolverType } from './types';

export interface SolverRecommendation {
  recommended: SolverType;
  type: string;
  reason: string;
}

export class SystemAnalyzer {
  analyze(ir: PhysicalSystemIR): SolverRecommendation {
    if (ir.metadata.isDAE || ir.metadata.algebraicCount > 0) {
      return {
        recommended: 'bdf',
        type: 'DAE System (Algebraic Constraints)',
        reason: 'Physical network contains algebraic conservation loops (Kirchhoff constraints). Implicit BDF solver guarantees stable algebraic projection.'
      };
    } else if (ir.metadata.isStiff) {
      return {
        recommended: 'bdf',
        type: 'Stiff ODE System',
        reason: 'High dynamic time-constant ratios detected across components.'
      };
    } else {
      return {
        recommended: 'rk_adaptive',
        type: 'Non-Stiff Dynamic ODE',
        reason: 'Standard dynamic physical system with smooth states.'
      };
    }
  }
}
