import { v4 as uuidv4 } from 'uuid';
import type { ConnectorUsage, PortDefinition, PortUsage, SysmlRepository } from '../engine/sysml/model';
import type { SysmlDiagnostic } from '../engine/sysml/validation';
import { createIbdConnector, findPortDefinition } from '../engine/sysml/ibd';
import type { SysmlEditorCommand, SysmlMutationCommand } from './sysmlCommandGateway';

export interface IbdEndpointResolution {
  ok: boolean;
  portUsageId?: string;
  portUsage?: PortUsage;
  ownerId?: string;
  definitionId?: string;
  portDefinition?: PortDefinition;
  isBoundary: boolean;
  diagnostics: SysmlDiagnostic[];
}

export interface IbdEndpointSpec {
  occurrenceId?: string | null;
  portDefinitionId: string;
  portUsageId?: string;
}

export interface CreateIbdConnectorIntent {
  contextId: string;
  source: IbdEndpointSpec;
  target: IbdEndpointSpec;
  kind?: ConnectorUsage['kind'];
  itemFlowId?: string;
  connectorId?: string;
}

export interface CreateIbdConnectorCommandPlan {
  ok: boolean;
  command?: SysmlEditorCommand;
  connector?: ConnectorUsage;
  diagnostics: SysmlDiagnostic[];
}

export function resolveIbdEndpoint(
  repo: SysmlRepository,
  contextId: string,
  occurrenceId: string | null | undefined,
  portDefinitionId: string,
): IbdEndpointResolution {
  const isBoundary = occurrenceId == null || occurrenceId === contextId;

  if (isBoundary) {
    const contextDef = repo.definitions[contextId];
    if (!contextDef || contextDef.kind !== 'block') {
      return {
        ok: false,
        isBoundary: true,
        diagnostics: [{
          code: 'ENDPOINT_OUTSIDE_IBD_CONTEXT',
          severity: 'error',
          elementId: contextId,
          message: `Context Block ${contextId} does not exist in repository definitions.`,
        }],
      };
    }

    const portDef = findPortDefinition(repo, contextId, portDefinitionId);
    if (!portDef) {
      return {
        ok: false,
        isBoundary: true,
        diagnostics: [{
          code: 'PORT_NOT_FOUND',
          severity: 'error',
          elementId: portDefinitionId,
          message: `Port ${portDefinitionId} not found on Context Block ${contextId}.`,
        }],
      };
    }

    const existingUsage = Object.values(repo.usages).find(
      (u): u is PortUsage => u.kind === 'port' && u.ownerId === contextId && (u.definitionId === portDef.id || u.id === portDefinitionId),
    );

    const portUsageId = existingUsage ? existingUsage.id : `${contextId}::${portDef.id}`;
    const portUsage: PortUsage = existingUsage ?? {
      id: portUsageId,
      name: portDef.name,
      kind: 'port',
      ownerId: contextId,
      definitionId: portDef.id,
    };

    return {
      ok: true,
      isBoundary: true,
      ownerId: contextId,
      definitionId: portDef.id,
      portDefinition: portDef,
      portUsageId,
      portUsage,
      diagnostics: [],
    };
  }

  // Occurrence port on PartProperty inside context block
  const partUsage = repo.usages[occurrenceId];
  if (!partUsage || partUsage.kind !== 'part') {
    return {
      ok: false,
      isBoundary: false,
      diagnostics: [{
        code: 'PART_NOT_FOUND',
        severity: 'error',
        elementId: occurrenceId,
        message: `Part usage ${occurrenceId} does not exist.`,
      }],
    };
  }

  if (partUsage.ownerId !== contextId) {
    return {
      ok: false,
      isBoundary: false,
      diagnostics: [{
        code: 'ENDPOINT_OUTSIDE_IBD_CONTEXT',
        severity: 'error',
        elementId: occurrenceId,
        message: `Part usage ${occurrenceId} belongs to ${partUsage.ownerId}, not the active IBD context ${contextId}.`,
      }],
    };
  }

  const portDef = findPortDefinition(repo, partUsage.typeId, portDefinitionId);
  if (!portDef) {
    return {
      ok: false,
      isBoundary: false,
      diagnostics: [{
        code: 'PORT_NOT_FOUND',
        severity: 'error',
        elementId: portDefinitionId,
        message: `Port ${portDefinitionId} not found on Part ${occurrenceId} (typed by ${partUsage.typeId}).`,
      }],
    };
  }

  const existingUsage = Object.values(repo.usages).find(
    (u): u is PortUsage => u.kind === 'port' && u.ownerId === occurrenceId && (u.definitionId === portDef.id || u.id === portDefinitionId),
  );

  const portUsageId = existingUsage ? existingUsage.id : `${occurrenceId}::${portDef.id}`;
  const portUsage: PortUsage = existingUsage ?? {
    id: portUsageId,
    name: portDef.name,
    kind: 'port',
    ownerId: occurrenceId,
    definitionId: portDef.id,
  };

  return {
    ok: true,
    isBoundary: false,
    ownerId: occurrenceId,
    definitionId: portDef.id,
    portDefinition: portDef,
    portUsageId,
    portUsage,
    diagnostics: [],
  };
}

export function buildCreateIbdConnectorCommand(
  repo: SysmlRepository,
  intent: CreateIbdConnectorIntent,
): CreateIbdConnectorCommandPlan {
  const sourceRes = resolveIbdEndpoint(
    repo,
    intent.contextId,
    intent.source.occurrenceId,
    intent.source.portUsageId || intent.source.portDefinitionId,
  );
  if (!sourceRes.ok) {
    return { ok: false, diagnostics: sourceRes.diagnostics };
  }

  const targetRes = resolveIbdEndpoint(
    repo,
    intent.contextId,
    intent.target.occurrenceId,
    intent.target.portUsageId || intent.target.portDefinitionId,
  );
  if (!targetRes.ok) {
    return { ok: false, diagnostics: targetRes.diagnostics };
  }

  let kind = intent.kind;
  if (!kind) {
    if (sourceRes.isBoundary !== targetRes.isBoundary) {
      kind = 'delegation';
    } else if (!sourceRes.isBoundary && !targetRes.isBoundary) {
      kind = 'assembly';
    } else {
      kind = 'assembly';
    }
  }

  if (sourceRes.isBoundary && targetRes.isBoundary && kind === 'assembly') {
    return {
      ok: false,
      diagnostics: [{
        code: 'INVALID_CONNECTOR_CONTEXT',
        severity: 'error',
        elementId: intent.contextId,
        message: 'Assembly connectors must connect internal part roles, not boundary ports.',
      }],
    };
  }

  const workingRepo: SysmlRepository = {
    ...repo,
    usages: { ...repo.usages },
    connectors: { ...repo.connectors },
  };
  const setupCommands: SysmlMutationCommand[] = [];

  if (!workingRepo.usages[sourceRes.portUsageId!]) {
    workingRepo.usages[sourceRes.portUsageId!] = sourceRes.portUsage!;
    setupCommands.push({ type: 'createElement', element: sourceRes.portUsage! });
  }
  if (!workingRepo.usages[targetRes.portUsageId!]) {
    workingRepo.usages[targetRes.portUsageId!] = targetRes.portUsage!;
    setupCommands.push({ type: 'createElement', element: targetRes.portUsage! });
  }

  const connectorId = intent.connectorId || uuidv4();
  const connectorCandidate: ConnectorUsage = {
    id: connectorId,
    kind,
    ownerId: intent.contextId,
    sourcePortId: sourceRes.portUsageId!,
    targetPortId: targetRes.portUsageId!,
    itemFlowId: intent.itemFlowId,
  };

  const validation = createIbdConnector(workingRepo, {
    id: connectorId,
    kind,
    ownerId: intent.contextId,
    sourcePortId: sourceRes.portUsageId!,
    targetPortId: targetRes.portUsageId!,
    itemFlowId: intent.itemFlowId,
  });

  if (validation.diagnostics.length > 0 || !validation.connector) {
    return { ok: false, diagnostics: validation.diagnostics };
  }

  const mainCommand: SysmlMutationCommand = {
    type: 'createAndPresent',
    diagramId: intent.contextId,
    element: connectorCandidate,
    presentation: {},
  };

  const command: SysmlEditorCommand = setupCommands.length > 0
    ? { type: 'batch', commands: [...setupCommands, mainCommand] }
    : mainCommand;

  return {
    ok: true,
    command,
    connector: connectorCandidate,
    diagnostics: [],
  };
}
