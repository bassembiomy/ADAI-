import { describe, it, expect } from 'vitest';
import {
  createApprovalRequest,
  approve,
  reject,
  cancel,
  validateBlockProposal
} from './approvalGate';
import { ApprovalRequest } from './types';

describe('ApprovalGate', () => {
  it('creates an approval request with status pending and unique id', () => {
    const req = createApprovalRequest(
      'specification',
      'Approve Air Fryer Spec',
      'Review thermal & control specification',
      { specId: 'spec-1' }
    );

    expect(req.id).toMatch(/^app-req-/);
    expect(req.status).toBe('pending');
    expect(req.type).toBe('specification');
    expect(req.createdAt).toBeDefined();
  });

  it('approves a pending request and sets decidedAt', () => {
    const req = createApprovalRequest('plan', 'Approve Plan', 'Review execution plan', { planId: 'p-1' });
    const approved = approve(req, 'Approved by lead engineer');

    expect(approved.status).toBe('approved');
    expect(approved.decidedAt).toBeDefined();
    expect(approved.reason).toBe('Approved by lead engineer');
  });

  it('rejects a pending request with explicit reason', () => {
    const req = createApprovalRequest('change', 'Add heating block', 'Instantiate block', { blockId: 'resistor' });
    const rejected = reject(req, 'Need different wattage model');

    expect(rejected.status).toBe('rejected');
    expect(rejected.decidedAt).toBeDefined();
    expect(rejected.reason).toBe('Need different wattage model');
  });

  it('cancels a pending request', () => {
    const req = createApprovalRequest('default_proposal', 'Set fan speed', 'Default speed', {});
    const cancelled = cancel(req, 'Superseded by user custom input');

    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.reason).toBe('Superseded by user custom input');
  });

  it('prevents approving an already approved, rejected, or cancelled request (no token reuse)', () => {
    const req = createApprovalRequest('plan', 'Plan', 'desc', {});
    const approved = approve(req);

    expect(() => approve(approved)).toThrow(/Cannot approve request with status 'approved'/);
    expect(() => reject(approved, 'Too late')).toThrow(/Cannot reject request with status 'approved'/);

    const req2 = createApprovalRequest('plan', 'Plan', 'desc', {});
    const rejected = reject(req2, 'Wrong spec');
    expect(() => approve(rejected)).toThrow(/Cannot approve request with status 'rejected'/);
  });

  it('rejects approval when request is expired', () => {
    const expiredReq = createApprovalRequest(
      'specification',
      'Spec',
      'desc',
      {},
      -10 // expired 10 seconds ago
    );

    expect(() => approve(expiredReq)).toThrow(/Cannot approve expired request/);
  });

  it('proves a proposal referencing a non-catalog block is rejected before it can become executable', () => {
    // Known block passes
    expect(() => validateBlockProposal('resistor')).not.toThrow();

    // Non-catalog block throws strict error
    expect(() => validateBlockProposal('fictional_unregistered_quantum_heater')).toThrow(
      /Proposal rejected: block 'fictional_unregistered_quantum_heater' does not exist in ADIA catalog/
    );
  });
});
