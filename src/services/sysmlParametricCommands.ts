import { v4 as uuidv4 } from 'uuid';
import type { ConnectorUsage, ParametricEnd, SysmlRepository } from '../engine/sysml/model';
import type { SysmlDiagnostic } from '../engine/sysml/validation';
import { createIbdConnector } from '../engine/sysml/ibd';
import type { SysmlEditorCommand } from './sysmlCommandGateway';

export interface CreateParametricBindingIntent {
  /** The Block whose parametric diagram the binding belongs to. */
  contextId: string;
  source: ParametricEnd;
  target: ParametricEnd;
  connectorId?: string;
}

export interface CreateParametricBindingPlan {
  ok: boolean;
  command?: SysmlEditorCommand;
  connector?: ConnectorUsage;
  diagnostics: SysmlDiagnostic[];
}

/**
 * Plans a parametric binding: checks both ends (context membership, parameter
 * choice, type compatibility, duplicates) and returns the gateway command.
 * `sourcePortId`/`targetPortId` carry the parameter id when there is one, else
 * the property id, so every end has its own stable identity.
 */
export function buildCreateParametricBindingCommand(
  repo: SysmlRepository,
  intent: CreateParametricBindingIntent,
): CreateParametricBindingPlan {
  const id = intent.connectorId ?? uuidv4();
  const input = {
    id, kind: 'binding' as const, ownerId: intent.contextId,
    sourcePortId: intent.source.parameterId ?? intent.source.propertyId,
    targetPortId: intent.target.parameterId ?? intent.target.propertyId,
    sourceEnd: intent.source, targetEnd: intent.target,
  };
  const result = createIbdConnector(repo, input);
  if (!result.connector) return { ok: false, diagnostics: result.diagnostics };
  return {
    ok: true,
    connector: result.connector,
    command: { type: 'createElement', element: result.connector },
    diagnostics: [],
  };
}
