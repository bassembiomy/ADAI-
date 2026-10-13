import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { DAEAssembler } from './DAEAssembler';
import { blockEquations } from './vlabEquations';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';

const thyristorPorts = [
  'theta', 'alpha',
  'delta_g1', 'delta_g2', 'delta_g3', 'delta_g4', 'delta_g5', 'delta_g6',
  'wye_g1', 'wye_g2', 'wye_g3', 'wye_g4', 'wye_g5', 'wye_g6'
];

const evaluate = (time: number, theta = 0, alpha = 0, params: Record<string, number> = { freq: 50, pulse_width_deg: 5 }) => {
  const residual = blockEquations.thyristor_12pulse({
    across: [theta, alpha, ...Array(12).fill(0)],
    dAcross: Array(14).fill(0),
    branch: Array(12).fill(0),
    dBranch: Array(12).fill(0),
    state: [],
    dState: [],
    params,
    ctx: { time, dt: 1e-5, parameters: {}, prevStates: [], states: [], stateDerivatives: [] },
    ports: thyristorPorts,
    nodeId: 'thy12'
  });
  return residual.map(value => value === 0 ? 0 : -value);
};

describe('thyristor12PulseModel', () => {
  it('declares twelve physical gate outputs and physical inputs', () => {
    const block = VLAB_LIBRARY.flatMap(domain => domain.blocks).find(block => block.id === 'thyristor_12pulse');
    expect(block).toBeDefined();
    expect(block!.ports).toHaveLength(14);
    expect(block!.ports.every(port => port.domain === 'Physical')).toBe(true);
    expect(block!.ports.slice(2).map(port => port.id)).toEqual(thyristorPorts.slice(2));
  });

  it('allocates twelve independent gate branches in delta-then-wye order', () => {
    const node: Node = {
      id: 'thy12',
      type: 'thyristor_12pulse',
      position: { x: 0, y: 0 },
      data: { blockId: 'thyristor_12pulse' }
    };
    const names = new DAEAssembler().assemble([node], []).variableNames;
    expect(names.filter(name => name.startsWith('thy12_branch_'))).toEqual([
      'thy12_branch_delta_g1', 'thy12_branch_delta_g2', 'thy12_branch_delta_g3',
      'thy12_branch_delta_g4', 'thy12_branch_delta_g5', 'thy12_branch_delta_g6',
      'thy12_branch_wye_g1', 'thy12_branch_wye_g2', 'thy12_branch_wye_g3',
      'thy12_branch_wye_g4', 'thy12_branch_wye_g5', 'thy12_branch_wye_g6'
    ]);
  });

  it('uses alpha zero instead of replacing it with the default angle', () => {
    const gates = evaluate(0, 0, 0);
    expect(gates[0]).toBe(1);
    expect(gates[6]).toBe(0);
  });

  it('separates the two six-pulse sequences by 30 degrees and each bridge by 60 degrees', () => {
    const atDeltaG2 = evaluate(1 / (6 * 50));
    expect(atDeltaG2.slice(0, 6)).toEqual([0, 1, 0, 0, 0, 0]);
    expect(atDeltaG2.slice(6)).toEqual([0, 0, 0, 0, 0, 0]);

    const atWyeG1 = evaluate(1 / (12 * 50));
    expect(atWyeG1.slice(0, 6)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(atWyeG1.slice(6)).toEqual([1, 0, 0, 0, 0, 0]);
  });

  it('uses the configured frequency and emits finite-width pulses', () => {
    expect(evaluate(1 / (6 * 60), 0, 0, { freq: 60, pulse_width_deg: 5 })[1]).toBe(1);
    expect(evaluate(1 / (6 * 60), 0, 0, { freq: 50, pulse_width_deg: 5 })[1]).toBe(0);

    const justAfterPulse = evaluate(6 / (360 * 50), 0, 0, { freq: 50, pulse_width_deg: 5 });
    expect(justAfterPulse[0]).toBe(0);
  });

  it('does not produce NaN if a malformed caller omits branch entries', () => {
    const residual = blockEquations.thyristor_12pulse({
      across: [0, 0], dAcross: [0, 0], branch: [], dBranch: [], state: [], dState: [],
      params: { freq: 50 },
      ctx: { time: 0, dt: 1e-5, parameters: {}, prevStates: [], states: [], stateDerivatives: [] },
      ports: ['theta', 'alpha'], nodeId: 'thy12'
    });
    expect(residual).toHaveLength(12);
    expect(residual.every(Number.isFinite)).toBe(true);
  });
});
