import type { SysmlRepository } from '../../engine/sysml/model';
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
    register(nodes, {
      nodeId: sysmlNodeId(item.id),
      semanticId: item.id,
      domain: 'sysml',
      kind: item.kind,
      label: item.name,
      parentNodeId: ownerNodeId(item.ownerId, pillar),
      ownerSemanticId: item.ownerId || 'model',
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

  return { roots: [modelId], nodes, revision: input.revision };
}

