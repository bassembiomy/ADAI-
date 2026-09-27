import React, { useState, useMemo } from 'react';
import { Link2, Trash2, ShieldCheck, AlertCircle } from 'lucide-react';
import type { SysmlRepository } from '../../engine/sysml/model';
import {
  getSemanticPresentationStatusMeta,
  semanticPresentationToken,
} from '../../engine/sysml/semanticPresentationStyles';

export interface StateRequirementTraceabilityProps {
  stateId: string;
  stateName: string;
  canonicalRepository: SysmlRepository;
  onLinkRequirement: (requirementId: string, kind: 'satisfy' | 'trace' | 'refine' | 'verify') => void;
  onUnlinkRelationship: (relationshipId: string) => void;
}

const TRACE_LINK_KINDS = ['satisfy', 'trace', 'refine', 'verify'] as const;

export const StateRequirementTraceability: React.FC<StateRequirementTraceabilityProps> = ({
  stateId,
  stateName,
  canonicalRepository,
  onLinkRequirement,
  onUnlinkRelationship,
}) => {
  const [selectedReqId, setSelectedReqId] = useState<string>('');
  const [selectedKind, setSelectedKind] = useState<'satisfy' | 'trace' | 'refine' | 'verify'>('satisfy');

  // Task 6: traceability presentation resolves from the centralized semantic
  // palette (spec 3.5, 4.4). Committed requirement relationships project with
  // the approved requirement-relationship token; the «kind» text is always
  // rendered so the relationship kind is never conveyed by color alone.
  const relationshipToken = semanticPresentationToken('validRequirementRelationship');
  const stateToken = semanticPresentationToken('state');
  const selectionToken = semanticPresentationToken('selection');
  const warningMeta = getSemanticPresentationStatusMeta('warning');
  const errorMeta = getSemanticPresentationStatusMeta('error');

  // Find all requirements in repository
  const allRequirements = useMemo(() => {
    return Object.values(canonicalRepository.requirements || {});
  }, [canonicalRepository.requirements]);

  // Find relationships connecting this state to a requirement
  const stateLinks = useMemo(() => {
    const relationships = Object.values(canonicalRepository.relationships || {});
    const reqMap = canonicalRepository.requirements || {};
    const links: Array<{
      relationshipId: string;
      requirementId: string;
      requirementName: string;
      requirementStatus?: string;
      kind: 'satisfy' | 'trace' | 'refine' | 'verify';
    }> = [];

    for (const rel of relationships) {
      if (TRACE_LINK_KINDS.includes(rel.kind as (typeof TRACE_LINK_KINDS)[number])) {
        if (rel.sourceId === stateId && reqMap[rel.targetId]) {
          const req = reqMap[rel.targetId];
          links.push({
            relationshipId: rel.id,
            requirementId: req.id,
            requirementName: req.name || req.id,
            requirementStatus: req.status,
            kind: rel.kind as 'satisfy' | 'trace' | 'refine' | 'verify',
          });
        } else if (rel.targetId === stateId && reqMap[rel.sourceId]) {
          const req = reqMap[rel.sourceId];
          links.push({
            relationshipId: rel.id,
            requirementId: req.id,
            requirementName: req.name || req.id,
            requirementStatus: req.status,
            kind: rel.kind as 'satisfy' | 'trace' | 'refine' | 'verify',
          });
        }
      }
    }
    return links;
  }, [canonicalRepository.relationships, canonicalRepository.requirements, stateId]);

  // Trace-kind relationships touching this state whose requirement endpoint
  // is missing from the repository: an integrity error surfaced with the
  // error token paired with icon + text (spec 7), never color alone.
  const danglingLinks = useMemo(() => {
    const relationships = Object.values(canonicalRepository.relationships || {});
    const reqMap = canonicalRepository.requirements || {};
    return relationships.filter(
      (rel) =>
        TRACE_LINK_KINDS.includes(rel.kind as (typeof TRACE_LINK_KINDS)[number]) &&
        ((rel.sourceId === stateId && !reqMap[rel.targetId]) ||
          (rel.targetId === stateId && !reqMap[rel.sourceId])),
    );
  }, [canonicalRepository.relationships, canonicalRepository.requirements, stateId]);

  // Requirements that are not already linked to this state
  const unlinkedRequirements = useMemo(() => {
    const linkedIds = new Set(stateLinks.map(link => link.requirementId));
    return allRequirements.filter(req => !linkedIds.has(req.id));
  }, [allRequirements, stateLinks]);

  const handleAddLink = () => {
    if (!selectedReqId) return;
    onLinkRequirement(selectedReqId, selectedKind);
    setSelectedReqId('');
  };

  return (
    <div className="border border-[#2a2a2a] bg-[#141414] rounded-lg p-3 my-2 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" style={{ color: stateToken }} aria-hidden="true" />
          <span className="text-xs font-semibold text-[#e0e0e0]">Requirement Traceability</span>
        </div>
        <span className="text-[10px] bg-[#222] text-[#888] px-2 py-0.5 rounded-full border border-[#333]">
          {stateLinks.length} {stateLinks.length === 1 ? 'link' : 'links'}
        </span>
      </div>

      {/* Existing Links List */}
      <div className="space-y-1.5">
        {stateLinks.length === 0 ? (
          <p className="text-[11px] text-[#666] italic py-1">
            No requirements linked to state &ldquo;{stateName}&rdquo;.
          </p>
        ) : (
          stateLinks.map(link => {
            return (
              <div
                key={link.relationshipId}
                className="flex items-center justify-between p-2 rounded bg-[#1c1c1c] border border-[#2e2e2e] text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded border font-mono font-medium bg-transparent"
                    style={{ borderColor: relationshipToken, color: relationshipToken }}
                  >
                    &laquo;{link.kind}&raquo;
                  </span>
                  <div className="truncate">
                    <span className="text-[#ddd] font-medium block truncate" title={link.requirementName}>
                      {link.requirementName}
                    </span>
                    {link.requirementStatus && (
                      <span className="text-[10px] text-[#777]">
                        Status: {link.requirementStatus}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onUnlinkRelationship(link.relationshipId)}
                  className="text-[#666] hover:text-red-400 p-1 rounded transition-colors shrink-0"
                  title={`Unlink ${link.requirementName}`}
                  aria-label={`Unlink ${link.requirementName}`}
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            );
          })
        )}
        {danglingLinks.length > 0 && (
          <div
            role="alert"
            aria-label={`Error: ${danglingLinks.length} traceability link${danglingLinks.length === 1 ? '' : 's'} for state ${stateName} reference${danglingLinks.length === 1 ? 's' : ''} a missing requirement`}
            className="flex items-start gap-2 p-2 rounded border bg-transparent text-xs"
            style={{ borderColor: errorMeta?.token, color: errorMeta?.token }}
          >
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              <span className="font-semibold">{errorMeta?.label ?? 'Error'}: </span>
              {danglingLinks.length} traceability link{danglingLinks.length === 1 ? '' : 's'} for
              state &ldquo;{stateName}&rdquo; reference{danglingLinks.length === 1 ? 's' : ''} a
              missing requirement.
            </span>
          </div>
        )}
      </div>

      {/* Add New Link Section */}
      <div className="pt-2 border-t border-[#222] space-y-2">
        <div className="text-[11px] font-medium text-[#999]">Add Trace Link:</div>
        {allRequirements.length === 0 ? (
          <p
            role="status"
            aria-label="Warning: no requirements exist in the repository"
            className="flex items-start gap-2 text-[11px] italic py-1"
            style={{ color: warningMeta?.token }}
          >
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              <span className="font-semibold not-italic">{warningMeta?.label ?? 'Warning'}: </span>
              No requirements exist in repository. Add requirements in the Requirements Diagram first.
            </span>
          </p>
        ) : (
          <div className="space-y-2">
            <div>
              <label htmlFor="req-select" className="sr-only">Select Requirement</label>
              <select
                id="req-select"
                aria-label="Select Requirement"
                value={selectedReqId}
                onChange={(e) => setSelectedReqId(e.target.value)}
                className="w-full bg-[#1e1e1e] border border-[#333] rounded px-2 py-1.5 text-xs text-[#e0e0e0] focus:outline-none focus:border-orange-500"
              >
                <option value="">-- Choose Requirement --</option>
                {unlinkedRequirements.map(req => (
                  <option key={req.id} value={req.id}>
                    {req.name || req.id} ({req.status || 'Draft'})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2">
              <div className="flex-1">
                <label htmlFor="kind-select" className="sr-only">Relationship Kind</label>
                <select
                  id="kind-select"
                  aria-label="Relationship Kind"
                  value={selectedKind}
                  onChange={(e) => setSelectedKind(e.target.value as never)}
                  className="w-full bg-[#1e1e1e] border border-[#333] rounded px-2 py-1.5 text-xs text-[#e0e0e0] focus:outline-none focus:border-orange-500"
                >
                  <option value="satisfy">&laquo;satisfy&raquo;</option>
                  <option value="trace">&laquo;trace&raquo;</option>
                  <option value="refine">&laquo;refine&raquo;</option>
                  <option value="verify">&laquo;verify&raquo;</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleAddLink}
                disabled={!selectedReqId}
                className="px-3 py-1.5 disabled:bg-[#2a2a2a] disabled:text-[#555] text-white text-xs font-medium rounded transition-colors flex items-center gap-1"
                style={{ backgroundColor: selectionToken }}
              >
                <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                Add Trace Link
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
