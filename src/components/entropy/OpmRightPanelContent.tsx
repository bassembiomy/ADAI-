import React, { useState } from 'react';
import type { AppNode, AppEdge, OpmNodeKind, OPMLinkType, OPMPort } from './EntropyTypes';
import {
  X, Trash2, Plus, Play, Pause, ArrowRight, RotateCcw,
  ChevronDown, ChevronRight, ZoomIn, Layers, Zap, Activity
} from 'lucide-react';

export interface OpmRightPanelContentProps {
  selectedNode: AppNode | null;
  selectedEdge: AppEdge | null;
  onCloseInspector: () => void;
  onUpdateNodeProp: (key: string, value: any) => void;
  onConvertNodeType: (kind: OpmNodeKind) => void;
  onAddStateToObject: (nodeId: string, name: string) => void;
  onManualActivateState: (stateId: string, nodeId: string) => void;
  onDeleteState: (stateId: string, nodeId: string) => void;
  onAddAttribute: (key: string, value: string) => void;
  onAddPort: (name: string, dir: 'input' | 'output', pos: any, type: any) => void;
  onRemovePort: (portId: string, dir: 'input' | 'output') => void;
  onZoomInNode: (nodeId: string) => void;
  onDeleteSelectedNode: () => void;
  onConvertEdgeType: (edgeId: string, type: OPMLinkType) => void;
  rightTab: string;
  onRightTabChange: (tab: string) => void;
  simRunning: boolean;
  simTick: number;
  tickMs: number;
  onToggleSimulation: () => void;
  onRunSimTick: () => void;
  onResetSimulation: () => void;
  activeOpmConfig: any;
  onOpmConfigChange: (updater: (prev: any) => any) => void;
  scopeTabContent: React.ReactNode;
  oplTabContent: React.ReactNode;
  smartShowTabContent: React.ReactNode;
  codegenTabContent: React.ReactNode;
  isWideLayout?: boolean;
}

export const OpmRightPanelContent: React.FC<OpmRightPanelContentProps> = ({
  selectedNode,
  selectedEdge,
  onCloseInspector,
  onUpdateNodeProp,
  onConvertNodeType,
  onAddStateToObject,
  onManualActivateState,
  onDeleteState,
  onAddAttribute,
  onAddPort,
  onRemovePort,
  onZoomInNode,
  onDeleteSelectedNode,
  onConvertEdgeType,
  rightTab,
  onRightTabChange,
  simRunning,
  simTick,
  tickMs,
  onToggleSimulation,
  onRunSimTick,
  onResetSimulation,
  activeOpmConfig,
  onOpmConfigChange,
  scopeTabContent,
  oplTabContent,
  smartShowTabContent,
  codegenTabContent,
  isWideLayout = false,
}) => {
  // Collapsible section state for Inspector
  const [statesExpanded, setStatesExpanded] = useState(true);
  const [attributesExpanded, setAttributesExpanded] = useState(true);
  const [portsExpanded, setPortsExpanded] = useState(true);

  // Local state for adding custom ports
  const [newPortName, setNewPortName] = useState('');
  const [newPortDir, setNewPortDir] = useState<'input' | 'output'>('input');
  const [newPortPos, setNewPortPos] = useState<'left' | 'right' | 'top' | 'bottom'>('left');
  const [newPortType, setNewPortType] = useState<string>('standard');

  const numIn = selectedNode?.data?.inputs?.length || 0;
  const numOut = selectedNode?.data?.outputs?.length || 0;
  const totalPorts = numIn + numOut;
  const statesCount = (selectedNode?.data?.states || []).length;
  const attrsCount = (selectedNode?.data?.attributes || []).length;

  const hasInspector = !!selectedNode || (!!selectedEdge && !selectedNode);

  return (
    <div
      className={`h-full w-full flex ${
        isWideLayout && hasInspector ? 'flex-row' : 'flex-col'
      } gap-2.5 p-2.5 overflow-y-auto custom-scrollbar font-sans text-xs select-none`}
    >
      {/* ─── SECTION A: SELECTED NODE INSPECTOR ─── */}
      {selectedNode && (
        <div
          className={`${
            isWideLayout ? 'w-1/2 shrink-0' : 'w-full shrink-0'
          } bg-[#16161a]/95 backdrop-blur-md border border-white/10 rounded-xl p-3.5 shadow-xl flex flex-col gap-3`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase font-extrabold tracking-wider text-orange-400">
                Element Inspector
              </span>
              <span
                className={`text-[9px] font-mono font-black uppercase px-1.5 py-0.2 rounded border ${
                  selectedNode.data.type === 'object'
                    ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
                    : selectedNode.data.type === 'process'
                    ? 'bg-sky-950/60 border-sky-500/40 text-sky-300'
                    : 'bg-orange-950/60 border-orange-500/40 text-orange-300'
                }`}
              >
                {selectedNode.data.type || 'Object'}
              </span>
            </div>
            <button
              onClick={onCloseInspector}
              aria-label="Close Element Inspector"
              data-testid="opm-close-node-inspector"
              className="text-gray-400 hover:text-white p-1 rounded hover:bg-white/5 transition-colors"
              title="Close Element Inspector"
            >
              <X size={13} />
            </button>
          </div>

          {/* Basic Fields */}
          <div className="space-y-2">
            <div className="flex flex-col gap-1">
              <label htmlFor="opm-node-name-input" className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">
                Name
              </label>
              <input
                id="opm-node-name-input"
                data-testid="opm-node-name-input"
                aria-label="Element Name"
                type="text"
                value={selectedNode.data.name}
                onChange={(e) => onUpdateNodeProp('name', e.target.value)}
                className="bg-[#0e0e11] border border-white/10 rounded-lg px-2.5 py-1.5 outline-none focus:border-orange-500 text-white font-medium"
              />
            </div>

            {selectedNode.data.type !== 'state' && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">
                  Element Type
                </label>
                <select
                  value={selectedNode.type}
                  onChange={(e) => onConvertNodeType(e.target.value as OpmNodeKind)}
                  className="bg-[#0e0e11] border border-white/10 rounded-lg px-2.5 py-1.5 outline-none focus:border-orange-500 text-white font-medium"
                  data-testid="opm-convert-node-type"
                >
                  <option value="opmObject">Object</option>
                  <option value="opmProcess">Process</option>
                </select>
              </div>
            )}

            <div className="flex items-center justify-between pt-1">
              <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">
                Physical Entity
              </label>
              <input
                type="checkbox"
                checked={selectedNode.data.physical}
                onChange={(e) => onUpdateNodeProp('physical', e.target.checked)}
                className="rounded border-white/20 bg-[#0e0e11] text-orange-500 w-4 h-4 accent-orange-500"
              />
            </div>
          </div>

          {/* Collapsible States Section (for Objects) */}
          {selectedNode.data.type === 'object' && (
            <div className="border border-white/5 rounded-lg bg-[#111115] overflow-hidden">
              <button
                type="button"
                onClick={() => setStatesExpanded(!statesExpanded)}
                className="w-full flex items-center justify-between px-2.5 py-2 bg-white/[0.02] hover:bg-white/[0.05] transition-colors"
              >
                <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-orange-300">
                  {statesExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span>States ({statesCount})</span>
                </div>
                <span className="text-[8px] px-1.5 py-0.2 rounded font-mono font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">
                  {statesCount} States
                </span>
              </button>

              {statesExpanded && (
                <div className="p-2.5 space-y-2 border-t border-white/5">
                  <div className="space-y-1.5">
                    {(selectedNode.data.states || []).map((st) => (
                      <div
                        key={st.id}
                        className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg border transition-all ${
                          st.isActive
                            ? 'bg-orange-500/15 border-orange-500/50 shadow-[0_0_10px_rgba(249,115,22,0.15)]'
                            : 'bg-black/30 border-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 transition-all ${
                              st.isActive
                                ? 'bg-orange-500 shadow-[0_0_8px_#f97316] animate-pulse'
                                : 'bg-gray-700'
                            }`}
                          />
                          <span className={`font-semibold text-[11px] truncate ${st.isActive ? 'text-orange-200' : 'text-gray-300'}`}>
                            {st.name}
                          </span>
                          {st.isInitial && (
                            <span className="text-[7.5px] px-1 py-0.2 font-mono font-bold bg-amber-500/20 text-amber-300 rounded border border-amber-500/40 shrink-0">
                              Init
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => onManualActivateState(st.id, selectedNode.id)}
                            className={`text-[8.5px] px-2 py-0.5 rounded font-bold uppercase transition-colors ${
                              st.isActive
                                ? 'bg-orange-500 text-black font-extrabold'
                                : 'bg-white/5 text-orange-400 hover:bg-orange-500/20'
                            }`}
                          >
                            {st.isActive ? 'Active' : 'Set'}
                          </button>
                          <button
                            onClick={() => onDeleteState(st.id, selectedNode.id)}
                            className="text-gray-500 hover:text-red-400 p-1 rounded transition-colors"
                            title="Delete State"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Quick Add State */}
                  <div className="flex gap-1.5 pt-1">
                    <input
                      placeholder="New state name..."
                      id="new-state-name-input"
                      className="bg-[#0a0a0d] border border-white/10 rounded px-2 py-1 outline-none flex-1 text-xs text-white focus:border-orange-500"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                          onAddStateToObject(selectedNode.id, e.currentTarget.value.trim());
                          e.currentTarget.value = '';
                        }
                      }}
                    />
                    <button
                      onClick={() => {
                        const inputEl = document.getElementById('new-state-name-input') as HTMLInputElement;
                        if (inputEl && inputEl.value.trim()) {
                          onAddStateToObject(selectedNode.id, inputEl.value.trim());
                          inputEl.value = '';
                        }
                      }}
                      className="px-2.5 py-1 bg-orange-600 hover:bg-orange-500 text-black font-bold rounded text-[10px] flex items-center gap-1 shrink-0 transition-colors"
                    >
                      <Plus size={11} /> Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Collapsible Attributes Section */}
          {selectedNode.data.type === 'object' && (
            <div className="border border-white/5 rounded-lg bg-[#111115] overflow-hidden">
              <button
                type="button"
                onClick={() => setAttributesExpanded(!attributesExpanded)}
                className="w-full flex items-center justify-between px-2.5 py-2 bg-white/[0.02] hover:bg-white/[0.05] transition-colors"
              >
                <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-gray-300">
                  {attributesExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span>Attributes ({attrsCount})</span>
                </div>
                <span className="text-[8px] px-1.5 py-0.2 rounded font-mono font-bold bg-white/5 text-gray-400">
                  {attrsCount}
                </span>
              </button>

              {attributesExpanded && (
                <div className="p-2.5 space-y-2 border-t border-white/5">
                  <div className="space-y-1">
                    {(selectedNode.data.attributes || []).map((attr, idx) => (
                      <div key={idx} className="flex justify-between bg-black/30 border border-white/5 px-2.5 py-1 rounded font-mono text-[11px]">
                        <span className="text-gray-400">{attr.key}:</span>
                        <span className="text-amber-300 font-bold">{attr.value}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-1.5 pt-1">
                    <input
                      placeholder="Key"
                      id="new-attr-key"
                      className="bg-[#0a0a0d] border border-white/10 rounded px-2 py-1 outline-none w-1/2 text-xs text-white"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const valEl = document.getElementById('new-attr-val') as HTMLInputElement;
                          if (e.currentTarget.value && valEl.value) {
                            onAddAttribute(e.currentTarget.value, valEl.value);
                            e.currentTarget.value = '';
                            valEl.value = '';
                          }
                        }
                      }}
                    />
                    <input
                      placeholder="Val"
                      id="new-attr-val"
                      className="bg-[#0a0a0d] border border-white/10 rounded px-2 py-1 outline-none w-1/2 text-xs text-white"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Collapsible Ports Manager Section */}
          {(selectedNode.data.type === 'object' || selectedNode.data.type === 'process') && (
            <div className="border border-white/5 rounded-lg bg-[#111115] overflow-hidden">
              <button
                type="button"
                onClick={() => setPortsExpanded(!portsExpanded)}
                className="w-full flex items-center justify-between px-2.5 py-2 bg-white/[0.02] hover:bg-white/[0.05] transition-colors"
              >
                <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-sky-300">
                  {portsExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  <span>Ports ({totalPorts})</span>
                </div>
                <span className="text-[8px] px-1.5 py-0.2 rounded font-mono font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  {totalPorts} Ports
                </span>
              </button>

              {portsExpanded && (
                <div className="p-2.5 space-y-2 border-t border-white/5">
                  <div className="max-h-36 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                    {/* Inputs */}
                    {(selectedNode.data.inputs || []).map((port: OPMPort) => (
                      <div key={port.id} className="flex items-center justify-between bg-black/40 border border-blue-500/20 px-2 py-1 rounded text-[10px]">
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          <span className="text-[8px] px-1 py-0.2 bg-blue-500/20 text-blue-300 border border-blue-500/40 rounded font-black font-mono">
                            IN
                          </span>
                          <span className="font-mono text-gray-400 font-bold">{port.position.toUpperCase()[0]}:</span>
                          <span className="truncate text-white font-medium">{port.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[7.5px] px-1 bg-white/5 text-gray-400 rounded font-mono">
                            {port.type}
                          </span>
                          <button
                            onClick={() => onRemovePort(port.id, 'input')}
                            className="text-gray-500 hover:text-red-400 transition-colors"
                            title="Remove Port"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                    ))}

                    {/* Outputs */}
                    {(selectedNode.data.outputs || []).map((port: OPMPort) => (
                      <div key={port.id} className="flex items-center justify-between bg-black/40 border border-emerald-500/20 px-2 py-1 rounded text-[10px]">
                        <div className="flex items-center gap-1.5 overflow-hidden">
                          <span className="text-[8px] px-1 py-0.2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded font-black font-mono">
                            OUT
                          </span>
                          <span className="font-mono text-gray-400 font-bold">{port.position.toUpperCase()[0]}:</span>
                          <span className="truncate text-white font-medium">{port.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[7.5px] px-1 bg-white/5 text-gray-400 rounded font-mono">
                            {port.type}
                          </span>
                          <button
                            onClick={() => onRemovePort(port.id, 'output')}
                            className="text-gray-500 hover:text-red-400 transition-colors"
                            title="Remove Port"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Add Custom Port Form */}
                  <div className="bg-[#18181f] p-2.5 rounded-lg border border-white/5 space-y-1.5">
                    <span className="text-[8.5px] uppercase tracking-wider text-orange-400 font-bold block">
                      Add Custom Port
                    </span>
                    <div className="flex gap-1.5">
                      <input
                        placeholder="Port Label"
                        value={newPortName}
                        onChange={(e) => setNewPortName(e.target.value)}
                        className="bg-[#0a0a0d] border border-white/10 rounded px-2 py-1 outline-none text-[10px] flex-1 text-white"
                      />
                      <select
                        value={newPortDir}
                        onChange={(e: any) => setNewPortDir(e.target.value)}
                        className="bg-[#0a0a0d] border border-white/10 rounded px-1.5 text-[10px] text-gray-300 outline-none"
                      >
                        <option value="input">In</option>
                        <option value="output">Out</option>
                      </select>
                    </div>

                    <div className="flex gap-1.5">
                      <select
                        value={newPortPos}
                        onChange={(e: any) => setNewPortPos(e.target.value)}
                        className="bg-[#0a0a0d] border border-white/10 rounded px-1.5 py-1 text-[9.5px] text-gray-300 outline-none w-1/2"
                      >
                        <option value="left">Left</option>
                        <option value="right">Right</option>
                        <option value="top">Top</option>
                        <option value="bottom">Bottom</option>
                      </select>

                      <select
                        value={newPortType}
                        onChange={(e: any) => setNewPortType(e.target.value)}
                        className="bg-[#0a0a0d] border border-white/10 rounded px-1.5 py-1 text-[9.5px] text-gray-300 outline-none w-1/2"
                      >
                        <option value="standard">Standard</option>
                        <option value="agent">Agent</option>
                        <option value="instrument">Instrument</option>
                        <option value="trigger">Trigger</option>
                        <option value="condition">Condition</option>
                        <option value="consumption">Consume</option>
                        <option value="result">Result</option>
                        <option value="effect">Effect</option>
                      </select>
                    </div>

                    <button
                      onClick={() => {
                        if (newPortName.trim()) {
                          onAddPort(newPortName.trim(), newPortDir, newPortPos, newPortType);
                          setNewPortName('');
                        }
                      }}
                      className="w-full mt-1 py-1 bg-orange-600 hover:bg-orange-500 text-black font-extrabold rounded text-[9.5px] uppercase tracking-wider flex items-center justify-center gap-1 transition-colors"
                    >
                      <Plus size={11} /> Add Port
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Inspector Actions */}
          <div className="pt-2 border-t border-white/10 flex flex-col gap-1.5">
            {selectedNode.data.type !== 'state' && (
              <button
                onClick={() => onZoomInNode(selectedNode.id)}
                className="py-1.5 bg-sky-950/60 text-sky-300 border border-sky-800/80 hover:bg-sky-900/60 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
              >
                <ZoomIn size={12} /> Zoom In (Decompose)
              </button>
            )}

            <button
              onClick={onDeleteSelectedNode}
              className="py-1.5 bg-red-950/40 text-red-400 border border-red-900/60 hover:bg-red-900/40 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
            >
              <Trash2 size={12} /> Delete Element
            </button>
          </div>
        </div>
      )}

      {/* ─── SECTION B: SELECTED EDGE INSPECTOR ─── */}
      {selectedEdge && !selectedNode && (
        <div
          className={`${
            isWideLayout ? 'w-1/2 shrink-0' : 'w-full shrink-0'
          } bg-[#16161a]/95 backdrop-blur-md border border-white/10 rounded-xl p-3.5 shadow-xl flex flex-col gap-2.5`}
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <span className="text-xs uppercase font-extrabold tracking-wider text-sky-400">
              Link Inspector
            </span>
            <button
              onClick={onCloseInspector}
              aria-label="Close Link Inspector"
              data-testid="opm-close-edge-inspector"
              className="text-gray-400 hover:text-white p-1 rounded hover:bg-white/5 transition-colors"
              title="Close Link Inspector"
            >
              <X size={13} />
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex flex-col gap-0.5">
              <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Link ID</label>
              <span className="font-mono text-[11px] text-gray-300">{selectedEdge.id}</span>
            </div>

            <div className="flex flex-col gap-1 pt-1">
              <label htmlFor="opm-convert-edge-type" className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">
                Link Role
              </label>
              <select
                id="opm-convert-edge-type"
                aria-label="Link Role"
                value={(selectedEdge.data?.linkType ?? (selectedEdge.data?.type || 'effect')) as string}
                onChange={(e) => onConvertEdgeType(selectedEdge.id, e.target.value as OPMLinkType)}
                className="bg-[#0e0e11] border border-white/10 rounded-lg px-2.5 py-1.5 outline-none focus:border-sky-500 text-white font-medium"
                data-testid="opm-convert-edge-type"
              >
                <option value="consumption">Consumption</option>
                <option value="result">Result</option>
                <option value="effect">Effect</option>
                <option value="agent">Agent</option>
                <option value="instrument">Instrument</option>
                <option value="trigger">Trigger</option>
                <option value="condition">Condition</option>
                <option value="aggregation">Aggregation</option>
                <option value="generalization">Generalization</option>
                <option value="exhibition">Exhibition</option>
                <option value="satisfies">Satisfies</option>
                <option value="verifies">Verifies</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* ─── SECTION C: STUDIO TABS DASHBOARD ─── */}
      <div
        className={`flex-1 min-h-[300px] flex flex-col overflow-hidden rounded-xl border border-white/10 bg-[#141418] shadow-lg`}
      >
        {/* Tab Headers */}
        <div className="h-11 border-b border-white/10 flex shrink-0 bg-[#16161c]">
          <button
            onClick={() => onRightTabChange('simControl')}
            className={`flex-1 flex items-center justify-center gap-1 text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 ${
              rightTab === 'simControl'
                ? 'border-orange-500 text-orange-400 bg-orange-500/10'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            ⚡ Sim
          </button>
          <button
            data-testid="opm-scope-tab-btn"
            onClick={() => onRightTabChange('scope')}
            className={`flex-1 flex items-center justify-center gap-1 text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 ${
              rightTab === 'scope'
                ? 'border-orange-500 text-orange-400 bg-orange-500/10'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            📈 Scope
          </button>
          <button
            onClick={() => onRightTabChange('opl')}
            className={`flex-1 flex items-center justify-center gap-1 text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 ${
              rightTab === 'opl'
                ? 'border-sky-500 text-sky-400 bg-sky-500/10'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            📝 OPL
          </button>
          <button
            onClick={() => onRightTabChange('smartShow')}
            className={`flex-1 flex items-center justify-center gap-1 text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 ${
              rightTab === 'smartShow'
                ? 'border-sky-500 text-sky-300 bg-sky-500/10'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            🌐 Show
          </button>
          <button
            onClick={() => onRightTabChange('opmCodegen')}
            className={`flex-1 flex items-center justify-center gap-1 text-[11px] font-bold uppercase tracking-wider transition-all border-b-2 ${
              rightTab === 'opmCodegen'
                ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            🛠 Build
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto custom-scrollbar">
          {/* TAB 1: Sim Control */}
          {rightTab === 'simControl' && (
            <div className="flex-1 flex flex-col p-3.5 gap-3.5">
              {/* Simulation Status Card */}
              <div className="bg-[#1a1a22] rounded-xl border border-white/10 p-3 flex items-center justify-between shadow-md">
                <div className="flex flex-col">
                  <span className="text-[9.5px] text-gray-400 uppercase font-black tracking-wider">
                    Simulation Status
                  </span>
                  <span
                    data-testid="opm-sim-status"
                    className={`text-xs font-extrabold flex items-center gap-1.5 mt-0.5 ${
                      simRunning ? 'text-green-400' : 'text-amber-400'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        simRunning ? 'bg-green-400 animate-ping' : 'bg-amber-400'
                      }`}
                    />
                    {simRunning ? 'ACTIVE RUNNING' : 'PAUSED'}
                  </span>
                  <span
                    data-testid="opm-sim-time"
                    className="text-[10px] text-gray-400 font-mono mt-0.5"
                  >
                    Sim Time: {simTick * tickMs}ms (Tick {simTick})
                  </span>
                </div>

                <div className="flex gap-1.5 bg-black/40 p-1.5 rounded-lg border border-white/5">
                  <button
                    data-testid="opm-sim-toggle"
                    onClick={onToggleSimulation}
                    className={`p-2 rounded-md transition-all ${
                      simRunning
                        ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
                        : 'bg-green-500/20 text-green-400 border border-green-500/40 hover:bg-green-500/30'
                    }`}
                    title={simRunning ? 'Pause (Space)' : 'Start (Space)'}
                  >
                    {simRunning ? <Pause size={13} /> : <Play size={13} />}
                  </button>
                  <button
                    data-testid="opm-sim-step"
                    onClick={onRunSimTick}
                    className="p-2 text-sky-400 hover:bg-sky-500/20 rounded-md transition-all border border-transparent hover:border-sky-500/30"
                    title="Step 1 Tick"
                  >
                    <ArrowRight size={13} />
                  </button>
                  <button
                    data-testid="opm-sim-reset"
                    onClick={onResetSimulation}
                    className="p-2 text-amber-400 hover:bg-amber-500/20 rounded-md transition-all border border-transparent hover:border-amber-500/30"
                    title="Reset Simulation"
                  >
                    <RotateCcw size={13} />
                  </button>
                </div>
              </div>

              {/* Simulation Config Panel */}
              <div className="bg-[#1a1a22] rounded-xl border border-white/10 p-3 flex flex-col gap-2.5 shadow-md">
                <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-orange-300">
                    Engine Parameters
                  </span>
                  <span className="text-[8px] font-mono text-gray-400">Isolated Solver</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex flex-col gap-1">
                    <label className="text-[9.5px] text-gray-400 uppercase font-semibold">
                      Tick Resolution
                    </label>
                    <select
                      value={activeOpmConfig.tickMs}
                      onChange={(e) =>
                        onOpmConfigChange((prev: any) => ({
                          ...prev,
                          tickMs: Number(e.target.value),
                        }))
                      }
                      className="bg-[#0e0e12] border border-white/10 rounded px-2 py-1 outline-none text-white text-[11px]"
                    >
                      <option value={20}>20ms (High Freq)</option>
                      <option value={50}>50ms (Default)</option>
                      <option value={100}>100ms (Slow Motion)</option>
                      <option value={250}>250ms (Debug Step)</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[9.5px] text-gray-400 uppercase font-semibold">
                      Execution Mode
                    </label>
                    <select
                      value={activeOpmConfig.executionMode}
                      onChange={(e) =>
                        onOpmConfigChange((prev: any) => ({
                          ...prev,
                          executionMode: e.target.value,
                        }))
                      }
                      className="bg-[#0e0e12] border border-white/10 rounded px-2 py-1 outline-none text-white text-[11px]"
                    >
                      <option value="discrete">Discrete Tick</option>
                      <option value="continuous">Continuous Hybrid</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Scope */}
          {rightTab === 'scope' && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">{scopeTabContent}</div>
          )}

          {/* TAB 3: OPL */}
          {rightTab === 'opl' && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">{oplTabContent}</div>
          )}

          {/* TAB 4: Smart Show */}
          {rightTab === 'smartShow' && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">{smartShowTabContent}</div>
          )}

          {/* TAB 5: OPM Codegen */}
          {rightTab === 'opmCodegen' && (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">{codegenTabContent}</div>
          )}
        </div>
      </div>
    </div>
  );
};
