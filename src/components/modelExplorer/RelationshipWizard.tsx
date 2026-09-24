import React, { useState, useMemo } from 'react';
import { Link2, Search, X, Check, ArrowRight } from 'lucide-react';
import type { ModelTreeNode } from '../../features/modelExplorer/modelExplorerTypes';
import { getRelationshipKindLabel } from '../../features/modelExplorer/modelExplorerCapabilities';
import { getNodeKindIcon } from './ModelTreeRow';

export interface RelationshipWizardProps {
  isOpen: boolean;
  sourceNode: ModelTreeNode;
  targetCandidates: ModelTreeNode[];
  allowedRelationshipKinds: string[];
  onClose: () => void;
  onCreateRelationship: (kind: string, targetSemanticId: string, name?: string) => void;
  className?: string;
}

export const RelationshipWizard: React.FC<RelationshipWizardProps> = ({
  isOpen,
  sourceNode,
  targetCandidates,
  allowedRelationshipKinds,
  onClose,
  onCreateRelationship,
  className = '',
}) => {
  if (!isOpen) return null;

  const [selectedKind, setSelectedKind] = useState<string>(
    allowedRelationshipKinds[0] || 'association'
  );
  const [selectedTargetId, setSelectedTargetId] = useState<string>(
    targetCandidates[0]?.semanticId || ''
  );
  const [relationshipName, setRelationshipName] = useState<string>('');
  const [searchTargetQuery, setSearchTargetQuery] = useState<string>('');

  const filteredCandidates = useMemo(() => {
    const q = searchTargetQuery.trim().toLowerCase();
    if (!q) return targetCandidates;
    return targetCandidates.filter(
      c =>
        c.label.toLowerCase().includes(q) ||
        (c.secondaryLabel && c.secondaryLabel.toLowerCase().includes(q)) ||
        c.kind.toLowerCase().includes(q)
    );
  }, [targetCandidates, searchTargetQuery]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedKind || !selectedTargetId) return;
    onCreateRelationship(
      selectedKind,
      selectedTargetId,
      relationshipName.trim() || undefined
    );
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="relationship-wizard-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
    >
      <div
        className={`bg-slate-900 border border-slate-700 rounded-lg shadow-2xl w-full max-w-lg overflow-hidden flex flex-col text-xs text-slate-200 ${className}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Link2 size={16} className="text-amber-400" />
            <span id="relationship-wizard-title" className="font-semibold text-sm text-slate-100">
              Create Relationship
            </span>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Source info */}
        <div className="px-4 py-2.5 bg-slate-900/60 border-b border-slate-800 flex items-center gap-2">
          <span className="text-slate-400">Source:</span>
          <div className="flex items-center gap-1.5 font-medium text-slate-200">
            {getNodeKindIcon(sourceNode.kind, sourceNode.domain)}
            <span>{sourceNode.label}</span>
            <span className="text-[10px] text-slate-400 font-mono uppercase bg-slate-800 px-1 py-0.5 rounded">
              {sourceNode.kind}
            </span>
          </div>
          <ArrowRight size={13} className="text-slate-500 mx-1" />
          <span className="text-slate-400">Target</span>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-4">
          {/* Relationship Kind selection */}
          <div className="flex flex-col gap-1.5">
            <label className="text-slate-300 font-medium">Relationship Kind</label>
            <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto p-1 bg-slate-950/60 rounded border border-slate-800">
              {allowedRelationshipKinds.map(kind => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setSelectedKind(kind)}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded text-left transition-colors text-[11px] ${
                    selectedKind === kind
                      ? 'bg-blue-600 text-white font-medium'
                      : 'text-slate-300 hover:bg-slate-800/70'
                  }`}
                >
                  <span className="truncate">{getRelationshipKindLabel(kind)}</span>
                  {selectedKind === kind && <Check size={12} className="shrink-0 ml-1" />}
                </button>
              ))}
            </div>
          </div>

          {/* Target Element Candidate selection */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-slate-300 font-medium">Target Element</label>
              <span className="text-[10px] text-slate-400">
                {filteredCandidates.length} available
              </span>
            </div>

            {/* Target Filter Search */}
            <div className="relative flex items-center">
              <Search size={12} className="absolute left-2.5 text-slate-500 pointer-events-none" />
              <input
                type="text"
                value={searchTargetQuery}
                onChange={e => setSearchTargetQuery(e.target.value)}
                placeholder="Search target elements..."
                className="w-full bg-slate-950 text-slate-200 pl-7 pr-3 py-1 rounded border border-slate-800 text-[11px] placeholder:text-slate-500 focus:outline-none focus:border-blue-500/60"
              />
            </div>

            <div className="max-h-44 overflow-y-auto divide-y divide-slate-800/60 bg-slate-950/60 rounded border border-slate-800">
              {filteredCandidates.length === 0 ? (
                <div className="p-3 text-center text-slate-500 text-xs">
                  No matching target elements
                </div>
              ) : (
                filteredCandidates.map(candidate => (
                  <button
                    key={candidate.semanticId}
                    type="button"
                    onClick={() => setSelectedTargetId(candidate.semanticId)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 text-left transition-colors ${
                      selectedTargetId === candidate.semanticId
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-200 hover:bg-slate-800/70'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {getNodeKindIcon(candidate.kind, candidate.domain)}
                      <span className="truncate font-medium">{candidate.label}</span>
                      {candidate.secondaryLabel && (
                        <span className="text-[10px] opacity-70 truncate">
                          {candidate.secondaryLabel}
                        </span>
                      )}
                    </div>
                    {selectedTargetId === candidate.semanticId && (
                      <Check size={13} className="shrink-0 ml-1.5" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Optional Name */}
          <div className="flex flex-col gap-1">
            <label className="text-slate-300 font-medium">Name (optional)</label>
            <input
              type="text"
              value={relationshipName}
              onChange={e => setRelationshipName(e.target.value)}
              placeholder="e.g. driveShaftConnection"
              className="w-full bg-slate-950 text-slate-200 px-2.5 py-1.5 rounded border border-slate-800 text-xs placeholder:text-slate-500 focus:outline-none focus:border-blue-500/60"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedKind || !selectedTargetId}
              className="px-3.5 py-1.5 rounded bg-blue-600 text-white font-medium hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
