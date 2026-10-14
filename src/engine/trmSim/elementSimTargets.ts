import { extractSmInterface } from './smInterface';
import { parseSimTarget } from './simTarget';
import { simCandidates, type SimCandidate } from './simVerification';

export type SimElementRef = { engine: 'sm'; stateId: string } | { engine: 'xb' | 'vlab'; blockId: string };

const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);

/** The simulation things of one model element that requirements can be linked to (WP-10b). */
export function elementSimTargets(project: any, element: SimElementRef): SimCandidate[] {
  if (element.engine === 'sm') {
    const transitions = arr(project?.transitions);
    const sm = extractSmInterface({
      states: arr(project?.states), transitions, variables: arr(project?.variables),
      junctions: arr(project?.junctions), hilConfig: project?.hilConfig,
    });
    const state = sm.states.find(s => s.id === element.stateId);
    if (!state) return [];
    const out: SimCandidate[] = [{ target: state.target, name: state.name, engine: 'sm' }];
    const names = new Map(sm.transitions.map(t => [t.id, t]));
    for (const t of transitions) {
      if (t?.sourceId !== element.stateId) continue;
      const info = names.get(t.id);
      if (info) out.push({ target: info.target, name: info.name, engine: 'sm' });
    }
    return out;
  }
  const { observe, stimulus } = simCandidates(project);
  const seen = new Set<string>();
  const out: SimCandidate[] = [];
  for (const c of [...observe, ...stimulus]) {
    if (c.engine !== element.engine || seen.has(c.target)) continue;
    const p = parseSimTarget(c.target);
    if (!p || p.domain !== element.engine || p.canvas !== 'global' || !('blockId' in p) || p.blockId !== element.blockId) continue;
    seen.add(c.target);
    out.push(c);
  }
  return out;
}
