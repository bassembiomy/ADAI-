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
    effectiveDirection: definition.isConjugated ? conjugate(definition.direction) : definition.direction,
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
    itemFlowId: input.itemFlowId,
    sourceParameterId: input.sourceParameterId,
    targetParameterId: input.targetParameterId,
    itemProperty: input.itemProperty,
    itemUnit: input.itemUnit,
  };
  const blocking = validateConnectorCandidate(repo, candidate).filter(diagnostic =>
    diagnostic.code === 'MISSING_CONNECTOR_ENDPOINT'
    || diagnostic.code === 'INVALID_CONNECTOR_CONTEXT'
    || diagnostic.code === 'INVALID_DELEGATION_ENDPOINTS'
    || diagnostic.code === 'DUPLICATE_CONNECTOR'
    || diagnostic.code === 'SELF_CONNECTOR',
  );
  if (blocking.length > 0) return { diagnostics: blocking };
  return { connector: candidate, diagnostics: [] };
}

function validateConnectorCandidate(repo: SysmlRepository, connector: ConnectorUsage): SysmlDiagnostic[] {
  const diagnostics: SysmlDiagnostic[] = [];
  const source = resolvePortUsage(repo, connector.sourcePortId);
  const target = resolvePortUsage(repo, connector.targetPortId);
  if (!source) diagnostics.push(diag('MISSING_CONNECTOR_ENDPOINT', connector.id, 'sourcePortId', `Source port ${connector.sourcePortId} cannot be resolved`));
  if (!target) diagnostics.push(diag('MISSING_CONNECTOR_ENDPOINT', connector.id, 'targetPortId', `Target port ${connector.targetPortId} cannot be resolved`));
  if (!source || !target) return diagnostics;
  if (source.usage.id === target.usage.id) diagnostics.push(diag('SELF_CONNECTOR', connector.id, 'targetPortId', 'A connector cannot connect a port to itself'));

  if (connector.kind === 'assembly') {
    const sourcePart = directPartInContext(repo, source.usage.ownerId, connector.ownerId);
    const targetPart = directPartInContext(repo, target.usage.ownerId, connector.ownerId);
    if (!sourcePart || !targetPart) diagnostics.push(diag('INVALID_CONNECTOR_CONTEXT', connector.id, 'ownerId', 'Assembly endpoints must be roles in the connector owning context'));
  } else if (connector.kind === 'delegation') {
    const sourceBoundary = source.usage.ownerId === connector.ownerId;
    const targetBoundary = target.usage.ownerId === connector.ownerId;
    const sourceInternal = Boolean(directPartInContext(repo, source.usage.ownerId, connector.ownerId));
    const targetInternal = Boolean(directPartInContext(repo, target.usage.ownerId, connector.ownerId));
    if (!((sourceBoundary && targetInternal) || (targetBoundary && sourceInternal))) {
      diagnostics.push(diag('INVALID_DELEGATION_ENDPOINTS', connector.id, 'kind', 'Delegation requires one boundary port and one internal role port'));
    }
  }

  if (!directionsCompatible(source.effectiveDirection, target.effectiveDirection)) {
    const message = `${source.effectiveDirection} cannot connect to ${target.effectiveDirection}`;
    diagnostics.push(diag('INCOMPATIBLE_DIRECTION', connector.id, 'targetPortId', message));
    diagnostics.push(diag('INCOMPATIBLE_PORT_DIRECTION', connector.id, 'targetPortId', message));
  }
  diagnostics.push(...validatePortTyping(repo, connector, source, 'sourcePortId'));
  diagnostics.push(...validatePortTyping(repo, connector, target, 'targetPortId'));
  if (source.definition.typeId !== target.definition.typeId) {
    diagnostics.push(diag('INCOMPATIBLE_INTERFACE', connector.id, 'targetPortId', `Port interfaces ${source.definition.typeId} and ${target.definition.typeId} differ`));
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
    const sourceOwner = repo.usages[connector.sourcePortId];
    const targetOwner = repo.usages[connector.targetPortId];
    const sourceBlockId = sourceOwner?.kind === 'part' ? sourceOwner.typeId : connector.sourcePortId;
    const targetBlockId = targetOwner?.kind === 'part' ? targetOwner.typeId : connector.targetPortId;

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
  const source = resolvePortUsage(repo, connector.sourcePortId);
  const target = resolvePortUsage(repo, connector.targetPortId);
  if (!source || !target) return diagnostics;
  if (!directionsCompatible(source.effectiveDirection, target.effectiveDirection)) {
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
  const diagnostics: SysmlDiagnostic[] = [];
  const type = repo.definitions[resolved.definition.typeId];
  if (!type) {
    diagnostics.push(diag('UNRESOLVED_IMPORT', connector.id, propertyPath, `Port type ${resolved.definition.typeId} cannot be resolved`));
    return diagnostics;
  }
  // Widened so future definition kinds stay diagnosable instead of narrowing to never.
  const typeKind: string = type.kind;
  if (resolved.definition.kind === 'proxy' && typeKind !== 'interface') {
    diagnostics.push(diag('MISSING_PORT_TYPE', connector.id, propertyPath, `Proxy port ${resolved.usage.id} must be typed by an InterfaceDefinition, found ${typeKind} ${type.id}`));
  } else if (resolved.definition.kind === 'full' && typeKind !== 'block' && typeKind !== 'interface' && typeKind !== 'valueType') {
    diagnostics.push(diag('MISSING_PORT_TYPE', connector.id, propertyPath, `Full port ${resolved.usage.id} must resolve to a block, interface, or valueType, found ${typeKind} ${type.id}`));
  }
  return diagnostics;
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
  return { ownerId, parts, ports, connectors, diagnostics };
}

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

function findPortDefinition(repo: SysmlRepository, blockId: string, portId: string, visited = new Set<string>()): PortDefinition | undefined {
  if (visited.has(blockId)) return undefined;
  visited.add(blockId);
  const block = repo.definitions[blockId];
  if (!block || block.kind !== 'block') return undefined;
  const direct = block.ports.find(port => port.id === portId);
  if (direct) return direct;
  for (const supertypeId of block.supertypeIds ?? []) {
    const inherited = findPortDefinition(repo, supertypeId, portId, visited);
    if (inherited) return inherited;
  }
  return undefined;
}

function directPartInContext(repo: SysmlRepository, ownerId: string, contextId: string): PartUsage | undefined {
  const owner = repo.usages[ownerId];
  return owner?.kind === 'part' && owner.ownerId === contextId ? owner : undefined;
}

function conjugate(direction: PortDefinition['direction']): PortDefinition['direction'] {
  return direction === 'in' ? 'out' : direction === 'out' ? 'in' : 'inout';
}

function directionsCompatible(source: PortDefinition['direction'], target: PortDefinition['direction']): boolean {
  return source === 'inout' || target === 'inout' || source !== target;
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
