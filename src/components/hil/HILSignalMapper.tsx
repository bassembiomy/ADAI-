import React, { useState } from 'react';
import { Plus, Trash2, ArrowLeftRight, HelpCircle } from 'lucide-react';
import { DriverChannel, HILMapping } from '../../engine/hil/hilTypes';
import { v4 as uuidv4 } from 'uuid';

interface HILSignalMapperProps {
  channels: DriverChannel[];
  mappings: HILMapping[];
  availableVariables: Array<{ id: string; name: string; type: string }>;
  onChange: (mappings: HILMapping[]) => void;
  headerAction?: React.ReactNode;
}

export const parseSafeValueForChannel = (
  rawValue: string,
  channel: DriverChannel,
): { value?: number | boolean; error: string | null } => {
  const normalized = rawValue.trim().toLowerCase();
  if (channel.dataType === 'bool') {
    if (!['true', 'false', '1', '0'].includes(normalized)) {
      return {
        error: 'Use true, false, 1, or 0 for a boolean safe value.',
      };
    }
    return { value: normalized === 'true' || normalized === '1', error: null };
  }

  if (normalized.length === 0) {
    return { error: 'Safe value must be a finite number.' };
  }
  const numericValue = Number(normalized);
  if (!Number.isFinite(numericValue)) {
    return { error: 'Safe value must be a finite number.' };
  }
  if (
    channel.dataType !== 'float'
    && channel.dataType !== 'double'
    && !Number.isInteger(numericValue)
  ) {
    return { error: `Safe value for ${channel.dataType} must be a whole number.` };
  }
  if (numericValue < channel.rangeMin || numericValue > channel.rangeMax) {
    return {
      error: `Safe value must be between ${channel.rangeMin} and ${channel.rangeMax}.`,
    };
  }
  return { value: numericValue, error: null };
};

export const HILSignalMapper: React.FC<HILSignalMapperProps> = ({
  channels,
  mappings,
  availableVariables,
  onChange,
  headerAction
}) => {
  const [selectedVar, setSelectedVar] = useState('');
  const [selectedChannel, setSelectedChannel] = useState('');
  const [direction, setDirection] = useState<'read' | 'write'>('read');
  const [conversionExpr, setConversionExpr] = useState('');
  const [safeValue, setSafeValue] = useState('0');
  const [safeValueError, setSafeValueError] = useState<string | null>(null);

  const addMapping = () => {
    if (!selectedVar || !selectedChannel) return;

    // Check if mapping already exists
    const duplicate = mappings.some(
      m => m.adiaVarId === selectedVar && m.channelId === selectedChannel
    );
    if (duplicate) return;

    let parsedSafeValue: number | boolean | undefined;
    if (direction === 'write') {
      const channel = channels.find(item => item.id === selectedChannel);
      if (!channel) return;
      const parsed = parseSafeValueForChannel(safeValue, channel);
      if (parsed.error !== null) {
        setSafeValueError(parsed.error);
        return;
      }
      parsedSafeValue = parsed.value;
    }
    setSafeValueError(null);
    const newMap: HILMapping = {
      id: uuidv4(),
      adiaVarId: selectedVar,
      channelId: selectedChannel,
      direction,
      conversionExpr: conversionExpr.trim() || undefined,
      safeValue: parsedSafeValue,
    };

    onChange([...mappings, newMap]);
    setSelectedVar('');
    setSelectedChannel('');
    setConversionExpr('');
    setSafeValue('0');
  };

  const removeMapping = (id: string) => {
    onChange(mappings.filter(m => m.id !== id));
  };

  return (
    <div className="hil-panel ui-card bg-[#121212] border border-[#222] rounded-xl p-4 flex flex-col h-full overflow-hidden">
      <div className="flex justify-between items-center mb-4 shrink-0">
        <div>
          <h2 className="text-md font-bold text-[#e0e0e0] flex items-center gap-2">
            <ArrowLeftRight size={18} className="text-[#f97316]" />
            Signal Mapping
          </h2>
          <p className="text-xs text-[#888]">Bind State Machine variables to hardware drivers</p>
        </div>
        {headerAction && <div className="flex items-center">{headerAction}</div>}
      </div>

      {/* Add Mapping Form */}
      <div className="hil-target-card ui-card bg-[#181818] border border-[#252525] rounded-lg p-3 mb-4 shrink-0 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          {/* ADIA Variable Selection */}
          <div>
            <label className="block text-[10px] text-[#888] font-medium mb-1">ADIA Variable</label>
            <select
              value={selectedVar}
              onChange={(e) => setSelectedVar(e.target.value)}
              className="ui-control ui-focus-ring w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#f97316]"
            >
              <option value="">-- Select Variable --</option>
              {availableVariables.map((v) => (
                <option key={v.id} value={v.name}>
                  {v.name} ({v.type})
                </option>
              ))}
            </select>
          </div>

          {/* Driver Channel Selection */}
          <div>
            <label className="block text-[10px] text-[#888] font-medium mb-1">Hardware Channel</label>
            <select
              value={selectedChannel}
              onChange={(e) => {
                setSelectedChannel(e.target.value);
                setSafeValueError(null);
                const ch = channels.find(c => c.id === e.target.value);
                if (ch) {
                  // Pre-align direction if channel dictates it
                  setDirection(ch.direction === 'In' ? 'read' : 'write');
                }
              }}
              className="ui-control ui-focus-ring w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#f97316]"
            >
              <option value="">-- Select Channel --</option>
              {channels.map((ch) => (
                <option key={ch.id} value={ch.id}>
                  {ch.name} (Pin {ch.pin} | {ch.peripheral})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex gap-3 items-end">
          {/* Direction toggle */}
          <div className="w-1/3">
            <label className="block text-[10px] text-[#888] font-medium mb-1">Direction</label>
            <select
              value={direction}
              onChange={(e) => {
                setDirection(e.target.value as 'read' | 'write');
                setSafeValueError(null);
              }}
              className="ui-control ui-focus-ring w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#f97316]"
            >
              <option value="read">HW &rarr; ADIA (Input)</option>
              <option value="write">ADIA &rarr; HW (Output)</option>
            </select>
          </div>

          {/* Math Conversion Expression */}
          <div className="flex-1">
            <label className="block text-[10px] text-[#888] font-medium mb-1 flex items-center gap-1">
              Math Expression (Optional)
              <span className="text-[#666] hover:text-[#999] cursor-pointer" title="Use variable 'x' for raw input. E.g. 'x * 5 / 1023'">
                <HelpCircle size={12} />
              </span>
            </label>
            <input
              type="text"
              placeholder="e.g. x * 3.3 / 4095"
              value={conversionExpr}
              onChange={(e) => setConversionExpr(e.target.value)}
              className="ui-control ui-focus-ring w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-2 py-1 text-xs text-white placeholder-gray-700 focus:outline-none focus:border-[#f97316]"
            />
          </div>

          {direction === 'write' && (
            <div className="w-24">
              <label className="block text-[10px] text-[#888] font-medium mb-1">Safe Value</label>
              <input
                type="text"
                placeholder="0 / false"
                value={safeValue}
                onChange={(e) => { setSafeValue(e.target.value); setSafeValueError(null); }}
                className="ui-control ui-focus-ring w-full bg-[#0a0a0a] border border-[#2a2a2a] rounded px-2 py-1 text-xs text-white placeholder-gray-700 focus:outline-none focus:border-[#f97316]"
              />
              {safeValueError && <p className="mt-1 text-[10px] text-red-400">{safeValueError}</p>}
            </div>
          )}

          <button
            onClick={addMapping}
            disabled={!selectedVar || !selectedChannel}
            className="ui-control ui-focus-ring px-3.5 py-1.5 bg-[#f97316] text-[#0a0a0a] text-xs font-semibold rounded hover:bg-[#ea580c] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Map Signal
          </button>
        </div>
      </div>

      {/* Mappings List */}
      <div className="flex-1 overflow-y-auto pr-1 no-scrollbar">
        {mappings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 border border-dashed border-[#333] rounded-lg text-center p-6 text-[#666]">
            <p className="text-sm">No mappings established.</p>
            <p className="text-xs mt-1">Bind state variables to pin configurations above.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {mappings.map((map) => {
              const ch = channels.find(c => c.id === map.channelId);
              return (
                <div
                  key={map.id}
                  className="hil-target-card ui-card flex items-center justify-between p-2.5 bg-[#181818] border border-[#252525] rounded hover:border-[#333] transition-colors duration-150 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-semibold text-white">{map.adiaVarId}</span>
                    <span className="text-[#888] font-mono">
                      {map.direction === 'read' ? '← (Input) ←' : '→ (Output) →'}
                    </span>
                    <span className="text-[#f97316] font-medium">
                      {ch ? `${ch.name} (Pin ${ch.pin})` : 'Missing Channel'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {map.conversionExpr && (
                      <span className="bg-[#242424] text-[#aaa] font-mono text-[10px] px-2 py-0.5 rounded border border-[#333]">
                        {map.conversionExpr}
                      </span>
                    )}
                    {map.direction === 'write' && map.safeValue !== undefined && (
                      <span className="bg-[#242424] text-[#aaa] font-mono text-[10px] px-2 py-0.5 rounded border border-[#333]">
                        safe: {String(map.safeValue)}
                      </span>
                    )}
                    <button
                      onClick={() => removeMapping(map.id)}
                      className="ui-control ui-focus-ring text-[#666] hover:text-red-400 p-1 rounded transition-colors"
                      title="Delete Mapping"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
