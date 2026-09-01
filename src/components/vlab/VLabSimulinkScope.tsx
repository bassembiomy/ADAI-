import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Activity,
  Download,
  Settings,
  Minus,
  Maximize2,
  X,
  Layers,
  ZoomIn,
  ZoomOut,
  RefreshCcw,
  Sliders,
  Move,
  Crosshair,
  BarChart2,
  Grid,
  Sparkles,
  ChevronDown
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine
} from 'recharts';
import {
  getVLabSignalInfo,
  exportScopeToCSV,
  calculateSignalStatistics,
  calculateCursorDeltas,
  calculateAutoScaleRange,
  SIMULINK_SCOPE_COLORS,
  VLabSignalInfo
} from '../../utils/scopeUtils';

export type ScopeLayoutType = '1x1' | '2x1' | '1x2' | '2x2' | '3x1' | '4x1';
export type ScopeZoomMode = 'none' | 'box' | 'x' | 'y' | 'pan';

export interface VLabSimulinkScopeProps {
  id: string;
  data: any[];
  title?: string;
  isPaused?: boolean;
  params: any;
  nodes?: any[];
  edges?: any[];
  onClose: () => void;
  onUpdate?: (data: any) => void;
}

export const VLabSimulinkScope: React.FC<VLabSimulinkScopeProps> = ({
  id,
  data = [],
  title = 'Scope',
  isPaused = false,
  params,
  nodes = [],
  edges = [],
  onClose,
  onUpdate
}) => {
  // Window position and sizing
  const [pos, setPos] = useState({ x: 80 + Math.random() * 40, y: 80 + Math.random() * 40 });
  const [isDragging, setIsDragging] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Scope state & tools
  const [layout, setLayout] = useState<ScopeLayoutType>('1x1');
  const [zoomMode, setZoomMode] = useState<ScopeZoomMode>('none');
  const [showCursors, setShowCursors] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLayoutMenu, setShowLayoutMenu] = useState(false);
  const [hiddenChannels, setHiddenChannels] = useState<Record<string, boolean>>({});

  // Zoom & Scale bounds override
  const [autoScaleCounter, setAutoScaleCounter] = useState(0);
  const [timeZoomRange, setTimeZoomRange] = useState<{ min?: number; max?: number } | null>(null);
  const [yScaleOverrides, setYScaleOverrides] = useState<Record<number, [number, number]>>({});

  // Cursors state (time values)
  const [cursor1Time, setCursor1Time] = useState<number | null>(null);
  const [cursor2Time, setCursor2Time] = useState<number | null>(null);
  const [activeCursor, setActiveCursor] = useState<'C1' | 'C2'>('C1');

  // Channels metadata
  const numChannels = Math.max(1, Math.min(8, Number(params?.numSignals?.value) || 1));
  const timeRangeParam = params?.time_range?.value || 10;
  const showGrid = params?.show_grid?.value !== 'off';
  const showLegend = params?.show_legend?.value !== 'off';

  const signalInfos: VLabSignalInfo[] = useMemo(() => {
    return Array.from({ length: numChannels }, (_, i) => getVLabSignalInfo(id, i, nodes, edges, data));
  }, [id, numChannels, nodes, edges, data]);

  const channelKeys = useMemo(() => {
    return Array.from({ length: numChannels }, (_, i) => `in${i + 1}`);
  }, [numChannels]);

  // Snap Cursor Helpers
  const handleSnapCursor = (cursor: 'C1' | 'C2', target: 'max' | 'min' | 'center') => {
    if (displayData.length === 0) return;
    const firstT = displayData[0].time !== undefined ? displayData[0].time : 0;
    const lastT = displayData[displayData.length - 1].time !== undefined ? displayData[displayData.length - 1].time : 10;

    if (target === 'center') {
      const span = lastT - firstT;
      setCursor1Time(firstT + span * 0.25);
      setCursor2Time(firstT + span * 0.75);
      return;
    }

    let targetTime = firstT;
    let extremeVal = target === 'max' ? -Infinity : Infinity;

    displayData.forEach(pt => {
      const val = pt.in1 !== undefined ? pt.in1 : (pt.value ?? 0);
      if (typeof val === 'number') {
        if (target === 'max' && val > extremeVal) {
          extremeVal = val;
          targetTime = pt.time;
        } else if (target === 'min' && val < extremeVal) {
          extremeVal = val;
          targetTime = pt.time;
        }
      }
    });

    if (cursor === 'C1') setCursor1Time(targetTime);
    else setCursor2Time(targetTime);
  };

  // Window drag handlers
  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (isDragging && !isMaximized) {
        setPos({ x: Math.max(0, e.clientX - 250), y: Math.max(0, e.clientY - 20) });
      }
    };
    const handleUp = () => setIsDragging(false);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, isMaximized]);

  // Sliced & normalized display data based on time range and time zoom
  const displayData = useMemo(() => {
    if (!data || data.length === 0) {
      // Default idle zero baseline so axes and grid render cleanly before acquisition
      const defaultSpan = timeRangeParam === 'auto' ? 10 : (Number(timeRangeParam) || 10);
      const idlePt1: Record<string, any> = { time: 0 };
      const idlePt2: Record<string, any> = { time: defaultSpan };
      channelKeys.forEach(k => {
        idlePt1[k] = 0;
        idlePt2[k] = 0;
      });
      return [idlePt1, idlePt2];
    }

    let sliced = data;
    if (timeZoomRange && timeZoomRange.min !== undefined && timeZoomRange.max !== undefined) {
      sliced = data.filter(pt => {
        const t = pt.time !== undefined ? pt.time : (pt.t || 0);
        return t >= timeZoomRange.min! && t <= timeZoomRange.max!;
      });
    } else if (timeRangeParam !== 'auto') {
      const limit = Number(timeRangeParam);
      if (!isNaN(limit) && limit > 0) {
        const maxTime = data[data.length - 1].time !== undefined ? data[data.length - 1].time : (data[data.length - 1].t || 0);
        sliced = data.filter(pt => {
          const t = pt.time !== undefined ? pt.time : (pt.t || 0);
          return t >= maxTime - limit;
        });
      }
    }

    if (sliced.length === 0) return [];

    return sliced.map((pt, idx) => {
      const t = pt.time !== undefined ? pt.time : (pt.t !== undefined ? pt.t : idx * 0.05);
      const normalizedPt: Record<string, any> = { time: t };

      // Collect all numeric values in point excluding time/t
      const rawNumericEntries: [string, number][] = [];
      Object.entries(pt).forEach(([k, v]) => {
        if (k !== 'time' && k !== 't' && typeof v === 'number' && Number.isFinite(v)) {
          rawNumericEntries.push([k, v]);
        }
      });

      // Map every channel key: in1, in2, in3...
      channelKeys.forEach((chKey, i) => {
        if (pt[chKey] !== undefined && Number.isFinite(Number(pt[chKey]))) {
          normalizedPt[chKey] = Number(pt[chKey]);
        } else if (i === 0 && pt.value !== undefined && Number.isFinite(Number(pt.value))) {
          normalizedPt[chKey] = Number(pt.value);
        } else if (i < rawNumericEntries.length) {
          normalizedPt[chKey] = rawNumericEntries[i][1];
        } else if (rawNumericEntries.length > 0) {
          normalizedPt[chKey] = rawNumericEntries[0][1];
        } else {
          normalizedPt[chKey] = 0;
        }
      });

      // Also preserve all raw keys
      Object.keys(pt).forEach(k => {
        normalizedPt[k] = pt[k];
      });

      return normalizedPt;
    });
  }, [data, timeRangeParam, timeZoomRange, channelKeys]);

  // Initial cursor default positions
  useEffect(() => {
    if (showCursors && displayData.length > 0 && cursor1Time === null) {
      const firstT = displayData[0].time !== undefined ? displayData[0].time : (displayData[0].t || 0);
      const lastT = displayData[displayData.length - 1].time !== undefined ? displayData[displayData.length - 1].time : (displayData[displayData.length - 1].t || 0);
      const span = lastT - firstT;
      setCursor1Time(firstT + span * 0.25);
      setCursor2Time(firstT + span * 0.75);
    }
  }, [showCursors, displayData, cursor1Time]);

  // Cursor interpolation values
  const cursorCalculations = useMemo(() => {
    if (!showCursors || cursor1Time === null || cursor2Time === null || displayData.length === 0) {
      return null;
    }

    const findClosestPoint = (targetT: number) => {
      let closest = displayData[0];
      let minDiff = Infinity;
      for (const pt of displayData) {
        const t = pt.time !== undefined ? pt.time : (pt.t || 0);
        const diff = Math.abs(t - targetT);
        if (diff < minDiff) {
          minDiff = diff;
          closest = pt;
        }
      }
      return closest;
    };

    const pt1 = findClosestPoint(cursor1Time);
    const pt2 = findClosestPoint(cursor2Time);

    const val1 = pt1['in1'] !== undefined ? pt1['in1'] : (pt1.value ?? 0);
    const val2 = pt2['in1'] !== undefined ? pt2['in1'] : (pt2.value ?? 0);

    const deltas = calculateCursorDeltas(
      { t: cursor1Time, val: val1 },
      { t: cursor2Time, val: val2 }
    );

    return {
      t1: cursor1Time,
      t2: cursor2Time,
      val1,
      val2,
      ...deltas
    };
  }, [showCursors, cursor1Time, cursor2Time, displayData]);

  // Signal Statistics
  const statisticsList = useMemo(() => {
    if (!showStats || displayData.length === 0) return [];
    return channelKeys.map((key, i) => {
      const stats = calculateSignalStatistics(displayData, key);
      const info = signalInfos[i];
      const color = SIMULINK_SCOPE_COLORS[i % SIMULINK_SCOPE_COLORS.length];
      return {
        key,
        name: info?.connected ? `${info.blockLabel}.${info.portName}` : `Channel ${i + 1}`,
        color,
        ...stats
      };
    });
  }, [showStats, displayData, channelKeys, signalInfos]);

  // Autoscale Handler (Simulink Binoculars)
  const handleAutoscale = () => {
    setTimeZoomRange(null);
    setYScaleOverrides({});
    setAutoScaleCounter(prev => prev + 1);
  };

  // Zoom In / Out handlers
  const handleZoomX = (factor: number) => {
    if (displayData.length === 0) return;
    const firstT = displayData[0].time !== undefined ? displayData[0].time : (displayData[0].t || 0);
    const lastT = displayData[displayData.length - 1].time !== undefined ? displayData[displayData.length - 1].time : (displayData[displayData.length - 1].t || 0);
    const centerT = (firstT + lastT) / 2;
    const halfSpan = ((lastT - firstT) / 2) * factor;
    setTimeZoomRange({ min: Math.max(0, centerT - halfSpan), max: centerT + halfSpan });
  };

  // Export CSV
  const handleExportCSV = () => {
    const csvContent = exportScopeToCSV(title || 'SimulinkScope', displayData, signalInfos);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(title || 'Scope').replace(/\s+/g, '_')}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Subplot layout partition logic
  const subplots = useMemo(() => {
    if (layout === '1x1' || numChannels === 1) {
      return [{ id: 0, label: 'Main Display', channels: channelKeys }];
    }
    if (layout === '2x1' || layout === '1x2') {
      const half = Math.ceil(channelKeys.length / 2);
      return [
        { id: 0, label: 'Subplot 1', channels: channelKeys.slice(0, half) },
        { id: 1, label: 'Subplot 2', channels: channelKeys.slice(half) }
      ];
    }
    if (layout === '3x1') {
      return [
        { id: 0, label: 'Subplot 1', channels: [channelKeys[0]] },
        { id: 1, label: 'Subplot 2', channels: channelKeys.length > 1 ? [channelKeys[1]] : [] },
        { id: 2, label: 'Subplot 3', channels: channelKeys.slice(2) }
      ].filter(p => p.channels.length > 0);
    }
    if (layout === '4x1' || layout === '2x2') {
      return channelKeys.map((k, i) => ({
        id: i,
        label: `Subplot ${i + 1}`,
        channels: [k]
      }));
    }
    return [{ id: 0, label: 'Main Display', channels: channelKeys }];
  }, [layout, numChannels, channelKeys]);

  return (
    <div
      className={`fixed z-[9999] bg-[#0a0a0c] border border-[#2a2a35] rounded-xl shadow-[0_25px_70px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col font-sans transition-all duration-200 ${
        isMaximized ? 'inset-0 !rounded-none' : isMinimized ? 'w-80 h-10' : 'w-[820px] h-[540px]'
      }`}
      style={isMaximized ? { left: 0, top: 0, width: '100vw', height: '100vh' } : { left: pos.x, top: pos.y }}
    >
      {/* ── Simulink Window Title Bar ───────────────────────────────────────── */}
      <div
        className="h-9 bg-[#121217] border-b border-[#252530] flex items-center justify-between px-3 cursor-move select-none shrink-0"
        onMouseDown={() => !isMaximized && setIsDragging(true)}
        onDoubleClick={() => setIsMaximized(!isMaximized)}
      >
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-emerald-400 shadow-[0_0_8px_#34d399]'} animate-pulse`} />
          <span className="text-xs font-bold text-gray-200 uppercase tracking-wider truncate max-w-[200px]">
            {title}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsMinimized(!isMinimized)}
            className="p-1 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors"
            title={isMinimized ? 'Restore' : 'Minimize'}
          >
            <Minus size={13} />
          </button>
          <button
            onClick={() => { setIsMaximized(!isMaximized); setIsMinimized(false); }}
            className="p-1 hover:bg-white/5 rounded text-gray-400 hover:text-white transition-colors"
            title={isMaximized ? 'Restore' : 'Maximize'}
          >
            {isMaximized ? <Layers size={13} /> : <Maximize2 size={13} />}
          </button>
          <button
            onClick={onClose}
            className="p-1 hover:bg-red-500/20 hover:text-red-400 rounded text-gray-400 transition-colors ml-1"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {!isMinimized && (
        <>
          {/* ── Simulink Scope Standard Ribbon Toolbar ──────────────────────── */}
          <div className="h-10 bg-[#16161d] border-b border-[#252530] flex items-center justify-between px-3 shrink-0 select-none">
            {/* Left Tools Group: Autoscale, Zoom X/Y, Pan, Cursors, Stats */}
            <div className="flex items-center gap-1">
              {/* Autoscale (Binoculars) */}
              <button
                onClick={handleAutoscale}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#20202a] hover:bg-yellow-500/20 hover:text-yellow-400 text-gray-300 text-xs font-medium border border-white/5 transition-all shadow-sm active:scale-95"
                title="Autoscale (Fit waveform bounds)"
              >
                <Sparkles size={13} className="text-yellow-400" />
                <span>Autoscale</span>
              </button>

              <div className="w-px h-4 bg-white/10 mx-1" />

              {/* Zoom In & Out */}
              <button
                onClick={() => handleZoomX(0.7)}
                className="p-1.5 hover:bg-white/10 text-gray-400 hover:text-white rounded transition-all active:scale-90"
                title="Zoom In (X-Axis)"
              >
                <ZoomIn size={14} />
              </button>
              <button
                onClick={() => handleZoomX(1.4)}
                className="p-1.5 hover:bg-white/10 text-gray-400 hover:text-white rounded transition-all active:scale-90"
                title="Zoom Out (X-Axis)"
              >
                <ZoomOut size={14} />
              </button>
              <button
                onClick={() => { setTimeZoomRange(null); setYScaleOverrides({}); }}
                className="p-1.5 hover:bg-white/10 text-gray-400 hover:text-emerald-400 rounded transition-all active:scale-90"
                title="Restore Default View"
              >
                <RefreshCcw size={13} />
              </button>

              <div className="w-px h-4 bg-white/10 mx-1" />

              {/* Calipers / Cursor Measurements */}
              <button
                onClick={() => setShowCursors(!showCursors)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-all ${
                  showCursors
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-[0_0_10px_rgba(6,182,212,0.2)]'
                    : 'bg-[#20202a] text-gray-400 border-white/5 hover:text-white'
                }`}
                title="Cursor Measurements (ΔT, ΔY, Frequency Calipers)"
              >
                <Crosshair size={13} />
                <span>Cursors</span>
              </button>

              {/* Signal Statistics */}
              <button
                onClick={() => setShowStats(!showStats)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-all ${
                  showStats
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                    : 'bg-[#20202a] text-gray-400 border-white/5 hover:text-white'
                }`}
                title="Signal Statistics (Peak-to-Peak, RMS, Mean, Min, Max)"
              >
                <BarChart2 size={13} />
                <span>Stats</span>
              </button>

              {/* Subplot Layout Selector */}
              <div className="relative">
                <button
                  onClick={() => setShowLayoutMenu(!showLayoutMenu)}
                  className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium border transition-all ${
                    layout !== '1x1' ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' : 'bg-[#20202a] text-gray-400 border-white/5 hover:text-white'
                  }`}
                  title="Layout (Subplots grid)"
                >
                  <Grid size={13} />
                  <span>Layout ({layout})</span>
                  <ChevronDown size={11} />
                </button>

                {showLayoutMenu && (
                  <div className="absolute left-0 top-full mt-1 w-36 bg-[#1a1a24] border border-[#333345] rounded-lg shadow-2xl py-1 z-50 animate-in fade-in">
                    {(['1x1', '2x1', '1x2', '3x1', '4x1', '2x2'] as ScopeLayoutType[]).map(l => (
                      <button
                        key={l}
                        onClick={() => { setLayout(l); setShowLayoutMenu(false); }}
                        className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-white/10 ${
                          layout === l ? 'text-amber-400 font-bold bg-amber-500/10' : 'text-gray-300'
                        }`}
                      >
                        <span>{l.replace('x', ' x ')}</span>
                        {layout === l && <span className="text-[10px] text-amber-400 font-mono">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Tools Group: Export, Settings */}
            <div className="flex items-center gap-1">
              <button
                onClick={handleExportCSV}
                className="p-1.5 hover:bg-emerald-500/20 text-gray-400 hover:text-emerald-400 rounded transition-colors"
                title="Export Signal Data to CSV"
              >
                <Download size={14} />
              </button>
              {onUpdate && (
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={`p-1.5 rounded transition-colors ${
                    showSettings ? 'bg-purple-500/20 text-purple-400' : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                  title="Scope Parameters & Configuration"
                >
                  <Settings size={14} />
                </button>
              )}
            </div>
          </div>

          {/* ── Main Work Area: Settings Drawer + Plots Canvas + Cursors HUD ── */}
          <div className="flex-1 flex min-h-0 overflow-hidden relative bg-[#000000]">
            {/* Settings Sidebar */}
            {showSettings && onUpdate && (
              <div className="w-56 border-r border-[#252530] bg-[#121217] p-3 space-y-3 flex flex-col shrink-0 overflow-y-auto custom-scrollbar z-30">
                <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-white/5 pb-1">
                  Scope Parameters
                </div>

                {/* Input Channels */}
                <div className="space-y-1">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase">Input Channels</label>
                  <select
                    value={params.numSignals?.value || 1}
                    onChange={(e) => {
                      const val = Math.max(1, Math.min(8, parseInt(e.target.value) || 1));
                      onUpdate({ numSignals: { ...params.numSignals, value: val } });
                    }}
                    className="w-full text-xs px-2 py-1 border border-[#333] bg-[#181820] text-white rounded outline-none font-mono"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                      <option key={n} value={n}>{n} Channels</option>
                    ))}
                  </select>
                </div>

                {/* Time Range */}
                <div className="space-y-1">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase">Time Span</label>
                  <select
                    value={String(params.time_range?.value || '10')}
                    onChange={(e) => {
                      const val = e.target.value === 'auto' ? 'auto' : parseFloat(e.target.value);
                      onUpdate({ time_range: { ...params.time_range, value: val } });
                    }}
                    className="w-full text-xs px-2 py-1 border border-[#333] bg-[#181820] text-amber-400 font-bold rounded outline-none"
                  >
                    <option value="auto">Auto (Full)</option>
                    <option value="0.1">0.1 s</option>
                    <option value="0.5">0.5 s</option>
                    <option value="1">1.0 s</option>
                    <option value="2">2.0 s</option>
                    <option value="5">5.0 s</option>
                    <option value="10">10.0 s</option>
                    <option value="30">30.0 s</option>
                    <option value="60">60.0 s</option>
                    <option value="300">300.0 s</option>
                  </select>
                </div>

                {/* Max Points */}
                <div className="space-y-1">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase">Buffer Limit</label>
                  <input
                    type="number"
                    value={params.buffer_size?.value || 1000}
                    onChange={(e) => onUpdate({ buffer_size: { ...params.buffer_size, value: parseInt(e.target.value) || 1000 } })}
                    className="w-full text-xs px-2 py-1 border border-[#333] bg-[#181820] text-white rounded outline-none font-mono"
                  />
                </div>

                {/* Decimation */}
                <div className="space-y-1">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase">Decimation</label>
                  <input
                    type="number"
                    min="1"
                    value={params.decimation?.value || 1}
                    onChange={(e) => onUpdate({ decimation: { ...params.decimation, value: parseInt(e.target.value) || 1 } })}
                    className="w-full text-xs px-2 py-1 border border-[#333] bg-[#181820] text-white rounded outline-none font-mono"
                  />
                </div>

                {/* Grid Toggle */}
                <div className="space-y-1">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase">Display Grid</label>
                  <select
                    value={String(params.show_grid?.value || 'on')}
                    onChange={(e) => onUpdate({ show_grid: { ...params.show_grid, value: e.target.value } })}
                    className="w-full text-xs px-2 py-1 border border-[#333] bg-[#181820] text-gray-300 rounded outline-none"
                  >
                    <option value="on">On (Show)</option>
                    <option value="off">Off (Hide)</option>
                  </select>
                </div>

                {/* Legend Toggle */}
                <div className="space-y-1">
                  <label className="block text-[9px] font-bold text-gray-400 uppercase">Display Legend</label>
                  <select
                    value={String(params.show_legend?.value || 'on')}
                    onChange={(e) => onUpdate({ show_legend: { ...params.show_legend, value: e.target.value } })}
                    className="w-full text-xs px-2 py-1 border border-[#333] bg-[#181820] text-gray-300 rounded outline-none"
                  >
                    <option value="on">On (Show)</option>
                    <option value="off">Off (Hide)</option>
                  </select>
                </div>
              </div>
            )}

            {/* Subplots Grid Area */}
            <div className={`flex-1 flex flex-col min-h-0 overflow-hidden relative ${
              layout === '1x2' || layout === '2x2' ? 'grid grid-cols-2 gap-1 p-1' : 'flex flex-col gap-1 p-1'
            }`}>
              {subplots.map((plot, plotIdx) => {
                const plotChannels = plot.channels.filter(ch => !hiddenChannels[ch]);
                const yBounds = calculateAutoScaleRange(displayData, plotChannels, 0.1);

                return (
                  <div
                    key={plot.id}
                    className="flex-1 min-h-[140px] bg-[#000000] border border-[#1a1a24] rounded relative overflow-hidden flex flex-col shadow-inner group"
                  >
                    {/* Subplot Header / Channel Badge */}
                    <div className="h-6 bg-[#0c0c12]/90 border-b border-[#181822] px-2 flex items-center justify-between z-10">
                      <span className="text-[9px] font-mono font-bold text-gray-400 uppercase tracking-wider">
                        {plot.label}
                      </span>
                      {showLegend && (
                        <div className="flex items-center gap-2">
                          {plot.channels.map((chKey) => {
                            const chIndex = channelKeys.indexOf(chKey);
                            const info = signalInfos[chIndex];
                            const color = SIMULINK_SCOPE_COLORS[chIndex % SIMULINK_SCOPE_COLORS.length];
                            const isHidden = !!hiddenChannels[chKey];
                            const label = info?.connected ? `${info.blockLabel}.${info.portName}` : (info?.fullName || chKey);

                            return (
                              <button
                                key={chKey}
                                onClick={() => setHiddenChannels(prev => ({ ...prev, [chKey]: !prev[chKey] }))}
                                className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-mono transition-all border ${
                                  isHidden
                                    ? 'opacity-40 border-gray-800 line-through text-gray-600'
                                    : 'border-white/10 text-gray-200 bg-white/5'
                                }`}
                                title={`Toggle channel ${label}`}
                              >
                                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                                <span className="truncate max-w-[120px]">{label}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Analog CRT Background Grid */}
                    <div className="absolute inset-0 top-6 pointer-events-none opacity-20 z-0">
                      <svg width="100%" height="100%">
                        <defs>
                          <pattern id={`scopeGrid-${plot.id}`} width="40" height="40" patternUnits="userSpaceOnUse">
                            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#22c55e" strokeWidth="0.5" strokeDasharray="2 2" />
                          </pattern>
                        </defs>
                        <rect width="100%" height="100%" fill={`url(#scopeGrid-${plot.id})`} />
                      </svg>
                    </div>

                    {/* Chart Canvas */}
                    <div className="flex-1 relative min-h-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          key={`${autoScaleCounter}-${plotIdx}`}
                          data={displayData}
                          margin={{ top: 12, right: 16, left: -20, bottom: 0 }}
                          onClick={(e) => {
                            if (!showCursors || !e) return;
                            const clickedTime = e.activeLabel ?? e.activePayload?.[0]?.payload?.time;
                            if (typeof clickedTime === 'number' && Number.isFinite(clickedTime)) {
                              if (activeCursor === 'C1') {
                                setCursor1Time(clickedTime);
                              } else {
                                setCursor2Time(clickedTime);
                              }
                            }
                          }}
                          className={showCursors ? 'cursor-crosshair' : 'cursor-default'}
                        >
                          <defs>
                            {plot.channels.map((chKey) => {
                              const chIndex = channelKeys.indexOf(chKey);
                              const color = SIMULINK_SCOPE_COLORS[chIndex % SIMULINK_SCOPE_COLORS.length];
                              return (
                                <linearGradient key={chKey} id={`grad-${chKey}`} x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor={color} stopOpacity={0.2} />
                                  <stop offset="95%" stopColor={color} stopOpacity={0} />
                                </linearGradient>
                              );
                            })}
                          </defs>

                          {showGrid && <CartesianGrid strokeDasharray="2 2" stroke="#ffffff12" vertical={true} />}

                          <XAxis
                            dataKey="time"
                            type="number"
                            domain={[
                              displayData.length > 0 ? (displayData[0].time ?? 0) : 0,
                              displayData.length > 0 ? (displayData[displayData.length - 1].time ?? 10) : 10
                            ]}
                            allowDataOverflow={true}
                            stroke="#ffffff30"
                            fontSize={9}
                            tickFormatter={(v) => typeof v === 'number' ? v.toFixed(2) : String(v)}
                            axisLine={false}
                            tickLine={false}
                          />

                          <YAxis
                            stroke="#ffffff30"
                            fontSize={9}
                            domain={yBounds}
                            tickFormatter={(v) => typeof v === 'number' ? v.toFixed(1) : String(v)}
                            axisLine={false}
                            tickLine={false}
                          />

                          <Tooltip
                            contentStyle={{
                              background: '#0a0a10',
                              border: '1px solid rgba(255,255,255,0.15)',
                              borderRadius: '6px',
                              fontSize: '10px',
                              boxShadow: '0 8px 24px rgba(0,0,0,0.8)'
                            }}
                            cursor={{ stroke: '#ffffff30', strokeWidth: 1, strokeDasharray: '3 3' }}
                          />

                          {/* Render Traces */}
                          {plotChannels.map((chKey) => {
                            const chIndex = channelKeys.indexOf(chKey);
                            const color = SIMULINK_SCOPE_COLORS[chIndex % SIMULINK_SCOPE_COLORS.length];
                            return (
                              <Area
                                key={chKey}
                                type="monotone"
                                dataKey={chKey}
                                stroke={color}
                                strokeWidth={2.0}
                                fillOpacity={1}
                                fill={`url(#grad-${chKey})`}
                                isAnimationActive={false}
                                dot={false}
                              />
                            );
                          })}

                          {/* Cursor Reference Lines */}
                          {showCursors && cursor1Time !== null && (
                            <ReferenceLine
                              x={cursor1Time}
                              stroke="#00FFFF"
                              strokeDasharray="4 4"
                              strokeWidth={2}
                              label={{
                                value: `C1: ${cursor1Time.toFixed(2)}s`,
                                fill: '#00FFFF',
                                fontSize: 9,
                                fontWeight: 'bold',
                                position: 'insideTopLeft'
                              }}
                            />
                          )}
                          {showCursors && cursor2Time !== null && (
                            <ReferenceLine
                              x={cursor2Time}
                              stroke="#FF00FF"
                              strokeDasharray="4 4"
                              strokeWidth={2}
                              label={{
                                value: `C2: ${cursor2Time.toFixed(2)}s`,
                                fill: '#FF00FF',
                                fontSize: 9,
                                fontWeight: 'bold',
                                position: 'insideTopRight'
                              }}
                            />
                          )}
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Cursor Measurements Caliper HUD Drawer ─────────────────────── */}
            {showCursors && cursorCalculations && (
              <div className="w-64 border-l border-[#252530] bg-[#0e0e14] p-3 flex flex-col shrink-0 overflow-y-auto custom-scrollbar z-30 animate-in slide-in-from-right-2">
                <div className="flex items-center justify-between border-b border-white/10 pb-1 mb-2">
                  <div className="flex items-center gap-1.5 text-cyan-400">
                    <Crosshair size={13} />
                    <span className="text-[10px] font-black uppercase tracking-wider">Caliper Readout</span>
                  </div>
                  <button onClick={() => setShowCursors(false)} className="text-gray-500 hover:text-white">
                    <X size={12} />
                  </button>
                </div>

                <div className="space-y-2 text-xs font-mono">
                  {/* Active Cursor Selector Buttons */}
                  <div className="flex gap-1 bg-[#14141d] p-1 rounded-lg border border-white/5">
                    <button
                      onClick={() => setActiveCursor('C1')}
                      className={`flex-1 py-1 text-[10px] font-bold rounded flex items-center justify-center gap-1 transition-all ${
                        activeCursor === 'C1'
                          ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_8px_rgba(6,182,212,0.3)]'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                      <span>Active C1</span>
                    </button>
                    <button
                      onClick={() => setActiveCursor('C2')}
                      className={`flex-1 py-1 text-[10px] font-bold rounded flex items-center justify-center gap-1 transition-all ${
                        activeCursor === 'C2'
                          ? 'bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/40 shadow-[0_0_8px_rgba(236,72,153,0.3)]'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <div className="w-1.5 h-1.5 rounded-full bg-fuchsia-400" />
                      <span>Active C2</span>
                    </button>
                  </div>
                  <div className="text-[8px] text-gray-500 italic text-center">
                    Click graph to place {activeCursor}
                  </div>

                  {/* Cursor 1 */}
                  <div className="bg-[#14141d] p-2 rounded border border-cyan-500/20">
                    <div className="text-[9px] text-cyan-400 font-bold uppercase mb-1">Cursor 1 (C1)</div>
                    <div className="flex justify-between text-gray-300 text-[10px]">
                      <span>T1:</span>
                      <span className="text-white font-bold">{cursorCalculations.t1.toFixed(4)} s</span>
                    </div>
                    <div className="flex justify-between text-gray-300 text-[10px]">
                      <span>Y1:</span>
                      <span className="text-cyan-300 font-bold">{cursorCalculations.val1.toFixed(4)}</span>
                    </div>
                  </div>

                  {/* Cursor 2 */}
                  <div className="bg-[#14141d] p-2 rounded border border-fuchsia-500/20">
                    <div className="text-[9px] text-fuchsia-400 font-bold uppercase mb-1">Cursor 2 (C2)</div>
                    <div className="flex justify-between text-gray-300 text-[10px]">
                      <span>T2:</span>
                      <span className="text-white font-bold">{cursorCalculations.t2.toFixed(4)} s</span>
                    </div>
                    <div className="flex justify-between text-gray-300 text-[10px]">
                      <span>Y2:</span>
                      <span className="text-fuchsia-300 font-bold">{cursorCalculations.val2.toFixed(4)}</span>
                    </div>
                  </div>

                  {/* Deltas & Measurements */}
                  <div className="bg-[#181824] p-2.5 rounded border border-yellow-500/30 space-y-1.5 shadow-sm">
                    <div className="text-[9px] text-yellow-400 font-bold uppercase tracking-wider">Measurements</div>
                    
                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-gray-400">ΔT (Time):</span>
                      <span className="text-yellow-300 font-bold">{cursorCalculations.deltaT.toFixed(4)} s</span>
                    </div>

                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-gray-400">ΔY (Amp):</span>
                      <span className="text-yellow-300 font-bold">{cursorCalculations.deltaY.toFixed(4)}</span>
                    </div>

                    <div className="flex justify-between items-center text-[11px]">
                      <span className="text-gray-400">1/ΔT (Freq):</span>
                      <span className="text-emerald-400 font-bold">
                        {cursorCalculations.frequency > 0 ? `${cursorCalculations.frequency.toFixed(2)} Hz` : '0 Hz'}
                      </span>
                    </div>

                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-gray-400">Slope:</span>
                      <span className="text-purple-300 font-bold">{cursorCalculations.slope.toFixed(2)} /s</span>
                    </div>
                  </div>

                  {/* Quick Snap Controls */}
                  <div className="grid grid-cols-2 gap-1 pt-1">
                    <button
                      onClick={() => handleSnapCursor(activeCursor, 'max')}
                      className="px-2 py-1 rounded bg-[#181824] hover:bg-white/10 text-gray-300 hover:text-yellow-400 text-[9px] font-bold border border-white/5 transition-all text-center"
                      title="Snap active cursor to signal peak"
                    >
                      Snap to Peak
                    </button>
                    <button
                      onClick={() => handleSnapCursor(activeCursor, 'min')}
                      className="px-2 py-1 rounded bg-[#181824] hover:bg-white/10 text-gray-300 hover:text-emerald-400 text-[9px] font-bold border border-white/5 transition-all text-center"
                      title="Snap active cursor to signal valley"
                    >
                      Snap to Valley
                    </button>
                  </div>
                  <button
                    onClick={() => handleSnapCursor('C1', 'center')}
                    className="w-full py-1 rounded bg-[#181824] hover:bg-white/10 text-gray-400 hover:text-white text-[9px] font-bold border border-white/5 transition-all text-center"
                  >
                    Center Cursors (25% / 75%)
                  </button>

                  {/* Cursor Position Sliders */}
                  <div className="space-y-2 pt-1">
                    <div>
                      <div className="flex justify-between text-[9px] text-cyan-400">
                        <span>Position C1</span>
                        <span>{cursor1Time?.toFixed(2)}s</span>
                      </div>
                      <input
                        type="range"
                        min={displayData.length > 0 ? (displayData[0].time ?? displayData[0].t ?? 0) : 0}
                        max={displayData.length > 0 ? (displayData[displayData.length - 1].time ?? displayData[displayData.length - 1].t ?? 10) : 10}
                        step="0.01"
                        value={cursor1Time ?? 0}
                        onChange={(e) => setCursor1Time(parseFloat(e.target.value))}
                        className="w-full accent-cyan-400 cursor-pointer h-1"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-[9px] text-fuchsia-400">
                        <span>Position C2</span>
                        <span>{cursor2Time?.toFixed(2)}s</span>
                      </div>
                      <input
                        type="range"
                        min={displayData.length > 0 ? (displayData[0].time ?? displayData[0].t ?? 0) : 0}
                        max={displayData.length > 0 ? (displayData[displayData.length - 1].time ?? displayData[displayData.length - 1].t ?? 10) : 10}
                        step="0.01"
                        value={cursor2Time ?? 0}
                        onChange={(e) => setCursor2Time(parseFloat(e.target.value))}
                        className="w-full accent-fuchsia-400 cursor-pointer h-1"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Signal Statistics Drawer ───────────────────────────────────── */}
            {showStats && (
              <div className="w-60 border-l border-[#252530] bg-[#0e0e14] p-3 flex flex-col shrink-0 overflow-y-auto custom-scrollbar z-30 animate-in slide-in-from-right-2">
                <div className="flex items-center justify-between border-b border-white/10 pb-1 mb-2">
                  <div className="flex items-center gap-1.5 text-purple-400">
                    <BarChart2 size={13} />
                    <span className="text-[10px] font-black uppercase tracking-wider">Signal Statistics</span>
                  </div>
                  <button onClick={() => setShowStats(false)} className="text-gray-500 hover:text-white">
                    <X size={12} />
                  </button>
                </div>

                <div className="space-y-3">
                  {statisticsList.map(item => (
                    <div key={item.key} className="bg-[#14141d] p-2.5 rounded border border-white/5 space-y-1">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                        <span className="text-[10px] font-bold text-white truncate max-w-[150px]">{item.name}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-1 text-[10px] font-mono text-gray-300">
                        <div>
                          <span className="text-gray-500 block text-[8px]">Peak-to-Peak (Vpp)</span>
                          <span className="text-yellow-300 font-bold">{item.peakToPeak.toFixed(3)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block text-[8px]">RMS</span>
                          <span className="text-emerald-400 font-bold">{item.rms.toFixed(3)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block text-[8px]">Mean</span>
                          <span className="text-cyan-300">{item.mean.toFixed(3)}</span>
                        </div>
                        <div>
                          <span className="text-gray-500 block text-[8px]">Max / Min</span>
                          <span className="text-gray-200">{item.max.toFixed(1)} / {item.min.toFixed(1)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Status Footer Bar ───────────────────────────────────────────── */}
          <div className="h-7 bg-[#101015] border-t border-[#202028] px-3 flex items-center justify-between text-[9px] text-gray-500 font-mono select-none">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full ${isPaused ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                <span className="text-gray-400 font-medium">{isPaused ? 'Halted / Paused' : 'Continuous Acquisition'}</span>
              </span>
              <span>Channels: {numChannels}</span>
              <span>Samples: {displayData.length} pts</span>
            </div>

            <div className="flex items-center gap-3">
              <span>Time Span: {timeRangeParam === 'auto' ? 'Auto' : `${timeRangeParam}s`}</span>
              <span className="text-purple-400 font-semibold">{layout} Mode</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default VLabSimulinkScope;
