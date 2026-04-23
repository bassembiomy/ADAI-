// src/components/xbridges/XbridgesScopeWindow.tsx
import React from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, Download, Maximize2, Activity, BarChart2, Info, Settings2 } from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';

interface ScopeWindowProps {
  block: any;
  onClose: () => void;
}

export const XbridgesScopeWindow: React.FC<ScopeWindowProps> = ({ block, onClose }) => {
  const history = block.state?.history || [];
  const numSignals = block.params?.numSignals || 1;

  const getSignalColor = (index: number) => {
    const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#a855f7', '#ec4899', '#06b6d4', '#8b5cf6'];
    return colors[index % colors.length];
  };

  const calculateStats = (dataKey: string) => {
    if (history.length === 0) return { mean: 0, rms: 0, pk2pk: 0 };
    const values = history.map((h: any) => h[dataKey]);
    const sum = values.reduce((a: number, b: number) => a + b, 0);
    const mean = sum / values.length;
    const rms = Math.sqrt(values.reduce((a: number, b: number) => a + b * b, 0) / values.length);
    const pk2pk = Math.max(...values) - Math.min(...values);
    return { mean, rms, pk2pk };
  };

  const downloadCSV = () => {
    const headers = ['Time', ...Array.from({ length: numSignals }, (_, i) => `In${i+1}`)];
    const csvRows = [
      headers,
      ...history.map((h: any) => [
        h.t, 
        ...Array.from({ length: numSignals }, (_, i) => h[`y${i+1}`])
      ])
    ];
    
    const csvContent = csvRows.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `scope_data_${block.id}.csv`);
    link.click();
  };

  return (
    <Dialog.Root open={true} onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] h-[85vh] bg-[#141414] border border-white/10 rounded-xl shadow-2xl overflow-hidden flex flex-col z-[101] outline-none">
          {/* Header */}
          <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-black/20">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
                <Activity size={20} />
              </div>
              <div>
                <Dialog.Title className="text-lg font-black text-white uppercase tracking-wider">
                  Scope Viewer
                </Dialog.Title>
                <div className="text-[10px] font-mono text-gray-500 uppercase tracking-tighter">
                  Block ID: {block.id} • {numSignals} Channels • {history.length} Samples
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={downloadCSV}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all text-xs font-bold"
              >
                <Download size={14} />
                Export CSV
              </button>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-white/5 rounded-lg text-gray-400 hover:text-white transition-all"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <div className="flex-1 flex overflow-hidden">
            {/* Main Plot Area */}
            <div className="flex-1 p-6 flex flex-col min-w-0">
              <div className="flex-1 bg-black/40 rounded-xl border border-white/5 p-4 shadow-inner">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={history}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                    <XAxis 
                      dataKey="t" 
                      type="number" 
                      domain={['auto', 'auto']} 
                      stroke="#444" 
                      fontSize={10}
                      tickFormatter={(t) => `${t.toFixed(2)}s`}
                    />
                    <YAxis 
                      stroke="#444" 
                      fontSize={10} 
                      width={40}
                      tickFormatter={(v) => v.toFixed(1)}
                    />
                    <Tooltip 
                      contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', fontSize: '12px' }}
                      itemStyle={{ fontWeight: 'bold' }}
                      labelStyle={{ color: '#888', marginBottom: '4px' }}
                      labelFormatter={(t) => `Time: ${Number(t).toFixed(4)}s`}
                    />
                    <Legend iconType="circle" />
                    {Array.from({ length: numSignals }, (_, i) => (
                      <Line 
                        key={i}
                        name={`Channel ${i+1}`}
                        type="monotone" 
                        dataKey={`y${i+1}`} 
                        stroke={getSignalColor(i)} 
                        strokeWidth={2} 
                        dot={false} 
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Statistics Sidebar */}
            <div className="w-80 border-l border-white/5 bg-black/10 p-6 overflow-y-auto space-y-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-xs font-black text-gray-400 uppercase tracking-widest">
                  <BarChart2 size={14} className="text-[#c9a86c]" />
                  Real-time Measurements
                </div>

                <div className="space-y-3">
                  {Array.from({ length: numSignals }, (_, i) => {
                    const stats = calculateStats(`y${i+1}`);
                    const color = getSignalColor(i);
                    return (
                      <div key={i} className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-3">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                          <span className="text-xs font-bold text-white">Channel {i+1}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <div className="text-[9px] text-gray-500 uppercase font-black">Mean</div>
                            <div className="text-sm font-mono text-emerald-400">{stats.mean.toFixed(4)}</div>
                          </div>
                          <div>
                            <div className="text-[9px] text-gray-500 uppercase font-black">RMS</div>
                            <div className="text-sm font-mono text-blue-400">{stats.rms.toFixed(4)}</div>
                          </div>
                          <div className="col-span-2">
                            <div className="text-[9px] text-gray-500 uppercase font-black">Peak-to-Peak</div>
                            <div className="text-sm font-mono text-amber-400">{stats.pk2pk.toFixed(4)}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="p-4 rounded-xl bg-amber-500/5 border border-amber-500/10 flex gap-3">
                <Info size={16} className="text-amber-500 shrink-0" />
                <p className="text-[10px] text-amber-500/80 leading-relaxed italic">
                  Statistics are calculated based on the current visible buffer ({history.length} samples).
                </p>
              </div>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};
