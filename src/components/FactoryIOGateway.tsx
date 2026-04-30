import React, { useState, useEffect } from 'react';
import { X, RefreshCw, Link2, Unlink, Wifi, WifiOff, Settings } from 'lucide-react';

interface FactoryTag {
  id: number;
  name: string;
  type: number; // 0 for Bool, 1 for Int, 2 for Float
  value: any;
}

interface Mapping {
  adiaVarId: string;
  factoryTagId: number;
  type: 'sensor' | 'actuator';
}

interface FactoryIOGatewayProps {
  isOpen: boolean;
  onClose: () => void;
  variables: any[];
  mapping: Mapping[];
  setMapping: (m: Mapping[]) => void;
  isEnabled: boolean;
  setIsEnabled: (e: boolean) => void;
  status: 'connected' | 'disconnected' | 'error';
}

export const FactoryIOGateway: React.FC<FactoryIOGatewayProps> = ({
  isOpen, onClose, variables, mapping, setMapping, isEnabled, setIsEnabled, status
}) => {
  const [availableTags, setAvailableTags] = useState<FactoryTag[]>([]);
  const [isFetching, setIsFetching] = useState(false);

  const fetchTags = async () => {
    setIsFetching(true);
    try {
      const { ipcRenderer } = (window as any).require('electron');
      const tags = await ipcRenderer.invoke('fetch-factory-io-tags');
      if (tags && !tags.error) {
        setAvailableTags(tags);
      }
    } catch (e) {
      console.error('Failed to fetch tags', e);
    } finally {
      setIsFetching(false);
    }
  };

  useEffect(() => {
    if (isOpen) fetchTags();
  }, [isOpen]);

  if (!isOpen) return null;

  const addMapping = (adiaVarId: string, factoryTagId: number, type: 'sensor' | 'actuator') => {
    setMapping([...mapping, { adiaVarId, factoryTagId, type }]);
  };

  const removeMapping = (index: number) => {
    setMapping(mapping.filter((_, i) => i !== index));
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] animate-in fade-in duration-200">
      <div className="bg-[#111111] border border-[#333] rounded-2xl w-[800px] max-h-[85vh] flex flex-col shadow-2xl overflow-hidden shadow-indigo-500/10">
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-[#222] bg-gradient-to-r from-indigo-950/20 to-transparent">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isEnabled ? 'bg-indigo-500/20 text-indigo-400' : 'bg-gray-800 text-gray-500'}`}>
              <Wifi size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">Factory I/O Gateway</h2>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-500' : status === 'error' ? 'bg-red-500' : 'bg-gray-500'}`} />
                <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">
                  {status === 'connected' ? 'Live Link Active' : 'Offline'}
                </span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-[#222] rounded-full text-gray-400 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Connection Control */}
          <div className="flex items-center justify-between p-4 bg-[#1a1a1a] border border-[#333] rounded-xl">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-white">Enable Real-Time Synchronization</h3>
              <p className="text-xs text-gray-500 font-medium">Link ADIA variables to Factory I/O tags over the Web API.</p>
            </div>
            <button
              onClick={() => setIsEnabled(!isEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${isEnabled ? 'bg-indigo-600' : 'bg-gray-700'}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
            </button>
          </div>

          {/* Current Mappings */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Active I/O Mappings</h3>
              <button 
                onClick={fetchTags}
                disabled={isFetching}
                className="flex items-center gap-1.5 text-[11px] text-indigo-400 hover:text-indigo-300 font-bold uppercase"
              >
                <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
                Refresh Tags
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2">
              {mapping.length === 0 ? (
                <div className="py-12 border-2 border-dashed border-[#222] rounded-xl flex flex-col items-center justify-center text-gray-600">
                  <Link2 size={32} className="mb-2 opacity-20" />
                  <p className="text-xs font-medium">No variables mapped yet.</p>
                </div>
              ) : (
                mapping.map((m, i) => {
                  const adiaVar = variables.find(v => v.id === m.adiaVarId);
                  const factoryTag = availableTags.find(t => t.id === m.factoryTagId);
                  return (
                    <div key={i} className="flex items-center gap-3 p-3 bg-[#161616] border border-[#222] rounded-lg group">
                      <div className="flex-1">
                        <div className="text-[10px] text-gray-500 font-bold uppercase mb-1">ADIA Variable</div>
                        <div className="text-sm text-indigo-300 font-mono">{adiaVar?.name || 'Unknown'}</div>
                      </div>
                      <div className="flex flex-col items-center px-4">
                        <div className={`px-2 py-0.5 rounded text-[9px] font-black uppercase mb-1 ${m.type === 'sensor' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                          {m.type === 'sensor' ? '← Read' : 'Write →'}
                        </div>
                        <Settings size={14} className="text-gray-700" />
                      </div>
                      <div className="flex-1 text-right">
                        <div className="text-[10px] text-gray-500 font-bold uppercase mb-1">Factory I/O Tag</div>
                        <div className="text-sm text-white font-medium">{factoryTag?.name || `Tag ID: ${m.factoryTagId}`}</div>
                      </div>
                      <button 
                        onClick={() => removeMapping(i)}
                        className="p-2 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* New Mapping Form */}
          <div className="p-5 bg-indigo-500/5 border border-indigo-500/10 rounded-xl space-y-4">
            <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Create New Link</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase px-1">Source Variable</label>
                <select className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50" id="adia-var">
                  {variables.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase px-1">Target Tag</label>
                <select className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50" id="factory-tag">
                  {availableTags.map(t => <option key={t.id} value={t.id}>{t.name} (ID: {t.id})</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase px-1">Direction</label>
                <select className="w-full bg-[#0a0a0a] border border-[#333] rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-indigo-500/50" id="link-type">
                  <option value="sensor">Sensor (ADIA ← Factory I/O)</option>
                  <option value="actuator">Actuator (ADIA → Factory I/O)</option>
                </select>
              </div>
            </div>
            <button 
              onClick={() => {
                const varId = (document.getElementById('adia-var') as HTMLSelectElement).value;
                const tagId = parseInt((document.getElementById('factory-tag') as HTMLSelectElement).value);
                const type = (document.getElementById('link-type') as HTMLSelectElement).value as 'sensor' | 'actuator';
                if (varId && tagId) addMapping(varId, tagId, type);
              }}
              className="w-full h-11 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-sm rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20"
            >
              <Link2 size={16} />
              Establish Data Link
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="h-14 bg-[#0a0a0a] border-t border-[#222] flex items-center justify-end px-6">
          <button 
            onClick={onClose}
            className="px-6 h-9 bg-[#222] hover:bg-[#333] text-white text-xs font-bold rounded-lg transition-colors"
          >
            Close Settings
          </button>
        </div>
      </div>
    </div>
  );
};
