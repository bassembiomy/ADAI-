/**
 * Reference washing machine (front loader, PMSM drum motor on an inverter) as an ADIA chart.
 *
 * Built only with what the application's screens create (scripts/lib/adiaEditorSession.ts holds the editor's own
 * operations): New State / New Region / Transition on the State Machine canvas and their panels, the Variables panel,
 * the Events editor, the State panel's History selector and Simulation-only option, the X-Bridges editor (palette
 * blocks, connections, Variable Mappings) and the chart settings (tick, code prefix).
 *
 * Structure (root parallel layer):
 *   Controller       the sequencer: Idle, Running (deep history), Paused, Done, Abort and Fault handling
 *   MotorSpeedLoop   X-Bridges state, separate 1 ms task: speed_cmd_rpm, drum_speed_rpm -> iq_ref
 *   Plant            simulation only: water level, water temperature, drum mechanics, unbalance onset
 *
 * Interface (names are the contract of washingMachineReference.test.ts):
 *   inputs    door_closed, water_level_mm, water_temp_c (fixdt(1,16,4)), drum_speed_rpm, unbalance, program
 *   events    START, PAUSE, CANCEL (input)
 *   outputs   door_lock, inlet_valve, drain_pump, heater, motor_enable, speed_cmd_rpm, iq_ref, fault_code, phase
 *   plant     plant_no_water, plant_unbalanced_load (fault injection, read by the plant only)
 */
import type { StateData, TransitionData, VariableDef, VariableType, FixedPointFormat } from '../../src/types/sm_types';
import { BLOCK_LIBRARY } from '../../src/engine/xbridges/BlockDefinitions';
import { migrateStateMachineModel } from '../../src/utils/stateMachine/smModelMigration';
import type { StateMachineModelV5 } from '../../src/utils/stateMachine/smModel';
import { createXBBoundaryMapping, listXBBoundaryTargets, syncXBBoundaryNodeMetadata } from '../../src/utils/stateMachine/xbBoundaryMappings';
import { createEventsPanel, createStateMachineEditor, createVariablesPanel } from '../../scripts/lib/adiaEditorSession';

export const TICK_MS = 10;
const s = (seconds: number) => Math.round((seconds * 1000) / TICK_MS);

export const PROGRAM = { COTTON_40: 0, QUICK_30: 1, SPIN_ONLY: 2 } as const;
export const PHASE = {
  IDLE: 0, LOCK_DOOR: 1, FILL: 2, HEAT: 3, WASH: 4, DRAIN: 5, RINSE: 6, SPIN: 7, DONE: 8, PAUSED: 9, FAULT: 10, ABORT: 11,
} as const;
/** fault_code values */
export const FAULT = { NONE: 0, NO_WATER: 1, HEAT_TIMEOUT: 2, DRAIN_TIMEOUT: 3, HEATER_DRY: 4 } as const;

/** Durations (seconds). Scaled so that QUICK_30 completes well inside 40 simulated minutes. */
export const TIMING = {
  doorLatch: 0.2, fillTimeout: 180, drainTimeout: 180, drainMin: 3, heatTimeout: 1200,
  agitate: 10, agitatePause: 3, rinseAgitateCycles: 4, distribution: 20, spinHold: 150,
} as const;

const FIXDT_TEMP: FixedPointFormat = { signed: true, wordLength: 16, fractionLength: 4 };

type Var = [name: string, type: VariableType, initial: string, fixed?: FixedPointFormat];
const VARIABLES: Var[] = [
  // sensors (the firmware writes them; in simulation the plant region does, door_closed and program are set by the user)
  ['door_closed', 'bool', 'false'], ['water_level_mm', 'int16', '0'], ['water_temp_c', 'fixdt', '20', FIXDT_TEMP],
  ['drum_speed_rpm', 'float', '0'], ['unbalance', 'bool', 'false'],
  // settings
  ['program', 'uint8', '0'],
  // actuators
  ['door_lock', 'bool', 'false'], ['inlet_valve', 'bool', 'false'], ['drain_pump', 'bool', 'false'], ['heater', 'bool', 'false'],
  ['motor_enable', 'bool', 'false'], ['speed_cmd_rpm', 'float', '0'], ['iq_ref', 'float', '0'],
  ['fault_code', 'uint8', '0'], ['phase', 'uint8', '0'],
  // program data (set when START is accepted) and counters
  ['cfg_fill_mm', 'int16', '0'], ['cfg_temp_c', 'float', '0'], ['cfg_heat', 'uint8', '0'],
  ['wash_left', 'uint8', '0'], ['rinse_left', 'uint8', '0'], ['rr_left', 'uint8', '0'],
  ['spin_attempts', 'uint8', '0'], ['spin_target', 'float', '0'],
  // plant: fault injection and states
  ['plant_no_water', 'bool', 'false'], ['plant_unbalanced_load', 'bool', 'false'],
  ['plant_level', 'double', '0'], ['plant_temp', 'double', '20'],
];

export function washingMachineChart(): StateMachineModelV5 {
  const panel = createVariablesPanel();
  for (const [name, type, initial, fixed] of VARIABLES) panel.add(name, type, initial, fixed, name);
  const eventsPanel = createEventsPanel();
  const eventId: Record<string, string> = {};
  for (const name of ['START', 'PAUSE', 'CANCEL']) eventId[name] = eventsPanel.add(name, 'input');

  const editor = createStateMachineEditor();
  const regionId: Record<string, string> = { root: 'root' };
  const stateId: Record<string, string> = {};
  const lastPriority: Record<string, number> = {};

  interface StateOptions { x?: number; y?: number; w?: number; h?: number; entry?: string; exit?: string; during?: string; auto?: boolean; parallel?: boolean; simulationOnly?: boolean; xb?: boolean }
  /** "New State" in a region, then the State panel (position, size, actions). */
  const state = (key: string, name: string, region: string, o: StateOptions = {}) => {
    const id = o.xb ? editor.createXBridgesState(regionId[region], name) : editor.createState(regionId[region], name);
    stateId[key] = id;
    lastPriority[region] = (lastPriority[region] ?? 0) + 10;
    editor.editState(id, {
      x: o.x ?? 0, y: o.y ?? 0, width: o.w ?? 200, height: o.h ?? 90, priority: lastPriority[region],
      ...(o.entry ? { entry: o.entry } : {}), ...(o.during ? { during: o.during } : {}), ...(o.exit ? { exit: o.exit } : {}),
      ...(o.auto ? { autostart: true } : {}), ...(o.parallel ? { isParallel: true } : {}),
      ...(o.simulationOnly ? { simulationOnly: true } : {}),
    });
  };
  /** Opening a state on the canvas gives it its region, named after the state. */
  const region = (key: string, ofState: string, name: string) => { regionId[key] = editor.createRegion(stateId[ofState], name); };

  interface Link { event?: string; guard?: string; after?: number; action?: string; order?: number }
  /** "Transition" between two states or a state and a junction, then the Transition panel. */
  const go = (source: string, target: string, o: Link = {}) => {
    const guard = o.guard ?? '';
    const type: TransitionData['type'] = o.after === undefined ? 'condition' : guard ? 'and' : 'after';
    const id = editor.createTransition(stateId[source] ?? source, stateId[target] ?? target);
    editor.editTransition(id, {
      condition: guard, action: o.action ?? '', type, afterTicks: o.after ?? null, order: o.order ?? 0,
      ...(o.event ? { event: eventId[o.event] } : {}),
    });
  };

  // ------------------------------------------------------------------ root: parallel regions
  state('Controller', 'Controller', 'root', { x: 0, y: 0, w: 1500, h: 1100, auto: true, parallel: true });
  state('MotorSpeedLoop', 'MotorSpeedLoop', 'root', { x: 1560, y: 0, w: 260, h: 120, auto: true, parallel: true, xb: true });
  state('Plant', 'Plant', 'root', { x: 1560, y: 200, w: 260, h: 120, auto: true, parallel: true, simulationOnly: true });
  region('ctl', 'Controller', 'Controller');
  region('plant', 'Plant', 'Plant');

  // ------------------------------------------------------------------ controller
  const IDLE_OUT = 'phase=0; door_lock=false; inlet_valve=false; drain_pump=false; heater=false; motor_enable=false; speed_cmd_rpm=0; fault_code=0;';
  state('Idle', 'Idle', 'ctl', { x: 20, y: 40, entry: IDLE_OUT, auto: true });
  state('Running', 'Running', 'ctl', { x: 320, y: 20, w: 1100, h: 780 });
  state('Paused', 'Paused', 'ctl', { x: 20, y: 240, entry: 'phase=9; motor_enable=false; heater=false; speed_cmd_rpm=0;' });
  state('Done', 'Done', 'ctl', { x: 20, y: 440, entry: 'phase=8; motor_enable=false; speed_cmd_rpm=0; door_lock=false;' });
  const SAFE_STOP = 'inlet_valve=false; heater=false; motor_enable=false; speed_cmd_rpm=0; drain_pump=true;';
  state('AbortDraining', 'AbortDraining', 'ctl', { x: 20, y: 640, entry: `phase=11; ${SAFE_STOP}`, exit: 'drain_pump=false;' });
  state('FaultDraining', 'FaultDraining', 'ctl', { x: 320, y: 860, entry: `phase=10; ${SAFE_STOP}`, exit: 'drain_pump=false;' });
  state('FaultStopped', 'FaultStopped', 'ctl', { x: 700, y: 860, entry: 'door_lock=false;' });

  region('run', 'Running', 'Running');
  state('LockDoor', 'LockDoor', 'run', { x: 20, y: 40, entry: 'phase=1; door_lock=true; motor_enable=false; speed_cmd_rpm=0;', auto: true });
  state('Fill', 'Fill', 'run', { x: 260, y: 40, entry: 'phase=2; inlet_valve=true;', exit: 'inlet_valve=false;' });
  state('Heat', 'Heat', 'run', { x: 500, y: 40, entry: 'phase=3; heater=true;', exit: 'heater=false;' });
  state('Wash', 'Wash', 'run', { x: 20, y: 200, w: 480, h: 200, entry: 'phase=4;', exit: 'motor_enable=false; speed_cmd_rpm=0;' });
  state('Drain', 'Drain', 'run', { x: 540, y: 200, entry: 'phase=5; drain_pump=true;', exit: 'drain_pump=false;' });
  state('Rinse', 'Rinse', 'run', { x: 20, y: 440, w: 640, h: 200, entry: 'phase=6;', exit: 'motor_enable=false; speed_cmd_rpm=0;' });
  state('Spin', 'Spin', 'run', { x: 700, y: 440, w: 380, h: 200, entry: 'phase=7;', exit: 'motor_enable=false;' });

  region('wash', 'Wash', 'Wash');
  state('WashCW', 'WashCW', 'wash', { x: 20, y: 40, entry: 'phase=4; motor_enable=true; speed_cmd_rpm=50;', auto: true });
  state('WashPauseA', 'WashPauseA', 'wash', { x: 240, y: 40, entry: 'speed_cmd_rpm=0;' });
  state('WashCCW', 'WashCCW', 'wash', { x: 460, y: 40, entry: 'speed_cmd_rpm=-50;' });
  state('WashPauseB', 'WashPauseB', 'wash', { x: 680, y: 40, entry: 'speed_cmd_rpm=0;' });

  region('rinse', 'Rinse', 'Rinse');
  state('RinseFill', 'RinseFill', 'rinse', { x: 20, y: 40, entry: 'phase=6; inlet_valve=true;', exit: 'inlet_valve=false;', auto: true });
  state('RinseCW', 'RinseCW', 'rinse', { x: 240, y: 40, entry: 'motor_enable=true; speed_cmd_rpm=50;' });
  state('RinsePauseA', 'RinsePauseA', 'rinse', { x: 460, y: 40, entry: 'speed_cmd_rpm=0;' });
  state('RinseCCW', 'RinseCCW', 'rinse', { x: 680, y: 40, entry: 'speed_cmd_rpm=-50;' });
  state('RinsePauseB', 'RinsePauseB', 'rinse', { x: 900, y: 40, entry: 'speed_cmd_rpm=0;' });
  state('RinseDrain', 'RinseDrain', 'rinse', { x: 900, y: 200, entry: 'phase=6; motor_enable=false; speed_cmd_rpm=0; drain_pump=true;', exit: 'drain_pump=false;' });

  region('spin', 'Spin', 'Spin');
  state('Distribute', 'Distribute', 'spin', { x: 20, y: 40, entry: 'phase=7; motor_enable=true; speed_cmd_rpm=90;', auto: true });
  state('SpinUp', 'SpinUp', 'spin', { x: 240, y: 40, entry: 'speed_cmd_rpm=spin_target;' });
  state('Brake', 'Brake', 'spin', { x: 460, y: 40, entry: 'speed_cmd_rpm=0;' });

  // The State panel's History selector: deep history in the region of Running.
  const deepHistory = editor.setHistory(stateId.Running, 'deep');

  const STOPPED_EMPTY = 'abs(drum_speed_rpm)<=1 && water_level_mm<=5';
  const START_OK = 'door_closed==true';
  const common = 'wash_left=0; rinse_left=0; spin_attempts=0;';
  go('Idle', 'Running', { event: 'START', order: 0, guard: `${START_OK} && program==${PROGRAM.COTTON_40}`,
    action: `cfg_fill_mm=90; cfg_temp_c=40; cfg_heat=1; ${common} wash_left=20; rinse_left=3; spin_target=1200;` });
  go('Idle', 'Running', { event: 'START', order: 1, guard: `${START_OK} && program==${PROGRAM.QUICK_30}`,
    action: `cfg_fill_mm=70; cfg_temp_c=0; cfg_heat=0; ${common} wash_left=24; rinse_left=2; spin_target=1000;` });
  go('Idle', 'Running', { event: 'START', order: 2, guard: `${START_OK} && program==${PROGRAM.SPIN_ONLY}`,
    action: `cfg_fill_mm=0; cfg_temp_c=0; cfg_heat=0; ${common} spin_target=1200;` });
  go('Running', 'Paused', { event: 'PAUSE', guard: 'fault_code==0', order: 0 });
  go('Running', 'AbortDraining', { event: 'CANCEL', order: 1 });
  go('Paused', deepHistory, { event: 'START', guard: START_OK, order: 0 });
  go('Paused', 'AbortDraining', { event: 'CANCEL', order: 1 });
  go('AbortDraining', 'Idle', { guard: STOPPED_EMPTY });
  go('Done', 'Idle', { guard: 'door_closed==false', order: 0 });
  go('Done', 'Idle', { event: 'CANCEL', order: 1 });
  go('FaultDraining', 'FaultStopped', { guard: STOPPED_EMPTY });
  go('FaultStopped', 'Idle', { event: 'CANCEL' });

  // ---- Running
  go('LockDoor', 'Fill', { guard: 'wash_left>0', after: s(TIMING.doorLatch), order: 0 });
  go('LockDoor', 'Drain', { guard: 'wash_left==0', after: s(TIMING.doorLatch), order: 1 });
  go('Fill', 'Heat', { guard: 'water_level_mm>=cfg_fill_mm && cfg_heat==1', order: 0 });
  go('Fill', 'Wash', { guard: 'water_level_mm>=cfg_fill_mm && cfg_heat==0', order: 1 });
  go('Fill', 'FaultDraining', { after: s(TIMING.fillTimeout), action: `fault_code=${FAULT.NO_WATER};`, order: 2 });
  go('Heat', 'Wash', { guard: 'water_temp_c>=cfg_temp_c', order: 0 });
  go('Heat', 'FaultDraining', { guard: 'water_level_mm<60', action: `fault_code=${FAULT.HEATER_DRY};`, order: 1 });
  go('Heat', 'FaultDraining', { after: s(TIMING.heatTimeout), action: `fault_code=${FAULT.HEAT_TIMEOUT};`, order: 2 });
  go('Drain', 'Rinse', { guard: 'water_level_mm<=5 && rinse_left>0', after: s(TIMING.drainMin), order: 0 });
  go('Drain', 'Spin', { guard: 'water_level_mm<=5 && rinse_left==0', after: s(TIMING.drainMin), order: 1 });
  go('Drain', 'FaultDraining', { after: s(TIMING.drainTimeout), action: `fault_code=${FAULT.DRAIN_TIMEOUT};`, order: 2 });

  // ---- Wash: CW, pause, CCW, pause, repeated wash_left times
  go('WashCW', 'WashPauseA', { after: s(TIMING.agitate) });
  go('WashPauseA', 'WashCCW', { after: s(TIMING.agitatePause) });
  go('WashCCW', 'WashPauseB', { after: s(TIMING.agitate) });
  go('WashPauseB', 'WashCW', { guard: 'wash_left>1', after: s(TIMING.agitatePause), action: 'wash_left=wash_left-1;', order: 0 });
  go('WashPauseB', 'Drain', { guard: 'wash_left<=1', after: s(TIMING.agitatePause), action: 'wash_left=0;', order: 1 });

  // ---- Rinse: fill, agitate, drain, rinse_left times
  go('RinseFill', 'RinseCW', { guard: 'water_level_mm>=cfg_fill_mm', action: `rr_left=${TIMING.rinseAgitateCycles};`, order: 0 });
  go('RinseFill', 'FaultDraining', { after: s(TIMING.fillTimeout), action: `fault_code=${FAULT.NO_WATER};`, order: 1 });
  go('RinseCW', 'RinsePauseA', { after: s(TIMING.agitate) });
  go('RinsePauseA', 'RinseCCW', { after: s(TIMING.agitatePause) });
  go('RinseCCW', 'RinsePauseB', { after: s(TIMING.agitate) });
  go('RinsePauseB', 'RinseCW', { guard: 'rr_left>1', after: s(TIMING.agitatePause), action: 'rr_left=rr_left-1;', order: 0 });
  go('RinsePauseB', 'RinseDrain', { guard: 'rr_left<=1', after: s(TIMING.agitatePause), order: 1 });
  go('RinseDrain', 'RinseFill', { guard: 'water_level_mm<=5 && rinse_left>1', after: s(TIMING.drainMin), action: 'rinse_left=rinse_left-1;', order: 0 });
  go('RinseDrain', 'Spin', { guard: 'water_level_mm<=5 && rinse_left<=1', after: s(TIMING.drainMin), action: 'rinse_left=0;', order: 1 });
  go('RinseDrain', 'FaultDraining', { after: s(TIMING.drainTimeout), action: `fault_code=${FAULT.DRAIN_TIMEOUT};`, order: 2 });

  // ---- Spin: distribution, ramp with unbalance check (3 attempts, then reduced spin), brake
  go('Distribute', 'SpinUp', { guard: 'unbalance==false && abs(drum_speed_rpm-90)<10', after: s(TIMING.distribution) });
  go('SpinUp', 'Distribute', { guard: 'unbalance==true && spin_target>400 && spin_attempts>=2', action: 'spin_attempts=3; spin_target=400;', order: 0 });
  go('SpinUp', 'Distribute', { guard: 'unbalance==true && spin_target>400', action: 'spin_attempts=spin_attempts+1;', order: 1 });
  go('SpinUp', 'Brake', { after: s(TIMING.spinHold), order: 2 });
  go('Brake', 'Done', { guard: STOPPED_EMPTY });

  // ------------------------------------------------------------------ plant (simulation only)
  const PLANT = 'plant';
  state('Hydraulics', 'Hydraulics', PLANT, { x: 20, y: 20, w: 240, h: 100, parallel: true, auto: true });
  state('Thermal', 'Thermal', PLANT, { x: 280, y: 20, w: 240, h: 100, parallel: true, auto: true });
  state('DrumMechanics', 'DrumMechanics', PLANT, { x: 540, y: 20, w: 240, h: 100, parallel: true, auto: true });
  state('UnbalanceOnset', 'UnbalanceOnset', PLANT, { x: 800, y: 20, w: 240, h: 100, parallel: true, auto: true });
  region('hyd', 'Hydraulics', 'Hydraulics');
  region('thermal', 'Thermal', 'Thermal');
  region('drum', 'DrumMechanics', 'DrumMechanics');
  region('unb', 'UnbalanceOnset', 'UnbalanceOnset');

  // Water level: inlet 1.5 mm/s (none without water), drain pump 2 mm/s, never below empty.
  state('TubRest', 'TubRest', 'hyd', { x: 20, y: 40, auto: true });
  state('TubFilling', 'TubFilling', 'hyd', { x: 240, y: 40, during: 'plant_level = plant_level + 0.015; water_level_mm = plant_level;' });
  state('TubDraining', 'TubDraining', 'hyd', { x: 460, y: 40,
    during: 'plant_level = plant_level - 0.02; plant_level = (plant_level + abs(plant_level))/2; water_level_mm = plant_level;' });
  go('TubRest', 'TubFilling', { guard: 'inlet_valve==true && plant_no_water==false', order: 0 });
  go('TubRest', 'TubDraining', { guard: 'drain_pump==true', order: 1 });
  go('TubFilling', 'TubRest', { guard: 'inlet_valve==false || plant_no_water==true' });
  go('TubDraining', 'TubRest', { guard: 'drain_pump==false' });
  // Water temperature: cold inlet water (20 C), heater 0.04 K/s, slow cooling towards 20 C.
  state('DryTub', 'DryTub', 'thermal', { x: 20, y: 40, auto: true, during: 'plant_temp = 20; water_temp_c = plant_temp;' });
  state('Cooling', 'Cooling', 'thermal', { x: 240, y: 40, during: 'plant_temp = plant_temp - 0.0000014*(plant_temp-20); water_temp_c = plant_temp;' });
  state('Heating', 'Heating', 'thermal', { x: 460, y: 40, during: 'plant_temp = plant_temp + 0.0004 - 0.0000014*(plant_temp-20); water_temp_c = plant_temp;' });
  go('DryTub', 'Cooling', { guard: 'water_level_mm>2' });
  go('Cooling', 'DryTub', { guard: 'water_level_mm<=2', order: 0 });
  go('Cooling', 'Heating', { guard: 'heater==true', order: 1 });
  go('Heating', 'DryTub', { guard: 'water_level_mm<=2', order: 0 });
  go('Heating', 'Cooling', { guard: 'heater==false', order: 1 });
  // Drum: 40 rpm/s per ampere of iq_ref while the inverter is enabled, drag grows with the water in the drum.
  state('MotorOff', 'MotorOff', 'drum', { x: 20, y: 40, auto: true,
    during: 'drum_speed_rpm = drum_speed_rpm - 0.01*drum_speed_rpm*(0.05 + 0.0004*water_level_mm);' });
  state('MotorOn', 'MotorOn', 'drum', { x: 300, y: 40,
    during: 'drum_speed_rpm = drum_speed_rpm + 0.01*(40*iq_ref - drum_speed_rpm*(0.05 + 0.0004*water_level_mm));' });
  go('MotorOff', 'MotorOn', { guard: 'motor_enable==true' });
  go('MotorOn', 'MotorOff', { guard: 'motor_enable==false' });
  // Unbalance: a lopsided load shakes the drum above 350 rpm; redistribution below 100 rpm clears it.
  state('Balanced', 'Balanced', 'unb', { x: 20, y: 40, auto: true, entry: 'unbalance=false;' });
  state('Unbalanced', 'Unbalanced', 'unb', { x: 300, y: 40, entry: 'unbalance=true;' });
  go('Balanced', 'Unbalanced', { guard: 'plant_unbalanced_load==true && abs(drum_speed_rpm)>350' });
  go('Unbalanced', 'Balanced', { guard: 'abs(drum_speed_rpm)<100' });

  // ------------------------------------------------------------------ motor speed loop (X-Bridges state)
  const nodes: unknown[] = [];
  const edges: unknown[] = [];
  /** A palette block dropped on the workspace, as XbridgesWorkspace creates it. */
  const block = (id: string, type: string, x: number, y: number, params: Record<string, unknown> = {}, label?: string) => {
    const definition = BLOCK_LIBRARY[type](id, params);
    nodes.push({ id, type: 'xblock', position: { x, y }, data: { ...definition, ...(label ? { label } : {}), parentId: 'root', selected: false } });
  };
  const wire = (from: string, fromPort: string, to: string, toPort: string) => {
    edges.push({ id: `edge-${from}-${to}-${toPort}`, source: from, sourceHandle: fromPort, target: to, targetHandle: toPort, type: 'default', style: { stroke: '#4caf50', strokeWidth: 3 } });
  };
  block('in_cmd', 'Inport', 0, 0, {}, 'speed_cmd_rpm');
  block('limit', 'RATE_LIMITER', 220, 0, { risingSlewRate: 150, fallingSlewRate: -300, initialCondition: 0, sampleTime: 0.001 }, 'ramp');
  block('in_speed', 'Inport', 0, 160, {}, 'drum_speed_rpm');
  block('pi', 'SPEED_CONTROLLER', 460, 60, { Kp: 0.05, Ki: 0.5, maxIq: 10 }, 'speed PI');
  block('out_iq', 'Outport', 700, 60, {}, 'iq_ref');
  wire('in_cmd', 'out', 'limit', 'u');
  wire('limit', 'y', 'pi', 'speed_ref');
  wire('in_speed', 'out', 'pi', 'speed_actual');
  wire('pi', 'iq_ref', 'out_iq', 'in');
  const mappings = [
    createXBBoundaryMapping(panel.idOf('speed_cmd_rpm'), listXBBoundaryTargets(nodes, 'in').find(t => t.blockId === 'in_cmd')!),
    createXBBoundaryMapping(panel.idOf('drum_speed_rpm'), listXBBoundaryTargets(nodes, 'in').find(t => t.blockId === 'in_speed')!),
    createXBBoundaryMapping(panel.idOf('iq_ref'), listXBBoundaryTargets(nodes, 'out').find(t => t.blockId === 'out_iq')!),
  ];
  // The X-Bridges editor saves the workspace; the Variable Mappings panel's boundary mappings tag the Inport / Outport blocks.
  editor.saveXBridges(stateId.MotorSpeedLoop, syncXBBoundaryNodeMetadata(nodes, mappings), edges, mappings);
  // NOT expressible in the application: it has no control for the embedded solver step or execution mode of an
  // X-Bridges state (a new one is Euler, 10 ms, in-tick). The contract needs the 1 ms separate task.
  editor.setEmbeddedSolver(stateId.MotorSpeedLoop, { kind: 'euler', stepSeconds: 0.001, execution: 'separate-task' });

  const snapshot = editor.snapshot;
  const migrated = migrateStateMachineModel({
    tickMs: TICK_MS, states: snapshot.states as StateData[], junctions: snapshot.junctions, transitions: snapshot.transitions,
    variables: panel.variables as VariableDef[], layers: snapshot.layers, safetyMode: false,
    events: eventsPanel.events, codePrefix: 'WM', diagrams: snapshot.diagrams,
  });
  const errors = migrated.diagnostics.filter(item => item.severity === 'error');
  if (errors.length > 0) throw new Error(`washing machine chart: ${errors.map(item => item.message).join('; ')}`);
  return migrated.model;
}
