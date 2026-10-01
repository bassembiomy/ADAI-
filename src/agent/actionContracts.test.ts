import { describe, it, expect } from 'vitest';
import {
  ActionKind,
  ApprovedAction,
  ToolResult,
  validateApprovedAction
} from './actionContracts';
import { AdiaBlockCatalog } from './adiaBlockCatalog';

describe('Action and Adapter Contracts', () => {
  const validAction: ApprovedAction = {
    id: 'act-101',
    kind: 'instantiate_block',
    projectId: 'proj-airfryer-1',
    targetWorkspace: 'xbridges',
    params: { blockName: 'motor_1', position: { x: 100, y: 150 } },
    blockIds: ['bldc_motor'],
    approvalId: 'appr-req-202',
    expectedEvidence: 'Block bldc_motor instantiated in workspace model'
  };

  it('accepts a valid approved action with catalog-valid block IDs and approval metadata', () => {
    const result = validateApprovedAction(validAction);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects an action missing approvalId', () => {
    const invalid = { ...validAction, approvalId: '' };
    const result = validateApprovedAction(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Action must have a valid non-empty approvalId');
  });

  it('rejects an action missing projectId', () => {
    const invalid = { ...validAction, projectId: '' };
    const result = validateApprovedAction(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Action must have a valid non-empty projectId');
  });

  it('rejects an action containing block IDs that do not exist in the ADIA catalog', () => {
    const invalid = { ...validAction, blockIds: ['non_existent_fake_block_999'] };
    const result = validateApprovedAction(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('non_existent_fake_block_999'))).toBe(true);
  });

  it('rejects an action with invalid or unknown ActionKind', () => {
    const invalid = { ...validAction, kind: 'fake_action_kind' as ActionKind };
    const result = validateApprovedAction(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('fake_action_kind'))).toBe(true);
  });

  it('validates supported action kinds include all required operations', () => {
    const supportedKinds: ActionKind[] = [
      'instantiate_block',
      'connect_ports',
      'configure_parameters',
      'run_simulation',
      'generate_code',
      'run_tests',
      'generate_report'
    ];

    for (const kind of supportedKinds) {
      const act: ApprovedAction = {
        ...validAction,
        id: `act-${kind}`,
        kind,
        blockIds: kind === 'instantiate_block' ? ['bldc_motor'] : []
      };
      const res = validateApprovedAction(act);
      expect(res.valid).toBe(true);
    }
  });
});
