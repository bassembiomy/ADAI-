// src/components/xbridges/XBlockNode.tsx
import React from 'react';
import { Handle, Position, useUpdateNodeInternals, NodeResizer } from 'reactflow';
import { 
  Square, Activity, Plus, Minus, X, Divide, ChevronUp, MinusCircle, Maximize, 
  Sigma, BarChart, ArrowUp, Grid, RotateCw, RefreshCcw, Hash, TrendingUp, Monitor, Box, Download,
  LogIn, LogOut, ChevronLeft, ChevronRight, Zap, Settings, ZapOff, Cpu, Layers, Wind, Filter, Eye
} from 'lucide-react';
import { XPort } from '../../engine/xbridges/types';

export const XBlockNode = ({ data, id, selected }: any) => {
  const updateNodeInternals = useUpdateNodeInternals();

  const getColor = (type: string) => {
    if (['Constant', 'WaveformGen', 'Clock', 'Scope', 'DELAY', 'MUX', 'DEMUX', 'TERMINATOR', 'DATA_TYPE_CONVERSION'].includes(type)) return '#007acc'; // Signal (Blue)
    if (['VectorAdd', 'VectorSub', 'VectorMul', 'VectorDiv', 'VectorPow', 'UnaryNeg', 'Abs', 'SumElements', 'Mean', 'Max', 'MatrixMul', 'Transpose', 'Inverse', 'Determinant', 'GAIN', 'PRODUCT', 'SIN', 'COS', 'TAN', 'COT', 'SEC', 'COSEC', 'TRANSFER_FUNCTION', 'STATE_SPACE', 'ZERO_POLE_GAIN', 'DISCRETE_TRANSFER_FUNCTION'].includes(type)) return '#28a745'; // Math (Green)
    if (['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'XNOR', 'SWITCH', 'IF_ELSE', 'SWITCH_CASE'].includes(type)) return '#6f42c1'; // Logic (Purple)
    if (['BitwiseAND', 'BitwiseOR', 'BitwiseXOR', 'BitwiseNOT', 'ShiftLeft', 'ShiftRight'].includes(type)) return '#563d7c'; // Bitwise (Indigo)
    if (['DFlipFlop', 'JKFlipFlop', 'Register', 'Counter', 'Integrator', 'INTEGRATOR_CONTINUOUS', 'INTEGRATOR_DISCRETE', 'PID_CONTROLLER', 'PID_BASIC'].includes(type)) return '#d73a49'; // Sequential/Control (Red)
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
      case 'TERMINATOR': return <ZapOff size={12} />;
      case 'PID_CONTROLLER': return <Cpu size={12} />;
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

  return (
    <div 
      className={`relative rounded-lg shadow-2xl transition-all duration-300 border-2 ${selected ? 'ring-2 ring-white/20' : ''}`}
      style={{ 
        background: '#1a1a1a',
        borderColor: color,
        minWidth: 120,
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
          <span className="text-[10px] font-black text-white uppercase tracking-widest truncate max-w-[80px]">
            {data.params?.smVarId ? `[${data.label || data.type}]` : (data.label || data.type)}
          </span>
        </div>
        {(data.type === 'PID_CONTROLLER' || data.type === 'PID_BASIC') && (
          <div className="px-1.5 py-0.5 rounded-full bg-black/30 border border-white/10 text-[8px] font-black text-[#c9a86c]">
            {data.params?.mode || 'PID'}
          </div>
        )}
      </div>

      <div className="flex p-2 gap-4">
        {/* Inputs */}
        <div className="flex flex-col flex-1 justify-center">
          {data.ports?.filter((p: XPort) => p.position === 'left').map(renderPort)}
        </div>

        {/* Center Content / Parameters Preview */}
        <div className="flex flex-col items-center justify-center py-2 opacity-20 pointer-events-none">
          <div style={{ color }}>{getIcon(data.type)}</div>
        </div>

        {/* Outputs */}
        <div className="flex flex-col flex-1 justify-center items-end">
          {data.ports?.filter((p: XPort) => p.position === 'right').map(renderPort)}
        </div>
      </div>

      {/* Top/Bottom Ports */}
      <div className="absolute top-0 left-0 w-full flex justify-center -translate-y-full pb-1">
        {data.ports?.filter((p: XPort) => p.position === 'top').map(renderPort)}
      </div>
      <div className="absolute bottom-0 left-0 w-full flex justify-center translate-y-full pt-1">
        {data.ports?.filter((p: XPort) => p.position === 'bottom').map(renderPort)}
      </div>
    </div>
  );
};
