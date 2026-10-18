import type { StateData, TransitionData } from '../../types/sm_types';

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
