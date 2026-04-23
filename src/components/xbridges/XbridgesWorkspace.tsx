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
import { Play, Square, Save, Trash2, Box, Layers, MousePointer2, Settings2, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { XBRIDGES_CATEGORIES } from '../../utils/xbridges/XbridgesLibrary';
import { BLOCK_LIBRARY } from '../../engine/xbridges/BlockDefinitions';
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
}> = ({ initialNodes = [], initialEdges = [], availableVariables = [], tickMs, onBack, onSave }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [isSimulating, setIsSimulating] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [openScopes, setOpenScopes] = useState<string[]>([]);
  const [searchMenuPos, setSearchMenuPos] = useState<{ x: number, y: number } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [copiedNode, setCopiedNode] = useState<Node | null>(null);
  const [history, setHistory] = useState<{nodes: Node[], edges: Edge[]}[]>([]);

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
        if (engineRef.current) {
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
                   
                   return { ...n, data: { ...n.data, ...dataUpdate }}; 
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
        selected: false
      },
    };
    setNodes((nds) => nds.concat(newNode));
  };

  const onNodeClick = (_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
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

  const selectedNode = nodes.find(n => n.id === selectedNodeId);

  const addBlockAtPos = (type: string, x: number, y: number) => {
    if (!reactFlowInstance) return;
    const position = reactFlowInstance.screenToFlowPosition({ x, y });
    const newNode = {
      id: `${type}_${Date.now()}`,
      type: 'xblock',
      position,
      data: { type, label: type, params: {} }
    };
    setNodes(nds => [...nds, newNode]);
    setSearchMenuPos(null);
    setSearchTerm('');
  };

  const filteredBlocks = XBRIDGES_CATEGORIES.flatMap(cat => 
    cat.blocks.map(b => ({ ...b, category: cat.name }))
  ).filter(b => b.label.toLowerCase().includes(searchTerm.toLowerCase()));

  return (
    <div className="flex flex-col h-screen bg-[#0a0a0a] text-white overflow-hidden font-sans select-none relative">
      {/* Quick Search Menu */}
      {searchMenuPos && (
        <div 
          className="fixed z-[9999] w-[260px] bg-[#1a1a1a]/95 backdrop-blur-xl border border-white/10 rounded-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200"
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
      <div className="w-64 bg-[#141414] border-r border-[#222] flex flex-col shadow-sm z-10">
        <div className="p-4 border-b border-[#222] flex items-center gap-2">
          <Layers size={18} className="text-[#c9a86c]" />
          <span className="text-sm font-black uppercase tracking-wider text-[#c9a86c]">X-Bridges</span>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {XBRIDGES_CATEGORIES.map((cat) => {
            const isExpanded = !!expandedCategories[cat.name];
            return (
              <div key={cat.name} className="flex flex-col">
                <button 
                  onClick={() => toggleCategory(cat.name)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-[10px] font-bold text-emerald-500 uppercase tracking-widest hover:bg-emerald-500/5 transition-colors text-left"
                >
                  {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  {cat.name}
                </button>
                
                {isExpanded && (
                  <div className="flex flex-col gap-0.5 pl-4 py-1">
                    {cat.blocks.map(b => (
                      <div
                        key={b.type}
                        draggable
                        onDragStart={(e) => onDragStart(e, b.type)}
                        className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-[#1a1a1a] cursor-grab active:cursor-grabbing transition-all group"
                      >
                        <span className="text-xs font-medium text-gray-400 group-hover:text-emerald-400 transition-colors">
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
        {/* Top Toolbar for Solver Configuration */}
        <div className="h-12 bg-[#1a1a1a] border-b border-[#222] flex items-center justify-between px-4 z-20 shadow-md">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSimulating(!isSimulating)}
              className={`flex items-center gap-2 px-4 py-1.5 rounded text-sm font-bold shadow-sm transition-colors ${
                isSimulating 
                  ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30 border border-red-500/50' 
                  : 'bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30 border border-emerald-500/50'
              }`}
            >
              {isSimulating ? <Square size={14} className="fill-current" /> : <Play size={14} className="fill-current" />}
              {isSimulating ? 'Stop Simulation' : 'Run Simulation'}
            </button>
            <div className="h-6 w-px bg-[#333] mx-2" />
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Settings2 size={14} />
              <span>Solver:</span>
              <select 
                value={solverType} 
                onChange={e => setSolverType(e.target.value as any)}
                disabled={isSimulating}
                className="bg-[#0a0a0a] border border-[#333] rounded px-2 py-1 text-gray-300 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
              >
                <option value="ode4">ODE4 (Runge-Kutta)</option>
                <option value="euler">ODE1 (Euler)</option>
              </select>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>Step Size (s):</span>
              <input 
                type="text" 
                value={stepSizeInput}
                onChange={e => {
                  const raw = e.target.value;
                  const normalized = normalizeNumerals(raw).replace(/[^0-9.]/g, '');
                  setStepSizeInput(normalized);
                  
                  if (!tickMs) {
                    const num = Number(normalized);
                    if (!isNaN(num) && normalized !== '' && normalized !== '.') {
                      setFixedStep(num);
                    }
                  }
                }}
                onBlur={() => {
                  if (tickMs) {
                    setStepSizeInput(String(tickMs / 1000));
                  } else {
                    const num = Number(stepSizeInput);
                    if (isNaN(num) || num <= 0) {
                      setStepSizeInput(String(fixedStep));
                    }
                  }
                }}
                disabled={!!tickMs}
                className={`w-16 bg-[#0a0a0a] border border-[#333] rounded px-2 py-1 text-center font-mono focus:outline-none focus:border-emerald-500 ${tickMs ? 'text-amber-500 opacity-80 cursor-not-allowed' : 'text-gray-300'}`}
                title={tickMs ? "Synced with State Machine Tick Rate" : "Set fixed step size in seconds"}
              />
              {tickMs && <span className="text-[10px] text-amber-500/70 ml-1">Synced</span>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={() => {
                  if (onSave) onSave(nodes, edges);
                  onBack();
                }}
                className="flex items-center gap-2 px-3 py-1.5 rounded text-xs font-medium bg-[#c9a86c]/20 text-[#c9a86c] hover:bg-[#c9a86c]/30 border border-[#c9a86c]/50 transition-colors mr-2"
              >
                <Save size={14} />
                Save & Close
              </button>
            )}
            <div className="text-xs text-emerald-500/80 font-mono flex items-center gap-2">
               <div className={`w-2 h-2 rounded-full ${isSimulating ? 'bg-emerald-500 animate-pulse' : 'bg-gray-600'}`} />
               {isSimulating ? `T = ${timeRef.current.toFixed(4)}s` : 'STOPPED'}
            </div>
          </div>
        </div>

        <div className="flex-1 relative flex">
          <div className="flex-1 relative">
            <ReactFlow
            // Pass native React Flow selected state alongside custom data and an update callback
            onInit={setReactFlowInstance}
            nodes={nodes.map(n => ({ 
              ...n, 
              data: { 
                ...n.data, 
                onUpdate: (newData: any) => updateBlock(n.id, newData),
                onOpenScope: (blockId: string) => setOpenScopes(prev => prev.includes(blockId) ? prev : [...prev, blockId])
              } 
            }))}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            onNodeClick={onNodeClick}
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
