// src/components/xbridges/XbridgesPropertiesPanel.tsx
import React, { useState, useEffect } from 'react';
import { XBlock, XPort } from '../../engine/xbridges/types';
import { X, Plus, Trash2, Settings2, Hash, Layers, Activity } from 'lucide-react';

interface Props {
  block: XBlock | null;
  availableVariables?: any[];
  onUpdate: (blockId: string, data: Partial<XBlock>) => void;
  onLaunchDoe?: () => void;
  onClose: () => void;
}

const normalizeNumerals = (val: string) => {
  if (!val) return "";
  return val.replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString())
            .replace(/[۰۱۲۳۴۵۶۷۸۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d).toString())
            .replace(/[٫،,]/g, '.');
};

export const XbridgesPropertiesPanel: React.FC<Props> = ({ block, availableVariables, onUpdate, onLaunchDoe, onClose }) => {
  if (!block) return null;

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [localLabel, setLocalLabel] = useState(block.label || block.type);
  const [localParams, setLocalParams] = useState(JSON.stringify(block.params, null, 2));

  // Sync when block changes
  useEffect(() => {
    setLocalLabel(block.label || block.type);
    setLocalParams(JSON.stringify(block.params, null, 2));
    setIsCollapsed(false); // Auto-expand when a new block is selected
  }, [block.id]);

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
    const newId = `in${block.inputs.length + 1}`;
    const newPort: XPort = { id: newId, name: `In ${block.inputs.length + 1}`, type: 'auto', direction: 'input', value: 0 };
    onUpdate(block.id, { inputs: [...block.inputs, newPort] });
  };

  const handleRemoveInput = (id: string) => {
    if (!block.allowDynamicInputs || block.inputs.length <= 2) return; // Keep at least 2 for dynamic blocks usually
    onUpdate(block.id, { inputs: block.inputs.filter(i => i.id !== id) });
  };

  const updatePortName = (portId: string, newName: string, isInput: boolean) => {
    const list = isInput ? block.inputs : block.outputs;
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
    <div className={`${isCollapsed ? 'w-12' : 'w-80'} bg-[#141414] border-l border-[#222] flex flex-col h-full shadow-2xl z-50 text-gray-300 transition-all duration-300 overflow-hidden`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#222] bg-[#1a1a1a]">
        {!isCollapsed && (
          <div className="flex items-center gap-2 text-[#c9a86c] font-bold animate-in fade-in duration-300">
            <Settings2 size={16} />
            Properties
          </div>
        )}
        <div className={`flex items-center gap-2 ${isCollapsed ? 'flex-col w-full' : ''}`}>
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)} 
            className="p-1.5 rounded bg-[#0a0a0a] border border-[#333] text-[#c9a86c] hover:bg-[#c9a86c]/10 transition-all"
            title={isCollapsed ? "Expand Properties" : "Collapse Properties"}
          >
            <Triangle size={12} className={`transition-transform duration-300 ${isCollapsed ? '-rotate-90' : 'rotate-90'}`} fill="currentColor" />
          </button>
          {!isCollapsed && (
            <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-1">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto p-4 space-y-6 ${isCollapsed ? 'hidden' : 'block'}`}>
        {/* General */}
        <section className="space-y-3">
          <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">General</h3>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Block Name</label>
            <input 
              type="text" 
              value={localLabel}
              onChange={handleLabelChange}
              className="w-full text-sm px-2.5 py-1.5 border border-[#333] bg-[#0a0a0a] text-white rounded focus:border-[#c9a86c] outline-none transition-all"
            />
          </div>
          <div className="flex justify-between items-center bg-[#0a0a0a] p-2 rounded border border-[#333]">
            <span className="text-xs text-gray-500">Block Type</span>
            <span className="text-xs font-mono font-medium text-[#c9a86c]">{block.type}</span>
          </div>
          {block.type === 'DOE_MODULE' && onLaunchDoe && (
            <button 
              onClick={onLaunchDoe}
              className="w-full p-3 bg-[#c9a86c] text-black rounded font-bold text-xs flex items-center justify-center gap-2 hover:bg-[#b8975a] transition-all shadow-lg"
            >
              <Layers size={14} /> Launch Modeling Workspace
            </button>
          )}
        </section>

        {/* Parameters */}
        <section className="space-y-3">
          <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Parameters</h3>
          {Object.entries(block.params).map(([key, value]) => {
            let displayValue = value;
            if (typeof value === 'object') displayValue = JSON.stringify(value);

            if (key === 'smVarId' && (block.type === 'Inport' || block.type === 'Outport')) {
               return (
                  <div key={key}>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Source/Target SM Variable</label>
                    <select
                      value={displayValue as string}
                      onChange={(e) => onUpdate(block.id, { params: { ...block.params, [key]: e.target.value } })}
                      className="w-full text-sm px-2.5 py-1.5 border border-[#333] bg-[#0a0a0a] text-amber-400 rounded focus:border-[#c9a86c] outline-none transition-all"
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
                <label className="block text-xs font-medium text-gray-400 mb-1 capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </label>
                
                {['representation', 'mode', 'method', 'criteria', 'operation', 'angle_unit', 'output_type', 'rounding', 'overflow', 'type', 'numCases', 'numSignals', 'bufferSize'].includes(key) && 
                 (key !== 'type' || block.type === 'WaveformGen') ? (
                  <select
                    value={displayValue as string}
                    onChange={(e) => onUpdate(block.id, { params: { ...block.params, [key]: e.target.value } })}
                    className="w-full text-sm px-2.5 py-1.5 border border-[#333] bg-[#0a0a0a] text-emerald-400 font-bold rounded focus:border-[#c9a86c] outline-none transition-all cursor-pointer"
                  >
                    {key === 'mode' && (
                      <>
                        <option value="floating_point">Floating-Point</option>
                        <option value="fixed_point">Fixed-Point</option>
                      </>
                    )}
                    {key === 'output_type' && (
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
                    {key === 'mode' && (
                      <>
                        <option value="P">P - Proportional</option>
                        <option value="PI">PI - Prop-Integral</option>
                        <option value="PD">PD - Prop-Deriv</option>
                        <option value="PID">PID - Full Control</option>
                      </>
                    )}
                    {key === 'method' && (
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
                    {key === 'angle_unit' && (
                      <>
                        <option value="radians">Radians</option>
                        <option value="degrees">Degrees</option>
                      </>
                    )}
                    {key === 'output_type' && (
                      <>
                        <option value="float64">Float64</option>
                        <option value="boolean">Boolean</option>
                      </>
                    )}
                    {key === 'rounding' && (
                      <>
                        <option value="floor">Floor</option>
                        <option value="ceil">Ceil</option>
                        <option value="nearest">Nearest</option>
                      </>
                    )}
                    {key === 'type' && block.type === 'WaveformGen' && (
                      <>
                        <option value="Sine">Sine Wave</option>
                        <option value="Square">Square Wave</option>
                      </>
                    )}
                  </select>
                ) : (
                  <input 
                    type="text" 
                    value={displayValue}
                    onChange={(e) => {
                      let val: any = normalizeNumerals(e.target.value);
                      if (val !== '') {
                        if (!isNaN(Number(val))) {
                          val = Number(val);
                        } else if (val.startsWith('[') || val.startsWith('{')) {
                          try { val = JSON.parse(val); } catch(err) {}
                        }
                      }
                      onUpdate(block.id, { params: { ...block.params, [key]: val } });
                    }}
                    className="w-full text-sm font-mono px-2.5 py-1.5 border border-[#333] bg-[#0a0a0a] text-white rounded focus:border-[#emerald-500] outline-none transition-all"
                  />
                )}
                {key === 'value' && block.type === 'Constant' && (
                  <p className="text-[10px] text-gray-500 mt-1">Hint: Type `[1, 2, 3]` for vectors.</p>
                )}
              </div>
            );
          })}
          
          {Object.keys(block.params).length === 0 && (
            <div className="text-xs text-gray-500 italic">No parameters available</div>
          )}
        </section>

        {/* Ports */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Input Ports</h3>
            {block.allowDynamicInputs && (
              <button onClick={handleAddInput} className="text-[#c9a86c] hover:text-[#e5c994] flex items-center gap-1 text-[10px] font-bold bg-[#c9a86c]/10 px-2 py-1 rounded transition-colors">
                <Plus size={10} /> Add
              </button>
            )}
          </div>
          <div className="space-y-2">
            {(block.inputs || []).map(port => (
              <div key={port.id} className="bg-[#0a0a0a] border border-[#222] p-2 rounded-lg space-y-1">
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]" />
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tight">
                         {port.id} <span className="text-gray-600 lowercase ml-1">({port.name})</span>
                      </span>
                   </div>
                   <span className="text-[8px] text-blue-400 font-mono bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/10 uppercase tracking-tighter">
                     {port.type}
                   </span>
                </div>
                <div className="flex items-center gap-2">
                  <input 
                    type="text" 
                    value={port.name}
                    onChange={(e) => updatePortName(port.id, e.target.value, true)}
                    className="flex-1 text-xs px-2 py-1 border border-[#333] bg-[#141414] text-white rounded focus:border-[#c9a86c] outline-none"
                    placeholder="Port Label"
                  />
                  {block.allowDynamicInputs && block.inputs.length > 2 && (
                    <button onClick={() => handleRemoveInput(port.id)} className="text-gray-500 hover:text-red-500 p-1 transition-colors">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}
            {block.inputs.length === 0 && <p className="text-xs text-gray-600 italic px-2">No inputs</p>}
          </div>

          <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mt-4">Output Ports</h3>
          <div className="space-y-2">
            {(block.outputs || []).map(port => (
              <div key={port.id} className="bg-[#0a0a0a] border border-[#222] p-2 rounded-lg space-y-1">
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tight">
                         {port.id} <span className="text-gray-600 lowercase ml-1">({port.name})</span>
                      </span>
                   </div>
                   <span className="text-[8px] text-emerald-400 font-mono bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/10 uppercase tracking-tighter">
                     {port.type}
                   </span>
                </div>
                <div className="flex items-center gap-2">
                  <input 
                    type="text" 
                    value={port.name}
                    onChange={(e) => updatePortName(port.id, e.target.value, false)}
                    className="flex-1 text-xs px-2 py-1 border border-[#333] bg-[#141414] text-white rounded focus:border-[#c9a86c] outline-none"
                    placeholder="Port Label"
                  />
                </div>
              </div>
            ))}
            {block.outputs.length === 0 && <p className="text-xs text-gray-600 italic px-2">No outputs</p>}
          </div>
        </section>

        {/* Model Analysis Report (For DOE Models) */}
        {block.type === 'DOE_MODEL' && (block as any).metrics && (
           <section className="mt-8 border-t border-white/5 pt-6 space-y-4">
              <h3 className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest flex items-center gap-2">
                 <Activity size={12} /> Model Analysis Report
              </h3>
              
              <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-4 space-y-3">
                 <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-0.5">
                       <span className="text-[8px] text-emerald-500/60 uppercase font-black">R-Squared</span>
                       <div className="text-xl font-black text-white leading-none">{(block as any).metrics.R2 ? ((block as any).metrics.R2 * 100).toFixed(2) : '0.00'}%</div>
                    </div>
                    {(block as any).metrics.R2Adj !== undefined && (
                       <div className="space-y-0.5">
                          <span className="text-[8px] text-emerald-500/60 uppercase font-black">Adj. R-Squared</span>
                          <div className="text-xl font-black text-white/70 leading-none">{((block as any).metrics.R2Adj * 100).toFixed(2)}%</div>
                       </div>
                    )}
                 </div>

                 <div className="h-px bg-emerald-500/10" />

                 <div className="space-y-1.5">
                    <span className="text-[8px] text-emerald-500/60 uppercase font-black">Regression Equation</span>
                    <div className="bg-black/40 p-2 rounded-lg border border-white/5 font-mono text-[9px] text-emerald-400 whitespace-pre-wrap break-all leading-relaxed">
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
