import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Play, Pause, RotateCcw, ZoomIn, Download, Search, Activity, Cpu } from 'lucide-react';
import { AppNode, AppEdge, SimulationLog } from './EntropyTypes';

export interface ScopeSample {
  tick: number;
  timeMs: number;
  signals: Record<string, number>; // channelId -> 0 | 1
}

export interface ScopeChannel {
  id: string;
  name: string;
  label: string;
  type: 'process' | 'state' | 'event';
  color: string;
}

export interface OpmSimulationScopeProps {
  simRunning: boolean;
  currentTick: number;
  tickMs: number;
  nodes: AppNode[];
  edges?: AppEdge[];
  recentLogs?: SimulationLog[];
  onReset?: () => void;
  maxSamples?: number;
}

export const OpmSimulationScope: React.FC<OpmSimulationScopeProps> = ({
  simRunning,
  currentTick,
  tickMs,
  nodes,
  edges = [],
  recentLogs = [],
  onReset,
  maxSamples = 120,
}) => {
  const [samples, setSamples] = useState<ScopeSample[]>([]);
  const [zoom, setZoom] = useState<number>(1);
  const [filterText, setFilterText] = useState<string>('');
  const lastRecordedTick = useRef<number>(-1);

  // Derive channels from current diagram nodes
  const channels: ScopeChannel[] = useMemo(() => {
    const list: ScopeChannel[] = [];

    // 1. Process Channels
    nodes
      .filter((n) => n.data.type === 'process')
      .forEach((proc) => {
        list.push({
          id: `proc_${proc.id}`,
          name: proc.data.name,
          label: proc.data.name,
          type: 'process',
          color: '#38bdf8', // Sky-400
        });
      });

    // 2. Object State Channels
    nodes
      .filter((n) => n.data.type === 'object')
      .forEach((obj) => {
        const states = obj.data.states || [];
        states.forEach((st) => {
          list.push({
            id: `st_${st.id}`,
            name: `${obj.data.name}::${st.name}`,
            label: `${obj.data.name}::${st.name}`,
            type: 'state',
            color: '#10b981', // Emerald-500
          });
        });
      });

    return list;
  }, [nodes]);

  // Record tick sample when currentTick advances
  useEffect(() => {
    if (currentTick < 0) return;

    // Reset buffer if tick goes backward (e.g. simulation reset)
    if (currentTick === 0 && lastRecordedTick.current > 0) {
      setSamples([]);
      lastRecordedTick.current = 0;
    }

    if (currentTick === lastRecordedTick.current) return;
    lastRecordedTick.current = currentTick;

    const signalSnapshot: Record<string, number> = {};

    // Sample processes
    nodes
      .filter((n) => n.data.type === 'process')
      .forEach((proc) => {
        signalSnapshot[`proc_${proc.id}`] = (proc.data as any).isFiring ? 1 : 0;
      });

    // Sample states
    nodes
      .filter((n) => n.data.type === 'object')
      .forEach((obj) => {
        (obj.data.states || []).forEach((st) => {
          signalSnapshot[`st_${st.id}`] = (st as any).isActive ? 1 : 0;
        });
      });

    const newSample: ScopeSample = {
      tick: currentTick,
      timeMs: currentTick * tickMs,
      signals: signalSnapshot,
    };

    setSamples((prev) => {
      const updated = [...prev, newSample];
      return updated.length > maxSamples ? updated.slice(updated.length - maxSamples) : updated;
    });
  }, [currentTick, tickMs, nodes, maxSamples]);

  const handleClear = () => {
    setSamples([]);
    lastRecordedTick.current = -1;
    if (onReset) onReset();
  };

  const handleExportCsv = () => {
    if (samples.length === 0) return;
    const header = ['Tick', 'TimeMs', ...channels.map((c) => `"${c.label}"`)].join(',');
    const rows = samples.map((s) => {
      const vals = channels.map((c) => s.signals[c.id] ?? 0);
      return [s.tick, s.timeMs, ...vals].join(',');
    });
    const csvContent = [header, ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `opm_simulation_scope_tick_${currentTick}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter channels based on search text
  const filteredChannels = useMemo(() => {
    if (!filterText.trim()) return channels;
    const lower = filterText.toLowerCase();
    return channels.filter((c) => c.label.toLowerCase().includes(lower));
  }, [channels, filterText]);

  // Dimensions for waveform SVG
  const trackHeight = 36;
  const signalHeight = 20;
  const channelLabelWidth = 160;
  const tickStepPx = Math.max(12, 18 * zoom);
  const totalTicks = Math.max(samples.length, 25);
  const waveformWidth = totalTicks * tickStepPx;
  const totalHeight = Math.max(filteredChannels.length * trackHeight, 140);

  return (
    <div
      data-testid="opm-scope-timeline"
      className="flex flex-col h-full w-full bg-[#111113] border border-[#26262a] rounded-lg overflow-hidden select-none text-gray-200"
    >
      {/* Scope Toolbar / Control Header */}
      <div className="h-10 px-3 bg-[#17171a] border-b border-[#26262a] flex items-center justify-between shrink-0 gap-2">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-black/40 border border-white/5">
            <Activity size={13} className="text-orange-400" />
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-orange-400">
              Logic Scope
            </span>
          </div>

          <span
            data-testid="opm-scope-tick-counter"
            className="text-[10px] font-mono font-semibold text-gray-300 bg-[#0c0c0e] px-2 py-0.5 rounded border border-[#2d2d32]"
          >
            Tick {currentTick} ({currentTick * tickMs}ms)
          </span>

          <span
            className={`text-[9px] px-1.5 py-0.5 rounded font-black uppercase tracking-wider flex items-center gap-1 ${
              simRunning
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${simRunning ? 'bg-green-400 animate-ping' : 'bg-amber-400'}`} />
            {simRunning ? 'LIVE RUN' : 'PAUSED'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Channel Search Filter */}
          <div className="relative flex items-center">
            <Search size={11} className="absolute left-2 text-gray-500" />
            <input
              type="text"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              placeholder="Filter channels..."
              className="bg-[#0c0c0e] border border-[#333] rounded pl-6 pr-2 py-0.5 text-[10px] w-28 text-gray-200 focus:outline-none focus:border-orange-500/60"
            />
          </div>

          {/* Zoom Selector */}
          <div className="flex items-center gap-1 bg-[#0c0c0e] px-1.5 py-0.5 rounded border border-[#333]">
            <ZoomIn size={11} className="text-gray-400" />
            <select
              data-testid="opm-scope-zoom-select"
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="bg-transparent text-[10px] font-mono text-gray-300 outline-none cursor-pointer"
            >
              <option value="0.5" className="bg-[#1a1a1a]">0.5x</option>
              <option value="1" className="bg-[#1a1a1a]">1.0x</option>
              <option value="2" className="bg-[#1a1a1a]">2.0x</option>
              <option value="4" className="bg-[#1a1a1a]">4.0x</option>
            </select>
          </div>

          {/* Export CSV Button */}
          <button
            onClick={handleExportCsv}
            disabled={samples.length === 0}
            title="Export scope trace to CSV"
            className="p-1 rounded bg-[#0c0c0e] border border-[#333] text-gray-400 hover:text-white disabled:opacity-40 disabled:hover:text-gray-400 transition-colors"
          >
            <Download size={12} />
          </button>

          {/* Clear Scope Button */}
          <button
            data-testid="opm-scope-clear"
            onClick={handleClear}
            title="Clear scope history"
            className="p-1 rounded bg-[#0c0c0e] border border-[#333] text-amber-400 hover:bg-amber-950/30 transition-colors"
          >
            <RotateCcw size={12} />
          </button>
        </div>
      </div>

      {/* Main Scope Display Area */}
      <div className="flex-1 min-h-0 flex overflow-hidden">
        {filteredChannels.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 text-xs italic p-4 text-center">
            <Cpu size={28} className="text-gray-600 mb-2 stroke-[1.5]" />
            No active process or state signals detected.
            <span className="text-[10px] text-gray-600 mt-1">
              Add processes and objects with states to the diagram to view waveforms.
            </span>
          </div>
        ) : (
          <div className="flex-1 flex overflow-x-auto overflow-y-auto custom-scrollbar">
            {/* Left Channel Headers Panel */}
            <div
              className="shrink-0 bg-[#141417] border-r border-[#26262a] z-10 sticky left-0"
              style={{ width: `${channelLabelWidth}px` }}
            >
              {/* Time header spacer */}
              <div className="h-6 border-b border-[#26262a] px-2 flex items-center text-[8.5px] font-mono text-gray-500 uppercase tracking-wider bg-[#101012]">
                Signal / Channel
              </div>

              {/* Channel rows */}
              {filteredChannels.map((ch, idx) => {
                const latestSample = samples[samples.length - 1];
                const currentVal = latestSample?.signals[ch.id] ?? 0;

                return (
                  <div
                    key={ch.id}
                    className="flex items-center justify-between px-2.5 border-b border-[#1f1f24] hover:bg-white/[0.02] transition-colors"
                    style={{ height: `${trackHeight}px` }}
                  >
                    <div className="flex items-center gap-1.5 min-w-0 pr-1">
                      <span
                        className="w-2 h-2 rounded-full shrink-0 shadow-sm"
                        style={{ backgroundColor: ch.color }}
                      />
                      <span className="text-[10px] font-semibold text-gray-300 truncate font-mono" title={ch.label}>
                        {ch.label}
                      </span>
                    </div>

                    <span
                      className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded shrink-0 ${
                        currentVal === 1
                          ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40'
                          : 'text-gray-600 bg-black/40'
                      }`}
                    >
                      {currentVal === 1 ? 'HIGH' : 'LOW'}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Right Waveform Canvas / SVG Tracks */}
            <div className="flex-1 flex flex-col min-w-0" style={{ minWidth: `${waveformWidth}px` }}>
              {/* Time Axis Row */}
              <div className="h-6 border-b border-[#26262a] bg-[#101012] flex items-center relative select-none">
                {Array.from({ length: totalTicks + 1 }).map((_, tIdx) => {
                  if (tIdx % 5 !== 0) return null;
                  return (
                    <div
                      key={tIdx}
                      className="absolute flex flex-col items-center"
                      style={{ left: `${tIdx * tickStepPx}px` }}
                    >
                      <span className="text-[8px] font-mono text-gray-500">T{tIdx}</span>
                    </div>
                  );
                })}
              </div>

              {/* Waveform Tracks SVG */}
              <div className="relative bg-[#0d0d10]" style={{ height: `${totalHeight}px` }}>
                <svg
                  width={waveformWidth}
                  height={totalHeight}
                  className="absolute inset-0 block pointer-events-none"
                >
                  {/* Grid Lines */}
                  {Array.from({ length: totalTicks + 1 }).map((_, tIdx) => (
                    <line
                      key={`grid_${tIdx}`}
                      x1={tIdx * tickStepPx}
                      y1={0}
                      x2={tIdx * tickStepPx}
                      y2={totalHeight}
                      stroke="#1a1a20"
                      strokeWidth={1}
                      strokeDasharray={tIdx % 5 === 0 ? undefined : '2 2'}
                    />
                  ))}

                  {/* Horizontal Track Dividers */}
                  {filteredChannels.map((_, idx) => (
                    <line
                      key={`hdiv_${idx}`}
                      x1={0}
                      y1={(idx + 1) * trackHeight}
                      x2={waveformWidth}
                      y2={(idx + 1) * trackHeight}
                      stroke="#1e1e24"
                      strokeWidth={1}
                    />
                  ))}

                  {/* Waveforms per Channel */}
                  {filteredChannels.map((ch, chIdx) => {
                    const topY = chIdx * trackHeight + 8;
                    const botY = topY + signalHeight;

                    // Generate step path through all samples
                    let pathD = '';
                    if (samples.length > 0) {
                      samples.forEach((samp, sIdx) => {
                        const x = samp.tick * tickStepPx;
                        const val = samp.signals[ch.id] ?? 0;
                        const y = val === 1 ? topY : botY;

                        if (sIdx === 0) {
                          pathD += `M ${x} ${y}`;
                        } else {
                          const prevSamp = samples[sIdx - 1];
                          const prevVal = prevSamp.signals[ch.id] ?? 0;
                          const prevY = prevVal === 1 ? topY : botY;

                          // Step transition
                          if (prevY !== y) {
                            pathD += ` H ${x} V ${y}`;
                          } else {
                            pathD += ` H ${x}`;
                          }
                        }
                      });

                      // Extend to current tick if simulation is at higher tick
                      if (samples.length > 0 && currentTick > samples[samples.length - 1].tick) {
                        const lastSamp = samples[samples.length - 1];
                        const lastVal = lastSamp.signals[ch.id] ?? 0;
                        const lastY = lastVal === 1 ? topY : botY;
                        pathD += ` H ${currentTick * tickStepPx}`;
                      }
                    } else {
                      // Idle flatline at 0
                      pathD = `M 0 ${botY} H ${waveformWidth}`;
                    }

                    return (
                      <g key={`track_${ch.id}`}>
                        {/* Shaded Area for active HIGH pulses */}
                        <path
                          d={pathD}
                          fill="none"
                          stroke={ch.color}
                          strokeWidth={1.75}
                          strokeLinecap="round"
                          strokeLinejoin="miter"
                        />
                      </g>
                    );
                  })}

                  {/* Current Playhead Cursor Line */}
                  <line
                    x1={currentTick * tickStepPx}
                    y1={0}
                    x2={currentTick * tickStepPx}
                    y2={totalHeight}
                    stroke="#f59e0b"
                    strokeWidth={2}
                    strokeDasharray="4 2"
                  />
                </svg>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
