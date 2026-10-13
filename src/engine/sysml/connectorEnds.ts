import type { ConnectorUsage, PortDefinition, PropertyDefinition, SysmlRepository } from './model';
import type { SysmlDiagnostic } from './validation';
import { effectiveSupertypeIds } from './services/supertypes';

/**
 * Path-based connector ends (OMG SysML 1.6 §8.3.2.2 «nestedConnectorEnd»).
 *
 * A connector end is identified by a property path starting under the context
 * Block, for example `['vehicle.engine', 'engine.crankshaft']`, plus an optional
 * port id on the type of the last property:
 *  - `path: []` + `portId`  -> a port on the context Block itself (boundary port)
 *  - `path: [...]`          -> the part the path leads to (part end)
 *  - `path: [...]` + `portId` -> a port of that part
 *
 * This is an additional, accepted representation next to the usage-id ends that
 * `ConnectorUsage.sourcePortId/targetPortId` carry today; nothing here changes
 * how usage-id ends are stored or validated.
 */
export interface ConnectorEnd {
  path: string[];
  portId?: string;
}

export type ConnectorSide = 'source' | 'target';

export function isConnectorEnd(value: unknown): value is ConnectorEnd {
  return typeof value === 'object' && value !== null && Array.isArray((value as ConnectorEnd).path);
}

/** The path-based end of a connector side, or undefined for usage-id (and parametric) ends. */
export function connectorEndOf(connector: ConnectorUsage, side: ConnectorSide): ConnectorEnd | undefined {
  const end = side === 'source' ? connector.sourceEnd : connector.targetEnd;
  return isConnectorEnd(end) ? end : undefined;
}

export function isPathConnector(connector: ConnectorUsage): boolean {
  return Boolean(connectorEndOf(connector, 'source') || connectorEndOf(connector, 'target'));
}

/** Stable string identity of an end: `a/b/c` for a part, `a/b/c#portId` for a port, `#portId` for a boundary port. */
export function connectorEndKey(end: ConnectorEnd): string {
  return `${end.path.join('/')}${end.portId ? `#${end.portId}` : ''}`;
}

export const connectorPathKey = (path: readonly string[]): string => path.join('/');

export type PortDirection = PortDefinition['direction'];

export function conjugateDirection(direction: PortDirection): PortDirection {
  return direction === 'in' ? 'out' : direction === 'out' ? 'in' : 'inout';
}

export function effectivePortDirection(definition: PortDefinition): PortDirection {
  return definition.isConjugated ? conjugateDirection(definition.direction) : definition.direction;
}

/** Assembly joins opposite directions (out to in); `inout` joins anything. */
export function directionsCompatible(source: PortDirection, target: PortDirection): boolean {
  return source === 'inout' || target === 'inout' || source !== target;
}

/** A delegation passes the same direction through the boundary. */
export function delegationDirectionsCompatible(source: PortDirection, target: PortDirection): boolean {
  return source === 'inout' || target === 'inout' || source === target;
}

export function findPortDefinition(repo: SysmlRepository, blockId: string, portId: string, visited = new Set<string>()): PortDefinition | undefined {
  if (visited.has(blockId)) return undefined;
  visited.add(blockId);
  const block = repo.definitions[blockId];
  if (!block || block.kind !== 'block') return undefined;
  const direct = block.ports.find(port => port.id === portId);
  if (direct) return direct;
  for (const supertypeId of effectiveSupertypeIds(repo, blockId)) {
    const inherited = findPortDefinition(repo, supertypeId, portId, visited);
    if (inherited) return inherited;
  }
  return undefined;
}

/** A property of a Block, own or inherited through its effective supertypes. */
export function findBlockProperty(repo: SysmlRepository, blockId: string, propertyId: string, visited = new Set<string>()): PropertyDefinition | undefined {
  if (visited.has(blockId)) return undefined;
  visited.add(blockId);
  const block = repo.definitions[blockId];
  if (!block || block.kind !== 'block') return undefined;
  const direct = block.properties.find(property => property.id === propertyId);
  if (direct) return direct;
  for (const supertypeId of effectiveSupertypeIds(repo, blockId)) {
    const inherited = findBlockProperty(repo, supertypeId, propertyId, visited);
    if (inherited) return inherited;
  }
  return undefined;
}

export interface ResolvedConnectorEnd {
  end: ConnectorEnd;
  key: string;
  /** True for a port on the context Block itself. */
  isBoundary: boolean;
  /** The properties the path walks through, outermost first. */
  properties: PropertyDefinition[];
  /** Number of properties in the path; 0 for a boundary port. */
  depth: number;
  /** The Block that owns the port or stands for the part: the context, or the type of the last property. */
  ownerTypeId: string;
  /** The last property of the path (the part this end is or belongs to). */
  part?: PropertyDefinition;
  port?: PortDefinition;
  /** Port direction after its own conjugation; undefined for a part end. */
  effectiveDirection?: PortDirection;
}

export interface EndResolution {
  resolved?: ResolvedConnectorEnd;
  diagnostics: SysmlDiagnostic[];
}

const diag = (code: string, elementId: string, propertyPath: string | undefined, message: string): SysmlDiagnostic =>
  ({ code, severity: 'error', elementId, propertyPath, message });

const END_PROPERTY: Record<ConnectorSide, 'sourceEnd' | 'targetEnd'> = { source: 'sourceEnd', target: 'targetEnd' };

/**
 * Resolves a path-based end against the context Block. Each segment is looked
 * up on the (effective) properties of the previous segment's type, so an
 * inherited part property is a valid segment; the port is looked up on the type
 * of the last property with `findPortDefinition`, which also sees inherited ports.
 */
export function resolveConnectorEnd(
  repo: SysmlRepository,
  contextId: string,
  end: ConnectorEnd,
  side: ConnectorSide = 'source',
  connectorId: string = contextId,
): EndResolution {
  const where = END_PROPERTY[side];
  const key = connectorEndKey(end);
  const context = repo.definitions[contextId];
  if (context?.kind !== 'block') {
    return { diagnostics: [diag('ENDPOINT_OUTSIDE_IBD_CONTEXT', connectorId, where, `Context ${contextId} is not a Block`)] };
  }
  if (end.path.length === 0 && !end.portId) {
    return { diagnostics: [diag('MISSING_CONNECTOR_ENDPOINT', connectorId, where, 'A connector end needs a property path, a port, or both')] };
  }

  const properties: PropertyDefinition[] = [];
  let typeId = contextId;
  for (const segment of end.path) {
    const property = findBlockProperty(repo, typeId, segment, new Set());
    if (!property) {
      return { diagnostics: [diag('MISSING_CONNECTOR_ENDPOINT', connectorId, where, `Property ${segment} of path ${key} does not exist on ${typeId}`)] };
    }
    if (property.kind !== 'part' && property.kind !== 'reference') {
      return { diagnostics: [diag('INVALID_CONNECTOR_PATH', connectorId, where, `Property ${segment} of path ${key} is a ${property.kind} property; a connector path runs through part or reference properties`)] };
    }
    properties.push(property);
    typeId = property.typeId;
  }

  const last = properties[properties.length - 1];
  const base = { end, key, isBoundary: end.path.length === 0, properties, depth: properties.length, ownerTypeId: typeId, part: last };
  if (!end.portId) return { resolved: base, diagnostics: [] };

  if (repo.definitions[typeId]?.kind !== 'block') {
    return { diagnostics: [diag('MISSING_CONNECTOR_ENDPOINT', connectorId, where, `Port ${end.portId} cannot be resolved: ${typeId} is not a Block`)] };
  }
  const port = findPortDefinition(repo, typeId, end.portId);
  if (!port) {
    return { diagnostics: [diag('MISSING_CONNECTOR_ENDPOINT', connectorId, where, `Port ${end.portId} not found on ${typeId}`)] };
  }
  return { resolved: { ...base, port, effectiveDirection: effectivePortDirection(port) }, diagnostics: [] };
}

/**
 * Rewrites a usage-id end (part usage or port usage owned by the context or by
 * a chain of part usages that each carry a `propertyId`) as a path-based end.
 * Used to compare and validate mixed connectors; returns undefined when the
 * usage cannot be expressed as a path.
 */
export function legacyEndToPath(repo: SysmlRepository, contextId: string, usageId: string): ConnectorEnd | undefined {
  const usage = repo.usages[usageId];
  if (!usage) return undefined;
  let portId: string | undefined;
  let partUsage = usage;
  if (usage.kind === 'port') {
    portId = usage.definitionId;
    if (usage.ownerId === contextId) return { path: [], portId };
    const owner = repo.usages[usage.ownerId];
    if (owner?.kind !== 'part') return undefined;
    partUsage = owner;
  }
  const path: string[] = [];
  const seen = new Set<string>();
  let current: typeof usage | undefined = partUsage;
  while (current && current.kind === 'part' && !seen.has(current.id)) {
    seen.add(current.id);
    if (!current.propertyId) return undefined;
    path.unshift(current.propertyId);
    if (current.ownerId === contextId) return { path, ...(portId ? { portId } : {}) };
    current = repo.usages[current.ownerId];
  }
  return undefined;
}

/** The end of a connector side as a path, whichever representation it is stored in. */
export function connectorEndAsPath(repo: SysmlRepository, connector: ConnectorUsage, side: ConnectorSide): ConnectorEnd | undefined {
  return connectorEndOf(connector, side)
    ?? legacyEndToPath(repo, connector.ownerId, side === 'source' ? connector.sourcePortId : connector.targetPortId);
}

/** Port (definition plus effective direction) at one side of a path-based connector, for item-flow checks. */
export function resolveConnectorPortEnd(
  repo: SysmlRepository,
  connector: ConnectorUsage,
  side: ConnectorSide,
): { definition: PortDefinition; effectiveDirection: PortDirection } | undefined {
  const end = connectorEndAsPath(repo, connector, side);
  if (!end) return undefined;
  const resolved = resolveConnectorEnd(repo, connector.ownerId, end, side, connector.id).resolved;
  if (!resolved?.port || !resolved.effectiveDirection) return undefined;
  return { definition: resolved.port, effectiveDirection: resolved.effectiveDirection };
}

/**
 * Port typing for connector ends (OMG SysML 1.6): proxy ports must be typed by
 * an interface definition, full ports by a block, interface, or valueType.
 * Unresolvable types are reported explicitly as UNRESOLVED_IMPORT.
 */
export function validatePortDefinitionTyping(
  repo: SysmlRepository,
  connectorId: string,
  definition: PortDefinition,
  label: string,
  propertyPath: string,
): SysmlDiagnostic[] {
  const diagnostics: SysmlDiagnostic[] = [];
  if (!definition.typeId) {
    if (definition.kind === 'proxy' || definition.kind === 'full') {
      diagnostics.push(diag('MISSING_PORT_TYPE', connectorId, propertyPath, `Port ${label} requires a type`));
    }
    return diagnostics;
  }
  const type = repo.definitions[definition.typeId];
  if (!type) {
    diagnostics.push(diag('UNRESOLVED_IMPORT', connectorId, propertyPath, `Port type ${definition.typeId} cannot be resolved`));
    return diagnostics;
  }
  const typeKind: string = type.kind;
  if (definition.kind === 'proxy' && typeKind !== 'interface') {
    diagnostics.push(diag('MISSING_PORT_TYPE', connectorId, propertyPath, `Proxy port ${label} must be typed by an InterfaceDefinition, found ${typeKind} ${type.id}`));
  } else if (definition.kind === 'full' && typeKind !== 'block' && typeKind !== 'interface' && typeKind !== 'valueType') {
    diagnostics.push(diag('MISSING_PORT_TYPE', connectorId, propertyPath, `Full port ${label} must resolve to a block, interface, or valueType, found ${typeKind} ${type.id}`));
  }
  return diagnostics;
}

/**
 * Validation of a connector whose ends are (or can be expressed as) paths:
 * context membership, end kinds, direction and conjugation, port typing and
 * interface compatibility, duplicates and the delegation rules.
 *
 * - assembly and binding may use ends at any depth;
 * - delegation needs one boundary port and one port directly on a part of the
 *   context (path length 1).
 */
export function validatePathConnector(repo: SysmlRepository, connector: ConnectorUsage): SysmlDiagnostic[] {
  const diagnostics: SysmlDiagnostic[] = [];
  const sourceEnd = connectorEndAsPath(repo, connector, 'source');
  const targetEnd = connectorEndAsPath(repo, connector, 'target');
  if (!sourceEnd) diagnostics.push(diag('MISSING_CONNECTOR_ENDPOINT', connector.id, 'sourcePortId', `Source port ${connector.sourcePortId} cannot be resolved`));
  if (!targetEnd) diagnostics.push(diag('MISSING_CONNECTOR_ENDPOINT', connector.id, 'targetPortId', `Target port ${connector.targetPortId} cannot be resolved`));
  if (!sourceEnd || !targetEnd) return diagnostics;

  const source = resolveConnectorEnd(repo, connector.ownerId, sourceEnd, 'source', connector.id);
  const target = resolveConnectorEnd(repo, connector.ownerId, targetEnd, 'target', connector.id);
  diagnostics.push(...source.diagnostics, ...target.diagnostics);
  if (!source.resolved || !target.resolved) return diagnostics;
  const s = source.resolved;
  const t = target.resolved;

  if (s.key === t.key) diagnostics.push(diag('SELF_CONNECTOR', connector.id, 'targetPortId', 'A connector cannot connect a port to itself'));

  if (connector.kind === 'assembly') {
    if (s.isBoundary || t.isBoundary) {
      diagnostics.push(diag('INVALID_CONNECTOR_CONTEXT', connector.id, 'ownerId', 'Assembly endpoints must be roles in the connector owning context'));
    }
  } else if (connector.kind === 'delegation') {
    if (!s.port || !t.port) {
      diagnostics.push(diag('INVALID_PART_END_CONNECTOR_KIND', connector.id, 'kind', 'A delegation connects ports; a part can only be an end of an assembly or binding connector'));
    } else if (!((s.isBoundary && t.depth === 1) || (t.isBoundary && s.depth === 1))) {
      diagnostics.push(diag('INVALID_DELEGATION_ENDPOINTS', connector.id, 'kind', 'Delegation requires one boundary port and one port directly on an internal part'));
    }
  }

  if (s.port && t.port && s.effectiveDirection && t.effectiveDirection) {
    const ok = connector.kind === 'delegation'
      ? delegationDirectionsCompatible(s.effectiveDirection, t.effectiveDirection)
      : directionsCompatible(s.effectiveDirection, t.effectiveDirection);
    if (!ok) {
      const message = `${s.effectiveDirection} cannot connect to ${t.effectiveDirection}`;
      diagnostics.push(diag('INCOMPATIBLE_DIRECTION', connector.id, 'targetPortId', message));
      diagnostics.push(diag('INCOMPATIBLE_PORT_DIRECTION', connector.id, 'targetPortId', message));
    }
    diagnostics.push(...validatePortDefinitionTyping(repo, connector.id, s.port, s.key, 'sourcePortId'));
    diagnostics.push(...validatePortDefinitionTyping(repo, connector.id, t.port, t.key, 'targetPortId'));
    if (s.port.typeId && t.port.typeId && s.port.typeId !== t.port.typeId) {
      diagnostics.push(diag('INCOMPATIBLE_INTERFACE', connector.id, 'targetPortId', `Port interfaces ${s.port.typeId} and ${t.port.typeId} differ`));
    }
  }

  const keys = [s.key, t.key].sort().join('|');
  const duplicate = Object.values(repo.connectors).find(other => {
    if (other.id === connector.id || other.ownerId !== connector.ownerId) return false;
    const a = connectorEndAsPath(repo, other, 'source');
    const b = connectorEndAsPath(repo, other, 'target');
    return Boolean(a && b) && [connectorEndKey(a!), connectorEndKey(b!)].sort().join('|') === keys;
  });
  if (duplicate) diagnostics.push(diag('DUPLICATE_CONNECTOR', connector.id, undefined, `Connector duplicates ${duplicate.id}`));
  return diagnostics;
}
