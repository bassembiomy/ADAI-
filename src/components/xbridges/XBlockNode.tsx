// src/components/xbridges/XBlockNode.tsx
import React from 'react';
import { Handle, Position, useUpdateNodeInternals, NodeResizer } from 'reactflow';
import { 
  Square, Activity, Plus, Minus, X, Divide, ChevronUp, MinusCircle, Maximize, 
  Sigma, BarChart, ArrowUp, Grid, RotateCw, RefreshCcw, Hash, TrendingUp, Monitor, Box, Download,
  LogIn, LogOut, ChevronLeft, ChevronRight, Zap, Settings, ZapOff, Cpu, Layers
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
    if (['Constant', 'WaveformGen', 'Clock', 'Scope', 'DELAY', 'MUX', 'DEMUX', 'TERMINATOR', 'DATA_TYPE_CONVERSION'].includes(type)) return '#007acc'; // Signal (Blue)
    if (['VectorAdd', 'VectorSub', 'VectorMul', 'VectorDiv', 'VectorPow', 'UnaryNeg', 'Abs', 'SumElements', 'Mean', 'Max', 'MatrixMul', 'Transpose', 'Inverse', 'Determinant', 'GAIN', 'PRODUCT', 'SIN', 'COS', 'TAN', 'COT', 'SEC', 'COSEC', 'TRANSFER_FUNCTION', 'STATE_SPACE', 'ZERO_POLE_GAIN', 'DISCRETE_TRANSFER_FUNCTION'].includes(type)) return '#28a745'; // Math (Green)
    if (['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'XNOR', 'SWITCH', 'IF_ELSE', 'SWITCH_CASE'].includes(type)) return '#6f42c1'; // Logic (Purple)
    if (['BitwiseAND', 'BitwiseOR', 'BitwiseXOR', 'BitwiseNOT', 'ShiftLeft', 'ShiftRight'].includes(type)) return '#563d7c'; // Bitwise (Indigo)
    if (['DFlipFlop', 'JKFlipFlop', 'Register', 'Counter', 'Integrator', 'INTEGRATOR_CONTINUOUS', 'INTEGRATOR_DISCRETE'].includes(type)) return '#d73a49'; // Sequential/Control (Red)
    if (['THREE_PHASE_INVERTER', 'SINGLE_PHASE_H_BRIDGE'].includes(type)) return '#ef4444'; // Power (Red)
    if (['PWM_GENERATOR', 'THREE_PHASE_PWM', 'SIX_STEP_COMMUTATION', 'SVPWM_GATE_GENERATOR', 'SVPWM_MODULATOR'].includes(type)) return '#3b82f6'; // Control (Blue)
    if (['FIELD_ORIENTED_CONTROL', 'VOLTAGE_REFERENCE_GENERATOR', 'CURRENT_CONTROLLER_DQ', 'SPEED_CONTROLLER', 'FLUX_REFERENCE', 'ROTOR_POSITION_ESTIMATOR'].includes(type)) return '#10b981'; // Control/Feedback (Emerald)
    if (['CLARKE_TRANSFORM', 'PARK_TRANSFORM', 'INVERSE_PARK', 'INVERSE_CLARKE', 'SVPWM_CORE', 'SECTOR_SELECTOR', 'SWITCHING_TIME_CALCULATOR', 'ZERO_SEQUENCE_INJECTION'].includes(type)) return '#a855f7'; // Transform/Math (Purple)
    if (['Inport', 'Outport'].includes(type)) return '#c9a86c'; // Port (Gold)
    return '#007acc';
  };

  const getPortColor = (type: string) => {
    switch (type) {
      case 'power': return '#ef4444';
      case 'control': return '#3b82f6';
      case 'measurement': return '#10b981';
      case 'logical': return '#a855f7';
      case 'transform': return '#a855f7';
      default: return '#4caf50';
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'Constant': return <Square size={12} />;
      case 'WaveformGen': return <Activity size={12} />;
      case 'Clock': return <RotateCw size={12} />;
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
      case 'DELAY': return <TrendingUp size={12} />;
      case 'MUX': return <Layers size={12} />;
      case 'DEMUX': return <Grid size={12} />;
      case 'GAIN': return <Maximize size={12} />;
      case 'PRODUCT': return <X size={12} />;
      case 'SWITCH':
      case 'IF_ELSE':
      case 'SWITCH_CASE': return <Settings size={12} />;
      case 'DATA_TYPE_CONVERSION': return <Hash size={12} />;
      case 'TERMINATOR': return <ZapOff size={12} />;
      case 'PID_CONTROLLER': return <Cpu size={12} />;
      case 'TRANSFER_FUNCTION':
      case 'STATE_SPACE':
      case 'ZERO_POLE_GAIN': return <Activity size={12} />;
      case 'SIN':
      case 'COS':
      case 'TAN': return <TrendingUp size={12} />;
      case 'INTEGRATOR_CONTINUOUS':
      case 'INTEGRATOR_DISCRETE': return <TrendingUp size={12} />;
      case 'AND': return <Plus size={12} />;
      case 'OR': return <Grid size={12} />;
      case 'NOT': return <MinusCircle size={12} />;
      case 'BitwiseAND': return <Plus size={12} />;
      case 'BitwiseOR': return <Grid size={12} />;
      case 'BitwiseXOR': return <Plus size={12} />;
      case 'BitwiseNOT': return <MinusCircle size={12} />;
      case 'ShiftLeft': return <ChevronLeft size={12} />;
      case 'ShiftRight': return <ChevronRight size={12} />;
      case 'DFlipFlop':
      case 'JKFlipFlop': return <RefreshCcw size={12} />;
      case 'Register': return <Box size={12} />;
      case 'Counter': return <TrendingUp size={12} />;
      case 'Integrator': return <TrendingUp size={12} />;
      case 'Scope': return <Monitor size={12} />;
      case 'Inport': return <LogIn size={12} />;
      case 'Outport': return <LogOut size={12} />;
      case 'THREE_PHASE_INVERTER':
      case 'SINGLE_PHASE_H_BRIDGE': return <Zap size={12} />;
      case 'PWM_GENERATOR':
      case 'THREE_PHASE_PWM': return <Layers size={12} />;
      case 'SIX_STEP_COMMUTATION': return <Settings size={12} />;
      case 'SVPWM_CORE':
      case 'SVPWM_MODULATOR':
      case 'SVPWM_GATE_GENERATOR': return <Activity size={12} />;
      case 'SECTOR_SELECTOR': return <RotateCw size={12} />;
      case 'ZERO_SEQUENCE_INJECTION': return <Plus size={12} />;
      case 'FIELD_ORIENTED_CONTROL':
      case 'CURRENT_CONTROLLER_DQ':
      case 'SPEED_CONTROLLER': return <Cpu size={12} />;
      case 'FLUX_REFERENCE': return <Activity size={12} />;
      case 'ROTOR_POSITION_ESTIMATOR': return <BarChart size={12} />;
      case 'CLARKE_TRANSFORM':
      case 'PARK_TRANSFORM':
      case 'INVERSE_PARK':
      case 'INVERSE_CLARKE': return <RefreshCcw size={12} />;
      case 'VOLTAGE_REFERENCE_GENERATOR': return <Activity size={12} />;
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
            <div className="px-2.5 py-1.5 flex items-center justify-between border-b border-black/10 group-hover:bg-white/5 transition-colors">
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="p-1 rounded-sm bg-black/20 text-white/90">
                  {getIcon(data.type)}
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider truncate">
                  {data.params?.smVarId ? `[${data.label || data.type}]` : (data.label || data.type)}
                </span>
              </div>
              {(data.type === 'PID_CONTROLLER' || data.type === 'PID_BASIC') && (
                <div className="px-1.5 py-0.5 rounded-full bg-black/30 border border-white/10 text-[8px] font-black text-[#c9a86c]">
                  {data.params?.mode || 'PID'}
                </div>
              )}
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
        {data.inputs?.map((input, i) => {
          const position = input.position || 'left';
          const reactFlowPos = position === 'top' ? Position.Top : (position === 'bottom' ? Position.Bottom : Position.Left);
          const isLogical = input.type === 'logical' || ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'XNOR'].includes(data.type);
          const isClock = input.id.includes('clk');

          return (
            <div key={input.id}>
              <Handle
                type="target"
                position={reactFlowPos}
                id={input.id}
                className="border-2 rounded-full cursor-crosshair hover:scale-125 transition-transform"
                style={{
                  width: 8,
                  height: 8,
                  background: getPortColor(input.type),
                  borderColor: '#1e1e1e',
                  left: position === 'left' ? -4 : (position === 'right' ? 'auto' : `${((i + 1) / (data.inputs.length + 1)) * 100}%`),
                  right: position === 'right' ? -4 : 'auto',
                  top: position === 'top' ? -4 : (position === 'bottom' ? 'auto' : `${((i + 1) / (data.inputs.length + 1)) * 100}%`),
                  bottom: position === 'bottom' ? -4 : 'auto',
                  transform: position === 'top' || position === 'bottom' ? 'translateX(-50%)' : 'none'
                }}
              />
              {/* Port Label inside the node */}
              <span
                className="absolute text-[8px] font-mono text-gray-400 pointer-events-none"
                style={{
                  left: position === 'left' ? 6 : (position === 'top' || position === 'bottom' ? `${((i + 1) / (data.inputs.length + 1)) * 100}%` : 'auto'),
                  right: position === 'right' ? 6 : 'auto',
                  top: position === 'top' ? 6 : (position === 'bottom' ? 'auto' : `calc(${((i + 1) / (data.inputs.length + 1)) * 100}% - 6px)`),
                  bottom: position === 'bottom' ? 6 : 'auto',
                  transform: position === 'top' || position === 'bottom' ? 'translateX(-50%)' : 'none',
                  textAlign: position === 'right' ? 'right' : 'left'
                }}
              >
                {input.name}
              </span>
            </div>
          );
        })}

        {/* Output Ports (Standard ReactFlow Absolute Positioning) */}
        {data.outputs?.map((output, i) => {
          const position = output.position || 'right';
          const reactFlowPos = position === 'top' ? Position.Top : (position === 'bottom' ? Position.Bottom : Position.Right);
          const isLogical = output.type === 'logical' || ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'XNOR'].includes(data.type);

          return (
            <div key={output.id}>
              <Handle
                type="source"
                position={reactFlowPos}
                id={output.id}
                className="border-2 rounded-full cursor-crosshair hover:scale-125 transition-transform"
                style={{
                  width: 8,
                  height: 8,
                  background: getPortColor(output.type),
                  borderColor: '#1e1e1e',
                  left: position === 'left' ? -4 : (position === 'right' ? 'auto' : `${((i + 1) / (data.outputs.length + 1)) * 100}%`),
                  right: position === 'right' ? -4 : 'auto',
                  top: position === 'top' ? -4 : (position === 'bottom' ? 'auto' : `${((i + 1) / (data.outputs.length + 1)) * 100}%`),
                  bottom: position === 'bottom' ? -4 : 'auto',
                  transform: position === 'top' || position === 'bottom' ? 'translateX(-50%)' : 'none'
                }}
              />
              {/* Port Label inside the node */}
              <span
                className="absolute text-[8px] font-mono text-gray-400 pointer-events-none text-right"
                style={{
                  left: position === 'left' ? 6 : (position === 'top' || position === 'bottom' ? `${((i + 1) / (data.outputs.length + 1)) * 100}%` : 'auto'),
                  right: position === 'right' ? 6 : 'auto',
                  top: position === 'top' ? 6 : (position === 'bottom' ? 'auto' : `calc(${((i + 1) / (data.outputs.length + 1)) * 100}% - 6px)`),
                  bottom: position === 'bottom' ? 6 : 'auto',
                  transform: position === 'top' || position === 'bottom' ? 'translateX(-50%)' : 'none',
                  textAlign: position === 'right' ? 'right' : 'left'
                }}
              >
                {output.name}
              </span>
            </div>
          );
        })}

      </div>
    </>
  );
};
