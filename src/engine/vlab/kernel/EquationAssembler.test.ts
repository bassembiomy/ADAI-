// src/engine/vlab/kernel/EquationAssembler.test.ts
import { describe, it, expect } from 'vitest';
import { EquationAssembler } from './EquationAssembler';
import { PhysicalSystemIR } from './types';

describe('EquationAssembler on RLC Circuit', () => {
  const assembler = new EquationAssembler();

  const rlcIR: PhysicalSystemIR = {
    id: 'rlc_ir',
    domains: ['electrical'],
    components: [],
    nodes: [],
    states: [
      { id: 's_vc', name: 'V_C', symbol: 'V_C', unit: 'V', sourceComponentId: 'c1', preferred: true },
      { id: 's_il', name: 'I_L', symbol: 'I_L', unit: 'A', sourceComponentId: 'l1', preferred: true }
    ],
    algebraicVariables: [],
    parameters: [
      { id: 'r', name: 'resistance', value: 100, componentId: 'r1' },
      { id: 'l', name: 'inductance', value: 0.1, componentId: 'l1' },
      { id: 'c', name: 'capacitance', value: 10e-6, componentId: 'c1' },
      { id: 'vs', name: 'voltage', value: 10, componentId: 'vs1' }
    ],
    equations: [],
    connections: [],
    references: [],
    metadata: { nodeCount: 3, stateCount: 2, algebraicCount: 0, hasNonlinearities: false, isStiff: false, isDAE: false }
  };

  it('should assemble executable CompiledPhysicalSystem and compute residuals', () => {
    const compiled = assembler.assembleRLC(rlcIR);
    expect(compiled.stateCount).toBe(2);

    const x = new Float64Array([0, 0]);
    const dx = new Float64Array([0, 100]); // dV_C/dt = 0, dI_L/dt = (Vs - V_C - R*I_L)/L = (10 - 0 - 0)/0.1 = 100
    const z = new Float64Array(0);
    const out = new Float64Array(2);

    compiled.residual(0, x, dx, z, { t: 0, dt: 0.001, parameters: {}, inputs: {} }, out);
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[1]).toBeCloseTo(0, 5);
  });
});
