import React, { useState } from 'react';
import { Link2, X, Search, Check, ArrowRight } from 'lucide-react';
import type { ModelTreeNode } from '../../features/modelExplorer/modelExplorerTypes';
import { getNodeKindIcon } from './ModelTreeRow';

export interface RelationshipWizardProps {
  isOpen?: boolean;
  sourceNode: ModelTreeNode;
  candidateTargetNodes?: ModelTreeNode[];
  targetCandidates?: ModelTreeNode[];
  allowedRelationshipKinds?: string[];
  onClose: () => void;
  onSubmit?: ((params: {
    sourceId: string;
    targetId: string;
    relationshipKind: string;
    name?: string;
  }) => void) | ((kind: string, targetSemanticId: string) => void);
  onCreateRelationship?: ((params: {
    sourceId: string;
    targetId: string;
    relationshipKind: string;
    name?: string;
  }) => void) | ((kind: string, targetSemanticId: string) => void);
  className?: string;
}

const SYSML_RELATIONSHIP_KINDS = [
  { id: 'generalization', label: 'Generalization («generalize»)' },
  { id: 'composition', label: 'Composition (Whole-Part)' },
  { id: 'aggregation', label: 'Shared Aggregation' },
  { id: 'association', label: 'Association' },
  { id: 'satisfy', label: 'Satisfy Requirement («satisfy»)' },
  { id: 'verify', label: 'Verify Requirement («verify»)' },
  { id: 'refine', label: 'Refine Requirement («refine»)' },
  { id: 'deriveReqt', label: 'Derive Requirement («deriveReqt»)' },
  { id: 'trace', label: 'Trace («trace»)' },
];

const STATE_MACHINE_RELATIONSHIP_KINDS = [
  { id: 'transition', label: 'Transition (State to State)' },
];

export const RelationshipWizard: React.FC<RelationshipWizardProps> = ({
  isOpen = true,
  sourceNode,
  candidateTargetNodes,
  targetCandidates,
  allowedRelationshipKinds: explicitKinds,
  onClose,
  onSubmit,
  onCreateRelationship,
  className = '',
}) => {
  if (isOpen === false) return null;

  const candidates = candidateTargetNodes ?? targetCandidates ?? [];
  const isStateMachine = sourceNode.domain === 'stateMachine';
  const defaultKinds = isStateMachine
    ? STATE_MACHINE_RELATIONSHIP_KINDS.map(k => k.id)
    : SYSML_RELATIONSHIP_KINDS.map(k => k.id);
  const allowedRelationshipKinds = explicitKinds ?? defaultKinds;

  const [selectedKind, setSelectedKind] = useState<string>(allowedRelationshipKinds[0] || 'association');
  const [selectedTargetId, setSelectedTargetId] = useState<string>(
    candidates[0]?.semanticId || ''
  );
  const [relationshipName, setRelationshipName] = useState<string>('');
  const [searchTargetQuery, setSearchTargetQuery] = useState<string>('');

  const filteredCandidates = candidates.filter(c =>
    c.semanticId !== sourceNode.semanticId &&
    (c.label.toLowerCase().includes(searchTargetQuery.toLowerCase()) ||
     (c.secondaryLabel && c.secondaryLabel.toLowerCase().includes(searchTargetQuery.toLowerCase())))
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTargetId || !selectedKind) return;

    if (onCreateRelationship) {
      if ((onCreateRelationship as any).length >= 2) {
        (onCreateRelationship as any)(selectedKind, selectedTargetId);
      } else {
        (onCreateRelationship as any)({
          sourceId: sourceNode.semanticId,
          targetId: selectedTargetId,
          relationshipKind: selectedKind,
          name: relationshipName.trim() || undefined,
        });
      }
    } else if (onSubmit) {
      if ((onSubmit as any).length >= 2) {
        (onSubmit as any)(selectedKind, selectedTargetId);
      } else {
        (onSubmit as any)({
          sourceId: sourceNode.semanticId,
          targetId: selectedTargetId,
          relationshipKind: selectedKind,
          name: relationshipName.trim() || undefined,
        });
      }
    }
    onClose();
  };

  const getRelationshipKindLabel = (id: string): string => {
    const list = isStateMachine ? STATE_MACHINE_RELATIONSHIP_KINDS : SYSML_RELATIONSHIP_KINDS;
    const match = list.find(k => k.id === id);
    return match ? match.label : id;
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="relationship-wizard-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
    >
      <div
        className={`bg-[var(--surface-panel)] border border-[var(--border-default)] rounded-lg shadow-2xl w-full max-w-lg overflow-hidden flex flex-col text-xs text-[var(--text-primary)] ${className}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-[var(--surface-canvas)] border-b border-[var(--border-default)]">
          <div className="flex items-center gap-2">
            <Link2 size={16} className="text-amber-400" />
            <span id="relationship-wizard-title" className="font-semibold text-sm text-[var(--text-primary)]">
              Create Relationship
            </span>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-raised)] transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Source info */}
        <div className="px-4 py-2.5 bg-[var(--surface-canvas)] border-b border-[var(--border-default)] flex items-center gap-2">
          <span className="text-[var(--text-muted)]">Source:</span>
          <div className="flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
            {getNodeKindIcon(sourceNode.kind, sourceNode.domain)}
            <span>{sourceNode.label}</span>
            <span className="text-[10px] text-[var(--text-muted)] font-mono uppercase bg-[var(--surface-raised)] border border-[var(--border-default)] px-1 py-0.5 rounded">
              {sourceNode.kind}
            </span>
          </div>
          <ArrowRight size={13} className="text-[var(--text-muted)] mx-1" />
          <span className="text-[var(--text-muted)]">Target</span>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-4">
          {/* Relationship Kind selection */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[var(--text-secondary)] font-medium">Relationship Kind</label>
            <div className="grid grid-cols-2 gap-1.5 max-h-36 overflow-y-auto p-1 bg-[var(--surface-canvas)] rounded border border-[var(--border-default)]">
              {allowedRelationshipKinds.map(kind => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => setSelectedKind(kind)}
                  className={`flex items-center justify-between px-2.5 py-1.5 rounded text-left transition-colors text-[11px] ${
                    selectedKind === kind
                      ? 'bg-[var(--diagram-node-selected)] text-white font-medium'
                      : 'text-[var(--text-primary)] hover:bg-[var(--surface-raised)]'
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
              <label className="text-[var(--text-secondary)] font-medium">Target Element</label>
              <span className="text-[10px] text-[var(--text-muted)]">
                {filteredCandidates.length} available
              </span>
            </div>

            {/* Target Filter Search */}
            <div className="relative flex items-center">
              <Search size={12} className="absolute left-2.5 text-[var(--text-muted)] pointer-events-none" />
              <input
                type="text"
                value={searchTargetQuery}
                onChange={e => setSearchTargetQuery(e.target.value)}
                placeholder="Search target elements..."
                className="w-full bg-[var(--surface-canvas)] text-[var(--text-primary)] pl-7 pr-3 py-1 rounded border border-[var(--border-default)] text-[11px] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--focus-ring)]"
              />
            </div>

            <div className="max-h-44 overflow-y-auto divide-y divide-[var(--border-default)] bg-[var(--surface-canvas)] rounded border border-[var(--border-default)]">
              {filteredCandidates.length === 0 ? (
                <div className="p-3 text-center text-[var(--text-muted)] text-xs">
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
                        ? 'bg-[var(--diagram-node-selected)] text-white'
                        : 'text-[var(--text-primary)] hover:bg-[var(--surface-raised)]'
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
            <label className="text-[var(--text-secondary)] font-medium">Name (optional)</label>
            <input
              type="text"
              value={relationshipName}
              onChange={e => setRelationshipName(e.target.value)}
              placeholder="e.g. driveShaftConnection"
              className="w-full bg-[var(--surface-canvas)] text-[var(--text-primary)] px-2.5 py-1.5 rounded border border-[var(--border-default)] text-xs placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--focus-ring)]"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-default)]">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded bg-[var(--surface-raised)] text-[var(--text-primary)] border border-[var(--border-default)] hover:bg-[var(--surface-canvas)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!selectedKind || !selectedTargetId}
              className="px-3.5 py-1.5 rounded bg-[var(--diagram-node-selected)] text-white font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
