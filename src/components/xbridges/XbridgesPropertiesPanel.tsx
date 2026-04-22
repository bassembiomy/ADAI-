// src/components/xbridges/XbridgesPropertiesPanel.tsx
import React, { useState, useEffect } from 'react';
import { XBlock, XPort } from '../../engine/xbridges/types';
import { X, Plus, Trash2, Settings2, Hash } from 'lucide-react';

interface Props {
  block: XBlock | null;
  availableVariables?: any[];
  onUpdate: (blockId: string, data: Partial<XBlock>) => void;
  onClose: () => void;
}

const normalizeNumerals = (val: string) => {
  if (!val) return "";
  return val.replace(/[٠١٢٣٤٥٦٧٨٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d).toString())
            .replace(/[۰۱۲۳۴۵۶۷۸۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d).toString())
            .replace(/[٫،,]/g, '.');
};

export const XbridgesPropertiesPanel: React.FC<Props> = ({ block, availableVariables, onUpdate, onClose }) => {
  if (!block) return null;

  const [localLabel, setLocalLabel] = useState(block.label || block.type);
  const [localParams, setLocalParams] = useState(JSON.stringify(block.params, null, 2));

  // Sync when block changes
  useEffect(() => {
    setLocalLabel(block.label || block.type);
    setLocalParams(JSON.stringify(block.params, null, 2));
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

  return (
    <div className="w-80 bg-[#141414] border-l border-[#222] flex flex-col h-full shadow-2xl z-50 text-gray-300">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-[#222] bg-[#1a1a1a]">
        <div className="flex items-center gap-2 text-[#c9a86c] font-bold">
          <Settings2 size={16} />
          Properties
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
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
                
                {key === 'type' && block.type === 'WaveformGen' ? (
                  <select
                    value={displayValue as string}
                    onChange={(e) => onUpdate(block.id, { params: { ...block.params, [key]: e.target.value } })}
                    className="w-full text-sm px-2.5 py-1.5 border border-[#333] bg-[#0a0a0a] text-white rounded focus:border-[#emerald-500] outline-none transition-all"
                  >
                    <option value="Sine">Sine Wave</option>
                    <option value="Square">Square Wave</option>
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
            {block.inputs.map(port => (
              <div key={port.id} className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                <input 
                  type="text" 
                  value={port.name}
                  onChange={(e) => updatePortName(port.id, e.target.value, true)}
                  className="flex-1 text-xs px-2 py-1 border border-[#333] bg-[#0a0a0a] text-white rounded focus:border-[#c9a86c] outline-none"
                />
                {block.allowDynamicInputs && block.inputs.length > 2 && (
                  <button onClick={() => handleRemoveInput(port.id)} className="text-gray-500 hover:text-red-500 p-1 transition-colors">
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            ))}
            {block.inputs.length === 0 && <p className="text-xs text-gray-600 italic">No inputs</p>}
          </div>

          <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mt-4">Output Ports</h3>
          <div className="space-y-2">
            {block.outputs.map(port => (
              <div key={port.id} className="flex items-center gap-2">
                <input 
                  type="text" 
                  value={port.name}
                  onChange={(e) => updatePortName(port.id, e.target.value, false)}
                  className="flex-1 text-xs px-2 py-1 border border-[#333] bg-[#0a0a0a] text-white rounded focus:border-[#c9a86c] outline-none"
                />
                <div className="w-1.5 h-1.5 rounded-full bg-gray-500" />
              </div>
            ))}
            {block.outputs.length === 0 && <p className="text-xs text-gray-600 italic">No outputs</p>}
          </div>
        </section>
      </div>
    </div>
  );
};
