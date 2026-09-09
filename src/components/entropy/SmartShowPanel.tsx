import React, { useMemo, useState } from 'react';
import {
  deriveStructureView,
  deriveBehaviorView,
  deriveRequirementsView,
  deriveInternalView,
  OpmStructureNode,
  OpmRequirementStatus,
} from './OpmViewDeriver';
import type { OpmSimulationState } from './OpmSimulationEngine';
import type { AppNode, AppEdge } from './EntropyTypes';
import { Boxes, Network, ListChecks, GitBranch, Activity, AlertTriangle } from 'lucide-react';

type SmartTab = 'structure' | 'internal' | 'behavior' | 'requirements';

interface SmartShowPanelProps {
  nodes: AppNode[];
  edges: AppEdge[];
  simState: OpmSimulationState;
  simRunning: boolean;
  onSelectProcess?: (processId: string) => void;
  onSelectElement?: (elementId: string) => void;
}

const statusBadgeStyles: Record<OpmRequirementStatus, string> = {
  verified: 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50',
  covered: 'bg-blue-950/80 text-blue-300 border-blue-500/50',
  stale: 'bg-amber-950/80 text-amber-300 border-amber-500/50',
  failed: 'bg-red-950/80 text-red-300 border-red-500/50',
  uncovered: 'bg-zinc-900 text-zinc-400 border-zinc-700/50',
};

const StructureTree: React.FC<{
  nodes: OpmStructureNode[];
  depth?: number;
  onSelect?: (id: string) => void;
}> = ({ nodes, depth = 0, onSelect }) => (
  <div style={{ paddingLeft: depth * 14 }}>
    {nodes.map(n => (
      <div key={n.id} className="py-0.5">
        <button
          onClick={() => onSelect?.(n.id)}
          className={`text-left text-[11px] font-mono hover:underline ${
            n.kind === 'requirement' ? 'text-purple-400' : n.physical ? 'text-emerald-300' : 'text-[#ccc]'
          }`}
        >
          {n.kind === 'requirement' ? '◆ ' : n.physical ? '■ ' : '□ '}{n.name}
        </button>
        {n.children.length > 0 && (
          <StructureTree nodes={n.children} depth={depth + 1} onSelect={onSelect} />
        )}
      </div>
    ))}
  </div>
);

export const SmartShowPanel: React.FC<SmartShowPanelProps> = ({
  nodes,
  edges,
  simState,
  simRunning,
  onSelectProcess,
  onSelectElement,
}) => {
  const [tab, setTab] = useState<SmartTab>('structure');
  const [internalProcessId, setInternalProcessId] = useState<string | null>(null);

  const handleSelect = (id: string) => {
    if (onSelectElement) onSelectElement(id);
    else if (onSelectProcess) onSelectProcess(id);
  };

  const processes = useMemo(() => nodes.filter(n => n.data.type === 'process'), [nodes]);
  const structure = useMemo(() => deriveStructureView(nodes, edges), [nodes, edges]);
  const behavior = useMemo(() => deriveBehaviorView(nodes, edges), [nodes, edges]);
  const requirements = useMemo(() => deriveRequirementsView(nodes, edges), [nodes, edges]);
  const internal = useMemo(
    () => (internalProcessId ? deriveInternalView(nodes, edges, internalProcessId) : null),
    [nodes, edges, internalProcessId]
  );

  const tabs: { id: SmartTab; label: string; icon: React.ReactNode; hint: string }[] = [
    { id: 'structure', label: 'Structure', icon: <Boxes size={11} />, hint: 'replaces BDD' },
    { id: 'internal', label: 'Internal', icon: <Network size={11} />, hint: 'replaces IBD' },
    { id: 'behavior', label: 'Behavior', icon: <GitBranch size={11} />, hint: 'replaces State Machine' },
    { id: 'requirements', label: 'Requirements', icon: <ListChecks size={11} />, hint: 'replaces Req. diagram' },
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between border-b border-[#2d2d2d] pb-1.5">
        <span className="text-xs uppercase font-extrabold tracking-wider text-sky-400 flex items-center gap-1.5">
          <Activity size={12} /> Smart Show
        </span>
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${simRunning ? 'bg-green-950 text-green-400' : 'bg-[#222] text-[#777]'}`}>
          {simRunning ? `LIVE · t=${simState.tick}` : 'STATIC'}
        </span>
      </div>

      <div className="flex flex-wrap gap-1 py-1.5">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            title={t.hint}
            className={`px-1.5 py-0.5 text-[9px] rounded border transition-colors ${
              tab === t.id
                ? 'bg-sky-950/60 border-sky-500 text-sky-300'
                : 'border-[#333] text-[#888] hover:bg-[#222]'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar text-[11px]">
        {tab === 'structure' && (
          <div className="space-y-2">
            {structure.diagnostics && structure.diagnostics.length > 0 && (
              <div className="bg-red-950/40 border border-red-800/40 rounded p-1.5 space-y-1">
                <div className="flex items-center gap-1 text-[10px] font-bold text-red-400">
                  <AlertTriangle size={11} /> BDD Diagnostics ({structure.diagnostics.length})
                </div>
                {structure.diagnostics.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => d.elementId && handleSelect(d.elementId)}
                    className="block text-left text-[9px] font-mono text-red-300/90 hover:underline"
                  >
                    [{d.code}] {d.message}
                  </button>
                ))}
              </div>
            )}
            <StructureTree nodes={structure} onSelect={handleSelect} />
          </div>
        )}

        {tab === 'internal' && (
          <div className="space-y-2">
            <select
              value={internalProcessId ?? ''}
              onChange={(e) => setInternalProcessId(e.target.value || null)}
              className="w-full bg-[#0f0f0f] border border-[#333] rounded text-[10px] py-1 px-1.5 text-[#ccc]"
            >
              <option value="">— select process —</option>
              {processes.map(p => (
                <option key={p.id} value={p.id}>{p.data.name}</option>
              ))}
            </select>

            {internal && (
              <div className="space-y-2">
                {internal.unresolvedMappings && internal.unresolvedMappings.length > 0 && (
                  <div className="bg-amber-950/40 border border-amber-800/40 rounded p-1.5 space-y-1">
                    <div className="flex items-center gap-1 text-[10px] font-bold text-amber-400">
                      <AlertTriangle size={11} /> Unresolved Connector Mappings ({internal.unresolvedMappings.length})
                    </div>
                    {internal.unresolvedMappings.map((m, i) => (
                      <div key={i} className="text-[9px] font-mono text-amber-300/90">
                        {m.reason}
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[9px] uppercase font-bold text-[#777] mb-1">In</div>
                    {internal.inputs.map((p, i) => (
                      <button
                        key={i}
                        onClick={() => handleSelect(p.peerId)}
                        className="w-full text-left bg-[#1a1a1a] hover:bg-[#252525] rounded px-1.5 py-0.5 mb-0.5 font-mono text-[10px] transition-colors"
                      >
                        <span className="text-sky-400">{p.linkType}</span> ← {p.peerName}
                      </button>
                    ))}
                  </div>
                  <div>
                    <div className="text-[9px] uppercase font-bold text-[#777] mb-1">Out</div>
                    {internal.outputs.map((p, i) => (
                      <button
                        key={i}
                        onClick={() => handleSelect(p.peerId)}
                        className="w-full text-left bg-[#1a1a1a] hover:bg-[#252525] rounded px-1.5 py-0.5 mb-0.5 font-mono text-[10px] transition-colors"
                      >
                        <span className="text-emerald-400">{p.linkType}</span> → {p.peerName}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'behavior' && behavior.map(b => (
          <div key={b.objectId} className="mb-2">
            <button
              onClick={() => handleSelect(b.objectId)}
              className="text-[10px] font-bold text-orange-400 mb-0.5 hover:underline text-left block"
            >
              {b.objectName}
            </button>
            {b.transitions.length === 0 && <div className="text-[10px] text-[#555] pl-2">no transitions</div>}
            {b.transitions.map((t, i) => {
              const toName = t.toStateId ? nodes.find(n => n.id === t.toStateId)?.data.name : '∅';
              const fromName = t.fromStateId ? nodes.find(n => n.id === t.fromStateId)?.data.name : '•';
              const active = t.toStateId ? simState.objectActiveState[b.objectId] === t.toStateId : false;
              return (
                <button
                  key={i}
                  onClick={() => handleSelect(t.processId)}
                  className={`w-full text-left font-mono text-[10px] px-1.5 py-0.5 rounded mb-0.5 ${
                    active && simRunning ? 'bg-green-950/60 text-green-300' : 'bg-[#1a1a1a] text-[#bbb] hover:bg-[#222]'
                  }`}
                >
                  {fromName} →[{t.processName}]→ {toName}
                </button>
              );
            })}
          </div>
        ))}

        {tab === 'requirements' && (
          <div className="space-y-1.5">
            {requirements.length === 0 && (
              <div className="text-[10px] text-[#555]">No requirement nodes in the model.</div>
            )}
            {requirements.map(r => (
              <div key={r.requirementId} className="border border-[#2d2d2d] rounded p-1.5">
                <div className="flex items-center justify-between gap-1 mb-0.5">
                  <button
                    onClick={() => handleSelect(r.requirementId)}
                    className="text-[10px] font-bold text-purple-400 hover:underline text-left"
                  >
                    {r.requirementName}
                  </button>
                  <span
                    data-testid={`req-status-${r.requirementId}`}
                    className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.2 rounded border ${statusBadgeStyles[r.status]}`}
                  >
                    {r.status}
                  </span>
                </div>
                {r.requirementText && <div className="text-[10px] text-[#999] italic">{r.requirementText}</div>}
                <div className="text-[9px] text-[#777] mt-0.5">
                  {r.satisfiedBy.length > 0 ? (
                    <div className="flex flex-wrap gap-1 items-center">
                      <span>trace:</span>
                      {r.satisfiedBy.map(s => (
                        <button
                          key={s.id}
                          onClick={() => handleSelect(s.id)}
                          className="text-sky-300 hover:underline"
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  ) : (
                    '⚠ nothing satisfies this requirement yet'
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
