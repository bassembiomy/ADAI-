// src/components/xbridges/XBlockNode.tsx
import React from 'react';
import { Handle, Position, useUpdateNodeInternals, NodeResizer } from 'reactflow';
import { 
  Square, Activity, Plus, Minus, X, Divide, ChevronUp, MinusCircle, Maximize, 
  Sigma, BarChart, ArrowUp, Grid, RotateCw, RefreshCcw, Hash, TrendingUp, Monitor, Box, Download,
  LogIn, LogOut
} from 'lucide-react';
import { XPort } from '../../engine/xbridges/types';

interface XBlockNodeProps {
  data: {
    type: string;
    label: string;
    inputs: XPort[];
    outputs: XPort[];
    params: any;
    selected: boolean;
    onUpdate?: (data: any) => void;
    history?: number[];
  };
  selected: boolean;
  id: string;
}

export const XBlockNode: React.FC<XBlockNodeProps> = ({ data, selected, id }) => {
  const updateNodeInternals = useUpdateNodeInternals();
  const [isEditing, setIsEditing] = React.useState(false);
  const [editLabel, setEditLabel] = React.useState(data.label || data.type);

  React.useEffect(() => {
    setEditLabel(data.label || data.type);
  }, [data.label, data.type]);

  const handleLabelSubmit = () => {
    setIsEditing(false);
    if (data.onUpdate && editLabel !== (data.label || data.type)) {
      data.onUpdate({ label: editLabel });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLabelSubmit();
    if (e.key === 'Escape') {
      setIsEditing(false);
      setEditLabel(data.label || data.type);
    }
  };

  // Build SVG polyline points for Scope
  let polylinePoints = '';
  let latestValue = 0;
  if (data.type === 'Scope' && data.history) {
    const history = data.history as number[];
    if (history.length > 0) {
      latestValue = history[history.length - 1];
      const maxVal = Math.max(...history.map(Math.abs), 0.1); // Normalize
      polylinePoints = history.map((val, i) => {
        const x = (i / 99) * 100;
        // Map value to Y: 0 is center (20), +max is top (2), -max is bottom (38)
        const y = 20 - (val / maxVal) * 18;
        return `${x},${y}`;
      }).join(' ');
    }
  }

  const downloadCSV = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!data.history || data.history.length === 0) return;
    
    const csvContent = "Sample,Value\n" + data.history.map((v, i) => `${i},${v}`).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${data.label || 'Scope'}_Data.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Trigger handle update when inputs/outputs change length
  React.useEffect(() => {
    updateNodeInternals(id);
  }, [data.inputs?.length, data.outputs?.length, id, updateNodeInternals]);

  const getColor = (type: string) => {
    if (['Constant', 'WaveformGen'].includes(type)) return '#007acc'; // Signal (Blue)
    if (['VectorAdd', 'VectorSub', 'VectorMul', 'VectorDiv', 'VectorPow', 'UnaryNeg', 'Abs'].includes(type)) return '#28a745'; // Math (Green)
    if (['SumElements', 'Mean', 'Max', 'MatrixMul', 'Transpose', 'Inverse', 'Determinant'].includes(type)) return '#28a745'; // Math (Green)
    if (['Integrator'].includes(type)) return '#fd7e14'; // Control (Orange)
    if (['Scope'].includes(type)) return '#007acc'; // Signal (Blue)
    if (['Inport', 'Outport'].includes(type)) return '#c9a86c'; // Port (Gold)
    return '#007acc';
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'Constant': return <Square size={12} />;
      case 'WaveformGen': return <Activity size={12} />;
      case 'VectorAdd': return <Plus size={12} />;
      case 'VectorSub': return <Minus size={12} />;
      case 'VectorMul': return <X size={12} />;
      case 'VectorDiv': return <Divide size={12} />;
      case 'VectorPow': return <ChevronUp size={12} />;
      case 'UnaryNeg': return <MinusCircle size={12} />;
      case 'Abs': return <Maximize size={12} />;
      case 'SumElements': return <Sigma size={12} />;
      case 'Mean': return <BarChart size={12} />;
      case 'Max': return <ArrowUp size={12} />;
      case 'MatrixMul': return <Grid size={12} />;
      case 'Transpose': return <RotateCw size={12} />;
      case 'Inverse': return <RefreshCcw size={12} />;
      case 'Determinant': return <Hash size={12} />;
      case 'Integrator': return <TrendingUp size={12} />;
      case 'Scope': return <Monitor size={12} />;
      case 'Inport': return <LogIn size={12} />;
      case 'Outport': return <LogOut size={12} />;
      default: return <Box size={12} />;
    }
  };

  const color = getColor(data.type);

  return (
    <>
      <NodeResizer
        isVisible={selected}
        minWidth={140}
        minHeight={80}
        handleStyle={{ width: 8, height: 8, background: color, border: '1px solid #333' }}
        lineStyle={{ border: 'none' }} // Remove the "ruler" border!
      />

      <div
        className="flex flex-col rounded-lg bg-[#2d2d2d] border border-[#404040] transition-all duration-200 w-full h-full min-w-[140px] min-h-[80px] shadow-xl overflow-hidden group hover:border-[#666]"
        style={{
          borderColor: selected ? color : '#404040',
          boxShadow: selected ? `0 0 10px ${color}20` : 'none'
        }}
      >
        {/* Block Header & Identity (FR-1.1) */}
        <div
          className="w-full px-3 py-1.5 border-b border-[#404040] flex items-center justify-center bg-opacity-20 cursor-text group/header"
          style={{ backgroundColor: `${color}20` }}
          onDoubleClick={() => setIsEditing(true)}
        >
          {isEditing ? (
            <input
              autoFocus
              value={editLabel}
              onChange={e => setEditLabel(e.target.value)}
              onBlur={handleLabelSubmit}
              onKeyDown={handleKeyDown}
              className="text-[12px] font-bold tracking-wide text-white bg-black/50 border border-emerald-500 rounded px-1 w-full text-center focus:outline-none"
            />
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="opacity-70 group-hover/header:opacity-100 transition-opacity" style={{ color: color }}>
                {getIcon(data.type)}
              </span>
              <div className="text-[12px] font-bold tracking-wide text-white truncate px-1">
                {data.params?.smVarId ? `[${data.label || data.type}]` : (data.label || data.type)}
              </div>
            </div>
          )}
        </div>
        {data.params?.smVarId && (
          <div className="px-3 py-0.5 bg-amber-500/10 border-b border-[#404040] text-[9px] text-amber-400 font-mono flex items-center justify-center gap-1">
            <Activity size={8} />
            {data.params.smVarId.substring(0, 8)}...
          </div>
        )}

        {/* Body Content */}
        <div className="flex flex-col gap-2 flex-1 p-3">
          {data.params && Object.keys(data.params).length > 0 && data.type !== 'Scope' ? (
            Object.entries(data.params).map(([key, value]) => (
              <div key={key} className="flex justify-between items-center text-[10px] gap-2">
                <span className="text-gray-400 capitalize">{key}</span>
                <div className="bg-[#0a0a0a] border border-[#333] rounded px-1.5 py-0.5 text-gray-300 font-mono text-right truncate w-16">
                  {typeof value === 'object' ? '[Array]' : String(value)}
                </div>
              </div>
            ))
          ) : data.type === 'Scope' ? (
            <div className="flex-1 w-full border border-[#333] rounded bg-[#0a0a0a] relative overflow-hidden flex items-center justify-center">
              <svg width="100%" height="100%" viewBox="0 0 100 40" preserveAspectRatio="none" className="pointer-events-none">
                {/* Center zero line */}
                <line x1="0" y1="20" x2="100" y2="20" stroke="#333" strokeWidth="0.5" strokeDasharray="2,2" />
                {polylinePoints ? (
                  <polyline points={polylinePoints} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
                ) : (
                  <path d="M0 20 Q 25 0, 50 20 T 100 20" fill="none" stroke={color} strokeWidth="0.5" strokeDasharray="2,4" opacity={0.5} />
                )}
              </svg>
              
              {/* Overlay stats and buttons */}
              <div className="absolute top-1 right-1 flex items-center gap-1.5 pointer-events-auto">
                 {data.history && data.history.length > 0 && (
                   <button 
                     onClick={downloadCSV}
                     className="p-1 rounded bg-black/60 border border-[#333] text-gray-400 hover:text-emerald-500 hover:border-emerald-500/50 transition-all opacity-0 group-hover:opacity-100"
                     title="Download CSV"
                   >
                     <Download size={10} />
                   </button>
                 )}
                 <div className="text-[8px] font-mono bg-black/50 px-1 rounded pointer-events-none" style={{ color: color }}>
                   {latestValue.toFixed(3)}
                 </div>
              </div>
            </div>
          ) : (
            <div className="flex-1" />
          )}
        </div>

        {/* Input Ports (Standard ReactFlow Absolute Positioning) */}
        {data.inputs?.map((input, i) => (
          <div key={input.id}>
            <Handle
              type="target"
              position={Position.Left}
              id={input.id}
              className="border-2 rounded-full cursor-crosshair hover:scale-125 transition-transform"
              style={{
                width: 8,
                height: 8,
                background: '#4caf50', // Continuous Signal (Green)
                borderColor: '#1e1e1e',
                left: -4,
                top: `${((i + 1) / (data.inputs.length + 1)) * 100}%`
              }}
            />
            {/* Port Label inside the node */}
            <span
              className="absolute text-[8px] font-mono text-gray-400 pointer-events-none"
              style={{
                left: 6,
                top: `calc(${((i + 1) / (data.inputs.length + 1)) * 100}% - 6px)`
              }}
            >
              {input.name}
            </span>
          </div>
        ))}

        {/* Output Ports (Standard ReactFlow Absolute Positioning) */}
        {data.outputs?.map((output, i) => (
          <div key={output.id}>
            <Handle
              type="source"
              position={Position.Right}
              id={output.id}
              className="border-2 rounded-full cursor-crosshair hover:scale-125 transition-transform"
              style={{
                width: 8,
                height: 8,
                background: '#4caf50', // Continuous Signal (Green)
                borderColor: '#1e1e1e',
                right: -4,
                top: `${((i + 1) / (data.outputs.length + 1)) * 100}%`
              }}
            />
            {/* Port Label inside the node */}
            <span
              className="absolute text-[8px] font-mono text-gray-400 pointer-events-none text-right"
              style={{
                right: 6,
                top: `calc(${((i + 1) / (data.outputs.length + 1)) * 100}% - 6px)`
              }}
            >
              {output.name}
            </span>
          </div>
        ))}

      </div>
    </>
  );
};
