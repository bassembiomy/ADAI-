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
  Edge,
  Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { v4 as uuidv4 } from 'uuid';

import { UseCaseNodeComponent, ActorNodeComponent, BoundaryNodeComponent } from './UseCaseNodes';
import { UseCaseEdgeComponent, UseCaseEdgeData } from './UseCaseEdges';
import { UseCaseInspector } from './UseCaseInspector';
import { UseCaseToolbar } from './UseCaseToolbar';
import {
  UseCaseDiagram,
  UseCaseNode,
  UseCaseRelationship,
  UseCaseRelationshipType,
  UseCaseNodeType,
} from '../../types/usecase_types';

interface UseCaseWorkspaceProps {
  diagram: UseCaseDiagram;
  sysmlBlocks?: any[];
  onChange?: (diagram: UseCaseDiagram) => void;
  onSave?: () => void;
}

const nodeTypes = {
  useCase: UseCaseNodeComponent,
  actor: ActorNodeComponent,
  systemBoundary: BoundaryNodeComponent,
};

const edgeTypes = {
  useCaseEdge: UseCaseEdgeComponent,
};

export const UseCaseWorkspace: React.FC<UseCaseWorkspaceProps> = ({
  diagram,
  sysmlBlocks = [],
  onChange,
  onSave,
}) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(diagram.nodes);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance<any, any> | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; top: number; left: number } | null>(null);

  // Undo / Redo history stacks
  const historyRef = useRef<{ nodes: UseCaseNode[]; edges: UseCaseRelationship[] }[]>([]);
  const futureRef = useRef<{ nodes: UseCaseNode[]; edges: UseCaseRelationship[] }[]>([]);
  // Clipboard
  const clipboardRef = useRef<{ nodes: UseCaseNode[]; edges: UseCaseRelationship[] } | null>(null);

  const saveHistory = useCallback(() => {
    historyRef.current.push({
      nodes: JSON.parse(JSON.stringify(nodes)),
      edges: JSON.parse(JSON.stringify(diagram.edges)),
    });
    futureRef.current = [];
  }, [nodes, diagram.edges]);

  const handleEdgeTypeChange = useCallback(
    (edgeId: string, newType: UseCaseRelationshipType) => {
      saveHistory();
      setEdges((eds) =>
        eds.map((ed) => {
          if (ed.id === edgeId) {
            return {
              ...ed,
              data: { ...(ed.data as UseCaseEdgeData), type: newType },
            };
          }
          return ed;
        })
      );
    },
    [saveHistory]
  );

  const handleEdgeDelete = useCallback(
    (edgeId: string) => {
      saveHistory();
      setEdges((eds) => eds.filter((ed) => ed.id !== edgeId));
    },
    [saveHistory]
  );

  const [edges, setEdges, onEdgesChange] = useEdgesState(
    diagram.edges.map((rel) => ({
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

  const onConnect = useCallback(
    (connection: Connection) => {
      saveHistory();
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            id: `edge-${uuidv4()}`,
            type: 'useCaseEdge',
            data: {
              type: 'association',
              onTypeChange: handleEdgeTypeChange,
              onDelete: handleEdgeDelete,
            },
          },
          eds
        )
      );
    },
    [setEdges, handleEdgeTypeChange, handleEdgeDelete, saveHistory]
  );

  const handleUpdateNodeData = useCallback(
    (nodeId: string, data: any) => {
      saveHistory();
      setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data } : n)));
    },
    [setNodes, saveHistory]
  );

  const handleAddNode = useCallback(
    (type: UseCaseNodeType, pos?: { x: number; y: number }) => {
      saveHistory();
      const position = pos || (reactFlowInstance ? reactFlowInstance.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }) : { x: 250, y: 150 });
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
      setNodes((nds) => nds.concat(newNode as any));
      setSelectedNodeId(newNode.id);
      setMenu(null);
    },
    [reactFlowInstance, saveHistory, setNodes]
  );

  const handleAutoLayout = useCallback(() => {
    saveHistory();
    // Layout: Actors on left column, UseCases in middle/right column
    let actorY = 80;
    let useCaseY = 80;
    setNodes((nds) =>
      nds.map((node) => {
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
      })
    );
    if (reactFlowInstance) {
      setTimeout(() => reactFlowInstance.fitView({ padding: 0.2 }), 50);
    }
  }, [reactFlowInstance, saveHistory, setNodes]);

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
        onSave?.();
        return;
      }

      // 2. Undo: Ctrl+Z
      if (isCtrlOrCmd && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        const prev = historyRef.current.pop();
        if (prev) {
          futureRef.current.push({
            nodes: JSON.parse(JSON.stringify(nodes)),
            edges: JSON.parse(JSON.stringify(edges)),
          });
          setNodes(prev.nodes as any);
        }
        return;
      }

      // 3. Redo: Ctrl+Y or Ctrl+Shift+Z
      if ((isCtrlOrCmd && (e.key === 'y' || e.key === 'Y')) || (isCtrlOrCmd && (e.key === 'z' || e.key === 'Z') && e.shiftKey)) {
        e.preventDefault();
        const next = futureRef.current.pop();
        if (next) {
          historyRef.current.push({
            nodes: JSON.parse(JSON.stringify(nodes)),
            edges: JSON.parse(JSON.stringify(edges)),
          });
          setNodes(next.nodes as any);
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

          setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), ...(pastedNodes as any)]);
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
          setNodes((nds) => nds.filter((n) => !ids.has(n.id)));
          setEdges((eds) => eds.filter((ed) => !ids.has(ed.source) && !ids.has(ed.target)));
          setSelectedNodeId(null);
        }
        return;
      }

      // 8. Delete / Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        saveHistory();
        const selectedNodes = nodes.filter((n) => n.selected || n.id === selectedNodeId);
        const selectedEdges = edges.filter((ed) => ed.selected);
        const nodeIdsToDelete = new Set(selectedNodes.map((n) => n.id));
        const edgeIdsToDelete = new Set(selectedEdges.map((e) => e.id));

        if (nodeIdsToDelete.size > 0 || edgeIdsToDelete.size > 0) {
          setNodes((nds) => nds.filter((n) => !nodeIdsToDelete.has(n.id)));
          setEdges((eds) => eds.filter((ed) => !edgeIdsToDelete.has(ed.id) && !nodeIdsToDelete.has(ed.source) && !nodeIdsToDelete.has(ed.target)));
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
        setNodes((nds) =>
          nds.map((n) => {
            if (n.selected || n.id === selectedNodeId) {
              return { ...n, position: { x: n.position.x + dx, y: n.position.y + dy } };
            }
            return n;
          })
        );
      }
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [nodes, edges, selectedNodeId, reactFlowInstance, onSave, saveHistory, setNodes, setEdges]);

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
        diagramName={diagram.name}
        onAddActor={() => handleAddNode('actor')}
        onAddUseCase={() => handleAddNode('useCase')}
        onAddBoundary={() => handleAddNode('systemBoundary')}
        onAutoLayout={handleAutoLayout}
        onFitView={() => reactFlowInstance?.fitView({ padding: 0.2 })}
        onSave={() => onSave?.()}
      />

      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onInit={setReactFlowInstance}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
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
          onUpdateNodeData={handleUpdateNodeData}
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
