import type {
  BlockDefinition,
  ConnectorUsage,
  PartUsage,
  PortDefinition,
  PortUsage,
  SysmlRepository,
  SysmlUsage,
} from './model';
import type { SysmlDiagnostic } from './validation';
import { classifyRelationship as classifyRelationshipPolicy } from './policy';
import { isParametricBinding, validateParametricBinding } from './parametric';
import { effectiveSupertypeIds } from './services/supertypes';
import {
  findBlockPropertyWithOwner,
  isPartProperty,
  linkedPropertyIds,
  occurrenceAsPartUsage,
  occurrenceAt,
  resolveOccurrenceKey,
} from './partOccurrences';
import {
  connectorEndAsPath,
  connectorEndKey,
  connectorEndOf,
  connectorPathKey,
  delegationDirectionsCompatible,
  directionsCompatible,
  effectivePortDirection,
  findPortDefinition,
  isPathConnector,
  resolveConnectorEnd as resolvePathEnd,
  resolveConnectorPortEnd,
  validatePathConnector,
  validatePortDefinitionTyping,
} from './connectorEnds';

export { findPortDefinition } from './connectorEnds';

export { effectiveFlowDirection } from './services/portSemantics';
export { validatePort, PORT_DIAGNOSTICS } from './validation/portRules';
export type { PortKind } from './domain/ports';

export type IbdConnectorKind = ConnectorUsage['kind'];

export type IbdConnectorNotation = 'assembly-solid' | 'delegation-solid' | 'binding-dashed';

/**
 * Stable IBD-only connector notation lookup (OMG SysML 1.6, IBD connectors
 * only). Deliberately disjoint from the BDD relation notations in bdd.ts
 * (solid-line/filled-diamond/hollow-diamond/hollow-triangle/dashed-arrow);
 * VirtualizedDiagram diagramEdgeNotation dispatches per diagram kind so BDD
 * and IBD edge symbols can never leak across diagram kinds.
 */
export const IBD_CONNECTOR_NOTATIONS: Record<IbdConnectorKind, IbdConnectorNotation> = {
  assembly: 'assembly-solid',
  delegation: 'delegation-solid',
  binding: 'binding-dashed',
};

export function connectorNotationFor(kind: ConnectorUsage['kind']): IbdConnectorNotation {
  return IBD_CONNECTOR_NOTATIONS[kind];
}

export interface CreateIbdConnectorInput {
  sourceEnd?: ConnectorUsage['sourceEnd'];
  targetEnd?: ConnectorUsage['targetEnd'];
  id: string;
  kind: ConnectorUsage['kind'];
  ownerId: string;
  sourcePortId: string;
  targetPortId: string;
  itemFlowId?: string;
  sourceParameterId?: string;
  targetParameterId?: string;
  itemProperty?: string;
  itemUnit?: string;
}

export interface CreateIbdConnectorResult {
  connector?: ConnectorUsage;
  diagnostics: SysmlDiagnostic[];
}

export interface ResolvedPortUsage {
  usage: PortUsage;
  definition: PortDefinition;
  ownerTypeId: string;
  effectiveDirection: PortDefinition['direction'];
}

export interface IbdView {
  ownerId: string;
  parts: PartUsage[];
  ports: ResolvedPortUsage[];
  connectors: ConnectorUsage[];
  diagnostics: SysmlDiagnostic[];
}

export function resolvePortUsage(repo: SysmlRepository, portUsageId: string): ResolvedPortUsage | undefined {
  const usage = repo.usages[portUsageId];
  if (!usage || usage.kind !== 'port') return undefined;
  const owner = repo.usages[usage.ownerId];
  const ownerTypeId = owner?.kind === 'part' ? owner.typeId : usage.ownerId;
  const definition = findPortDefinition(repo, ownerTypeId, usage.definitionId);
  if (!definition) return undefined;
  return {
    usage,
    definition,
    ownerTypeId,
    effectiveDirection: effectivePortDirection(definition),
  };
}

export function validateConnector(repo: SysmlRepository, connectorId: string): SysmlDiagnostic[] {
  const connector = repo.connectors[connectorId];
  if (!connector) return [diag('CONNECTOR_NOT_FOUND', connectorId, undefined, `Connector ${connectorId} does not exist`)];
  return validateConnectorCandidate(repo, connector);
}

/**
 * Context-bound connector creation (OMG SysML 1.6). A connector is owned by
 * exactly one block context: assembly/binding endpoints must both be roles
 * in the owning context, delegation requires one boundary port plus one
 * internal role port. Cross-context edges without delegation are rejected
 * with INVALID_CONNECTOR_CONTEXT / INVALID_DELEGATION_ENDPOINTS and no
 * connector is returned.
 */
export function createIbdConnector(repo: SysmlRepository, input: CreateIbdConnectorInput): CreateIbdConnectorResult {
  const candidate: ConnectorUsage = {
    id: input.id,
    kind: input.kind,
    ownerId: input.ownerId,
    sourcePortId: input.sourcePortId,
    targetPortId: input.targetPortId,
    ...(input.sourceEnd ? { sourceEnd: input.sourceEnd } : {}),
    ...(input.targetEnd ? { targetEnd: input.targetEnd } : {}),
    itemFlowId: input.itemFlowId,
    sourceParameterId: input.sourceParameterId,
    targetParameterId: input.targetParameterId,
    itemProperty: input.itemProperty,
    itemUnit: input.itemUnit,
  };
  if (isParametricBinding(candidate)) {
    const problems = validateParametricBinding(repo, candidate);
    return problems.length > 0 ? { diagnostics: problems } : { connector: candidate, diagnostics: [] };
  }
  const blocking = validateConnectorCandidate(repo, candidate).filter(diagnostic =>
    diagnostic.code === 'MISSING_CONNECTOR_ENDPOINT'
    || diagnostic.code === 'INVALID_CONNECTOR_CONTEXT'
    || diagnostic.code === 'INVALID_DELEGATION_ENDPOINTS'
    || diagnostic.code === 'INVALID_PART_END_CONNECTOR_KIND'
    || diagnostic.code === 'INVALID_CONNECTOR_PATH'
    || diagnostic.code === 'ENDPOINT_OUTSIDE_IBD_CONTEXT'
    || diagnostic.code === 'DUPLICATE_CONNECTOR'
    || diagnostic.code === 'SELF_CONNECTOR',
  );
  if (blocking.length > 0) return { diagnostics: blocking };
  return { connector: candidate, diagnostics: [] };
}

function validateConnectorCandidate(repo: SysmlRepository, connector: ConnectorUsage): SysmlDiagnostic[] {
  // A parametric binding joins properties/parameters, not ports or parts.
  if (isParametricBinding(connector)) return uniqueDiagnostics(validateParametricBinding(repo, connector));
  // Path-based ends (nested connector ends) are validated on property paths; usage-id
  // ends keep the original validation below, unchanged.
  if (isPathConnector(connector)) {
    return uniqueDiagnostics([
      ...validatePathConnector(repo, connector),
      ...validateItemFlowCandidate(repo, connector),
      ...(connector.kind === 'binding' ? validateBindingConnectorCandidate(repo, connector) : []),
    ]);
  }
  const diagnostics: SysmlDiagnostic[] = [];
  // A connector end is a port of a part (or of the context) OR a part itself:
  // SysML 1.6 §8.3.2.2 lets a connector join part properties directly.
  const sourceEnd = resolveConnectorEnd(repo, connector.sourcePortId);
  const targetEnd = resolveConnectorEnd(repo, connector.targetPortId);
  if (!sourceEnd) diagnostics.push(diag('MISSING_CONNECTOR_ENDPOINT', connector.id, 'sourcePortId', `Source port ${connector.sourcePortId} cannot be resolved`));
  if (!targetEnd) diagnostics.push(diag('MISSING_CONNECTOR_ENDPOINT', connector.id, 'targetPortId', `Target port ${connector.targetPortId} cannot be resolved`));
  if (!sourceEnd || !targetEnd) return diagnostics;
  const source = sourceEnd.port;
  const target = targetEnd.port;
  const sourceUsageId = sourceEnd.port?.usage.id ?? sourceEnd.part!.id;
  const targetUsageId = targetEnd.port?.usage.id ?? targetEnd.part!.id;
  if (sourceUsageId === targetUsageId) diagnostics.push(diag('SELF_CONNECTOR', connector.id, 'targetPortId', 'A connector cannot connect a port to itself'));

  // The part that plays the role at each end: the owner of a port, or the part itself.
  const sourceOwnerId = source ? source.usage.ownerId : sourceEnd.part!.ownerId;
  const targetOwnerId = target ? target.usage.ownerId : targetEnd.part!.ownerId;
  const sourceBoundary = Boolean(source) && sourceOwnerId === connector.ownerId;
  const targetBoundary = Boolean(target) && targetOwnerId === connector.ownerId;
  const sourcePart = source
    ? directPartInContext(repo, sourceOwnerId, connector.ownerId)
    : (sourceOwnerId === connector.ownerId ? sourceEnd.part : undefined);
  const targetPart = target
    ? directPartInContext(repo, targetOwnerId, connector.ownerId)
    : (targetOwnerId === connector.ownerId ? targetEnd.part : undefined);

  if (!sourceBoundary && !sourcePart) {
    diagnostics.push(diag('ENDPOINT_OUTSIDE_IBD_CONTEXT', connector.id, 'sourcePortId', `Source port ${connector.sourcePortId} is outside the IBD context ${connector.ownerId}`));
  }
  if (!targetBoundary && !targetPart) {
    diagnostics.push(diag('ENDPOINT_OUTSIDE_IBD_CONTEXT', connector.id, 'targetPortId', `Target port ${connector.targetPortId} is outside the IBD context ${connector.ownerId}`));
  }

  if (connector.kind === 'assembly') {
    if (!sourcePart || !targetPart) diagnostics.push(diag('INVALID_CONNECTOR_CONTEXT', connector.id, 'ownerId', 'Assembly endpoints must be roles in the connector owning context'));
  } else if (connector.kind === 'delegation') {
    const sourceInternal = Boolean(sourcePart);
    const targetInternal = Boolean(targetPart);
    if (!source || !target) {
      diagnostics.push(diag('INVALID_PART_END_CONNECTOR_KIND', connector.id, 'kind', 'A delegation connects ports; a part can only be an end of an assembly or binding connector'));
    } else if (!((sourceBoundary && targetInternal) || (targetBoundary && sourceInternal))) {
      diagnostics.push(diag('INVALID_DELEGATION_ENDPOINTS', connector.id, 'kind', 'Delegation requires one boundary port and one internal role port'));
    }
  }

  // Direction, port typing and interface compatibility are properties of ports;
  // a connector end that is a part itself has none to compare.
  if (source && target) {
    // Assembly joins opposite directions (out→in). A delegation passes the same
    // direction through the boundary (boundary in → inner in), so it is the one
    // kind where equal directions are legal and opposite ones are not.
    const directionsOk = connector.kind === 'delegation'
      ? delegationDirectionsCompatible(source.effectiveDirection, target.effectiveDirection)
      : directionsCompatible(source.effectiveDirection, target.effectiveDirection);
    if (!directionsOk) {
      const message = `${source.effectiveDirection} cannot connect to ${target.effectiveDirection}`;
      diagnostics.push(diag('INCOMPATIBLE_DIRECTION', connector.id, 'targetPortId', message));
      diagnostics.push(diag('INCOMPATIBLE_PORT_DIRECTION', connector.id, 'targetPortId', message));
    }
    diagnostics.push(...validatePortTyping(repo, connector, source, 'sourcePortId'));
    diagnostics.push(...validatePortTyping(repo, connector, target, 'targetPortId'));
    if (source.definition.typeId && target.definition.typeId && source.definition.typeId !== target.definition.typeId) {
      diagnostics.push(diag('INCOMPATIBLE_INTERFACE', connector.id, 'targetPortId', `Port interfaces ${source.definition.typeId} and ${target.definition.typeId} differ`));
    }
  }
  const duplicate = Object.values(repo.connectors).find(other => other.id !== connector.id && other.ownerId === connector.ownerId && (
    (other.sourcePortId === connector.sourcePortId && other.targetPortId === connector.targetPortId) ||
    (other.sourcePortId === connector.targetPortId && other.targetPortId === connector.sourcePortId)
  ));
  if (duplicate) diagnostics.push(diag('DUPLICATE_CONNECTOR', connector.id, undefined, `Connector duplicates ${duplicate.id}`));
  diagnostics.push(...validateItemFlowCandidate(repo, connector));
  if (connector.kind === 'binding') {
    diagnostics.push(...validateBindingConnectorCandidate(repo, connector));
  }
  return uniqueDiagnostics(diagnostics);
}

export function validateBindingConnector(repo: SysmlRepository, connectorId: string): SysmlDiagnostic[] {
  const connector = repo.connectors[connectorId];
  if (!connector) return [diag('CONNECTOR_NOT_FOUND', connectorId, undefined, `Connector ${connectorId} does not exist`)];
  return validateBindingConnectorCandidate(repo, connector);
}

function validateBindingConnectorCandidate(repo: SysmlRepository, connector: ConnectorUsage): SysmlDiagnostic[] {
  if (connector.kind !== 'binding') return [];
  const diagnostics: SysmlDiagnostic[] = [];
  if (connector.sourceParameterId && connector.targetParameterId) {
    const pathBlockId = (side: 'source' | 'target'): string | undefined => {
      const end = connectorEndAsPath(repo, connector, side);
      return end ? resolvePathEnd(repo, connector.ownerId, end, side, connector.id).resolved?.part?.typeId : undefined;
    };
    const sourceOwner = repo.usages[connector.sourcePortId];
    const targetOwner = repo.usages[connector.targetPortId];
    const pathBased = isPathConnector(connector);
    const sourceBlockId = (pathBased ? pathBlockId('source') : undefined)
      ?? (sourceOwner?.kind === 'part' ? sourceOwner.typeId : connector.sourcePortId);
    const targetBlockId = (pathBased ? pathBlockId('target') : undefined)
      ?? (targetOwner?.kind === 'part' ? targetOwner.typeId : connector.targetPortId);

    const sourceDef = repo.definitions[sourceBlockId];
    const targetDef = repo.definitions[targetBlockId];

    if (sourceDef?.kind === 'block' && targetDef?.kind === 'block') {
      const sourceProp = sourceDef.properties.find(p => p.id === connector.sourceParameterId);
      const targetProp = targetDef.properties.find(p => p.id === connector.targetParameterId);

      if (sourceProp && targetProp && sourceProp.typeId !== targetProp.typeId) {
        diagnostics.push(diag(
          'INCOMPATIBLE_BINDING_TYPE',
          connector.id,
          'targetParameterId',
          `Binding connector cannot bind incompatible types ${sourceProp.typeId} and ${targetProp.typeId}`
        ));
      }
    }
  }

  return diagnostics;
}

export function formatItemFlowLabel(details: {
  conveyedName: string;
  itemProperty?: string;
  multiplicity?: string;
  unit?: string;
  direction?: 'in' | 'out' | 'inout';
}): string {
  const prop = details.itemProperty ? `${details.itemProperty}: ` : '';
  const mult = details.multiplicity ? ` [${details.multiplicity}]` : '';
  const unit = details.unit ? ` (${details.unit})` : '';
  const dir = details.direction === 'out' ? ' ➔' : details.direction === 'in' ? ' ⬅' : '';
  return `«itemFlow» ${prop}${details.conveyedName}${mult}${unit}${dir}`.trim();
}

export interface IbdBreadcrumbItem {
  id: string;
  name: string;
  kind: 'block' | 'part';
}

export function deriveIbdBreadcrumb(repo: SysmlRepository, contextId: string): IbdBreadcrumbItem[] {
  const result: IbdBreadcrumbItem[] = [];
  let currentId: string | undefined = contextId;
  const visited = new Set<string>();

  // Format 5: a context below the top is a property path, named by the properties it runs through.
  if (!repo.usages[contextId] && !repo.definitions[contextId]) {
    const occurrence = resolveOccurrenceKey(repo, contextId);
    if (occurrence) {
      const block = repo.definitions[occurrence.contextId];
      const items: IbdBreadcrumbItem[] = block ? [{ id: block.id, name: block.name, kind: 'block' }] : [];
      let typeId = occurrence.contextId;
      occurrence.path.forEach((segment, index) => {
        const found = findBlockPropertyWithOwner(repo, typeId, segment);
        if (!found) return;
        items.push({ id: occurrence.path.slice(0, index + 1).join('/'), name: found.feature.name, kind: 'part' });
        typeId = found.feature.typeId;
      });
      return items;
    }
  }

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const usage: SysmlUsage | undefined = repo.usages[currentId];
    if (usage && usage.kind === 'part') {
      result.unshift({ id: usage.id, name: usage.name, kind: 'part' });
      currentId = usage.ownerId;
      continue;
    }
    const def = repo.definitions[currentId];
    if (def && def.kind === 'block') {
      result.unshift({ id: def.id, name: def.name, kind: 'block' });
      break;
    }
    break;
  }
  return result;
}

export function validateItemFlow(repo: SysmlRepository, connectorId: string): SysmlDiagnostic[] {
  const connector = repo.connectors[connectorId];
  if (!connector) return [diag('CONNECTOR_NOT_FOUND', connectorId, undefined, `Connector ${connectorId} does not exist`)];
  return validateItemFlowCandidate(repo, connector);
}

function validateItemFlowCandidate(repo: SysmlRepository, connector: ConnectorUsage): SysmlDiagnostic[] {
  if (!connector?.itemFlowId) return [];
  const diagnostics: SysmlDiagnostic[] = [];
  const conveyed = repo.definitions[connector.itemFlowId];
  if (!conveyed || (conveyed.kind !== 'valueType' && conveyed.kind !== 'interface')) {
    diagnostics.push(diag('MISSING_ITEM_FLOW_TYPE', connector.id, 'itemFlowId', `Conveyed type ${connector.itemFlowId} does not exist`));
    return diagnostics;
  }
  const pathBased = isPathConnector(connector);
  const source = pathBased ? resolveConnectorPortEnd(repo, connector, 'source') : resolvePortUsage(repo, connector.sourcePortId);
  const target = pathBased ? resolveConnectorPortEnd(repo, connector, 'target') : resolvePortUsage(repo, connector.targetPortId);
  if (!source || !target) return diagnostics;
  const flowDirectionsOk = connector.kind === 'delegation'
    ? delegationDirectionsCompatible(source.effectiveDirection, target.effectiveDirection)
    : directionsCompatible(source.effectiveDirection, target.effectiveDirection);
  if (!flowDirectionsOk) {
    diagnostics.push(diag('INVALID_ITEM_FLOW_DIRECTION', connector.id, 'itemFlowId', 'Item flow contradicts effective port direction'));
    return diagnostics;
  }
  // Item-flow compatibility: a conveyed interface must match at least one
  // endpoint interface; valueType signals may flow over any interface.
  if (conveyed.kind === 'interface'
    && source.definition.typeId !== conveyed.id
    && target.definition.typeId !== conveyed.id) {
    diagnostics.push(diag('INCOMPATIBLE_INTERFACE', connector.id, 'itemFlowId', `Conveyed interface ${conveyed.id} matches neither endpoint interface ${source.definition.typeId} nor ${target.definition.typeId}`));
  }
  return diagnostics;
}

/**
 * Port typing for connector endpoints (OMG SysML 1.6): proxy ports must be
 * typed by an interface definition, full ports by a block, interface, or
 * valueType. References to missing definitions are surfaced explicitly as
 * UNRESOLVED_IMPORT so unresolved imports never validate silently.
 */
function validatePortTyping(
  repo: SysmlRepository,
  connector: ConnectorUsage,
  resolved: ResolvedPortUsage,
  propertyPath: 'sourcePortId' | 'targetPortId',
): SysmlDiagnostic[] {
  return validatePortDefinitionTyping(repo, connector.id, resolved.definition, resolved.usage.id, propertyPath);
}

export function deriveIbdView(repo: SysmlRepository, ownerId: string): IbdView {
  const partIds = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const usage of Object.values(repo.usages)) {
      if (usage.kind !== 'part') continue;
      if ((usage.ownerId === ownerId || partIds.has(usage.ownerId)) && !partIds.has(usage.id)) {
        partIds.add(usage.id);
        changed = true;
      }
    }
  }
  const parts = Object.values(repo.usages).filter((usage): usage is PartUsage => usage.kind === 'part' && partIds.has(usage.id)).sort(byId);
  const portOwnerIds = new Set([ownerId, ...partIds]);
  const ports = Object.values(repo.usages)
    .filter((usage): usage is PortUsage => usage.kind === 'port' && portOwnerIds.has(usage.ownerId))
    .map(usage => resolvePortUsage(repo, usage.id))
    .filter((port): port is ResolvedPortUsage => Boolean(port))
    .sort((a, b) => a.usage.id.localeCompare(b.usage.id));
  const connectors = Object.values(repo.connectors).filter(connector => connector.ownerId === ownerId).sort(byId);
  const diagnostics = connectors.flatMap(connector => validateConnector(repo, connector.id));
  // Format 5: parts are Block properties and ports are addressed by property paths.
  const derived = deriveOccurrenceView(repo, ownerId, connectors);
  return {
    ownerId,
    parts: [...parts, ...derived.parts].sort(byId),
    ports: [...ports, ...derived.ports].sort((a, b) => a.usage.id.localeCompare(b.usage.id)),
    connectors,
    diagnostics,
  };
}

/** Parts of `ownerId` that no PartUsage record represents (nested ones to a bounded depth), and the ports its path connectors use. */
function deriveOccurrenceView(
  repo: SysmlRepository,
  ownerId: string,
  connectors: ConnectorUsage[],
): { parts: PartUsage[]; ports: ResolvedPortUsage[] } {
  const owner = repo.definitions[ownerId];
  if (owner?.kind !== 'block') return { parts: [], ports: [] };
  const linked = linkedPropertyIds(repo);
  const parts: PartUsage[] = [];
  const visit = (pathSoFar: string[], typeId: string, trail: string[]) => {
    const block = repo.definitions[typeId];
    if (block?.kind !== 'block' || trail.includes(typeId) || pathSoFar.length >= MAX_DERIVED_DEPTH) return;
    const properties = [block, ...effectiveSupertypeIds(repo, typeId).map(id => repo.definitions[id])]
      .flatMap(definition => definition?.kind === 'block' ? definition.properties : []);
    for (const property of properties) {
      if (!isPartProperty(repo, property)) continue;
      // A part a PartUsage record still represents is listed from that record.
      if (pathSoFar.length === 0 && linked.has(property.id)) continue;
      const path = [...pathSoFar, property.id];
      const occurrence = occurrenceAt(repo, ownerId, path);
      if (!occurrence) continue;
      parts.push(occurrenceAsPartUsage(occurrence));
      visit(path, property.typeId, [...trail, typeId]);
    }
  };
  visit([], ownerId, []);

  const ports = new Map<string, ResolvedPortUsage>();
  for (const connector of connectors) {
    for (const side of ['source', 'target'] as const) {
      const end = connectorEndOf(connector, side);
      if (!end?.portId) continue;
      const resolved = resolvePathEnd(repo, ownerId, end, side, connector.id).resolved;
      if (!resolved?.port || !resolved.effectiveDirection) continue;
      const key = connectorEndKey(end);
      if (ports.has(key)) continue;
      ports.set(key, {
        usage: { id: key, kind: 'port', name: resolved.port.name, ownerId: end.path.length > 0 ? connectorPathKey(end.path) : ownerId, definitionId: resolved.port.id },
        definition: resolved.port,
        ownerTypeId: resolved.ownerTypeId,
        effectiveDirection: resolved.effectiveDirection,
      });
    }
  }
  return { parts, ports: [...ports.values()] };
}

const MAX_DERIVED_DEPTH = 4;

/**
 * IBD defers BDD-vs-IBD relationship legality to the central typed policy
 * (src/engine/sysml/policy.ts). Binding/itemFlow relationships must classify
 * to the `ibd` diagram; BDD kinds must not leak into IBD views.
 */
export function classifyIbdRelationship(repo: SysmlRepository, relationshipId: string): { diagram: string; allowed: boolean; diagnostics: string[] } {
  return classifyRelationshipPolicy(repo, relationshipId);
}

export function isIbdDiagramRelationship(repo: SysmlRepository, relationshipId: string): boolean {
  const decision = classifyRelationshipPolicy(repo, relationshipId);
  return decision.diagram === 'ibd' && decision.allowed;
}

/** A connector end is a port usage, or a part usage standing for the part itself. */
function resolveConnectorEnd(repo: SysmlRepository, id: string): { port?: ResolvedPortUsage; part?: PartUsage } | undefined {
  const port = resolvePortUsage(repo, id);
  if (port) return { port };
  const usage = repo.usages[id];
  return usage?.kind === 'part' ? { part: usage } : undefined;
}

function directPartInContext(repo: SysmlRepository, ownerId: string, contextId: string): PartUsage | undefined {
  const owner = repo.usages[ownerId];
  return owner?.kind === 'part' && owner.ownerId === contextId ? owner : undefined;
}

function byId<T extends { id: string }>(a: T, b: T): number { return a.id.localeCompare(b.id); }

function diag(code: string, elementId: string, propertyPath: string | undefined, message: string): SysmlDiagnostic {
  return { code, severity: 'error', elementId, propertyPath, message };
}

function uniqueDiagnostics(diagnostics: SysmlDiagnostic[]): SysmlDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter(diagnostic => {
    const key = `${diagnostic.code}:${diagnostic.elementId}:${diagnostic.propertyPath ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
