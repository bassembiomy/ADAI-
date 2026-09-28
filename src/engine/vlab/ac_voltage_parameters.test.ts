import { describe, expect, it } from 'vitest';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';
import { VLAB_COMPONENT_DEFINITIONS } from './vlabComponentDefinitions';
import { blockEquations } from './vlabEquations';

describe('AC voltage source configurable phase and internal resistance', () => {
  const acVoltageBlock = VLAB_LIBRARY.flatMap(domain => domain.blocks).find(block => block.id === 'ac_voltage')!;

  it('exposes phase and internal resistance as editable library parameters', () => {
    expect(acVoltageBlock.params.phase).toMatchObject({ value: Math.PI / 4, unit: 'rad' });
    expect(acVoltageBlock.params.R_int).toMatchObject({ value: 0.001, unit: 'Ω' });
  });

  it('documents the same phase and series-resistance terms used by the equation', () => {
    expect(acVoltageBlock.equation).toContain('phase');
    expect(acVoltageBlock.equation).toContain('R_int');
    expect(VLAB_COMPONENT_DEFINITIONS.ac_voltage.equations[0]).toContain('phase');
    expect(VLAB_COMPONENT_DEFINITIONS.ac_voltage.equations[0]).toContain('R_int');
  });

  it('uses configured phase and internal resistance in its residual', () => {
    const residual = blockEquations.ac_voltage({
      across: [10, 0],
      dAcross: [0, 0],
      branch: [2],
      dBranch: [0],
      state: [],
      dState: [],
      ctx: { time: 0, dt: 0.01, prevStates: [] } as any,
      params: { Vpk: 10, f: 1, phase: 0, R_int: 2 },
      ports: ['p', 'n'],
      nodeId: 'source',
    });

    // At t=0 and phase=0 the source voltage is zero, so 10V - 2A*2Ω = 6V residual.
    expect(residual[0]).toBe(6);
  });

  it('accepts parameter objects and preserves legacy defaults when parameters are absent', () => {
    const evaluate = (params: Record<string, unknown>) => blockEquations.ac_voltage({
      across: [0, 0],
      dAcross: [0, 0],
      branch: [0],
      dBranch: [0],
      state: [],
      dState: [],
      ctx: { time: 0, dt: 0.01, prevStates: [] } as any,
      params,
      ports: ['p', 'n'],
      nodeId: 'source',
    })[0];

    expect(evaluate({ Vpk: 10, f: 1, phase: { value: 0 }, R_int: { value: 0.2 } })).toBe(0);
    expect(evaluate({ Vpk: 10, f: 1 })).toBeCloseTo(-10 * Math.sin(Math.PI / 4));
  });
});
