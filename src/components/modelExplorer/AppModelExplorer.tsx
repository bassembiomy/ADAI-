import React, { useMemo, useState, useCallback, useRef } from 'react';
import type {
  ModelTreeNode,
  ModelExplorerCommand,
  ExplorerCapability,
  ExplorerImpact,
  ExplorerClipboardPayload,
  ActiveDiagramContext,
} from '../../features/modelExplorer/modelExplorerTypes';
import { hashImpact } from '../../features/modelExplorer/modelExplorerTypes';
import { ModelExplorer } from './ModelExplorer';
import { MoveImpactDialog } from './MoveImpactDialog';
import { RelationshipWizard } from './RelationshipWizard';
import {
  copyOwnershipForest,
} from '../../features/modelExplorer/modelExplorerClipboard';
import {
  createStateMachineExplorerAdapter,
  type StateMachineExplorerSnapshot,
} from '../../features/modelExplorer/adapters/stateMachineExplorerAdapter';
import { createSysmlExplorerAdapter } from '../../features/modelExplorer/adapters/sysmlExplorerAdapter';
import {
  createModelExplorerCommandBus,
  isPreflightClear,
} from '../../features/modelExplorer/modelExplorerCommandBus';
import type { StateData, Layer, TransitionData, JunctionData, StateMachineDiagramData } from '../../types/sm_types';
import type { BlockData, PartData } from '../../types/sysml_types';
import { createEmptyRepository, parseMultiplicity, type SysmlRepository } from '../../engine/sysml/model';
import type { SysmlGatewayState, SysmlEditorCommand, SysmlCommandResult } from '../../services/sysmlCommandGateway';
import { executeSysmlCommand } from '../../services/sysmlCommandGateway';
import { fromRepository } from '../../engine/sysml/normalizedStore';
import { createHistory } from '../../engine/sysml/mutations';

import {
  computeRangeSelection,
  computeToggleSelection,
} from '../../features/modelExplorer/modelExplorerMultiSelect';
import { projectModelTree } from '../../features/modelExplorer/modelExplorerProjection';
import { buildUnifiedModelProjection } from '../../features/modelExplorer/unifiedModelExplorerProjection';

export interface CapabilityActionContext {
  activeDiagramId?: string;
  activeDiagramContext?: ActiveDiagramContext;
  selectedSemanticIds?: string[];
  hasClipboard?: boolean;
}

export type CapabilityActionResult =
  | { kind: 'command'; command: ModelExplorerCommand }
  | { kind: 'openRelationshipWizard'; sourceNode: ModelTreeNode; relationshipKind?: string; direction?: 'incoming' | 'outgoing' }
  | { kind: 'startRename'; nodeId: string }
  | { kind: 'move'; semanticIds: string[]; targetOwnerId: string }
  | { kind: 'copy'; semanticIds: string[] }
  | { kind: 'paste'; targetOwnerId: string }
  | { kind: 'duplicate'; semanticIds: string[]; targetOwnerId: string }
  | { kind: 'delete'; semanticIds: string[] }
  | { kind: 'addToDiagram'; semanticIds: string[]; diagramId: string }
  | { kind: 'openSpecification'; semanticId: string }
  | { kind: 'reveal'; semanticId: string }
  | { kind: 'unhandled' };

export function capabilityToAction(
  capability: ExplorerCapability,
  node: ModelTreeNode,
  context: CapabilityActionContext
): CapabilityActionResult {
  const selectedIds = context.selectedSemanticIds && context.selectedSemanticIds.length > 0
    ? context.selectedSemanticIds
    : [node.semanticId];

  switch (capability.kind) {
    case 'createElement':
      return {
        kind: 'command',
        command: {
          type: 'createElement',
          ownerId: node.semanticId,
          elementKind: capability.elementKind || 'block',
        },
      };
    case 'createDiagram':
      return {
        kind: 'command',
        command: {
          type: 'createDiagram',
          ownerId: node.semanticId,
          diagramKind: capability.elementKind || 'bdd',
        },
      };
    case 'createRelationship':
      return {
        kind: 'openRelationshipWizard',
        sourceNode: node,
        relationshipKind: capability.relationshipKind,
        direction: capability.direction,
      };
    case 'rename':
      return {
        kind: 'startRename',
        nodeId: node.nodeId,
      };
    case 'move':
      return {
        kind: 'move',
        semanticIds: selectedIds,
        targetOwnerId: node.parentNodeId || 'model',
      };
    case 'copy':
      return {
        kind: 'copy',
        semanticIds: selectedIds,
      };
    case 'paste':
      return {
        kind: 'paste',
        targetOwnerId: node.semanticId,
      };
    case 'duplicate':
      return {
        kind: 'duplicate',
        semanticIds: selectedIds,
        targetOwnerId: node.parentNodeId || 'model',
      };
    case 'delete':
      return {
        kind: 'delete',
        semanticIds: selectedIds,
      };
    case 'addToDiagram':
      return {
        kind: 'addToDiagram',
        semanticIds: selectedIds,
        diagramId: context.activeDiagramId || '',
      };
    case 'openSpecification':
      return {
        kind: 'openSpecification',
        semanticId: node.semanticId,
      };
    case 'reveal':
      return {
        kind: 'reveal',
        semanticId: node.semanticId,
      };
    default:
      return { kind: 'unhandled' };
  }
}

export interface AppModelExplorerProps {
  diagramMode: string;
  states: StateData[];
  layers: Layer[];
  transitions: TransitionData[];
  junctions: JunctionData[];
  diagrams?: StateMachineDiagramData[];
  activeStates?: Record<string, string>;
  currentLayerId?: string;
  blocks: BlockData[];
  parts: PartData[];
  canonicalSysmlRepository?: SysmlRepository;
  selectedIds: string[];
  onSelect: (id: string, multiSelect?: boolean) => void;
  onSelectMultiple?: (ids: string[]) => void;
  onDoubleClick: (id: string) => void;
  onCommitStateMachineSnapshot?: (snapshot: StateMachineExplorerSnapshot, description: string) => void;
  onUpdateStates?: (states: StateData[]) => void;
  onUpdateLayers?: (layers: Layer[]) => void;
  onUpdateTransitions?: (transitions: TransitionData[]) => void;
  onUpdateJunctions?: (junctions: JunctionData[]) => void;
  onExecuteSysmlCommand?: (command: SysmlEditorCommand) => SysmlCommandResult;
  activeDiagramId?: string;
  onAddToDiagram?: (elementIds: string[], diagramId: string) => void;
  onRevealInContainment?: (semanticId: string) => void;
  onOpenSpecification?: (semanticId: string) => void;
  projectId?: string;
  className?: string;
  height?: number;
}

export const AppModelExplorer: React.FC<AppModelExplorerProps> = ({
  diagramMode,
  states,
  layers,
  transitions,
  junctions,
  diagrams,
  currentLayerId = 'root',
  blocks,
  parts,
  canonicalSysmlRepository,
  selectedIds,
  onSelect,
  onSelectMultiple,
  onDoubleClick,
  onCommitStateMachineSnapshot,
  onUpdateStates,
  onUpdateLayers,
  onUpdateTransitions,
  onUpdateJunctions,
  onExecuteSysmlCommand,
  activeDiagramId,
  activeDiagramContext,
  onAddToDiagram,
  onRevealInContainment,
  onOpenSpecification,
  projectId,
  className = '',
  height,
}) => {
  const isStateMachine = diagramMode === 'statemachine';
  const [lastSelectedSemanticId, setLastSelectedSemanticId] = useState<string | null>(null);

  // Impact dialog state
  const [pendingImpact, setPendingImpact] = useState<{
    impact: ExplorerImpact;
    impactHash: string;
    command: ModelExplorerCommand;
  } | null>(null);

  // Relationship wizard state
  const [relationshipWizardState, setRelationshipWizardState] = useState<{
    isOpen: boolean;
    sourceNode: ModelTreeNode;
    relationshipKind?: string;
    direction?: 'incoming' | 'outgoing';
  } | null>(null);

  // Shared clipboard reference
  const clipboardRef = useRef<ExplorerClipboardPayload | null>(null);

  // State Machine adapter
  const smAdapter = useMemo(() => {
    return createStateMachineExplorerAdapter({
      getSnapshot: (): StateMachineExplorerSnapshot => ({
        states,
        layers,
        transitions,
        junctions,
        diagrams: diagrams && diagrams.length > 0 ? diagrams : layers.map(l => ({
          id: l.id,
          name: l.name,
          layerId: l.id,
          ownerId: l.parentStateId || 'root',
          contextRegionId: l.id,
        })),
      }),
      onCommit: (nextSnapshot, description) => {
        if (onCommitStateMachineSnapshot) {
          onCommitStateMachineSnapshot(nextSnapshot, description);
        } else {
          onUpdateStates?.(nextSnapshot.states);
          onUpdateLayers?.(nextSnapshot.layers);
          onUpdateTransitions?.(nextSnapshot.transitions);
          onUpdateJunctions?.(nextSnapshot.junctions);
        }
      },
    });
  }, [
    states,
    layers,
    transitions,
    junctions,
    diagrams,
    onCommitStateMachineSnapshot,
    onUpdateStates,
    onUpdateLayers,
    onUpdateTransitions,
    onUpdateJunctions,
  ]);

  // SysML adapter
  const sysmlAdapter = useMemo(() => {
    let repo = canonicalSysmlRepository;
    if (!repo) {
      repo = createEmptyRepository();
      for (const block of blocks) {
        repo.definitions[block.id] = {
          id: block.id,
          name: block.name,
          namespace: ['model'],
          ownerId: 'model',
          kind: 'block',
          isAbstract: false,
          isLeaf: false,
          properties: [],
          ports: [],
          operations: [],
          constraints: [],
        };
      }
      for (const part of parts) {
        repo.usages[part.id] = {
          id: part.id,
          name: part.name,
          ownerId: part.blockId || 'model',
          kind: 'part',
          typeId: part.typeId || '',
          aggregation: 'composite',
          multiplicity: parseMultiplicity(part.multiplicity || '1'),
        };
      }
    }

    const state: SysmlGatewayState = {
      repository: repo,
      history: createHistory(repo),
      store: fromRepository(repo),
      coordinates: {},
    };

    return createSysmlExplorerAdapter({
      getState: () => state,
      executeCommand: onExecuteSysmlCommand || ((cmd) => executeSysmlCommand(state, cmd)),
    });
  }, [canonicalSysmlRepository, blocks, parts, onExecuteSysmlCommand]);

  const activeAdapter = isStateMachine ? smAdapter : sysmlAdapter;

  // Project tree
  const projection = useMemo(() => {
    const repository = canonicalSysmlRepository ?? createEmptyRepository();
    if (!canonicalSysmlRepository) {
      for (const block of blocks) {
        repository.definitions[block.id] = {
          id: block.id, name: block.name, namespace: ['model'], ownerId: 'model', kind: 'block',
          isAbstract: false, isLeaf: false, properties: [], ports: [], operations: [], constraints: [],
        };
      }
      for (const part of parts) {
        repository.usages[part.id] = {
          id: part.id, name: part.name, ownerId: part.blockId || 'model', kind: 'part', typeId: part.typeId || '',
          aggregation: 'composite', multiplicity: parseMultiplicity(part.multiplicity || '1'),
        };
      }
    }
    return buildUnifiedModelProjection({
      sysml: repository,
      stateMachine: { states, layers, transitions, junctions, diagrams: diagrams ?? [], revision: smAdapter.getRevision() },
      externalModels: [],
      revision: Math.max(smAdapter.getRevision(), sysmlAdapter.getRevision()),
    });
  }, [blocks, canonicalSysmlRepository, diagrams, junctions, layers, parts, smAdapter, states, sysmlAdapter, transitions]);

  const selectedNodeIds = useMemo(() => {
    const set = new Set<string>();
    for (const [nodeId, node] of Object.entries(projection.nodes)) {
      if (selectedIds.includes(node.semanticId) || selectedIds.includes(nodeId)) {
        set.add(nodeId);
      }
    }
    return set;
  }, [projection.nodes, selectedIds]);

  const handleSelectNode = useCallback(
    (node: ModelTreeNode, multiSelect?: boolean, rangeSelect?: boolean) => {
      if (rangeSelect && lastSelectedSemanticId && onSelectMultiple) {
        const visibleRows = projectModelTree({
          nodesById: projection.nodes,
          rootNodeIds: projection.roots,
          expandedNodeIds: new Set(Object.keys(projection.nodes)),
        });
        const range = computeRangeSelection(visibleRows, lastSelectedSemanticId, node.semanticId);
        onSelectMultiple(range);
      } else if (multiSelect && onSelectMultiple) {
        const next = computeToggleSelection(selectedIds, node.semanticId);
        onSelectMultiple(next);
        setLastSelectedSemanticId(node.semanticId);
      } else {
        setLastSelectedSemanticId(node.semanticId);
        onSelect(node.semanticId, multiSelect);
      }
    },
    [lastSelectedSemanticId, onSelectMultiple, onSelect, projection.nodes, projection.roots, selectedIds]
  );

  const handleActivateNode = useCallback(
    (node: ModelTreeNode) => {
      onDoubleClick(node.semanticId);
    },
    [onDoubleClick]
  );

  const handleExecuteCapability = useCallback(
    (capability: ExplorerCapability, node: ModelTreeNode) => {
      if (capability.kind === 'rename') return;

      if (capability.kind === 'openSpecification') {
        if (onOpenSpecification) {
          onOpenSpecification(node.semanticId);
        } else {
          onSelect(node.semanticId);
        }
        return;
      }

      if (capability.kind === 'reveal') {
        if (node.kind === 'diagram') {
          onDoubleClick(node.semanticId);
        } else if (onRevealInContainment) {
          onRevealInContainment(node.semanticId);
        } else {
          onSelect(node.semanticId);
        }
        return;
      }

      if (capability.kind === 'createRelationship') {
        setRelationshipWizardState({
          isOpen: true,
          sourceNode: node,
          relationshipKind: capability.relationshipKind,
          direction: capability.direction,
        });
        return;
      }

      if (capability.kind === 'copy') {
        const selectedSemanticIds = selectedIds.includes(node.semanticId) && selectedIds.length > 0 ? selectedIds : [node.semanticId];
        if (isStateMachine) {
          clipboardRef.current = copyOwnershipForest(
            'stateMachine',
            selectedSemanticIds,
            id => states.find(s => s.id === id) || layers.find(l => l.id === id) || junctions.find(j => j.id === id) || transitions.find(t => t.id === id),
            () => [],
            smAdapter.getRevision()
          );
        } else {
          const repo = canonicalSysmlRepository;
          if (repo) {
            clipboardRef.current = copyOwnershipForest(
              'sysml',
              selectedSemanticIds,
              id => repo.packages[id] || repo.definitions[id] || repo.usages[id] || repo.requirements[id] || repo.verificationCases[id] || repo.diagrams[id],
              () => [],
              sysmlAdapter.getRevision()
            );
          }
        }
        return;
      }

      let cmd: ModelExplorerCommand | null = null;
      if (capability.kind === 'createElement' && capability.elementKind) {
        cmd = {
          type: 'createElement',
          ownerId: node.semanticId,
          elementKind: capability.elementKind,
        };
      } else if (capability.kind === 'createDiagram' && capability.elementKind) {
        cmd = {
          type: 'createDiagram',
          ownerId: node.semanticId,
          diagramKind: capability.elementKind,
        };
      } else if (capability.kind === 'delete') {
        cmd = {
          type: 'delete',
          elementIds: selectedIds.includes(node.semanticId) && selectedIds.length > 0 ? selectedIds : [node.semanticId],
        };
      } else if (capability.kind === 'duplicate') {
        cmd = {
          type: 'duplicate',
          elementIds: selectedIds.includes(node.semanticId) && selectedIds.length > 0 ? selectedIds : [node.semanticId],
          targetOwnerId: node.parentNodeId || (isStateMachine ? 'root' : 'model'),
        };
      } else if (capability.kind === 'paste') {
        if (clipboardRef.current) {
          cmd = {
            type: 'paste',
            payload: clipboardRef.current,
            targetOwnerId: node.semanticId,
            mode: 'copy',
          };
        }
      } else if (capability.kind === 'addToDiagram') {
        const targetDiagramId = activeDiagramId || (diagramMode === 'ibd' ? currentLayerId : diagramMode);
        if (onAddToDiagram) {
          onAddToDiagram(
            selectedIds.includes(node.semanticId) && selectedIds.length > 0 ? selectedIds : [node.semanticId],
            targetDiagramId
          );
          return;
        }
        cmd = {
          type: 'addToDiagram',
          elementIds: selectedIds.includes(node.semanticId) && selectedIds.length > 0 ? selectedIds : [node.semanticId],
          diagramId: targetDiagramId,
        };
      }

      if (!cmd) return;

      const bus = createModelExplorerCommandBus(activeAdapter);
      const preflight = activeAdapter.preflight(cmd);
      const hasImpact = preflight.impact && preflight.impact.invalidated && preflight.impact.invalidated.length > 0;
      if (hasImpact && preflight.impact) {
        setPendingImpact({
          impact: preflight.impact,
          impactHash: hashImpact(preflight.impact),
          command: cmd,
        });
        return;
      }

      bus.dispatch(cmd);
    },
    [
      activeAdapter,
      activeDiagramId,
      canonicalSysmlRepository,
      currentLayerId,
      diagramMode,
      isStateMachine,
      junctions,
      layers,
      onAddToDiagram,
      onDoubleClick,
      onOpenSpecification,
      onRevealInContainment,
      onSelect,
      selectedIds,
      smAdapter,
      states,
      sysmlAdapter,
      transitions,
    ]
  );

  const handleMoveNode = useCallback(
    (draggedNode: ModelTreeNode, targetNode: ModelTreeNode) => {
      const cmd: ModelExplorerCommand = {
        type: 'move',
        elementIds: [draggedNode.semanticId],
        targetOwnerId: targetNode.semanticId,
      };

      const bus = createModelExplorerCommandBus(activeAdapter);
      const preflight = activeAdapter.preflight(cmd);
      const hasImpact = preflight.impact && preflight.impact.invalidated && preflight.impact.invalidated.length > 0;
      if (hasImpact && preflight.impact) {
        setPendingImpact({
          impact: preflight.impact,
          impactHash: hashImpact(preflight.impact),
          command: cmd,
        });
        return;
      }

      bus.dispatch(cmd);
    },
    [activeAdapter]
  );

  const handleConfirmImpact = useCallback(
    (confirmedImpactHash: string) => {
      if (!pendingImpact) return;
      const bus = createModelExplorerCommandBus(activeAdapter);
      bus.confirm(pendingImpact.command, confirmedImpactHash);
      setPendingImpact(null);
    },
    [activeAdapter, pendingImpact]
  );

  return (
    <div className={`app-model-explorer-wrapper flex flex-col h-full w-full ${className}`}>
      <ModelExplorer
        nodesById={projection.nodes}
        rootNodeIds={projection.roots}
        selectedNodeIds={selectedNodeIds}
        activeDiagramContext={activeDiagramContext}
        onSelectNode={handleSelectNode}
        onActivateNode={handleActivateNode}
        getCapabilities={(node) => activeAdapter.capabilities([node.semanticId])}
        onExecuteCapability={handleExecuteCapability}
        onMoveNode={handleMoveNode}
        onRenameCommit={(nodeId, newName) => {
          const node = projection.nodes[nodeId];
          if (!node) return;
          const bus = createModelExplorerCommandBus(activeAdapter);
          bus.dispatch({
            type: 'rename',
            elementId: node.semanticId,
            name: newName,
          });
        }}
        height={height}
        projectId={projectId}
      />

      {pendingImpact && (
        <MoveImpactDialog
          isOpen={true}
          impact={pendingImpact.impact}
          impactHash={pendingImpact.impactHash}
          onConfirm={handleConfirmImpact}
          onCancel={() => setPendingImpact(null)}
        />
      )}

      {relationshipWizardState && relationshipWizardState.isOpen && (
        <RelationshipWizard
          isOpen={true}
          sourceNode={relationshipWizardState.sourceNode}
          targetCandidates={activeAdapter.relationshipTargets(
            relationshipWizardState.sourceNode.semanticId,
            relationshipWizardState.relationshipKind || (isStateMachine ? 'transition' : 'association'),
            relationshipWizardState.direction || 'outgoing'
          )}
          allowedRelationshipKinds={
            relationshipWizardState.relationshipKind
              ? [relationshipWizardState.relationshipKind]
              : isStateMachine
              ? ['transition']
              : ['association', 'composition', 'sharedAggregation', 'generalization', 'dependency', 'satisfy', 'verify', 'refine', 'trace']
          }
          onClose={() => setRelationshipWizardState(null)}
          onCreateRelationship={(kind, targetSemanticId) => {
            const isIncoming = relationshipWizardState.direction === 'incoming';
            const sourceId = isIncoming ? targetSemanticId : relationshipWizardState.sourceNode.semanticId;
            const targetId = isIncoming ? relationshipWizardState.sourceNode.semanticId : targetSemanticId;
            const cmd: ModelExplorerCommand = {
              type: 'createRelationship',
              relationshipKind: kind,
              sourceId,
              targetId,
            };
            const bus = createModelExplorerCommandBus(activeAdapter);
            bus.dispatch(cmd);
            setRelationshipWizardState(null);
          }}
        />
      )}
    </div>
  );
};
