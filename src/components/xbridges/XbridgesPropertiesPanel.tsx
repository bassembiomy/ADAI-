// src/components/xbridges/XbridgesPropertiesPanel.tsx
import React, { useState, useEffect } from 'react';
import { XBlock, XPort } from '../../engine/xbridges/types';
import { X, Plus, Trash2, Settings2, Hash, Layers, Activity } from 'lucide-react';
import { polyToString, zpgToString } from '../../engine/xbridges/BlockDefinitions';
import { VectorUtils } from '../../engine/xbridges/VectorUtils';

interface Props {
  block: XBlock | null;
  availableVariables?: any[];
  onUpdate: (blockId: string, data: Partial<XBlock>) => void;
  onLaunchDoe?: () => void;
  onClose: () => void;
}

const normalizeNumerals = (val: string) => {
  if (!val) return "";
  const withoutArabic = val.replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString())
                           .replace(/[۰۱۲۳۴۵۶۷۸۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d).toString());
  // If it's a vector/matrix representation (contains brackets or braces), do NOT replace standard comma ',' with '.'
  // but keep replacing Arabic decimal separator '٫' with '.' and Arabic comma '،' with ','
  if (withoutArabic.includes('[') || withoutArabic.includes(']') || withoutArabic.includes('{') || withoutArabic.includes('}')) {
    return withoutArabic.replace(/[٫]/g, '.').replace(/[،]/g, ',');
  }
  return withoutArabic.replace(/[٫]/g, '.').replace(/[،,]/g, '.');
};

export const XbridgesPropertiesPanel: React.FC<Props> = ({ block, availableVariables, onUpdate, onLaunchDoe, onClose }) => {
  if (!block) return null;

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [localLabel, setLocalLabel] = useState(block.label || block.type);
  const [localParams, setLocalParams] = useState(JSON.stringify(block.params, null, 2));
  // Local string state for numeric param inputs to allow decimal mid-typing (e.g. "0." → "0.1")
  const [localInputValues, setLocalInputValues] = useState<Record<string, string>>({});

  // Sync when block changes
  useEffect(() => {
    setLocalLabel(block.label || block.type);
    setLocalParams(JSON.stringify(block.params, null, 2));
    // Reset local string inputs when switching blocks
    setLocalInputValues({});
    setIsCollapsed(false); // Auto-expand when a new block is selected
  }, [block.id]);

  // Keep localInputValues in sync with external param changes (e.g. simulation updates)
  // Only update keys that are NOT currently being edited
  useEffect(() => {
    setLocalInputValues(prev => {
      const next: Record<string, string> = {};
      Object.entries(block.params).forEach(([k, v]) => {
        // Only overwrite if the user hasn't typed something different
        if (prev[k] === undefined) {
          next[k] = String(typeof v === 'object' ? JSON.stringify(v) : v);
        } else {
          next[k] = prev[k];
        }
      });
      return next;
    });
  }, [block.params]);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isMouseDown, setIsMouseDown] = useState(false);
  const [startY, setStartY] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.tagName === 'BUTTON' ||
      target.closest('button') ||
      target.closest('input') ||
      target.closest('select') ||
      target.closest('textarea')
    ) {
      return;
    }
    setIsMouseDown(true);
    setStartY(e.pageY - (containerRef.current?.offsetTop || 0));
    setScrollTop(containerRef.current?.scrollTop || 0);
  };

  const handleMouseLeave = () => {
    setIsMouseDown(false);
  };

  const handleMouseUp = () => {
    setIsMouseDown(false);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isMouseDown || !containerRef.current) return;
    e.preventDefault();
    const y = e.pageY - containerRef.current.offsetTop;
    const walk = (y - startY) * 1.5;
    containerRef.current.scrollTop = scrollTop - walk;
  };

  const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setLocalLabel(e.target.value);
    onUpdate(block.id, { label: e.target.value });
  };

  const handleParamsChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setLocalParams(e.target.value);
    try {
      const parsed = JSON.parse(e.target.value);
      onUpdate(block.id, { params: parsed });
    } catch (err) {
      // Invalid JSON, don't update yet
    }
  };

  const handleAddInput = () => {
    if (!block.allowDynamicInputs) return;

    if (block.type === 'FUZZY_RULE') {
      const numAntecedents = (block.params.numAntecedents || 2) + 1;
      const newInputs = [
        ...Array.from({ length: numAntecedents }, (_, i) => ({
          id: `ant${i+1}`,
          name: `μ_ant${i+1}`,
          type: 'continuous' as const,
          direction: 'input' as const,
          value: 0,
          position: 'left' as const
        })),
        {
          id: 'cons',
          name: 'Cons',
          type: 'continuous' as const,
          direction: 'input' as const,
          value: 0,
          position: 'bottom' as const
        }
      ];
      onUpdate(block.id, {
        params: { ...block.params, numAntecedents },
        inputs: newInputs
      });
      return;
    }

    const inPrefix = 'in';
    const newLength = block.inputs.length + 1;
    const newId = inPrefix + String(newLength);
    const newPort: XPort = {
      id: newId,
      name: (block.type === 'MUX' ? 'u' : 'In ') + String(newLength),
      type: 'auto',
      direction: 'input',
      value: 0,
      position: 'left'
    };
    onUpdate(block.id, {
      params: { ...block.params, numInputs: newLength },
      inputs: [...block.inputs, newPort]
    });
  };

  const handleRemoveInput = (id: string) => {
    if (!block.allowDynamicInputs || block.inputs.length <= 2) return; // Keep at least 2 for dynamic blocks usually

    if (block.type === 'FUZZY_RULE') {
      const numAntecedents = Math.max(1, (block.params.numAntecedents || 2) - 1);
      const newInputs = [
        ...Array.from({ length: numAntecedents }, (_, i) => ({
          id: `ant${i+1}`,
          name: `μ_ant${i+1}`,
          type: 'continuous' as const,
          direction: 'input' as const,
          value: 0,
          position: 'left' as const
        })),
        {
          id: 'cons',
          name: 'Cons',
          type: 'continuous' as const,
          direction: 'input' as const,
          value: 0,
          position: 'bottom' as const
        }
      ];
      onUpdate(block.id, {
        params: { ...block.params, numAntecedents },
        inputs: newInputs
      });
      return;
    }

    const filteredInputs = block.inputs.filter(i => i.id !== id);
    const renamedInputs = filteredInputs.map((port, idx) => {
      const isMux = block.type === 'MUX';
      const name = isMux ? `u${idx + 1}` : `In ${idx + 1}`;
      return {
        ...port,
        id: `in${idx + 1}`,
        name: name,
        position: 'left' as const
      };
    });
    onUpdate(block.id, {
      params: { ...block.params, numInputs: renamedInputs.length },
      inputs: renamedInputs
    });
  };

  const handleAddOutput = () => {
    if (!block.allowDynamicOutputs) return;
    const outPrefix = 'out';
    const newLength = block.outputs.length + 1;
    const newId = outPrefix + String(newLength);
    const newPort: XPort = {
      id: newId,
      name: (block.type === 'DEMUX' ? 'y' : 'Out ') + String(newLength),
      type: 'auto',
      direction: 'output',
      value: 0,
      position: 'right'
    };
    onUpdate(block.id, {
      params: { ...block.params, numOutputs: newLength },
      outputs: [...block.outputs, newPort]
    });
  };

  const handleRemoveOutput = (id: string) => {
    if (!block.allowDynamicOutputs || block.outputs.length <= 2) return; // Keep at least 2 for dynamic blocks usually

    const filteredOutputs = block.outputs.filter(o => o.id !== id);
    const renamedOutputs = filteredOutputs.map((port, idx) => {
      const isDemux = block.type === 'DEMUX';
      const name = isDemux ? `y${idx + 1}` : `Out ${idx + 1}`;
      return {
        ...port,
        id: `out${idx + 1}`,
        name: name,
        position: 'right' as const
      };
    });
    onUpdate(block.id, {
      params: { ...block.params, numOutputs: renamedOutputs.length },
      outputs: renamedOutputs
    });
  };

  const updateArrayParam = (key: string, index: number, newVal: number) => {
    const currentArray = [...(block.params[key] || [])];
    currentArray[index] = Number(newVal) || 0;
    onUpdate(block.id, { params: { ...block.params, [key]: currentArray } });
  };

  const addArrayParam = (key: string) => {
    const currentArray = [...(block.params[key] || [])];
    currentArray.push(0);
    onUpdate(block.id, { params: { ...block.params, [key]: currentArray } });
  };

  const removeArrayParam = (key: string, index: number) => {
    const currentArray = [...(block.params[key] || [])];
    if (currentArray.length <= 1) return; // Keep at least one element
    currentArray.splice(index, 1);
    onUpdate(block.id, { params: { ...block.params, [key]: currentArray } });
  };

  const handleRawArrayInput = (key: string, valStr: string) => {
    let cleaned = valStr.trim();
    if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
      cleaned = cleaned.substring(1, cleaned.length - 1);
    }
    const parts = cleaned.split(/[\s,]+/).map(p => Number(p)).filter(p => !isNaN(p));
    if (parts.length > 0) {
      onUpdate(block.id, { params: { ...block.params, [key]: parts } });
    }
  };

  const renderEquationPreview = () => {
    return (
      <div className="bg-[#0a0a0a] border border-[#222] p-3 rounded-lg flex flex-col items-center justify-center min-h-[70px] relative shadow-inner">
        <span className="absolute top-1 left-2 text-[8px] font-black text-gray-600 uppercase tracking-widest">Equation Preview</span>
        <div className="flex flex-col items-center text-center mt-2 w-full select-all">
          {block.type === 'ZERO_POLE_GAIN' ? (() => {
            const { num, den } = zpgToString(block.params.zeros || [], block.params.poles || [-1], block.params.gain ?? 1, 's');
            return (
              <div className="flex flex-col items-center w-full max-w-[240px] overflow-x-auto custom-scrollbar py-1">
                <div className="font-mono text-xs text-emerald-400 font-bold whitespace-nowrap">{num}</div>
                <div className="w-full h-px bg-emerald-500/30 my-1 shadow-[0_0_4px_rgba(16,185,129,0.2)]" />
                <div className="font-mono text-xs text-emerald-400 font-bold whitespace-nowrap">{den}</div>
              </div>
            );
          })() : (() => {
            const variable = block.type === 'DISCRETE_TRANSFER_FUNCTION' ? 'z' : 's';
            return (
              <div className="flex flex-col items-center w-full max-w-[240px] overflow-x-auto custom-scrollbar py-1">
                <div className="font-mono text-xs text-emerald-400 font-bold whitespace-nowrap">
                  {polyToString(block.params.numerator || [1], variable)}
                </div>
                <div className="w-full h-px bg-emerald-500/30 my-1 shadow-[0_0_4px_rgba(16,185,129,0.2)]" />
                <div className="font-mono text-xs text-emerald-400 font-bold whitespace-nowrap">
                  {polyToString(block.params.denominator || [1, 1], variable)}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    );
  };

  const updatePortName = (portId: string, newName: string, isInput: boolean) => {
    const list = (isInput ? block.inputs : block.outputs) || [];
    const updated = list.map(p => p.id === portId ? { ...p, name: newName } : p);
    onUpdate(block.id, isInput ? { inputs: updated } : { outputs: updated });
  };

  const Triangle = ({ size, className, fill }: { size: number, className?: string, fill?: string }) => (
    <svg 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill={fill || "none"} 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M3 20h18L12 4z" />
    </svg>
  );

  return (
    <div className={
      (isCollapsed ? 'w-12' : 'w-80') + 
      ' bg-[#1a1a1a] border-l border-[#333] flex flex-col h-full shadow-2xl z-50 text-[#e0e0e0] transition-all duration-300 overflow-hidden select-text'
    }>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#333] bg-[#0a0a0a]">
        {!isCollapsed && (
          <div className="flex items-center gap-2 text-[#c9a86c] font-bold animate-in fade-in duration-300">
            <Settings2 size={16} />
            Properties
          </div>
        )}
        <div className={`flex items-center gap-2 ${isCollapsed ? 'flex-col w-full' : ''}`}>
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)} 
            className="p-1.5 rounded bg-[#222] border border-[#333] text-[#c9a86c] hover:bg-[#c9a86c]/15 transition-all"
            title={isCollapsed ? "Expand Properties" : "Collapse Properties"}
          >
            <Triangle size={12} className={`transition-transform duration-300 ${isCollapsed ? '-rotate-90' : 'rotate-90'}`} fill="currentColor" />
          </button>
          {!isCollapsed && (
            <button onClick={onClose} className="text-slate-400 hover:text-slate-250 transition-colors p-1">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div 
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        className={`flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-6 cursor-grab active:cursor-grabbing ${isCollapsed ? 'hidden' : 'block'}`}
        style={{ maxHeight: 'calc(100% - 60px)' }}
      >
        {/* General */}
        <section className="space-y-3">
          <h3 className="text-[10px] font-bold text-slate-455 uppercase tracking-wider">General</h3>
          <div>
            <label className="block text-xs font-medium text-slate-455 mb-1">Block Name</label>
            <input 
              type="text" 
              value={localLabel}
              onChange={handleLabelChange}
              className="w-full text-sm px-2.5 py-1.5 border border-[#333] bg-[#0a0a0a] text-[#e0e0e0] rounded focus:border-[#c9a86c] focus:ring-1 focus:ring-[#c9a86c]/50 outline-none transition-all"
            />
          </div>
          <div className="flex justify-between items-center bg-[#0a0a0a] p-2 rounded border border-[#333]">
            <span className="text-xs text-slate-400">Block Type</span>
            <span className="text-xs font-mono font-medium text-[#c9a86c]">{block.type}</span>
          </div>
          {block.description && (
            <div className="bg-[#0a0a0a] p-3 rounded border border-[#333] text-xs text-slate-400 space-y-1.5 shadow-inner">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Description & Notes</span>
              <p className="leading-relaxed whitespace-pre-wrap font-sans text-slate-400">{block.description}</p>
            </div>
          )}
          {block.type === 'DOE_MODULE' && onLaunchDoe && (
            <button 
              onClick={onLaunchDoe}
              className="w-full p-3 bg-[#c9a86c] text-white rounded font-bold text-xs flex items-center justify-center gap-2 hover:bg-[#b8975a] transition-all shadow-md"
            >
              <Layers size={14} /> Launch Modeling Workspace
            </button>
          )}
        </section>

        {/* Parameters */}
        <section className="space-y-3">
          <h3 className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">Parameters</h3>

          {/* ── SUM_JUNCTION / Sum Sign Editor ── */}
          {(block.type === 'SUM_JUNCTION' || block.type === 'Sum') && (() => {
            const numInputs: number = block.params.numInputs || 2;
            const signs: string[] = block.params.signs
              ? [...block.params.signs]
              : Array(numInputs).fill('+');
            // Ensure signs array is always in sync with numInputs
            while (signs.length < numInputs) signs.push('+');

            const toggleSign = (idx: number) => {
              const newSigns = [...signs];
              newSigns[idx] = newSigns[idx] === '-' ? '+' : '-';
              // Sync port names to match +/-
              const newInputs = [...block.inputs].map((p, i) => ({
                ...p,
                name: newSigns[i] === '-' ? '\u2212In' + String(i + 1) : '+In' + String(i + 1)
              }));
              onUpdate(block.id, {
                params: { ...block.params, signs: newSigns },
                inputs: newInputs
              });
            };

            const addSignedInput = () => {
              const newSigns = [...signs, '+'];
              const newNumInputs = numInputs + 1;
              const inPrefix = 'in';
              const newId = inPrefix + String(newNumInputs);
              const newInputs = [
                ...block.inputs,
                { id: newId, name: '+In' + String(newNumInputs), type: 'auto' as const, direction: 'input' as const, value: 0, position: 'left' as const }
              ];
              onUpdate(block.id, {
                params: { ...block.params, numInputs: newNumInputs, signs: newSigns },
                inputs: newInputs
              });
            };

            const removeSignedInput = (idx: number) => {
              if (numInputs <= 2) return;
              const newSigns = signs.filter((_, i) => i !== idx);
              const newNumInputs = numInputs - 1;
              const inPrefix = 'in';
              const newInputs = block.inputs
                .filter((_, i) => i !== idx)
                .map((p, i) => ({
                  ...p,
                  id: inPrefix + String(i + 1),
                  name: newSigns[i] === '-' ? '\u2212In' + String(i + 1) : '+In' + String(i + 1),
                  position: 'left' as const
                }));
              onUpdate(block.id, {
                params: { ...block.params, numInputs: newNumInputs, signs: newSigns },
                inputs: newInputs
              });
            };

            return (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-455">Input Signs</label>
                  <button
                    onClick={addSignedInput}
                    className="flex items-center gap-1 text-[10px] font-bold text-[#28a745] bg-[#28a745]/10 px-2 py-1 rounded hover:bg-[#28a745]/20 transition-all border border-[#28a745]/20"
                  >
                    <Plus size={10} /> Add Input
                  </button>
                </div>
                <div className="space-y-2">
                  {signs.slice(0, numInputs).map((sign, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 bg-[#0a0a0a] border border-[#333] rounded-lg px-2 py-1.5"
                    >
                      {/* Port index */}
                      <span className="text-[9px] font-bold text-slate-400 w-10 shrink-0 uppercase tracking-tight">
                        In {idx + 1}
                      </span>
                      {/* Sign toggle */}
                      <button
                        onClick={() => toggleSign(idx)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1 rounded-md font-black text-sm transition-all duration-200"
                        style={{
                          color: sign === '-' ? '#ef4444' : '#28a745',
                          background: sign === '-' ? 'rgba(239,68,68,0.15)' : 'rgba(40,167,69,0.15)',
                          border: '1.5px solid ' + (sign === '-' ? 'rgba(239,68,68,0.3)' : 'rgba(40,167,69,0.3)')
                        }}
                        title="Click to toggle +/−"
                      >
                        <span className="text-base leading-none">{sign === '-' ? '−' : '+'}</span>
                        <span className="text-[9px] font-semibold opacity-60">{sign === '-' ? 'Subtract' : 'Add'}</span>
                      </button>
                      {/* Remove button (only if > 2 inputs) */}
                      {numInputs > 2 && (
                        <button
                          onClick={() => removeSignedInput(idx)}
                          className="text-slate-500 hover:text-red-500 p-1 rounded transition-colors shrink-0"
                          title="Remove this input"
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {/* Equation preview */}
                <div className="bg-[#0a0a0a] border border-[#333] rounded-lg p-2.5 text-center">
                  <span className="text-[9px] text-slate-500 uppercase tracking-wider block mb-1">Equation</span>
                  <span className="text-xs font-mono text-[#28a745]">
                    Y = {signs.slice(0, numInputs).map((s, i) => (s === '-' ? '\u2212' : (i === 0 ? '' : '+')) + 'u' + String(i + 1)).join(' ')}
                  </span>
                </div>
              </div>
            );
          })()}
 
          {/* Custom Simulink-style Transfer Function / ZPG Editors */}
          {['TRANSFER_FUNCTION', 'DISCRETE_TRANSFER_FUNCTION'].includes(block.type) && (
            <div className="space-y-4">
              {renderEquationPreview()}
 
              {/* Numerator */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-455">Numerator Coefficients</label>
                  <button 
                    onClick={() => addArrayParam('numerator')}
                    className="text-emerald-400 hover:text-emerald-300 text-[10px] font-bold bg-emerald-950/20 px-2 py-0.5 rounded border border-emerald-900/30 transition-all"
                  >
                    + Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 p-2 bg-[#0a0a0a] border border-[#333] rounded-lg">
                  {(block.params.numerator || [1]).map((val: number, idx: number) => (
                    <div key={idx} className="flex items-center bg-[#222] border border-[#333] rounded px-1.5 py-0.5 gap-1">
                      <input 
                        type="number" 
                        step="any"
                        value={val}
                        onChange={(e) => updateArrayParam('numerator', idx, Number(e.target.value))}
                        className="w-10 bg-transparent text-xs text-[#e0e0e0] outline-none border-none text-center font-mono"
                      />
                      {(block.params.numerator || [1]).length > 1 && (
                        <button 
                          onClick={() => removeArrayParam('numerator', idx)}
                          className="text-red-500 hover:text-red-400 p-0.5 rounded"
                        >
                          <X size={10} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <input 
                  type="text"
                  placeholder="Or type raw array, e.g. [1, 2, 1]"
                  defaultValue={JSON.stringify(block.params.numerator || [1])}
                  onBlur={(e) => handleRawArrayInput('numerator', e.target.value)}
                  className="w-full text-xs font-mono px-2 py-1.5 border border-[#333] bg-[#0a0a0a] text-slate-400 rounded outline-none focus:border-[#c9a86c]"
                />
              </div>
 
              {/* Denominator */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-455">Denominator Coefficients</label>
                  <button 
                    onClick={() => addArrayParam('denominator')}
                    className="text-emerald-400 hover:text-emerald-300 text-[10px] font-bold bg-emerald-950/20 px-2 py-0.5 rounded border border-emerald-900/30 transition-all"
                  >
                    + Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 p-2 bg-[#0a0a0a] border border-[#333] rounded-lg">
                  {(block.params.denominator || [1, 1]).map((val: number, idx: number) => (
                    <div key={idx} className="flex items-center bg-[#222] border border-[#333] rounded px-1.5 py-0.5 gap-1">
                      <input 
                        type="number" 
                        step="any"
                        value={val}
                        onChange={(e) => updateArrayParam('denominator', idx, Number(e.target.value))}
                        className="w-10 bg-transparent text-xs text-[#e0e0e0] outline-none border-none text-center font-mono"
                      />
                      {(block.params.denominator || [1, 1]).length > 1 && (
                        <button 
                          onClick={() => removeArrayParam('denominator', idx)}
                          className="text-red-500 hover:text-red-400 p-0.5 rounded"
                        >
                          <X size={10} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <input 
                  type="text"
                  placeholder="Or type raw array, e.g. [1, 2, 1]"
                  defaultValue={JSON.stringify(block.params.denominator || [1, 1])}
                  onBlur={(e) => handleRawArrayInput('denominator', e.target.value)}
                  className="w-full text-xs font-mono px-2 py-1.5 border border-[#333] bg-[#0a0a0a] text-slate-400 rounded outline-none focus:border-[#c9a86c]"
                />
              </div>
            </div>
          )}
 
          {block.type === 'ZERO_POLE_GAIN' && (
            <div className="space-y-4">
              {renderEquationPreview()}
 
              {/* Gain (K) */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-455">Gain (K)</label>
                <input 
                  type="number" 
                  step="any"
                  value={block.params.gain ?? 1}
                  onChange={(e) => onUpdate(block.id, { params: { ...block.params, gain: Number(e.target.value) || 1 } })}
                  className="w-full text-sm font-mono px-2.5 py-1.5 border border-[#333] bg-[#0a0a0a] text-[#e0e0e0] rounded outline-none focus:border-[#c9a86c]"
                />
              </div>
 
              {/* Zeros */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-455">Zeros</label>
                  <button 
                    onClick={() => addArrayParam('zeros')}
                    className="text-emerald-400 hover:text-emerald-300 text-[10px] font-bold bg-emerald-950/20 px-2 py-0.5 rounded border border-emerald-900/30 transition-all"
                  >
                    + Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 p-2 bg-[#0a0a0a] border border-[#333] rounded-lg">
                  {(block.params.zeros || []).length === 0 ? (
                    <span className="text-[10px] text-slate-500 italic">None (no zeros)</span>
                  ) : (
                    (block.params.zeros || []).map((val: number, idx: number) => (
                      <div key={idx} className="flex items-center bg-[#222] border border-[#333] rounded px-1.5 py-0.5 gap-1">
                        <input 
                          type="number" 
                          step="any"
                          value={val}
                          onChange={(e) => updateArrayParam('zeros', idx, Number(e.target.value))}
                          className="w-10 bg-transparent text-xs text-[#e0e0e0] outline-none border-none text-center font-mono"
                        />
                        <button 
                          onClick={() => removeArrayParam('zeros', idx)}
                          className="text-red-500 hover:text-red-400 p-0.5 rounded"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <input 
                  type="text"
                  placeholder="Or type raw array, e.g. [-1, -2]"
                  defaultValue={JSON.stringify(block.params.zeros || [])}
                  onBlur={(e) => handleRawArrayInput('zeros', e.target.value)}
                  className="w-full text-xs font-mono px-2 py-1.5 border border-[#333] bg-[#0a0a0a] text-slate-400 rounded outline-none focus:border-[#c9a86c]"
                />
              </div>
 
              {/* Poles */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-455">Poles</label>
                  <button 
                    onClick={() => addArrayParam('poles')}
                    className="text-emerald-400 hover:text-emerald-300 text-[10px] font-bold bg-emerald-950/20 px-2 py-0.5 rounded border border-emerald-900/30 transition-all"
                  >
                    + Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 p-2 bg-[#0a0a0a] border border-[#333] rounded-lg">
                  {(block.params.poles || [-1]).map((val: number, idx: number) => (
                    <div key={idx} className="flex items-center bg-[#222] border border-[#333] rounded px-1.5 py-0.5 gap-1">
                      <input 
                        type="number" 
                        step="any"
                        value={val}
                        onChange={(e) => updateArrayParam('poles', idx, Number(e.target.value))}
                        className="w-10 bg-transparent text-xs text-[#e0e0e0] outline-none border-none text-center font-mono"
                      />
                      {(block.params.poles || [-1]).length > 1 && (
                        <button 
                          onClick={() => removeArrayParam('poles', idx)}
                          className="text-red-500 hover:text-red-400 p-0.5 rounded"
                        >
                          <X size={10} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <input 
                  type="text"
                  placeholder="Or type raw array, e.g. [-2, -3]"
                  defaultValue={JSON.stringify(block.params.poles || [-1])}
                  onBlur={(e) => handleRawArrayInput('poles', e.target.value)}
                  className="w-full text-xs font-mono px-2 py-1.5 border border-[#333] bg-[#0a0a0a] text-slate-400 rounded outline-none focus:border-[#c9a86c]"
                />
              </div>
            </div>
          )}

          {Object.entries(block.params)
            .filter(([key]) => {
              if (['TRANSFER_FUNCTION', 'DISCRETE_TRANSFER_FUNCTION', 'ZERO_POLE_GAIN'].includes(block.type)) {
                return !['A', 'B', 'C', 'D', 'numerator', 'denominator', 'zeros', 'poles', 'gain', 'representation'].includes(key);
              }
              // SUM_JUNCTION: hide signs and numInputs from generic renderer (handled by sign editor above)
              if (block.type === 'SUM_JUNCTION') {
                return !['signs', 'numInputs'].includes(key);
              }
              // PWM_GENERATOR: duty comes from the input port only (like Simulink), never a param
              if (block.type === 'PWM_GENERATOR') {
                return key !== 'duty';
              }
              return true;
            })
            .map(([key, value]) => {
              const isObjectParam = typeof value === 'object' && value !== null && 'value' in value;
              let displayValue = isObjectParam ? value.value : value;
              if (typeof displayValue === 'object' && displayValue !== null) {
                displayValue = JSON.stringify(displayValue);
              }

              if (key === 'smVarId' && (block.type === 'Inport' || block.type === 'Outport')) {
                return (
                    <div key={key}>
                      <label className="block text-xs font-medium text-slate-400 mb-1">Source/Target SM Variable</label>
                      <select
                        value={displayValue as string}
                        onChange={(e) => onUpdate(block.id, { params: { ...block.params, [key]: e.target.value } })}
                        className="w-full text-sm px-2.5 py-1.5 border border-[#333] bg-[#0a0a0a] text-[#e0e0e0] rounded focus:border-[#c9a86c] outline-none transition-all cursor-pointer"
                      >
                        <option value="">None / Manual Map</option>
                        {availableVariables?.map(v => (
                          <option key={v.id} value={v.id}>{v.name}</option>
                        ))}
                      </select>
                    </div>
                );
              }

              return (
                <div key={key}>
                  <label className="block text-xs font-medium text-slate-400 mb-1 capitalize">
                    {key.replace(/([A-Z])/g, ' $1').trim()}
                  </label>
                  
                   {['representation', 'mode', 'method', 'criteria', 'operation', 'angle_unit', 'output_type', 'rounding', 'overflow', 'type', 'numCases', 'numSignals', 'bufferSize', 'andMethod', 'orMethod', 'defuzzMethod', 'operator', 'implication', 'limitDataPoints', 'showGrid', 'showLegend', 'timeRange', 'diagMode', 'axis', 'carrierType'].includes(key) && 
                  (key !== 'type' || block.type === 'WaveformGen' || block.type === 'FUZZY_INFERENCE_SYSTEM') ? (
                    <select
                      value={String(displayValue)}
                      onChange={(e) => {
                        let val: any = e.target.value;
                        if (val === 'true') val = true;
                        if (val === 'false') val = false;
                        onUpdate(block.id, { params: { ...block.params, [key]: val } });
                      }}
                      className="w-full text-sm px-2.5 py-1.5 border border-[#333] bg-[#0a0a0a] text-emerald-400 font-bold rounded focus:border-[#c9a86c] focus:ring-1 focus:ring-[#c9a86c]/50 outline-none transition-all cursor-pointer"
                    >
                      {key === 'mode' && block.type === 'NUMERIC_REPRESENTATION' && (
                        <>
                          <option value="floating_point">Floating-Point</option>
                          <option value="fixed_point">Fixed-Point</option>
                        </>
                      )}
                      {key === 'output_type' && block.type === 'NUMERIC_REPRESENTATION' && block.params?.mode === 'floating_point' && (
                        <>
                          <option value="float32">Single (float32)</option>
                          <option value="float64">Double (float64)</option>
                          <option value="float16">Half (float16)</option>
                          <option value="boolean">Boolean</option>
                        </>
                      )}
                      {key === 'output_type' && block.type === 'NUMERIC_REPRESENTATION' && block.params?.mode !== 'floating_point' && (
                        <>
                          <option value="fixed_point">Fixed-Point (WL/FL)</option>
                          <option value="int8">Int8</option>
                          <option value="uint8">UInt8</option>
                          <option value="int16">Int16</option>
                          <option value="uint16">UInt16</option>
                          <option value="int32">Int32</option>
                          <option value="uint32">UInt32</option>
                          <option value="boolean">Boolean</option>
                        </>
                      )}
                      {key === 'output_type' && block.type !== 'NUMERIC_REPRESENTATION' && (
                        <>
                          <option value="float64">Double (float64)</option>
                          <option value="float32">Single (float32)</option>
                          <option value="int8">Int8</option>
                          <option value="uint8">UInt8</option>
                          <option value="int16">Int16</option>
                          <option value="uint16">UInt16</option>
                          <option value="int32">Int32</option>
                          <option value="uint32">UInt32</option>
                          <option value="boolean">Boolean</option>
                          <option value="fixed_point">Fixed-Point</option>
                        </>
                      )}
                      {key === 'rounding' && (
                        <>
                          <option value="floor">Floor</option>
                          <option value="ceil">Ceil</option>
                          <option value="round">Round (Nearest)</option>
                          <option value="convergent">Convergent (Even)</option>
                        </>
                      )}
                      {key === 'overflow' && (
                        <>
                          <option value="saturate">Saturate</option>
                          <option value="wrap">Wrap</option>
                        </>
                      )}
                      {key === 'numSignals' && (
                        <>
                          {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                            <option key={n} value={n}>{n} Channels</option>
                          ))}
                        </>
                      )}
                      {key === 'bufferSize' && (
                        <>
                          {[100, 500, 1000, 2000, 5000, 10000].map(n => (
                            <option key={n} value={n}>{n} Samples</option>
                          ))}
                        </>
                      )}
                      {key === 'limitDataPoints' && (
                        <>
                          <option value="true">On (Yes)</option>
                          <option value="false">Off (No)</option>
                        </>
                      )}
                      {key === 'showGrid' && (
                        <>
                          <option value="true">On (Yes)</option>
                          <option value="false">Off (No)</option>
                        </>
                      )}
                      {key === 'showLegend' && (
                        <>
                          <option value="true">On (Yes)</option>
                          <option value="false">Off (No)</option>
                        </>
                      )}
                      {key === 'timeRange' && (
                        <>
                          <option value="auto">Auto (Full)</option>
                          <option value="1">1s</option>
                          <option value="2">2s</option>
                          <option value="5">5s</option>
                          <option value="10">10s</option>
                          <option value="30">30s</option>
                          <option value="60">60s</option>
                        </>
                      )}
                      {key === 'numCases' && (
                        <>
                          {[2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                            <option key={n} value={n}>{n} Cases</option>
                          ))}
                        </>
                      )}
                      {key === 'representation' && (
                        <>
                          <option value="continuous">Continuous-Time</option>
                          <option value="discrete">Discrete-Time</option>
                        </>
                      )}
                      {key === 'mode' && (block.type === 'PID_CONTROLLER' || block.type === 'PID_BASIC') && (
                        <>
                          <option value="P">P - Proportional</option>
                          <option value="PI">PI - Prop-Integral</option>
                          <option value="PD">PD - Prop-Deriv</option>
                          <option value="PID">PID - Full Control</option>
                        </>
                      )}
                      {key === 'mode' && block.type === 'CFD_DEM_SURROGATE_LEARNER' && (
                        <>
                          <option value="training">Training</option>
                          <option value="inference">Inference</option>
                        </>
                      )}
                      {key === 'mode' && block.type === 'CLARKE_TRANSFORM' && (
                        <>
                          <option value="amplitude_invariant">Amplitude Invariant</option>
                          <option value="power_invariant">Power Invariant</option>
                        </>
                      )}
                      {key === 'mode' && block.type === 'FLUX_REFERENCE' && (
                        <>
                          <option value="constant">Constant</option>
                          <option value="field_weakening">Field Weakening</option>
                        </>
                      )}
                      {key === 'method' && block.type !== 'FUZZY_AND' && block.type !== 'FUZZY_OR' && (
                        <>
                          <option value="forward_euler">Forward Euler</option>
                          <option value="backward_euler">Backward Euler</option>
                          <option value="tustin">Tustin / Trapezoidal</option>
                        </>
                      )}
                      {key === 'criteria' && (
                        <>
                          <option value=">">&gt; (Greater Than)</option>
                          <option value="<">&lt; (Less Than)</option>
                          <option value=">=">&gt;= (Greater or Equal)</option>
                          <option value="<=">&lt;= (Less or Equal)</option>
                        </>
                      )}
                      {key === 'operation' && (
                        <>
                          <option value="multiply">Multiply</option>
                          <option value="divide">Divide</option>
                        </>
                      )}
                      {key === 'diagMode' && (
                        <>
                          <option value="create">Create Diagonal Matrix from Vector</option>
                          <option value="extract">Extract Diagonal Vector from Matrix</option>
                        </>
                      )}
                      {key === 'axis' && (
                        <>
                          <option value="0">Vertical (Axis 0 - Rows)</option>
                          <option value="1">Horizontal (Axis 1 - Columns)</option>
                        </>
                      )}
                      {key === 'angle_unit' && (
                        <>
                          <option value="radians">Radians</option>
                          <option value="degrees">Degrees</option>
                        </>
                      )}
                      {/* Duplicate output_type and rounding blocks removed */}
                      {key === 'type' && block.type === 'WaveformGen' && (
                        <>
                          <option value="Sine">Sine Wave</option>
                          <option value="Square">Square Wave</option>
                        </>
                      )}
                      {key === 'type' && block.type === 'FUZZY_INFERENCE_SYSTEM' && (
                        <>
                          <option value="Mamdani">Mamdani</option>
                          <option value="Sugeno">Sugeno (Takagi-Sugeno)</option>
                        </>
                      )}
                      {key === 'andMethod' && (
                        <>
                          <option value="min">Minimum (T-Norm)</option>
                          <option value="product">Algebraic Product</option>
                        </>
                      )}
                      {key === 'orMethod' && (
                        <>
                          <option value="max">Maximum (S-Norm)</option>
                          <option value="probor">Probabilistic Sum</option>
                        </>
                      )}
                      {key === 'defuzzMethod' && (
                        <>
                          <option value="centroid">Centroid (COA)</option>
                          <option value="bisector">Bisector (BOA)</option>
                          <option value="mom">Mean of Maximum (MOM)</option>
                          <option value="som">Smallest of Maximum (SOM)</option>
                          <option value="lom">Largest of Maximum (LOM)</option>
                        </>
                      )}
                      {key === 'operator' && (
                        <>
                          <option value="AND">AND (Min)</option>
                          <option value="OR">OR (Max)</option>
                        </>
                      )}
                      {key === 'implication' && (
                        <>
                          <option value="min">Minimum (Mamdani)</option>
                          <option value="prod">Product (Larsen)</option>
                        </>
                      )}
                      {key === 'method' && (block.type === 'FUZZY_AND' || block.type === 'FUZZY_OR') && (
                        <>
                          {block.type === 'FUZZY_AND' ? (
                            <>
                              <option value="min">Minimum</option>
                              <option value="product">Algebraic Product</option>
                            </>
                          ) : (
                            <>
                              <option value="max">Maximum</option>
                              <option value="probor">Probabilistic Sum</option>
                            </>
                          )}
                        </>
                      )}
                      {key === 'carrierType' && (
                        <>
                          <option value="triangle">⟋⟍ Triangle (Symmetric / Centered PWM)</option>
                          <option value="sawtooth">⟋ Sawtooth (Leading Edge / Naturally Sampled)</option>
                          <option value="inv_sawtooth">⟍ Inverse Sawtooth (Trailing Edge)</option>
                          <option value="sine">∿ Sine Wave Carrier</option>
                          <option value="square">⊓ Square Wave Carrier</option>
                        </>
                      )}
                    </select>
                  ) : key === 'text' ? (
                    <textarea
                      value={localInputValues[key] !== undefined ? localInputValues[key] : String(displayValue)}
                      onChange={(e) => {
                        setLocalInputValues(prev => ({ ...prev, [key]: e.target.value }));
                        onUpdate(block.id, { params: { ...block.params, [key]: e.target.value } });
                      }}
                      className="w-full h-32 text-sm px-2.5 py-1.5 border border-[#333] bg-[#0a0a0a] text-slate-300 rounded focus:border-[#c9a86c] outline-none transition-all resize-y font-sans leading-relaxed"
                      placeholder="Type notes here..."
                    />
                  ) : (
                    <input
                      type="text"
                      value={localInputValues[key] !== undefined ? localInputValues[key] : String(displayValue)}
                      onChange={(e) => {
                        const raw = normalizeNumerals(e.target.value);
                        // Update the local display string immediately
                        setLocalInputValues(prev => ({ ...prev, [key]: raw }));

                        const trimmedRaw = raw.trim();
                        
                        // 1. Do not commit arrays/matrices or multi-word inputs mid-typing
                        if (trimmedRaw.startsWith('[') || trimmedRaw.includes(' ') || trimmedRaw.includes(';')) {
                          return;
                        }

                        // 2. Do not commit incomplete numbers mid-typing
                        if (raw === '' || raw === '-' || raw.endsWith('.') || raw.endsWith('e') || raw.endsWith('e-') || raw.endsWith('e+')) {
                          return;
                        }

                        // 3. Commit valid scalar numbers to allow real-time tuning
                        if (!isNaN(Number(trimmedRaw))) {
                          const val = Number(trimmedRaw);
                          let finalVal = val;
                          if (isObjectParam) {
                            finalVal = { ...block.params[key], value: val };
                          }
                          onUpdate(block.id, { params: { ...block.params, [key]: finalVal } });
                        }
                      }}
                      onBlur={(e) => {
                        // On blur, always commit the final value
                        const raw = normalizeNumerals(e.target.value);
                        const trimmedRaw = raw.trim();
                        let val: any = raw;
                        if (trimmedRaw !== '' && !isNaN(Number(trimmedRaw))) {
                          val = Number(trimmedRaw);
                        } else if (trimmedRaw.startsWith('[') || trimmedRaw.startsWith('{')) {
                           val = VectorUtils.parseMatlabArray(trimmedRaw);
                        }
                        let finalVal = val;
                        if (isObjectParam) {
                          finalVal = { ...block.params[key], value: val };
                        }
                        onUpdate(block.id, { params: { ...block.params, [key]: finalVal } });
                        // Sync local display to committed value so it shows clean form
                        setLocalInputValues(prev => ({ ...prev, [key]: String(typeof finalVal === 'object' ? JSON.stringify(finalVal) : finalVal) }));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      className="w-full text-sm font-mono px-2.5 py-1.5 border border-[#333] bg-[#0a0a0a] text-[#e0e0e0] rounded focus:border-[#c9a86c] outline-none transition-all"
                    />
                  )}
                  {key === 'value' && block.type === 'Constant' && (
                    <p className="text-[10px] text-slate-400 mt-1">Hint: Type `[1, 2, 3]` or MATLAB style `[1 2 3]` for vectors.</p>
                  )}
                  {(key === 'initialValue' || key === 'finalValue') && block.type === 'Step' && (
                    <p className="text-[10px] text-slate-400 mt-1">Hint: Type `[1, 2, 3]` or MATLAB style `[1 2 3]` for vectors.</p>
                  )}
                </div>
              );
            })}
          
          {Object.keys(block.params).length === 0 && (
            <div className="text-xs text-slate-400 italic">No parameters available</div>
          )}
        </section>

        {/* Ports */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-slate-455 uppercase tracking-wider">Input Ports</h3>
            {block.allowDynamicInputs && block.type !== 'SUM_JUNCTION' && (
              <button onClick={handleAddInput} className="text-[#c9a86c] hover:text-[#b8975a] flex items-center gap-1 text-[10px] font-bold bg-[#c9a86c]/10 px-2 py-1 rounded transition-colors">
                <Plus size={10} /> Add
              </button>
            )}
          </div>
          <div className="space-y-2">
            {(block.inputs || []).map(port => (
              <div key={port.id} className="bg-[#0a0a0a] border border-[#333] p-2 rounded-lg space-y-1">
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-sm" />
                      <span className="text-[9px] font-bold text-slate-300 uppercase tracking-tight">
                         {port.id} <span className="text-slate-500 lowercase ml-1">({port.name})</span>
                      </span>
                   </div>
                   <span className="text-[8px] text-blue-400 font-mono bg-blue-900/20 px-1.5 py-0.5 rounded border border-blue-800/30 uppercase tracking-tighter">
                     {port.type}
                   </span>
                </div>
                <div className="flex items-center gap-2">
                  <input 
                    type="text" 
                    value={port.name}
                    onChange={(e) => updatePortName(port.id, e.target.value, true)}
                    className="flex-1 text-xs px-2 py-1 border border-[#333] bg-[#1a1a1a] text-[#e0e0e0] rounded focus:border-[#c9a86c] outline-none"
                    placeholder="Port Label"
                  />
                  {block.allowDynamicInputs && block.type !== 'SUM_JUNCTION' && (block.inputs || []).length > 2 && (
                    <button onClick={() => handleRemoveInput(port.id)} className="text-slate-500 hover:text-red-500 p-1 transition-colors">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {(block.inputs || []).length === 0 && <p className="text-xs text-slate-400 italic px-2">No inputs</p>}
          </div>

          <div className="flex items-center justify-between mt-4">
            <h3 className="text-[10px] font-bold text-slate-455 uppercase tracking-wider">Output Ports</h3>
            {block.allowDynamicOutputs && (
              <button onClick={handleAddOutput} className="text-[#c9a86c] hover:text-[#b8975a] flex items-center gap-1 text-[10px] font-bold bg-[#c9a86c]/10 px-2 py-1 rounded transition-colors">
                <Plus size={10} /> Add
              </button>
            )}
          </div>
          <div className="space-y-2">
            {(block.outputs || []).map(port => (
              <div key={port.id} className="bg-[#0a0a0a] border border-[#333] p-2 rounded-lg space-y-1">
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-sm" />
                      <span className="text-[9px] font-bold text-slate-300 uppercase tracking-tight">
                         {port.id} <span className="text-slate-500 lowercase ml-1">({port.name})</span>
                      </span>
                   </div>
                   <span className="text-[8px] text-emerald-400 font-mono bg-emerald-900/20 px-1.5 py-0.5 rounded border border-emerald-800/30 uppercase tracking-tighter">
                     {port.type}
                   </span>
                </div>
                <div className="flex items-center gap-2">
                  <input 
                    type="text" 
                    value={port.name}
                    onChange={(e) => updatePortName(port.id, e.target.value, false)}
                    className="flex-1 text-xs px-2 py-1 border border-[#333] bg-[#1a1a1a] text-[#e0e0e0] rounded focus:border-[#c9a86c] outline-none"
                    placeholder="Port Label"
                  />
                  {block.allowDynamicOutputs && (block.outputs || []).length > 2 && (
                    <button onClick={() => handleRemoveOutput(port.id)} className="text-slate-500 hover:text-red-500 p-1 transition-colors">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {(block.outputs || []).length === 0 && <p className="text-xs text-slate-400 italic px-2">No outputs</p>}
          </div>
        </section>

        {/* Model Analysis Report (For DOE Models) */}
        {block.type === 'DOE_MODEL' && (block as any).metrics && (
           <section className="mt-8 border-t border-[#333] pt-6 space-y-4">
              <h3 className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                 <Activity size={12} /> Model Analysis Report
              </h3>
              
              <div className="bg-emerald-900/10 border border-emerald-800/30 rounded-xl p-4 space-y-3">
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-0.5">
                       <span className="text-[8px] text-emerald-400/80 uppercase font-black">R-Squared</span>
                       <div className="text-xl font-black text-[#e0e0e0] leading-none">{(block as any).metrics.R2 ? ((block as any).metrics.R2 * 100).toFixed(2) : '0.00'}%</div>
                    </div>
                    {(block as any).metrics.R2Adj !== undefined && (
                       <div className="space-y-0.5">
                          <span className="text-[8px] text-emerald-400/80 uppercase font-black">Adj. R-Squared</span>
                          <div className="text-xl font-black text-[#c0c0c0] leading-none">{((block as any).metrics.R2Adj * 100).toFixed(2)}%</div>
                       </div>
                    )}
                 </div>

                 <div className="h-px bg-emerald-800/30" />

                 <div className="space-y-1.5">
                    <span className="text-[8px] text-emerald-400/80 uppercase font-black">Regression Equation</span>
                    <div className="bg-[#0a0a0a] p-2 rounded-lg border border-[#333] font-mono text-[9px] text-emerald-400 whitespace-pre-wrap break-all leading-relaxed">
                       {(block as any).metrics.equation}
                    </div>
                 </div>
              </div>
            </section>
        )}
      </div>
    </div>
  );
};
