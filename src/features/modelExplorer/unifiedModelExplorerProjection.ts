import type { SysmlRepository } from '../../engine/sysml/model';
import { resolvePortUsage } from '../../engine/sysml/ibd';
import type { StateMachineExplorerSnapshot } from './adapters/stateMachineExplorerAdapter';
import type {
  ModelPillar,
  ModelTreeNode,
  ModelTreeProjection,
} from './modelExplorerTypes';

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
  for (const item of sysmlEntries) {
    const pillar = pillarForSysmlKind(item.kind);
    const ownerId = item.kind === 'requirement'
      ? requirementParents.get(item.id) ?? item.ownerId
      : item.ownerId;
    register(nodes, {
      nodeId: sysmlNodeId(item.id),
      semanticId: item.id,
      domain: 'sysml',
      kind: item.kind,
      label: item.kind === 'port' && resolvePortUsage(input.sysml, item.id)?.definition
        ? (item.name && item.name !== item.id ? item.name : resolvePortUsage(input.sysml, item.id)!.definition.name)
        : item.name,
      secondaryLabel: item.kind === 'port'
        ? (() => {
            const resolved = resolvePortUsage(input.sysml, item.id);
            if (!resolved) return '[unresolved port definition]';
            const typeName = input.sysml.definitions[resolved.definition.typeId]?.name ?? resolved.definition.typeId;
            return `: ${typeName} · ${resolved.effectiveDirection}`;
          })()
        : undefined,
      parentNodeId: ownerNodeId(ownerId, pillar),
      ownerSemanticId: ownerId || 'model',
      childNodeIds: [],
      hasChildren: false,
    });
  }
  for (const diagram of Object.values(input.sysml.diagrams ?? {})) {
    const pillar = pillarForSysmlKind(diagram.diagramKind === 'requirements' ? 'requirement' : 'block');
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
      parentNodeId: parentId,
      ownerSemanticId: external.ownerStateId ?? null,
      diagramId: external.diagramId,
      childNodeIds: [],
      hasChildren: false,
    });
  }

  rebuildChildren(nodes);
  return { roots: [modelId], nodes, revision: input.revision };
}
