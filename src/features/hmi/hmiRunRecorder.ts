export type HmiValue = number | boolean;

export interface HmiRunTick {
  time: number;
  values: Readonly<Record<string, HmiValue>>;
  activeStateIds: readonly string[];
  firedTransitionIds: readonly string[];
  operatorInputIds?: readonly string[];
}

export type HmiChangeCause =
  | { kind: 'initial' }
  | { kind: 'operator' }
  | { kind: 'transition'; transitionIds: string[] }
  | { kind: 'state' };

export interface HmiRunChange {
  time: number;
  variableId: string;
  from: HmiValue | undefined;
  to: HmiValue;
  activeStateIds: string[];
  cause: HmiChangeCause;
}

export interface HmiStateVisit { stateId: string; enter: number; exit: number | null; viaTransitionId: string | null }

export interface HmiRunLog {
  startTime: number;
  endTime: number;
  ticks: number;
  initial: Record<string, HmiValue>;
  changes: HmiRunChange[];
  visits: HmiStateVisit[];
  transitions: { time: number; transitionId: string }[];
  truncated: boolean;
}

export interface HmiRunRecorder {
  start(initial: HmiRunTick): void;
  record(tick: HmiRunTick): void;
  reset(): void;
  snapshot(): HmiRunLog;
  setTransitionTargets(targets: Readonly<Record<string, string>>): void;
}

export interface HmiRunRecorderOptions {
  maxChanges?: number;
  transitionTargets?: Readonly<Record<string, string>>;
}

const emptyLog = (): HmiRunLog => ({
  startTime: 0, endTime: 0, ticks: 0, initial: {}, changes: [], visits: [], transitions: [], truncated: false,
});

export function createHmiRunRecorder(options: HmiRunRecorderOptions = {}): HmiRunRecorder {
  const maxChanges = options.maxChanges ?? 20000;
  let targets: Readonly<Record<string, string>> = options.transitionTargets ?? {};
  let log = emptyLog();
  let started = false;
  let previous: Record<string, HmiValue> = {};
  let active = new Set<string>();
  let open = new Map<string, HmiStateVisit>();

  const start = (tick: HmiRunTick) => {
    log = emptyLog();
    log.startTime = tick.time;
    log.endTime = tick.time;
    log.initial = { ...tick.values };
    previous = { ...tick.values };
    active = new Set();
    open = new Map();
    for (const stateId of tick.activeStateIds) {
      if (active.has(stateId)) continue;
      active.add(stateId);
      const visit: HmiStateVisit = { stateId, enter: tick.time, exit: null, viaTransitionId: null };
      log.visits.push(visit);
      open.set(stateId, visit);
    }
    started = true;
  };

  const record = (tick: HmiRunTick) => {
    if (!started) { start(tick); return; }
    log.ticks += 1;
    log.endTime = tick.time;
    for (const transitionId of tick.firedTransitionIds) log.transitions.push({ time: tick.time, transitionId });

    const operatorIds = new Set(tick.operatorInputIds ?? []);
    for (const variableId of Object.keys(tick.values)) {
      const to = tick.values[variableId];
      const from = previous[variableId];
      if (from === to) continue;
      if (log.changes.length >= maxChanges) {
        log.truncated = true;
      } else {
        const cause: HmiChangeCause = operatorIds.has(variableId)
          ? { kind: 'operator' }
          : tick.firedTransitionIds.length > 0
            ? { kind: 'transition', transitionIds: [...tick.firedTransitionIds] }
            : { kind: 'state' };
        log.changes.push({ time: tick.time, variableId, from, to, activeStateIds: [...tick.activeStateIds], cause });
      }
      previous[variableId] = to;
    }

    const next = new Set(tick.activeStateIds);
    for (const stateId of active) {
      if (next.has(stateId)) continue;
      const visit = open.get(stateId);
      if (visit) visit.exit = tick.time;
      open.delete(stateId);
    }
    for (const stateId of tick.activeStateIds) {
      if (active.has(stateId) || open.has(stateId)) continue;
      const via = tick.firedTransitionIds.find(id => targets[id] === stateId) ?? null;
      const visit: HmiStateVisit = { stateId, enter: tick.time, exit: null, viaTransitionId: via };
      log.visits.push(visit);
      open.set(stateId, visit);
    }
    active = next;
  };

  const reset = () => {
    log = emptyLog();
    started = false;
    previous = {};
    active = new Set();
    open = new Map();
  };

  const snapshot = (): HmiRunLog => ({
    startTime: log.startTime,
    endTime: log.endTime,
    ticks: log.ticks,
    initial: { ...log.initial },
    changes: log.changes.map(change => ({
      ...change,
      activeStateIds: [...change.activeStateIds],
      cause: change.cause.kind === 'transition' ? { kind: 'transition', transitionIds: [...change.cause.transitionIds] } : { ...change.cause },
    })),
    visits: log.visits.map(visit => ({ ...visit })),
    transitions: log.transitions.map(entry => ({ ...entry })),
    truncated: log.truncated,
  });

  return { start, record, reset, snapshot, setTransitionTargets: next => { targets = next; } };
}
