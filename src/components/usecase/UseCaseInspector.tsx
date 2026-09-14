import React, { useState } from 'react';
import { X, Info, Type, Tag, Layers, Plus, Trash2 } from 'lucide-react';
import { UseCaseNode, UseCaseRequirementTrace } from '../../types/usecase_types';

interface UseCaseInspectorProps {
  selectedNode: UseCaseNode | null;
  sysmlBlocks: any[];
  onUpdateNodeData: (nodeId: string, data: any) => void;
  onClose: () => void;
}

export const UseCaseInspector: React.FC<UseCaseInspectorProps> = ({
  selectedNode,
  sysmlBlocks,
  onUpdateNodeData,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'properties' | 'architecture' | 'traceability'>('properties');
  const [newExtensionPoint, setNewExtensionPoint] = useState('');

  if (!selectedNode) return null;

  const data = selectedNode.data;
  const canonicalBlocks = sysmlBlocks.filter((b) => b.stereotype !== 'requirement');
  const canonicalReqs = sysmlBlocks.filter((b) => b.stereotype === 'requirement');

  const traces: UseCaseRequirementTrace[] = data.requirementTraces || [];

  const handleAddTrace = (requirementId: string, relationType: 'refine' | 'satisfy' | 'trace' | 'verify') => {
    if (!requirementId || traces.some((t) => t.requirementId === requirementId)) return;
    const updated = [...traces, { requirementId, relationType }];
    onUpdateNodeData(selectedNode.id, { ...data, requirementTraces: updated });
  };

  const handleRemoveTrace = (requirementId: string) => {
    const updated = traces.filter((t) => t.requirementId !== requirementId);
    onUpdateNodeData(selectedNode.id, { ...data, requirementTraces: updated });
  };

  const handleAddExtensionPoint = () => {
    if (!newExtensionPoint.trim()) return;
    const existing = data.extensionPoints || [];
    onUpdateNodeData(selectedNode.id, { ...data, extensionPoints: [...existing, newExtensionPoint.trim()] });
    setNewExtensionPoint('');
  };

  return (
    <div className="w-84 h-full bg-[#18181b] border-l border-[#333] flex flex-col text-xs text-zinc-200 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#333] bg-[#202023]">
        <div className="flex items-center gap-2">
          <Info size={15} className="text-amber-400" />
          <span className="font-semibold text-zinc-100">SysML Inspector</span>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-[#333] rounded text-zinc-400 hover:text-white">
          <X size={15} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#333] bg-[#1a1a1c]">
        {(['properties', 'architecture', 'traceability'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-center font-medium transition-colors ${
              activeTab === tab
                ? 'text-amber-400 border-b-2 border-amber-400 bg-amber-400/5'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {tab === 'architecture' ? 'SysML Architecture' : tab === 'properties' ? 'Properties' : 'Traceability'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'properties' && (
          <>
            <div className="space-y-1.5">
              <label className="text-zinc-400 flex items-center gap-1.5">
                <Type size={12} /> Name
              </label>
              <input
                type="text"
                value={data.label || ''}
                onChange={(e) => onUpdateNodeData(selectedNode.id, { ...data, label: e.target.value })}
                className="w-full bg-[#27272a] border border-[#3f3f46] rounded px-2.5 py-1.5 text-zinc-100 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-zinc-400 flex items-center gap-1.5">
                <Tag size={12} /> Stereotype
              </label>
              <div className="px-2.5 py-1.5 bg-[#27272a] border border-[#3f3f46] rounded text-amber-400 font-mono">
                «{selectedNode.type}»
              </div>
            </div>

            {selectedNode.type === 'useCase' && (
              <div className="space-y-2 pt-2 border-t border-[#333]">
                <label className="text-zinc-400 font-medium">Extension Points</label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={newExtensionPoint}
                    onChange={(e) => setNewExtensionPoint(e.target.value)}
                    placeholder="e.g. OnObstacleDetected"
                    className="flex-1 bg-[#27272a] border border-[#3f3f46] rounded px-2 py-1 text-zinc-100 focus:border-amber-500 focus:outline-none"
                  />
                  <button
                    onClick={handleAddExtensionPoint}
                    className="px-2 py-1 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 rounded"
                  >
                    <Plus size={13} />
                  </button>
                </div>

                <div className="space-y-1 mt-2">
                  {(data.extensionPoints || []).map((ep, idx) => (
                    <div key={idx} className="flex items-center justify-between bg-[#202023] px-2 py-1 rounded border border-[#333]">
                      <span className="text-zinc-300 font-mono">{ep}</span>
                      <button
                        onClick={() => {
                          const updated = (data.extensionPoints || []).filter((_, i) => i !== idx);
                          onUpdateNodeData(selectedNode.id, { ...data, extensionPoints: updated });
                        }}
                        className="text-zinc-500 hover:text-red-400"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'architecture' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-zinc-400 flex items-center gap-1.5">
                <Layers size={12} /> Subject Block (System Realization)
              </label>
              <select
                value={data.subjectBlockId || ''}
                onChange={(e) => onUpdateNodeData(selectedNode.id, { ...data, subjectBlockId: e.target.value })}
                className="w-full bg-[#27272a] border border-[#3f3f46] rounded px-2.5 py-1.5 text-zinc-100 focus:border-amber-500 focus:outline-none"
              >
                <option value="">-- None (Standalone) --</option>
                {canonicalBlocks.map((block) => (
                  <option key={block.id} value={block.id}>
                    {block.name} (ID: {block.id})
                  </option>
                ))}
              </select>
              <p className="text-[10px] text-zinc-500">
                Maps this use-case or boundary to its realizing SysML Block in BDD / IBD.
              </p>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-[#333]">
              <label className="text-zinc-400 flex items-center gap-1.5">
                Elaborating Behavior Diagram
              </label>
              <input
                type="text"
                placeholder="e.g. act-engine-start"
                value={data.elaboratingDiagramId || ''}
                onChange={(e) => onUpdateNodeData(selectedNode.id, { ...data, elaboratingDiagramId: e.target.value })}
                className="w-full bg-[#27272a] border border-[#3f3f46] rounded px-2.5 py-1.5 text-zinc-100 focus:border-amber-500 focus:outline-none"
              />
              <p className="text-[10px] text-zinc-500">
                Associates an Activity or Sequence diagram detailing this use case's internal interaction scenario.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'traceability' && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-zinc-400 font-medium">Add Requirement Link</label>
              <select
                onChange={(e) => {
                  if (e.target.value) handleAddTrace(e.target.value, 'refine');
                  e.target.value = '';
                }}
                className="w-full bg-[#27272a] border border-[#3f3f46] rounded px-2.5 py-1.5 text-zinc-100 focus:border-amber-500 focus:outline-none"
              >
                <option value="">-- Select Requirement to Trace --</option>
                {canonicalReqs.map((req) => (
                  <option key={req.id} value={req.id}>
                    {req.id} - {req.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <span className="text-zinc-400 font-medium">Traceability Matrix</span>
              {traces.length === 0 ? (
                <div className="text-[11px] text-zinc-500 italic p-3 bg-[#202023] rounded border border-[#333] text-center">
                  No requirement links established yet.
                </div>
              ) : (
                traces.map((trace) => {
                  const req = canonicalReqs.find((r) => r.id === trace.requirementId);
                  return (
                    <div key={trace.requirementId} className="bg-[#202023] p-2.5 rounded border border-[#333] space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-amber-400 font-mono">{trace.requirementId}</span>
                        <button onClick={() => handleRemoveTrace(trace.requirementId)} className="text-zinc-500 hover:text-red-400">
                          <Trash2 size={12} />
                        </button>
                      </div>
                      <div className="text-zinc-300 text-[11px]">{req?.name || 'Requirement'}</div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-zinc-500">Relation:</span>
                        <select
                          value={trace.relationType}
                          onChange={(e) => {
                            const updated = traces.map((t) =>
                              t.requirementId === trace.requirementId
                                ? { ...t, relationType: e.target.value as any }
                                : t
                            );
                            onUpdateNodeData(selectedNode.id, { ...data, requirementTraces: updated });
                          }}
                          className="bg-[#27272a] text-[10px] text-amber-300 border border-[#3f3f46] rounded px-1 py-0.5"
                        >
                          <option value="refine">«refine»</option>
                          <option value="satisfy">«satisfy»</option>
                          <option value="verify">«verify»</option>
                          <option value="trace">«trace»</option>
                        </select>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
