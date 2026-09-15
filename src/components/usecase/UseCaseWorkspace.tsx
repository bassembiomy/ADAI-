import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';

import { UseCaseNodeComponent, ActorNodeComponent, BoundaryNodeComponent } from './UseCaseNodes';
import { UseCaseEdgeComponent, UseCaseEdgeData } from './UseCaseEdges';
import { UseCaseInspector } from './UseCaseInspector';
import { UseCaseToolbar } from './UseCaseToolbar';
import type { SysmlRepository } from '../../engine/sysml/model';
import type { SysmlEditorCommand, PresentationCoordinates } from '../../services/sysmlCommandGateway';
import { projectUseCaseDiagram, buildPresentationPatch } from './useCaseProjection';
import { evaluateSysmlConnection, type ConnectionEndpoint, type ConnectionPolicyDiagnostic } from '../../engine/sysml/connectionPolicy';
import { SysmlConnectionErrorDetails } from '../sysml/SysmlConnectionErrorDetails';
import {
  UseCaseDiagram,
  UseCaseNode,
  UseCaseRelationship,
  UseCaseRelationshipType,
  UseCaseNodeType,
} from '../../types/usecase_types';
import { serializeUseCaseDiagram, toUseCaseRelationships } from '../../utils/useCasePersistence';

export interface UseCaseWorkspaceProps {
  diagram?: UseCaseDiagram;
  repository?: SysmlRepository;
  activeDiagramId?: string;
  coordinates?: Record<string, PresentationCoordinates>;
  diagramPresentations?: Record<string, { elementIds: string[] }>;
  onExecuteCommand?: (command: SysmlEditorCommand) => void;
  sysmlBlocks?: any[];
  availableDiagrams?: readonly { id: string; name: string; type?: string }[];
  onSelectDiagram?: (diagramId: string) => void;
  onNavigateToElement?: (elementId: string, diagramKind?: string) => void;
  onNavigateToDiagram?: (diagramId: string) => void;
  onChange?: (diagram: UseCaseDiagram) => void;
  onSave?: () => void;
}

const nodeTypes: any = {
  useCase: UseCaseNodeComponent,
  actor: ActorNodeComponent,
  systemBoundary: BoundaryNodeComponent,
};

const edgeTypes: any = {
  useCaseEdge: UseCaseEdgeComponent,
};

export const UseCaseWorkspace: React.FC<UseCaseWorkspaceProps> = ({
  diagram: inputDiagram,
  repository,
  activeDiagramId,
  coordinates,
  diagramPresentations,
  onExecuteCommand,
  sysmlBlocks = [],
  availableDiagrams,
  onSelectDiagram,
  onNavigateToElement,
  onNavigateToDiagram,
  onChange,
  onSave,
}) => {
  const effectiveDiagram = useMemo(() => {
    if (repository) {
      const proj = projectUseCaseDiagram(repository, {
        coordinates,
        diagramPresentations,
        activeDiagramId,
      });
      return {
        id: activeDiagramId || inputDiagram?.id || 'default_usecase',
        name: inputDiagram?.name || 'Main SysML Use Cases',
        nodes: proj.nodes,
        edges: proj.edges,
      };
    }
    return inputDiagram || { id: activeDiagramId || 'default_usecase', name: 'Main SysML Use Cases', nodes: [], edges: [] };
  }, [repository, coordinates, diagramPresentations, activeDiagramId, inputDiagram]);

  const [nodes, setNodes, onNodesChange] = useNodesState(effectiveDiagram.nodes || []);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<any, any> | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; top: number; left: number } | null>(null);
  const [connectionError, setConnectionError] = useState<{
    relationshipKind: string;
    source: ConnectionEndpoint;
    target: ConnectionEndpoint;
    diagnostic: ConnectionPolicyDiagnostic;
  } | null>(null);

  // Keep references to latest state & callbacks
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const diagramRef = useRef(effectiveDiagram);
  diagramRef.current = effectiveDiagram;

  // Undo / Redo history stacks
  const historyRef = useRef<{ nodes: UseCaseNode[]; edges: UseCaseRelationship[] }[]>([]);
  const futureRef = useRef<{ nodes: UseCaseNode[]; edges: UseCaseRelationship[] }[]>([]);
  // Clipboard
  const clipboardRef = useRef<{ nodes: UseCaseNode[]; edges: UseCaseRelationship[] } | null>(null);

  const notifyChange = useCallback((currentNodes: UseCaseNode[], currentEdges: any[]) => {
    if (!onChangeRef.current) return;
    const serialized = serializeUseCaseDiagram(diagramRef.current, currentNodes, currentEdges);
    onChangeRef.current(serialized);
  }, []);

  const handleEdgeTypeChange = useCallback(
    (edgeId: string, newType: UseCaseRelationshipType) => {
      saveHistory();
      setEdges((eds: any[]) => {
        const next = eds.map((ed) => {
          if (ed.id === edgeId) {
            return {
              ...ed,
              data: { ...(ed.data as UseCaseEdgeData), type: newType },
            };
          }
          return ed;
        });
        notifyChange(nodesRef.current, next);
        return next;
      });
    },
    [notifyChange]
  );

  const handleEdgeDelete = useCallback(
    (edgeId: string) => {
      saveHistory();
      setEdges((eds) => {
        const next = eds.filter((ed) => ed.id !== edgeId);
        notifyChange(nodesRef.current, next);
        return next;
      });
    },
    [notifyChange]
  );

  const [edges, setEdges, onEdgesChange] = useEdgesState<any>(
    (effectiveDiagram.edges || []).map((rel) => ({
      id: rel.id,
      source: rel.source,
      target: rel.target,
      type: 'useCaseEdge',
      data: {
        type: rel.type,
        onTypeChange: handleEdgeTypeChange,
        onDelete: handleEdgeDelete,
      },
    }))
  );

  const edgesRef = useRef(edges);
  edgesRef.current = edges;

  const saveHistory = useCallback(() => {
    historyRef.current.push({
      nodes: JSON.parse(JSON.stringify(nodesRef.current)),
      edges: toUseCaseRelationships(edgesRef.current),
    });
    futureRef.current = [];
  }, []);

  // Sync state if effective diagram content changes
  const lastEffectiveDiagramRef = useRef(effectiveDiagram);
  useEffect(() => {
    if (lastEffectiveDiagramRef.current !== effectiveDiagram) {
      lastEffectiveDiagramRef.current = effectiveDiagram;
      setNodes(effectiveDiagram.nodes || []);
      setEdges(
        (effectiveDiagram.edges || []).map((rel) => ({
          id: rel.id,
          source: rel.source,
          target: rel.target,
          type: 'useCaseEdge',
          data: {
            type: rel.type,
            onTypeChange: handleEdgeTypeChange,
            onDelete: handleEdgeDelete,
          },
        }))
      );
    }
  }, [effectiveDiagram, setNodes, setEdges, handleEdgeTypeChange, handleEdgeDelete]);

  // Debounced auto-sync to parent to ensure diagram changes (e.g., node moves, ReactFlow internal edits) are never lost
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    const timer = setTimeout(() => {
      notifyChange(nodes, edges);
    }, 100);
    return () => clearTimeout(timer);
  }, [nodes, edges, notifyChange]);

  // Synchronously flush latest diagram state to parent when component unmounts (e.g. user clicks another diagram mode or tab)
  useEffect(() => {
    return () => {
      if (onChangeRef.current) {
        const latest = serializeUseCaseDiagram(diagramRef.current, nodesRef.current, edgesRef.current);
        onChangeRef.current(latest);
      }
    };
  }, []);

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const sourceNode = nodesRef.current.find((n) => n.id === connection.source);
      const targetNode = nodesRef.current.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return;

      const sourceFamily = sourceNode.type === 'actor' ? 'actor' as const : sourceNode.type === 'useCase' ? 'useCase' as const : 'subject' as const;
      const targetFamily = targetNode.type === 'actor' ? 'actor' as const : targetNode.type === 'useCase' ? 'useCase' as const : 'subject' as const;

      const sourceEndpoint: ConnectionEndpoint = {
        id: sourceNode.id,
        name: sourceNode.data?.label || sourceNode.id,
        family: sourceFamily,
      };
      const targetEndpoint: ConnectionEndpoint = {
        id: targetNode.id,
        name: targetNode.data?.label || targetNode.id,
        family: targetFamily,
      };

      let relKind = 'useCaseAssociation';
      if (sourceFamily === 'useCase' && targetFamily === 'useCase') {
        relKind = 'include';
      } else if (sourceFamily === 'actor' && targetFamily === 'actor') {
        relKind = 'useCaseGeneralization';
      }

      const decision = evaluateSysmlConnection({
        relationshipKind: relKind,
        source: sourceEndpoint,
        target: targetEndpoint,
        diagram: 'useCase',
      });

      if (!decision.allowed) {
        setConnectionError({
          relationshipKind: relKind,
          source: sourceEndpoint,
          target: targetEndpoint,
          diagnostic: decision.diagnostics[0],
        });
        return;
      }

      setConnectionError(null);
      if (onExecuteCommand) {
        onExecuteCommand({
          type: 'createElement',
          element: {
            id: `rel-${uuidv4().slice(0, 8)}`,
            kind: relKind as any,
            sourceId: sourceNode.id,
            targetId: targetNode.id,
          },
        });
      } else {
        saveHistory();
        const newEdge = {
          ...connection,
          id: `edge-${uuidv4()}`,
          type: 'useCaseEdge',
          data: {
            type: relKind === 'useCaseAssociation' ? 'association' : relKind,
            onTypeChange: handleEdgeTypeChange,
            onDelete: handleEdgeDelete,
          },
        };
        setEdges((eds) => {
          const next = addEdge(newEdge, eds);
          notifyChange(nodesRef.current, next);
          return next;
        });
      }
    },
    [setEdges, handleEdgeTypeChange, handleEdgeDelete, saveHistory, notifyChange, onExecuteCommand]
  );

  const handleUpdateNodeData = useCallback(
    (nodeId: string, data: any) => {
      saveHistory();
      setNodes((nds) => {
        const next = nds.map((n) => (n.id === nodeId ? { ...n, data } : n));
        notifyChange(next, edgesRef.current);
        return next;
      });
    },
    [setNodes, saveHistory, notifyChange]
  );

  const handleAddNode = useCallback(
    (type: UseCaseNodeType, pos?: { x: number; y: number }) => {
      const position = pos || (reactFlowInstance ? reactFlowInstance.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }) : { x: 250, y: 150 });

      if (onExecuteCommand) {
        if (type === 'actor') {
          const id = `act-${uuidv4().slice(0, 8)}`;
          onExecuteCommand({
            type: 'createElement',
            element: {
              id,
              name: 'New Actor',
              kind: 'actor',
              namespace: [],
              isExternal: false,
              generalizationIds: [],
            },
            presentation: { x: position.x, y: position.y },
          });
          setSelectedNodeId(id);
        } else if (type === 'useCase') {
          const id = `uc-${uuidv4().slice(0, 8)}`;
          onExecuteCommand({
            type: 'createElement',
            element: {
              id,
              name: 'New Use Case',
              kind: 'useCase',
              namespace: [],
              extensionPointIds: [],
              behaviorArtifactIds: [],
            },
            presentation: { x: position.x, y: position.y },
          });
          setSelectedNodeId(id);
        } else if (type === 'systemBoundary') {
          const id = `sub-${uuidv4().slice(0, 8)}`;
          onExecuteCommand({
            type: 'createElement',
            element: {
              id,
              name: 'System Boundary',
              kind: 'subject',
              namespace: [],
            },
            presentation: { x: position.x, y: position.y, width: 400, height: 350 },
          });
          setSelectedNodeId(id);
        }
        setMenu(null);
        return;
      }

      saveHistory();
      const defaultLabels: Record<UseCaseNodeType, string> = {
        useCase: 'New Use Case',
        actor: 'New Actor',
        systemBoundary: 'System Boundary',
      };
      const newNode: UseCaseNode = {
        id: `node-${uuidv4().slice(0, 8)}`,
        type,
        position,
        data: { label: defaultLabels[type] },
      };
      setNodes((nds) => {
        const next = nds.concat(newNode as any);
        notifyChange(next, edgesRef.current);
        return next;
      });
      setSelectedNodeId(newNode.id);
      setMenu(null);
    },
    [reactFlowInstance, saveHistory, setNodes, notifyChange, onExecuteCommand]
  );

  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: any) => {
      if (onExecuteCommand && node) {
        onExecuteCommand(
          buildPresentationPatch(node.id, {
            x: node.position.x,
            y: node.position.y,
            width: node.width,
            height: node.height,
          })
        );
      }
      notifyChange(nodesRef.current, edgesRef.current);
    },
    [onExecuteCommand, notifyChange]
  );

  const handleAutoLayout = useCallback(() => {
    saveHistory();
    // Layout: Actors on left column, UseCases in middle/right column
    let actorY = 80;
    let useCaseY = 80;
    setNodes((nds) => {
      const next = nds.map((node) => {
        if (node.type === 'actor') {
          const pos = { x: 80, y: actorY };
          actorY += 140;
          return { ...node, position: pos };
        } else if (node.type === 'useCase') {
          const pos = { x: 380, y: useCaseY };
          useCaseY += 120;
          return { ...node, position: pos };
        } else if (node.type === 'systemBoundary') {
          return { ...node, position: { x: 300, y: 40 }, width: 380, height: Math.max(300, useCaseY + 60) };
        }
        return node;
      });
      notifyChange(next, edgesRef.current);
      return next;
    });
    if (reactFlowInstance) {
      setTimeout(() => reactFlowInstance.fitView({ padding: 0.2 }), 50);
    }
  }, [reactFlowInstance, saveHistory, setNodes, notifyChange]);

  // Global Keyboard Shortcuts (Ctrl+S, Ctrl+Z, Ctrl+Y, Ctrl+C, Ctrl+V, Ctrl+X, Ctrl+A, Del, Ctrl+0)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInput = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      );

      // Escape: clear selection
      if (e.key === 'Escape') {
        setSelectedNodeId(null);
        setMenu(null);
        setNodes((nds) => nds.map((n) => ({ ...n, selected: false })));
        setEdges((eds) => eds.map((ed) => ({ ...ed, selected: false })));
        return;
      }

      if (isInput) return;
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // 1. Save: Ctrl+S
      if (isCtrlOrCmd && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        notifyChange(nodesRef.current, edgesRef.current);
        onSave?.();
        return;
      }

      // 2. Undo: Ctrl+Z
      if (isCtrlOrCmd && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        const prev = historyRef.current.pop();
        if (prev) {
          futureRef.current.push({
            nodes: JSON.parse(JSON.stringify(nodesRef.current)),
            edges: toUseCaseRelationships(edgesRef.current),
          });
          setNodes(prev.nodes as any);
          setEdges(
            prev.edges.map((rel) => ({
              id: rel.id,
              source: rel.source,
              target: rel.target,
              type: 'useCaseEdge',
              data: {
                type: rel.type,
                onTypeChange: handleEdgeTypeChange,
                onDelete: handleEdgeDelete,
              },
            }))
          );
          notifyChange(prev.nodes, prev.edges);
        }
        return;
      }

      // 3. Redo: Ctrl+Y or Ctrl+Shift+Z
      if ((isCtrlOrCmd && (e.key === 'y' || e.key === 'Y')) || (isCtrlOrCmd && (e.key === 'z' || e.key === 'Z') && e.shiftKey)) {
        e.preventDefault();
        const next = futureRef.current.pop();
        if (next) {
          historyRef.current.push({
            nodes: JSON.parse(JSON.stringify(nodesRef.current)),
            edges: toUseCaseRelationships(edgesRef.current),
          });
          setNodes(next.nodes as any);
          setEdges(
            next.edges.map((rel) => ({
              id: rel.id,
              source: rel.source,
              target: rel.target,
              type: 'useCaseEdge',
              data: {
                type: rel.type,
                onTypeChange: handleEdgeTypeChange,
                onDelete: handleEdgeDelete,
              },
            }))
          );
          notifyChange(next.nodes, next.edges);
        }
        return;
      }

      // 4. Select All: Ctrl+A
      if (isCtrlOrCmd && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        setNodes((nds) => nds.map((n) => ({ ...n, selected: true })));
        setEdges((eds) => eds.map((ed) => ({ ...ed, selected: true })));
        return;
      }

      // 5. Copy: Ctrl+C
      if (isCtrlOrCmd && (e.key === 'c' || e.key === 'C')) {
        const selectedNodes = nodes.filter((n) => n.selected || n.id === selectedNodeId);
        if (selectedNodes.length > 0) {
          e.preventDefault();
          const ids = new Set(selectedNodes.map((n) => n.id));
          const selectedEdges = edges.filter((ed) => ids.has(ed.source) && ids.has(ed.target));
          clipboardRef.current = {
            nodes: JSON.parse(JSON.stringify(selectedNodes)) as any,
            edges: JSON.parse(JSON.stringify(selectedEdges)) as any,
          };
        }
        return;
      }

      // 6. Paste: Ctrl+V
      if (isCtrlOrCmd && (e.key === 'v' || e.key === 'V')) {
        if (clipboardRef.current && clipboardRef.current.nodes.length > 0) {
          e.preventDefault();
          saveHistory();
          const idMap = new Map<string, string>();
          clipboardRef.current.nodes.forEach((n) => idMap.set(n.id, `node-${uuidv4().slice(0, 8)}`));

          const pastedNodes = clipboardRef.current.nodes.map((n) => ({
            ...n,
            id: idMap.get(n.id)!,
            position: { x: n.position.x + 35, y: n.position.y + 35 },
            selected: true,
          }));

          setNodes((nds) => {
            const next = [...nds.map((n) => ({ ...n, selected: false })), ...(pastedNodes as any)];
            notifyChange(next, edgesRef.current);
            return next;
          });
          if (pastedNodes.length > 0) {
            setSelectedNodeId(pastedNodes[0].id);
          }
        }
        return;
      }

      // 7. Cut: Ctrl+X
      if (isCtrlOrCmd && (e.key === 'x' || e.key === 'X')) {
        const selectedNodes = nodes.filter((n) => n.selected || n.id === selectedNodeId);
        if (selectedNodes.length > 0) {
          e.preventDefault();
          saveHistory();
          const ids = new Set(selectedNodes.map((n) => n.id));
          clipboardRef.current = {
            nodes: JSON.parse(JSON.stringify(selectedNodes)) as any,
            edges: JSON.parse(JSON.stringify(edges.filter((ed) => ids.has(ed.source) && ids.has(ed.target)))) as any,
          };
          setNodes((nds) => {
            const next = nds.filter((n) => !ids.has(n.id));
            notifyChange(next, edgesRef.current);
            return next;
          });
          setEdges((eds) => {
            const next = eds.filter((ed) => !ids.has(ed.source) && !ids.has(ed.target));
            notifyChange(nodesRef.current, next);
            return next;
          });
          setSelectedNodeId(null);
        }
        return;
      }

      // 8. Delete / Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        saveHistory();
        const selectedNodes = nodes.filter((n) => n.selected || n.id === selectedNodeId);
        const selectedEdges = edges.filter((ed: any) => ed.selected);
        const nodeIdsToDelete = new Set(selectedNodes.map((n) => n.id));
        const edgeIdsToDelete = new Set(selectedEdges.map((e: any) => e.id));

        if (nodeIdsToDelete.size > 0 || edgeIdsToDelete.size > 0) {
          setNodes((nds) => {
            const next = nds.filter((n) => !nodeIdsToDelete.has(n.id));
            notifyChange(next, edgesRef.current);
            return next;
          });
          setEdges((eds) => {
            const next = eds.filter((ed) => !edgeIdsToDelete.has(ed.id) && !nodeIdsToDelete.has(ed.source) && !nodeIdsToDelete.has(ed.target));
            notifyChange(nodesRef.current, next);
            return next;
          });
          setSelectedNodeId(null);
        }
        return;
      }

      // 9. Fit view: Ctrl+0 or Space+F
      if ((isCtrlOrCmd && e.key === '0') || (e.code === 'KeyF' && e.shiftKey)) {
        e.preventDefault();
        reactFlowInstance?.fitView({ padding: 0.2 });
        return;
      }

      // 10. Arrow key nudging
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        const delta = e.shiftKey ? 10 : 1;
        const dx = e.key === 'ArrowLeft' ? -delta : e.key === 'ArrowRight' ? delta : 0;
        const dy = e.key === 'ArrowUp' ? -delta : e.key === 'ArrowDown' ? delta : 0;
        setNodes((nds) => {
          const next = nds.map((n) => {
            if (n.selected || n.id === selectedNodeId) {
              return { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } };
            }
            return n;
          });
          notifyChange(next, edgesRef.current);
          return next;
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [nodes, edges, selectedNodeId, reactFlowInstance, onSave, saveHistory, setNodes, setEdges, notifyChange, handleEdgeTypeChange, handleEdgeDelete]);

  // Context Menu
  const onPaneContextMenu = useCallback(
    (event: any) => {
      event.preventDefault();
      if (!reactFlowInstance) return;
      const flowPos = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setMenu({ x: flowPos.x, y: flowPos.y, top: event.clientY, left: event.clientX });
    },
    [reactFlowInstance]
  );

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return (nodes.find((n) => n.id === selectedNodeId) as unknown as UseCaseNode) || null;
  }, [selectedNodeId, nodes]);

  return (
    <div className="w-full h-full flex bg-[#121212] relative overflow-hidden">
      {/* Floating Canvas Toolbar */}
      <UseCaseToolbar
        diagramName={effectiveDiagram.name}
        availableDiagrams={availableDiagrams}
        activeDiagramId={activeDiagramId}
        onSelectDiagram={onSelectDiagram}
        onAddActor={() => handleAddNode('actor')}
        onAddUseCase={() => handleAddNode('useCase')}
        onAddBoundary={() => handleAddNode('systemBoundary')}
        onAutoLayout={handleAutoLayout}
        onFitView={() => reactFlowInstance?.fitView({ padding: 0.2 })}
        onSave={() => onSave?.()}
      />

      <div className="flex-1 relative">
        {connectionError && (
          <div
            data-testid="sysml-connection-error-modal"
            className="absolute top-4 left-1/2 -translate-x-1/2 z-50 max-w-lg w-full bg-red-950/95 border-2 border-red-500 rounded-lg p-4 shadow-2xl backdrop-blur-md text-red-100"
          >
            <div className="flex items-center justify-between border-b border-red-800 pb-2">
              <span className="font-bold text-red-200">Invalid SysML Connection</span>
              <button
                onClick={() => setConnectionError(null)}
                className="text-red-300 hover:text-white text-xs px-2 py-1 rounded bg-red-900/60 hover:bg-red-800"
              >
                Dismiss
              </button>
            </div>
            <SysmlConnectionErrorDetails
              relationshipKind={connectionError.relationshipKind}
              source={connectionError.source}
              target={connectionError.target}
              diagnostic={connectionError.diagnostic}
            />
          </div>
        )}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onInit={setReactFlowInstance}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDragStop={handleNodeDragStop as any}
          onPaneContextMenu={onPaneContextMenu}
          onPaneClick={() => setMenu(null)}
          onSelectionChange={(params) => {
            if (params.nodes.length > 0) {
              setSelectedNodeId(params.nodes[0].id);
            } else {
              setSelectedNodeId(null);
            }
          }}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
        >
          <Background color="#333" gap={16} />
          <Controls className="bg-[#1f2937] border-[#374151] fill-white" />
          <MiniMap
            nodeColor={(n) => {
              if (n.type === 'useCase') return '#38bdf8';
              if (n.type === 'actor') return '#f59e0b';
              return '#374151';
            }}
            maskColor="rgba(0,0,0,0.5)"
            className="bg-[#1f2937] border-[#374151]"
          />
        </ReactFlow>
      </div>

      {/* 3-Tab SysML Inspector */}
      {selectedNodeId && (
        <UseCaseInspector
          selectedNode={selectedNode}
          sysmlBlocks={sysmlBlocks}
          repository={repository}
          availableDiagrams={availableDiagrams as any}
          onUpdateNodeData={handleUpdateNodeData}
          onNavigateToElement={onNavigateToElement}
          onNavigateToDiagram={onNavigateToDiagram}
          onClose={() => setSelectedNodeId(null)}
        />
      )}

      {/* Right-Click Context Menu */}
      {menu && (
        <div
          className="absolute z-50 bg-[#252526] border border-[#404040] rounded-lg shadow-2xl py-1 w-48 text-xs text-zinc-200"
          style={{ top: menu.top, left: menu.left }}
        >
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-[#2a2d2e] hover:text-amber-400 flex items-center justify-between"
            onClick={() => handleAddNode('useCase', { x: menu.x, y: menu.y })}
          >
            <span>Add Use Case</span>
            <span className="text-[10px] text-zinc-500 font-mono">«usecase»</span>
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-[#2a2d2e] hover:text-amber-400 flex items-center justify-between"
            onClick={() => handleAddNode('actor', { x: menu.x, y: menu.y })}
          >
            <span>Add Actor</span>
            <span className="text-[10px] text-zinc-500 font-mono">«actor»</span>
          </button>
          <button
            className="w-full text-left px-3 py-1.5 hover:bg-[#2a2d2e] hover:text-amber-400 flex items-center justify-between"
            onClick={() => handleAddNode('systemBoundary', { x: menu.x, y: menu.y })}
          >
            <span>Add Subject Boundary</span>
            <span className="text-[10px] text-zinc-500 font-mono">«subject»</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default UseCaseWorkspace;
