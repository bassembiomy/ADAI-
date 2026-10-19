import type { ConnectorUsage, SysmlRepository } from '../engine/sysml/model';
import type { SysmlDiagnostic } from '../engine/sysml/validation';
import { createIbdConnector } from '../engine/sysml/ibd';
import { isParametricBinding } from '../engine/sysml/parametric';
import { connectorEndAsPath, connectorEndKey, type ConnectorEnd, type ConnectorSide } from '../engine/sysml/connectorEnds';
import { pathEndpointOf } from '../features/sysml/pathConnectorProjection';
import { pathEndOf, toPathSpec } from './sysmlIbdConnectorCommands';
import type { SysmlEditorCommand } from './sysmlCommandGateway';

/** Separator the IBD connector editor uses inside an end id: `<part or context id>::<port id>`. */
const END_SEPARATOR = '::';

/** The `<part>::<port>` id of a stored connector end, as the IBD connector editor lists its ports. */
function editorEndId(repo: SysmlRepository, connector: ConnectorUsage, side: ConnectorSide): string {
  const stored = side === 'source' ? connector.sourcePortId : connector.targetPortId;
  if (isParametricBinding(connector)) return stored;
  const endpoint = pathEndpointOf(repo, connector, side);
  if (endpoint) return `${endpoint.partId}${END_SEPARATOR}${endpoint.portId}`;
  const usage = repo.usages[stored];
  if (usage?.kind === 'port') return `${usage.ownerId}${END_SEPARATOR}${usage.definitionId}`;
  if (usage?.kind === 'part') return `${usage.id}${END_SEPARATOR}`;
  return stored.includes(END_SEPARATOR) ? stored : `${connector.ownerId}${END_SEPARATOR}${stored}`;
}

/**
 * The value the IBD connector editor edits, read from the stored connector: its real kind and
 * item-flow fields, with the ends expressed as `<part>::<port>` ids the editor can list.
 */
export function connectorEditorValue(repo: SysmlRepository, connectorId: string): ConnectorUsage | undefined {
  const connector = repo.connectors[connectorId];
  if (!connector) return undefined;
  return {
    id: connector.id,
    kind: connector.kind,
    ownerId: connector.ownerId,
    sourcePortId: editorEndId(repo, connector, 'source'),
    targetPortId: editorEndId(repo, connector, 'target'),
    itemFlowId: connector.itemFlowId,
    sourceParameterId: connector.sourceParameterId,
    targetParameterId: connector.targetParameterId,
    itemProperty: connector.itemProperty,
    itemUnit: connector.itemUnit,
  };
}

export interface ConnectorUpdatePlan {
  ok: boolean;
  /** Absent when nothing changed. */
  command?: SysmlEditorCommand;
  diagnostics: SysmlDiagnostic[];
}

const FIELD_KEYS = ['kind', 'itemFlowId', 'itemProperty', 'itemUnit', 'sourceParameterId', 'targetParameterId'] as const;

function endFromEditorId(repo: SysmlRepository, contextId: string, editorId: string): { end?: ConnectorEnd; diagnostics: SysmlDiagnostic[] } {
  const at = editorId.indexOf(END_SEPARATOR);
  const occurrenceId = at < 0 ? editorId : editorId.slice(0, at);
  const portId = at < 0 ? '' : editorId.slice(at + END_SEPARATOR.length);
  const spec = toPathSpec(repo, contextId, { occurrenceId: occurrenceId || null, ...(portId ? { portDefinitionId: portId } : {}) });
  return spec.ok ? { end: pathEndOf(spec.spec), diagnostics: [] } : { diagnostics: spec.diagnostics };
}

/**
 * Maps the value of the IBD connector editor to an `updateElement` of the stored ConnectorUsage.
 * Only real ConnectorUsage fields that differ are written; a changed end is stored the way
 * `createIbdConnector` stores it (a property path plus its `connectorEndKey`), so no stale
 * `sourceEnd` / `targetEnd` is left behind.
 */
export function buildConnectorUpdateCommand(
  repo: SysmlRepository,
  connectorId: string,
  editorValue: ConnectorUsage,
): ConnectorUpdatePlan {
  const stored = repo.connectors[connectorId];
  if (!stored) {
    return { ok: false, diagnostics: [{ code: 'CONNECTOR_NOT_FOUND', severity: 'error', elementId: connectorId, message: `Connector ${connectorId} does not exist` }] };
  }
  const patch: Record<string, unknown> = {};
  for (const key of FIELD_KEYS) {
    if (editorValue[key] !== stored[key]) patch[key] = editorValue[key];
  }

  const endsEditable = !isParametricBinding(stored);
  const sourceChanged = endsEditable && editorValue.sourcePortId !== editorEndId(repo, stored, 'source');
  const targetChanged = endsEditable && editorValue.targetPortId !== editorEndId(repo, stored, 'target');
  if (sourceChanged || targetChanged) {
    const resolve = (side: ConnectorSide, changed: boolean) => changed
      ? endFromEditorId(repo, stored.ownerId, side === 'source' ? editorValue.sourcePortId : editorValue.targetPortId)
      : { end: connectorEndAsPath(repo, stored, side), diagnostics: [] as SysmlDiagnostic[] };
    const source = resolve('source', sourceChanged);
    const target = resolve('target', targetChanged);
    const diagnostics = [...source.diagnostics, ...target.diagnostics];
    if (diagnostics.length > 0 || !source.end || !target.end) {
      return { ok: false, diagnostics: diagnostics.length > 0 ? diagnostics : [{ code: 'MISSING_CONNECTOR_ENDPOINT', severity: 'error', elementId: connectorId, message: 'A connector end cannot be resolved.' }] };
    }
    patch.sourceEnd = source.end;
    patch.targetEnd = target.end;
    patch.sourcePortId = connectorEndKey(source.end);
    patch.targetPortId = connectorEndKey(target.end);
  }

  if (Object.keys(patch).length === 0) return { ok: true, diagnostics: [] };

  if ('kind' in patch || 'sourceEnd' in patch) {
    const merged = { ...stored, ...patch } as ConnectorUsage;
    const validation = createIbdConnector(repo, {
      id: merged.id, kind: merged.kind, ownerId: merged.ownerId,
      sourcePortId: merged.sourcePortId, targetPortId: merged.targetPortId,
      sourceEnd: merged.sourceEnd, targetEnd: merged.targetEnd,
      itemFlowId: merged.itemFlowId, sourceParameterId: merged.sourceParameterId,
      targetParameterId: merged.targetParameterId, itemProperty: merged.itemProperty, itemUnit: merged.itemUnit,
    });
    if (!validation.connector) return { ok: false, diagnostics: validation.diagnostics };
  }
  return { ok: true, command: { type: 'updateElement', elementId: connectorId, patch }, diagnostics: [] };
}
