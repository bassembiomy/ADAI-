import { describe, it, expect } from 'vitest';
import { blockEquations } from './vlabEquations';
import { DAEAssembler } from './DAEAssembler';

describe('Isothermal Liquid Equations & DAE Assembly', () => {
  it('evaluates hydraulic_reference_il residual to zero at target pressure', () => {
    const eq = blockEquations['hydraulic_reference_il'];
    expect(eq).toBeDefined();
    const res = eq({
      across: [101325],
      branch: [0],
      dAcross: [],
      dBranch: [],
      state: [],
      dState: [],
      ctx: { dt: 0.01, time: 0, parameters: {}, prevStates: [] },
      params: { referencePressure: 101325, pressureType: 'absolute' },
      ports: ['a'],
      nodeId: 'ref1'
    });
    expect(res[0]).toBeCloseTo(0, 5);
  });

  it('evaluates pump_il across pressure rise', () => {
    const eq = blockEquations['pump_il'];
    expect(eq).toBeDefined();
    // pA = 100,000, pB = 300,000, pressure_rise = 200,000
    const res = eq({
      across: [100000, 300000],
      branch: [0.05],
      dAcross: [],
      dBranch: [],
      state: [],
      dState: [],
      ctx: { dt: 0.01, time: 0, parameters: {}, prevStates: [] },
      params: { pressure_rise: 200000 },
      ports: ['a', 'b'],
      nodeId: 'pump1'
    });
    expect(res[0]).toBeCloseTo(0, 5);
  });

  it('assembles a connected hydraulic reference DAE system with custom reference pressure', () => {
    const assembler = new DAEAssembler();
    const nodes = [
      {
        id: 'ref1',
        type: 'vlab_block',
        data: {
          type: 'hydraulic_reference_il',
          params: {
            referencePressure: { value: 200000, unit: 'Pa' },
            pressureType: { value: 'absolute' }
          }
        }
      },
      {
        id: 'pipe1',
        type: 'vlab_block',
        data: {
          type: 'pipe_il',
          params: { R: { value: 100000, unit: 'Pa/(kg/s)' } }
        }
      }
    ] as any;

    const edges = [
      { id: 'e1', source: 'ref1', sourceHandle: 'ref1-a', target: 'pipe1', targetHandle: 'pipe1-a' }
    ] as any;

    const dae = assembler.assemble(nodes, edges);
    expect(dae).toBeDefined();
    expect(dae.systemSize).toBeGreaterThan(0);

    // Initial state vector
    const x = new Array(dae.systemSize).fill(200000);
    const dx = new Array(dae.systemSize).fill(0);
    const ctx = { dt: 0.01, time: 0, parameters: {}, prevStates: [], states: [], stateDerivatives: [] };
    const res = dae.residuals(x, dx, ctx);

    // The reference node residual should be 0 when x = 200,000
    expect(res[0]).toBeCloseTo(0, 5);
  });
});
