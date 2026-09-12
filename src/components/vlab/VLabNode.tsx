import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Handle, Position, useUpdateNodeInternals, useStore } from '@xyflow/react';
import { Activity } from 'lucide-react';
import { SymbolRenderer } from './VLabSymbols';
import { getBlockDimensions } from './blockDimensions';

export const getRotatedPosition = (originalPos: Position, rotation: number): Position => {
  const normRot = ((rotation % 360) + 360) % 360;
  if (normRot === 0) return originalPos;
  const posOrder = [Position.Top, Position.Right, Position.Bottom, Position.Left];
  const origIdx = posOrder.indexOf(originalPos);
  if (origIdx === -1) return originalPos;
  const shift = Math.round(normRot / 90);
  return posOrder[(origIdx + shift) % 4];
};

/**
 * Formats a clean Simulink-style badge showing the primary physical parameter
 * e.g., '100 Ω', '10 µF', '24 V', 'K = 2.5', '35 K/W'
 */
export function formatNodeParameterBadge(type: string, params: Record<string, any> = {}): string | null {
  if (!params) return null;

  if (type === 'resistor' && params.R !== undefined) {
    return `${params.R.value ?? params.R} ${params.R.unit || 'Ω'}`.trim();
  }
  if (type === 'capacitor' && params.C !== undefined) {
    return `${params.C.value ?? params.C} ${params.C.unit || 'F'}`.trim();
  }
  if (type === 'inductor' && params.L !== undefined) {
    return `${params.L.value ?? params.L} ${params.L.unit || 'H'}`.trim();
  }
  if (type === 'dc_voltage' && params.V !== undefined) {
    return `${params.V.value ?? params.V} ${params.V.unit || 'V'}`.trim();
  }
  if (type === 'ac_voltage' && params.Vpk !== undefined) {
    const fStr = params.f ? ` @ ${params.f.value ?? params.f}Hz` : '';
    return `${params.Vpk.value ?? params.Vpk}Vpk${fStr}`;
  }
  if (type === 'ps_gain' && params.K !== undefined) {
    return `K = ${params.K.value ?? params.K}`;
  }
  if (type === 'thermal_resistor' && params.Rth !== undefined) {
    return `${params.Rth.value ?? params.Rth} ${params.Rth.unit || 'K/W'}`.trim();
  }
  if ((type === 'constant' || type === 'ps_constant') && params.value !== undefined) {
    return `const ${params.value.value ?? params.value}`;
  }

  return null;
}

export const NodeErrorBoundary = class extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: any, errorInfo: any) { console.error('VLab Node Error:', error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-4 border border-red-500/50 bg-red-900/20 text-red-400 rounded-lg flex flex-col items-center justify-center text-center">
          <Activity size={24} className="mb-2 opacity-50" />
          <span className="text-[10px] font-bold uppercase tracking-wider">Rendering Failure</span>
          <span className="text-[8px] opacity-70">Check console for details</span>
        </div>
      );
    }
    return this.props.children;
  }
};

export const VLabNode = ({ id, data, selected }: { id: string; data: any; selected: boolean }) => {
  const updateNodeInternals = useUpdateNodeInternals();
  const rotation = data.rotation || 0;
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(data.label || '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLabelDraft(data.label || '');
  }, [data.label]);

  useEffect(() => {
    updateNodeInternals(id);
  }, [id, rotation, data.ports?.length, JSON.stringify(data.ports), updateNodeInternals]);

  useEffect(() => {
    if (isEditingLabel && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditingLabel]);

  const rawPorts = data.ports || [
    ...(data.inputs || []).map((p: any) => ({ ...p, pos: p.pos || p.position || 'left' })),
    ...(data.outputs || []).map((p: any) => ({ ...p, pos: p.pos || p.position || 'right' }))
  ];

  const portsBySide = rawPorts.reduce((acc: any, port: any) => {
    if (!port) return acc;
    const side = port.pos || port.position || 'left';
    if (!acc[side]) acc[side] = [];
    acc[side].push(port);
    return acc;
  }, {});

  const { width: baseWidth, height: baseHeight } = getBlockDimensions(data.type);
  const maxPortsOnSide = Math.max(
    portsBySide.left?.length || 0,
    portsBySide.right?.length || 0,
    1
  );
  const height = Math.max(baseHeight, maxPortsOnSide * 20 + 10);
  const width = baseWidth;
  const paramBadge = formatNodeParameterBadge(data.type, data.params);

  // Handles referenced by an edge -> solid fill feedback ("connected dot")
  const connectedHandles = useStore(useCallback((s: any) => {
    const set = new Set<string>();
    for (const e of s.edges) {
      if (e.source === id && e.sourceHandle) set.add(e.sourceHandle);
      if (e.target === id && e.targetHandle) set.add(e.targetHandle);
    }
    return set;
  }, [id]));

  const handleCommitRename = () => {
    setIsEditingLabel(false);
    const cleanLabel = labelDraft.trim();
    if (cleanLabel && cleanLabel !== data.label && data.onRenameNode) {
      data.onRenameNode(id, cleanLabel);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      handleCommitRename();
    } else if (e.key === 'Escape') {
      e.stopPropagation();
      setLabelDraft(data.label || '');
      setIsEditingLabel(false);
    }
  };

  return (
    <div
      data-selected={selected ? 'true' : 'false'}
      className={`vlab-node ui-card relative group flex flex-col items-center transition-all ${selected ? 'z-50' : 'z-10'}`}
      onMouseDown={(e) => data.onNodeMouseDown && data.onNodeMouseDown(e)}
    >
      {/* Symbol & Port Container */}
      <div className="relative flex items-center justify-center" style={{ width, height, transform: `rotate(${rotation}deg)` }}>
        {Object.entries(portsBySide).map(([side, sidePorts]: [any, any]) =>
          sidePorts.map((port: any, index: number) => {
            const totalOnSide = sidePorts.length;
            const offset = totalOnSide > 1 ? (index - (totalOnSide - 1) / 2) * 20 : 0;
            const position = side === 'left' ? Position.Left :
              side === 'right' ? Position.Right :
                side === 'top' ? Position.Top : Position.Bottom;
            const rotatedPos = getRotatedPosition(position, rotation);
            const handleId = `${id}-${port.id}`;
            const isConnected = connectedHandles.has(handleId);
            const pc = data.color || '#3b82f6';

            return (
              <div key={port.id} className="absolute"
                style={{
                  width: 12, height: 12,
                  top: (side === 'left' || side === 'right') ? `calc(50% + ${offset}px - 6px)` : (side === 'top' ? '-6px' : 'calc(100% - 6px)'),
                  left: (side === 'top' || side === 'bottom') ? `calc(50% + ${offset}px - 6px)` : (side === 'left' ? '-6px' : 'calc(100% - 6px)')
                }}>
                <Handle
                  type="source"
                  position={rotatedPos}
                  id={handleId}
                  title={port.domain === 'isothermal_liquid' ? 'Isothermal Liquid conserving port' : `${port.domain || data.domain || 'Physical'} conserving port`}
                  className={isConnected ? 'vlab-handle vlab-handle-connected' : 'vlab-handle'}
                  style={{ ['--pc' as any]: pc }}
                />
                <Handle
                  type="target"
                  position={rotatedPos}
                  id={handleId}
                  title={port.domain === 'isothermal_liquid' ? 'Isothermal Liquid conserving port' : `${port.domain || data.domain || 'Physical'} conserving port`}
                  className={isConnected ? 'vlab-handle vlab-handle-connected' : 'vlab-handle'}
                  style={{ ['--pc' as any]: pc }}
                />
                {/* Port label */}
                <div className="absolute text-[8px] font-bold select-none pointer-events-none uppercase whitespace-nowrap"
                  style={{
                    color: isConnected ? pc : '#9a9aac',
                    top: side === 'top' ? -16 : side === 'bottom' ? 16 : 0,
                    left: side === 'left' ? -14 : side === 'right' ? 14 : 0,
                    transform: (side === 'left' || side === 'right') ? `translateY(-50%) rotate(${-rotation}deg)` : `translateX(-50%) rotate(${-rotation}deg)`
                  }}>
                  {port.label}
                </div>
              </div>
            );
          })
        )}

        {/* The SVG Symbol */}
        <div className={selected ? 'symbol-bright' : ''}>
          <SymbolRenderer type={data.type} color={data.color} />
        </div>
      </div>

      {/* Clean instance label beneath the symbol with inline double-click editing */}
      <div className="mt-1.5 flex flex-col items-center max-w-[160px]">
        {isEditingLabel ? (
          <input
            ref={inputRef}
            type="text"
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onBlur={handleCommitRename}
            onKeyDown={handleKeyDown}
            className="bg-[#121217] border border-purple-500 text-purple-200 text-xs px-1.5 py-0.5 rounded outline-none text-center font-mono shadow-lg min-w-[80px]"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          />
        ) : (
          <div
            onDoubleClick={(e) => {
              e.stopPropagation();
              setIsEditingLabel(true);
            }}
            title="Double-click to rename block"
            className={`text-[11px] font-medium tracking-wide transition-all cursor-text text-center truncate max-w-[150px] px-1 rounded hover:bg-white/5 ${
              selected
                ? 'text-purple-300 font-semibold drop-shadow-[0_0_8px_rgba(168,85,247,0.4)]'
                : 'text-zinc-300'
            }`}
          >
            {data.label || data.type}
          </div>
        )}

        {/* Simulink-style Parameter Value Badge */}
        {paramBadge && (
          <span className="text-[9px] font-mono text-zinc-500 bg-white/[0.04] px-1 py-0.2 rounded border border-white/5 mt-0.5 pointer-events-none truncate max-w-[140px]">
            {paramBadge}
          </span>
        )}
      </div>
    </div>
  );
};
