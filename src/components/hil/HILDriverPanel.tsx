import React from 'react';
import { Plus, Trash2, ShieldAlert } from 'lucide-react';
import { DriverChannel, PeripheralType } from '../../engine/hil/hilTypes';
import { v4 as uuidv4 } from 'uuid';

interface HILDriverPanelProps {
  channels: DriverChannel[];
  onChange: (channels: DriverChannel[]) => void;
}

const PERIPHERALS: PeripheralType[] = ['GPIO', 'ADC', 'DAC', 'PWM', 'UART', 'SPI', 'I2C', 'CAN', 'Timer'];
const DATA_TYPES = ['bool', 'uint8_t', 'int8_t', 'uint16_t', 'int16_t', 'uint32_t', 'int32_t', 'float', 'double'] as const;

export const HILDriverPanel: React.FC<HILDriverPanelProps> = ({ channels, onChange }) => {
  const addChannel = () => {
    const newCh: DriverChannel = {
      id: uuidv4(),
      name: `ch_${channels.length + 1}`,
      peripheral: 'GPIO',
      pin: 'PA0',
      direction: 'In',
      dataType: 'bool',
      rangeMin: 0,
      rangeMax: 1,
      scalingFactor: 1,
      unit: ''
    };
    onChange([...channels, newCh]);
  };

  const removeChannel = (id: string) => {
    onChange(channels.filter(c => c.id !== id));
  };

  const updateChannel = (id: string, updates: Partial<DriverChannel>) => {
    onChange(channels.map(c => (c.id === id ? { ...c, ...updates } : c)));
  };

  // Find pin conflicts
  const pinCounts = channels.reduce((acc, c) => {
    if (c.pin) acc[c.pin] = (acc[c.pin] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="bg-[#121212] border border-[#222] rounded-xl p-4 flex flex-col h-full overflow-hidden">
      <div className="flex justify-between items-center mb-4 shrink-0">
        <div>
          <h2 className="text-md font-bold text-[#e0e0e0] flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#f97316] animate-pulse"></span>
            Hardware Peripherals & Pins
          </h2>
          <p className="text-xs text-[#888]">Define low-level MCU driver channels</p>
        </div>
        <button
          onClick={addChannel}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f97316] text-[#0a0a0a] text-xs font-semibold rounded hover:bg-[#ea580c] transition-colors"
        >
          <Plus size={14} /> Add Channel
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 no-scrollbar">
        {channels.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 border border-dashed border-[#333] rounded-lg text-center p-6 text-[#666]">
            <p className="text-sm">No driver channels defined yet.</p>
            <p className="text-xs mt-1">Click "Add Channel" to create pin assignments.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {channels.map((ch) => {
              const hasConflict = pinCounts[ch.pin] > 1;
              return (
                <div
                  key={ch.id}
                  className={`relative p-3.5 bg-[#181818] border rounded-lg transition-colors duration-200 ${
                    hasConflict ? 'border-red-900/60 bg-red-950/10' : 'border-[#282828] hover:border-[#333]'
                  }`}
                >
                  {hasConflict && (
                    <div className="absolute top-2 right-2 text-red-500 flex items-center gap-1 text-[10px]" title="Pin Conflict Detected">
                      <ShieldAlert size={14} />
                      <span>Conflict</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-3 mb-2.5">
                    {/* Name */}
                    <div>
                      <label className="block text-[10px] text-[#888] font-medium mb-1">Channel Name</label>
                      <input
                        type="text"
                        value={ch.name}
                        onChange={(e) => updateChannel(ch.id, { name: e.target.value.trim().replace(/[^a-zA-Z0-9_]/g, '') })}
                        className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#f97316]"
                      />
                    </div>

                    {/* Pin */}
                    <div>
                      <label className="block text-[10px] text-[#888] font-medium mb-1">Pin Assignment</label>
                      <input
                        type="text"
                        value={ch.pin}
                        placeholder="e.g. PA5"
                        onChange={(e) => updateChannel(ch.id, { pin: e.target.value.trim() })}
                        className={`w-full bg-[#0a0a0a] border rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#f97316] ${
                          hasConflict ? 'border-red-800' : 'border-[#2a2a2a]'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mb-2.5">
                    {/* Peripheral */}
                    <div>
                      <label className="block text-[10px] text-[#888] font-medium mb-1">Peripheral</label>
                      <select
                        value={ch.peripheral}
                        onChange={(e) => {
                          const val = e.target.value as PeripheralType;
                          let direction = ch.direction;
                          let dataType = ch.dataType;
                          if (val === 'ADC') {
                            direction = 'In';
                            dataType = 'uint16_t';
                          } else if (val === 'DAC' || val === 'PWM') {
                            direction = 'Out';
                            dataType = 'uint8_t';
                          }
                          updateChannel(ch.id, { peripheral: val, direction, dataType });
                        }}
                        className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-1.5 py-1 text-xs text-white focus:outline-none focus:border-[#f97316]"
                      >
                        {PERIPHERALS.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>

                    {/* Direction */}
                    <div>
                      <label className="block text-[10px] text-[#888] font-medium mb-1">Direction</label>
                      <select
                        value={ch.direction}
                        disabled={ch.peripheral === 'ADC' || ch.peripheral === 'DAC' || ch.peripheral === 'PWM'}
                        onChange={(e) => updateChannel(ch.id, { direction: e.target.value as 'In' | 'Out' })}
                        className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-1.5 py-1 text-xs text-white focus:outline-none focus:border-[#f97316] disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <option value="In">Input</option>
                        <option value="Out">Output</option>
                      </select>
                    </div>

                    {/* Data Type */}
                    <div>
                      <label className="block text-[10px] text-[#888] font-medium mb-1">C Data Type</label>
                      <select
                        value={ch.dataType}
                        onChange={(e) => updateChannel(ch.id, { dataType: e.target.value as any })}
                        className="w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-1.5 py-1 text-xs text-white focus:outline-none focus:border-[#f97316]"
                      >
                        {DATA_TYPES.map((dt) => (
                          <option key={dt} value={dt}>{dt}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Math scaling configurations */}
                  <div className="grid grid-cols-4 gap-2 border-t border-[#222]/80 pt-2">
                    <div>
                      <label className="block text-[9px] text-[#666] mb-0.5">Min Range</label>
                      <input
                        type="number"
                        value={ch.rangeMin}
                        onChange={(e) => updateChannel(ch.id, { rangeMin: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1 py-0.5 text-xs text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-[#666] mb-0.5">Max Range</label>
                      <input
                        type="number"
                        value={ch.rangeMax}
                        onChange={(e) => updateChannel(ch.id, { rangeMax: parseFloat(e.target.value) || 0 })}
                        className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1 py-0.5 text-xs text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-[#666] mb-0.5">Scale Coeff</label>
                      <input
                        type="number"
                        step="any"
                        value={ch.scalingFactor}
                        onChange={(e) => updateChannel(ch.id, { scalingFactor: parseFloat(e.target.value) || 1 })}
                        className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1 py-0.5 text-xs text-white focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] text-[#666] mb-0.5">Unit</label>
                      <input
                        type="text"
                        placeholder="e.g. V, Hz"
                        value={ch.unit}
                        onChange={(e) => updateChannel(ch.id, { unit: e.target.value })}
                        className="w-full bg-[#0a0a0a] border border-[#222] rounded px-1 py-0.5 text-xs text-white focus:outline-none"
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => removeChannel(ch.id)}
                    className="absolute bottom-2.5 right-2 px-1.5 py-1 text-red-500 hover:text-red-400 hover:bg-red-950/20 rounded transition-colors"
                    title="Delete Channel"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
