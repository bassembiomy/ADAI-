import type { JunctionData, StateData, TransitionData, VariableDef } from '../../types/sm_types';
import { flatOrFixture, type DifferentialScenarioStep } from './smFixtures';
import type { StateMachineLayerV4, StateMachineModelV5 } from './smModel';

/*
 * Seeded random state charts for differential testing (test support, not used by the app):
 * nested OR/AND states, shallow and deep history, junctions, temporal and combined guards,
 * cross-level, inner and self transitions, typed arithmetic that saturates.
 */

export interface RandomChartFeatures {
  innerTransitions: boolean;
  arithmetic: boolean;
  /** Declares two input events and one local event; ~30% of the transitions are event-triggered and some actions send the local event. */
  events?: boolean;
}

export const RANDOM_INPUT_EVENTS = ['IN_A', 'IN_B'] as const;
const EVENT_IDS = ['ev_in_a', 'ev_in_b', 'ev_local'] as const;

const mulberry32 = (seed: number) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const INPUTS = ['in0', 'in1', 'in2', 'in3'];

const baseVariables = (): VariableDef[] => [
  ...INPUTS.map((name) => ({ id: name, name, type: 'bool' as const, initialValue: 'false', currentValue: false, visibleInScope: true })),
  { id: 'c0', name: 'c0', type: 'int32', initialValue: '0', currentValue: 0, visibleInScope: true },
  { id: 'c1', name: 'c1', type: 'int32', initialValue: '1', currentValue: 1, visibleInScope: true },
  { id: 'u8', name: 'u8', type: 'uint8', initialValue: '250', currentValue: 250, visibleInScope: true },
  { id: 'd0', name: 'd0', type: 'double', initialValue: '0', currentValue: 0, visibleInScope: true },
];

export const buildRandomChart = (seed: number, features: RandomChartFeatures): StateMachineModelV5 => {
  const rnd = mulberry32(seed);
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(rnd() * items.length)];
  const chance = (p: number) => rnd() < p;

  const states: StateData[] = [];
  const layers: StateMachineLayerV4[] = [];
  const junctions: JunctionData[] = [];
  const transitions: TransitionData[] = [];
  const parentOf = new Map<string, string | null>();
  const layerOfState = new Map<string, StateMachineLayerV4>();
  const childLayerOf = new Map<string, StateMachineLayerV4>();
  let stateCount = 0;
  let transitionCount = 0;
  const maxStates = 20 + Math.floor(rnd() * 60);
  const maxDepth = 3 + Math.floor(rnd() * 3);

  const action = (): string => {
    if (!features.arithmetic) return chance(0.5) ? '' : pick(['c0 = c0 + 1;', 'd0 = d0 + 0.5;']);
    return chance(0.45) ? '' : pick([
      'c0 = c0 + 1;',
      'c1 = c1 * 3 + 1;',
      'c0 = c0 - c1 / 7;',
      'u8 = u8 + 3;',
      'u8 = u8 - 7;',
      'd0 = d0 / 2 + c0;',
      'c0 = (c1 % 13) * (0 - 2);',
      'd0 = abs(d0 - 10.5);',
    ]);
  };
  /** An action that sometimes also sends the local event (only with the events feature). */
  const eventAction = (): string => {
    const base = action();
    if (!features.events || !chance(0.12)) return base;
    return base === '' ? 'send(LOCAL);' : `${base} send(LOCAL);`;
  };
  const guard = (): string => {
    const atoms = features.arithmetic
      ? [...INPUTS, ...INPUTS.map((name) => `!${name}`), 'c0 > 3', 'c1 % 2 == 0', 'u8 < 100', 'd0 > 4.5']
      : [...INPUTS, ...INPUTS.map((name) => `!${name}`), 'c0 > 3'];
    return chance(0.3) ? `${pick(atoms)} && ${pick(atoms)}` : pick(atoms);
  };

  const addTransition = (layer: StateMachineLayerV4, sourceId: string, targetId: string, extra: Partial<TransitionData> = {}) => {
    const kind = pick(['condition', 'condition', 'after', 'and'] as const);
    const id = `t${transitionCount++}`;
    transitions.push({
      id, sourceId, targetId,
      condition: kind === 'after' ? '' : guard(),
      action: chance(0.4) ? eventAction() : '',
      afterTicks: kind === 'after' || kind === 'and' ? 1 + Math.floor(rnd() * 5) : null,
      type: kind,
      hasControlPoint: false,
      order: 1 + layer.transitionIds.length,
      ...(features.events ? { event: chance(0.3) ? pick(EVENT_IDS) : null } : {}),
      ...extra,
    });
    layer.transitionIds.push(id);
  };

  const buildLayer = (layerId: string, parentStateId: string | null, decomposition: 'OR' | 'AND', depth: number) => {
    const layer: StateMachineLayerV4 = { id: layerId, name: layerId, parentStateId, decomposition, stateIds: [], transitionIds: [], junctionIds: [] };
    layers.push(layer);
    if (parentStateId !== null) childLayerOf.set(parentStateId, layer);
    const count = decomposition === 'AND' ? 2 + Math.floor(rnd() * 2) : 2 + Math.floor(rnd() * 4);
    const defaultIndex = Math.floor(rnd() * count);
    for (let index = 0; index < count && stateCount < maxStates; index += 1) {
      const id = `s${stateCount++}`;
      states.push({
        id, name: id, x: 0, y: 0, width: 100, height: 60,
        entry: eventAction(), during: chance(0.5) ? action() : '', exit: action(),
        isActive: false, color: '#000000', parentId: parentStateId, children: [],
        priority: index + 1, isParallel: false, regionId: null,
        autostart: decomposition === 'OR' && index === defaultIndex,
      });
      layer.stateIds.push(id);
      parentOf.set(id, parentStateId);
      layerOfState.set(id, layer);
    }
    if (decomposition === 'OR' && !layer.stateIds.some((id) => states.find((s) => s.id === id)!.autostart)) {
      states.find((s) => s.id === layer.stateIds[0])!.autostart = true;
    }
    for (const id of [...layer.stateIds]) {
      const composite = depth < maxDepth && stateCount < maxStates - 2 && chance(decomposition === 'AND' ? 0.9 : 0.55);
      if (composite) buildLayer(`L_${id}`, id, decomposition === 'AND' ? 'OR' : (chance(0.25) ? 'AND' : 'OR'), depth + 1);
    }
    return layer;
  };

  const root = buildLayer('root', null, 'OR', 0);

  const ancestors = (id: string): string[] => {
    const chain: string[] = [];
    let current = parentOf.get(id) ?? null;
    while (current !== null) { chain.push(current); current = parentOf.get(current) ?? null; }
    return chain;
  };
  const descendants = (id: string): string[] => {
    const layer = childLayerOf.get(id);
    if (!layer) return [];
    return layer.stateIds.flatMap((child) => [child, ...descendants(child)]);
  };
  const inOrLayer = (id: string) => layerOfState.get(id)!.decomposition === 'OR';
  /* Layers from the state's own layer up to the root. */
  const layerChain = (id: string): StateMachineLayerV4[] => {
    const chain: StateMachineLayerV4[] = [layerOfState.get(id)!];
    for (const ancestor of ancestors(id)) chain.push(layerOfState.get(ancestor)!);
    return chain;
  };
  /* Stateflow and UML forbid transitions between parallel regions: the innermost layer
   * shared by source and target must be an OR layer. */
  const crossesParallelRegions = (sourceId: string, targetId: string): boolean => {
    const targetLayers = new Set(layerChain(targetId).map((layer) => layer.id));
    const shared = layerChain(sourceId).find((layer) => targetLayers.has(layer.id));
    return shared === undefined || shared.decomposition === 'AND';
  };

  for (const state of states) {
    const layer = layerOfState.get(state.id)!;
    if (layer.decomposition !== 'OR') continue;
    const outgoing = Math.floor(rnd() * 3);
    for (let n = 0; n < outgoing; n += 1) {
      const siblings = layer.stateIds.filter((id) => id !== state.id);
      const cross = states.map((s) => s.id).filter((id) => id !== state.id && inOrLayer(id)
        && !ancestors(state.id).includes(id) && !descendants(state.id).includes(id)
        && !crossesParallelRegions(state.id, id));
      const roll = rnd();
      if (roll < 0.1) {
        addTransition(layer, state.id, state.id);
      } else if (roll < 0.3 && cross.length > 0) {
        addTransition(layer, state.id, pick(cross));
      } else if (siblings.length > 0) {
        addTransition(layer, state.id, pick(siblings));
      }
    }
    const children = childLayerOf.get(state.id);
    if (features.innerTransitions && children && children.decomposition === 'OR' && chance(0.6)) {
      const targets = descendants(state.id).filter((id) => inOrLayer(id));
      if (targets.length > 0) addTransition(children, state.id, pick(targets), { type: 'internal', isInternal: true });
    }
    if (children && children.decomposition === 'OR' && chance(0.25)) {
      const historyId = `h_${state.id}`;
      junctions.push({ id: historyId, x: 0, y: 0, name: historyId, color: '#000000', parentId: state.id, type: chance(0.5) ? 'deep-history' : 'history' });
      children.junctionIds.push(historyId);
      const from = layer.stateIds.filter((id) => id !== state.id);
      if (from.length > 0) addTransition(layer, pick(from), historyId);
    }
  }

  if (root.stateIds.length >= 2 && chance(0.5)) {
    const junctionId = 'j_root';
    junctions.push({ id: junctionId, x: 0, y: 0, name: junctionId, color: '#000000', parentId: 'root' });
    root.junctionIds.push(junctionId);
    const [first, second] = root.stateIds;
    addTransition(root, root.stateIds[root.stateIds.length - 1], junctionId, { type: 'condition', afterTicks: null });
    addTransition(root, junctionId, first, { type: 'condition', afterTicks: null, condition: guard(), order: 1 });
    addTransition(root, junctionId, second, { type: 'condition', afterTicks: null, condition: 'true', order: 2 });
  }

  const model = flatOrFixture();
  model.states = states;
  model.junctions = junctions;
  model.transitions = transitions;
  model.layers = layers;
  model.variables = baseVariables();
  if (features.events) {
    model.events = [
      { id: 'ev_in_a', name: 'IN_A', scope: 'input' },
      { id: 'ev_in_b', name: 'IN_B', scope: 'input' },
      { id: 'ev_local', name: 'LOCAL', scope: 'local' },
    ];
  }
  return model;
};

export const randomStimulus = (
  seed: number,
  ticks: number,
  /** Input event names to post at random (omit for charts without events). */
  inputEvents?: readonly string[],
): DifferentialScenarioStep[] => {
  const rnd = mulberry32(seed ^ 0x5bd1e995);
  const values: Record<string, boolean> = Object.fromEntries(INPUTS.map((name) => [name, false]));
  const steps: DifferentialScenarioStep[] = [];
  for (let tick = 0; tick < ticks; tick += 1) {
    if (tick > 0 && rnd() < 0.01) { steps.push({ kind: 'reset' }); continue; }
    const inputs: Record<string, boolean> = {};
    for (const name of INPUTS) {
      if (rnd() < 0.3) { values[name] = !values[name]; inputs[name] = values[name]; }
    }
    const events = inputEvents === undefined
      ? []
      : inputEvents.filter(() => rnd() < 0.3);
    steps.push({
      kind: 'step',
      ...(Object.keys(inputs).length > 0 ? { inputs } : {}),
      ...(events.length > 0 ? { events } : {}),
    });
  }
  return steps;
};

