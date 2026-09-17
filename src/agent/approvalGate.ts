import { ApprovalRequest, ApprovalType, ApprovalStatus } from './types';
import { AdiaBlockCatalog } from './adiaBlockCatalog';

export interface ExtendedApprovalRequest extends ApprovalRequest {
  expiresAt?: string;
}

/**
 * Creates a unique, one-time approval request.
 */
export function createApprovalRequest(
  type: ApprovalType,
  title: string,
  description: string,
  payload: Record<string, unknown>,
  expiresInSeconds?: number
): ExtendedApprovalRequest {
  const now = Date.now();
  const createdAt = new Date(now).toISOString();
  const expiresAt =
    expiresInSeconds !== undefined
      ? new Date(now + expiresInSeconds * 1000).toISOString()
      : undefined;

  return {
    id: `app-req-${now}-${Math.random().toString(36).substring(2, 7)}`,
    type,
    title,
    description,
    status: 'pending',
    createdAt,
    expiresAt,
    payload
  };
}

/**
 * Approves a pending approval request. Strictly prevents token reuse.
 */
export function approve(
  request: ExtendedApprovalRequest,
  reason?: string
): ExtendedApprovalRequest {
  if (request.status !== 'pending') {
    throw new Error(`Cannot approve request with status '${request.status}': token cannot be reused`);
  }

  if (request.expiresAt && new Date(request.expiresAt).getTime() < Date.now()) {
    throw new Error('Cannot approve expired request');
  }

  const decidedAt = new Date().toISOString();
  return Object.freeze({
    ...request,
    status: 'approved',
    decidedAt,
    reason: reason || 'Approved by user'
  });
}

/**
 * Rejects a pending approval request with reason.
 */
export function reject(
  request: ExtendedApprovalRequest,
  reason: string
): ExtendedApprovalRequest {
  if (request.status !== 'pending') {
    throw new Error(`Cannot reject request with status '${request.status}'`);
  }

  const decidedAt = new Date().toISOString();
  return {
    ...request,
    status: 'rejected',
    decidedAt,
    reason
  };
}

/**
 * Cancels a pending approval request.
 */
export function cancel(
  request: ExtendedApprovalRequest,
  reason: string
): ExtendedApprovalRequest {
  if (request.status !== 'pending') {
    throw new Error(`Cannot cancel request with status '${request.status}'`);
  }

  const decidedAt = new Date().toISOString();
  return {
    ...request,
    status: 'cancelled',
    decidedAt,
    reason
  };
}

/**
 * Strictly verifies that a proposed block exists in the read-only ADIA catalog.
 * Prohibits the creation or hallucination of new blocks.
 */
export function validateBlockProposal(blockId: string): void {
  if (!AdiaBlockCatalog.isExistingBlockId(blockId)) {
    throw new Error(
      `Proposal rejected: block '${blockId}' does not exist in ADIA catalog. Creating new blocks is strictly prohibited.`
    );
  }
}
