import React, { useMemo, useState } from 'react';
import {
  deriveStructureView,
  deriveBehaviorView,
  deriveRequirementsView,
  deriveInternalView,
  OpmStructureNode,
} from './OpmViewDeriver';
import type { OpmSimulationState } from './OpmSimulationEngine';
import type { AppNode, AppEdge } from './EntropyTypes';
import { Boxes, Network, ListChecks, GitBranch, Activity } from 'lucide-react';

type SmartTab = 'structure' | 'internal' | 'behavior' | 'requirements';

interface SmartShowPanelProps {
  nodes: AppNode[];
  edges: AppEdge[];
  simState: OpmSimulationState;
  simRunning: boolean;
  onSelectProcess?: (processId: string) => void;
}

const StructureTree: React.FC<{ nodes: OpmStructureNode[]; depth?: number }> = ({ nodes, depth = 0 }) => (
  <div style={{ paddingLeft: depth * 14 }}>
    {nodes.map(n => (
      <div key={n.id} className="py-0.5">
        <span className={`text-[11px] font-mono ${n.kind === 'requirement' ? 'text-purple-400' : n.physical ? 'text-emerald-300' : 'text-[#ccc]'}`}>
          {n.kind === 'requirement' ? '◆ ' : n.physical ? '■ ' : '□ '}{n.name}
        </span>
        {n.children.length > 0 && <StructureTree nodes={n.children} depth={depth + 1} />}
      </div>
    ))}
  </div>
);

export const SmartShowPanel: React.FC<SmartShowPanelProps> = ({ nodes, edges, simState, simRunning, onSelectProcess }) => {
  const [tab, setTab] = useState<SmartTab>('structure');
  const [internalProcessId, setInternalProcessId] = useState<string | null>(null);

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
        {tab === 'structure' && <StructureTree nodes={structure} />}

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
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[9px] uppercase font-bold text-[#777] mb-1">In</div>
                  {internal.inputs.map((p, i) => (
                    <div key={i} className="bg-[#1a1a1a] rounded px-1.5 py-0.5 mb-0.5 font-mono text-[10px]">
                      <span className="text-sky-400">{p.linkType}</span> ← {p.peerName}
                    </div>
                  ))}
                </div>
                <div>
                  <div className="text-[9px] uppercase font-bold text-[#777] mb-1">Out</div>
                  {internal.outputs.map((p, i) => (
                    <div key={i} className="bg-[#1a1a1a] rounded px-1.5 py-0.5 mb-0.5 font-mono text-[10px]">
                      <span className="text-emerald-400">{p.linkType}</span> → {p.peerName}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'behavior' && behavior.map(b => (
          <div key={b.objectId} className="mb-2">
            <div className="text-[10px] font-bold text-orange-400 mb-0.5">{b.objectName}</div>
            {b.transitions.length === 0 && <div className="text-[10px] text-[#555] pl-2">no transitions</div>}
            {b.transitions.map((t, i) => {
              const toName = t.toStateId ? nodes.find(n => n.id === t.toStateId)?.data.name : '∅';
              const fromName = t.fromStateId ? nodes.find(n => n.id === t.fromStateId)?.data.name : '•';
              const active = t.toStateId ? simState.objectActiveState[b.objectId] === t.toStateId : false;
              return (
                <button
                  key={i}
                  onClick={() => onSelectProcess?.(t.processId)}
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
                <div className="text-[10px] font-bold text-purple-400">{r.requirementName}</div>
                {r.requirementText && <div className="text-[10px] text-[#999] italic">{r.requirementText}</div>}
                <div className="text-[9px] text-[#777] mt-0.5">
                  {r.satisfiedBy.length > 0
                    ? `satisfied by: ${r.satisfiedBy.map(s => s.name).join(', ')}`
                    : '⚠ nothing satisfies this requirement yet'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
