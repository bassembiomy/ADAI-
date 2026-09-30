import { describe, expect, it } from 'vitest';
import type { Node } from '@xyflow/react';
import { DAEAssembler } from './DAEAssembler';

describe('viennaPwmModel', () => {
  it('allocates one branch for each Vienna Rectifier output', () => {
    const node: Node = { id: 'pwm', type: 'pwm_vienna', position: { x: 0, y: 0 }, data: { blockId: 'pwm_vienna' } };
    const names = new DAEAssembler().assemble([node], []).variableNames;
    expect(names.filter(name => name.startsWith('pwm_branch_'))).toEqual([
      'pwm_branch_ga', 'pwm_branch_gb', 'pwm_branch_gc',
      'pwm_branch_ma', 'pwm_branch_mb', 'pwm_branch_mc'
    ]);
  });
});
