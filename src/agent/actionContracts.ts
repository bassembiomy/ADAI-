import { AdiaBlockCatalog } from './adiaBlockCatalog';

export type ActionKind =
  | 'instantiate_block'
  | 'connect_ports'
  | 'configure_parameters'
  | 'run_simulation'
  | 'generate_code'
  | 'run_tests'
  | 'generate_report';

export const VALID_ACTION_KINDS: readonly ActionKind[] = [
  'instantiate_block',
  'connect_ports',
  'configure_parameters',
  'run_simulation',
  'generate_code',
  'run_tests',
  'generate_report'
] as const;

export interface ApprovedAction {
  id: string;
  kind: ActionKind;
  projectId: string;
  targetWorkspace: string;
  params: Record<string, unknown>;
  blockIds: string[];
  approvalId: string;
  expectedEvidence: string;
}

export interface ToolResult {
  success: boolean;
  changedArtifacts: string[];
  evidence: Record<string, unknown>;
  stdout?: string;
  stderr?: string;
  durationMs: number;
  error?: string;
}

export interface InspectionResult {
  success: boolean;
  data: Record<string, unknown>;
  error?: string;
}

export interface ToolAdapter {
  execute(action: ApprovedAction): Promise<ToolResult>;
  inspect(params: Record<string, unknown>): Promise<InspectionResult>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates that an ApprovedAction has required non-empty IDs,
 * a valid ActionKind, and only references real catalog block IDs.
 */
export function validateApprovedAction(action: ApprovedAction): ValidationResult {
  const errors: string[] = [];

  if (!action.id || !action.id.trim()) {
    errors.push('Action must have a valid non-empty id');
  }

  if (!action.approvalId || !action.approvalId.trim()) {
    errors.push('Action must have a valid non-empty approvalId');
  }

  if (!action.projectId || !action.projectId.trim()) {
    errors.push('Action must have a valid non-empty projectId');
  }

  if (!VALID_ACTION_KINDS.includes(action.kind)) {
    errors.push(`Invalid ActionKind: '${action.kind}'. Must be one of: ${VALID_ACTION_KINDS.join(', ')}`);
  }

  if (Array.isArray(action.blockIds)) {
    for (const blockId of action.blockIds) {
      if (!AdiaBlockCatalog.isExistingBlockId(blockId)) {
        errors.push(`Block ID '${blockId}' is absent from the live ADIA catalog`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
