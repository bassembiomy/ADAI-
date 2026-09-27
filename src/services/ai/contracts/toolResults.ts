import { z } from 'zod';
import { StructuredDiagnostic, StructuredDiagnosticSchema } from './engineeringModel';

export type ToolExecutionStatus = 'SUCCESS' | 'FAILURE' | 'BLOCKED' | 'REQUIRES_APPROVAL';
export const ToolExecutionStatusEnum = z.enum(['SUCCESS', 'FAILURE', 'BLOCKED', 'REQUIRES_APPROVAL']);

export interface BaseToolResult {
  readonly toolName: string;
  readonly status: ToolExecutionStatus;
  readonly timestamp: string;
  readonly projectRevision?: number;
  readonly message?: string;
  readonly durationMs?: number;
}

export interface SuccessToolResult<T = unknown> extends BaseToolResult {
  readonly status: 'SUCCESS';
  readonly data: T;
}

export interface FailureToolResult extends BaseToolResult {
  readonly status: 'FAILURE';
  readonly error: string;
  readonly diagnostics?: StructuredDiagnostic[];
}

export interface BlockedToolResult extends BaseToolResult {
  readonly status: 'BLOCKED';
  readonly reason: string;
  readonly diagnostics?: StructuredDiagnostic[];
}

export interface RequiresApprovalToolResult extends BaseToolResult {
  readonly status: 'REQUIRES_APPROVAL';
  readonly approvalToken: string;
  readonly reason: string;
  readonly mutationIntent?: unknown;
}

export type ToolResult<T = unknown> =
  | SuccessToolResult<T>
  | FailureToolResult
  | BlockedToolResult
  | RequiresApprovalToolResult;

export function createSuccessToolResult<T>(
  toolName: string,
  data: T,
  projectRevision?: number,
  message?: string,
  durationMs?: number
): SuccessToolResult<T> {
  return {
    toolName,
    status: 'SUCCESS',
    data,
    projectRevision,
    message,
    timestamp: new Date().toISOString(),
    durationMs
  };
}

export function createFailureToolResult(
  toolName: string,
  error: string,
  diagnostics?: StructuredDiagnostic[],
  projectRevision?: number,
  durationMs?: number
): FailureToolResult {
  return {
    toolName,
    status: 'FAILURE',
    error,
    diagnostics,
    projectRevision,
    timestamp: new Date().toISOString(),
    durationMs
  };
}

export function createBlockedToolResult(
  toolName: string,
  reason: string,
  diagnostics?: StructuredDiagnostic[],
  projectRevision?: number,
  durationMs?: number
): BlockedToolResult {
  return {
    toolName,
    status: 'BLOCKED',
    reason,
    diagnostics,
    projectRevision,
    timestamp: new Date().toISOString(),
    durationMs
  };
}

export function createRequiresApprovalToolResult(
  toolName: string,
  approvalToken: string,
  reason: string,
  projectRevision?: number,
  mutationIntent?: unknown,
  durationMs?: number
): RequiresApprovalToolResult {
  return {
    toolName,
    status: 'REQUIRES_APPROVAL',
    approvalToken,
    reason,
    projectRevision,
    mutationIntent,
    timestamp: new Date().toISOString(),
    durationMs
  };
}
