import type { ModelDiagramDefinition, SysmlRepository } from '../../engine/sysml/model';
import type { NormalizedSysmlStore } from '../../engine/sysml/normalizedStore';
import type { SemanticElement } from '../../engine/sysml/domain/base';
import type {
  SemanticRelationship,
  ConnectorEnd,
  ItemFlow,
} from '../../engine/sysml/domain/relationships';
import type { BehaviorElement } from '../../engine/sysml/domain/behaviors';
import { resolvePortUsage } from '../../engine/sysml/ibd';
import { lifelineBlock, messageLabel, orderedMessages } from '../../engine/sysml/interaction';
import type { DiagramPresentationInput } from '../../engine/sysml/presentationState';
import type { StateMachineExplorerSnapshot } from './adapters/stateMachineExplorerAdapter';
import { getElementKindLabel } from './modelExplorerCapabilities';
import { diagramMemberIds } from './diagramTreeContext';
import { friendlySysmlKind, hasSysmlReference, resolveSysmlReferenceLabel, sysmlObjectLabel } from '../sysml/sysmlDisplayLabel';
import type {
  ModelPillar,
  ModelTreeNode,
  ModelTreeProjection,
} from './modelExplorerTypes';

export function projectOwnedFeature(feature: SemanticElement, ownerId: string, repository: SysmlRepository): ModelTreeNode {
  const feat = feature as any;
  let secondaryLabel: string | undefined;
  if (feat.typeId) {
    secondaryLabel = `: ${resolveSysmlReferenceLabel(repository, feat.typeId, 'Type')}`;
    if (feat.direction) {
      secondaryLabel += ` · ${feat.direction}`;
    }
  } else if (feat.direction) {
    secondaryLabel = `· ${feat.direction}`;
  }
  return {
    nodeId: `sysml:element:${feature.id}`,
    semanticId: feature.id,
    domain: 'sysml',
    kind: feature.metaclass ?? 'feature',
    label: sysmlObjectLabel(feature, 'Feature'),
    secondaryLabel,
    badges: feat.typeId && !hasSysmlReference(repository, feat.typeId)
      ? [{ kind: 'warning', label: 'Unresolved type' }] : undefined,
    parentNodeId: `sysml:element:${ownerId}`,
    ownerSemanticId: ownerId,
    childNodeIds: [],
    hasChildren: false,
  };
}

export function projectRelationship(relationship: SemanticRelationship, repository: SysmlRepository): ModelTreeNode {
  const rel = relationship as any;
  const ownerId = rel.ownerId ?? 'model';
  const secondaryLabel = `${resolveSysmlReferenceLabel(repository, relationship.sourceId)} -> ${resolveSysmlReferenceLabel(repository, relationship.targetId)}`;
  return {
    nodeId: `sysml:element:${relationship.id}`,
    semanticId: relationship.id,
    domain: 'sysml',
    kind: relationship.metaclass ?? 'relationship',
    label: sysmlObjectLabel(relationship, 'Relationship'),
    secondaryLabel,
    badges: !hasSysmlReference(repository, relationship.sourceId) || !hasSysmlReference(repository, relationship.targetId)
      ? [{ kind: 'warning', label: 'Unresolved endpoint' }] : undefined,
    parentNodeId: ownerId && ownerId !== 'model' ? `sysml:element:${ownerId}` : 'project:pillar:structural',
    ownerSemanticId: ownerId,
    childNodeIds: [],
    hasChildren: false,
  };
}

export function projectConnectorEnd(end: ConnectorEnd, connectorId: string, repository: SysmlRepository): ModelTreeNode {
  const roleLabel = resolveSysmlReferenceLabel(repository, end.roleId);
  return {
    nodeId: `sysml:element:${end.id}`,
    semanticId: end.id,
    targetSemanticId: end.roleId,
    domain: 'sysml',
    kind: 'connectorEnd',
    label: roleLabel,
    secondaryLabel: `: ${roleLabel}`,
    badges: !hasSysmlReference(repository, end.roleId)
      ? [{ kind: 'warning', label: 'Unresolved role' }] : undefined,
    parentNodeId: `sysml:element:${connectorId}`,
    ownerSemanticId: connectorId,
    childNodeIds: [],
    hasChildren: false,
  };
}

export function projectItemFlow(flow: ItemFlow, repository: SysmlRepository): ModelTreeNode {
  const secondaryLabel = `${resolveSysmlReferenceLabel(repository, flow.sourceId)} -> ${resolveSysmlReferenceLabel(repository, flow.targetId)}${
    flow.conveyedClassifierIds?.length ? ` : ${flow.conveyedClassifierIds.map(id => resolveSysmlReferenceLabel(repository, id, 'Type')).join(', ')}` : ''
  }`;
  const badges: NonNullable<ModelTreeNode['badges']> = [];
  if (!hasSysmlReference(repository, flow.sourceId) || !hasSysmlReference(repository, flow.targetId)) {
    badges.push({ kind: 'warning', label: 'Unresolved endpoint' });
  }
  if (flow.conveyedClassifierIds?.some(id => !hasSysmlReference(repository, id))) {
    badges.push({ kind: 'warning', label: 'Unresolved conveyed type' });
  }
  return {
    nodeId: `sysml:element:${flow.id}`,
    semanticId: flow.id,
    domain: 'sysml',
    kind: 'ItemFlow',
    label: sysmlObjectLabel(flow, 'ItemFlow'),
    secondaryLabel,
    badges: badges.length ? badges : undefined,
    parentNodeId: `sysml:element:${flow.realizingRelationshipId}`,
    ownerSemanticId: flow.realizingRelationshipId,
    childNodeIds: [],
    hasChildren: false,
  };
}

export function projectBehaviorElement(element: BehaviorElement): ModelTreeNode {
  const el = element as any;
  const ownerId = el.ownerId ?? 'model';
  return {
    nodeId: `sysml:element:${element.id}`,
    semanticId: element.id,
    domain: 'sysml',
    kind: element.metaclass ?? 'behavior',
    label: sysmlObjectLabel(element, 'Behavior'),
    secondaryLabel: el.metaclass ? `[${friendlySysmlKind(el.metaclass)}]` : undefined,
    parentNodeId: ownerId && ownerId !== 'model' ? `sysml:element:${ownerId}` : 'project:pillar:behavior',
    ownerSemanticId: ownerId,
    childNodeIds: [],
    hasChildren: false,
  };
}

export interface ExternalModelDescriptor {
  id: string;
  name: string;
  domain: 'xbridges' | 'vlab';
  ownerStateId?: string | null;
  diagramId: string;
}

export interface UnifiedExplorerInput {
  sysml: SysmlRepository;
  sysmlStore?: NormalizedSysmlStore;
  stateMachine: StateMachineExplorerSnapshot;
  externalModels: ExternalModelDescriptor[];
  revision: number;
  /**
   * Presentation membership per diagram. It groups what the tree shows under
   * the diagram that presents it; it never changes semantic ownership.
   */
  diagramPresentations?: Record<string, DiagramPresentationInput>;
  /**
   * Optional set of expanded node IDs. When supplied, projection bounds
   * node allocation to visible/expanded branches.
   */
  expandedNodeIds?: ReadonlySet<string>;
}


const pillarOrder: Array<[ModelPillar, string]> = [
  ['structural', 'Structural'],
  ['behavior', 'Behavior'],
  ['parametric', 'Parametric'],
  ['requirements', 'Requirements'],
];

const pillarForSysmlKind = (kind: string): ModelPillar => {
  if (kind === 'requirement' || kind === 'verificationCase') return 'requirements';
  if (kind === 'activity' || kind === 'interaction' || kind === 'useCase') return 'behavior';
  return 'structural';
};

/**
 * Diagrams are viewpoints (SysML 1.6 Annex A diagram taxonomy): a parametric
 * diagram belongs under the Parametric pillar, requirements and traceability
 * views under Requirements, the behavior diagrams (activity, sequence, use case)
 * under Behavior, everything else (BDD, IBD, Package) under Structural.
 */
const pillarForDiagramKind = (diagramKind: string): ModelPillar => {
  if (diagramKind === 'requirements' || diagramKind === 'rtm') return 'requirements';
  if (diagramKind === 'parametric') return 'parametric';
  if (diagramKind === 'activity' || diagramKind === 'sequence' || diagramKind === 'useCase' || diagramKind === 'usecase') return 'behavior';
  return 'structural';
};

/**
 * A top-level package sits under the pillar of what it directly holds (a package of
 * requirements and requirements diagrams under Requirements, of activities and
 * interactions under Behavior); a mixed or empty package stays under Structural.
 * The pillars only arrange the navigation: no element changes owner.
 */
const pillarForPackageContent = (childPillars: Iterable<ModelPillar>): ModelPillar => {
  let found: ModelPillar | undefined;
  for (const pillar of childPillars) {
    if (found && found !== pillar) return 'structural';
    found = pillar;
  }
  return found ?? 'structural';
};

/**
 * An expanded diagram row lists what the diagram presents as reference rows. The diagram owns none of them
 * (each element keeps its row under its owner); a reference row selects and opens the element on that diagram.
 */
const registerDiagramMembers = (
  nodes: Record<string, ModelTreeNode>,
  input: UnifiedExplorerInput,
  diagramId: string,
  expanded: ReadonlySet<string> | undefined,
) => {
  const diagramNodeId = `sysml:element:${diagramId}`;
  if (!expanded?.has(diagramNodeId)) return;
  const sysml = input.sysml;
  for (const id of diagramMemberIds(diagramId, sysml, input.diagramPresentations)) {
    const element = (sysml.definitions[id] ?? sysml.requirements[id] ?? sysml.verificationCases?.[id] ?? sysml.actors?.[id]
      ?? sysml.useCases?.[id] ?? sysml.subjects?.[id] ?? sysml.packages[id]) as { kind: string; ownerId?: string; name?: string };
    register(nodes, {
      nodeId: `sysml:ref:${diagramId}:${id}`,
      semanticId: id,
      domain: 'sysml',
      kind: element.kind,
      label: sysmlObjectLabel(element as never, 'Element'),
      parentNodeId: diagramNodeId,
      ownerSemanticId: element.ownerId || 'model',
      childNodeIds: [],
      hasChildren: false,
      readOnly: true,
      presentedOnDiagramId: diagramId,
    });
  }
};
const diagramHasMembers = (input: UnifiedExplorerInput, diagramId: string) =>
  diagramMemberIds(diagramId, input.sysml, input.diagramPresentations).length > 0;

const register = (nodes: Record<string, ModelTreeNode>, node: ModelTreeNode) => {
  nodes[node.nodeId] = node;
};

const rebuildChildren = (nodes: Record<string, ModelTreeNode>, ownersWithChildren?: Set<string>) => {
  for (const nodeId in nodes) {
    const node = nodes[nodeId];
    node.childNodeIds = [];
    node.hasChildren = ownersWithChildren
      ? (ownersWithChildren.has(node.semanticId) || ownersWithChildren.has(node.nodeId))
      : false;
  }
  for (const nodeId in nodes) {
    const node = nodes[nodeId];
    if (!node.parentNodeId) continue;
    const parent = nodes[node.parentNodeId];
    if (!parent) continue;
    parent.childNodeIds.push(node.nodeId);
    parent.hasChildren = true;
  }
};

const requirementContainmentParents = (sysml: SysmlRepository) => {
  const parents = new Map<string, string>();
  for (const relationship of Object.values(sysml.relationships)) {
    if (relationship.kind !== 'requirementContainment') continue;
    if (!sysml.requirements[relationship.sourceId] || !sysml.requirements[relationship.targetId]) continue;
    if (parents.has(relationship.targetId)) continue;
    let ancestor: string | undefined = relationship.sourceId;
    const seen = new Set<string>();
    let createsCycle = false;
    while (ancestor && !seen.has(ancestor)) {
      if (ancestor === relationship.targetId) {
        createsCycle = true;
        break;
      }
      seen.add(ancestor);
      ancestor = parents.get(ancestor);
    }
    if (!createsCycle) parents.set(relationship.targetId, relationship.sourceId);
  }
  return parents;
};

function registerExternalModels(nodes: Record<string, ModelTreeNode>, input: UnifiedExplorerInput): void {
  for (const [domain, label] of [['xbridges', 'X-Bridges'], ['vlab', 'V-Lab']] as const) {
    const nodeId = `project:folder:${domain}`;
    register(nodes, {
      nodeId,
      semanticId: nodeId,
      domain: 'project',
      kind: 'folder',
      virtualKind: 'group',
      label,
      parentNodeId: 'project:pillar:parametric',
      ownerSemanticId: null,
      childNodeIds: [],
      hasChildren: false,
      readOnly: true,
    });
  }
  for (const external of input.externalModels) {
    const nodeId = `${external.domain}:model:${external.id}`;
    const stateParent = external.ownerStateId && nodes[`sm:state:${external.ownerStateId}`];
    const parentId = stateParent ? stateParent.nodeId : `project:folder:${external.domain}`;
    register(nodes, {
      nodeId,
      semanticId: external.id,
      domain: external.domain,
      kind: `${external.domain}Model`,
      label: external.name,
      secondaryLabel: external.domain === 'xbridges' ? '[X-Bridges Model]' : '[V-Lab Model]',
      parentNodeId: parentId,
      ownerSemanticId: external.ownerStateId ?? null,
      diagramId: external.diagramId,
      childNodeIds: [],
      hasChildren: false,
    });
  }

}

/** Interaction content (lifelines, messages, fragments, ...) nests under its Interaction, read-only in the tree. */
const isUnownedRelationship = (rel: any): boolean => Boolean(rel) && (!rel.ownerId || rel.ownerId === 'model');

function registerInteractionContent(
  nodes: Record<string, ModelTreeNode>,
  input: UnifiedExplorerInput,
  def: any,
  defNodeId: string,
): void {
  const sysmlNodeId = (id: string) => `sysml:element:${id}`;
  const group = (key: string, label: string) => {
    const nodeId = `sysml:group:${def.id}:${key}`;
    register(nodes, { nodeId, semanticId: def.id, domain: 'sysml', kind: 'group', label, parentNodeId: defNodeId, childNodeIds: [], hasChildren: true });
    return nodeId;
  };
  const leaf = (parent: string, id: string, kind: string, label: string, secondaryLabel?: string) => {
    if (nodes[sysmlNodeId(id)]) return;
    register(nodes, {
      nodeId: sysmlNodeId(id), semanticId: id, domain: 'sysml', kind, label, secondaryLabel,
      parentNodeId: parent, childNodeIds: [], hasChildren: false, readOnly: true, ownerSemanticId: def.id,
    });
  };
  const lifelines = def.lifelines ?? [];
  if (lifelines.length > 0) {
    const parent = group('lifelines', 'Lifelines');
    for (const lifeline of lifelines) {
      const block = lifelineBlock(input.sysml, lifeline);
      leaf(parent, lifeline.id, 'lifeline', lifeline.name?.trim() || (block ? sysmlObjectLabel(block, 'Block') : 'Lifeline'),
        block && lifeline.name?.trim() ? `: ${sysmlObjectLabel(block, 'Block')}` : undefined);
    }
  }
  const messages = orderedMessages(def);
  if (messages.length > 0) {
    const parent = group('messages', 'Messages');
    messages.forEach((message, index) => leaf(parent, message.id, 'message', `${index + 1}: ${messageLabel(message)}`));
  }
  const fragments = def.fragments ?? [];
  if (fragments.length > 0) {
    const parent = group('fragments', 'Fragments');
    for (const fragment of fragments) {
      const guard = fragment.operands[0]?.guard?.trim();
      leaf(parent, fragment.id, 'fragment', guard ? `${fragment.operator} [${guard}]` : fragment.operator);
    }
  }
  const uses = def.uses ?? [];
  if (uses.length > 0) {
    const parent = group('uses', 'Ref frames');
    for (const use of uses) leaf(parent, use.id, 'interactionUse', `ref ${sysmlObjectLabel(input.sysml.definitions[use.refersToId], 'Interaction')}`);
  }
  const constraints = def.constraints ?? [];
  if (constraints.length > 0) {
    const parent = group('constraints', 'Constraints');
    for (const constraint of constraints) {
      leaf(parent, constraint.id, 'interactionConstraint', constraint.kind === 'duration' ? 'Duration constraint' : 'Time constraint', constraint.expression.trim() ? `{${constraint.expression.trim()}}` : undefined);
    }
  }
  const invariants = def.stateInvariants ?? [];
  if (invariants.length > 0) {
    const parent = group('invariants', 'State invariants');
    for (const invariant of invariants) {
      const lifeline = lifelines.find((candidate: any) => candidate.id === invariant.lifelineId);
      leaf(parent, invariant.id, 'stateInvariant', 'State invariant', lifeline ? `on ${lifeline.name?.trim() || 'lifeline'}` : undefined);
    }
  }
}

/** Unowned relationships whose source has no store entity; cached per store revision so a large model is scanned once. */
const sourcelessRelationshipCache = new WeakMap<object, { revision: number; relationships: any[] }>();
function sourcelessUnownedRelationships(input: UnifiedExplorerInput, store: NormalizedSysmlStore): any[] {
  const cached = sourcelessRelationshipCache.get(store);
  if (cached && cached.revision === store.revision) return cached.relationships;
  const relationships: any[] = [];
  for (const [sourceId, relIds] of store.indexes.sourceId) {
    if (store.entities.has(sourceId)) continue;
    for (const relId of relIds) {
      const rel = input.sysml.relationships[relId];
      if (isUnownedRelationship(rel)) relationships.push(rel);
    }
  }
  sourcelessRelationshipCache.set(store, { revision: store.revision, relationships });
  return relationships;
}

function buildLazyStoreProjection(
  input: UnifiedExplorerInput,
  store: NormalizedSysmlStore,
  expanded: ReadonlySet<string>,
): ModelTreeProjection {
  const nodes: Record<string, ModelTreeNode> = {};
  const modelId = 'project:model';
  register(nodes, {
    nodeId: modelId,
    semanticId: 'model',
    domain: 'project',
    kind: 'model',
    virtualKind: 'model',
    label: store.packages.get('model')?.name?.trim() || input.sysml.packages?.model?.name?.trim() || 'Model',
    parentNodeId: null,
    ownerSemanticId: null,
    childNodeIds: [],
    hasChildren: true,
    readOnly: true,
  });

  for (const [pillar, label] of pillarOrder) {
    register(nodes, {
      nodeId: `project:pillar:${pillar}`,
      semanticId: `project:pillar:${pillar}`,
      domain: 'project',
      kind: 'pillar',
      virtualKind: pillar,
      label,
      parentNodeId: modelId,
      ownerSemanticId: 'model',
      childNodeIds: [],
      hasChildren: true,
      readOnly: true,
    });
  }

  const sysmlNodeId = (id: string) => `sysml:element:${id}`;

  const hasChildrenCheck = (id: string, entity?: any): boolean => {
    if ((store.indexes.ownerId.get(id)?.size ?? 0) > 0) return true;
    // relationships no element owns are listed under their source (client) element
    for (const relId of store.indexes.sourceId.get(id) ?? []) {
      if (isUnownedRelationship(input.sysml.relationships[relId])) return true;
    }
    if (entity) {
      if (entity.kind === 'block') {
        if ((entity.properties?.length ?? 0) > 0 || (entity.ports?.length ?? 0) > 0 || (entity.operations?.length ?? 0) > 0) {
          return true;
        }
      }
      if (entity.kind === 'useCase' && (store.indexes.useCaseId?.get(id)?.size ?? 0) > 0) {
        return true;
      }
      if (entity.kind === 'interaction') {
        if ((entity.lifelines?.length ?? 0) > 0 || (entity.messages?.length ?? 0) > 0
          || (entity.fragments?.length ?? 0) > 0 || (entity.uses?.length ?? 0) > 0
          || (entity.constraints?.length ?? 0) > 0 || (entity.stateInvariants?.length ?? 0) > 0) return true;
      }
    }
    return false;
  };

  const projectSysmlEntity = (id: string, entity: any, parentNodeId: string) => {
    const kind = 'kind' in entity ? entity.kind : (entity.metaclass ?? 'element');
    let secondaryLabel: string | undefined;
    let badges: any = undefined;

    if (kind === 'port') {
      const resolvedPort = resolvePortUsage(input.sysml, id);
      if (resolvedPort) {
        const typeName = resolveSysmlReferenceLabel(input.sysml, resolvedPort.definition.typeId, 'Type');
        secondaryLabel = `: ${typeName} · ${resolvedPort.effectiveDirection}`;
        if (!hasSysmlReference(input.sysml, resolvedPort.definition.typeId)) {
          badges = [{ kind: 'warning', label: 'Unresolved type' }];
        }
      } else {
        secondaryLabel = '[unresolved port definition]';
      }
    }

    register(nodes, {
      nodeId: sysmlNodeId(id),
      semanticId: id,
      domain: 'sysml',
      kind,
      label: sysmlObjectLabel(entity, 'Element'),
      secondaryLabel,
      badges,
      parentNodeId,
      ownerSemanticId: entity.ownerId || 'model',
      childNodeIds: [],
      hasChildren: hasChildrenCheck(id, entity),
    });
  };

  const diagramsByOwner = new Map<string, Array<[string, ModelDiagramDefinition]>>();
  for (const [dId, diag] of store.diagrams.entries()) {
    const owner = diag.ownerId || 'model';
    const owned = diagramsByOwner.get(owner);
    if (owned) owned.push([dId, diag]); else diagramsByOwner.set(owner, [[dId, diag]]);
  }
  const packagePillar = (pkgId: string): ModelPillar => pillarForPackageContent([
    ...[...(store.indexes.ownerId.get(pkgId) ?? [])].filter(id => !store.diagrams.has(id)).map(id => {
      const child = store.entities.get(id) as any;
      return pillarForSysmlKind(child?.kind ?? child?.metaclass ?? 'element');
    }),
    ...(diagramsByOwner.get(pkgId) ?? []).map(([, diag]) => pillarForDiagramKind(diag.diagramKind)),
  ]);

  // 1. Check pillars in expanded
  const topLevelChildren = store.indexes.ownerId.get('model');
  if (topLevelChildren && topLevelChildren.size > 0) {
    for (const id of topLevelChildren) {
      const entity = store.entities.get(id);
      if (!entity) continue;
      const kind = 'kind' in entity ? entity.kind : (entity as any).metaclass ?? 'element';
      const pillar = kind === 'package' ? packagePillar(id) : pillarForSysmlKind(kind);
      const pillarNodeId = `project:pillar:${pillar}`;
      if (expanded.has(pillarNodeId)) {
        projectSysmlEntity(id, entity, pillarNodeId);
      }
    }
  }

  // Also packages with ownerId 'model' or no ownerId that are not model itself
  for (const [pkgId, pkg] of store.packages.entries()) {
    if (pkgId === 'model') continue;
    if (!pkg.ownerId || pkg.ownerId === 'model') {
      const pillarNodeId = `project:pillar:${packagePillar(pkgId)}`;
      if (expanded.has(pillarNodeId) && !nodes[sysmlNodeId(pkgId)]) {
        projectSysmlEntity(pkgId, pkg, pillarNodeId);
      }
    }
  }

  // Also check top-level diagrams
  for (const [dId, diag] of store.diagrams.entries()) {
    if (!diag.ownerId || diag.ownerId === 'model') {
      const pillar = pillarForDiagramKind(diag.diagramKind);
      const pillarNodeId = `project:pillar:${pillar}`;
      if (expanded.has(pillarNodeId)) {
        register(nodes, {
          nodeId: sysmlNodeId(dId),
          semanticId: dId,
          domain: 'sysml',
          kind: 'diagram',
          label: sysmlObjectLabel(diag, 'Diagram'),
          secondaryLabel: `[${diag.diagramKind.toUpperCase()}]`,
          diagramId: dId,
          parentNodeId: pillarNodeId,
          ownerSemanticId: 'model',
          childNodeIds: [],
          hasChildren: diagramHasMembers(input, dId),
        });
        registerDiagramMembers(nodes, input, dId, expanded);
      }
    }
  }

  // Unowned relationships whose source has no tree node of its own (an allocation from an activity node, ...)
  // would be unreachable; they are listed under the Structural pillar as the full projection does.
  if (expanded.has('project:pillar:structural')) {
    for (const rel of sourcelessUnownedRelationships(input, store)) {
      if (!nodes[sysmlNodeId(rel.id)]) register(nodes, projectRelationship(rel as any, input.sysml));
    }
  }

  // 2. Iterate expandedNodeIds
  for (const expandedNodeId of expanded) {
    if (expandedNodeId.startsWith('sysml:element:')) {
      const semanticId = expandedNodeId.slice('sysml:element:'.length);
      const childIds = store.indexes.ownerId.get(semanticId);
      if (childIds) {
        for (const childId of childIds) {
          const child = store.entities.get(childId);
          if (child && !nodes[sysmlNodeId(childId)]) {
            projectSysmlEntity(childId, child, expandedNodeId);
          }
        }
      }

      // If semanticId is a block, project its owned features
      const blockDef = store.definitions.get(semanticId);
      if (blockDef && blockDef.kind === 'block') {
        for (const port of blockDef.ports ?? []) {
          const portNodeId = sysmlNodeId(port.id);
          if (!nodes[portNodeId]) {
            const portKind = port.kind === 'standard' ? 'port' : `${port.kind}Port`;
            register(nodes, projectOwnedFeature({
              id: port.id, name: port.name, metaclass: portKind as any,
              namespace: [], ownerId: blockDef.id, typeId: port.typeId, direction: port.direction,
            } as any, blockDef.id, input.sysml));
          }
        }
        for (const prop of blockDef.properties ?? []) {
          const propNodeId = sysmlNodeId(prop.id);
          if (!nodes[propNodeId]) {
            const featMeta = prop.kind === 'part' ? 'PartProperty' : prop.kind === 'reference' ? 'ReferenceProperty' : prop.kind === 'flow' ? 'FlowProperty' : 'ValueProperty';
            register(nodes, projectOwnedFeature({
              id: prop.id, name: prop.name, metaclass: featMeta as any,
              namespace: [], ownerId: blockDef.id, typeId: prop.typeId,
            } as any, blockDef.id, input.sysml));
          }
        }
        for (const op of blockDef.operations ?? []) {
          const opId = typeof op === 'string' ? op : (op as any).id;
          const opName = typeof op === 'string' ? op : (op as any).name;
          const opNodeId = sysmlNodeId(opId);
          if (!nodes[opNodeId]) {
            register(nodes, projectOwnedFeature({
              id: opId, name: opName, metaclass: 'Operation' as any,
              namespace: [], ownerId: blockDef.id,
            } as any, blockDef.id, input.sysml));
          }
        }
      }

      // Extension points for use cases
      if (store.extensionPoints.size > 0) {
        for (const extPoint of store.extensionPoints.values()) {
          if (extPoint.useCaseId === semanticId && !nodes[sysmlNodeId(extPoint.id)]) {
            register(nodes, {
              nodeId: sysmlNodeId(extPoint.id),
              semanticId: extPoint.id,
              domain: 'sysml',
              kind: extPoint.kind,
              label: sysmlObjectLabel(extPoint, 'Extension Point'),
              secondaryLabel: extPoint.location ? `@ ${extPoint.location}` : undefined,
              parentNodeId: expandedNodeId,
              ownerSemanticId: semanticId,
              childNodeIds: [],
              hasChildren: false,
            });
          }
        }
      }

      const interaction = input.sysml.definitions[semanticId];
      if (interaction?.kind === 'interaction' && nodes[expandedNodeId]) {
        registerInteractionContent(nodes, input, interaction, expandedNodeId);
      }

      // Relationships no element owns are listed under their source (client) element
      for (const relId of store.indexes.sourceId.get(semanticId) ?? []) {
        const rel = input.sysml.relationships[relId];
        if (isUnownedRelationship(rel) && !nodes[sysmlNodeId(relId)]) {
          register(nodes, { ...projectRelationship(rel as any, input.sysml), parentNodeId: expandedNodeId });
        }
      }

      // Diagrams owned by semanticId
      for (const [dId, diag] of diagramsByOwner.get(semanticId) ?? []) {
        if (!nodes[sysmlNodeId(dId)]) {
          register(nodes, {
            nodeId: sysmlNodeId(dId),
            semanticId: dId,
            domain: 'sysml',
            kind: 'diagram',
            label: sysmlObjectLabel(diag, 'Diagram'),
            secondaryLabel: `[${diag.diagramKind.toUpperCase()}]`,
            diagramId: dId,
            parentNodeId: expandedNodeId,
            ownerSemanticId: semanticId,
            childNodeIds: [],
            hasChildren: diagramHasMembers(input, dId),
          });
        }
        nodes[sysmlNodeId(dId)].hasChildren = diagramHasMembers(input, dId);
        registerDiagramMembers(nodes, input, dId, expanded);
      }
    }
  }

  // 3. State machine handling
  const rootLayer = input.stateMachine.layers.find(layer => layer.id === 'root') ?? input.stateMachine.layers[0];
  const behaviorId = 'project:pillar:behavior';
  const machineId = 'sm:machine:main';
  if (rootLayer) {
    if (expanded.has(behaviorId)) {
      register(nodes, {
        nodeId: machineId,
        semanticId: machineId,
        domain: 'stateMachine',
        kind: 'stateMachine',
        label: 'State Machine',
        parentNodeId: behaviorId,
        ownerSemanticId: null,
        childNodeIds: [],
        hasChildren: true,
      });
    }

    if (expanded.has(machineId)) {
      const statesById = new Map(input.stateMachine.states.map(state => [state.id, state]));
      const junctionsById = new Map((input.stateMachine.junctions ?? []).map(junction => [junction.id, junction]));
      const projectLayer = (layerId: string, parentId: string) => {
        const layer = input.stateMachine.layers.find(item => item.id === layerId);
        if (!layer) return;
        const regionId = `sm:region:${layer.id}`;
        register(nodes, {
          nodeId: regionId,
          semanticId: layer.id,
          domain: 'stateMachine',
          kind: 'region',
          label: layer.name || 'Root Region',
          parentNodeId: parentId,
          childNodeIds: [],
          hasChildren: (layer.stateIds?.length ?? 0) > 0 || (layer.junctionIds?.length ?? 0) > 0,
        });

        if (expanded.has(regionId)) {
          for (const junctionId of layer.junctionIds ?? []) {
            const junction = junctionsById.get(junctionId);
            if (!junction) continue;
            register(nodes, {
              nodeId: `sm:junction:${junction.id}`,
              semanticId: junction.id,
              domain: 'stateMachine',
              kind: junction.type ?? 'junction',
              label: junction.name || getElementKindLabel(junction.type ?? 'junction'),
              parentNodeId: regionId,
              ownerSemanticId: layer.id,
              childNodeIds: [],
              hasChildren: false,
            });
          }
          for (const stateId of layer.stateIds ?? []) {
            const state = statesById.get(stateId);
            if (!state) continue;
            const stateNodeId = `sm:state:${state.id}`;
            const childLayers = input.stateMachine.layers.filter(child => child.parentStateId === state.id);
            register(nodes, {
              nodeId: stateNodeId,
              semanticId: state.id,
              domain: 'stateMachine',
              kind: 'state',
              label: state.name,
              parentNodeId: regionId,
              ownerSemanticId: layer.id,
              childNodeIds: [],
              hasChildren: childLayers.length > 0,
            });
            if (expanded.has(stateNodeId)) {
              childLayers.forEach(child => projectLayer(child.id, stateNodeId));
            }
          }
        }
      };
      projectLayer(rootLayer.id, machineId);
    }
  }

  registerExternalModels(nodes, input);

  // 5. Rebuild children without wiping hasChildren on collapsed nodes
  for (const nodeId in nodes) {
    nodes[nodeId].childNodeIds = [];
  }
  for (const nodeId in nodes) {
    const node = nodes[nodeId];
    if (node.parentNodeId && nodes[node.parentNodeId]) {
      nodes[node.parentNodeId].childNodeIds.push(node.nodeId);
      nodes[node.parentNodeId].hasChildren = true;
    }
  }

  return { roots: [modelId], nodes, revision: input.revision };
}

export function buildUnifiedModelProjection(input: UnifiedExplorerInput): ModelTreeProjection {
  if (input.sysmlStore && input.expandedNodeIds) {
    return buildLazyStoreProjection(input, input.sysmlStore, input.expandedNodeIds);
  }
  const nodes: Record<string, ModelTreeNode> = {};
  const modelId = 'project:model';
  register(nodes, {
    nodeId: modelId,
    semanticId: 'model',
    domain: 'project',
    kind: 'model',
    virtualKind: 'model',
    label: input.sysml.packages.model?.name?.trim() || 'Model',
    parentNodeId: null,
    ownerSemanticId: null,
    childNodeIds: [],
    hasChildren: false,
    readOnly: true,
  });
  for (const [pillar, label] of pillarOrder) {
    register(nodes, {
      nodeId: `project:pillar:${pillar}`,
      semanticId: `project:pillar:${pillar}`,
      domain: 'project',
      kind: 'pillar',
      virtualKind: pillar,
      label,
      parentNodeId: modelId,
      ownerSemanticId: 'model',
      childNodeIds: [],
      hasChildren: false,
      readOnly: true,
    });
  }

  const sysmlNodeId = (id: string) => `sysml:element:${id}`;
  const requirementParents = requirementContainmentParents(input.sysml);

  const ownersWithChildren = new Set<string>();
  for (const p of Object.values(input.sysml.packages)) {
    if (p.ownerId && p.ownerId !== 'model') ownersWithChildren.add(p.ownerId);
  }
  for (const d of Object.values(input.sysml.definitions)) {
    if (d.ownerId && d.ownerId !== 'model') ownersWithChildren.add(d.ownerId);
    if (d.kind === 'block') {
      if ((d.properties?.length ?? 0) > 0 || (d.ports?.length ?? 0) > 0 || (d.operations?.length ?? 0) > 0) {
        ownersWithChildren.add(d.id);
      }
    }
  }
  for (const u of Object.values(input.sysml.usages)) {
    if (u.ownerId && u.ownerId !== 'model') ownersWithChildren.add(u.ownerId);
  }
  for (const r of Object.values(input.sysml.requirements)) {
    if (r.ownerId && r.ownerId !== 'model') ownersWithChildren.add(r.ownerId);
  }
  for (const [, source] of requirementParents) {
    ownersWithChildren.add(source);
  }

  const ownerNodeId = (ownerId: string | undefined, pillar: ModelPillar) => {
    if (ownerId && ownerId !== 'model') {
      if (
        input.sysml.packages[ownerId] ||
        input.sysml.definitions[ownerId] ||
        input.sysml.usages[ownerId] ||
        input.sysml.requirements[ownerId] ||
        nodes[sysmlNodeId(ownerId)]
      ) {
        return sysmlNodeId(ownerId);
      }
    }
    return `project:pillar:${pillar}`;
  };
  const sysmlEntries = [
    ...Object.values(input.sysml.packages).filter(item => item.id !== 'model'),
    ...Object.values(input.sysml.definitions),
    ...Object.values(input.sysml.usages),
    ...Object.values(input.sysml.requirements),
    ...Object.values(input.sysml.verificationCases),
    // Use Case diagram elements. They were never projected, so a Use Case
    // diagram had nothing to group beneath it.
    ...Object.values(input.sysml.actors ?? {}),
    ...Object.values(input.sysml.subjects ?? {}),
    ...Object.values(input.sysml.useCases ?? {}),
  ];
  const childPillars = new Map<string, ModelPillar[]>();
  const addChildPillar = (ownerId: string | undefined, pillar: ModelPillar) => {
    if (!ownerId) return;
    const pillars = childPillars.get(ownerId);
    if (pillars) pillars.push(pillar); else childPillars.set(ownerId, [pillar]);
  };
  for (const item of sysmlEntries) addChildPillar(item.ownerId, pillarForSysmlKind(item.kind));
  for (const diagram of Object.values(input.sysml.diagrams ?? {})) addChildPillar(diagram.ownerId, pillarForDiagramKind(diagram.diagramKind));
  for (const item of sysmlEntries) {
    const pillar = item.kind === 'package' ? pillarForPackageContent(childPillars.get(item.id) ?? []) : pillarForSysmlKind(item.kind);
    const ownerId = item.kind === 'requirement'
      ? requirementParents.get(item.id) ?? item.ownerId
      : item.ownerId;
    const parentNode = ownerNodeId(ownerId, pillar);

    if (input.expandedNodeIds && !input.expandedNodeIds.has(parentNode)) continue;

    const resolvedPort = item.kind === 'port' ? resolvePortUsage(input.sysml, item.id) : undefined;
    register(nodes, {
      nodeId: sysmlNodeId(item.id),
      semanticId: item.id,
      domain: 'sysml',
      kind: item.kind,
      label: sysmlObjectLabel(item, 'Element'),
      secondaryLabel: item.kind === 'port'
        ? (() => {
            if (!resolvedPort) return '[unresolved port definition]';
            const typeName = resolveSysmlReferenceLabel(input.sysml, resolvedPort.definition.typeId, 'Type');
            return `: ${typeName} · ${resolvedPort.effectiveDirection}`;
          })()
        : undefined,
      badges: item.kind === 'port' && resolvedPort && !hasSysmlReference(input.sysml, resolvedPort.definition.typeId)
        ? [{ kind: 'warning', label: 'Unresolved type' }] : undefined,
      parentNodeId: parentNode,
      ownerSemanticId: ownerId || 'model',
      childNodeIds: [],
      hasChildren: ownersWithChildren.has(item.id) || ownersWithChildren.has(sysmlNodeId(item.id)),
    });
  }
  // Extension points belong to their Use Case (never to a diagram), so they
  // nest below it whether or not that Use Case is presented anywhere.
  for (const extensionPoint of Object.values(input.sysml.extensionPoints ?? {})) {
    const owner = input.sysml.useCases?.[extensionPoint.useCaseId];
    if (!owner) continue;
    const parentNode = sysmlNodeId(owner.id);
    if (input.expandedNodeIds && !input.expandedNodeIds.has(parentNode)) {
      continue;
    }
    register(nodes, {
      nodeId: sysmlNodeId(extensionPoint.id),
      semanticId: extensionPoint.id,
      domain: 'sysml',
      kind: extensionPoint.kind,
      label: sysmlObjectLabel(extensionPoint, 'Extension Point'),
      secondaryLabel: extensionPoint.location ? `@ ${extensionPoint.location}` : undefined,
      parentNodeId: parentNode,
      ownerSemanticId: owner.id,
      childNodeIds: [],
      hasChildren: false,
    });
  }

  // Block ports, properties, and operations are classifier features stored on the BlockDefinition, not
  // top-level repository usages. Project them into the same containment tree
  // so tree navigation and canvas/inspector creation expose one semantic feature.
  for (const block of Object.values(input.sysml.definitions ?? {}).filter(item => item.kind === 'block')) {
    const blockNodeId = sysmlNodeId(block.id);
    if (input.expandedNodeIds && !input.expandedNodeIds.has(blockNodeId)) {
      continue;
    }
    for (const port of block.ports ?? []) {
      const nodeId = sysmlNodeId(port.id);
      if (nodes[nodeId]) continue;
      const portKind = port.kind === 'standard' ? 'port' : `${port.kind}Port`;
      register(nodes, projectOwnedFeature({
        id: port.id,
        name: port.name,
        metaclass: portKind as any,
        namespace: [],
        ownerId: block.id,
        typeId: port.typeId,
        direction: port.direction,
      } as any, block.id, input.sysml));
    }
    for (const prop of block.properties ?? []) {
      const nodeId = sysmlNodeId(prop.id);
      if (nodes[nodeId]) continue;
      const featMeta = prop.kind === 'part' ? 'PartProperty' : prop.kind === 'reference' ? 'ReferenceProperty' : prop.kind === 'flow' ? 'FlowProperty' : 'ValueProperty';
      register(nodes, projectOwnedFeature({
        id: prop.id,
        name: prop.name,
        metaclass: featMeta as any,
        namespace: [],
        ownerId: block.id,
        typeId: prop.typeId,
      } as any, block.id, input.sysml));
    }
    for (const op of block.operations ?? []) {
      const opId = typeof op === 'string' ? op : (op as any).id;
      const opName = typeof op === 'string' ? op : (op as any).name;
      const nodeId = sysmlNodeId(opId);
      if (nodes[nodeId]) continue;
      register(nodes, projectOwnedFeature({
        id: opId,
        name: opName,
        metaclass: 'Operation' as any,
        namespace: [],
        ownerId: block.id,
      } as any, block.id, input.sysml));
    }
  }

  // Interaction content (lifelines, messages, fragments, ...) nests under its Interaction. It is
  // read-only in the tree: rename and delete go through the interaction command builders.
  for (const def of Object.values(input.sysml.definitions ?? {})) {
    if (def.kind !== 'interaction') continue;
    const defNodeId = sysmlNodeId(def.id);
    if (!nodes[defNodeId]) continue;
    registerInteractionContent(nodes, input, def, defNodeId);
  }

  // Canonical elements collection (V4 or unified inputs)
  if ((input.sysml as any).elements) {
    for (const el of Object.values((input.sysml as any).elements) as SemanticElement[]) {
      const nodeId = sysmlNodeId(el.id);
      if (nodes[nodeId]) continue;
      const isFeature = [
        'PartProperty', 'ReferenceProperty', 'ValueProperty', 'ConstraintProperty',
        'FlowProperty', 'Port', 'Operation', 'Constraint', 'Parameter',
      ].includes(el.metaclass);
      const isBehavior = [
        'UseCase', 'Activity', 'ActivityPartition', 'Interaction', 'Transition', 'ControlFlow',
        'ObjectFlow', 'Action', 'State',
      ].includes(el.metaclass) || el.metaclass.endsWith('Flow');

      if (isFeature) {
        register(nodes, projectOwnedFeature(el, el.ownerId || 'model', input.sysml));
      } else if (isBehavior) {
        register(nodes, projectBehaviorElement(el));
      } else {
        const pillar = pillarForSysmlKind(el.metaclass);
        register(nodes, {
          nodeId,
          semanticId: el.id,
          domain: 'sysml',
          kind: el.metaclass,
          label: sysmlObjectLabel(el),
          parentNodeId: ownerNodeId(el.ownerId ?? undefined, pillar),
          ownerSemanticId: el.ownerId || 'model',
          childNodeIds: [],
          hasChildren: false,
        });
      }
    }
  }

  // Relationships
  for (const rel of Object.values(input.sysml.relationships ?? {})) {
    const relNode = projectRelationship(rel as any, input.sysml);
    // a relationship no element owns is listed under its source (client) element
    if (!(rel as any).ownerId && nodes[sysmlNodeId(rel.sourceId)]) {
      relNode.parentNodeId = sysmlNodeId(rel.sourceId);
      ownersWithChildren.add(rel.sourceId);
    }
    if (!nodes[relNode.nodeId]) {
      register(nodes, relNode);
    }
    const relAny = rel as any;
    if (relAny.sourceEnd && relAny.sourceEnd.id) {
      const endNode = projectConnectorEnd(relAny.sourceEnd, rel.id, input.sysml);
      if (!nodes[endNode.nodeId]) register(nodes, endNode);
    }
    if (relAny.targetEnd && relAny.targetEnd.id) {
      const endNode = projectConnectorEnd(relAny.targetEnd, rel.id, input.sysml);
      if (!nodes[endNode.nodeId]) register(nodes, endNode);
    }
  }

  // Item flows
  for (const flow of Object.values((input.sysml as any).itemFlows ?? {})) {
    const flowNode = projectItemFlow(flow as any, input.sysml);
    if (!nodes[flowNode.nodeId]) {
      register(nodes, flowNode);
    }
  }

  for (const diagram of Object.values(input.sysml.diagrams ?? {})) {
    const diagramKind: string = diagram.diagramKind;
    const pillar = pillarForDiagramKind(diagramKind);
    register(nodes, {
      nodeId: sysmlNodeId(diagram.id),
      semanticId: diagram.id,
      domain: 'sysml',
      kind: 'diagram',
      label: sysmlObjectLabel(diagram, 'Diagram'),
      secondaryLabel: `[${diagram.diagramKind.toUpperCase()}]`,
      diagramId: diagram.id,
      parentNodeId: ownerNodeId(diagram.ownerId, pillar),
      ownerSemanticId: diagram.ownerId || 'model',
      childNodeIds: [],
      hasChildren: false,
    });
    if (diagramHasMembers(input, diagram.id)) ownersWithChildren.add(diagram.id);
    registerDiagramMembers(nodes, input, diagram.id, input.expandedNodeIds);
  }

  const rootLayer = input.stateMachine.layers.find(layer => layer.id === 'root') ?? input.stateMachine.layers[0];
  const behaviorId = 'project:pillar:behavior';
  const machineId = 'sm:machine:main';
  if (rootLayer) {
    register(nodes, {
      nodeId: machineId,
      semanticId: machineId,
      domain: 'stateMachine',
      kind: 'stateMachine',
      label: 'State Machine',
      parentNodeId: behaviorId,
      ownerSemanticId: null,
      childNodeIds: [],
      hasChildren: false,
    });
    const statesById = new Map(input.stateMachine.states.map(state => [state.id, state]));
    const junctionsById = new Map((input.stateMachine.junctions ?? []).map(junction => [junction.id, junction]));
    const projectLayer = (layerId: string, parentId: string) => {
      const layer = input.stateMachine.layers.find(item => item.id === layerId);
      if (!layer) return;
      const regionId = `sm:region:${layer.id}`;
      register(nodes, {
        nodeId: regionId,
        semanticId: layer.id,
        domain: 'stateMachine',
        kind: 'region',
        label: layer.name || 'Root Region',
        parentNodeId: parentId,
        childNodeIds: [],
        hasChildren: false,
      });
      for (const junctionId of layer.junctionIds ?? []) {
        const junction = junctionsById.get(junctionId);
        if (!junction) continue;
        const junctionNodeId = `sm:junction:${junction.id}`;
        register(nodes, {
          nodeId: junctionNodeId,
          semanticId: junction.id,
          domain: 'stateMachine',
          kind: junction.type ?? 'junction',
          label: junction.name || getElementKindLabel(junction.type ?? 'junction'),
          parentNodeId: regionId,
          ownerSemanticId: layer.id,
          childNodeIds: [],
          hasChildren: false,
        });
      }
      for (const stateId of layer.stateIds ?? []) {
        const state = statesById.get(stateId);
        if (!state) continue;
        const stateNodeId = `sm:state:${state.id}`;
        register(nodes, {
          nodeId: stateNodeId,
          semanticId: state.id,
          domain: 'stateMachine',
          kind: 'state',
          label: state.name,
          parentNodeId: regionId,
          ownerSemanticId: layer.id,
          childNodeIds: [],
          hasChildren: false,
        });
        input.stateMachine.layers
          .filter(child => child.parentStateId === state.id)
          .forEach(child => projectLayer(child.id, stateNodeId));
      }
    };
    projectLayer(rootLayer.id, machineId);
  }

  // State-machine diagrams are owned views: the root diagram hangs directly
  // below Behavior, while nested diagrams stay under their Region.
  for (const diagram of input.stateMachine.diagrams ?? []) {
    const isRootDiagram = diagram.ownerId === 'root' || diagram.contextRegionId === 'root';
    const regionNodeId = `sm:region:${diagram.contextRegionId}`;
    register(nodes, {
      nodeId: `sm:diagram:${diagram.id}`,
      semanticId: diagram.id,
      domain: 'stateMachine',
      kind: 'diagram',
      label: diagram.name,
      secondaryLabel: '[State Machine]',
      diagramId: diagram.id,
      parentNodeId: !isRootDiagram && nodes[regionNodeId] ? regionNodeId : behaviorId,
      ownerSemanticId: diagram.ownerId || 'root',
      childNodeIds: [],
      hasChildren: false,
    });
  }

  registerExternalModels(nodes, input);

  rebuildChildren(nodes, ownersWithChildren);
  return { roots: [modelId], nodes, revision: input.revision };
}

