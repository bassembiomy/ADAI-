import React, { useCallback } from 'react';
import ReactFlow, { 
  Background, 
  Controls, 
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection
} from 'reactflow';
import 'reactflow/dist/style.css';
import { VLabWorkspaceProps } from './VLabWorkspaceTypes';
import { VLAB_LIBRARY } from '../../utils/vlabLibrary';

export const VLabWorkspace: React.FC<VLabWorkspaceProps> = ({ 
  nodes: initialNodes, 
  edges: initialEdges,
  onNodesChange,
  onEdgesChange,
  onResult,
  onSendToDOE
}) => {
  const [nodes, setNodes, onLocalNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onLocalEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge(params, eds));
    onEdgesChange(addEdge(params, edges));
  }, [edges, onEdgesChange, setEdges]);

  const runSimulation = () => {
    // Mock simulation trigger
    const mockResult = { time: Date.now(), status: 'Success' };
    onResult(mockResult, nodes);
  };

  return (
    <div className="flex h-full">
      {/* Block Library Sidebar */}
      <div className="w-64 bg-[#0d0d0d] border-r border-[#222] p-4 flex flex-col">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Block Library</h3>
        {VLAB_LIBRARY.map(domain => (
          <div key={domain.type} className="mb-6">
            <h4 className="text-[10px] text-gray-600 font-bold mb-2 uppercase">{domain.type}</h4>
            <div className="grid grid-cols-2 gap-2">
              {domain.blocks.map(block => (
                <div 
                  key={block.id}
                  draggable
                  className="bg-[#1a1a1a] border border-[#333] p-2 rounded-lg cursor-grab hover:border-purple-500 transition-all text-center"
                >
                  <div className="text-lg mb-1" style={{ color: block.color }}>{block.icon}</div>
                  <div className="text-[10px] text-gray-400 truncate">{block.name}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
        
        <div className="mt-auto space-y-2">
          <button 
            onClick={runSimulation}
            className="w-full bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-xl text-sm font-bold shadow-lg shadow-purple-900/20"
          >
            Run Simulation
          </button>
          <button 
            onClick={() => onSendToDOE({ nodes, edges })}
            className="w-full bg-[#1a1a1a] border border-[#333] hover:bg-[#222] text-gray-300 py-2 rounded-xl text-sm font-bold"
          >
            Send to DOE
          </button>
        </div>
      </div>

      {/* Flow Canvas */}
      <div className="flex-1 bg-[#0a0a0a]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onLocalNodesChange}
          onEdgesChange={onLocalEdgesChange}
          onConnect={onConnect}
          fitView
        >
          <Background color="#222" gap={20} />
          <Controls />
          <MiniMap nodeColor="#222" maskColor="rgba(0,0,0,0.5)" />
        </ReactFlow>
      </div>
    </div>
  );
};
