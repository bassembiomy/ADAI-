import { describe, it, expect } from 'vitest';
import { Node } from '@xyflow/react';
import { DAEAssembler } from './DAEAssembler';

describe('threePhaseInverterModel', () => {
  it('allocates DC-link and phase-current branches', () => {
    const node: Node = { id: 'inv', type: 'pwm_3ph_2level', position: { x: 0, y: 0 }, data: { blockId: 'pwm_3ph_2level' } };
    const names = new DAEAssembler().assemble([node], []).variableNames;
    expect(names.filter(name => name.startsWith('inv_branch_'))).toEqual([
      'inv_branch_dc_link', 'inv_branch_current_a', 'inv_branch_current_b', 'inv_branch_current_c'
    ]);
  });
});
