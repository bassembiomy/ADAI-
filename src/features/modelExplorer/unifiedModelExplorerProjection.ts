import type { SysmlRepository } from '../../engine/sysml/model';
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
import { buildDiagramVisualParentIndex } from './diagramTreeContext';
import { getElementKindLabel } from './modelExplorerCapabilities';
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
  if (kind === 'activity' || kind === 'interaction') return 'behavior';
  return 'structural';
};

/**
 * Diagrams are viewpoints: a parametric diagram belongs under the Parametric
 * pillar, requirements and traceability views under Requirements, everything
 * else (BDD, IBD, Package) under Structural.
 */
const pillarForDiagramKind = (diagramKind: string): ModelPillar => {
  if (diagramKind === 'requirements' || diagramKind === 'rtm') return 'requirements';
  if (diagramKind === 'parametric') return 'parametric';
  return 'structural';
};

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

export function buildUnifiedModelProjection(input: UnifiedExplorerInput): ModelTreeProjection {
  const nodes: Record<string, ModelTreeNode> = {};
  const visualParentBySemanticId = buildDiagramVisualParentIndex({
    sysml: input.sysml,
    stateMachine: input.stateMachine,
    diagramPresentations: input.diagramPresentations ?? {},
  });
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
  for (const [, visualParentId] of visualParentBySemanticId) {
    ownersWithChildren.add(visualParentId);
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
  for (const item of sysmlEntries) {
    const pillar = pillarForSysmlKind(item.kind);
    const ownerId = item.kind === 'requirement'
      ? requirementParents.get(item.id) ?? item.ownerId
      : item.ownerId;
    const parentNode = ownerNodeId(ownerId, pillar);

    const visualParentSemantic = visualParentBySemanticId.get(item.id);
    const visualParentNode = visualParentSemantic ? sysmlNodeId(visualParentSemantic) : undefined;
    if (
      input.expandedNodeIds &&
      !input.expandedNodeIds.has(parentNode) &&
      (!visualParentNode || !input.expandedNodeIds.has(visualParentNode))
    ) {
      continue;
    }

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
        const lifeline = lifelines.find(candidate => candidate.id === invariant.lifelineId);
        leaf(parent, invariant.id, 'stateInvariant', 'State invariant', lifeline ? `on ${lifeline.name?.trim() || 'lifeline'}` : undefined);
      }
    }
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

  for (const external of input.externalModels) {
    const nodeId = `${external.domain}:model:${external.id}`;
    const stateParent = external.ownerStateId && nodes[`sm:state:${external.ownerStateId}`];
    const parentId = stateParent ? stateParent.nodeId : 'project:pillar:parametric';
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

  applyDiagramVisualParents(nodes, visualParentBySemanticId);
  rebuildChildren(nodes, ownersWithChildren);
  return { roots: [modelId], nodes, revision: input.revision };
}

/**
 * Moves presented elements under the diagram that shows them. The diagram node
 * must already exist, and a rewrite is skipped whenever it would close a
 * containment cycle (a diagram owned by an element it also presents), so the
 * primary containment projection stays a forest.
 */
function applyDiagramVisualParents(
  nodes: Record<string, ModelTreeNode>,
  visualParentBySemanticId: Map<string, string>,
): void {
  const isDiagramMember = (node: ModelTreeNode): boolean =>
    (node.domain === 'sysml' || node.domain === 'stateMachine')
    && !node.virtualKind
    && node.kind !== 'diagram'
    && node.kind !== 'group'
    && node.kind !== 'model'
    && node.kind !== 'pillar'
    && node.kind !== 'port'
    && !node.kind.endsWith('Port')
    && !node.kind.endsWith('Property')
    && node.kind !== 'connectorEnd'
    && node.kind !== 'Operation'
    // Interaction content always stays under its Interaction.
    && !(node.readOnly && node.ownerSemanticId && node.parentNodeId?.startsWith('sysml:group:'))
    && nodes[node.nodeId] === node;

  const wouldCreateCycle = (childId: string, parentId: string): boolean => {
    let current: string | null | undefined = parentId;
    const seen = new Set<string>();
    while (current && !seen.has(current)) {
      if (current === childId) return true;
      seen.add(current);
      current = nodes[current]?.parentNodeId;
    }
    return false;
  };

  const semanticToNodeId = new Map<string, string>();
  for (const nodeId in nodes) {
    const node = nodes[nodeId];
    if (node.semanticId && !semanticToNodeId.has(node.semanticId)) {
      semanticToNodeId.set(node.semanticId, nodeId);
    }
  }

  for (const [semanticId, visualParentId] of visualParentBySemanticId) {
    if (!visualParentId || !nodes[visualParentId]) continue;
    const nodeId = semanticToNodeId.get(semanticId);
    if (!nodeId) continue;
    const node = nodes[nodeId];
    if (!node || !isDiagramMember(node)) continue;
    if (node.parentNodeId === visualParentId) continue;
    if (wouldCreateCycle(node.nodeId, visualParentId)) continue;
    node.parentNodeId = visualParentId;
  }
}
