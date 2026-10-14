import React, { useMemo, useState } from 'react';
import type { SysmlRepository } from '../../engine/sysml/model';
import type { SimCandidate } from '../../engine/trmSim/simVerification';

export interface RequirementAssignmentsPanelProps {
  repository: SysmlRepository;
  elementName: string;
  targets: SimCandidate[];
  onRepositoryChange: (repository: SysmlRepository) => void;
  newId?: () => string;
}

const LINK_KINDS = ['satisfy', 'verify', 'refine', 'trace'] as const;
type LinkKind = (typeof LINK_KINDS)[number];
const isLinkKind = (k: string): k is LinkKind => (LINK_KINDS as readonly string[]).includes(k);

const defaultNewId = (): string => (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
  ? crypto.randomUUID() : `rel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

const selectClass = 'w-full bg-[#1e1e1e] border border-[#333] rounded px-2 py-1.5 text-xs text-[#e0e0e0] focus:outline-none focus:border-orange-500';

export const RequirementAssignmentsPanel: React.FC<RequirementAssignmentsPanelProps> = ({
  repository, elementName, targets, onRepositoryChange, newId = defaultNewId,
}) => {
  const [requirementKey, setRequirementKey] = useState('');
  const [targetKey, setTargetKey] = useState('');
  const [kind, setKind] = useState<LinkKind>('satisfy');

  const requirements = useMemo(() => Object.values(repository.requirements ?? {}), [repository.requirements]);
  const relationships = useMemo(() => Object.values(repository.relationships ?? {}), [repository.relationships]);
  const targetName = useMemo(() => new Map(targets.map(t => [t.target, t.name])), [targets]);

  const links = useMemo(() => {
    const reqs = repository.requirements ?? {};
    const out: { id: string; requirement: string; kind: string; target: string }[] = [];
    for (const rel of relationships) {
      if (!isLinkKind(rel.kind)) continue;
      let element: string; let req: string;
      if (targetName.has(rel.sourceId) && reqs[rel.targetId]) { element = rel.sourceId; req = rel.targetId; }
      else if (targetName.has(rel.targetId) && reqs[rel.sourceId]) { element = rel.targetId; req = rel.sourceId; }
      else continue;
      const r = reqs[req] as any;
      out.push({ id: rel.id, requirement: r.requirementId || r.name || r.id, kind: rel.kind, target: targetName.get(element) as string });
    }
    return out;
  }, [relationships, repository.requirements, targetName]);

  const chosenTarget = targets.some(t => t.target === targetKey) ? targetKey : (targets[0]?.target ?? '');

  const link = (): void => {
    if (!requirementKey || !chosenTarget || !repository.requirements?.[requirementKey]) return;
    if (relationships.some(r => r.kind === kind && r.sourceId === chosenTarget && r.targetId === requirementKey)) return;
    const next = structuredClone(repository);
    const id = newId();
    next.relationships[id] = { id, kind, sourceId: chosenTarget, targetId: requirementKey } as any;
    onRepositoryChange(next);
  };

  const unlink = (relationshipId: string): void => {
    const next = structuredClone(repository);
    delete next.relationships[relationshipId];
    onRepositoryChange(next);
  };

  return (
    <section aria-label={`Requirements of ${elementName}`} className="border border-[#2a2a2a] bg-[#141414] rounded-lg p-3 my-2 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-[#e0e0e0]">Requirements</span>
        <span className="text-[10px] bg-[#222] text-[#888] px-2 py-0.5 rounded-full border border-[#333]">
          {links.length} {links.length === 1 ? 'link' : 'links'}
        </span>
      </div>

      {links.length === 0 ? (
        <p className="text-[11px] text-[#666] italic py-1">Nothing is linked yet.</p>
      ) : (
        <ul aria-label="Linked requirements" className="space-y-1.5">
          {links.map(l => (
            <li key={l.id} className="flex items-center justify-between gap-2 p-2 rounded bg-[#1c1c1c] border border-[#2e2e2e] text-xs">
              <span className="min-w-0 truncate text-[#ddd]">
                <span className="font-medium">{l.requirement}</span>{' '}
                <span className="font-mono text-[10px] text-[#aaa]">&laquo;{l.kind}&raquo;</span>{' '}
                <span className="text-[#888]">{l.target}</span>
              </span>
              <button
                type="button"
                onClick={() => unlink(l.id)}
                aria-label={`Unlink ${l.requirement} from ${l.target}`}
                title={`Unlink ${l.requirement} from ${l.target}`}
                className="text-[#666] hover:text-red-400 px-1 rounded transition-colors shrink-0"
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}

      {targets.length === 0 ? (
        <p className="text-[11px] text-[#666] italic py-1 border-t border-[#222] pt-2">This element has nothing to link.</p>
      ) : requirements.length === 0 ? (
        <p className="text-[11px] text-[#666] italic py-1 border-t border-[#222] pt-2">No requirements exist in the repository yet.</p>
      ) : (
        <div className="pt-2 border-t border-[#222] space-y-2">
          <select aria-label="Requirement" value={requirementKey} onChange={e => setRequirementKey(e.target.value)} className={selectClass}>
            <option value="">-- Choose Requirement --</option>
            {requirements.map(r => (
              <option key={r.id} value={r.id}>{(r as any).requirementId || r.name || r.id}{r.name && (r as any).requirementId ? ` - ${r.name}` : ''}</option>
            ))}
          </select>
          <select aria-label="Link element" value={chosenTarget} onChange={e => setTargetKey(e.target.value)} className={selectClass}>
            {targets.map(t => <option key={t.target} value={t.target}>{t.name}</option>)}
          </select>
          <div className="flex gap-2">
            <select aria-label="Link kind" value={kind} onChange={e => setKind(e.target.value as LinkKind)} className={selectClass}>
              {LINK_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <button
              type="button"
              onClick={link}
              className="px-3 py-1.5 text-xs font-medium rounded bg-orange-500 text-[#111827] hover:bg-orange-400 transition-colors whitespace-nowrap"
            >
              Link requirement
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
