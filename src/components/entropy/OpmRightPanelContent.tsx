import React, { useState, useMemo, useEffect } from 'react';
import type { AppNode, AppEdge, OPMLinkType, OPMPort } from './EntropyTypes';
import { analyzeOpmDeletion } from './OpmDeletionImpact';
import type { OpmNodeKind } from './OpmMigrations';
import type {
  OpmExecutionConfig,
  OpmDiagnostic,
  OpmAttribute,
  OpmAssignment,
  OpmProcessExecution,
  OpmStateExecution,
  OpmObjectExecution,
  OpmLinkExecution,
  OpmEventDefinition,
  OpmEnumDefinition,
} from '../../engine/opm/executableTypes';
import {
  toCIdentifier,
  nextStableId,
  TypedValueEditor,
  AssignmentRows,
} from './OpmExecutionPropertiesPanel';
import {
  X, Trash2, Plus, Play, Pause, ArrowRight, RotateCcw,
  ChevronDown, ChevronRight, ZoomIn, Layers, Zap, Activity, AlertTriangle
} from 'lucide-react';

export interface OpmRightPanelContentProps {
  nodes?: AppNode[];
  edges?: AppEdge[];
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
  simControlExtraContent?: React.ReactNode;
  scopeTabContent: React.ReactNode;
  oplTabContent: React.ReactNode;
  smartShowTabContent: React.ReactNode;
  codegenTabContent: React.ReactNode;
  isWideLayout?: boolean;
  executionConfig?: OpmExecutionConfig;
  onUpdateSelectionExecution?: (updatedExecution: any) => void;
  writableAttributes?: readonly Pick<OpmAttribute, 'id' | 'displayName'>[];
  diagnostics?: OpmDiagnostic[];
}

export const OpmRightPanelContent: React.FC<OpmRightPanelContentProps> = ({
  nodes,
  edges,
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
  simControlExtraContent,
  scopeTabContent,
  oplTabContent,
  smartShowTabContent,
  codegenTabContent,
  isWideLayout = false,
  executionConfig,
  onUpdateSelectionExecution,
  writableAttributes = [],
  diagnostics = [],
}) => {
  const events = executionConfig?.events ?? [];
  const enums = executionConfig?.enums ?? [];
  const enumById = React.useMemo(() => {
    const map = new Map<string, OpmEnumDefinition>();
    for (const def of enums) map.set(def.id, def);
    return map;
  }, [enums]);
  // Collapsible section state for Inspector
  const [statesExpanded, setStatesExpanded] = useState(true);
  const [attributesExpanded, setAttributesExpanded] = useState(true);
  const [portsExpanded, setPortsExpanded] = useState(true);

  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setConfirmDelete(false);
  }, [selectedNode?.id]);

  const deleteImpact = useMemo(() => {
    if (!selectedNode || !nodes || !edges) return null;
    return analyzeOpmDeletion({ nodes, edges }, { nodeIds: [selectedNode.id] });
  }, [selectedNode, nodes, edges]);

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
      className={`opm-panel ui-surface h-full w-full flex ${
        isWideLayout && hasInspector ? 'flex-row' : 'flex-col'
      } gap-2.5 p-2.5 overflow-y-auto custom-scrollbar font-sans text-xs select-none`}
    >
      {/* ─── SECTION A: SELECTED NODE INSPECTOR ─── */}
      {selectedNode && (
        <div
          className={`opm-inspector ui-card ${
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

            {/* State Execution & Behaviors (for State nodes) */}
            {selectedNode.data.type === 'state' && (() => {
              const exec: OpmStateExecution = (selectedNode.data as any)?.stateExecution || selectedNode.data?.execution || {
                enabled: true,
                initial: false,
                terminal: false,
                entryAssignments: [],
                exitAssignments: [],
              };

              const handleUpdateStateExecution = (patch: Partial<OpmStateExecution>) => {
                const updated = { ...exec, ...patch };
                if (onUpdateSelectionExecution) {
                  onUpdateSelectionExecution(updated);
                }
              };

              const handleAddEntry = () => {
                const newAsgn: OpmAssignment = {
                  id: nextStableId('asgn'),
                  targetAttributeId: '',
                  operator: '=',
                  expression: '0',
                  enabled: true,
                };
                handleUpdateStateExecution({
                  entryAssignments: [...(exec.entryAssignments || []), newAsgn],
                });
              };

              const handleAddExit = () => {
                const newAsgn: OpmAssignment = {
                  id: nextStableId('asgn'),
                  targetAttributeId: '',
                  operator: '=',
                  expression: '0',
                  enabled: true,
                };
                handleUpdateStateExecution({
                  exitAssignments: [...(exec.exitAssignments || []), newAsgn],
                });
              };

              return (
                <div className="space-y-3 pt-2 border-t border-white/10">
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-200">
                      <input
                        data-testid="state-initial-checkbox"
                        aria-label="Initial state"
                        data-opm-path="stateExecution.initial"
                        type="checkbox"
                        checked={Boolean(exec.initial)}
                        onChange={(e) => handleUpdateStateExecution({ initial: e.target.checked })}
                        className="rounded border-white/20 bg-[#0e0e11] text-amber-500 w-4 h-4 accent-amber-500"
                      />
                      <span className="font-semibold">Initial State</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer text-xs text-gray-200">
                      <input
                        data-testid="state-terminal-checkbox"
                        aria-label="Terminal state"
                        data-opm-path="stateExecution.terminal"
                        type="checkbox"
                        checked={Boolean(exec.terminal)}
                        onChange={(e) => handleUpdateStateExecution({ terminal: e.target.checked })}
                        className="rounded border-white/20 bg-[#0e0e11] text-amber-500 w-4 h-4 accent-amber-500"
                      />
                      <span className="font-semibold">Terminal State</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-400 font-bold block mb-0.5" htmlFor="state-timeout">
                        Timeout (ms)
                      </label>
                      <input
                        id="state-timeout"
                        data-testid="state-timeout-input"
                        data-opm-path="stateExecution.timeoutMs"
                        type="number"
                        value={exec.timeoutMs ?? ''}
                        onChange={(e) =>
                          handleUpdateStateExecution({
                            timeoutMs: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                        placeholder="e.g. 5000"
                        className="w-full bg-[#0e0e11] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400 font-bold block mb-0.5" htmlFor="state-timeout-ev">
                        Timeout Event
                      </label>
                      <select
                        id="state-timeout-ev"
                        data-testid="state-timeout-event-select"
                        data-opm-path="stateExecution.timeoutEventId"
                        value={exec.timeoutEventId || ''}
                        onChange={(e) =>
                          handleUpdateStateExecution({ timeoutEventId: e.target.value || undefined })
                        }
                        className="w-full bg-[#0e0e11] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-amber-500 focus:outline-none"
                      >
                        <option value="">-- none --</option>
                        {events.map((ev) => (
                          <option key={ev.id} value={ev.id}>
                            {ev.displayName}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-white/10">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold uppercase text-amber-400">Entry Actions</span>
                      <button
                        data-testid="add-entry-assignment-btn"
                        aria-label="Add entry assignment"
                        onClick={handleAddEntry}
                        className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-amber-950 text-amber-400 border border-amber-800 rounded hover:bg-amber-900 font-bold"
                      >
                        <Plus size={10} /> Add Entry
                      </button>
                    </div>
                    <AssignmentRows
                      value={exec.entryAssignments || []}
                      writableAttributes={writableAttributes}
                      basePath="stateExecution.entryAssignments"
                      testIdPrefix="entry-assignment"
                      onChange={(next) => handleUpdateStateExecution({ entryAssignments: next })}
                    />
                  </div>

                  <div className="pt-2 border-t border-white/10">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold uppercase text-amber-400">Exit Actions</span>
                      <button
                        data-testid="add-exit-assignment-btn"
                        aria-label="Add exit assignment"
                        onClick={handleAddExit}
                        className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-amber-950 text-amber-400 border border-amber-800 rounded hover:bg-amber-900 font-bold"
                      >
                        <Plus size={10} /> Add Exit
                      </button>
                    </div>
                    <AssignmentRows
                      value={exec.exitAssignments || []}
                      writableAttributes={writableAttributes}
                      basePath="stateExecution.exitAssignments"
                      testIdPrefix="exit-assignment"
                      onChange={(next) => handleUpdateStateExecution({ exitAssignments: next })}
                    />
                  </div>
                </div>
              );
            })()}

            {/* Process Execution Inspector (for Process nodes) */}
            {selectedNode.data.type === 'process' && (() => {
              const procExec: OpmProcessExecution = (selectedNode.data as any)?.processExecution || selectedNode.data?.execution || {
                enabled: true,
                activation: 'cyclic',
                guard: '',
                assignments: [],
                priority: 1,
                periodMs: 100,
                debounceMs: 0,
                reentrancy: 'reject',
                inputAttributeIds: [],
                outputAttributeIds: [],
              };

              const handleUpdateProcExec = (patch: Partial<OpmProcessExecution>) => {
                const updated = { ...procExec, ...patch };
                if (onUpdateSelectionExecution) {
                  onUpdateSelectionExecution(updated);
                }
              };

              const handleAddAssignment = () => {
                const newAsgn: OpmAssignment = {
                  id: nextStableId('asgn'),
                  targetAttributeId: '',
                  operator: '=',
                  expression: '0',
                  enabled: true,
                };
                handleUpdateProcExec({
                  assignments: [...(procExec.assignments || []), newAsgn],
                });
              };

              return (
                <div className="space-y-3 pt-2 border-t border-white/10">
                  <div className="flex flex-col gap-1">
                    <label htmlFor="proc-activation" className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">
                      Activation Mode
                    </label>
                    <select
                      id="proc-activation"
                      data-testid="process-activation-select"
                      data-opm-path="processExecution.activation"
                      value={procExec.activation}
                      onChange={(e) => handleUpdateProcExec({ activation: e.target.value as any })}
                      className="w-full bg-[#0e0e11] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-sky-500 focus:outline-none"
                    >
                      <option value="cyclic">cyclic</option>
                      <option value="triggered">triggered</option>
                      <option value="both">both</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-400 font-bold block mb-0.5" htmlFor="proc-period">
                        Period (ms)
                      </label>
                      <input
                        id="proc-period"
                        data-testid="process-period-input"
                        data-opm-path="processExecution.periodMs"
                        type="number"
                        value={procExec.periodMs ?? ''}
                        onChange={(e) =>
                          handleUpdateProcExec({
                            periodMs: e.target.value ? Number(e.target.value) : undefined,
                          })
                        }
                        placeholder="e.g. 100"
                        className="w-full bg-[#0e0e11] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-sky-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400 font-bold block mb-0.5" htmlFor="proc-priority">
                        Priority
                      </label>
                      <input
                        id="proc-priority"
                        data-testid="process-priority-input"
                        data-opm-path="processExecution.priority"
                        type="number"
                        value={procExec.priority ?? 1}
                        onChange={(e) => handleUpdateProcExec({ priority: Number(e.target.value) })}
                        className="w-full bg-[#0e0e11] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-sky-500 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] text-gray-400 font-bold block mb-0.5" htmlFor="proc-guard">
                      Guard Expression
                    </label>
                    <input
                      id="proc-guard"
                      data-testid="guard-expr-input"
                      data-opm-path="processExecution.guard"
                      value={procExec.guard || ''}
                      onChange={(e) => handleUpdateProcExec({ guard: e.target.value })}
                      placeholder="e.g. temperature.value < 100.0"
                      className="w-full bg-[#0e0e11] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-sky-500 focus:outline-none"
                    />
                  </div>

                  <div className="pt-2 border-t border-white/10">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold uppercase text-sky-400">
                        Action Assignments
                      </span>
                      <button
                        data-testid="add-assignment-btn"
                        aria-label="Add assignment"
                        onClick={handleAddAssignment}
                        className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-sky-950 text-sky-400 border border-sky-800 rounded hover:bg-sky-900 font-bold"
                      >
                        <Plus size={10} /> Add Assignment
                      </button>
                    </div>
                    <AssignmentRows
                      value={procExec.assignments || []}
                      writableAttributes={writableAttributes}
                      basePath="processExecution.assignments"
                      onChange={(next) => handleUpdateProcExec({ assignments: next })}
                    />
                  </div>
                </div>
              );
            })()}
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

          {/* Collapsible Variables & Attributes Section */}
          {selectedNode.data.type === 'object' && (() => {
            const objExec: OpmObjectExecution = (selectedNode.data as any)?.objectExecution || selectedNode.data?.execution || {
              enabled: true,
              attributes: [],
            };
            const typedAttributes = objExec.attributes || [];

            const handleUpdateObjExec = (patch: Partial<OpmObjectExecution>) => {
              const updated = { ...objExec, ...patch };
              if (onUpdateSelectionExecution) {
                onUpdateSelectionExecution(updated);
              }
            };

            const handleAddTypedAttribute = () => {
              const n = typedAttributes.length + 1;
              const displayName = `var_${n}`;
              const newAttr: OpmAttribute = {
                id: nextStableId('attr'),
                displayName,
                cIdentifier: toCIdentifier(displayName, `var_${n}`),
                type: { kind: 'float32' },
                initialValue: 0,
                overflow: 'wrap',
                access: 'readWrite',
                persistent: false,
              };
              handleUpdateObjExec({ attributes: [...typedAttributes, newAttr] });
            };

            const handleUpdateTypedAttr = (index: number, patch: Partial<OpmAttribute>) => {
              const next = [...typedAttributes];
              next[index] = { ...next[index], ...patch };
              handleUpdateObjExec({ attributes: next });
            };

            const handleDeleteTypedAttr = (index: number) => {
              const next = typedAttributes.filter((_, i) => i !== index);
              handleUpdateObjExec({ attributes: next });
            };

            const totalCount = typedAttributes.length + attrsCount;

            return (
              <div className="border border-white/5 rounded-lg bg-[#111115] overflow-hidden">
                <button
                  type="button"
                  onClick={() => setAttributesExpanded(!attributesExpanded)}
                  className="w-full flex items-center justify-between px-2.5 py-2 bg-white/[0.02] hover:bg-white/[0.05] transition-colors"
                >
                  <div className="flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider text-emerald-400">
                    {attributesExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <span>Variables & Attributes ({totalCount})</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      data-testid="add-attr-btn"
                      aria-label="Add attribute"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleAddTypedAttribute();
                      }}
                      className="flex items-center gap-1 text-[9px] px-2 py-0.5 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded hover:bg-emerald-900 font-bold"
                    >
                      <Plus size={10} /> Add Variable
                    </button>
                    <span className="text-[8px] px-1.5 py-0.2 rounded font-mono font-bold bg-white/5 text-gray-400">
                      {totalCount}
                    </span>
                  </div>
                </button>

                {attributesExpanded && (
                  <div className="p-2.5 space-y-3 border-t border-white/5">
                    {/* Typed Executable Variables */}
                    <div className="space-y-2">
                      {typedAttributes.length === 0 && (
                        <div className="text-[10px] text-gray-500 italic text-center py-0.5">
                          No typed variables. Click &quot;+ Add Variable&quot; to declare one.
                        </div>
                      )}
                      {typedAttributes.map((attr, idx) => {
                        const enumDef =
                          attr.type.kind === 'enum' ? enumById.get(attr.type.enumId) : undefined;
                        return (
                          <div
                            key={attr.id}
                            className="p-2 bg-black/40 border border-white/10 rounded-lg flex flex-col gap-1.5"
                          >
                            <div className="flex items-center justify-between gap-1">
                              <input
                                data-testid="attr-name-input"
                                aria-label={`Attribute ${idx + 1} display name`}
                                data-opm-path={`objectExecution.attributes[${idx}].displayName`}
                                value={attr.displayName}
                                onChange={(e) =>
                                  handleUpdateTypedAttr(idx, {
                                    displayName: e.target.value,
                                    cIdentifier: toCIdentifier(e.target.value, attr.id),
                                  })
                                }
                                placeholder="Attribute name"
                                className="bg-[#0e0e11] border border-white/10 rounded px-1.5 py-0.5 text-xs text-white font-mono flex-1 focus:border-emerald-500 focus:outline-none"
                              />
                              <select
                                data-testid="attr-type-select"
                                aria-label={`Attribute ${idx + 1} type`}
                                data-opm-path={`objectExecution.attributes[${idx}].type`}
                                value={
                                  attr.type.kind === 'enum' ? `enum:${attr.type.enumId}` : attr.type.kind
                                }
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val.startsWith('enum:')) {
                                    const enumId = val.replace('enum:', '');
                                    handleUpdateTypedAttr(idx, { type: { kind: 'enum', enumId }, initialValue: null });
                                  } else {
                                    const kind = val as 'bool' | 'int32' | 'uint32' | 'float32';
                                    handleUpdateTypedAttr(idx, {
                                      type: { kind },
                                      initialValue: kind === 'bool' ? false : 0,
                                    });
                                  }
                                }}
                                className="bg-[#0e0e11] border border-white/10 rounded px-1.5 py-0.5 text-[10px] text-white font-mono focus:border-emerald-500 focus:outline-none"
                              >
                                <option value="float32">float32</option>
                                <option value="int32">int32</option>
                                <option value="uint32">uint32</option>
                                <option value="bool">bool</option>
                                {enums.map((en) => (
                                  <option key={en.id} value={`enum:${en.id}`}>
                                    enum {en.displayName}
                                  </option>
                                ))}
                              </select>
                              <button
                                data-testid="attr-delete-btn"
                                aria-label={`Delete attribute ${idx + 1}`}
                                onClick={() => handleDeleteTypedAttr(idx)}
                                className="text-red-500 hover:text-red-400 p-0.5"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>

                            <div className="flex items-center justify-between text-[10px] pt-1">
                              <span className="text-gray-400">Initial Value:</span>
                              <TypedValueEditor
                                type={attr.type}
                                value={attr.initialValue}
                                enumOptions={enumDef?.members}
                                onChange={(val) => handleUpdateTypedAttr(idx, { initialValue: val })}
                                testId="attr-initial-value-input"
                                opmPath={`objectExecution.attributes[${idx}].initialValue`}
                                label={`Attribute ${idx + 1} initial value`}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Metadata / String Key-Value Attributes */}
                    <div className="pt-2 border-t border-white/5 space-y-1.5">
                      <span className="text-[9px] uppercase font-bold text-gray-400">Metadata Properties</span>
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
                  </div>
                )}
              </div>
            );
          })()}

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
                    {(selectedNode.data.inputs || []).map((port: OPMPort) => {
                      const isObj = selectedNode.data.type === 'object';
                      return (
                        <div key={port.id} className={`flex items-center justify-between bg-black/40 border ${isObj ? 'border-green-500/20' : 'border-blue-500/20'} px-2 py-1 rounded text-[10px]`}>
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            <span className={`text-[8px] px-1 py-0.2 ${isObj ? 'bg-green-500/20 text-green-300 border-green-500/40' : 'bg-blue-500/20 text-blue-300 border-blue-500/40'} border rounded font-black font-mono`}>
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
                      );
                    })}

                    {/* Outputs */}
                    {(selectedNode.data.outputs || []).map((port: OPMPort) => {
                      const isObj = selectedNode.data.type === 'object';
                      return (
                        <div key={port.id} className={`flex items-center justify-between bg-black/40 border ${isObj ? 'border-red-500/20' : 'border-emerald-500/20'} px-2 py-1 rounded text-[10px]`}>
                          <div className="flex items-center gap-1.5 overflow-hidden">
                            <span className={`text-[8px] px-1 py-0.2 ${isObj ? 'bg-red-500/20 text-red-300 border-red-500/40' : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'} border rounded font-black font-mono`}>
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
                      );
                    })}
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

            {confirmDelete && deleteImpact?.isHighImpact ? (
              <div className="bg-red-950/50 border border-red-800/80 rounded-lg p-2.5 space-y-2 text-xs" data-testid="deletion-impact-preview">
                <div className="font-bold text-red-300 flex items-center gap-1.5">
                  <AlertTriangle size={14} className="text-red-400" /> High-Impact Deletion Warning
                </div>
                <div className="text-red-200/90 text-[11px] leading-relaxed">
                  Deleting <span className="font-semibold text-white">[{selectedNode.data.name}]</span> will cascade:
                </div>
                <ul className="list-disc list-inside text-[10px] text-red-300/80 font-mono space-y-0.5">
                  {deleteImpact.summary.descendantsCascadedCount > 0 && (
                    <li>{deleteImpact.summary.descendantsCascadedCount} child state/element(s)</li>
                  )}
                  {deleteImpact.summary.deletedEdgeCount > 0 && (
                    <li>{deleteImpact.summary.deletedEdgeCount} connected link(s)</li>
                  )}
                  {deleteImpact.summary.affectedRequirementCount > 0 && (
                    <li>{deleteImpact.summary.affectedRequirementCount} requirement relation(s)</li>
                  )}
                  {deleteImpact.affectedSimulationIds.length > 0 && (
                    <li>{deleteImpact.affectedSimulationIds.length} simulation entity reference(s)</li>
                  )}
                </ul>
                <div className="flex gap-2 pt-1">
                  <button
                    data-testid="cancel-delete-btn"
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    data-testid="confirm-delete-btn"
                    onClick={() => {
                      setConfirmDelete(false);
                      onDeleteSelectedNode();
                    }}
                    className="flex-1 py-1 bg-red-700 hover:bg-red-600 text-white rounded text-xs font-semibold transition-colors"
                  >
                    Confirm Delete
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  if (deleteImpact?.isHighImpact) {
                    setConfirmDelete(true);
                  } else {
                    onDeleteSelectedNode();
                  }
                }}
                className="py-1.5 bg-red-950/40 text-red-400 border border-red-900/60 hover:bg-red-900/40 rounded-lg text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
              >
                <Trash2 size={12} /> Delete Element
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── SECTION B: SELECTED EDGE INSPECTOR ─── */}
      {selectedEdge && !selectedNode && (() => {
        const linkExec: OpmLinkExecution = (selectedEdge.data as any)?.linkExecution || selectedEdge.data?.execution || {
          enabled: true,
          guard: '',
          assignments: [],
          priority: 1,
          delayMs: 0,
        };

        const handleUpdateLinkExecution = (patch: Partial<OpmLinkExecution>) => {
          const updated = { ...linkExec, ...patch };
          if (onUpdateSelectionExecution) {
            onUpdateSelectionExecution(updated);
          }
        };

        const handleAddAssignment = () => {
          const newAsgn: OpmAssignment = {
            id: nextStableId('asgn'),
            targetAttributeId: '',
            operator: '=',
            expression: '0',
            enabled: true,
          };
          handleUpdateLinkExecution({
            assignments: [...(linkExec.assignments || []), newAsgn],
          });
        };

        return (
          <div
            data-testid="link-execution-inspector"
            className={`opm-inspector ui-card ${
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

              <div>
                <label className="text-[10px] text-gray-400 font-bold block mb-0.5" htmlFor="link-event">
                  Event Trigger
                </label>
                <select
                  id="link-event"
                  data-testid="link-event-select"
                  data-opm-path="linkExecution.eventId"
                  value={linkExec.eventId || ''}
                  onChange={(e) => handleUpdateLinkExecution({ eventId: e.target.value || undefined })}
                  className="w-full bg-[#0e0e11] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-sky-500 focus:outline-none"
                >
                  <option value="">-- none --</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.displayName}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] text-gray-400 font-bold block mb-0.5" htmlFor="link-guard">
                  Guard Expression
                </label>
                <input
                  id="link-guard"
                  data-testid="guard-expr-input"
                  data-opm-path="linkExecution.guard"
                  value={linkExec.guard || ''}
                  onChange={(e) => handleUpdateLinkExecution({ guard: e.target.value })}
                  placeholder="e.g. ready == true"
                  className="w-full bg-[#0e0e11] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-gray-400 font-bold block mb-0.5" htmlFor="link-prio">
                    Priority
                  </label>
                  <input
                    id="link-prio"
                    data-testid="link-priority-input"
                    data-opm-path="linkExecution.priority"
                    type="number"
                    value={linkExec.priority ?? 1}
                    onChange={(e) => handleUpdateLinkExecution({ priority: Number(e.target.value) })}
                    className="w-full bg-[#0e0e11] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold block mb-0.5" htmlFor="link-delay">
                    Delay (ms)
                  </label>
                  <input
                    id="link-delay"
                    data-testid="link-delay-input"
                    data-opm-path="linkExecution.delayMs"
                    type="number"
                    value={linkExec.delayMs ?? 0}
                    onChange={(e) => handleUpdateLinkExecution({ delayMs: Number(e.target.value) })}
                    className="w-full bg-[#0e0e11] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-sky-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="pt-2 border-t border-white/10 space-y-2">
                <span className="text-[10px] font-bold uppercase text-orange-400 tracking-wider">
                  State Transition Target
                </span>
                <div>
                  <label className="text-[10px] text-gray-400 font-bold block mb-0.5" htmlFor="link-trans-owner">
                    Owner Object ID
                  </label>
                  <input
                    id="link-trans-owner"
                    data-testid="link-transition-owner-input"
                    data-opm-path="linkExecution.transition.ownerObjectId"
                    value={linkExec.transition?.ownerObjectId || ''}
                    onChange={(e) =>
                      handleUpdateLinkExecution({
                        transition: {
                          ownerObjectId: e.target.value,
                          targetStateId: linkExec.transition?.targetStateId || '',
                          sourceStateId: linkExec.transition?.sourceStateId,
                        },
                      })
                    }
                    placeholder="e.g. obj_boiler"
                    className="w-full bg-[#0e0e11] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-orange-500 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-gray-400 font-bold block mb-0.5" htmlFor="link-trans-src">
                      Source State ID
                    </label>
                    <input
                      id="link-trans-src"
                      data-testid="link-transition-source-input"
                      data-opm-path="linkExecution.transition.sourceStateId"
                      value={linkExec.transition?.sourceStateId || ''}
                      onChange={(e) =>
                        handleUpdateLinkExecution({
                          transition: {
                            ownerObjectId: linkExec.transition?.ownerObjectId || '',
                            targetStateId: linkExec.transition?.targetStateId || '',
                            sourceStateId: e.target.value || undefined,
                          },
                        })
                      }
                      placeholder="optional"
                      className="w-full bg-[#0e0e11] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-400 font-bold block mb-0.5" htmlFor="link-trans-tgt">
                      Target State ID
                    </label>
                    <input
                      id="link-trans-tgt"
                      data-testid="link-transition-target-input"
                      data-opm-path="linkExecution.transition.targetStateId"
                      value={linkExec.transition?.targetStateId || ''}
                      onChange={(e) =>
                        handleUpdateLinkExecution({
                          transition: {
                            ownerObjectId: linkExec.transition?.ownerObjectId || '',
                            targetStateId: e.target.value,
                            sourceStateId: linkExec.transition?.sourceStateId,
                          },
                        })
                      }
                      placeholder="e.g. st_active"
                      className="w-full bg-[#0e0e11] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-white/10">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold uppercase text-gray-400">
                    Action Assignments
                  </span>
                  <button
                    data-testid="add-assignment-btn"
                    aria-label="Add assignment"
                    onClick={handleAddAssignment}
                    className="flex items-center gap-1 text-[10px] px-2 py-0.5 bg-sky-950 text-sky-400 border border-sky-800 rounded hover:bg-sky-900"
                  >
                    <Plus size={10} /> Add Assignment
                  </button>
                </div>
                <AssignmentRows
                  value={linkExec.assignments || []}
                  writableAttributes={writableAttributes}
                  basePath="linkExecution.assignments"
                  onChange={(next) => handleUpdateLinkExecution({ assignments: next })}
                />
              </div>
            </div>
          </div>
        );
      })()}

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
                    aria-label={simRunning ? "Pause Simulation" : "Start Simulation"}
                    onClick={onToggleSimulation}
                    className={`p-2 rounded-md transition-all ${
                      simRunning
                        ? 'bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30'
                        : 'bg-green-500/20 text-green-400 border border-green-500/40 hover:bg-green-500/30'
                    }`}
                    title={simRunning ? 'Pause Simulation (Space)' : 'Start Simulation (Space)'}
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

              {simControlExtraContent}
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
