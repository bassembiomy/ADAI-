import { v4 as uuidv4 } from 'uuid';
import type { ConnectorUsage, SysmlRepository } from '../engine/sysml/model';
import type { SysmlDiagnostic } from '../engine/sysml/validation';
import { createIbdConnector } from '../engine/sysml/ibd';
import { connectorEndKey, type ConnectorEnd } from '../engine/sysml/connectorEnds';
import { resolveOccurrenceKey } from '../engine/sysml/partOccurrences';
import type { SysmlEditorCommand } from './sysmlCommandGateway';

/**
 * IBD connectors (format 5): every connector end is a `ConnectorEnd` — a property
 * path under the context Block plus an optional port declared by the type of the
 * last property (path `[]` + port = a boundary port of the context Block). No
 * part or port usage record is read or created.
 */
export interface IbdEndpointSpec {
  /**
   * The part the end attaches to, as the IBD shows it: a property id or a path
   * string (`a/b`). Null, omitted or the context id means the context boundary.
   */
  occurrenceId?: string | null;
  /** Omit (or leave empty) to connect the part itself instead of one of its ports. */
  portDefinitionId?: string;
  /**
   * Nested connector end: property path under the context Block (empty or omitted
   * with a port id means the boundary). Takes precedence over `occurrenceId`.
   */
  path?: string[];
  /** Port id on the type of the last path property (or on the context Block for an empty path). */
  portId?: string;
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

type PathSpecOutcome = { ok: true; spec: IbdEndpointSpec & { path: string[] } } | { ok: false; diagnostics: SysmlDiagnostic[] };

function failure(code: string, elementId: string, message: string): PathSpecOutcome {
  return { ok: false, diagnostics: [{ code, severity: 'error', elementId, message }] };
}

function pathEndOf(spec: IbdEndpointSpec & { path: string[] }): ConnectorEnd {
  const portId = spec.portId ?? spec.portDefinitionId;
  return { path: [...spec.path], ...(portId ? { portId } : {}) };
}

/** Turns the part the IBD shows (property id or path string) into the property path of a connector end. */
function toPathSpec(repo: SysmlRepository, contextId: string, spec: IbdEndpointSpec): PathSpecOutcome {
  const portId = spec.portId ?? spec.portDefinitionId;
  if (spec.path) return { ok: true, spec: { ...spec, path: [...spec.path] } };
  const occurrenceId = spec.occurrenceId;
  if (occurrenceId == null || occurrenceId === contextId) {
    const context = repo.definitions[contextId];
    if (!context || context.kind !== 'block') {
      return failure('ENDPOINT_OUTSIDE_IBD_CONTEXT', contextId, `Context Block ${contextId} does not exist in repository definitions.`);
    }
    if (!portId) {
      return failure('PORT_NOT_FOUND', contextId, 'The context Block itself cannot be a connector end; choose one of its ports.');
    }
    return { ok: true, spec: { path: [], portId } };
  }
  const occurrence = resolveOccurrenceKey(repo, occurrenceId, contextId);
  if (occurrence) return { ok: true, spec: { path: occurrence.path, ...(portId ? { portId } : {}) } };
  if (resolveOccurrenceKey(repo, occurrenceId)) {
    return failure('ENDPOINT_OUTSIDE_IBD_CONTEXT', occurrenceId, `Part ${occurrenceId} does not belong to the active IBD context ${contextId}.`);
  }
  return failure('PART_NOT_FOUND', occurrenceId, `Part ${occurrenceId} does not exist.`);
}

/**
 * Plans a connector whose ends are property paths (nested connector ends). It
 * creates no part or port usage records: the ends are validated against the
 * Block properties and ports, then stored as `ConnectorEnd`s.
 */
export function buildCreatePathIbdConnectorCommand(
  repo: SysmlRepository,
  intent: CreateIbdConnectorIntent,
): CreateIbdConnectorCommandPlan {
  const sourceSpec = toPathSpec(repo, intent.contextId, intent.source);
  if (!sourceSpec.ok) return { ok: false, diagnostics: sourceSpec.diagnostics };
  const targetSpec = toPathSpec(repo, intent.contextId, intent.target);
  if (!targetSpec.ok) return { ok: false, diagnostics: targetSpec.diagnostics };
  const source = pathEndOf(sourceSpec.spec);
  const target = pathEndOf(targetSpec.spec);
  if (source.path.length === 0 && target.path.length === 0 && (intent.kind ?? 'assembly') === 'assembly') {
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
  // A delegation joins a boundary port to a port of an internal part; anything else (a part end, two parts) is an assembly.
  const kind: ConnectorUsage['kind'] = intent.kind
    ?? ((source.path.length === 0) !== (target.path.length === 0) && source.portId && target.portId ? 'delegation' : 'assembly');
  const connectorId = intent.connectorId || uuidv4();
  const input = {
    id: connectorId,
    kind,
    ownerId: intent.contextId,
    sourcePortId: connectorEndKey(source),
    targetPortId: connectorEndKey(target),
    sourceEnd: source,
    targetEnd: target,
    itemFlowId: intent.itemFlowId,
  };
  const validation = createIbdConnector(repo, input);
  if (validation.diagnostics.length > 0 || !validation.connector) {
    return { ok: false, diagnostics: validation.diagnostics };
  }
  return {
    ok: true,
    connector: validation.connector,
    command: { type: 'createAndPresent', diagramId: intent.contextId, element: validation.connector, presentation: {} },
    diagnostics: [],
  };
}

/** Plans a connector between the parts/ports the IBD shows; the ends are stored as property paths. */
export function buildCreateIbdConnectorCommand(
  repo: SysmlRepository,
  intent: CreateIbdConnectorIntent,
): CreateIbdConnectorCommandPlan {
  return buildCreatePathIbdConnectorCommand(repo, intent);
}
