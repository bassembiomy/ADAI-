/**
 * ADAI code-generation demo model: "smart thermostat heater".
 * Committed so the walkthrough in docs/codegen-process-from-source.html can be re-run at any time:
 *
 *   npx tsx docs/codegen-demo/generate.ts --out docs/codegen-demo/evidence
 *
 * The model exercises every lowering path the emitter has:
 *   - root OR layer with a container state and a sibling safe state
 *   - a nested OR layer inside the container (standby / warming)
 *   - an AND (parallel) container with two regions, each with its own OR layer
 *   - a deep-history junction owned by the container's child layer ($H*$)
 *   - a timed transition (afterTicks), a guarded transition, a cross-boundary exit
 *   - entry / during / exit actions on container and leaf states
 */
import type {
  JunctionData,
  Layer,
  StateData,
  TransitionData,
  VariableDef,
} from '../../src/types/sm_types';
import {
  CURRENT_SM_SCHEMA_VERSION,
  defaultSMVerificationConfig,
  type StateMachineModelV5,
} from '../../src/utils/stateMachine/smModel';

type LayerV4 = Layer & { decomposition: 'OR' | 'AND' };

const state = (id: string, overrides: Partial<StateData> = {}): StateData => ({
  id,
  name: id,
  x: 0,
  y: 0,
  width: 100,
  height: 60,
  entry: '',
  during: '',
  exit: '',
  isActive: false,
  color: '#000000',
  parentId: null,
  children: [],
  priority: 1,
  isParallel: false,
  regionId: null,
  autostart: false,
  ...overrides,
});

const transition = (
  id: string,
  sourceId: string,
  targetId: string,
  overrides: Partial<TransitionData> = {},
): TransitionData => ({
  id,
  sourceId,
  targetId,
  condition: '',
  action: '',
  afterTicks: null,
  type: 'condition',
  hasControlPoint: false,
  order: 1,
  ...overrides,
});

const layer = (
  id: string,
  parentStateId: string | null,
  decomposition: 'OR' | 'AND',
  stateIds: string[],
  transitionIds: string[] = [],
  junctionIds: string[] = [],
): LayerV4 => ({
  id,
  name: id,
  parentStateId,
  decomposition,
  stateIds,
  transitionIds,
  junctionIds,
});

const variable = (
  id: string,
  type: VariableDef['type'],
  initialValue: string,
): VariableDef => ({
  id,
  name: id,
  type,
  initialValue,
  currentValue: type === 'bool' ? initialValue === 'true' : Number(initialValue),
  visibleInScope: true,
});

export const thermalControllerModel = (): StateMachineModelV5 => ({
  schemaVersion: CURRENT_SM_SCHEMA_VERSION,
  tickMs: 10,
  states: [
    state('heater', {
      name: 'Heater',
      autostart: true,
      entry: 'heat_cycles = 0U;',
      during: 'heat_cycles = heat_cycles + 1U;',
    }),
    state('overheat', {
      name: 'Overheat',
      priority: 2,
      isSafeState: true,
      entry: 'duty_cmd = 0U;',
    }),
    state('standby', {
      name: 'Standby',
      parentId: 'heater',
      autostart: true,
      entry: 'duty_cmd = 0U;',
    }),
    state('warming', {
      name: 'Warming',
      parentId: 'heater',
      priority: 2,
      entry: 'duty_cmd = 250U;',
      exit: 'duty_cmd = 0U;',
    }),
    state('pwm_bank', { name: 'PWM bank', parentId: 'warming', priority: 1 }),
    state('fan_bank', { name: 'Fan bank', parentId: 'warming', priority: 2 }),
    state('pwm_low', {
      name: 'PWM low',
      parentId: 'pwm_bank',
      autostart: true,
      during: 'duty_cmd = duty_cmd + 1U;',
    }),
    state('pwm_high', {
      name: 'PWM high',
      parentId: 'pwm_bank',
      priority: 2,
      during: 'duty_cmd = duty_cmd + 5U;',
    }),
    state('fan_low', { name: 'Fan low', parentId: 'fan_bank', autostart: true }),
    state('fan_high', { name: 'Fan high', parentId: 'fan_bank', priority: 2 }),
  ],
  junctions: [
    {
      id: 'heater_history',
      x: 0,
      y: 0,
      name: 'H*',
      color: '#000000',
      parentId: 'heater',
      type: 'deep-history',
    } as JunctionData,
  ],
  transitions: [
    transition('begin_warmup', 'standby', 'warming', {
      condition: 'start_cmd',
      action: 'heat_cycles = 0U;',
      order: 1,
    }),
    transition('pwm_step_up', 'pwm_low', 'pwm_high', {
      condition: '',
      afterTicks: 20,
      type: 'after',
      order: 2,
    }),
    transition('fan_step_up', 'fan_low', 'fan_high', {
      condition: 'start_cmd',
      order: 3,
    }),
    transition('resume_heater', 'overheat', 'heater_history', {
      condition: 'stop_cmd',
      order: 4,
    }),
    transition('trip_overheat', 'heater', 'overheat', {
      condition: 'over_temperature',
      order: 5,
    }),
  ],
  variables: [
    variable('start_cmd', 'bool', 'false'),
    variable('stop_cmd', 'bool', 'false'),
    variable('over_temperature', 'bool', 'false'),
    variable('duty_cmd', 'uint16', '0'),
    variable('heat_cycles', 'uint32', '0'),
    variable('setpoint_c', 'double', '180.0'),
  ],
  layers: [
    layer('root', null, 'OR', ['heater', 'overheat'], ['trip_overheat', 'resume_heater']),
    layer(
      'heater_children',
      'heater',
      'OR',
      ['standby', 'warming'],
      ['begin_warmup'],
      ['heater_history'],
    ),
    layer('warming_regions', 'warming', 'AND', ['pwm_bank', 'fan_bank']),
    layer('pwm_children', 'pwm_bank', 'OR', ['pwm_low', 'pwm_high'], ['pwm_step_up']),
    layer('fan_children', 'fan_bank', 'OR', ['fan_low', 'fan_high'], ['fan_step_up']),
  ],
  safetyMode: true,
  verification: {
    ...defaultSMVerificationConfig(),
    cStandard: 'c99',
    statementCoverageTarget: 100,
    branchCoverageTarget: 95,
    requireMcdc: false,
  },
});
