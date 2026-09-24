import React, { useMemo, useState, useCallback } from 'react';
import type {
  ModelTreeNode,
  ModelExplorerCommand,
  ExplorerCapability,
  ExplorerImpact,
} from '../../features/modelExplorer/modelExplorerTypes';
import { hashImpact } from '../../features/modelExplorer/modelExplorerTypes';
import { ModelExplorer } from './ModelExplorer';
import { MoveImpactDialog } from './MoveImpactDialog';
import {
  createStateMachineExplorerAdapter,
  type StateMachineExplorerSnapshot,
} from '../../features/modelExplorer/adapters/stateMachineExplorerAdapter';
import { createSysmlExplorerAdapter } from '../../features/modelExplorer/adapters/sysmlExplorerAdapter';
import type { StateData, Layer, TransitionData, JunctionData } from '../../types/sm_types';
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

export interface AppModelExplorerProps {
  diagramMode: string;
  states: StateData[];
  layers: Layer[];
  transitions: TransitionData[];
  junctions: JunctionData[];
  activeStates?: Record<string, string>;
  currentLayerId?: string;
  blocks: BlockData[];
  parts: PartData[];
  canonicalSysmlRepository?: SysmlRepository;
  selectedIds: string[];
  onSelect: (id: string, multiSelect?: boolean) => void;
  onSelectMultiple?: (ids: string[]) => void;
  onDoubleClick: (id: string) => void;
  onUpdateStates?: (states: StateData[]) => void;
  onUpdateLayers?: (layers: Layer[]) => void;
  onUpdateTransitions?: (transitions: TransitionData[]) => void;
  onUpdateJunctions?: (junctions: JunctionData[]) => void;
  onExecuteSysmlCommand?: (command: SysmlEditorCommand) => SysmlCommandResult;
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
  currentLayerId = 'root',
  blocks,
  parts,
  canonicalSysmlRepository,
  selectedIds,
  onSelect,
  onSelectMultiple,
  onDoubleClick,
  onUpdateStates,
  onUpdateLayers,
  onUpdateTransitions,
  onUpdateJunctions,
  onExecuteSysmlCommand,
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

  // State Machine adapter
  const smAdapter = useMemo(() => {
    return createStateMachineExplorerAdapter({
      getSnapshot: (): StateMachineExplorerSnapshot => ({
        states,
        layers,
        transitions,
        junctions,
        diagrams: layers.map(l => ({
          id: l.id,
          name: l.name,
          layerId: l.id,
          ownerId: l.parentStateId || 'root',
          contextRegionId: l.id,
        })),
      }),
      onCommit: (nextSnapshot) => {
        onUpdateStates?.(nextSnapshot.states);
        onUpdateLayers?.(nextSnapshot.layers);
        onUpdateTransitions?.(nextSnapshot.transitions);
        onUpdateJunctions?.(nextSnapshot.junctions);
      },
    });
  }, [
    states,
    layers,
    transitions,
    junctions,
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
    return activeAdapter.project('containment');
  }, [activeAdapter]);

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
          elementIds: [node.semanticId],
        };
      } else if (capability.kind === 'duplicate') {
        cmd = {
          type: 'duplicate',
          elementIds: [node.semanticId],
          targetOwnerId: node.parentNodeId || 'model',
        };
      }

      if (!cmd) return;

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

      if (preflight.committed) {
        activeAdapter.execute(cmd);
      }
    },
    [activeAdapter]
  );

  const handleMoveNode = useCallback(
    (draggedNode: ModelTreeNode, targetNode: ModelTreeNode) => {
      const cmd: ModelExplorerCommand = {
        type: 'move',
        elementIds: [draggedNode.semanticId],
        targetOwnerId: targetNode.semanticId,
      };

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

      if (preflight.committed) {
        activeAdapter.execute(cmd);
      }
    },
    [activeAdapter]
  );

  const handleConfirmImpact = useCallback(
    (confirmedImpactHash: string) => {
      if (!pendingImpact) return;
      if (pendingImpact.command.type === 'move') {
        activeAdapter.execute({
          ...pendingImpact.command,
          confirmedImpactHash,
        });
      } else {
        activeAdapter.execute(pendingImpact.command);
      }
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
        onSelectNode={handleSelectNode}
        onActivateNode={handleActivateNode}
        getCapabilities={(node) => activeAdapter.capabilities([node.semanticId])}
        onExecuteCapability={handleExecuteCapability}
        onMoveNode={handleMoveNode}
        onRenameCommit={(nodeId, newName) => {
          const node = projection.nodes[nodeId];
          if (!node) return;
          activeAdapter.execute({
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
    </div>
  );
};
