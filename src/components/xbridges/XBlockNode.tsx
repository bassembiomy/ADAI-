// src/components/xbridges/XBlockNode.tsx
import React from 'react';
import { Handle, Position, useUpdateNodeInternals, NodeResizer } from 'reactflow';
import { 
  Square, Activity, Plus, Minus, X, Divide, ChevronUp, MinusCircle, Maximize, Maximize2,
  Sigma, BarChart, ArrowUp, Grid, RotateCw, RefreshCcw, Hash, TrendingUp, Monitor, Box, Download,
  LogIn, LogOut, ChevronLeft, ChevronRight, Zap, Settings, ZapOff, Cpu, Layers, Wind, Filter, Eye
} from 'lucide-react';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import { XPort } from '../../engine/xbridges/types';

export const XBlockNode = ({ data, id, selected }: any) => {
  const updateNodeInternals = useUpdateNodeInternals();

  const downloadCSV = () => {
    const history = data.state?.history || [];
    if (history.length === 0) return;
    
    const numSignals = data.params?.numSignals || 1;
    const headers = ['Time', ...Array.from({ length: numSignals }, (_, i) => `In${i+1}`)];
    
    const csvRows = [
      headers,
      ...history.map((h: any) => [
        h.t, 
        ...Array.from({ length: numSignals }, (_, i) => h[`y${i+1}`])
      ])
    ];
    
    const csvContent = csvRows.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `scope_data_${id}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getSignalColor = (index: number) => {
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#06b6d4', '#8b5cf6'];
    return colors[index % colors.length];
  };

  const getColor = (type: string) => {
    if (['Constant', 'WaveformGen', 'Clock', 'Scope', 'DELAY', 'MUX', 'DEMUX', 'TERMINATOR', 'DATA_TYPE_CONVERSION'].includes(type)) return '#007acc'; // Signal (Blue)
    if (['VectorAdd', 'VectorSub', 'VectorMul', 'VectorDiv', 'VectorPow', 'UnaryNeg', 'Abs', 'SumElements', 'Mean', 'Max', 'MatrixMul', 'Transpose', 'Inverse', 'Determinant', 'GAIN', 'PRODUCT', 'SIN', 'COS', 'TAN', 'COT', 'SEC', 'COSEC', 'TRANSFER_FUNCTION', 'STATE_SPACE', 'ZERO_POLE_GAIN', 'DISCRETE_TRANSFER_FUNCTION'].includes(type)) return '#28a745'; // Math (Green)
    if (['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'XNOR', 'SWITCH', 'IF_ELSE', 'SWITCH_CASE'].includes(type)) return '#6f42c1'; // Logic (Purple)
    if (['BitwiseAND', 'BitwiseOR', 'BitwiseXOR', 'BitwiseNOT', 'ShiftLeft', 'ShiftRight'].includes(type)) return '#563d7c'; // Bitwise (Indigo)
    if (['DFlipFlop', 'JKFlipFlop', 'Register', 'Counter', 'Integrator', 'INTEGRATOR_CONTINUOUS', 'INTEGRATOR_DISCRETE', 'PID_CONTROLLER', 'PID_BASIC'].includes(type)) return '#d73a49'; // Sequential/Control (Red)
    if (type === 'MPC_CONTROLLER' || type === 'Subsystem') return '#c9a86c'; // MPC/Subsystem (Copper/Gold)
    if (['WHITE_NOISE', 'BAND_LIMITED_NOISE', 'LOW_PASS_FILTER', 'HIGH_PASS_FILTER', 'MOVING_AVERAGE'].includes(type)) return '#17a2b8'; // Signal Processing (Cyan/Teal)
    if (['KALMAN_FILTER', 'EXTENDED_KALMAN_FILTER'].includes(type)) return '#20c997'; // Estimation (Mint)
    if (['THREE_PHASE_INVERTER', 'SINGLE_PHASE_H_BRIDGE'].includes(type)) return '#ef4444'; // Power (Red)
    if (['PWM_GENERATOR', 'THREE_PHASE_PWM', 'SIX_STEP_COMMUTATION', 'SVPWM_GATE_GENERATOR', 'SVPWM_MODULATOR'].includes(type)) return '#3b82f6'; // Control (Blue)
    if (['FIELD_ORIENTED_CONTROL', 'VOLTAGE_REFERENCE_GENERATOR', 'CURRENT_CONTROLLER_DQ', 'SPEED_CONTROLLER', 'FLUX_REFERENCE', 'ROTOR_POSITION_ESTIMATOR'].includes(type)) return '#10b981'; // Control/Feedback (Emerald)
    return '#444';
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
      case 'Integrator': 
      case 'INTEGRATOR_CONTINUOUS':
      case 'INTEGRATOR_DISCRETE': return <TrendingUp size={12} />;
      case 'Scope': return <Monitor size={12} />;
      case 'DFlipFlop':
      case 'JKFlipFlop': return <RefreshCcw size={12} />;
      case 'Register': return <Box size={12} />;
      case 'Counter': return <TrendingUp size={12} />;
      case 'Clock': return <RotateCw size={12} />;
      case 'Inport': return <LogIn size={12} />;
      case 'Outport': return <LogOut size={12} />;
      case 'MUX': return <Layers size={12} />;
      case 'DEMUX': return <Grid size={12} />;
      case 'DELAY': return <TrendingUp size={12} />;
      case 'AND':
      case 'OR':
      case 'NAND':
      case 'NOR':
      case 'XOR': return <Plus size={12} />;
      case 'NOT': return <MinusCircle size={12} />;
      case 'THREE_PHASE_INVERTER':
      case 'SINGLE_PHASE_H_BRIDGE': return <Zap size={12} />;
      case 'SWITCH':
      case 'IF_ELSE':
      case 'SWITCH_CASE': return <Settings size={12} />;
      case 'DATA_TYPE_CONVERSION': return <Hash size={12} />;
      case 'NUMERIC_REPRESENTATION': return <Activity size={12} />;
      case 'TERMINATOR': return <ZapOff size={12} />;
      case 'PID_CONTROLLER':
      case 'MPC_CONTROLLER': return <Cpu size={12} />;
      case 'TRANSFER_FUNCTION':
      case 'STATE_SPACE':
      case 'ZERO_POLE_GAIN': return <Activity size={12} />;
      case 'WHITE_NOISE':
      case 'BAND_LIMITED_NOISE': return <Wind size={12} />;
      case 'LOW_PASS_FILTER':
      case 'HIGH_PASS_FILTER':
      case 'MOVING_AVERAGE': return <Filter size={12} />;
      case 'KALMAN_FILTER':
      case 'EXTENDED_KALMAN_FILTER': return <Eye size={12} />;
      case 'SIN':
      case 'COS':
      case 'TAN': return <TrendingUp size={12} />;
      case 'COT':
      case 'SEC':
      case 'COSEC': return <TrendingUp size={12} />;
      case 'Subsystem': return <Layers size={12} />;
      default: return null;
    }
  };

  const getHandleColor = (type: string) => {
    switch (type) {
      case 'vector': return '#3b82f6'; // Blue
      case 'boolean': return '#ef4444'; // Red
      case 'control': return '#f59e0b'; // Amber
      case 'transform': return '#a855f7'; // Purple
      default: return '#94a3b8'; // Gray
    }
  };

  const renderPort = (port: XPort, index: number) => {
    // Hide virtual bridging ports in the UI
    if (data.type === 'Inport' && port.id === 'in') return null;
    if (data.type === 'Outport' && port.id === 'out') return null;

    const isInput = port.direction === 'input';
    const position = 
      port.position === 'left' ? Position.Left :
      port.position === 'right' ? Position.Right :
      port.position === 'top' ? Position.Top : Position.Bottom;

    return (
      <div 
        key={port.id} 
        className="relative group flex items-center"
        style={{
          flexDirection: port.position === 'right' ? 'row-reverse' : 'row',
          margin: port.position === 'top' || port.position === 'bottom' ? '0 10px' : '5px 0'
        }}
      >
        <Handle
          type={isInput ? 'target' : 'source'}
          position={position}
          id={port.id}
          style={{
            background: getHandleColor(port.type),
            width: 8,
            height: 8,
            border: '2px solid #1a1a1a',
            zIndex: 10
          }}
        />
        <span className={`text-[8px] font-mono text-gray-500 uppercase tracking-tighter mx-1.5 transition-opacity duration-200 group-hover:text-white`}>
          {port.name}
        </span>
      </div>
    );
  };

  const color = getColor(data.type);
  const allPorts = [...(data.inputs || []), ...(data.outputs || [])];

  return (
    <div 
      className={`relative rounded-lg shadow-2xl transition-all duration-300 border-2 ${selected ? 'ring-2 ring-white/20' : ''}`}
      style={{ 
        background: '#1a1a1a',
        borderColor: color,
        minWidth: data.type === 'Scope' ? 240 : 120,
        boxShadow: selected ? `0 0 20px ${color}44` : '0 10px 30px -10px rgba(0,0,0,0.5)'
      }}
    >
      <NodeResizer minWidth={100} minHeight={40} isVisible={selected} lineStyle={{ borderColor: color }} handleStyle={{ background: color, border: 'none' }} />
      
      {/* Header */}
      <div 
        className="px-3 py-2 border-b border-white/5 flex items-center justify-between rounded-t-[6px]"
        style={{ background: `linear-gradient(to right, ${color}22, transparent)` }}
      >
        <div className="flex items-center gap-2">
          <div style={{ color }}>{getIcon(data.type)}</div>
          <span className="text-[10px] font-black text-white uppercase tracking-widest truncate max-w-[120px]">
            {data.params?.smVarId ? `[${data.label || data.type}]` : (data.label || data.type)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {data.type === 'Scope' && (
            <>
              <button 
                onClick={(e) => { e.stopPropagation(); data.onOpenScope && data.onOpenScope(id); }}
                className="p-1 hover:bg-white/10 rounded transition-colors text-blue-400"
                title="Expand Scope"
              >
                <Maximize2 size={12} />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); downloadCSV(); }}
                className="p-1 hover:bg-white/10 rounded transition-colors text-emerald-400"
                title="Download CSV"
              >
                <Download size={12} />
              </button>
            </>
          )}
          {(data.type === 'PID_CONTROLLER' || data.type === 'PID_BASIC') && (
            <div className="px-1.5 py-0.5 rounded-full bg-black/30 border border-white/10 text-[8px] font-black text-[#c9a86c]">
              {data.params?.mode || 'PID'}
            </div>
          )}
        </div>
      </div>

      <div className="flex p-2 gap-4">
        {/* Inputs */}
        <div className="flex flex-col flex-1 justify-center">
          {allPorts.filter((p: XPort) => p.position === 'left').map(renderPort)}
        </div>

        {/* Center Content / Parameters Preview */}
        <div className="flex flex-col items-center justify-center py-2 min-w-[30px] flex-[3]">
          {data.type === 'Scope' ? (
            <div className="w-full h-[80px] bg-black/40 rounded border border-white/5 p-1">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.state?.history || []}>
                  <YAxis hide domain={['auto', 'auto']} />
                  {Array.from({ length: data.params?.numSignals || 1 }, (_, i) => (
                    <Line 
                      key={i}
                      type="monotone" 
                      dataKey={`y${i+1}`} 
                      stroke={getSignalColor(i)} 
                      strokeWidth={2} 
                      dot={false} 
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : data.type === 'MPC_CONTROLLER' ? (
            <div className="w-[120px] h-[60px] bg-black/40 rounded border border-white/5 p-1">
              <div className="text-[7px] text-gray-500 uppercase font-black mb-1">Prediction Horizon</div>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={(data.outputs?.[1]?.value || []).map((v: any, i: number) => ({ i, v }))}>
                  <YAxis hide domain={['auto', 'auto']} />
                  <Line 
                    type="monotone" 
                    dataKey="v" 
                    stroke="#c9a86c" 
                    strokeWidth={1.5} 
                    dot={false} 
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex flex-col items-center opacity-100 pointer-events-none">
              <div style={{ color }} className="scale-125 mb-1">{getIcon(data.type)}</div>
              {data.type === 'Constant' && <span className="text-[10px] font-bold text-white/50">{data.params?.value}</span>}
              {data.type === 'GAIN' && <span className="text-[10px] font-bold text-white/50">K={data.params?.gain}</span>}
              {data.type === 'DATA_TYPE_CONVERSION' && <span className="text-[10px] font-bold text-emerald-400/70">{data.params?.output_type}</span>}
              {data.type === 'NUMERIC_REPRESENTATION' && (
                <div className="flex flex-col items-center">
                  <span className="text-[8px] font-black text-white/30 uppercase">Quant Error</span>
                  <span className="text-[10px] font-mono font-bold text-amber-500">
                    {(data.outputs?.[1]?.value || 0).toExponential(2)}
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Outputs */}
        <div className="flex flex-col flex-1 justify-center items-end">
          {allPorts.filter((p: XPort) => p.position === 'right').map(renderPort)}
        </div>
      </div>

      {/* Top/Bottom Ports */}
      <div className="absolute top-0 left-0 w-full flex justify-center -translate-y-full pb-1">
        {allPorts.filter((p: XPort) => p.position === 'top').map(renderPort)}
      </div>
      <div className="absolute bottom-0 left-0 w-full flex justify-center translate-y-full pt-1">
        {allPorts.filter((p: XPort) => p.position === 'bottom').map(renderPort)}
      </div>
    </div>
  );
};
