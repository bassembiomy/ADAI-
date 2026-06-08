// src/components/xbridges/XBlockNode.tsx
import React from 'react';
import { Handle, Position, useUpdateNodeInternals, NodeResizer } from 'reactflow';
import { 
  Square, Activity, Plus, Minus, X, Divide, ChevronUp, MinusCircle, Maximize, Maximize2,
  Sigma, BarChart, ArrowUp, Grid, RotateCw, RefreshCcw, Hash, TrendingUp, Monitor, Box, Download,
  LogIn, LogOut, ChevronLeft, ChevronRight, Zap, Settings, ZapOff, Cpu, Layers, Wind, Filter, Eye,
  GraduationCap, ArrowRightCircle, ArrowLeftCircle, Network
} from 'lucide-react';
import { LineChart, Line, AreaChart, Area, ResponsiveContainer, YAxis } from 'recharts';
import { XPort } from '../../engine/xbridges/types';
import { XBRIDGES_CATEGORIES } from '../../engine/xbridges/BlockDefinitions';

// Map icon string names to Lucide icon components
const LucideIconMap: Record<string, React.ComponentType<any>> = {
  'square': Square,
  'activity': Activity,
  'plus': Plus,
  'minus': Minus,
  'x': X,
  'divide': Divide,
  'chevron-up': ChevronUp,
  'minus-circle': MinusCircle,
  'maximize': Maximize,
  'maximize2': Maximize2,
  'sigma': Sigma,
  'bar-chart': BarChart,
  'arrow-up': ArrowUp,
  'grid': Grid,
  'rotate-cw': RotateCw,
  'refresh-ccw': RefreshCcw,
  'hash': Hash,
  'trending-up': TrendingUp,
  'monitor': Monitor,
  'box': Box,
  'download': Download,
  'log-in': LogIn,
  'log-out': LogOut,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'zap': Zap,
  'settings': Settings,
  'zap-off': ZapOff,
  'cpu': Cpu,
  'layers': Layers,
  'wind': Wind,
  'filter': Filter,
  'eye': Eye,
  'graduation-cap': GraduationCap,
  'arrow-right-circle': ArrowRightCircle,
  'arrow-left-circle': ArrowLeftCircle,
  'network': Network,
  'integral': TrendingUp,
};

// Build mapping of block type to icon name from categories
const blockTypeToIconName: Record<string, string> = {};
XBRIDGES_CATEGORIES.forEach(cat => {
  cat.blocks.forEach(b => {
    blockTypeToIconName[b.type] = b.icon;
  });
});

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
    if (['MPC_CONTROLLER', 'Subsystem', 'DOE_MODEL', 'AC_MOTOR_PID_CONTROL', 'LMS_ADAPTIVE_FILTER', 'NEURAL_NEURON_LEARNING', 'RL_Q_LEARNING_CONTROLLER'].includes(type)) return '#c9a86c'; // MPC/Subsystem/DOE/Learning (Copper/Gold)
    if (['WHITE_NOISE', 'BAND_LIMITED_NOISE', 'LOW_PASS_FILTER', 'HIGH_PASS_FILTER', 'MOVING_AVERAGE'].includes(type)) return '#17a2b8'; // Signal Processing (Cyan/Teal)
    if (['KALMAN_FILTER', 'EXTENDED_KALMAN_FILTER'].includes(type)) return '#20c997'; // Estimation (Mint)
    if (['THREE_PHASE_INVERTER', 'SINGLE_PHASE_H_BRIDGE'].includes(type)) return '#ef4444'; // Power (Red)
    if (['PWM_GENERATOR', 'THREE_PHASE_PWM', 'SIX_STEP_COMMUTATION', 'SVPWM_GATE_GENERATOR', 'SVPWM_MODULATOR'].includes(type)) return '#3b82f6'; // Control (Blue)
    if (['FIELD_ORIENTED_CONTROL', 'VOLTAGE_REFERENCE_GENERATOR', 'CURRENT_CONTROLLER_DQ', 'SPEED_CONTROLLER', 'FLUX_REFERENCE', 'ROTOR_POSITION_ESTIMATOR'].includes(type)) return '#10b981'; // Control/Feedback (Emerald)
    return '#444';
  };

  const getIcon = (type: string) => {
    const iconName = blockTypeToIconName[type] || data?.icon;
    if (iconName && LucideIconMap[iconName]) {
      const IconComponent = LucideIconMap[iconName];
      return <IconComponent size={12} />;
    }

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
      case 'Subsystem':
      case 'DOE_MODEL': return <Layers size={12} />;
      default: return <Box size={12} />;
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

  const isPulsing = !!data.pulse;

  return (
    <div 
      className={`relative rounded-xl overflow-hidden transition-all duration-500 border-2 ${selected ? 'ring-4 ring-white/10 scale-105 z-50' : 'hover:border-white/20'} ${isPulsing ? 'block-pulse-highlight' : ''}`}
      style={{ 
        background: 'rgba(20, 20, 20, 0.8)',
        backdropFilter: 'blur(20px)',
        borderColor: selected ? color : 'rgba(255,255,255,0.05)',
        minWidth: data.type === 'Scope' ? 260 : 130,
        boxShadow: selected 
          ? `0 20px 50px -10px rgba(0,0,0,0.8), 0 0 30px ${color}33` 
          : '0 10px 30px -10px rgba(0,0,0,0.5)'
      }}
    >
      <NodeResizer minWidth={100} minHeight={40} isVisible={selected} lineStyle={{ borderColor: color }} handleStyle={{ background: color, border: 'none', borderRadius: '4px' }} />
      
      {/* Header with Glowing Accent */}
      <div 
        className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between relative overflow-hidden"
        style={{ background: `linear-gradient(to right, ${color}15, transparent)` }}
      >
        <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-right from-white/10 to-transparent" />
        <div className="flex items-center gap-2.5 z-10">
          <div className="p-1.5 rounded-lg bg-black/40 shadow-inner" style={{ color }}>
            {getIcon(data.type)}
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] font-black text-white/90 uppercase tracking-[0.2em] leading-tight">
              {data.label || data.type}
            </span>
            {data.params?.smVarId && (
              <span className="text-[7px] text-[#c9a86c] font-bold uppercase tracking-widest mt-0.5">
                Linked: {data.params.smVarId}
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-1 z-10">
          {data.type === 'Scope' && (
            <div className="flex bg-black/30 p-0.5 rounded-lg border border-white/5">
              <button 
                onClick={(e) => { e.stopPropagation(); data.onOpenScope && data.onOpenScope(id); }}
                className="p-1.5 hover:bg-white/10 rounded-md transition-all text-blue-400/70 hover:text-blue-400"
                title="Full Screen Scope"
              >
                <Maximize2 size={12} />
              </button>
              <button 
                onClick={(e) => { e.stopPropagation(); downloadCSV(); }}
                className="p-1.5 hover:bg-white/10 rounded-md transition-all text-emerald-400/70 hover:text-emerald-400"
                title="Export Data"
              >
                <Download size={12} />
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex p-3 gap-5 relative">
        {/* Decorative Grid Overlay for Node Body */}
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none" 
             style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '10px 10px' }} />

        {/* Inputs Column */}
        <div className="flex flex-col flex-1 justify-center gap-2 z-10">
          {allPorts.filter((p: XPort) => p.position === 'left').map(renderPort)}
        </div>

        {/* Dynamic Center Stage */}
        <div className="flex flex-col items-center justify-center py-1 min-w-[40px] flex-[4] z-10">
          {data.type === 'Scope' ? (
            <div className="w-full h-[90px] bg-black/60 rounded-xl border border-white/5 p-2 shadow-inner group/scope overflow-hidden relative">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.1),transparent)]" />
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.state?.history?.slice(-50).map((sample: any, i: number) => {
                  let val = 0;
                  if (typeof sample === 'number') {
                    val = sample;
                  } else if (sample && typeof sample === 'object') {
                    val = sample.y1 !== undefined ? sample.y1 : (sample.y !== undefined ? sample.y : 0);
                  }
                  return { i, v: Number(val) || 0 };
                }) || []}>
                  <defs>
                    <linearGradient id={`grad-${id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <YAxis hide domain={['auto', 'auto']} />
                  <Area 
                    type="monotone" 
                    dataKey="v" 
                    stroke="#10b981" 
                    strokeWidth={2} 
                    fillOpacity={1} 
                    fill={`url(#grad-${id})`}
                    isAnimationActive={false}
                    className="drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]"
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className="absolute top-1 right-2 text-[6px] font-black text-emerald-500/50 uppercase tracking-widest animate-pulse">Live Trace</div>
            </div>
          ) : data.type === 'Subsystem' ? (
            <div className="flex flex-col items-center group/sub cursor-pointer">
              <div className="p-3 rounded-2xl bg-white/5 border border-white/10 group-hover/sub:bg-[#c9a86c]/10 group-hover/sub:border-[#c9a86c]/30 transition-all duration-500 shadow-xl">
                <Layers size={24} className="text-[#c9a86c] drop-shadow-[0_0_10px_rgba(201,168,108,0.3)]" />
              </div>
              <span className="text-[7px] font-black text-gray-500 uppercase tracking-widest mt-2 group-hover/sub:text-[#c9a86c]">Double-click to Enter</span>
            </div>
          ) : data.type === 'DOE_MODEL' ? (
            <div className="flex flex-col items-center text-center">
               <div className="p-3 rounded-2xl bg-[#c9a86c]/10 border border-[#c9a86c]/20 mb-3 shadow-[0_0_15px_rgba(201,168,108,0.1)]">
                  <Layers size={28} className="text-[#c9a86c] drop-shadow-[0_0_8px_rgba(201,168,108,0.4)]" />
               </div>
               <span className="text-[8px] font-black text-[#c9a86c] uppercase tracking-[0.2em] mb-1">
                 {data.modelType || 'RSM'} MODEL
               </span>
               {data.metrics?.R2 !== undefined && (
                 <div className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                   <span className="text-[9px] font-mono font-bold text-emerald-400">
                     R²: {(data.metrics.R2 * 100).toFixed(1)}%
                   </span>
                 </div>
               )}
            </div>
          ) : (
            <div className="flex flex-col items-center">
               <div className="p-3 rounded-xl bg-white/[0.03] border border-white/5 mb-2 shadow-inner">
                  <div style={{ color }} className="scale-150 drop-shadow-[0_0_8px_currentColor]">{getIcon(data.type)}</div>
               </div>
               {data.type === 'Constant' && (
                 <div className="px-2 py-0.5 rounded-full bg-black/40 border border-white/5 text-[10px] font-mono font-bold text-white/70 tabular-nums">
                   {data.params?.value}
                 </div>
               )}
               {data.type === 'GAIN' && (
                 <div className="flex items-center gap-1.5 text-[10px] font-black text-white/40 uppercase tracking-tighter">
                   <span>GAIN</span>
                   <span className="text-[#c9a86c] font-mono">{data.params?.gain}</span>
                 </div>
               )}
            </div>
          )}
        </div>

        {/* Outputs Column */}
        <div className="flex flex-col flex-1 justify-center items-end gap-2 z-10">
          {allPorts.filter((p: XPort) => p.position === 'right').map(renderPort)}
        </div>
      </div>

      {/* Top/Bottom Port Containers */}
      <div className="absolute top-0 left-0 w-full flex justify-center -translate-y-1/2 px-10 gap-4">
        {allPorts.filter((p: XPort) => p.position === 'top').map(renderPort)}
      </div>
      <div className="absolute bottom-0 left-0 w-full flex justify-center translate-y-1/2 px-10 gap-4">
        {allPorts.filter((p: XPort) => p.position === 'bottom').map(renderPort)}
      </div>
      
      {/* Selection Glow Footer */}
      {selected && <div className="absolute bottom-0 left-0 w-full h-[2px]" style={{ background: `linear-gradient(to right, transparent, ${color}, transparent)` }} />}
    </div>
  );
};
