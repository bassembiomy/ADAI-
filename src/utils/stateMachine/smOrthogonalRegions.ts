import type { Layer, StateData, TransitionData } from '../../types/sm_types';

/**
 * Parallel states are the orthogonal regions of their parent (an AND decomposition). Entering the parent
 * enters every one of them (SysML 1.6 §13 / UML 2.5 §14.2.3.4.3 "entering a composite state ... each of its
 * orthogonal regions"), so AutoStart is exclusive only among the non-parallel states of a region.
 */
export function applyAutostartEdit(states: StateData[], id: string, autostart: boolean): StateData[] {
  const target = states.find(s => s.id === id);
  if (!target) return states;
  return states.map(s => {
    if (s.id === id) return { ...s, autostart };
    if (autostart && !target.isParallel && !s.isParallel && s.parentId === target.parentId && s.autostart) return { ...s, autostart: false };
    return s;
  });
}

/**
 * The states no entry reaches: the machine starts in its AutoStart states, a transition enters its target,
 * and entering a parallel state enters all its parallel siblings (the other orthogonal regions).
 */
export function findUnreachableStates(states: StateData[], transitions: TransitionData[]): StateData[] {
  const reachable = new Set<string>();
  const queue = states.filter(s => s.autostart).map(s => s.id);
  if (queue.length === 0 && states.length > 0) queue.push(states[0].id);
  const enter = (id: string) => {
    if (reachable.has(id)) return;
    reachable.add(id);
    queue.push(id);
  };
  const initial = [...queue];
  queue.length = 0;
  initial.forEach(enter);
  for (let head = 0; head < queue.length; head++) {
    const current = states.find(s => s.id === queue[head]);
    if (current?.isParallel) {
      for (const sibling of states) if (sibling.isParallel && sibling.parentId === current.parentId) enter(sibling.id);
    }
    for (const t of transitions) if (t.sourceId === queue[head]) enter(t.targetId);
  }
  return states.filter(s => !reachable.has(s.id));
}

export interface PartiallyParallelRegion {
  parentId: string | null;
  parallel: StateData[];
  sequential: StateData[];
}

/**
 * Regions where only some states are Parallel. Parallel states are the orthogonal regions of their parent and
 * all of them are entered together, so mixing them with sequential states in one region is ambiguous.
 */
export function findPartiallyParallelRegions(states: StateData[]): PartiallyParallelRegion[] {
  const byParent = new Map<string | null, StateData[]>();
  for (const s of states) byParent.set(s.parentId, [...(byParent.get(s.parentId) ?? []), s]);
  const result: PartiallyParallelRegion[] = [];
  for (const [parentId, members] of byParent) {
    const parallel = members.filter(s => s.isParallel);
    const sequential = members.filter(s => !s.isParallel);
    if (parallel.length > 0 && sequential.length > 0) result.push({ parentId, parallel, sequential });
  }
  return result;
}

export const partiallyParallelRegionMessage = (region: PartiallyParallelRegion): string =>
  `Region contains both Parallel states (${region.parallel.map(s => `'${s.name}'`).join(', ')}) and sequential states (${region.sequential.map(s => `'${s.name}'`).join(', ')}). Mark every state of the region Parallel, or none.`;

/**
 * The internal/local flag means something only when a transition ends at its own state (internal) or at one of
 * its descendants (local); any other flagged transition is rejected by the semantic builder. A state's owner is
 * the state whose region layer lists it.
 */
export function canTransitionBeInternal(
  transition: Pick<TransitionData, 'sourceId' | 'targetId'>,
  states: StateData[],
  layers: Layer[],
): boolean {
  const isState = (id: string) => states.some(s => s.id === id);
  if (!isState(transition.sourceId) || !isState(transition.targetId)) return false;
  if (transition.sourceId === transition.targetId) return true;
  const ownerOf = (id: string): string | null => layers.find(l => l.stateIds.includes(id))?.parentStateId ?? null;
  const seen = new Set<string>();
  let current = ownerOf(transition.targetId);
  while (current && !seen.has(current)) {
    if (current === transition.sourceId) return true;
    seen.add(current);
    current = ownerOf(current);
  }
  return false;
}
