// src/engine/vlab/kernel/InitializationEngine.ts
import { CompiledPhysicalSystem, InitialCondition, Diagnostic } from './types';

export class InitializationEngine {
  initialize(
    system: CompiledPhysicalSystem,
    initialConditions: InitialCondition[]
  ): { x0: Float64Array; z0: Float64Array; diagnostics: Diagnostic[] } {
    const diagnostics: Diagnostic[] = [];
    const x0 = new Float64Array(system.stateCount);
    const z0 = new Float64Array(system.algebraicCount);

    initialConditions.forEach(ic => {
      const idx = system.variableNames.indexOf(ic.variableId);
      if (idx !== -1 && ic.value !== undefined) {
        if (idx < system.stateCount) {
          x0[idx] = ic.value;
        } else {
          z0[idx - system.stateCount] = ic.value;
        }
      }
    });

    return { x0, z0, diagnostics };
  }
}
