import type {
  ModelExplorerAdapter,
  ModelTreeProjection,
  ModelTreeNode,
  ExplorerCapability,
  ModelExplorerCommand,
  ExplorerCommandResult,
  ExplorerView,
  ExplorerDiagnostic,
} from '../modelExplorerTypes';
import { hashImpact } from '../modelExplorerTypes';
import {
  getElementKindLabel,
  getRelationshipKindLabel,
} from '../modelExplorerCapabilities';
import { generateId, generateUniqueName } from './modelExplorerFactories';
import type {
  StateData,
  Layer,
  JunctionData,
  TransitionData,
  StateMachineDiagramData,
  PseudostateKind,
} from '../../../types/sm_types';
import {
  type StateMachineExplorerSnapshot,
  analyzeStateMove,
  moveStateMachineElements,
  pruneMultipleStatesHierarchy,
} from '../../../utils/stateMachine/smStatePruner';

export { type StateMachineExplorerSnapshot };

export interface StateMachineAdapterHarness {
  getSnapshot: () => StateMachineExplorerSnapshot;
  onCommit: (nextSnapshot: StateMachineExplorerSnapshot, description: string) => void;
  snapshot?: StateMachineExplorerSnapshot;
}

const STATE_MACHINE_CHILDREN: Record<string, readonly string[]> = {
  stateMachine: ['region'],
  region: [
    'state',
    'final',
    'initial',
    'choice',
    'junction',
    'fork',
    'join',
    'history',
    'deep-history',
    'entry-point',
    'exit-point',
    'terminate',
  ],
  state: ['region'],
};

export function createStateMachineExplorerAdapter(harness: StateMachineAdapterHarness): ModelExplorerAdapter {
  const getSnapshot = (): StateMachineExplorerSnapshot => {
    if (typeof harness.getSnapshot === 'function') {
      return harness.getSnapshot();
    }
    if (harness.snapshot) {
      return harness.snapshot;
    }
    throw new Error('StateMachineExplorerAdapter: Harness must provide getSnapshot() or .snapshot');
  };

  const commitSnapshot = (nextSnapshot: StateMachineExplorerSnapshot, description: string) => {
    if (typeof harness.onCommit === 'function') {
      harness.onCommit(nextSnapshot, description);
    } else if (harness.snapshot) {
      harness.snapshot = {
        ...nextSnapshot,
        revision: (harness.snapshot.revision ?? 1) + 1,
      };
    }
  };

  return {
    domain: 'stateMachine',

    getRevision(): number {
      return getSnapshot().revision ?? 1;
    },

    project(view: ExplorerView, contextId?: string): ModelTreeProjection {
      const snapshot = getSnapshot();
      const nodes: Record<string, ModelTreeNode> = {};
      const roots: string[] = [];

      const registerNode = (node: ModelTreeNode) => {
        nodes[node.nodeId] = node;
        if (node.parentNodeId && nodes[node.parentNodeId]) {
          const parent = nodes[node.parentNodeId];
          if (!parent.childNodeIds.includes(node.nodeId)) {
            parent.childNodeIds.push(node.nodeId);
            parent.hasChildren = true;
          }
        }
      };

      // Find root layer
      const rootLayer =
        snapshot.layers.find(l => l.id === 'root') ||
        snapshot.layers.find(l => !l.parentStateId) ||
        snapshot.layers[0];

      if (!rootLayer) {
        return { roots: [], nodes: {}, revision: snapshot.revision ?? 1 };
      }

      // Recursive region projector
      const projectRegion = (layer: Layer, parentNodeId: string | null) => {
        const regionNodeId = `sm:region:${layer.id}`;
        if (!parentNodeId) {
          roots.push(regionNodeId);
        }

        registerNode({
          nodeId: regionNodeId,
          semanticId: layer.id,
          domain: 'stateMachine',
          kind: 'region',
          label: layer.name || (layer.id === 'root' ? 'Root Region' : `Region ${layer.id}`),
          parentNodeId,
          childNodeIds: [],
          hasChildren: false,
        });

        // 1. Child states
        for (const stateId of layer.stateIds) {
          const state = snapshot.states.find(s => s.id === stateId);
          if (!state) continue;
          const stateNodeId = `sm:state:${state.id}`;

          registerNode({
            nodeId: stateNodeId,
            semanticId: state.id,
            domain: 'stateMachine',
            kind: 'state',
            label: state.name,
            parentNodeId: regionNodeId,
            childNodeIds: [],
            hasChildren: false,
          });

          // Sub-regions under composite state
          const childLayers = snapshot.layers.filter(l => l.parentStateId === state.id);
          for (const childLayer of childLayers) {
            projectRegion(childLayer, stateNodeId);
          }
        }

        // 2. Child junctions / pseudostates
        for (const junctionId of layer.junctionIds) {
          const junction = snapshot.junctions.find(j => j.id === junctionId);
          if (!junction) continue;
          const jNodeId = `sm:junction:${junction.id}`;

          registerNode({
            nodeId: jNodeId,
            semanticId: junction.id,
            domain: 'stateMachine',
            kind: junction.type ?? 'junction',
            label: junction.name || getElementKindLabel(junction.type ?? 'junction'),
            parentNodeId: regionNodeId,
            childNodeIds: [],
            hasChildren: false,
          });
        }

        // 3. Child transitions
        if (layer.transitionIds.length > 0) {
          const transGroupId = `sm:group:${layer.id}:transitions`;
          registerNode({
            nodeId: transGroupId,
            semanticId: layer.id,
            domain: 'stateMachine',
            kind: 'group',
            label: 'Transitions',
            parentNodeId: regionNodeId,
            childNodeIds: [],
            hasChildren: true,
          });

          for (const transId of layer.transitionIds) {
            const trans = snapshot.transitions.find(t => t.id === transId);
            if (!trans) continue;
            const source = snapshot.states.find(s => s.id === trans.sourceId) || snapshot.junctions.find(j => j.id === trans.sourceId);
            const target = snapshot.states.find(s => s.id === trans.targetId) || snapshot.junctions.find(j => j.id === trans.targetId);
            const sourceName = source?.name ?? trans.sourceId;
            const targetName = target?.name ?? trans.targetId;

            let transLabel = trans.condition ? `[${trans.condition}]` : (trans.action ? `/ ${trans.action}` : `Transition`);
            registerNode({
              nodeId: `sm:transition:${trans.id}`,
              semanticId: trans.id,
              domain: 'stateMachine',
              kind: 'transition',
              label: transLabel,
              secondaryLabel: `${sourceName} → ${targetName}`,
              parentNodeId: transGroupId,
              childNodeIds: [],
              hasChildren: false,
            });
          }
        }

        // 4. Child diagrams
        const regionDiagrams = (snapshot.diagrams ?? []).filter(d => d.contextRegionId === layer.id || d.ownerId === layer.id);
        for (const diag of regionDiagrams) {
          registerNode({
            nodeId: `sm:diagram:${diag.id}`,
            semanticId: diag.id,
            domain: 'stateMachine',
            kind: 'diagram',
            label: diag.name,
            secondaryLabel: '[State Machine]',
            parentNodeId: regionNodeId,
            childNodeIds: [],
            hasChildren: false,
          });
        }
      };

      projectRegion(rootLayer, null);

      return {
        roots,
        nodes,
        revision: snapshot.revision ?? 1,
      };
    },

    capabilities(elementIds: readonly string[], activeDiagramId?: string): ExplorerCapability[] {
      const snapshot = getSnapshot();
      const caps: ExplorerCapability[] = [];

      if (elementIds.length === 0) return caps;

      if (elementIds.length === 1) {
        const id = elementIds[0];
        const isLayer = snapshot.layers.some(l => l.id === id);
        const isState = snapshot.states.some(s => s.id === id);
        const junction = snapshot.junctions.find(j => j.id === id);
        const isTransition = snapshot.transitions.some(t => t.id === id);

        const kind = isLayer ? 'region' : isState ? 'state' : junction ? (junction.type ?? 'junction') : isTransition ? 'transition' : 'unknown';

        const allowedChildren = STATE_MACHINE_CHILDREN[kind] ?? [];
        for (const childKind of allowedChildren) {
          caps.push({
            id: `create:${childKind}`,
            kind: 'createElement',
            label: getElementKindLabel(childKind),
            enabled: true,
            elementKind: childKind,
          });
        }

        if (kind === 'state' || kind === 'region') {
          caps.push({
            id: 'createDiagram:stateMachine',
            kind: 'createDiagram',
            label: 'State Machine Diagram',
            enabled: true,
            elementKind: 'stateMachine',
          });
        }

        if (kind === 'state' || junction) {
          caps.push({
            id: 'rel:transition:outgoing',
            kind: 'createRelationship',
            label: 'Transition',
            enabled: true,
            relationshipKind: 'transition',
            direction: 'outgoing',
          });
          caps.push({
            id: 'rel:transition:incoming',
            kind: 'createRelationship',
            label: 'Incoming Transition',
            enabled: true,
            relationshipKind: 'transition',
            direction: 'incoming',
          });
        }

        const isRoot = id === 'root';
        caps.push({
          id: 'rename',
          kind: 'rename',
          label: 'Rename',
          enabled: !isRoot,
        });
        caps.push({
          id: 'move',
          kind: 'move',
          label: 'Move',
          enabled: !isRoot && kind !== 'transition',
        });
        caps.push({
          id: 'delete',
          kind: 'delete',
          label: 'Delete',
          enabled: !isRoot,
        });
        caps.push({
          id: 'copy',
          kind: 'copy',
          label: 'Copy',
          enabled: !isRoot,
        });
        caps.push({
          id: 'duplicate',
          kind: 'duplicate',
          label: 'Duplicate',
          enabled: !isRoot && kind !== 'region',
        });

        return caps;
      }

      caps.push({
        id: 'move',
        kind: 'move',
        label: 'Move',
        enabled: !elementIds.includes('root'),
      });
      caps.push({
        id: 'delete',
        kind: 'delete',
        label: 'Delete',
        enabled: !elementIds.includes('root'),
      });
      caps.push({
        id: 'copy',
        kind: 'copy',
        label: 'Copy',
        enabled: !elementIds.includes('root'),
      });

      return caps;
    },

    preflight(command: ModelExplorerCommand): ExplorerCommandResult {
      const snapshot = getSnapshot();
      const revision = snapshot.revision ?? 1;
      const diagnostics: ExplorerDiagnostic[] = [];

      switch (command.type) {
        case 'move': {
          const impactResult = analyzeStateMove(snapshot, command.elementIds, command.targetOwnerId);
          if (!impactResult.valid) {
            diagnostics.push({
              code: 'INVALID_MOVE',
              severity: 'error',
              message: impactResult.reason ?? 'Cannot perform state move',
            });
            return { committed: false, revision, diagnostics };
          }

          if (impactResult.invalid.length > 0) {
            const impact = {
              descendants: [],
              relationships: [],
              presentations: [],
              invalidated: impactResult.invalid,
            };
            if (command.confirmedImpactHash !== hashImpact(impact)) {
              return {
                committed: false,
                revision,
                diagnostics: [],
                impact,
              };
            }
          }

          return { committed: false, revision, diagnostics: [] };
        }

        case 'createElement': {
          const layer = snapshot.layers.find(l => l.id === command.ownerId);
          const state = snapshot.states.find(s => s.id === command.ownerId);
          if (!layer && !state) {
            diagnostics.push({
              code: 'OWNER_NOT_FOUND',
              severity: 'error',
              message: `Owner '${command.ownerId}' not found.`,
            });
            return { committed: false, revision, diagnostics };
          }
          return { committed: false, revision, diagnostics: [] };
        }

        case 'rename': {
          if (!command.name || command.name.trim() === '') {
            diagnostics.push({
              code: 'EMPTY_NAME',
              severity: 'error',
              message: 'Name cannot be empty.',
            });
            return { committed: false, revision, diagnostics };
          }
          return { committed: false, revision, diagnostics: [] };
        }

        default:
          return { committed: false, revision, diagnostics: [] };
      }
    },

    execute(command: ModelExplorerCommand): ExplorerCommandResult {
      const pre = this.preflight(command);
      if (pre.diagnostics.some(d => d.severity === 'error') || pre.impact) {
        return pre;
      }

      const snapshot = getSnapshot();
      const existingNames = [
        ...snapshot.states.map(s => s.name),
        ...snapshot.layers.map(l => l.name),
        ...snapshot.junctions.map(j => j.name),
      ];

      switch (command.type) {
        case 'createElement': {
          const ownerId = command.ownerId;
          if (command.elementKind === 'state') {
            const name = command.name ?? generateUniqueName('State', existingNames);
            const stateId = generateId('state');
            const newState: StateData = {
              id: stateId,
              name,
              x: 100,
              y: 100,
              width: 140,
              height: 70,
              entry: '',
              during: '',
              exit: '',
              isActive: false,
              color: '#ffffff',
              parentId: ownerId,
              children: [],
              priority: 0,
              isParallel: false,
              regionId: ownerId,
              autostart: false,
            };

            const nextLayers = snapshot.layers.map(l => {
              if (l.id === ownerId) {
                return { ...l, stateIds: [...l.stateIds, stateId] };
              }
              return l;
            });

            const nextSnapshot: StateMachineExplorerSnapshot = {
              ...snapshot,
              states: [...snapshot.states, newState],
              layers: nextLayers,
            };
            commitSnapshot(nextSnapshot, `Create state ${name}`);
            return {
              committed: true,
              revision: this.getRevision(),
              diagnostics: [],
              selectedIds: [stateId],
            };
          }

          if (command.elementKind === 'region') {
            const name = command.name ?? generateUniqueName('Region', existingNames);
            const layerId = generateId('region');
            const newLayer: Layer = {
              id: layerId,
              name,
              parentStateId: ownerId,
              stateIds: [],
              transitionIds: [],
              junctionIds: [],
            };

            const nextStates = snapshot.states.map(s => {
              if (s.id === ownerId) {
                return { ...s, children: [...s.children, layerId] };
              }
              return s;
            });

            const nextSnapshot: StateMachineExplorerSnapshot = {
              ...snapshot,
              layers: [...snapshot.layers, newLayer],
              states: nextStates,
            };
            commitSnapshot(nextSnapshot, `Create region ${name}`);
            return {
              committed: true,
              revision: this.getRevision(),
              diagnostics: [],
              selectedIds: [layerId],
            };
          }

          // Pseudostates
          const pseudoKind = command.elementKind as PseudostateKind;
          const jId = generateId(pseudoKind);
          const name = command.name ?? generateUniqueName(getElementKindLabel(pseudoKind), existingNames);
          const newJunction: JunctionData = {
            id: jId,
            name,
            x: 50,
            y: 50,
            color: '#000000',
            parentId: ownerId,
            type: pseudoKind,
          };

          const nextLayers = snapshot.layers.map(l => {
            if (l.id === ownerId) {
              return { ...l, junctionIds: [...l.junctionIds, jId] };
            }
            return l;
          });

          const nextSnapshot: StateMachineExplorerSnapshot = {
            ...snapshot,
            junctions: [...snapshot.junctions, newJunction],
            layers: nextLayers,
          };
          commitSnapshot(nextSnapshot, `Create pseudostate ${name}`);
          return {
            committed: true,
            revision: this.getRevision(),
            diagnostics: [],
            selectedIds: [jId],
          };
        }

        case 'move': {
          const impact = analyzeStateMove(snapshot, command.elementIds, command.targetOwnerId);
          const nextSnapshot = moveStateMachineElements(
            snapshot,
            command.elementIds,
            command.targetOwnerId,
            impact.invalid
          );
          commitSnapshot(nextSnapshot, 'Move elements');
          return {
            committed: true,
            revision: this.getRevision(),
            diagnostics: [],
            selectedIds: command.elementIds,
          };
        }

        case 'delete': {
          const result = pruneMultipleStatesHierarchy(command.elementIds, snapshot, {
            currentLayerId: 'root',
            layerStack: ['root'],
            layerPath: ['Root'],
          });
          const nextSnapshot: StateMachineExplorerSnapshot = {
            ...snapshot,
            states: result.states,
            layers: result.layers,
            junctions: result.junctions,
            transitions: result.transitions,
          };
          commitSnapshot(nextSnapshot, 'Delete elements');
          return {
            committed: true,
            revision: this.getRevision(),
            diagnostics: [],
          };
        }

        case 'rename': {
          const nextStates = snapshot.states.map(s => s.id === command.elementId ? { ...s, name: command.name } : s);
          const nextLayers = snapshot.layers.map(l => l.id === command.elementId ? { ...l, name: command.name } : l);
          const nextJunctions = snapshot.junctions.map(j => j.id === command.elementId ? { ...j, name: command.name } : j);
          const nextTransitions = snapshot.transitions.map(t => t.id === command.elementId ? { ...t, condition: command.name } : t);

          const nextSnapshot: StateMachineExplorerSnapshot = {
            ...snapshot,
            states: nextStates,
            layers: nextLayers,
            junctions: nextJunctions,
            transitions: nextTransitions,
          };
          commitSnapshot(nextSnapshot, `Rename ${command.elementId} to ${command.name}`);
          return {
            committed: true,
            revision: this.getRevision(),
            diagnostics: [],
            selectedIds: [command.elementId],
          };
        }

        case 'createRelationship': {
          const tId = generateId('trans');
          const newTransition: TransitionData = {
            id: tId,
            sourceId: command.sourceId,
            targetId: command.targetId,
            condition: '',
            action: '',
            afterTicks: null,
            type: 'condition',
            hasControlPoint: false,
            order: snapshot.transitions.length,
          };

          // Find containing layer
          const containingLayer = snapshot.layers.find(l =>
            (l.stateIds.includes(command.sourceId) || l.junctionIds.includes(command.sourceId))
          ) ?? snapshot.layers[0];

          const nextLayers = snapshot.layers.map(l => {
            if (l.id === containingLayer.id) {
              return { ...l, transitionIds: [...l.transitionIds, tId] };
            }
            return l;
          });

          const nextSnapshot: StateMachineExplorerSnapshot = {
            ...snapshot,
            transitions: [...snapshot.transitions, newTransition],
            layers: nextLayers,
          };
          commitSnapshot(nextSnapshot, 'Create transition');
          return {
            committed: true,
            revision: this.getRevision(),
            diagnostics: [],
            selectedIds: [tId],
          };
        }

        case 'createDiagram': {
          const diagId = generateId('diag');
          const newDiagram: StateMachineDiagramData = {
            id: diagId,
            name: command.name ?? generateUniqueName('State Machine Diagram', (snapshot.diagrams ?? []).map(d => d.name)),
            ownerId: command.ownerId,
            contextRegionId: command.ownerId,
          };
          const nextSnapshot: StateMachineExplorerSnapshot = {
            ...snapshot,
            diagrams: [...(snapshot.diagrams ?? []), newDiagram],
          };
          commitSnapshot(nextSnapshot, `Create diagram ${newDiagram.name}`);
          return {
            committed: true,
            revision: this.getRevision(),
            diagnostics: [],
            selectedIds: [diagId],
          };
        }

        default:
          return {
            committed: false,
            revision: this.getRevision(),
            diagnostics: [{ code: 'UNSUPPORTED_COMMAND', severity: 'error', message: 'Command not supported' }],
          };
      }
    },

    relationshipTargets(sourceId: string, relationshipKind: string, direction: 'incoming' | 'outgoing'): ModelTreeNode[] {
      const snapshot = getSnapshot();
      const candidates: ModelTreeNode[] = [];
      const projection = this.project('containment');

      for (const node of Object.values(projection.nodes)) {
        if (node.semanticId !== sourceId && (node.kind === 'state' || node.kind === 'junction' || node.kind === 'initial' || node.kind === 'final')) {
          candidates.push(node);
        }
      }

      return candidates;
    },
  };
}
