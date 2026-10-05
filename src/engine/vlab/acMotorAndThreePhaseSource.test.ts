import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { DAEAssembler } from './DAEAssembler';
import { blockEquations } from './vlabEquations';
import type { EquationContext } from './types';

const context: EquationContext = {
  dt: 0.001,
  time: 0,
  parameters: {},
  prevStates: [],
  states: [],
  stateDerivatives: []
};

const acMotorResiduals = (params: Record<string, number>) => blockEquations.ac_motor({
  across: [230, -115, -115, 0, 10],
  dAcross: [0, 0, 0, 0, 0],
  branch: [3, -1, -2, 1],
  dBranch: [0, 0, 0, 0],
  state: [0, 10, 0.2, 0.1],
  dState: [10, 2, 0.03, -0.02],
  params,
  ctx: context,
  ports: ['a', 'b', 'c', 'n', 'r'],
  nodeId: 'motor'
});

describe('AC Motor and 3-Phase Source DAE consistency', () => {
  it('uses Rr and Lm in the AC Motor rotor-flux model', () => {
    const baseline = acMotorResiduals({ Rs: 0.1, Rr: 0.08, Lm: 0.05, P: 2, J: 0.05, B: 0.005 });
    const changedRr = acMotorResiduals({ Rs: 0.1, Rr: 0.16, Lm: 0.05, P: 2, J: 0.05, B: 0.005 });
    const changedLm = acMotorResiduals({ Rs: 0.1, Rr: 0.08, Lm: 0.1, P: 2, J: 0.05, B: 0.005 });

    expect(baseline).toHaveLength(8);
    expect(changedRr[6]).not.toBeCloseTo(baseline[6]);
    expect(changedLm[5]).not.toBeCloseTo(baseline[5]);
    expect(changedLm[6]).not.toBeCloseTo(baseline[6]);
  });

  it('allocates the AC Motor rotor-flux states', () => {
    const motor: Node = {
      id: 'motor',
      type: 'ac_motor',
      position: { x: 0, y: 0 },
      data: { blockId: 'ac_motor' }
    };

    const system = new DAEAssembler().assemble([motor], []);

    expect(system.variableNames).toContain('motor_state_psi_r_alpha');
    expect(system.variableNames).toContain('motor_state_psi_r_beta');
  });

  it('allocates one independent branch for each 3-Phase Source port', () => {
    const source: Node = {
      id: 'source',
      type: 'three_phase_source',
      position: { x: 0, y: 0 },
      data: { blockId: 'three_phase_source' }
    };

    const system = new DAEAssembler().assemble([source], []);
    const phaseBranches = system.variableNames.filter(name => name.startsWith('source_branch_phase_'));

    expect(phaseBranches).toEqual([
      'source_branch_phase_a',
      'source_branch_phase_b',
      'source_branch_phase_c'
    ]);
  });
});
