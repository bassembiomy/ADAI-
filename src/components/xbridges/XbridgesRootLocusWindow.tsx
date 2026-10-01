// src/components/xbridges/XbridgesRootLocusWindow.tsx
import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Activity, Info, Settings2, SlidersHorizontal, HelpCircle } from 'lucide-react';
import { findRoots, polyToString } from '../../engine/xbridges/BlockDefinitions';
import { XbridgesAnalysisClient, computeRootLocus, type RootLocusResult } from '../../services/xbridgesAnalysisWorker';

interface RootLocusWindowProps {
  block: any;
  nodes?: any[];
  edges?: any[];
  onUpdate?: (data: any) => void;
  onClose: () => void;
}

export const XbridgesRootLocusWindow: React.FC<RootLocusWindowProps> = ({ block, onUpdate, onClose }) => {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  
  // Local state for coefficient editing, sweep ranges, and interactive gain K
  const numerator = block.params?.numerator || [1];
  const denominator = block.params?.denominator || [1, 2, 1];
  const gain = block.params?.gain !== undefined ? Number(block.params.gain) : 1;
  const maxGain = block.params?.maxGain !== undefined ? Number(block.params.maxGain) : 100;
  const simulationType = block.params?.simulationType || 'open_loop';
  const showGrid = block.params?.showGrid !== false;
  
  const [hoveredInfo, setHoveredInfo] = React.useState<{
    gain: number;
    re: number;
    im: number;
    zeta: number;
    wn: number;
    overshoot: number;
    px: number;
    py: number;
  } | null>(null);

  // Parse arrays from text inputs safely
  const [numInput, setNumInput] = React.useState(JSON.stringify(numerator));
  const [denInput, setDenInput] = React.useState(JSON.stringify(denominator));
  const [maxGainInput, setMaxGainInput] = React.useState(String(maxGain));

  React.useEffect(() => {
    setNumInput(JSON.stringify(numerator));
  }, [numerator]);

  React.useEffect(() => {
    setDenInput(JSON.stringify(denominator));
  }, [denominator]);

  React.useEffect(() => {
    setMaxGainInput(String(maxGain));
  }, [maxGain]);

  const handleArrayUpdate = (type: 'numerator' | 'denominator', valStr: string) => {
    try {
      const parsed = JSON.parse(valStr);
      if (Array.isArray(parsed) && parsed.every(x => typeof x === 'number')) {
        if (onUpdate) {
          onUpdate({ ...block.params, [type]: parsed });
        }
      }
    } catch (e) {
      // Ignore invalid arrays during typing
    }
  };

  const analysisClientRef = React.useRef<XbridgesAnalysisClient | null>(null);
  const [locusResult, setLocusResult] = React.useState<RootLocusResult>(() =>
    computeRootLocus({ numerator, denominator, maxGain, numPoints: 120 })
  );

  React.useEffect(() => {
    if (!analysisClientRef.current) {
      analysisClientRef.current = new XbridgesAnalysisClient();
    }
    analysisClientRef.current.computeRootLocusAsync({
      numerator,
      denominator,
      maxGain,
      numPoints: 120,
    }).then(res => {
      setLocusResult(res);
    }).catch(() => {
      // Ignore superseded or cancelled calculations
    });

    return () => {
      analysisClientRef.current?.cancel();
    };
  }, [numerator, denominator, maxGain]);

  React.useEffect(() => {
    return () => {
      analysisClientRef.current?.dispose();
      analysisClientRef.current = null;
    };
  }, []);

  const { olPoles, olZeros, gains, trajectories, allPolesMap } = locusResult;

  // Current Closed Loop Poles
  const clPoles = React.useMemo(() => {
    const dCoeffs = [...denominator];
    const nCoeffs = [...numerator];
    const maxLength = Math.max(dCoeffs.length, nCoeffs.length);
    while (dCoeffs.length < maxLength) dCoeffs.unshift(0);
    while (nCoeffs.length < maxLength) nCoeffs.unshift(0);
    const currCoeffs = dCoeffs.map((dVal, idx) => dVal + gain * nCoeffs[idx]);
    return findRoots(currCoeffs);
  }, [denominator, numerator, gain]);

  // Stability assessment
  const stability = React.useMemo(() => {
    if (clPoles.length === 0) return 'Stable';
    const maxReal = Math.max(...clPoles.map(p => p.re));
    if (maxReal > 1e-6) return 'Unstable';
    if (Math.abs(maxReal) <= 1e-6) return 'Marginal';
    return 'Stable';
  }, [clPoles]);

  // Plot boundaries
  const plotBounds = React.useMemo(() => {
    let minRe = -5;
    let maxRe = 1;
    let minIm = -3;
    let maxIm = 3;
    
    const allPoints: { re: number; im: number }[] = [];
    olPoles.forEach(p => allPoints.push(p));
    olZeros.forEach(z => allPoints.push(z));
    trajectories.forEach(traj => traj.forEach(pt => allPoints.push(pt)));
    
    if (allPoints.length > 0) {
      const res = allPoints.map(p => p.re);
      const ims = allPoints.map(p => p.im);
      minRe = Math.min(...res, -1);
      maxRe = Math.max(...res, 1);
      minIm = Math.min(...ims, -1);
      maxIm = Math.max(...ims, 1);
      
      const reSpan = maxRe - minRe;
      const imSpan = maxIm - minIm;
      const padRe = reSpan > 0 ? reSpan * 0.2 : 1.5;
      const padIm = imSpan > 0 ? imSpan * 0.2 : 1.5;
      
      minRe -= padRe;
      maxRe += padRe;
      minIm -= padIm;
      maxIm += padIm;
    }
    
    return { minRe, maxRe, minIm, maxIm };
  }, [olPoles, olZeros, trajectories]);

  // Redraw canvas
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const W = canvas.width;
    const H = canvas.height;
    const padding = 45;
    
    const { minRe, maxRe, minIm, maxIm } = plotBounds;
    
    // Equal aspect ratio
    const pxPerUnitX = (W - 2 * padding) / (maxRe - minRe);
    const pxPerUnitY = (H - 2 * padding) / (maxIm - minIm);
    const pxPerUnit = Math.min(pxPerUnitX, pxPerUnitY);
    
    const centerX = (minRe + maxRe) / 2;
    const centerY = (minIm + maxIm) / 2;
    const newReRange = (W - 2 * padding) / pxPerUnit;
    const newImRange = (H - 2 * padding) / pxPerUnit;
    
    const plotMinRe = centerX - newReRange / 2;
    const plotMaxRe = centerX + newReRange / 2;
    const plotMinIm = centerY - newImRange / 2;
    const plotMaxIm = centerY + newImRange / 2;
    
    const scaleX = (re: number) => padding + ((re - plotMinRe) / newReRange) * (W - 2 * padding);
    const scaleY = (im: number) => H - padding - ((im - plotMinIm) / newImRange) * (H - 2 * padding);
    
    // Background
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, W, H);
    
    // 1. Grid Lines (sgrid)
    if (showGrid) {
      // Natural frequency circles
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
      ctx.lineWidth = 1;
      const stepWn = Math.ceil((plotMaxRe - plotMinRe) / 5) || 1;
      for (let r = stepWn; r < Math.max(Math.abs(plotMinRe), Math.abs(plotMaxIm)) * 1.5; r += stepWn) {
        ctx.beginPath();
        const originX = scaleX(0);
        const originY = scaleY(0);
        const radiusPx = r * pxPerUnit;
        ctx.arc(originX, originY, radiusPx, 0, 2 * Math.PI);
        ctx.stroke();
        
        // Label
        ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
        ctx.font = '8px monospace';
        ctx.fillText(`wn=${r.toFixed(1)}`, originX + radiusPx * 0.707 + 2, originY - radiusPx * 0.707 - 2);
      }
      
      // Damping ratio lines (constant zeta lines)
      const zetas = [0.1, 0.3, 0.5, 0.707, 0.9];
      zetas.forEach(z => {
        const theta = Math.acos(z);
        
        ctx.strokeStyle = 'rgba(148, 163, 184, 0.08)';
        ctx.beginPath();
        const originX = scaleX(0);
        const originY = scaleY(0);
        
        const endX_up = scaleX(-15 * Math.cos(theta));
        const endY_up = scaleY(15 * Math.sin(theta));
        ctx.moveTo(originX, originY);
        ctx.lineTo(endX_up, endY_up);
        
        const endX_lo = scaleX(-15 * Math.cos(theta));
        const endY_lo = scaleY(-15 * Math.sin(theta));
        ctx.moveTo(originX, originY);
        ctx.lineTo(endX_lo, endY_lo);
        ctx.stroke();
        
        ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
        ctx.font = '8px monospace';
        const pct = Math.round(Math.exp(-Math.PI * z / Math.sqrt(1 - z * z)) * 100);
        ctx.fillText(`z=${z.toFixed(2)} (${pct}%)`, scaleX(-3 * Math.cos(theta)), scaleY(3 * Math.sin(theta)) - 4);
      });
    }
    
    // 2. Main Axes
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
    ctx.lineWidth = 1;
    const y0 = scaleY(0);
    ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(W, y0); ctx.stroke();
    const x0 = scaleX(0);
    ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, H); ctx.stroke();
    
    // Axis ticks and labels
    ctx.fillStyle = 'rgba(148, 163, 184, 0.6)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    
    // Real axis ticks
    const tickStepRe = Number(((plotMaxRe - plotMinRe) / 8).toFixed(1)) || 1;
    for (let r = Math.floor(plotMinRe); r <= Math.ceil(plotMaxRe); r += tickStepRe) {
      if (Math.abs(r) < 1e-9) continue;
      const px = scaleX(r);
      ctx.beginPath(); ctx.moveTo(px, y0 - 3); ctx.lineTo(px, y0 + 3); ctx.stroke();
      ctx.fillText(r.toFixed(1), px, y0 + 13);
    }
    // Imaginary axis ticks
    ctx.textAlign = 'right';
    const tickStepIm = Number(((plotMaxIm - plotMinIm) / 6).toFixed(1)) || 1;
    for (let i = Math.floor(plotMinIm); i <= Math.ceil(plotMaxIm); i += tickStepIm) {
      if (Math.abs(i) < 1e-9) continue;
      const py = scaleY(i);
      ctx.beginPath(); ctx.moveTo(x0 - 3, py); ctx.lineTo(x0 + 3, py); ctx.stroke();
      ctx.fillText(`${i.toFixed(1)}j`, x0 - 6, py + 3);
    }
    
    // Axis Titles
    ctx.fillStyle = 'rgba(148, 163, 184, 0.8)';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('Real Axis (seconds⁻¹)', W - 10, y0 - 8);
    ctx.textAlign = 'left';
    ctx.fillText('Imaginary Axis (rad/s)', x0 + 10, 15);
    
    // 3. Draw Trajectories (Poles Sweep lines)
    ctx.lineWidth = 2;
    const colors = ['#f43f5e', '#3b82f6', '#10b981', '#a855f7', '#eab308'];
    trajectories.forEach((traj, trajIdx) => {
      if (traj.length < 2) return;
      ctx.strokeStyle = colors[trajIdx % colors.length];
      ctx.beginPath();
      ctx.moveTo(scaleX(traj[0].re), scaleY(traj[0].im));
      for (let i = 1; i < traj.length; i++) {
        ctx.lineTo(scaleX(traj[i].re), scaleY(traj[i].im));
      }
      ctx.stroke();
    });
    
    // 4. Open Loop Zeros ('O')
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2.5;
    olZeros.forEach(z => {
      ctx.beginPath();
      ctx.arc(scaleX(z.re), scaleY(z.im), 5.5, 0, 2 * Math.PI);
      ctx.stroke();
    });
    
    // 5. Open Loop Poles ('X')
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.5;
    olPoles.forEach(p => {
      const px = scaleX(p.re);
      const py = scaleY(p.im);
      const sz = 5;
      ctx.beginPath();
      ctx.moveTo(px - sz, py - sz);
      ctx.lineTo(px + sz, py + sz);
      ctx.moveTo(px - sz, py + sz);
      ctx.lineTo(px + sz, py - sz);
      ctx.stroke();
    });
    
    // 6. Current Closed Loop Poles
    clPoles.forEach(p => {
      const px = scaleX(p.re);
      const py = scaleY(p.im);
      const sz = 8;
      
      ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
      ctx.beginPath();
      ctx.arc(px, py, sz + 4, 0, 2 * Math.PI);
      ctx.fill();
      
      ctx.fillStyle = '#10b981';
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.fillRect(px - sz/2, py - sz/2, sz, sz);
      ctx.strokeRect(px - sz/2, py - sz/2, sz, sz);
    });
    
    // 7. Hover Highlight Point
    if (hoveredInfo) {
      const hx = scaleX(hoveredInfo.re);
      const hy = scaleY(hoveredInfo.im);
      
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(hx, hy, 9, 0, 2 * Math.PI);
      ctx.stroke();
      
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(hx, hy); ctx.lineTo(hx, y0);
      ctx.moveTo(hx, hy); ctx.lineTo(x0, hy);
      ctx.stroke();
      ctx.setLineDash([]);
      
      if (Math.abs(hoveredInfo.im) > 1e-4) {
        const hcx = scaleX(hoveredInfo.re);
        const hcy = scaleY(-hoveredInfo.im);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(hcx, hcy, 8, 0, 2 * Math.PI);
        ctx.stroke();
      }
    }
  }, [plotBounds, trajectories, olPoles, olZeros, clPoles, hoveredInfo, showGrid, gain, maxGain]);

  // Mouse interactivity on Locus canvas
  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    
    const W = canvas.width;
    const H = canvas.height;
    const padding = 45;
    
    const { minRe, maxRe, minIm, maxIm } = plotBounds;
    const pxPerUnitX = (W - 2 * padding) / (maxRe - minRe);
    const pxPerUnitY = (H - 2 * padding) / (maxIm - minIm);
    const pxPerUnit = Math.min(pxPerUnitX, pxPerUnitY);
    
    const centerX = (minRe + maxRe) / 2;
    const centerY = (minIm + maxIm) / 2;
    const newReRange = (W - 2 * padding) / pxPerUnit;
    const newImRange = (H - 2 * padding) / pxPerUnit;
    
    const plotMinRe = centerX - newReRange / 2;
    const plotMinIm = centerY - newImRange / 2;
    
    const unscaleX = (px: number) => plotMinRe + ((px - padding) / (W - 2 * padding)) * newReRange;
    const unscaleY = (py: number) => plotMinIm + ((H - padding - py) / (H - 2 * padding)) * newImRange;
    
    const mouseRe = unscaleX(mx);
    const mouseIm = unscaleY(my);
    
    let bestDist = Infinity;
    let bestPoint: { re: number; im: number; gain: number } | null = null;
    
    for (const pt of allPolesMap) {
      const dist = Math.pow(pt.re - mouseRe, 2) + Math.pow(pt.im - mouseIm, 2);
      if (dist < bestDist) {
        bestDist = dist;
        bestPoint = pt;
      }
    }
    
    if (bestPoint) {
      const pxScaleX = padding + ((bestPoint.re - plotMinRe) / newReRange) * (W - 2 * padding);
      const pxScaleY = H - padding - ((bestPoint.im - plotMinIm) / newImRange) * (H - 2 * padding);
      const distPx = Math.sqrt(Math.pow(pxScaleX - mx, 2) + Math.pow(pxScaleY - my, 2));
      
      if (distPx < 18) {
        const reVal = bestPoint.re;
        const imVal = bestPoint.im;
        const KVal = bestPoint.gain;
        
        const wn = Math.sqrt(reVal * reVal + imVal * imVal);
        let zeta = 0;
        let overshoot = 0;
        
        if (wn > 1e-6) {
          zeta = -reVal / wn;
          if (zeta >= 0 && zeta < 1.0) {
            overshoot = Math.exp(-Math.PI * zeta / Math.sqrt(1 - zeta * zeta)) * 100;
          } else if (zeta >= 1.0) {
            overshoot = 0;
          }
        }
        
        setHoveredInfo({
          gain: KVal,
          re: reVal,
          im: imVal,
          zeta: Math.max(0, Math.min(1.0, zeta)),
          wn,
          overshoot,
          px: pxScaleX,
          py: pxScaleY
        });
      } else {
        setHoveredInfo(null);
      }
    } else {
      setHoveredInfo(null);
    }
  };

  const handleCanvasMouseClick = () => {
    if (hoveredInfo && onUpdate) {
      onUpdate({ ...block.params, gain: Number(hoveredInfo.gain.toFixed(4)) });
    }
  };

  const handleCanvasMouseLeave = () => {
    setHoveredInfo(null);
  };

  return (
    <Dialog.Root open={true} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-950/70 backdrop-blur-md z-[100]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[92vw] h-[88vh] bg-[#0c101a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col z-[101] outline-none select-text text-[#e0e0e0] font-sans">
          
          {/* Header */}
          <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-black/20 relative">
            <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-emerald-500 via-[#c9a86c] to-indigo-500 shadow-md" />
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-inner">
                <Activity size={20} className="animate-pulse" />
              </div>
              <div>
                <Dialog.Title className="text-base font-black uppercase tracking-wider text-slate-100 flex items-center gap-2">
                  Interactive Root Locus Tuner & Analyzer
                </Dialog.Title>
                <div className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter mt-0.5">
                  Block ID: {block.id} • Dynamic Pole-Placement Studio
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/5 rounded-lg text-slate-400 hover:text-white transition-all border border-transparent hover:border-white/5"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          
          {/* Main Layout Area */}
          <div className="flex-1 flex min-h-0">
            
            {/* Left Sidebar: Controls & Info */}
            <div className="w-[320px] border-r border-white/5 bg-black/10 flex flex-col overflow-y-auto p-5 space-y-5 custom-scrollbar select-none">
              
              {/* Stability Indicator Card */}
              <div className="p-4 rounded-xl border border-white/5 bg-slate-900/40 relative overflow-hidden flex flex-col items-center">
                <span className="text-[8px] font-black uppercase text-slate-500 tracking-widest mb-1.5">System Stability</span>
                {stability === 'Stable' && (
                  <div className="px-4 py-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 shadow-[0_0_15px_rgba(16,185,129,0.15)] animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    Asymptotically Stable
                  </div>
                )}
                {stability === 'Marginal' && (
                  <div className="px-4 py-1.5 bg-yellow-500/10 text-yellow-450 border border-yellow-500/20 rounded-full font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 animate-pulse shadow-[0_0_15px_rgba(234,179,8,0.15)]">
                    <span className="w-2 h-2 rounded-full bg-yellow-400" />
                    Marginally Stable
                  </div>
                )}
                {stability === 'Unstable' && (
                  <div className="px-4 py-1.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-full font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.15)]">
                    <span className="w-2 h-2 rounded-full bg-red-400 animate-ping" />
                    UNSTABLE SYSTEM
                  </div>
                )}
                <div className="text-[9px] font-mono text-slate-400 text-center mt-3">
                  Open-Loop: {olPoles.length} Poles • {olZeros.length} Zeros
                </div>
              </div>

              {/* Dynamic Equations Editor */}
              <div className="space-y-3">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Settings2 size={13} />
                  <span className="text-[10px] font-black uppercase tracking-wider">Transfer Function</span>
                </div>
                
                {/* Numerator */}
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Numerator Coefficients</label>
                  <input 
                    type="text" 
                    value={numInput}
                    onChange={(e) => {
                      setNumInput(e.target.value);
                      handleArrayUpdate('numerator', e.target.value);
                    }}
                    className="w-full text-xs font-mono px-3 py-2 border border-white/10 bg-[#060810] text-[#e0e0e0] rounded-lg focus:border-[#c9a86c] outline-none"
                    placeholder="e.g. [1]"
                  />
                </div>

                {/* Denominator */}
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Denominator Coefficients</label>
                  <input 
                    type="text" 
                    value={denInput}
                    onChange={(e) => {
                      setDenInput(e.target.value);
                      handleArrayUpdate('denominator', e.target.value);
                    }}
                    className="w-full text-xs font-mono px-3 py-2 border border-white/10 bg-[#060810] text-[#e0e0e0] rounded-lg focus:border-[#c9a86c] outline-none"
                    placeholder="e.g. [1, 2, 1]"
                  />
                </div>
                <div className="text-[9px] text-slate-500 font-mono italic">
                  G(s) = {polyToString(numerator, 's')} / {polyToString(denominator, 's')}
                </div>
              </div>

              {/* Live Tuning Controls */}
              <div className="space-y-3 pt-2 border-t border-white/5">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <SlidersHorizontal size={13} />
                  <span className="text-[10px] font-black uppercase tracking-wider">Locus Gain & Sweeping</span>
                </div>
                
                {/* Active Gain slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[10px] text-slate-400 font-bold">
                    <span>Gain K</span>
                    <span className="text-emerald-405 font-mono font-black">{gain.toFixed(3)}</span>
                  </div>
                  <input 
                    type="range"
                    min="0"
                    max={maxGain}
                    step="0.01"
                    value={gain}
                    onChange={(e) => onUpdate && onUpdate({ ...block.params, gain: Number(e.target.value) })}
                    className="w-full accent-[#c9a86c] h-1.5 bg-[#060810] rounded-lg appearance-none cursor-pointer border border-white/5"
                  />
                </div>

                {/* Max Gain limit */}
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Max Gain Sweep</label>
                  <input 
                    type="number" 
                    value={maxGainInput}
                    onChange={(e) => {
                      setMaxGainInput(e.target.value);
                      const val = Number(e.target.value);
                      if (val > 0 && onUpdate) {
                        onUpdate({ ...block.params, maxGain: val });
                      }
                    }}
                    className="w-full text-xs font-mono px-3 py-2 border border-white/10 bg-[#060810] text-[#e0e0e0] rounded-lg focus:border-[#c9a86c] outline-none"
                    placeholder="e.g. 100"
                  />
                </div>

                {/* Simulation Type selector */}
                <div className="space-y-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase">Time Response Simulation</label>
                  <select
                    value={simulationType}
                    onChange={(e) => onUpdate && onUpdate({ ...block.params, simulationType: e.target.value })}
                    className="w-full text-xs px-2.5 py-2 border border-white/10 bg-[#060810] text-[#e0e0e0] rounded-lg focus:border-[#c9a86c] outline-none cursor-pointer"
                  >
                    <option value="open_loop">Open-Loop G(s)</option>
                    <option value="closed_loop">Closed-Loop T(s) = K*G/(1+K*G)</option>
                  </select>
                </div>
              </div>

              {/* Numerical List of Poles */}
              <div className="space-y-2 pt-2 border-t border-white/5 flex-1 flex flex-col min-h-0">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Info size={13} />
                  <span className="text-[10px] font-black uppercase tracking-wider">Closed-Loop Poles</span>
                </div>
                
                <div className="flex-1 bg-[#060810] border border-white/5 rounded-xl p-3 overflow-y-auto space-y-2 custom-scrollbar font-mono text-[10px]">
                  {clPoles.map((p, idx) => {
                    const wn = Math.sqrt(p.re * p.re + p.im * p.im);
                    const zeta = wn > 1e-6 ? -p.re / wn : 0;
                    const overshoot = (zeta >= 0 && zeta < 1) ? Math.exp(-Math.PI * zeta / Math.sqrt(1 - zeta * zeta)) * 100 : 0;
                    const cleanIm = Math.abs(p.im) > 1e-5 ? `${p.im > 0 ? '+' : '-'}${Math.abs(p.im).toFixed(3)}j` : '';
                    return (
                      <div key={idx} className="p-2 rounded-lg bg-white/5 border border-white/5 flex flex-col gap-0.5">
                        <div className="flex justify-between font-bold text-slate-300">
                          <span>Pole {idx + 1}:</span>
                          <span className="text-emerald-400">{p.re.toFixed(3)}{cleanIm}</span>
                        </div>
                        <div className="flex justify-between text-slate-500 text-[9px]">
                          <span>Frequency:</span>
                          <span>{wn.toFixed(2)} rad/s</span>
                        </div>
                        <div className="flex justify-between text-slate-500 text-[9px]">
                          <span>Damping (ζ):</span>
                          <span>{Math.max(0, Math.min(1, zeta)).toFixed(3)}</span>
                        </div>
                        <div className="flex justify-between text-slate-500 text-[9px]">
                          <span>Overshoot:</span>
                          <span>{zeta >= 1 ? '0%' : `${overshoot.toFixed(1)}%`}</span>
                        </div>
                      </div>
                    );
                  })}
                  {clPoles.length === 0 && (
                    <div className="text-center text-slate-500 py-4 italic">No poles computed</div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Right Plot Area */}
            <div className="flex-1 p-6 flex flex-col min-w-0 bg-[#070b13] relative">
              
              {/* Locus Canvas Container */}
              <div className="flex-1 bg-[#090d16] rounded-2xl border border-white/5 shadow-inner relative flex items-center justify-center overflow-hidden">
                <canvas 
                  ref={canvasRef} 
                  width={800} 
                  height={550} 
                  onMouseMove={handleCanvasMouseMove}
                  onClick={handleCanvasMouseClick}
                  onMouseLeave={handleCanvasMouseLeave}
                  className="w-full h-full cursor-crosshair"
                />
                
                {/* Static floating tip helper */}
                <div className="absolute bottom-4 left-4 p-2 bg-slate-950/80 border border-white/10 rounded-lg backdrop-blur-md flex items-center gap-2 text-[9px] text-slate-400 shadow-md">
                  <HelpCircle size={12} className="text-[#c9a86c]" />
                  <span>Click anywhere on the locus trajectory to dynamically tune <strong>Gain K</strong>!</span>
                </div>

                {/* Floating interactive tooltip */}
                {hoveredInfo && (
                  <div 
                    className="absolute bg-[#05070c]/95 border border-white/10 rounded-xl p-3 shadow-2xl font-mono text-[10px] space-y-1.5 text-slate-300 pointer-events-none select-none z-[110] backdrop-blur-md"
                    style={{
                      left: `${hoveredInfo.px + 15}px`,
                      top: `${hoveredInfo.py - 60}px`,
                    }}
                  >
                    <div className="text-[#c9a86c] font-black border-b border-white/5 pb-1">Locus Sweep Details</div>
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Gain (K):</span>
                      <span className="font-bold text-slate-100">{hoveredInfo.gain.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Pole:</span>
                      <span className="font-bold text-emerald-400">
                        {hoveredInfo.re.toFixed(3)}
                        {Math.abs(hoveredInfo.im) > 1e-4 ? `${hoveredInfo.im > 0 ? '+' : '-'}${Math.abs(hoveredInfo.im).toFixed(3)}j` : ''}
                      </span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Damping (ζ):</span>
                      <span>{hoveredInfo.zeta.toFixed(3)}</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Frequency (wn):</span>
                      <span>{hoveredInfo.wn.toFixed(2)} rad/s</span>
                    </div>
                    <div className="flex justify-between gap-4">
                      <span className="text-slate-500">Overshoot:</span>
                      <span>{hoveredInfo.overshoot.toFixed(1)}%</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
