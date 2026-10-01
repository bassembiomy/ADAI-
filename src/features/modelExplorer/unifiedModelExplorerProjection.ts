import type { SysmlRepository } from '../../engine/sysml/model';
import type { SemanticElement } from '../../engine/sysml/domain/base';
import type {
  SemanticRelationship,
  ConnectorEnd,
  ItemFlow,
} from '../../engine/sysml/domain/relationships';
import type { BehaviorElement } from '../../engine/sysml/domain/behaviors';
import { resolvePortUsage } from '../../engine/sysml/ibd';
import type { DiagramPresentationInput } from '../../engine/sysml/presentationState';
import type { StateMachineExplorerSnapshot } from './adapters/stateMachineExplorerAdapter';
import { buildDiagramVisualParentIndex } from './diagramTreeContext';
import { getElementKindLabel } from './modelExplorerCapabilities';
import type {
  ModelPillar,
  ModelTreeNode,
  ModelTreeProjection,
} from './modelExplorerTypes';

export function projectOwnedFeature(feature: SemanticElement, ownerId: string): ModelTreeNode {
  const feat = feature as any;
  let secondaryLabel: string | undefined;
  if (feat.typeId) {
    secondaryLabel = `: ${feat.typeId}`;
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
    label: feature.name || feature.id,
    secondaryLabel,
    parentNodeId: `sysml:element:${ownerId}`,
    ownerSemanticId: ownerId,
    childNodeIds: [],
    hasChildren: false,
  };
}

export function projectRelationship(relationship: SemanticRelationship): ModelTreeNode {
  const rel = relationship as any;
  const ownerId = rel.ownerId ?? 'model';
  const secondaryLabel = `${relationship.sourceId} -> ${relationship.targetId}`;
  return {
    nodeId: `sysml:element:${relationship.id}`,
    semanticId: relationship.id,
    domain: 'sysml',
    kind: relationship.metaclass ?? 'relationship',
    label: relationship.name || relationship.id,
    secondaryLabel,
    parentNodeId: ownerId && ownerId !== 'model' ? `sysml:element:${ownerId}` : 'project:pillar:structural',
    ownerSemanticId: ownerId,
    childNodeIds: [],
    hasChildren: false,
  };
}

export function projectConnectorEnd(end: ConnectorEnd, connectorId: string): ModelTreeNode {
  return {
    nodeId: `sysml:element:${end.id}`,
    semanticId: end.id,
    targetSemanticId: end.roleId,
    domain: 'sysml',
    kind: 'connectorEnd',
    label: end.roleId || end.id,
    secondaryLabel: `: ${end.roleId}`,
    parentNodeId: `sysml:element:${connectorId}`,
    ownerSemanticId: connectorId,
    childNodeIds: [],
    hasChildren: false,
  };
}

export function projectItemFlow(flow: ItemFlow): ModelTreeNode {
  const secondaryLabel = `${flow.sourceId} -> ${flow.targetId}${
    flow.conveyedClassifierIds?.length ? ` : ${flow.conveyedClassifierIds.join(', ')}` : ''
  }`;
  return {
    nodeId: `sysml:element:${flow.id}`,
    semanticId: flow.id,
    domain: 'sysml',
    kind: 'ItemFlow',
    label: flow.name || flow.id,
    secondaryLabel,
    parentNodeId: `sysml:element:${flow.realizingRelationshipId}`,
    ownerSemanticId: flow.realizingRelationshipId,
    childNodeIds: [],
    hasChildren: false,
  };
}

export function projectBehaviorElement(element: BehaviorElement): ModelTreeNode {
  const el = element as any;
  const ownerId = el.ownerId ?? 'model';
  const secondaryLabel = el.metaclass ? `[${el.metaclass}]` : undefined;
  return {
    nodeId: `sysml:element:${element.id}`,
    semanticId: element.id,
    domain: 'sysml',
    kind: element.metaclass ?? 'behavior',
    label: element.name || element.id,
    secondaryLabel,
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
}


const pillarOrder: Array<[ModelPillar, string]> = [
  ['structural', 'Structural'],
  ['behavior', 'Behavior'],
  ['parametric', 'Parametric'],
  ['requirements', 'Requirements'],
];

const pillarForSysmlKind = (kind: string): ModelPillar => {
  if (kind === 'requirement' || kind === 'verificationCase') return 'requirements';
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

const addChild = (nodes: Record<string, ModelTreeNode>, parentId: string, childId: string) => {
  const parent = nodes[parentId];
  if (!parent || parent.childNodeIds.includes(childId)) return;
  parent.childNodeIds.push(childId);
  parent.hasChildren = true;
};

const register = (nodes: Record<string, ModelTreeNode>, node: ModelTreeNode) => {
  nodes[node.nodeId] = node;
  if (node.parentNodeId) addChild(nodes, node.parentNodeId, node.nodeId);
};

const rebuildChildren = (nodes: Record<string, ModelTreeNode>) => {
  for (const node of Object.values(nodes)) {
    node.childNodeIds = [];
    node.hasChildren = false;
  }
  for (const node of Object.values(nodes)) {
    if (node.parentNodeId) addChild(nodes, node.parentNodeId, node.nodeId);
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
    label: input.sysml.packages.model?.name ?? 'Model',
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
  const ownerNodeId = (ownerId: string | undefined, pillar: ModelPillar) => {
    if (ownerId && nodes[sysmlNodeId(ownerId)]) return sysmlNodeId(ownerId);
    return `project:pillar:${pillar}`;
  };
  const sysmlEntries = [
    ...Object.values(input.sysml.packages).filter(item => item.id !== 'model'),
    ...Object.values(input.sysml.definitions),
    ...Object.values(input.sysml.usages),
    ...Object.values(input.sysml.requirements),
    ...Object.values(input.sysml.verificationCases),
  ];
  const portUsageOrdinal = new Map<string, number>();
  for (const usage of Object.values(input.sysml.usages).filter(item => item.kind === 'port')) {
    const count = portUsageOrdinal.get(usage.ownerId) ?? 0;
    portUsageOrdinal.set(usage.ownerId, count + 1);
    portUsageOrdinal.set(usage.id, count + 1);
  }
  for (const item of sysmlEntries) {
    const pillar = pillarForSysmlKind(item.kind);
    const ownerId = item.kind === 'requirement'
      ? requirementParents.get(item.id) ?? item.ownerId
      : item.ownerId;
    const resolvedPort = item.kind === 'port' ? resolvePortUsage(input.sysml, item.id) : undefined;
    const isUuid = (value: string) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{8,}$/i.test(value);
    const hasOpaqueName = item.name === item.id || isUuid(item.name);
    const readableLabel = item.kind === 'port'
      ? (hasOpaqueName
          ? resolvedPort?.definition.name && !isUuid(resolvedPort.definition.name)
            ? resolvedPort.definition.name
            : `Port ${portUsageOrdinal.get(item.id) ?? 1}`
          : item.name)
      : item.name;
    register(nodes, {
      nodeId: sysmlNodeId(item.id),
      semanticId: item.id,
      domain: 'sysml',
      kind: item.kind,
      label: readableLabel,
      secondaryLabel: item.kind === 'port'
        ? (() => {
            if (!resolvedPort) return hasOpaqueName ? `(${item.id}) · [unresolved port definition]` : '[unresolved port definition]';
            const typeName = input.sysml.definitions[resolvedPort.definition.typeId]?.name ?? resolvedPort.definition.typeId;
            const idSuffix = hasOpaqueName && isUuid(item.id) ? ` · ID ${item.id}` : '';
            return `: ${typeName} · ${resolvedPort.effectiveDirection}${idSuffix}`;
          })()
        : undefined,
      parentNodeId: ownerNodeId(ownerId, pillar),
      ownerSemanticId: ownerId || 'model',
      childNodeIds: [],
      hasChildren: false,
    });
  }
  // Block ports, properties, and operations are classifier features stored on the BlockDefinition, not
  // top-level repository usages. Project them into the same containment tree
  // so tree navigation and canvas/inspector creation expose one semantic feature.
  for (const block of Object.values(input.sysml.definitions ?? {}).filter(item => item.kind === 'block')) {
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
        typeId: port.typeId ? input.sysml.definitions[port.typeId]?.name ?? port.typeId : undefined,
        direction: port.direction,
      } as any, block.id));
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
      } as any, block.id));
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
      } as any, block.id));
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
        'UseCase', 'Activity', 'ActivityPartition', 'Transition', 'ControlFlow',
        'ObjectFlow', 'Action', 'State',
      ].includes(el.metaclass) || el.metaclass.endsWith('Flow');

      if (isFeature) {
        register(nodes, projectOwnedFeature(el, el.ownerId || 'model'));
      } else if (isBehavior) {
        register(nodes, projectBehaviorElement(el));
      } else {
        const pillar = pillarForSysmlKind(el.metaclass);
        register(nodes, {
          nodeId,
          semanticId: el.id,
          domain: 'sysml',
          kind: el.metaclass,
          label: el.name || el.id,
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
    const relNode = projectRelationship(rel as any);
    if (!nodes[relNode.nodeId]) {
      register(nodes, relNode);
    }
    const relAny = rel as any;
    if (relAny.sourceEnd && relAny.sourceEnd.id) {
      const endNode = projectConnectorEnd(relAny.sourceEnd, rel.id);
      if (!nodes[endNode.nodeId]) register(nodes, endNode);
    }
    if (relAny.targetEnd && relAny.targetEnd.id) {
      const endNode = projectConnectorEnd(relAny.targetEnd, rel.id);
      if (!nodes[endNode.nodeId]) register(nodes, endNode);
    }
  }

  // Item flows
  for (const flow of Object.values((input.sysml as any).itemFlows ?? {})) {
    const flowNode = projectItemFlow(flow as any);
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
      label: diagram.name,
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
  rebuildChildren(nodes);
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

  for (const node of Object.values(nodes)) {
    if (!isDiagramMember(node)) continue;
    const visualParentId = visualParentBySemanticId.get(node.semanticId);
    if (!visualParentId || !nodes[visualParentId]) continue;
    if (node.parentNodeId === visualParentId) continue;
    if (wouldCreateCycle(node.nodeId, visualParentId)) continue;
    node.parentNodeId = visualParentId;
  }
}
