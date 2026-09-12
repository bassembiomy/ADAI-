import React, { useState } from 'react';
import type { ModelBaseline, RequirementDefinition, SysmlRelationship, VerificationEvidence } from '../../engine/sysml/model';
import type { ImpactSeverity } from '../../engine/sysml/mutations';

export interface RequirementGovernancePanelProps {
  requirement: RequirementDefinition;
  masterRequirement?: RequirementDefinition;
  baselines: Record<string, ModelBaseline>;
  suspectLinks?: SysmlRelationship[];
  evidenceHistory?: VerificationEvidence[];
  deletionSeverity?: ImpactSeverity;
  unresolvedUsageIds?: string[];
  invalidatedEvidenceIds?: string[];
  blockedBaselineIds?: string[];
  onCreateBaseline?: (name: string) => void;
  onCloneBaseline?: (baselineId: string) => void;
  onAuthorizeBaseline?: (baselineId: string) => void;
  onClearSuspect?: (relationshipId: string) => void;
  onSyncFromMaster?: () => void;
}

export function RequirementGovernancePanel({
  requirement,
  masterRequirement,
  baselines,
  suspectLinks = [],
  evidenceHistory = [],
  deletionSeverity,
  unresolvedUsageIds = [],
  invalidatedEvidenceIds = [],
  blockedBaselineIds = [],
  onCreateBaseline,
  onCloneBaseline,
  onAuthorizeBaseline,
  onClearSuspect,
  onSyncFromMaster,
}: RequirementGovernancePanelProps) {
  const [newBaselineName, setNewBaselineName] = useState('');
  const [showNewBaseline, setShowNewBaseline] = useState(false);

  const baselineList = Object.values(baselines);
  const currentBaseline = requirement.baselineId ? baselines[requirement.baselineId] : undefined;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBaselineName.trim() || !onCreateBaseline) return;
    onCreateBaseline(newBaselineName.trim());
    setNewBaselineName('');
    setShowNewBaseline(false);
  };

  const copyDiffs: { field: string; from: any; to: any }[] = [];
  if (masterRequirement) {
    const fields: Array<keyof RequirementDefinition> = ['text', 'priority', 'risk', 'name', 'version'];
    for (const f of fields) {
      if (requirement[f] !== masterRequirement[f] && masterRequirement[f] !== undefined) {
        copyDiffs.push({ field: f, from: requirement[f], to: masterRequirement[f] });
      }
    }
  }

  return (
    <div className="space-y-4 text-xs" aria-label="Requirement Governance Panel">
      <div className="border-b border-gray-700 pb-2">
        <h3 className="text-sm font-semibold text-gray-200">Requirement Governance</h3>
        <p className="text-[11px] text-gray-400">Baseline control, suspect traceability, copy synchronization, and evidence.</p>
      </div>

      {/* Baseline Section */}
      <fieldset className="rounded border border-gray-700 p-2 space-y-2">
        <legend className="px-1 font-semibold text-gray-300">Model Baseline</legend>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-gray-400">Current Baseline: </span>
            <span className="font-mono text-gray-200">{currentBaseline ? currentBaseline.name : 'Working Draft (Unfrozen)'}</span>
          </div>
          <button
            type="button"
            onClick={() => setShowNewBaseline(!showNewBaseline)}
            className="rounded border border-gray-600 px-2 py-0.5 text-[11px] text-gray-300 hover:bg-gray-800"
          >
            Create Baseline
          </button>
        </div>

        {showNewBaseline && (
          <form onSubmit={handleCreate} className="flex gap-2 pt-2 border-t border-gray-800">
            <input
              aria-label="Baseline name"
              value={newBaselineName}
              onChange={e => setNewBaselineName(e.target.value)}
              placeholder="e.g. Baseline 1.0"
              className="flex-1 rounded border border-gray-700 bg-transparent px-2 py-1 text-xs"
            />
            <button
              type="submit"
              className="rounded bg-[#f97316] px-3 py-1 text-xs font-semibold text-white hover:bg-orange-600"
            >
              Save
            </button>
          </form>
        )}

        {baselineList.length > 0 && (
          <div className="text-[10px] text-gray-500">
            {baselineList.length} frozen baseline(s) registered.
          </div>
        )}
      </fieldset>

      {/* Suspect Links Section */}
      {suspectLinks.length > 0 && (
        <fieldset className="rounded border border-amber-800/60 bg-amber-950/20 p-2 space-y-2">
          <legend className="px-1 flex items-center gap-1 font-semibold text-amber-400">
            <span className="rounded bg-amber-900/60 px-1 py-0.2 text-[10px] uppercase font-bold text-amber-200">SUSPECT</span>
            <span>Traceability Links</span>
          </legend>
          <p className="text-[11px] text-amber-200/80">
            Upstream/downstream artifacts changed since last verification. Review impact and re-validate.
          </p>
          <div className="space-y-1.5">
            {suspectLinks.map(link => (
              <div key={link.id} className="flex items-center justify-between rounded bg-[#1e1e1e] p-1.5 border border-gray-800">
                <div>
                  <span className="font-mono text-gray-300">«{link.kind}»</span>
                  <span className="text-gray-400 text-[10px]"> {link.sourceId} ➔ {link.targetId}</span>
                </div>
                {onClearSuspect && (
                  <button
                    type="button"
                    onClick={() => onClearSuspect(link.id)}
                    className="rounded border border-emerald-700 bg-emerald-950/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 hover:bg-emerald-900/50"
                  >
                    Mark Validated
                  </button>
                )}
              </div>
            ))}
          </div>
        </fieldset>
      )}

      {/* Copy Synchronization Section */}
      {requirement.copiedFromId && (
        <fieldset className="rounded border border-gray-700 p-2 space-y-2">
          <legend className="px-1 font-semibold text-gray-300">Copy Synchronization</legend>
          <div className="text-[11px] text-gray-400">
            Copied from master requirement: <span className="font-mono text-gray-200">{requirement.copiedFromId}</span>
          </div>

          {masterRequirement && (
            <div className="rounded bg-[#141414] p-2 space-y-1 border border-gray-800 text-[11px]">
              <div className="text-gray-300 font-semibold">Master Content:</div>
              <div className="italic text-gray-400">{masterRequirement.text}</div>
            </div>
          )}

          {copyDiffs.length > 0 ? (
            <div className="space-y-1">
              <span className="text-[11px] text-amber-400">Master has updates:</span>
              <ul className="list-disc pl-4 text-[10px] text-gray-400">
                {copyDiffs.map(d => (
                  <li key={d.field}>
                    <span className="font-mono text-gray-300">{d.field}</span>: "{String(d.from)}" ➔ "{String(d.to)}"
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="text-[10px] text-emerald-400">In sync with master copy.</div>
          )}

          {onSyncFromMaster && (
            <button
              type="button"
              onClick={onSyncFromMaster}
              className="rounded border border-blue-700 bg-blue-950/40 px-2.5 py-1 text-xs font-semibold text-blue-300 hover:bg-blue-900/50"
            >
              Sync from Master
            </button>
          )}
        </fieldset>
      )}

      {/* Deletion Impact & Recovery Section */}
      {(deletionSeverity || unresolvedUsageIds.length > 0 || invalidatedEvidenceIds.length > 0 || blockedBaselineIds.length > 0) && (
        <fieldset className="rounded border border-gray-700 p-2 space-y-2" aria-label="Deletion impact and recovery">
          <legend className="px-1 font-semibold text-gray-300">Deletion Impact & Recovery</legend>
          {deletionSeverity && (
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Impact severity:</span>
              <span className={`rounded px-1.5 py-0.2 text-[10px] font-bold uppercase border ${
                deletionSeverity === 'blocked'
                  ? 'bg-red-950 text-red-400 border-red-700'
                  : deletionSeverity === 'review'
                    ? 'bg-amber-950 text-amber-400 border-amber-700'
                    : 'bg-emerald-950 text-emerald-400 border-emerald-700'
              }`}>
                {deletionSeverity}
              </span>
            </div>
          )}
          {unresolvedUsageIds.length > 0 && (
            <div className="text-[11px] text-gray-400">
              Typed usages kept unresolved (explicit resolution required):
              <span className="font-mono text-gray-200"> {unresolvedUsageIds.join(', ')}</span>
            </div>
          )}
          {invalidatedEvidenceIds.length > 0 && (
            <div className="text-[11px] text-gray-400">
              Evidence invalidated by deletion:
              <span className="font-mono text-gray-200"> {invalidatedEvidenceIds.join(', ')}</span>
            </div>
          )}
          {blockedBaselineIds.length > 0 && (
            <div className="rounded border border-red-800/60 bg-red-950/20 p-2 space-y-1.5">
              <p className="text-[11px] text-red-300">
                Protected baseline{blockedBaselineIds.length > 1 ? 's' : ''} {blockedBaselineIds.join(', ')} forbid{blockedBaselineIds.length > 1 ? '' : 's'} this deletion. Clone into a working copy or authorize explicitly.
              </p>
              <div className="flex gap-2">
                {onCloneBaseline && blockedBaselineIds.map(id => (
                  <button
                    key={`clone-${id}`}
                    type="button"
                    onClick={() => onCloneBaseline(id)}
                    className="rounded border border-gray-600 px-2 py-0.5 text-[11px] text-gray-300 hover:bg-gray-800"
                  >
                    Clone {id}
                  </button>
                ))}
                {onAuthorizeBaseline && blockedBaselineIds.map(id => (
                  <button
                    key={`auth-${id}`}
                    type="button"
                    onClick={() => onAuthorizeBaseline(id)}
                    className="rounded border border-red-700 bg-red-950/40 px-2 py-0.5 text-[11px] font-semibold text-red-300 hover:bg-red-900/50"
                  >
                    Authorize {id}
                  </button>
                ))}
              </div>
            </div>
          )}
        </fieldset>
      )}

      {/* Verification Evidence History */}
      <fieldset className="rounded border border-gray-700 p-2 space-y-2">
        <legend className="px-1 font-semibold text-gray-300">Verification Evidence</legend>
        {evidenceHistory.length === 0 ? (
          <div className="text-[11px] text-gray-500 italic">No verification runs recorded yet.</div>
        ) : (
          <div className="space-y-1.5">
            {evidenceHistory.map(ev => (
              <div key={ev.id} className="flex items-center justify-between rounded bg-[#141414] p-1.5 border border-gray-800 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.2 text-[10px] font-bold uppercase ${
                    ev.result === 'passed' ? 'bg-emerald-950 text-emerald-400 border border-emerald-700' : 'bg-red-950 text-red-400 border border-red-700'
                  }`}>
                    {ev.result}
                  </span>
                  <span className="font-mono text-gray-400">Rev {ev.revision}</span>
                  <span className="text-gray-500 text-[10px]">{ev.executedAt}</span>
                </div>
                <span className={`text-[10px] font-semibold ${ev.status === 'current' ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {ev.status || 'recorded'}
                </span>
              </div>
            ))}
          </div>
        )}
      </fieldset>
    </div>
  );
}
