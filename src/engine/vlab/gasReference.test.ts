import { describe, expect, it } from 'vitest';
import { DAEAssembler } from './DAEAssembler';

describe('Gas reference', () => {
  it('anchors an isolated gas reference at 101325 Pa', () => {
    const system = new DAEAssembler().assemble([
      { id: 'ref', data: { type: 'gas_ref' } } as any,
    ], []);
    const residual = system.residuals([0], [0], {
      dt: 0.01,
      time: 0,
      parameters: {},
      prevStates: [0],
      states: [0],
      stateDerivatives: [0],
    });
    expect(residual[0]).toBe(-101325);
  });
});
