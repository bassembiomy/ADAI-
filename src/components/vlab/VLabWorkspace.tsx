import React, { useCallback, useState, useMemo, useEffect } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Node,
  Edge,
  Panel,
  BackgroundVariant,
  Handle,
  Position
} from 'reactflow';
import 'reactflow/dist/style.css';
import { VLabWorkspaceProps } from './VLabWorkspaceTypes';
import { VLAB_LIBRARY, VLabBlock } from '../../utils/vlabLibrary';
import { VLAB_COMPONENT_DEFINITIONS } from '../../engine/vlab/vlabComponentDefinitions';
import { Settings2, Play, Send, ChevronLeft, Box, Activity, Cpu } from 'lucide-react';

const SymbolRenderer = ({ type, color }: { type: string, color: string }) => {
  switch (type) {
    case 'resistor':
      return (
        <svg width="60" height="30" viewBox="0 0 60 30" fill="none" stroke={color} strokeWidth="2">
          <path d="M0 15H15L18 5L24 25L30 5L36 25L42 5L45 15H60" />
        </svg>
      );
    case 'capacitor':
      return (
        <svg width="60" height="30" viewBox="0 0 60 30" fill="none" stroke={color} strokeWidth="2">
          <path d="M0 15H25M35 15H60M25 5V25M35 5V25" />
        </svg>
      );
    case 'inductor':
      return (
        <svg width="60" height="30" viewBox="0 0 60 30" fill="none" stroke={color} strokeWidth="2">
          <path d="M0 15H10C10 15 10 5 17.5 5C25 5 25 15 25 15C25 15 25 5 32.5 5C40 5 40 15 40 15C40 15 40 5 47.5 5C55 5 55 15 55 15H60" />
        </svg>
      );
    case 'diode':
      return (
        <svg width="60" height="30" viewBox="0 0 60 30" fill="none" stroke={color} strokeWidth="2">
          <path d="M0 15H20L20 5L40 15L20 25L20 15M40 5V25M40 15H60" />
        </svg>
      );
    case 'ground':
      return (
        <svg width="40" height="30" viewBox="0 0 40 30" fill="none" stroke={color} strokeWidth="2">
          <path d="M20 0V15M10 15H30M13 20H27M17 25H23" />
        </svg>
      );
    case 'dc_motor':
    case 'pmsm':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
          <circle cx="30" cy="30" r="25" />
          <text x="30" y="38" textAnchor="middle" fill={color} fontSize="18" fontWeight="bold" stroke="none">M</text>
        </svg>
      );
    case 'three_phase_source':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
          <circle cx="30" cy="30" r="25" />
          <path d="M15 30Q22.5 15 30 30T45 30" />
          <text x="45" y="50" textAnchor="middle" fill={color} fontSize="10" stroke="none">3~</text>
        </svg>
      );
    case 'transformer':
      return (
        <svg width="60" height="60" viewBox="0 0 60 60" fill="none" stroke={color} strokeWidth="2">
          <path d="M15 10C15 10 5 10 5 20C5 30 15 30 15 30C15 30 5 30 5 40C5 50 15 50 15 50" />
          <path d="M45 10C45 10 55 10 55 20C55 30 45 30 45 30C45 30 55 30 55 40C55 50 45 50 45 50" />
          <line x1="25" y1="10" x2="25" y2="50" />
          <line x1="35" y1="10" x2="35" y2="50" />
        </svg>
      );
    default:
      return (
        <div className="text-xl font-bold" style={{ color }}>{type.substring(0, 3).toUpperCase()}</div>
      );
  }
};

const VLabNode = ({ data, selected }: { data: any, selected: boolean }) => {
  // Group ports by side to calculate offsets
  const portsBySide = (data.ports || []).reduce((acc: any, port: any) => {
    if (!acc[port.pos]) acc[port.pos] = [];
    acc[port.pos].push(port);
    return acc;
  }, {});

  return (
    <div className={`relative group flex flex-col items-center transition-all ${selected ? 'z-50' : 'z-10'}`}>
      {/* Component Symbol Container */}
      <div 
        className={`relative flex items-center justify-center transition-all duration-300 ${
          selected 
          ? 'bg-purple-500/5 shadow-[0_0_30px_rgba(168,85,247,0.15)] scale-105' 
          : 'bg-transparent'
        }`}
        style={{ minWidth: 80, minHeight: 60 }}
      >
        {/* Bidirectional Ports with Offsets */}
        {Object.entries(portsBySide).map(([side, sidePorts]: [any, any]) => (
          sidePorts.map((port: any, index: number) => {
            const totalOnSide = sidePorts.length;
            const offset = totalOnSide > 1 ? (index - (totalOnSide - 1) / 2) * 20 : 0;
            const position = side === 'left' ? Position.Left : 
                             side === 'right' ? Position.Right : 
                             side === 'top' ? Position.Top : Position.Bottom;
            
            return (
              <div 
                key={port.id} 
                className="absolute"
                style={{
                  top: (side === 'left' || side === 'right') ? `calc(50% + ${offset}px)` : (side === 'top' ? 0 : '100%'),
                  left: (side === 'top' || side === 'bottom') ? `calc(50% + ${offset}px)` : (side === 'left' ? 0 : '100%'),
                  transform: 'translate(-50%, -50%)'
                }}
              >
                {/* Acausal "Trick": Overlay Source and Target for any-to-any connection */}
                <Handle
                  type="target"
                  position={position}
                  id={`${port.id}_t`}
                  className="!w-2 !h-2 !bg-blue-400/80 !border !border-white/20 hover:!bg-blue-300 hover:!scale-125 transition-all"
                />
                <Handle
                  type="source"
                  position={position}
                  id={`${port.id}_s`}
                  className="!w-2 !h-2 !bg-transparent !border-none" // Invisible source handle
                />
                
                {/* Port Label */}
                <div 
                  className="absolute text-[8px] font-black text-blue-500/50 select-none pointer-events-none uppercase"
                  style={{
                    top: side === 'top' ? -15 : side === 'bottom' ? 15 : 0,
                    left: side === 'left' ? -15 : side === 'right' ? 15 : 0,
                    transform: (side === 'left' || side === 'right') ? 'translateY(-50%)' : 'translateX(-50%)'
                  }}
                >
                  {port.label}
                </div>
              </div>
            );
          })
        ))}

        {/* The SVG Symbol */}
        <div className="drop-shadow-[0_0_10px_rgba(0,0,0,0.5)]">
          <SymbolRenderer type={data.type} color={data.color} />
        </div>
      </div>

      {/* Block Label */}
      <div className={`mt-2 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider transition-all ${selected ? 'text-purple-400 bg-purple-500/10 border border-purple-500/20' : 'text-gray-500'}`}>
        {data.label}
      </div>
    </div>
  );
};

const nodeTypes = {
  default: VLabNode,
};

export const VLabWorkspace: React.FC<VLabWorkspaceProps> = ({
  nodes: initialNodes,
  edges: initialEdges,
  onNodesChange,
  onEdgesChange,
  onResult,
  onSendToDOE,
  onBack
}) => {
  const [nodes, setNodes, onLocalNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onLocalEdgesChange] = useEdgesState(initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [clipboard, setClipboard] = useState<any[]>([]);
  const [history, setHistory] = useState<{ nodes: any[], edges: any[] }[]>([]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;

      // Undo (Ctrl + Z)
      if (e.ctrlKey && e.key === 'z') {
        if (history.length > 0) {
          const prevState = history[history.length - 1];
          setNodes(prevState.nodes);
          setEdges(prevState.edges);
          setHistory(h => h.slice(0, -1));
        }
      }

      // Save (Ctrl + S)
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        console.log('V-Lab State Saved Locally');
        // Trigger parent save if available
      }

      // Delete
      if (e.key === 'Delete' || e.key === 'Backspace') {
        setNodes(nds => nds.filter(node => !node.selected));
        setEdges(eds => eds.filter(edge => !edge.selected));
      }

      // Ctrl + C (Copy)
      if (e.ctrlKey && e.key === 'c') {
        const selectedNodes = nodes.filter(n => n.selected);
        setClipboard(selectedNodes);
      }

      // Ctrl + V (Paste)
      if (e.ctrlKey && e.key === 'v') {
        if (clipboard.length > 0) {
          const pastedNodes = clipboard.map(n => ({
            ...n,
            id: `${n.data.type}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            position: { x: n.position.x + 40, y: n.position.y + 40 },
            selected: true
          }));
          setNodes(nds => nds.map(n => ({ ...n, selected: false })).concat(pastedNodes));
        }
      }

      // Ctrl + A (Select All)
      if (e.ctrlKey && e.key === 'a') {
        e.preventDefault();
        setNodes(nds => nds.map(n => ({ ...n, selected: true })));
        setEdges(eds => eds.map(e => ({ ...e, selected: true })));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nodes, edges, clipboard, setNodes, setEdges]);

  const filteredLibrary = useMemo(() => {
    if (!searchQuery.trim()) return VLAB_LIBRARY;
    const query = searchQuery.toLowerCase();

    return VLAB_LIBRARY.map(domain => ({
      ...domain,
      blocks: domain.blocks.filter(block =>
        block.name.toLowerCase().includes(query) ||
        (block.category || '').toLowerCase().includes(query)
      )
    })).filter(domain => domain.blocks.length > 0);
  }, [searchQuery]);

  const onConnect = useCallback((params: Connection) => {
    setHistory(h => [...h, { nodes, edges }].slice(-20)); // Keep last 20 steps
    const edge = {
      ...params,
      animated: true,
      style: { stroke: '#6c9ac6', strokeWidth: 2 },
    };
    setEdges((eds) => addEdge(edge, eds));
    onEdgesChange(addEdge(edge, edges));
  }, [edges, nodes, onEdgesChange, setEdges]);

  const onNodeClick = (_: any, node: Node) => {
    setSelectedNodeId(node.id);
  };

  const selectedNode = useMemo(() =>
    nodes.find(n => n.id === selectedNodeId),
    [nodes, selectedNodeId]
  );

  const selectedBlockDef = useMemo(() => {
    if (!selectedNode) return null;
    const blockType = (selectedNode.data as any).type;
    return VLAB_COMPONENT_DEFINITIONS[blockType] || null;
  }, [selectedNode]);

  const updateParameter = (paramKey: string, value: number) => {
    if (!selectedNodeId) return;
    setNodes(nds => nds.map(n => {
      if (n.id === selectedNodeId) {
        return {
          ...n,
          data: {
            ...n.data,
            params: {
              ...n.data.params,
              [paramKey]: { ...n.data.params[paramKey], value }
            }
          }
        };
      }
      return n;
    }));
  };

  const runSimulation = () => {
    const mockResult = {
      time: Array.from({ length: 100 }, (_, i) => i * 0.01),
      data: nodes.map(n => ({
        id: n.id,
        values: Array.from({ length: 100 }, () => Math.random() * 10)
      }))
    };
    onResult(mockResult, nodes);
  };

  const onDragStart = (event: React.DragEvent, block: VLabBlock) => {
    event.dataTransfer.setData('application/reactflow', JSON.stringify(block));
    event.dataTransfer.effectAllowed = 'move';
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setHistory(h => [...h, { nodes, edges }].slice(-20));

    const reactFlowBounds = event.currentTarget.getBoundingClientRect();
    const data = JSON.parse(event.dataTransfer.getData('application/reactflow')) as VLabBlock;

    const position = {
      x: event.clientX - reactFlowBounds.left,
      y: event.clientY - reactFlowBounds.top,
    };

    const newNode: Node = {
      id: `${data.id}_${Date.now()}`,
      type: 'default',
      position,
      data: { 
        label: data.name,
        type: data.id,
        icon: data.icon,
        color: data.color,
        params: data.params,
        ports: data.ports
      },
    };

    setNodes((nds) => nds.concat(newNode));
  };

  const onDragOver = (event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  return (
    <div className="flex h-screen w-full bg-[#050505] text-[#e0e0e0] overflow-hidden">
      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 h-12 bg-[#0d0d0d] border-b border-[#222] flex items-center justify-between px-4 z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-[#1a1a1a] rounded-lg transition-colors text-gray-400"
          >
            <ChevronLeft size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Cpu className="text-purple-500" size={18} />
            <h1 className="text-sm font-bold tracking-tight">V-LAB <span className="text-gray-500 font-normal">PHYSICS SIMULATOR</span></h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={runSimulation}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-500 text-white px-4 py-1.5 rounded-lg text-xs font-bold transition-all shadow-lg shadow-purple-900/20"
          >
            <Play size={14} fill="currentColor" /> RUN SIMULATION
          </button>
          <button
            onClick={() => onSendToDOE({ nodes, edges })}
            className="flex items-center gap-2 bg-[#1a1a1a] border border-[#333] hover:bg-[#222] text-gray-300 px-4 py-1.5 rounded-lg text-xs font-bold"
          >
            <Send size={14} /> EXPORT TO DOE
          </button>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="flex flex-1 mt-12 overflow-hidden">
        {/* Left Sidebar: Block Library */}
        <div className="w-72 bg-[#0d0d0d] border-r border-[#222] flex flex-col">
          <div className="p-4 border-b border-[#222]">
            <div className="relative">
              <input
                type="text"
                placeholder="Search blocks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#1a1a1a] border border-[#222] rounded-lg py-1.5 px-3 text-xs focus:border-purple-500 outline-none transition-all"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
            {filteredLibrary.map(domain => {
              // Group blocks by category if they have one
              const categories = domain.blocks.reduce((acc, block) => {
                const cat = block.category || 'Standard';
                if (!acc[cat]) acc[cat] = [];
                acc[cat].push(block);
                return acc;
              }, {} as Record<string, VLabBlock[]>);

              return (
                <div key={domain.type} className="space-y-4">
                  <h3 className="text-[10px] font-black text-purple-400 uppercase tracking-[0.2em] mb-1">{domain.type}</h3>
                  {Object.entries(categories).map(([catName, catBlocks]) => (
                    <div key={catName} className="space-y-2 pl-2 border-l border-[#222]">
                      <h4 className="text-[9px] font-bold text-gray-600 uppercase tracking-wider">{catName}</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {catBlocks.map(block => (
                          <div
                            key={block.id}
                            draggable
                            onDragStart={(e) => onDragStart(e, block)}
                            className="group bg-[#141414] border border-[#222] p-2 rounded-xl cursor-grab hover:border-purple-500/50 hover:bg-[#1a1a1a] transition-all flex flex-col items-center justify-center gap-1.5 relative overflow-hidden"
                          >
                            <div className="absolute top-0 left-0 w-0.5 h-full" style={{ backgroundColor: block.color }} />
                            <div className="text-xl" style={{ color: block.color }}>{block.icon}</div>
                            <span className="text-[9px] text-gray-400 font-medium text-center leading-tight truncate w-full px-1">{block.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Center: Flow Canvas */}
        <div className="flex-1 relative bg-[#0a0a0a]" onDrop={onDrop} onDragOver={onDragOver}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onLocalNodesChange}
            onEdgesChange={onLocalEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            snapToGrid
            snapGrid={[10, 10]}
          >
            <Background color="#151515" gap={20} variant={BackgroundVariant.Lines} />
            <Controls className="bg-[#1a1a1a] border-[#333] fill-white" />
            <MiniMap
              nodeColor={n => (n.data as any).color || '#222'}
              maskColor="rgba(0,0,0,0.7)"
              className="bg-[#1a1a1a] border border-[#333] rounded-lg"
            />
          </ReactFlow>
        </div>

        {/* Right Sidebar: Properties & Equations */}
        <div className="w-80 bg-[#0d0d0d] border-l border-[#222] flex flex-col">
          {selectedNode ? (
            <>
              {/* Properties Section */}
              <div className="p-4 border-b border-[#222]">
                <div className="flex items-center gap-2 mb-4">
                  <Settings2 size={16} className="text-purple-500" />
                  <h3 className="text-xs font-bold uppercase tracking-widest">Block Properties</h3>
                </div>

                <div className="space-y-4">
                  <div className="bg-[#141414] p-3 rounded-xl border border-[#222]">
                    <span className="text-[10px] text-gray-500 font-bold uppercase block mb-1">Block ID</span>
                    <span className="text-xs font-mono text-purple-400">{selectedNode.id}</span>
                  </div>

                  <div className="space-y-3">
                    {Object.entries((selectedNode.data as any).params || {}).map(([key, param]: [string, any]) => (
                      <div key={key}>
                        <div className="flex justify-between items-center mb-1">
                          <label className="text-[10px] text-gray-400 font-bold uppercase">{param.label}</label>
                          <span className="text-[10px] text-gray-600">{param.unit}</span>
                        </div>
                        <input
                          type="number"
                          value={param.value}
                          onChange={(e) => updateParameter(key, parseFloat(e.target.value))}
                          className="w-full bg-[#1a1a1a] border border-[#222] rounded-lg py-1.5 px-3 text-xs focus:border-purple-500 outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Equations Section */}
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-[#222]">
                  <div className="flex items-center gap-2">
                    <Activity size={16} className="text-blue-500" />
                    <h3 className="text-xs font-bold uppercase tracking-widest">Governing Equations</h3>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                  {selectedBlockDef ? (
                    <div className="space-y-4">
                      <div className="bg-[#141414] p-4 rounded-xl border border-[#222] flex flex-col items-center justify-center min-h-[100px] text-center">
                        {selectedBlockDef.latex.map((eq, i) => (
                          <div key={i} className="text-sm font-serif italic text-purple-300 mb-2 last:mb-0">
                            {eq}
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-[#1a1a1a] p-3 rounded-lg border border-[#222]">
                          <span className="text-[9px] text-gray-600 block uppercase font-bold">Across Var</span>
                          <span className="text-xs text-blue-400">{selectedBlockDef.across}</span>
                        </div>
                        <div className="bg-[#1a1a1a] p-3 rounded-lg border border-[#222]">
                          <span className="text-[9px] text-gray-600 block uppercase font-bold">Through Var</span>
                          <span className="text-xs text-green-400">{selectedBlockDef.through}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-gray-600 text-center px-4">
                      <Box size={32} className="mb-2 opacity-20" />
                      <p className="text-[10px] font-medium italic">No equations defined for this block type.</p>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-600 text-center p-8">
              <div className="w-16 h-16 rounded-full bg-[#141414] border border-[#222] flex items-center justify-center mb-4">
                <Settings2 size={32} className="opacity-20" />
              </div>
              <h3 className="text-sm font-bold text-gray-400 mb-1">Select a Block</h3>
              <p className="text-[10px] leading-relaxed">Click on a component in the canvas to view and edit its physical parameters and governing equations.</p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #222;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #333;
        }
      `}</style>
    </div>
  );
};
