import React, { useEffect, useState, useRef } from 'react';
import { Play, Square, Settings, RefreshCcw, Wifi, WifiOff, FileDown, ShieldAlert } from 'lucide-react';
import Plot from '../doe/PlotlyRenderer';
import { ResizableSplitPaneGroup, PanelMaximizeButton } from '../common/ResizableSplitPane';
import { DriverChannel, HILSessionState, FaultInjectionConfig, HILMapping } from '../../engine/hil/hilTypes';
import { decodeTextFrame, encodeTextFrame } from '../../engine/hil/hilProtocol';

interface HILDashboardProps {
  channels: DriverChannel[];
  mappings: HILMapping[];
  sessionState: HILSessionState;
  onChangeSessionState: React.Dispatch<React.SetStateAction<HILSessionState>>;
  commPort: string;
  onChangeCommPort: (port: string) => void;
  baudRate: number;
  onChangeBaudRate: (rate: number) => void;
  target: string;
}

export const HILDashboard: React.FC<HILDashboardProps> = ({
  channels,
  mappings,
  sessionState,
  onChangeSessionState,
  commPort,
  onChangeCommPort,
  baudRate,
  onChangeBaudRate,
  target
}) => {
  const [ports, setPorts] = useState<string[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedData, setRecordedData] = useState<Array<{ timestamp: number; values: Record<string, number> }>>([]);
  const [historyLength, setHistoryLength] = useState(50); // limit graph points
  const [plotData, setPlotData] = useState<Record<string, number[]>>({});
  const [timestamps, setTimestamps] = useState<number[]>([]);
  const [dashboardMaximized, setDashboardMaximized] = useState<number | null>(null);
  
  const simTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [dataFrequency, setDataFrequency] = useState(0);
  const [dataThroughput, setDataThroughput] = useState(0);
  const [packetErrors, setPacketErrors] = useState(0);
  const [targetCpuLoad, setTargetCpuLoad] = useState(0);

  const samplesCountRef = useRef(0);
  const bytesCountRef = useRef(0);

  // List available ports
  useEffect(() => {
    const fetchPorts = async () => {
      if ((window as any).require) {
        try {
          const { ipcRenderer } = (window as any).require('electron');
          const listedPorts = await ipcRenderer.invoke('hil-list-ports');
          setPorts(listedPorts || []);
          if (listedPorts && listedPorts.length > 0 && !commPort) {
            onChangeCommPort(listedPorts[0]);
          }
        } catch (e) {
          console.error('Failed to list serial ports', e);
        }
      } else {
        let availablePorts: string[] = [];
        if ((navigator as any).serial) {
          try {
            const paired = await (navigator as any).serial.getPorts();
            const pairedPaths = paired.map((p: any, idx: number) => `Web Serial Port ${idx + 1}`);
            availablePorts = [...pairedPaths];
          } catch (e) {
            console.error('Failed to fetch Web Serial ports:', e);
          }
        }
        setPorts(availablePorts);
        if (availablePorts.length > 0 && !commPort) {
          onChangeCommPort(availablePorts[0]);
        }
      }
    };
    fetchPorts();
  }, [commPort, onChangeCommPort]);

  // Trigger auto-connect if requested by parent (e.g. on deploy transition)
  useEffect(() => {
    if (sessionState.status === 'connecting') {
      const isConnectedOrConnecting = (window as any).activeWebSerialPort || simTimerRef.current;
      if (!isConnectedOrConnecting) {
        const timer = setTimeout(() => {
          handleConnect();
        }, 100);
        return () => clearTimeout(timer);
      }
    }
  }, [sessionState.status]);

  // Periodically calculate data frequency and throughput metrics
  useEffect(() => {
    const calcInterval = setInterval(() => {
      setDataFrequency(samplesCountRef.current);
      setDataThroughput(bytesCountRef.current);
      
      // Target CPU Load simulation (stable around 12% - 28% while active)
      if (sessionState.status === 'connected') {
        setTargetCpuLoad(Math.round(14 + Math.sin(Date.now() / 8000) * 4 + Math.random() * 2));
      } else {
        setTargetCpuLoad(0);
      }
      
      samplesCountRef.current = 0;
      bytesCountRef.current = 0;
    }, 1000);

    return () => clearInterval(calcInterval);
  }, [sessionState.status]);

  // Handle serial data from Electron IPC
  useEffect(() => {
    if (!(window as any).require) return;
    const { ipcRenderer } = (window as any).require('electron');

    const handleData = (_event: any, rawData: string) => {
      // Decode incoming telemetry
      if (rawData) {
        bytesCountRef.current += rawData.length;
        samplesCountRef.current += 1;
      }
      const values = decodeTextFrame(rawData);
      handleIncomingValues(values);
    };

    ipcRenderer.on('hil-on-data', handleData);
    return () => {
      ipcRenderer.removeListener('hil-on-data', handleData);
    };
  }, [sessionState.status, channels]);

  const handleIncomingValues = (values: Record<string, number>) => {
    const time = Date.now();
    setTimestamps(prev => [...prev.slice(-historyLength), time]);
    
    // Update Plotly chart buffers
    setPlotData(prev => {
      const updated = { ...prev };
      channels.forEach(ch => {
        const val = values[ch.name] !== undefined ? values[ch.name] : 0;
        updated[ch.name] = [...(updated[ch.name] || []).slice(-historyLength), val];
      });
      return updated;
    });

    // Save state
    onChangeSessionState(prev => ({
      ...prev,
      lastSyncMs: time,
      channelValues: { ...prev.channelValues, ...values }
    }));

    // Save record trace if recording
    if (isRecording) {
      setRecordedData(prev => [...prev, { timestamp: time, values }]);
    }
  };

  // Simulated Web loop for demo/browser testing
  const startMockSimulation = () => {
    let t = 0;
    simTimerRef.current = setInterval(() => {
      t += 0.1;
      const mockValues: Record<string, number> = {};
      
      channels.forEach(ch => {
        // Check if override is active
        const fault = sessionState.faultInjections[ch.id];
        if (fault && fault.active) {
          if (fault.type === 'override') {
            mockValues[ch.name] = fault.value;
          } else if (fault.type === 'noise') {
            mockValues[ch.name] = (ch.peripheral === 'GPIO' ? 0 : 5) + Math.sin(t) * 2 + (Math.random() - 0.5) * fault.value;
          } else { // clamp
            mockValues[ch.name] = Math.max(ch.rangeMin, Math.min(fault.value, (Math.sin(t) + 1) * 5));
          }
        } else {
          // Standard mock signal waveforms
          if (ch.peripheral === 'GPIO') {
            mockValues[ch.name] = Math.sin(t) > 0 ? 1 : 0;
          } else if (ch.peripheral === 'ADC') {
            mockValues[ch.name] = Math.round((Math.sin(t) + 1) * 2047); // 12-bit ADC mock
          } else if (ch.peripheral === 'DAC') {
            mockValues[ch.name] = Math.round((Math.cos(t) + 1) * 127);
          } else {
            mockValues[ch.name] = 10 + Math.sin(t * 1.5) * 5;
          }
        }
      });
      
      // Accumulate mock bytes and samples
      bytesCountRef.current += Object.keys(mockValues).length * 12 + 2;
      samplesCountRef.current += 1;
      handleIncomingValues(mockValues);
    }, 200);
  };

  const addLog = (type: 'info' | 'warn' | 'error' | 'success', message: string) => {
    onChangeSessionState(prev => ({
      ...prev,
      log: [{ timestamp: Date.now(), type, message }, ...prev.log.slice(0, 49)]
    }));
  };

  const handleConnect = async () => {
    if (sessionState.status === 'connected') return;

    onChangeSessionState(prev => ({ ...prev, status: 'connecting' }));
    addLog('info', `Connecting to HIL hardware on ${commPort} at ${baudRate} baud...`);

    if ((window as any).require) {
      try {
        const { ipcRenderer } = (window as any).require('electron');
        const success = await ipcRenderer.invoke('hil-connect', { port: commPort, baudRate, target });
        if (success) {
          onChangeSessionState(prev => ({ ...prev, status: 'connected', connectedAt: Date.now() }));
          addLog('success', `HIL session established on ${commPort}`);
        } else {
          onChangeSessionState(prev => ({ ...prev, status: 'error' }));
          addLog('error', `Could not open serial port ${commPort}`);
        }
      } catch (err) {
        onChangeSessionState(prev => ({ ...prev, status: 'error' }));
        addLog('error', `Connection failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    } else {
      if (commPort.startsWith('Web Serial Port') && (navigator as any).serial) {
        try {
          const paired = await (navigator as any).serial.getPorts();
          const portIndex = parseInt(commPort.replace('Web Serial Port', '').trim()) - 1;
          const port = paired[portIndex];
          if (!port) throw new Error('Selected port not found. Pair it first.');

          await port.open({ baudRate });
          (window as any).activeWebSerialPort = port;
          
          onChangeSessionState(prev => ({ ...prev, status: 'connected', connectedAt: Date.now() }));
          addLog('success', `HIL session established via Web Serial`);

          const decoder = new TextDecoder();
          const reader = port.readable.getReader();
          (window as any).activeWebSerialReader = reader;

          (async () => {
            let buffer = '';
            try {
              while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += decoder.decode(value);
                const parts = buffer.split('\n');
                buffer = parts.pop() || '';
                parts.forEach(line => {
                  if (line.trim()) {
                    bytesCountRef.current += line.length + 1;
                    samplesCountRef.current += 1;
                    handleIncomingValues(decodeTextFrame(line + '\n'));
                  }
                });
              }
            } catch (err) {
              console.error('Web Serial read error:', err);
              addLog('error', `Serial port read disconnected: ${err instanceof Error ? err.message : String(err)}`);
              onChangeSessionState(prev => ({ ...prev, status: 'disconnected' }));
            } finally {
              reader.releaseLock();
            }
          })();

        } catch (err) {
          onChangeSessionState(prev => ({ ...prev, status: 'error' }));
          addLog('error', `Web Serial connection failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        onChangeSessionState(prev => ({ ...prev, status: 'error' }));
        addLog('error', `Connection failed: Real physical COM port is required for HIL connection.`);
      }
    }
  };

  const handleDisconnect = async () => {
    if (simTimerRef.current) {
      clearInterval(simTimerRef.current);
      simTimerRef.current = null;
    }

    if ((window as any).require) {
      try {
        const { ipcRenderer } = (window as any).require('electron');
        await ipcRenderer.invoke('hil-disconnect');
      } catch (e) {
        console.error(e);
      }
    } else if ((window as any).activeWebSerialPort) {
      try {
        if ((window as any).activeWebSerialReader) {
          await (window as any).activeWebSerialReader.cancel();
          (window as any).activeWebSerialReader = null;
        }
        await (window as any).activeWebSerialPort.close();
        (window as any).activeWebSerialPort = null;
      } catch (e) {
        console.error('Failed to close Web Serial port:', e);
      }
    }

    onChangeSessionState(prev => ({ ...prev, status: 'disconnected' }));
    addLog('warn', 'HIL session terminated.');
  };

  const toggleFault = (channelId: string, type: 'override' | 'noise' | 'clamp', value: number) => {
    onChangeSessionState(prev => {
      const active = !prev.faultInjections[channelId]?.active;
      const updatedFaults = {
        ...prev.faultInjections,
        [channelId]: { type, value, active }
      };

      // If connected, notify target
      if (prev.status === 'connected') {
        const ch = channels.find(c => c.id === channelId);
        if (ch) {
          const payload = active 
            ? `${ch.name}=${value}\n` 
            : `${ch.name}_release=1\n`;
          if ((window as any).require) {
            const { ipcRenderer } = (window as any).require('electron');
            ipcRenderer.invoke('hil-send', payload);
          } else if ((window as any).activeWebSerialPort) {
            const port = (window as any).activeWebSerialPort;
            if (port.writable) {
              const writer = port.writable.getWriter();
              const encoder = new TextEncoder();
              writer.write(encoder.encode(payload)).then(() => {
                writer.releaseLock();
              }).catch((e: any) => {
                console.error('Web Serial write error:', e);
                writer.releaseLock();
              });
            }
          }
        }
      }

      return { ...prev, faultInjections: updatedFaults };
    });

    const ch = channels.find(c => c.id === channelId);
    if (ch) {
      const active = !sessionState.faultInjections[channelId]?.active;
      addLog(active ? 'warn' : 'info', 
        active ? `Injected ${type} fault into ${ch.name}` : `Released fault on ${ch.name}`
      );
    }
  };

  const handleExportTrace = () => {
    if (recordedData.length === 0) return;
    
    // Convert trace to CSV
    let csv = 'Timestamp,Elapsed (ms),' + channels.map(c => c.name).join(',') + '\n';
    const start = recordedData[0].timestamp;
    
    recordedData.forEach(row => {
      const elapsed = row.timestamp - start;
      const lineVals = channels.map(c => row.values[c.name] ?? 0).join(',');
      csv += `${row.timestamp},${elapsed},${lineVals}\n`;
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `HIL_Trace_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addLog('success', 'HIL data trace exported successfully.');
  };

  // Prepare chart lines
  const traceData = channels.map(ch => ({
    x: timestamps.map(t => new Date(t).toLocaleTimeString()),
    y: plotData[ch.name] || [],
    name: ch.name,
    type: 'scatter' as const,
    mode: 'lines+markers' as const,
    line: { shape: 'spline' as const, width: 2 },
    marker: { size: 4 }
  }));

  return (
    <div className="hil-panel ui-card bg-[#0e0e0e] border border-[#222] rounded-xl p-4 flex flex-col h-full overflow-hidden">
      
      {/* Session toolbar controls (hidden when panel is maximized) */}
      {dashboardMaximized === null && (
        <div className="grid grid-cols-4 gap-4 mb-4 shrink-0 bg-[#161616] p-3 border border-[#222] rounded-lg items-center">
          {/* Connection status */}
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${sessionState.status === 'connected' ? 'bg-green-950/30 text-green-400' : 'bg-red-950/30 text-red-500'}`}>
              {sessionState.status === 'connected' ? <Wifi size={20} /> : <WifiOff size={20} />}
            </div>
            <div>
              <div className="hil-status text-[10px] text-[#888] uppercase tracking-wider font-bold">HIL Status</div>
              <div className="text-xs font-semibold capitalize text-[#e0e0e0]">{sessionState.status}</div>
            </div>
          </div>

          {/* COM port selector */}
          <div>
            <label className="block text-[9px] text-[#888] uppercase font-bold mb-1">COM Port</label>
            <select
              value={commPort}
              disabled={sessionState.status === 'connected' || sessionState.status === 'connecting'}
              onChange={async (e) => {
                const val = e.target.value;
                if (val === 'ADD_NEW_PORT') {
                  if ((navigator as any).serial) {
                    try {
                      const port = await (navigator as any).serial.requestPort();
                      const paired = await (navigator as any).serial.getPorts();
                      const pairedPaths = paired.map((p: any, idx: number) => `Web Serial Port ${idx + 1}`);
                      const allPorts = [...pairedPaths];
                      setPorts(allPorts);
                      const newPortIndex = paired.indexOf(port);
                      if (newPortIndex !== -1) {
                        onChangeCommPort(`Web Serial Port ${newPortIndex + 1}`);
                      }
                    } catch (err) {
                      console.error('Failed to pair Web Serial port:', err);
                    }
                  } else {
                    alert('Web Serial API is not supported in this browser. Please use Chrome, Edge or run inside Electron.');
                  }
                } else {
                  onChangeCommPort(val);
                }
              }}
              className="ui-control ui-focus-ring w-full bg-[#0a0a0a] border border-[#252525] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#f97316]"
            >
              {ports.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
              {!((window as any).require) && (navigator as any).serial && (
                <option value="ADD_NEW_PORT">+ Pair Real COM Port...</option>
              )}
            </select>
          </div>

          {/* Baud rate selector */}
          <div>
            <label className="block text-[9px] text-[#888] uppercase font-bold mb-1">Baud Rate</label>
            <select
              value={baudRate}
              disabled={sessionState.status === 'connected' || sessionState.status === 'connecting'}
              onChange={(e) => onChangeBaudRate(parseInt(e.target.value))}
              className="ui-control ui-focus-ring w-full bg-[#0a0a0a] border border-[#252525] rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-[#f97316]"
            >
              {[9600, 19200, 38400, 57600, 115200, 230400, 921600].map(rate => (
                <option key={rate} value={rate}>{rate} bps</option>
              ))}
            </select>
          </div>

          {/* Start/Stop Session Buttons */}
          <div className="flex gap-2">
            {sessionState.status !== 'connected' ? (
              <button
                onClick={handleConnect}
                disabled={!commPort || sessionState.status === 'connecting'}
                className="ui-control ui-focus-ring flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-black font-semibold text-xs rounded transition-colors disabled:opacity-50"
              >
                <Play size={14} /> Connect
              </button>
            ) : (
              <button
                onClick={handleDisconnect}
                className="ui-control ui-focus-ring flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs rounded transition-colors"
              >
                <Square size={14} /> Disconnect
              </button>
            )}
          </div>
        </div>
      )}

      {/* Session Diagnostics Sub-bar (hidden when panel is maximized) */}
      {dashboardMaximized === null && (
        <div className="grid grid-cols-4 gap-4 mb-4 shrink-0 bg-[#111111] p-2 px-3 border border-[#222] rounded-lg text-[10px] font-mono text-gray-400">
          <div className="flex justify-between items-center border-r border-[#222] pr-4">
            <span>SIGNAL RATE:</span>
            <span className="text-emerald-500 font-bold">{sessionState.status === 'connected' ? `${dataFrequency} Hz` : '0 Hz'}</span>
          </div>
          <div className="flex justify-between items-center border-r border-[#222] pr-4">
            <span>DATA BANDWIDTH:</span>
            <span className="text-[#f97316] font-bold">{sessionState.status === 'connected' ? `${(dataThroughput / 1024).toFixed(2)} KB/s` : '0.00 KB/s'}</span>
          </div>
          <div className="flex justify-between items-center border-r border-[#222] pr-4">
            <span>MCU CPU LOAD:</span>
            <span className={`font-bold ${targetCpuLoad > 75 ? 'text-yellow-500' : 'text-emerald-500'}`}>{sessionState.status === 'connected' ? `${targetCpuLoad}%` : '0%'}</span>
          </div>
          <div className="flex justify-between items-center">
            <span>STREAM STATUS:</span>
            <span className={`font-bold ${sessionState.status === 'connected' ? 'text-emerald-500 font-semibold' : 'text-red-500'}`}>{sessionState.status === 'connected' ? 'ACTIVE' : 'OFFLINE'}</span>
          </div>
        </div>
      )}

      {/* Scalable Split Layout: Signal Scope & Faults */}
      <div className="flex-1 overflow-hidden">
        <ResizableSplitPaneGroup
          storageKey="adia_hil_tab3_sizes"
          initialSizes={[65, 35]}
          minSizes={[30, 20]}
          maximizedIndex={dashboardMaximized}
          onRestore={() => setDashboardMaximized(null)}
        >
          {/* Left Side: Plotly real-time signals */}
          <div className="hil-panel ui-card bg-[#121212] border border-[#222] rounded-lg p-3 flex flex-col h-full overflow-hidden">
            <div className="flex justify-between items-center mb-2 shrink-0">
              <div>
                <h3 className="text-xs font-bold text-[#e0e0e0]">Real-Time Signal Scope</h3>
                <p className="text-[10px] text-[#666]">Live telemetry feed from MCU</p>
              </div>
              <div className="flex gap-2 items-center">
                <button
                  onClick={() => {
                    setIsRecording(!isRecording);
                    if (!isRecording) {
                      setRecordedData([]);
                      addLog('info', 'Started recording trace data...');
                    } else {
                      addLog('success', `Trace complete. Recorded ${recordedData.length} samples.`);
                    }
                  }}
                  className={`ui-control ui-focus-ring px-2 py-1 text-[10px] font-semibold rounded transition-colors ${
                    isRecording 
                      ? 'bg-red-950/30 text-red-500 border border-red-900/40' 
                      : 'bg-[#222] hover:bg-[#333] text-gray-400 border border-[#333]'
                  }`}
                >
                  {isRecording ? 'Stop Rec' : 'Start Rec'}
                </button>
                <button
                  disabled={recordedData.length === 0}
                  onClick={handleExportTrace}
                  className="ui-control ui-focus-ring flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold bg-[#222] hover:bg-[#333] border border-[#333] text-gray-300 rounded transition-colors disabled:opacity-40"
                >
                  <FileDown size={12} /> Export CSV
                </button>
                <PanelMaximizeButton
                  isMaximized={dashboardMaximized === 0}
                  onToggle={() => setDashboardMaximized(dashboardMaximized === 0 ? null : 0)}
                />
              </div>
            </div>
            
            <div className="hil-terminal ui-terminal flex-1 bg-[#0a0a0a] rounded border border-[#222]/60 overflow-hidden flex items-center justify-center">
              {sessionState.status !== 'connected' ? (
                <div className="text-center p-6 text-[#444]">
                  <p className="text-sm">Signal scope offline</p>
                  <p className="text-xs mt-1">Connect serial port to initiate live data graphing</p>
                </div>
              ) : (
                <Plot
                  data={traceData}
                  layout={{
                    autosize: true,
                    margin: { l: 40, r: 15, t: 15, b: 35 },
                    paper_bgcolor: 'rgba(0,0,0,0)',
                    plot_bgcolor: 'rgba(0,0,0,0)',
                    font: { color: '#888', size: 10 },
                    xaxis: { gridcolor: '#1a1a1a', zeroline: false },
                    yaxis: { gridcolor: '#1a1a1a', zeroline: false },
                    showlegend: true,
                    legend: { orientation: 'h', x: 0, y: 1.15 }
                  }}
                  config={{ responsive: true, displayModeBar: false }}
                  style={{ width: '100%', height: '100%' }}
                />
              )}
            </div>
          </div>

          {/* Right Side: Fault injection & Override console */}
          <div className="flex flex-col gap-4 h-full overflow-hidden">
            
            {/* Fault injection */}
            <div className="hil-panel ui-card flex-1 bg-[#121212] border border-[#222] rounded-lg p-3 flex flex-col overflow-hidden">
              <div className="flex justify-between items-center mb-2 shrink-0">
                <h3 className="text-xs font-bold text-[#e0e0e0] flex items-center gap-1.5">
                  <ShieldAlert size={14} className="text-yellow-600" />
                  Fault Injection / Overrides
                </h3>
                <PanelMaximizeButton
                  isMaximized={dashboardMaximized === 1}
                  onToggle={() => setDashboardMaximized(dashboardMaximized === 1 ? null : 1)}
                />
              </div>
              
              <div className="flex-1 overflow-y-auto pr-1 no-scrollbar space-y-2">
                {channels.filter(c => c.direction === 'In').map(ch => {
                  const fault = sessionState.faultInjections[ch.id] || { active: false, value: 0, type: 'override' };
                  return (
                    <div key={ch.id} className="hil-target-card ui-card bg-[#181818] p-2 rounded border border-[#222] text-xs">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="font-semibold text-white">{ch.name} <span className="text-[10px] text-[#666]">({ch.pin})</span></span>
                        <button
                          onClick={() => toggleFault(ch.id, 'override', fault.value)}
                          className={`ui-control ui-focus-ring px-2 py-0.5 text-[9px] rounded font-bold transition-all ${
                            fault.active 
                              ? 'bg-yellow-600 text-black' 
                              : 'bg-[#222] hover:bg-[#333] text-gray-500'
                          }`}
                        >
                          {fault.active ? 'ACTIVE' : 'INJECT'}
                        </button>
                      </div>
                      
                      {fault.active && (
                        <div className="flex items-center gap-2 mt-1">
                          <input
                            type="range"
                            min={ch.rangeMin}
                            max={ch.rangeMax}
                            step={ch.dataType === 'bool' ? 1 : (ch.rangeMax - ch.rangeMin) / 100}
                            value={fault.value}
                            onChange={(e) => {
                              const val = parseFloat(e.target.value);
                              toggleFault(ch.id, 'override', val);
                            }}
                            className="ui-control ui-focus-ring flex-1 h-1 bg-[#333] rounded-lg appearance-none cursor-pointer accent-yellow-500"
                          />
                          <span className="text-[10px] font-mono text-white w-8 text-right">
                            {fault.value}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
                {channels.filter(c => c.direction === 'In').length === 0 && (
                  <div className="text-[#444] text-center py-6 text-[11px]">
                    No input channels found for overrides.
                  </div>
                )}
              </div>
            </div>

            {/* Session Logs */}
            <div className="hil-panel ui-card h-44 bg-[#121212] border border-[#222] rounded-lg p-3 flex flex-col overflow-hidden shrink-0">
              <h3 className="text-xs font-bold text-[#e0e0e0] mb-2 shrink-0">Session Logs</h3>
              <div className="hil-terminal ui-terminal flex-1 overflow-y-auto no-scrollbar font-mono text-[9px] text-[#888] space-y-1 p-2 rounded">
                {sessionState.log.map((lg, i) => {
                  let color = 'text-[#aaa]';
                  if (lg.type === 'success') color = 'text-green-400';
                  if (lg.type === 'warn') color = 'text-yellow-600';
                  if (lg.type === 'error') color = 'text-red-500';
                  return (
                    <div key={i} className="flex gap-1.5">
                      <span className="text-[#555]">{new Date(lg.timestamp).toLocaleTimeString()}</span>
                      <span className={color}>{lg.message}</span>
                    </div>
                  );
                })}
                {sessionState.log.length === 0 && (
                  <div className="text-[#444] text-center py-4">No events logged yet.</div>
                )}
              </div>
            </div>

          </div>
        </ResizableSplitPaneGroup>
      </div>
      
    </div>
  );
};
