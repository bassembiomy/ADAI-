// src/components/xbridges/XbridgesWorkspace.tsx
import React, { useState, useCallback, useEffect } from 'react';
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  Connection,
  Edge,
  Node,
  useNodesState,
  useEdgesState,
  Panel,
  BackgroundVariant,
  MiniMap
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Play, Pause, Square, Save, Trash2, Box, Network, MousePointer2, Settings2, ChevronDown, ChevronRight, Search, Triangle, Layers } from 'lucide-react';
import { XBRIDGES_CATEGORIES, BLOCK_LIBRARY } from '../../engine/xbridges/BlockDefinitions';
import { XbridgesEngine } from '../../engine/xbridges/XbridgesEngine';
import { Solvers } from '../../engine/xbridges/Solvers';
import { XBlockNode } from './XBlockNode';
import { XbridgesPropertiesPanel } from './XbridgesPropertiesPanel';
import { XbridgesScopeWindow } from './XbridgesScopeWindow';

const nodeTypes = { xblock: XBlockNode };

const normalizeNumerals = (val: string) => {
  if (!val) return "";
  return val.replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString())
    .replace(/[۰۱۲۳۴۵۶۷۸۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d).toString())
    .replace(/[٫،,]/g, '.');
};

export const XbridgesWorkspace: React.FC<{
  initialNodes?: any[];
  initialEdges?: any[];
  availableVariables?: any[];
  tickMs?: number; // Added to sync with State Machine
  onBack?: () => void;
  onSave?: (nodes: any[], edges: any[]) => void;
  onLaunchDoe?: () => void;
}> = ({ initialNodes = [], initialEdges = [], availableVariables = [], tickMs, onBack, onSave, onLaunchDoe }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isLibCollapsed, setIsLibCollapsed] = useState(false);
  const [isPropsCollapsed, setIsPropsCollapsed] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [openScopes, setOpenScopes] = useState<string[]>([]);
  const [searchMenuPos, setSearchMenuPos] = useState<{ x: number, y: number } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedNode, setCopiedNode] = useState<Node | null>(null);
  const [history, setHistory] = useState<{ nodes: Node[], edges: Edge[] }[]>([]);

  // Hierarchical Navigation State
  const [viewPath, setViewPath] = useState<string[]>(['root']);
  const currentParentId = viewPath[viewPath.length - 1];

  const [solverType, setSolverType] = useState<'euler' | 'rk4'>('rk4');
  const initialStep = tickMs ? tickMs / 1000 : 0.02;
  const [fixedStep, setFixedStep] = useState(initialStep);
  const [stepSizeInput, setStepSizeInput] = useState(String(initialStep));

  // Update fixedStep if tickMs changes from parent
  useEffect(() => {
    if (tickMs) {
      const step = tickMs / 1000;
      setFixedStep(step);
      setStepSizeInput(String(step));
    }
  }, [tickMs]);
  const engineRef = React.useRef<XbridgesEngine | null>(null);
  const timeRef = React.useRef(0);
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({
    'Sources': true,
    'Continuous': true,
    'Logic Gates': true,
    'Sequential': true,
    'Sinks': true
  });

  const toggleCategory = (name: string) => {
    setExpandedCategories(prev => ({ ...prev, [name]: !prev[name] }));
  };

  // Sync edge animation with simulation state
  useEffect(() => {
    setEdges(eds => eds.map(e => ({ ...e, animated: isSimulating })));
  }, [isSimulating, setEdges]);

  // Real-time Simulation Loop
  useEffect(() => {
    let animationFrameId: number;
    let updateThrottle = 0;

    if (isSimulating) {
      // Rebuild engine model on start
      const model = {
        blocks: nodes.map(n => n.data as any),
        connections: edges.map(e => ({
          sourceBlock: e.source, sourcePort: e.sourceHandle!, targetBlock: e.target, targetPort: e.targetHandle!
        }))
      };
      engineRef.current = new XbridgesEngine(model);
      engineRef.current.compile();

      const tick = () => {
        if (engineRef.current && !isPaused) {
          // Sync SM Variables to Inports (Data Connectivity)
          nodes.forEach(node => {
            if (node.data.type === 'Inport' && node.data.params?.smVarId && availableVariables) {
              const smVar = availableVariables.find(v => v.id === node.data.params.smVarId);
              if (smVar) {
                const numericVal = Number(smVar.currentValue);
                engineRef.current!.setSignalValue(node.id, 'out', numericVal);
                const block = engineRef.current!['blockMap'].get(node.id);
                if (block && block.params) block.params.value = numericVal;
              }
            }
          });

          if (solverType === 'rk4') Solvers.stepRK4(engineRef.current, timeRef.current, fixedStep);
          else Solvers.stepEuler(engineRef.current, timeRef.current, fixedStep);

          timeRef.current += fixedStep;

          // Throttle UI updates to ~15fps (every 4th frame at 60fps) to prevent ReactFlow lag
          updateThrottle++;
          if (updateThrottle % 4 === 0) {
            setNodes(nds => nds.map(n => {
              const engineBlock = engineRef.current!['blockMap'].get(n.id);
              if (engineBlock && n.type === 'xblock') {
                let dataUpdate: any = { state: engineBlock.state };

                if (engineBlock.type === 'Scope') {
                  const currentInputs = engineRef.current!.gatherInputs(engineBlock);
                  const val = currentInputs[0];
                  const prevHistory = n.data.history || [];
                  dataUpdate.history = [...prevHistory.slice(-99), typeof val === 'number' ? val : 0];
                }

                return { ...n, data: { ...n.data, ...dataUpdate } };
              }
              return n;
            }));
          }
        }
        animationFrameId = requestAnimationFrame(tick);
      };

      animationFrameId = requestAnimationFrame(tick);
    } else {
      timeRef.current = 0; // Reset time when stopped
      setIsPaused(false);
    }

    return () => cancelAnimationFrame(animationFrameId);
  }, [isSimulating]); // Deliberately omitted nodes/edges to prevent restarting loop while dragging

  const saveHistory = useCallback(() => {
    setHistory(prev => [...prev.slice(-19), { nodes, edges }]);
  }, [nodes, edges]);

  // Auto-save on unmount to prevent data loss (FR-Persistence)
  const nodesRef = React.useRef(nodes);
  const edgesRef = React.useRef(edges);
  const onSaveRef = React.useRef(onSave);

  React.useEffect(() => { nodesRef.current = nodes; }, [nodes]);
  React.useEffect(() => { edgesRef.current = edges; }, [edges]);
  React.useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  React.useEffect(() => {
    return () => {
      if (onSaveRef.current) {
        onSaveRef.current(nodesRef.current, edgesRef.current);
      }
    };
  }, []); // Run ONLY on unmount

  // Debounced auto-save for better reliability (FR-Persistence)
  React.useEffect(() => {
    const timeout = setTimeout(() => {
      if (onSave) onSave(nodes, edges);
    }, 1000);
    return () => clearTimeout(timeout);
  }, [nodes, edges, onSave]);

  const onConnect = useCallback((params: Connection | Edge) => {
    saveHistory();
    setEdges((eds) => addEdge({
      ...params,
      animated: isSimulating,
      style: { stroke: '#4caf50', strokeWidth: 3 } // FR-2.2 Continuous wire
    }, eds));

    // If simulating, hot-reload the connection in the engine
    if (isSimulating && engineRef.current) {
      engineRef.current['model'].connections.push({
        sourceBlock: params.source!, sourcePort: params.sourceHandle!,
        targetBlock: params.target!, targetPort: params.targetHandle!
      });
      engineRef.current['compiled'] = false; // Force recompile on next step
    }
  }, [setEdges, isSimulating, saveHistory]);

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    const reactFlowBounds = (event.target as HTMLElement).getBoundingClientRect();
    const type = event.dataTransfer.getData('application/reactflow');
    if (!type || !BLOCK_LIBRARY[type]) return;

    saveHistory();

    let position = { x: reactFlowBounds.width / 2 - 70, y: reactFlowBounds.height / 2 - 40 };
    if (reactFlowInstance) {
      position = reactFlowInstance.screenToFlowPosition({
        x: reactFlowBounds.left + reactFlowBounds.width / 2,
        y: reactFlowBounds.top + reactFlowBounds.height / 2
      });
      // offset slightly for block dimensions
      position.x -= 70;
      position.y -= 40;
    }

    // Instantiate block definition to get inputs/outputs/params
    const blockDef = BLOCK_LIBRARY[type](`${type}-${Date.now()}`, {});

    const newNode: Node = {
      id: blockDef.id,
      type: 'xblock',
      position,
      data: {
        ...blockDef,
        parentId: currentParentId, // NEW: Assign to current subsystem
        selected: false
      },
    };
    setNodes((nds) => nds.concat(newNode));
  };

  const onNodeClick = (_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  };

  const onNodeDoubleClick = (_: React.MouseEvent, node: Node) => {
    if (node.data.type === 'Subsystem') {
      setViewPath(prev => [...prev, node.id]);
      setSelectedNodeId(null);
    }
  };

  const onPaneClick = () => {
    setSelectedNodeId(null);
  };

  const onNodesDelete = useCallback((deleted: Node[]) => {
    // Clear selection if the currently selected node is deleted
    if (deleted.some(n => n.id === selectedNodeId)) {
      setSelectedNodeId(null);
    }
  }, [selectedNodeId]);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent shortcuts when typing in input fields (Properties Panel)
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Toggle Simulation (Space)
      if (e.code === 'Space' && !e.ctrlKey) {
        e.preventDefault();
        setIsSimulating(prev => !prev);
      }

      // Deselect (Escape)
      if (e.code === 'Escape') {
        setSelectedNodeId(null);
      }

      // Delete (Delete or Backspace)
      if (e.code === 'Delete' || e.code === 'Backspace') {
        const selectedNodes = nodes.filter(n => n.selected || n.id === selectedNodeId);
        const selectedEdges = edges.filter(ed => ed.selected);

        if (selectedNodes.length > 0 || selectedEdges.length > 0) {
          e.preventDefault(); // Prevent React Flow from also handling it
          saveHistory();

          if (selectedNodes.length > 0) {
            const nodeIds = selectedNodes.map(n => n.id);
            setNodes(nds => nds.filter(n => !nodeIds.includes(n.id)));
            setEdges(eds => eds.filter(ed => !nodeIds.includes(ed.source) && !nodeIds.includes(ed.target)));
            if (selectedNodeId && nodeIds.includes(selectedNodeId)) {
              setSelectedNodeId(null);
            }
          }

          if (selectedEdges.length > 0) {
            const edgeIds = selectedEdges.map(ed => ed.id);
            // Delete edges, but if we already filtered edges from node deletion, filter those too
            setEdges(eds => eds.filter(ed => !edgeIds.includes(ed.id)));
          }
        }
      }

      // Select All (Ctrl+A or Cmd+A)
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyA') {
        e.preventDefault();
        setNodes(nds => nds.map(n => ({ ...n, selected: true })));
      }

      // Save (Ctrl+S or Cmd+S)
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
        e.preventDefault();
        console.log('Saved workspace state:', { nodes, edges });
        // Normally hook into global save handler here
      }

      // Undo (Ctrl+Z or Cmd+Z)
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
        e.preventDefault();
        if (history.length > 0) {
          const previousState = history[history.length - 1];
          setNodes(previousState.nodes);
          setEdges(previousState.edges);
          setHistory(prev => prev.slice(0, -1));
          setSelectedNodeId(null);
        }
      }

      // Copy (Ctrl+C or Cmd+C)
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyC') {
        const nodeToCopy = nodes.find(n => n.id === selectedNodeId);
        if (nodeToCopy) {
          setCopiedNode(nodeToCopy);
        }
      }

      // Paste (Ctrl+V or Cmd+V)
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyV' && copiedNode) {
        saveHistory();
        const newNodeId = `${copiedNode.data.type || 'block'}-${Date.now()}`;
        const newNode: Node = {
          ...copiedNode,
          id: newNodeId,
          position: {
            x: copiedNode.position.x + 20,
            y: copiedNode.position.y + 20,
          },
          selected: true,
          data: { ...copiedNode.data, id: newNodeId, selected: true }
        };
        setNodes(nds => [...nds.map(n => ({ ...n, selected: false })), newNode]);
        setSelectedNodeId(newNodeId);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, edges, history, selectedNodeId, copiedNode, setNodes, setEdges, setIsSimulating, saveHistory]);

  const updateBlock = (blockId: string, data: any) => {
    setNodes(nds => nds.map(n => {
      if (n.id === blockId) {
        const updatedData = { ...n.data, ...data };

        // Handle parameter-driven port changes (e.g., numInputs, bitWidth, cases)
        if (data.params && BLOCK_LIBRARY[n.data.type]) {
          // Check if critical params changed
          const oldParams = n.data.params || {};
          const newParams = data.params;

          const hasChanged =
            newParams.numInputs !== oldParams.numInputs ||
            newParams.cases !== oldParams.cases ||
            newParams.numCases !== oldParams.numCases ||
            newParams.numSignals !== oldParams.numSignals ||
            newParams.numOutputs !== oldParams.numOutputs;

          if (hasChanged) {
            // Re-instantiate block definition to get new ports
            const freshDef = BLOCK_LIBRARY[n.data.type](blockId, newParams);
            updatedData.inputs = freshDef.inputs;
            updatedData.outputs = freshDef.outputs;
          }
        }

        return { ...n, data: updatedData };
      }
      return n;
    }));
  };

  const stepSimulation = () => {
    if (!engineRef.current) return;

    if (solverType === 'rk4') Solvers.stepRK4(engineRef.current, timeRef.current, fixedStep);
    else Solvers.stepEuler(engineRef.current, timeRef.current, fixedStep);

    timeRef.current += fixedStep;

    setNodes(nds => nds.map(n => {
      const engineBlock = engineRef.current!['blockMap'].get(n.id);
      if (engineBlock && n.type === 'xblock') {
        let dataUpdate: any = { state: engineBlock.state };
        if (engineBlock.type === 'Scope') {
          const currentInputs = engineRef.current!.gatherInputs(engineBlock);
          const val = currentInputs[0];
          const prevHistory = n.data.history || [];
          dataUpdate.history = [...prevHistory.slice(-99), typeof val === 'number' ? val : 0];
        }
        return { ...n, data: { ...n.data, ...dataUpdate } };
      }
      return n;
    }));
  };

  // --- Subsystem Port Synchronization ---
  useEffect(() => {
    let hasChanges = false;
    const nextNodes = nodes.map(node => {
      if (node.data.type === 'Subsystem') {
        const internalInports = nodes.filter(n => n.data.parentId === node.id && n.data.type === 'Inport');
        const internalOutports = nodes.filter(n => n.data.parentId === node.id && n.data.type === 'Outport');

        const newInputs = internalInports
          .sort((a, b) => (a.data.params.port_index || 0) - (b.data.params.port_index || 0))
          .map(p => ({
            id: p.id,
            name: p.data.params.name || 'In',
            type: p.data.params.data_type || 'auto',
            direction: 'input',
            value: 0,
            position: 'left'
          }));

        const newOutputs = internalOutports
          .sort((a, b) => (a.data.params.port_index || 0) - (b.data.params.port_index || 0))
          .map(p => ({
            id: p.id,
            name: p.data.params.name || 'Out',
            type: p.data.params.data_type || 'auto',
            direction: 'output',
            value: 0,
            position: 'right'
          }));

        if (JSON.stringify(newInputs) !== JSON.stringify(node.data.inputs) ||
          JSON.stringify(newOutputs) !== JSON.stringify(node.data.outputs)) {
          hasChanges = true;
          return { ...node, data: { ...node.data, inputs: newInputs, outputs: newOutputs } };
        }
      }
      return node;
    });

    if (hasChanges) setNodes(nextNodes);
  }, [nodes, setNodes]);

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  const addBlockAtPos = (type: string, x: number, y: number) => {
    if (!reactFlowInstance || !BLOCK_LIBRARY[type]) return;
    saveHistory();

    const position = reactFlowInstance.screenToFlowPosition({ x, y });
    const blockDef = BLOCK_LIBRARY[type](`${type}-${Date.now()}`, {});

    const newNode: Node = {
      id: blockDef.id,
      type: 'xblock',
      position,
      data: {
        ...blockDef,
        parentId: currentParentId,
        // Ensure UI callbacks are present
        onUpdate: (newData: any) => updateBlock(blockDef.id, newData),
        onOpenScope: (blockId: string) => setOpenScopes(prev => prev.includes(blockId) ? prev : [...prev, blockId])
      }
    };

    setNodes(nds => [...nds, newNode]);
    setSearchMenuPos(null);
    setSearchTerm('');
  };

  const filteredBlocks = XBRIDGES_CATEGORIES.flatMap(cat =>
    cat.blocks.map(b => ({ ...b, category: cat.name }))
  ).filter(b => b.label.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="flex h-full w-full bg-[#0a0a0a] text-gray-300 font-sans overflow-hidden select-none relative">
      {/* Quick Search Menu */}
      {searchMenuPos && (
        <div
          className="fixed z-[9999] w-[260px] bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl overflow-hidden"
          style={{ left: searchMenuPos.x, top: searchMenuPos.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-3 border-b border-white/5 flex items-center gap-2">
            <Search size={14} className="text-emerald-500" />
            <input
              autoFocus
              placeholder="Search blocks..."
              className="bg-transparent border-none outline-none text-sm w-full text-white placeholder-white/20 font-bold"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filteredBlocks.length > 0) {
                  addBlockAtPos(filteredBlocks[0].type, searchMenuPos.x, searchMenuPos.y);
                } else if (e.key === 'Escape') {
                  setSearchMenuPos(null);
                }
              }}
            />
          </div>
          <div className="max-h-[300px] overflow-y-auto custom-scrollbar p-1">
            {filteredBlocks.map((b, i) => (
              <div
                key={i}
                className="flex items-center justify-between p-2 hover:bg-emerald-500/10 rounded cursor-pointer group transition-colors"
                onClick={() => addBlockAtPos(b.type, searchMenuPos.x, searchMenuPos.y)}
              >
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-white/90 group-hover:text-emerald-400">{b.label}</span>
                  <span className="text-[9px] text-white/30 uppercase tracking-widest">{b.category}</span>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                  <Box size={10} className="text-emerald-500" />
                </div>
              </div>
            ))}
            {filteredBlocks.length === 0 && (
              <div className="p-4 text-center text-xs text-white/20 italic">No blocks found</div>
            )}
          </div>
        </div>
      )}
      {/* Sidebar Library */}
      <div className={`${isLibCollapsed ? 'w-12' : 'w-72'} bg-[#0d0d0d] border-r border-white/5 flex flex-col shadow-[10px_0_30px_rgba(0,0,0,0.5)] z-40 transition-all duration-500 ease-in-out relative group`}>
        {/* Cinematic Header */}
        <div className="p-5 border-b border-white/5 bg-gradient-to-br from-white/[0.03] to-transparent flex items-center justify-between overflow-hidden">
          {!isLibCollapsed && (
            <div className="flex flex-col animate-in fade-in slide-in-from-left-4 duration-500">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-[#c9a86c]/20 shadow-[0_0_15px_rgba(201,168,108,0.2)]">
                  <Network size={20} className="text-[#c9a86c]" />
                </div>
                <span className="text-sm font-black uppercase tracking-[0.3em] text-white/90 drop-shadow-sm">X-Bridges</span>
              </div>
              <span className="text-[8px] text-[#c9a86c]/60 font-black uppercase tracking-widest mt-1 ml-9">Advanced Logic Suite</span>
            </div>
          )}
          <button
            onClick={() => setIsLibCollapsed(!isLibCollapsed)}
            className={`p-2 rounded-xl bg-white/5 border border-white/10 text-[#c9a86c] hover:bg-[#c9a86c]/10 hover:border-[#c9a86c]/30 transition-all ${isLibCollapsed ? 'mx-auto' : ''}`}
            title={isLibCollapsed ? "Expand Library" : "Collapse Library"}
          >
            <Triangle size={12} className={`transition-transform duration-500 ${isLibCollapsed ? 'rotate-90' : '-rotate-90'}`} fill="currentColor" />
          </button>
        </div>

        {/* Search Bar */}
        {!isLibCollapsed && (
          <div className="px-4 py-3 border-b border-white/5 bg-white/[0.01]">
            <div className="relative group">
              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-[#c9a86c] transition-colors" />
              <input 
                placeholder="Search Logic..."
                className="w-full bg-white/5 border border-white/5 rounded-xl py-2 pl-9 pr-4 text-[10px] font-bold text-white placeholder-gray-700 focus:outline-none focus:border-[#c9a86c]/30 focus:bg-white/[0.08] transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className={`flex-1 overflow-y-auto p-3 space-y-2 custom-scrollbar ${isLibCollapsed ? 'hidden' : 'block'}`}>
          {XBRIDGES_CATEGORIES.map((cat) => {
            const isExpanded = !!expandedCategories[cat.name];
            return (
              <div key={cat.name} className="flex flex-col">
                <button
                  onClick={() => toggleCategory(cat.name)}
                  className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isExpanded ? 'bg-white/[0.05] text-[#c9a86c]' : 'text-gray-500 hover:bg-white/[0.03] hover:text-gray-300'}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-1 h-1 rounded-full ${isExpanded ? 'bg-[#c9a86c]' : 'bg-gray-700'}`} />
                    {cat.name}
                  </div>
                  {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>

                {isExpanded && (
                  <div className="flex flex-col gap-1 pl-4 pr-1 py-2 animate-in slide-in-from-top-2 duration-300">
                    {cat.blocks.map(b => (
                      <div
                        key={b.type}
                        draggable
                        onDragStart={(e) => onDragStart(e, b.type)}
                        className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/5 cursor-grab active:cursor-grabbing transition-all group border border-transparent hover:border-white/5"
                      >
                        <div className="w-1.5 h-1.5 rounded-full bg-gray-800 group-hover:bg-[#c9a86c]/40 transition-colors" />
                        <span className="text-xs font-bold text-gray-500 group-hover:text-white/90 transition-colors">
                          {b.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 relative flex flex-col">
        {/* Premium Top Toolbar */}
        <div className="h-16 bg-[#0a0a0a]/80 backdrop-blur-2xl border-b border-white/5 flex items-center justify-between px-6 z-30 shadow-[0_4px_30px_rgba(0,0,0,0.5)]">
          <div className="flex items-center gap-6">
            <div className="flex items-center bg-white/5 p-1 rounded-2xl border border-white/5 shadow-inner">
              <button
                onClick={() => setIsSimulating(!isSimulating)}
                className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.15em] transition-all duration-300 ${isSimulating
                    ? 'bg-rose-500 text-white shadow-[0_0_20px_rgba(244,63,94,0.4)] hover:bg-rose-600 scale-95'
                    : 'bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:bg-emerald-600 hover:scale-105 active:scale-95'
                  }`}
              >
                {isSimulating ? <Square size={14} className="fill-current" /> : <Play size={14} className="fill-current" />}
                {isSimulating ? 'Stop Engine' : 'Run Engine'}
              </button>

              {isSimulating && (
                <div className="flex items-center gap-1 ml-1 animate-in zoom-in duration-500">
                  <button
                    onClick={() => setIsPaused(!isPaused)}
                    className={`p-2.5 rounded-xl transition-all ${isPaused
                        ? 'bg-amber-500 text-white shadow-[0_0_15px_rgba(245,158,11,0.3)]'
                        : 'text-gray-400 hover:bg-white/5 hover:text-white'
                      }`}
                    title={isPaused ? "Resume" : "Pause"}
                  >
                    {isPaused ? <Play size={16} fill="currentColor" /> : <Pause size={16} fill="currentColor" />}
                  </button>

                  <button
                    onClick={stepSimulation}
                    disabled={!isPaused}
                    className={`p-2.5 rounded-xl transition-all ${isPaused
                        ? 'text-emerald-500 hover:bg-emerald-500/10'
                        : 'opacity-20 cursor-not-allowed text-gray-600'
                      }`}
                    title="Single Step"
                  >
                    <ChevronRight size={18} strokeWidth={3} />
                  </button>
                </div>
              )}
            </div>

            <div className="h-8 w-px bg-white/5" />
            
            <div className="flex items-center gap-4">
              <div className="flex flex-col">
                <span className="text-[8px] text-gray-600 font-black uppercase tracking-widest mb-1">Solver Method</span>
                <div className="relative group">
                  <Settings2 size={10} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#c9a86c]" />
                  <select
                    value={solverType}
                    onChange={e => setSolverType(e.target.value as any)}
                    disabled={isSimulating}
                    className="bg-white/5 border border-white/5 rounded-xl pl-7 pr-3 py-1.5 text-[10px] font-bold text-gray-300 focus:outline-none focus:border-[#c9a86c]/30 appearance-none cursor-pointer hover:bg-white/[0.08] transition-all disabled:opacity-50"
                  >
                    <option value="rk4">Fixed-Step RK4</option>
                    <option value="euler">Explicit Euler</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col">
                <span className="text-[8px] text-gray-600 font-black uppercase tracking-widest mb-1">Time Step (Δt)</span>
                <div className="relative group">
                  <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-emerald-500 text-[8px] font-bold italic">s</div>
                  <input
                    type="text"
                    value={stepSizeInput}
                    onChange={e => setStepSizeInput(normalizeNumerals(e.target.value).replace(/[^0-9.]/g, ''))}
                    disabled={!!tickMs}
                    className={`w-20 bg-white/5 border border-white/5 rounded-xl pl-7 pr-3 py-1.5 text-[10px] font-mono font-bold focus:outline-none focus:border-emerald-500 transition-all ${tickMs ? 'text-amber-500 opacity-80 cursor-not-allowed' : 'text-gray-300 hover:bg-white/[0.08]'}`}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex flex-col items-end">
              <span className="text-[8px] text-gray-600 font-black uppercase tracking-widest mb-1">Engine Status</span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
                  <div className={`w-2 h-2 rounded-full ${isSimulating ? 'bg-emerald-500 shadow-[0_0_10px_#10b981] animate-pulse' : 'bg-gray-700'}`} />
                  <span className={`text-[10px] font-mono font-bold tabular-nums ${isSimulating ? 'text-emerald-500' : 'text-gray-500'}`}>
                    {isSimulating ? `T = ${timeRef.current.toFixed(4)}s` : 'IDLE'}
                  </span>
                </div>
                {onBack && (
                  <button
                    onClick={() => { if (onSave) onSave(nodes, edges); onBack(); }}
                    className="p-2.5 rounded-xl bg-[#c9a86c]/10 text-[#c9a86c] hover:bg-[#c9a86c]/20 border border-[#c9a86c]/20 transition-all"
                    title="Save & Exit"
                  >
                    <Save size={18} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Path Navigation (Breadcrumbs) */}
        <div className="h-10 bg-[#0d0d0d] border-b border-white/5 flex items-center px-6 gap-3 z-20">
          <div className="p-1 rounded bg-white/5">
            <Layers size={12} className="text-gray-600" />
          </div>
          {viewPath.map((pathId, idx) => {
            const nodeName = pathId === 'root' ? 'ROOT PROJECT' : (nodes.find(n => n.id === pathId)?.data.params.name || pathId);
            const isLast = idx === viewPath.length - 1;
            return (
              <React.Fragment key={pathId}>
                <button
                  onClick={() => setViewPath(viewPath.slice(0, idx + 1))}
                  className={`text-[9px] font-black tracking-[0.2em] uppercase transition-all hover:text-[#c9a86c] ${isLast ? 'text-[#c9a86c]' : 'text-gray-500'}`}
                >
                  {nodeName}
                </button>
                {!isLast && <ChevronRight size={10} className="text-gray-800" />}
              </React.Fragment>
            );
          })}
        </div>

        <div className="flex-1 relative flex">
          <div className="flex-1 relative">
            <ReactFlow
              // Pass native React Flow selected state alongside custom data and an update callback
              onInit={setReactFlowInstance}
              nodes={nodes.filter(n => (n.data.parentId || 'root') === currentParentId).map(n => ({
                ...n,
                data: {
                  ...n.data,
                  onUpdate: (newData: any) => updateBlock(n.id, newData),
                  onOpenScope: (blockId: string) => setOpenScopes(prev => prev.includes(blockId) ? prev : [...prev, blockId])
                }
              }))}
              edges={edges.filter(e => {
                const sourceNode = nodes.find(n => n.id === e.source);
                return sourceNode && (sourceNode.data.parentId || 'root') === currentParentId;
              })}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onDrop={onDrop}
              onDragOver={(e) => e.preventDefault()}
              onNodeClick={onNodeClick}
              onNodeDoubleClick={onNodeDoubleClick}
              onPaneClick={(e) => {
                if (e.detail === 2) {
                  // Double click
                  setSearchMenuPos({ x: e.clientX, y: e.clientY });
                } else {
                  setSearchMenuPos(null);
                  setSearchTerm('');
                }
                setSelectedNodeId(null);
              }}
              onSelectionChange={({ nodes: selectedNodes }) => {
                if (selectedNodes.length === 1) {
                  setSelectedNodeId(selectedNodes[0].id);
                } else if (selectedNodes.length === 0) {
                  setSelectedNodeId(null);
                }
              }}
              onNodesDelete={onNodesDelete}
              nodeTypes={nodeTypes}
              snapToGrid
              snapGrid={[15, 15]}
              fitView
              // FR-2.1: Default Bezier routing, FR-2.4: Selection width
              defaultEdgeOptions={{
                type: 'default',
                animated: true,
                style: { stroke: '#4caf50', strokeWidth: 3 },
                interactionWidth: 20
              }}
              elevateNodesOnSelect
            >
              {/* FR-3.4 and FR-3.5: Pan/Zoom controls, Minimap, Grid Background */}
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#404040" />
              <Controls className="bg-[#1e1e1e] border-[#404040] fill-white" />
              <MiniMap
                nodeColor={(n) => n.data.selected ? '#4caf50' : '#2d2d2d'}
                maskColor="rgba(0, 0, 0, 0.6)"
                className="bg-[#1e1e1e] border border-[#404040]"
              />
            </ReactFlow>

            {/* Simple Clear Button to help user reset if old blocks are stuck */}
            <button
              onClick={() => { setNodes([]); setEdges([]); setSelectedNodeId(null); }}
              className="absolute top-4 right-4 z-50 bg-[#1a1a1a] border border-[#333] text-red-500 hover:bg-red-900/20 px-3 py-1.5 rounded text-xs font-bold shadow-lg flex items-center gap-2"
            >
              <Trash2 size={12} />
              Clear Canvas
            </button>
          </div>

          {/* Right-Side Properties Panel */}
          {selectedNode && (
            <XbridgesPropertiesPanel
              block={selectedNode.data as any}
              availableVariables={availableVariables}
              onUpdate={updateBlock}
              onLaunchDoe={onLaunchDoe}
              onClose={() => setSelectedNodeId(null)}
            />
          )}

          {/* Floating Scope Windows */}
          {openScopes.map(scopeId => {
            const scopeNode = nodes.find(n => n.id === scopeId);
            if (!scopeNode) return null;
            return (
              <XbridgesScopeWindow
                key={scopeId}
                block={scopeNode.data}
                onClose={() => setOpenScopes(prev => prev.filter(id => id !== scopeId))}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
};
