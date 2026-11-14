import { BLOCK_LIBRARY } from '../../engine/xbridges/BlockDefinitions';
import type { ExternalFunctionDef, JunctionData, StateData, TransitionData, VariableDef } from '../../types/sm_types';
import { flatOrFixture, type DifferentialScenarioStep } from './smFixtures';
import type { StateMachineLayerV4, StateMachineModelV5 } from './smModel';
import type { XBEdgeV1, XBMappingV1, XBNodeV1, XBPersistedModelV1 } from './xbModel';

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
  /** Declares fixed-point (fixdt) variables of several word and fraction lengths, used in actions and guards; the chart rounding mode is random. */
  fixedPoint?: boolean;
  /**
   * Turns some leaf states into X-Bridges states: small valid block diagrams (gain, sum, saturation,
   * dead zone, unit delay, discrete integrator, delay, filters, rate limiter, step sources) with a random
   * memory ('reset' / 'retain') and numeric-fault ('signal-only' / 'escalate') policy, an Inport fed by a
   * chart variable and an Outport writing a chart variable (xo0, xo1, ...) that guards of the chart read.
   */
  xBridges?: boolean;
  /**
   * With xBridges: makes about two thirds of the X-Bridges states 'separate-task' (multi-rate: one solver step
   * per SM_XB_Task() call, deterministic rate transitions). All separate-task states of a chart share one
   * random solver step; the other states keep their own random step and run in the chart tick.
   */
  xBridgesTasks?: boolean;
  /**
   * Declares two external C functions (ext_mix over int32, ext_blend over double and int32) called from
   * actions and guards. Their C implementation comes from randomChartExtraSources, passed to the
   * differential harness as DifferentialFixture.extraSources.
   */
  externalFunctions?: boolean;
}

const EXTERNAL_FUNCTIONS: ExternalFunctionDef[] = [
  {
    id: 'f_ext_mix', name: 'ext_mix', header: 'ext_api.h', returnType: 'int32',
    params: [{ name: 'a', type: 'int32' }, { name: 'b', type: 'int32' }],
    simulation: '(a % 7) * 3 - b / 2',
  },
  {
    id: 'f_ext_blend', name: 'ext_blend', header: 'ext_api.h', returnType: 'double',
    params: [{ name: 'x', type: 'double' }, { name: 'n', type: 'int32' }],
    simulation: 'x * 0.5 + n % 5',
  },
];

/** C header and implementation of the random charts' external functions (empty without the feature). */
export const randomChartExtraSources = (
  _seed: number,
  features: RandomChartFeatures,
): { name: string; content: string }[] => features.externalFunctions
  ? [
    {
      name: 'ext_api.h',
      content: [
        '#ifndef EXT_API_H', '#define EXT_API_H', '#include <stdint.h>',
        'int32_t ext_mix(int32_t a, int32_t b);',
        'double ext_blend(double x, int32_t n);',
        '#endif', '',
      ].join('\n'),
    },
    {
      name: 'ext_api.c',
      content: [
        '#include "ext_api.h"',
        'int32_t ext_mix(int32_t a, int32_t b) { return ((a % 7) * 3) - (b / 2); }',
        'double ext_blend(double x, int32_t n) { return (x * 0.5) + (double)(n % 5); }', '',
      ].join('\n'),
    },
  ]
  : [];

/* ---- X-Bridges state generation (test support) ---- */

/* The default target has no float64 support for X-Bridges ports; mapped variables are 'float' (f0, xo*). */
type XBDataType = 'float32';

const xbPortDef = (p: any, dataType: XBDataType) => ({
  id: p.id,
  direction: p.direction,
  shape: p.shape ?? 'scalar',
  dimensions: p.dimensions ?? [],
  dataType,
});

const xbNode = (dataType: XBDataType, id: string, type: string, params: Record<string, unknown> = {}): XBNodeV1 => {
  const block = BLOCK_LIBRARY[type](id, params);
  return {
    id,
    type,
    label: id,
    parameters: {
      ...(block.inputs ? { inputs: block.inputs.map((p: any) => xbPortDef(p, dataType)) } : {}),
      ...(block.outputs ? { outputs: block.outputs.map((p: any) => xbPortDef(p, dataType)) } : {}),
      ...params,
    } as XBNodeV1['parameters'],
  };
};

interface XBTemplate { nodes: XBNodeV1[]; edges: XBEdgeV1[]; mappings: XBMappingV1[]; }

const buildXBTemplate = (
  rnd: () => number,
  prefix: string,
  dataType: XBDataType,
  inputVar: string,
  outputVar: string,
): XBTemplate => {
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(rnd() * items.length)];
  const chance = (p: number) => rnd() < p;
  const nodes: XBNodeV1[] = [];
  const edges: XBEdgeV1[] = [];
  const mappings: XBMappingV1[] = [];
  const hasInput = chance(0.85);
  const outport = `${prefix}_out`;
  nodes.push(xbNode(dataType, outport, 'Outport', { smVarId: outputVar }));
  mappings.push({ smVarId: outputVar, blockId: outport, portId: 'out', direction: 'out' });
  let cursor: { id: string; port: string };
  if (hasInput) {
    const inport = `${prefix}_in`;
    nodes.push(xbNode(dataType, inport, 'Inport', { smVarId: inputVar }));
    mappings.push({ smVarId: inputVar, blockId: inport, portId: 'in', direction: 'in' });
    cursor = { id: inport, port: 'out' };
  } else if (chance(0.5)) {
    const id = `${prefix}_step`;
    nodes.push(xbNode(dataType, id, 'Step', { stepTime: pick([0.02, 0.05, 0.1]), initialValue: pick([0, 1, -2]), finalValue: pick([3, 5.5, -4]) }));
    cursor = { id, port: 'out' };
  } else {
    const id = `${prefix}_const`;
    nodes.push(xbNode(dataType, id, 'Constant', { value: pick([1, 2.5, -3]) }));
    cursor = { id, port: 'out' };
  }
  const connect = (from: { id: string; port: string }, toId: string, toPort: string) => {
    edges.push({ id: `${prefix}_e${edges.length}`, sourceNodeId: from.id, sourcePortId: from.port, targetNodeId: toId, targetPortId: toPort });
  };
  const stages = 1 + Math.floor(rnd() * 3);
  for (let stage = 0; stage < stages; stage += 1) {
    const id = `${prefix}_b${stage}`;
    switch (pick(['gain', 'sum', 'sat', 'deadzone', 'unitdelay', 'integrator', 'delay', 'lpf', 'ma', 'rate'] as const)) {
      case 'gain':
        nodes.push(xbNode(dataType, id, 'GAIN', { gain: pick([2, -0.5, 3.25, 0.125]) }));
        connect(cursor, id, 'u'); cursor = { id, port: 'y' }; break;
      case 'sum': {
        const k = `${id}_k`;
        nodes.push(xbNode(dataType, k, 'Constant', { value: pick([1, -2.5, 10]) }));
        nodes.push(xbNode(dataType, id, 'Sum', { signs: pick(['++', '+-']), numInputs: 2 }));
        connect(cursor, id, 'in1'); connect({ id: k, port: 'out' }, id, 'in2'); cursor = { id, port: 'out' }; break;
      }
      case 'sat':
        nodes.push(xbNode(dataType, id, 'SATURATION', { lowerLimit: pick([-1, -5, 0]), upperLimit: pick([1, 4, 20]) }));
        connect(cursor, id, 'u'); cursor = { id, port: 'y' }; break;
      case 'deadzone':
        nodes.push(xbNode(dataType, id, 'DEADZONE', { lowerLimit: pick([-0.5, -2]), upperLimit: pick([0.5, 3]) }));
        connect(cursor, id, 'u'); cursor = { id, port: 'y' }; break;
      case 'unitdelay':
        nodes.push(xbNode(dataType, id, 'UNIT_DELAY', { initialCondition: pick([0, 1, -3]) }));
        connect(cursor, id, 'u'); cursor = { id, port: 'y' }; break;
      case 'integrator':
        nodes.push(xbNode(dataType, id, 'INTEGRATOR_DISCRETE', { initial_condition: pick([0, 1]), sample_time: 0.01, method: 'forward_euler' }));
        connect(cursor, id, 'u'); cursor = { id, port: 'y' }; break;
      case 'delay':
        nodes.push(xbNode(dataType, id, 'DELAY', { delay_length: pick([1, 2, 3]), initial_condition: pick([-1, 0, 4]) }));
        connect(cursor, id, 'u'); cursor = { id, port: 'y' }; break;
      case 'lpf':
        nodes.push(xbNode(dataType, id, 'LOW_PASS_FILTER', { cutoff_frequency: 1, sample_time: 0.1, initial_condition: 0 }));
        connect(cursor, id, 'u'); cursor = { id, port: 'y' }; break;
      case 'ma':
        nodes.push(xbNode(dataType, id, 'MOVING_AVERAGE', { window_size: pick([2, 4]), sample_time: 0.1, initial_condition: 0 }));
        connect(cursor, id, 'u'); cursor = { id, port: 'y' }; break;
      case 'rate':
        nodes.push(xbNode(dataType, id, 'RATE_LIMITER', { risingSlewRate: pick([2, 20]), fallingSlewRate: pick([-2, -20]), initialCondition: 0, sampleTime: 0.1 }));
        connect(cursor, id, 'u'); cursor = { id, port: 'y' }; break;
    }
  }
  connect(cursor, outport, 'in');
  return { nodes, edges, mappings };
};

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

const fixedVariable = (
  name: string, signed: boolean, wordLength: 8 | 16 | 32, fractionLength: number, initialValue: string, overflowPolicy?: 'saturate' | 'error',
): VariableDef => ({
  id: name, name, type: 'fixdt', initialValue, currentValue: Number(initialValue), visibleInScope: true,
  fixedPoint: { signed, wordLength, fractionLength },
  ...(overflowPolicy ? { overflowPolicy } : {}),
});

const fixedVariables = (): VariableDef[] => [
  fixedVariable('fa', true, 16, 8, '1.5'),
  fixedVariable('fb', false, 8, 4, '2.25'),
  fixedVariable('fc', true, 32, 16, '-3.1'),
  fixedVariable('fd', false, 16, 16, '0.3'),
  fixedVariable('fe', true, 8, 7, '-0.5'),
  fixedVariable('ff', true, 8, 3, '0', 'error'),
];

const FIXED_ACTIONS = [
  'fa = fa + fb;',
  'fb = fb * fa;',
  'fc = fa * fc + c1;',
  'fa = fa / (fb + 1);',
  'fe = fe / fd;',
  'fd = fd + 0.25;',
  'fb = fa;',
  'fe = 0 - fe;',
  'c0 = fa * 2 + c0;',
  'fa = fa + d0;',
  'fc = abs(fc - fa);',
  'fd = (fd * fb) % 3;',
  'fe = fe + 1;',
  'fc = fc * fc;',
  'fb = fb - fd;',
  'ff = ff + 1;',
  'd0 = fa * fb;',
  'fa = c1 * 40;',
];

const FIXED_ATOMS = ['fa > 1.5', 'fb < fa', 'fc >= fd', 'fe == 0', 'fa * fb > c0', 'fd <= fb', 'fc < 0'];

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
  const xbOutputs: Array<{ name: string; type: 'float' | 'double' }> = [];
  if (features.xBridges) {
    const count = 2 + Math.floor(rnd() * 3);
    for (let index = 0; index < count; index += 1) xbOutputs.push({ name: `xo${index}`, type: 'float' });
  }

  const action = (): string => {
    if (features.externalFunctions && chance(0.35)) {
      return pick(['c0 = ext_mix(c0, c1);', 'd0 = ext_blend(d0, c0);', 'c1 = ext_mix(c1 + 1, u8);', 'c0 = c0 + ext_mix(u8, 5);']);
    }
    if (features.fixedPoint && chance(0.4)) return pick(FIXED_ACTIONS);
    if (features.xBridges && chance(0.25)) return pick(['f0 = f0 * 0.5 + 1.5;', 'f0 = f0 - 2.25;', 'f0 = f0 + 0.75;', 'f0 = xo0 + 1.0;']);
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
    if (features.fixedPoint && chance(0.3)) atoms.push(...FIXED_ATOMS);
    if (features.externalFunctions) atoms.push(pick(['ext_blend(d0, c0) > 3.5', 'ext_mix(c0, c1) > 0', 'ext_blend(0.5, c1) < 2.0']));
    for (const output of xbOutputs) atoms.push(pick([`${output.name} > 1.5`, `${output.name} < 3.0`, `${output.name} >= 0.0`]));
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

  if (features.xBridges) {
    const leaves = states.filter((state) => !childLayerOf.has(state.id));
    const pool = [...leaves];
    const taskStep = features.xBridgesTasks ? pick([0.002, 0.005, 0.01]) : 0.01;
    for (const output of xbOutputs) {
      if (pool.length === 0) break;
      const leaf = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
      const dataType: XBDataType = 'float32';
      const template = buildXBTemplate(rnd, `xb_${leaf.id}`, dataType, 'f0', output.name);
      const persisted: XBPersistedModelV1 = {
        schemaVersion: 1,
        nodes: template.nodes,
        edges: template.edges,
        mappings: template.mappings,
        solver: features.xBridgesTasks && chance(0.66)
          ? { kind: 'euler', stepSeconds: taskStep, execution: 'separate-task' }
          : { kind: 'euler', stepSeconds: pick([0.002, 0.005, 0.01]) },
        policy: { memory: pick(['reset', 'retain'] as const), numericFault: pick(['signal-only', 'escalate'] as const) },
      };
      leaf.isXBridges = true;
      leaf.xBridgesModel = persisted as unknown as StateData['xBridgesModel'];
    }
  }

  const model = flatOrFixture();
  model.states = states;
  model.junctions = junctions;
  model.transitions = transitions;
  model.layers = layers;
  model.variables = [
    ...baseVariables(),
    ...(features.fixedPoint ? fixedVariables() : []),
    ...(features.xBridges ? [{ id: 'f0', name: 'f0', type: 'float' as const, initialValue: '0', currentValue: 0, visibleInScope: true }] : []),
    ...xbOutputs.map((output) => ({ id: output.name, name: output.name, type: output.type, initialValue: '0', currentValue: 0, visibleInScope: true })),
  ];
  if (features.fixedPoint && chance(0.5)) model.fixedPointRounding = 'nearest';
  if (features.externalFunctions) model.externalFunctions = EXTERNAL_FUNCTIONS.map((def) => ({ ...def, params: def.params.map((param) => ({ ...param })) }));
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

