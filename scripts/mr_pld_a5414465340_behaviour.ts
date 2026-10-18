/**
 * Behaviour half of MR_PLD_A5414465340.adia: the executable state machine, its
 * variables and the HMI panel, built from package OperationalBehavior of
 * models/mr_pld_a5414465340/MR_PLD_A5414465340.sysml.
 *
 * The state machine has one orthogonal (AND) root region per behaviour owner:
 *   MR_PLD_OperatingStates  exhibited by MR_PLD_ECU          (state def, 11 states, 24 transitions)
 *   InjectionMicroCycle     executed by PLD_C1_1             (state def, 6 states, 8 transitions)
 *   SyncSupervisor          CAPCOM of SAK_C167CS_LM          (enum SyncMode)
 *   ThermalFanControl       PV3 of ValveAndStarterDrivers    (REQ-THM-08 thresholds)
 *   SensorDiagnostics       NTC channel of SensorAFE         (enum SensorFaultMode, REQ-DIAG-07 window)
 *
 * `accept Signal` becomes a Boolean event variable with the Signal's name; the
 * transition that accepts it consumes it (`Signal=false;`), so an event that no
 * transition accepts in the current state has no effect, as in UML. `if guard`
 * stays a guard on the state def attributes (rpm, coolantC, immoValid, ckpValid,
 * cmpValid). `accept after t [s]` becomes an `after` transition in ticks of
 * TICK_MS. The monitoring regions raise the source Signals (CkpLost, CmpLost,
 * CkpRestored, SyncLost, OvertempDetected, OvertempCleared) from the sensor
 * levels, so the chain sensor -> event -> operating mode runs on its own.
 */
import type { JunctionData, Layer, StateData, TransitionData, VariableDef } from '../src/types/sm_types';

export const TICK_MS = 1;

type VarType = VariableDef['type'];
const VARIABLES: Array<[string, VarType, string]> = [
  // ---- Signals accepted by MR_PLD_OperatingStates (events)
  ['KL15_On', 'bool', 'false'], ['KL15_Off', 'bool', 'false'], ['KL50_CrankRequest', 'bool', 'false'],
  ['BlockStartButton', 'bool', 'false'], ['BlockStopButton', 'bool', 'false'], ['SelfTestPassed', 'bool', 'false'],
  ['ImmoRejected', 'bool', 'false'], ['EngineRunning', 'bool', 'false'], ['EngineStopped', 'bool', 'false'],
  ['SyncLost', 'bool', 'false'], ['CkpLost', 'bool', 'false'], ['CkpRestored', 'bool', 'false'], ['CmpLost', 'bool', 'false'],
  ['OvertempDetected', 'bool', 'false'], ['OvertempCleared', 'bool', 'false'], ['BankShortDetected', 'bool', 'false'],
  ['CanTimeout', 'bool', 'false'], ['CanRestored', 'bool', 'false'], ['EngineBrakeRequest', 'bool', 'false'],
  ['EngineBrakeRelease', 'bool', 'false'], ['AfterrunComplete', 'bool', 'false'],
  // ---- Signals accepted by InjectionMicroCycle (events)
  ['SoiTrigger', 'bool', 'false'], ['PeakCurrentReached', 'bool', 'false'], ['BipDetected', 'bool', 'false'],
  ['EoiTrigger', 'bool', 'false'], ['OvercurrentTrip', 'bool', 'false'],
  // ---- attributes of state def MR_PLD_OperatingStates (guards). Validity flags and the flags one region
  //      reads from another are 0/1 levels (uint8), not events: they stay set while the condition holds.
  ['rpm', 'double', '0'], ['coolantC', 'double', '20'], ['immoValid', 'uint8', '0'],
  ['ckpValid', 'uint8', '1'], ['cmpValid', 'uint8', '1'],
  // ---- SensorDiagnostics inputs: B65 ECT pin voltage (X2-34) and plausibility
  ['vEctPin', 'double', '2.5'], ['sensorDrift', 'uint8', '0'],
  // ---- outputs driven by the entry / do / exit actions
  ['powerLatch', 'uint8', '0'],        // powerLatchOn / release in ST_AFTERRUN
  ['starter', 'bool', 'false'],           // starterOn / starterOff (X2-18, X1-12)
  ['injEnable', 'uint8', '0'],         // injection enabled (start fuel, run, limp)
  ['engineBrakeValves', 'bool', 'false'], // engineBrakeValvesOn / Off (PV1 + PV2)
  ['torqueLimitPct', 'double', '100'],    // applyTorqueLimit
  ['speedLimited', 'bool', 'false'],      // <= 1800 rpm on CMP only (REQ-LIMP-09)
  ['dtcImmo', 'bool', 'false'],           // storeImmoFault (MR 9964)
  ['driversTristated', 'uint8', '0'],  // tristateDrivers
  ['eepromWrite', 'bool', 'false'],       // writeEeprom
  ['hsGate', 'bool', 'false'], ['lsGate', 'bool', 'false'], ['holdChop', 'bool', 'false'], ['cylCutoff', 'bool', 'false'],
  ['syncMode', 'int', '0'],               // SyncMode: 0 BOTH, 1 CMP_ONLY, 2 CKP_ONLY, 3 NONE
  ['pv3DutyPct', 'double', '0'], ['warnLamp', 'bool', 'false'],
  ['sensorFaultMode', 'int', '0'],        // SensorFaultMode: 0 NORMAL, 1 OPEN, 2 SCG, 3 SCB, 4 DRIFT
  ['dtcSensor', 'bool', 'false'], ['useSubstitute', 'bool', 'false'],
];

export const variables: VariableDef[] = VARIABLES.map(([name, type, initialValue]) => ({
  id: `v_${name}`, name, type, initialValue,
  currentValue: type === 'bool' ? initialValue === 'true' : Number(initialValue),
  visibleInScope: true, overflowPolicy: 'saturate',
}));

// ------------------------------------------------------------ state machine
export const states: StateData[] = [];
export const transitions: TransitionData[] = [];
const COLORS = { region: '#64748b', pow: '#f59e0b', run: '#22c55e', warn: '#ef4444', stop: '#a855f7', idle: '#6c9ac6', inj: '#0ea5e9' };
let priority = 0;

interface StateOptions { w?: number; h?: number; entry?: string; during?: string; exit?: string; auto?: boolean; color?: keyof typeof COLORS; safe?: boolean; parallel?: boolean }
function state(id: string, name: string, layer: string, x: number, y: number, o: StateOptions = {}) {
  priority += 10;
  states.push({
    id, name, x, y, width: o.w ?? 190, height: o.h ?? 110, entry: o.entry ?? '', during: o.during ?? '', exit: o.exit ?? '',
    isActive: false, color: COLORS[o.color ?? 'idle'], parentId: layer, children: [], priority, isParallel: o.parallel ?? false, regionId: null,
    autostart: o.auto ?? false, historyType: 'none', internalTransitions: '', ...(o.safe ? { isSafeState: true } : {}),
  });
}

/** `accept <event> [if guard]`: the event is consumed by the transition that accepts it. */
function accept(id: string, source: string, target: string, event: string | null, guard = '', o: { order?: number; action?: string; afterS?: number } = {}) {
  const condition = [event ? `${event}==true` : '', guard].filter(Boolean).join(' && ');
  const afterTicks = o.afterS === undefined ? null : Math.max(1, Math.round((o.afterS * 1000) / TICK_MS));
  const type: TransitionData['type'] = afterTicks === null ? 'condition' : condition ? 'and' : 'after';
  const action = [event ? `${event}=false;` : '', o.action ?? ''].filter(Boolean).join(' ');
  transitions.push({ id, sourceId: source, targetId: target, condition, action, afterTicks, type, hasControlPoint: false, order: o.order ?? 0, isInternal: false });
}

// Root: one orthogonal region per behaviour owner. Every region starts with the machine (AutoStart on all
// parallel children) and never exits; its one internal transition discards the stale events of that region
// (UML: an event that no transition accepts is lost) or keeps its outputs consistent.
const REGIONS: Array<[string, string, string, number, number, number, number, string]> = [
  // id, name (<owner block>_<behaviour>, a C identifier), child layer, x, y, w, h (overview box; open it for the states), internal transition
  ['SM_OperatingStates', 'MR_PLD_ECU_OperatingStates', 'lay_OperatingStates', 0, 0, 340, 160,
    '[KL15_On==true && powerLatch==1 && eepromWrite==false] / KL15_On=false;'],
  ['SM_InjectionMicroCycle', 'PLD_C1_1_InjectionMicroCycle', 'lay_InjectionMicroCycle', 380, 0, 340, 160,
    '[SoiTrigger==true && injEnable==0] / SoiTrigger=false;'],
  ['SM_SyncSupervisor', 'SAK_C167CS_LM_SyncSupervisor', 'lay_SyncSupervisor', 760, 0, 340, 160,
    '[SyncLost==true && ckpValid==1 && cmpValid==1] / SyncLost=false;'],
  ['SM_ThermalFanControl', 'ValveAndStarterDrivers_ThermalFanControl', 'lay_ThermalFanControl', 190, 220, 340, 160,
    '[OvertempDetected==true && coolantC<100] / OvertempDetected=false;'],
  ['SM_SensorDiagnostics', 'SensorAFE_SensorDiagnostics', 'lay_SensorDiagnostics', 570, 220, 340, 160,
    '[useSubstitute==true && sensorFaultMode==0] / useSubstitute=false;'],
];
// isParallel marks the children of an AND layer (the loader derives the decomposition from it)
for (const [id, name, , x, y, w, h, internal] of REGIONS) {
  state(id, name, 'root', x, y, { w, h, color: 'region', parallel: true, auto: true });
  states[states.length - 1].internalTransitions = internal;
}

// ---- MR_PLD_OperatingStates (exhibited by MR_PLD_ECU)
const OP = 'lay_OperatingStates';
state('ST_STANDBY', 'ST_STANDBY', OP, 0, 0, { auto: true, entry: 'powerLatch=0; injEnable=0; starter=false;' });
state('ST_INIT_IMMO', 'ST_INIT_IMMO', OP, 280, 0, { color: 'pow', entry: 'powerLatch=1; dtcImmo=false; driversTristated=0;' });
state('ST_IMMO_LOCKED', 'ST_IMMO_LOCKED', OP, 280, 260, { color: 'warn', entry: 'dtcImmo=true; starter=false; injEnable=0;' });
state('ST_READY', 'ST_READY', OP, 560, 0, { color: 'pow', entry: 'starter=false; injEnable=0;' });
state('ST_CRANK_SYNC', 'ST_CRANK_SYNC', OP, 840, 0, { color: 'pow', entry: 'starter=true; injEnable=1;', exit: 'starter=false;' });
state('ST_RUN', 'ST_RUN', OP, 840, 260, { w: 560, h: 220, color: 'run', entry: 'injEnable=1;' });
state('ST_LIMP_DERATE', 'ST_LIMP_DERATE', OP, 560, 560, { color: 'warn', entry: 'torqueLimitPct=65; speedLimited=true; injEnable=1;', exit: 'torqueLimitPct=100; speedLimited=false;' });
state('ST_FAULT_SHUTDOWN', 'ST_FAULT_SHUTDOWN', OP, 980, 560, { color: 'warn', entry: 'driversTristated=1; injEnable=0;', safe: true });
state('ST_AFTERRUN', 'ST_AFTERRUN', OP, 0, 560, { color: 'stop', entry: 'injEnable=0; starter=false;', during: 'eepromWrite=true;', exit: 'eepromWrite=false; driversTristated=0;' });
// ST_RUN region
const RUN = 'lay_RUN';
state('ST_RUN_NORMAL', 'ST_RUN_NORMAL', RUN, 0, 0, { auto: true, color: 'run', entry: 'torqueLimitPct=100; speedLimited=false; injEnable=1;' });
state('ST_ENGINE_BRAKE', 'ST_ENGINE_BRAKE', RUN, 300, 0, { color: 'run', entry: 'engineBrakeValves=true; injEnable=0;', exit: 'engineBrakeValves=false; injEnable=1;' });

accept('brakeOn', 'ST_RUN_NORMAL', 'ST_ENGINE_BRAKE', 'EngineBrakeRequest');
accept('brakeOff', 'ST_ENGINE_BRAKE', 'ST_RUN_NORMAL', 'EngineBrakeRelease');
accept('t01_wake', 'ST_STANDBY', 'ST_INIT_IMMO', 'KL15_On');
accept('t02_auth', 'ST_INIT_IMMO', 'ST_READY', 'SelfTestPassed', 'immoValid==1', { order: 1 });
accept('t03_reject', 'ST_INIT_IMMO', 'ST_IMMO_LOCKED', 'ImmoRejected', '', { order: 2 });
accept('t04_lockOff', 'ST_IMMO_LOCKED', 'ST_STANDBY', 'KL15_Off');
accept('t05_crank', 'ST_READY', 'ST_CRANK_SYNC', 'KL50_CrankRequest', 'rpm<300', { order: 1 });
accept('t06_blockStart', 'ST_READY', 'ST_CRANK_SYNC', 'BlockStartButton', 'rpm<300', { order: 2 });
accept('t07_started', 'ST_CRANK_SYNC', 'ST_RUN', 'EngineRunning', 'rpm>500', { order: 1 });
accept('t08_noSyncCrank', 'ST_CRANK_SYNC', 'ST_FAULT_SHUTDOWN', 'SyncLost', 'ckpValid==0 && cmpValid==0', { order: 2 });
accept('t14_syncLost', 'ST_RUN', 'ST_FAULT_SHUTDOWN', 'SyncLost', 'ckpValid==0 && cmpValid==0', { order: 0 });
accept('t09_ckpLost', 'ST_RUN', 'ST_LIMP_DERATE', 'CkpLost', 'ckpValid==0 && cmpValid==1', { order: 1 });
accept('t09b_cmpLost', 'ST_RUN', 'ST_LIMP_DERATE', 'CmpLost', 'cmpValid==0 && ckpValid==1', { order: 2 });
accept('t10_overtemp', 'ST_RUN', 'ST_LIMP_DERATE', 'OvertempDetected', 'coolantC>=103', { order: 3 });
accept('t11_bankShort', 'ST_RUN', 'ST_LIMP_DERATE', 'BankShortDetected', '', { order: 4 });
accept('t12_canLost', 'ST_RUN', 'ST_LIMP_DERATE', 'CanTimeout', '', { order: 5 });
accept('t16_stopBtn', 'ST_RUN', 'ST_AFTERRUN', 'BlockStopButton', '', { order: 6 });
accept('t17_keyOffRun', 'ST_RUN', 'ST_AFTERRUN', 'KL15_Off', '', { order: 7 });
accept('t15_syncLostLimp', 'ST_LIMP_DERATE', 'ST_FAULT_SHUTDOWN', 'SyncLost', 'ckpValid==0 && cmpValid==0', { order: 0 });
accept('t13_recover', 'ST_LIMP_DERATE', 'ST_RUN', 'CkpRestored', 'ckpValid==1 && coolantC<100', { order: 1 });
accept('t13b_cooledDown', 'ST_LIMP_DERATE', 'ST_RUN', 'OvertempCleared', 'ckpValid==1 && coolantC<100', { order: 2 });
accept('t18_keyOffLimp', 'ST_LIMP_DERATE', 'ST_AFTERRUN', 'KL15_Off', '', { order: 3 });
accept('t19_keyOffShut', 'ST_FAULT_SHUTDOWN', 'ST_AFTERRUN', 'KL15_Off');
accept('t20_keyOffReady', 'ST_READY', 'ST_STANDBY', 'KL15_Off', '', { order: 0 });
accept('t21_afterrunDone', 'ST_AFTERRUN', 'ST_STANDBY', 'AfterrunComplete', '', { order: 1 });
// Corner cases the source leaves open (documented in models/mr_pld_a5414465340/README.md)
accept('g01_keyOffInit', 'ST_INIT_IMMO', 'ST_STANDBY', 'KL15_Off', '', { order: 0 });
accept('g02_keyOffCrank', 'ST_CRANK_SYNC', 'ST_AFTERRUN', 'KL15_Off', '', { order: 0 });
accept('g03_stallRun', 'ST_RUN', 'ST_READY', 'EngineStopped', 'rpm<300', { order: 8 });
accept('g04_stallLimp', 'ST_LIMP_DERATE', 'ST_READY', 'EngineStopped', 'rpm<300', { order: 4 });
accept('g05_canRestored', 'ST_LIMP_DERATE', 'ST_RUN', 'CanRestored', 'ckpValid==1 && cmpValid==1 && coolantC<100', { order: 5 });
// key on again during after-run: the ECU is still latched on, so it re-authorises instead of shutting down
accept('g07_keyOnAfterrun', 'ST_AFTERRUN', 'ST_INIT_IMMO', 'KL15_On', '', { order: 0 });
accept('g06_stopBtnLimp', 'ST_LIMP_DERATE', 'ST_AFTERRUN', 'BlockStopButton', '', { order: 6 });

// ---- InjectionMicroCycle (executed by PLD_C1_1 with LM2901D feedback)
const INJ = 'lay_InjectionMicroCycle';
state('INJ_IDLE', 'IDLE', INJ, 0, 0, { auto: true, color: 'inj', entry: 'hsGate=false; lsGate=false;' });
state('INJ_PEAK', 'PEAK', INJ, 260, 0, { color: 'inj', entry: 'hsGate=true; lsGate=true;' });
state('INJ_BIP_WAIT', 'BIP_WAIT', INJ, 520, 0, { color: 'inj', entry: 'hsGate=false;' });
state('INJ_HOLD', 'HOLD', INJ, 780, 0, { color: 'inj', entry: 'holdChop=true;', exit: 'holdChop=false;' });
state('INJ_SPILL', 'SPILL', INJ, 780, 220, { color: 'inj', entry: 'hsGate=false; lsGate=false;' });
state('INJ_CYL_CUTOFF', 'CYL_CUTOFF', INJ, 390, 220, { color: 'warn', entry: 'hsGate=false; lsGate=false; cylCutoff=true;', exit: 'cylCutoff=false;' });
accept('i01_soi', 'INJ_IDLE', 'INJ_PEAK', 'SoiTrigger', 'injEnable==1 && driversTristated==0');
accept('i02_peak', 'INJ_PEAK', 'INJ_BIP_WAIT', 'PeakCurrentReached', '', { order: 1 });
accept('i03_bip', 'INJ_BIP_WAIT', 'INJ_HOLD', 'BipDetected', '', { order: 0 });
accept('i04_bipTimeout', 'INJ_BIP_WAIT', 'INJ_HOLD', null, '', { order: 1, afterS: 0.002 });
accept('i05_eoi', 'INJ_HOLD', 'INJ_SPILL', 'EoiTrigger', '', { order: 1 });
accept('i06_spillDone', 'INJ_SPILL', 'INJ_IDLE', null, '', { afterS: 0.0003 });
accept('i07_overPeak', 'INJ_PEAK', 'INJ_CYL_CUTOFF', 'OvercurrentTrip', '', { order: 0 });
accept('i08_overHold', 'INJ_HOLD', 'INJ_CYL_CUTOFF', 'OvercurrentTrip', '', { order: 0 });
// open coil: peak current (>= 4 A) never reached within 2 ms (REQ-INJ-04 doc)
accept('i09_openCoil', 'INJ_PEAK', 'INJ_CYL_CUTOFF', null, '', { order: 2, afterS: 0.002 });
accept('i10_powerDown', 'INJ_CYL_CUTOFF', 'INJ_IDLE', null, 'powerLatch==0');

// ---- SyncSupervisor (CAPCOM of SAK_C167CS_LM, enum SyncMode)
const SYN = 'lay_SyncSupervisor';
state('SYNC_BOTH', 'BOTH', SYN, 0, 0, { auto: true, color: 'run', entry: 'syncMode=0;' });
state('SYNC_CMP_ONLY', 'CMP_ONLY', SYN, 280, 0, { color: 'warn', entry: 'syncMode=1;' });
state('SYNC_CKP_ONLY', 'CKP_ONLY', SYN, 0, 220, { color: 'warn', entry: 'syncMode=2;' });
state('SYNC_NONE', 'NONE', SYN, 280, 220, { color: 'warn', entry: 'syncMode=3;' });
accept('s01_bothLost', 'SYNC_BOTH', 'SYNC_NONE', null, 'ckpValid==0 && cmpValid==0', { order: 0, action: 'SyncLost=true;' });
accept('s02_ckpLost', 'SYNC_BOTH', 'SYNC_CMP_ONLY', null, 'ckpValid==0', { order: 1, action: 'CkpLost=true; CkpRestored=false;' });
accept('s03_cmpLost', 'SYNC_BOTH', 'SYNC_CKP_ONLY', null, 'cmpValid==0', { order: 2, action: 'CmpLost=true;' });
accept('s04_ckpBack', 'SYNC_CMP_ONLY', 'SYNC_BOTH', null, 'ckpValid==1', { order: 1, action: 'CkpRestored=true; CkpLost=false;' });
accept('s05_cmpGone', 'SYNC_CMP_ONLY', 'SYNC_NONE', null, 'cmpValid==0', { order: 0, action: 'SyncLost=true;' });
accept('s06_cmpBack', 'SYNC_CKP_ONLY', 'SYNC_BOTH', null, 'cmpValid==1', { order: 1, action: 'CmpLost=false;' });
accept('s07_ckpGone', 'SYNC_CKP_ONLY', 'SYNC_NONE', null, 'ckpValid==0', { order: 0, action: 'SyncLost=true;' });
accept('s08_bothBack', 'SYNC_NONE', 'SYNC_BOTH', null, 'ckpValid==1 && cmpValid==1', { order: 0, action: 'SyncLost=false; CkpRestored=true;' });
accept('s09_cmpOnly', 'SYNC_NONE', 'SYNC_CMP_ONLY', null, 'cmpValid==1', { order: 1, action: 'SyncLost=false;' });
accept('s10_ckpOnly', 'SYNC_NONE', 'SYNC_CKP_ONLY', null, 'ckpValid==1', { order: 2, action: 'SyncLost=false; CkpRestored=true;' });

// ---- ThermalFanControl (PV3 fan clutch of ValveAndStarterDrivers, REQ-THM-08)
const FAN = 'lay_ThermalFanControl';
state('FAN_OFF', 'FAN_OFF', FAN, 0, 0, { auto: true, color: 'idle', entry: 'pv3DutyPct=0;' });
state('FAN_PWM', 'FAN_PWM', FAN, 260, 0, { color: 'pow', during: 'pv3DutyPct=(coolantC-92)*12.5;' });
state('FAN_FULL', 'FAN_FULL', FAN, 520, 0, { color: 'pow', entry: 'pv3DutyPct=100;' });
state('FAN_OVERTEMP', 'OVERTEMP', FAN, 780, 0, { color: 'warn', entry: 'pv3DutyPct=100; warnLamp=true;', exit: 'warnLamp=false;' });
accept('f01_on', 'FAN_OFF', 'FAN_PWM', null, 'coolantC>=92');
accept('f02_full', 'FAN_PWM', 'FAN_FULL', null, 'coolantC>=100', { order: 0 });
accept('f03_off', 'FAN_PWM', 'FAN_OFF', null, 'coolantC<92', { order: 1 });
accept('f04_hot', 'FAN_FULL', 'FAN_OVERTEMP', null, 'coolantC>=103', { order: 0, action: 'OvertempDetected=true; OvertempCleared=false;' });
accept('f05_pwm', 'FAN_FULL', 'FAN_PWM', null, 'coolantC<100', { order: 1 });
accept('f06_cooled', 'FAN_OVERTEMP', 'FAN_FULL', null, 'coolantC<100', { action: 'OvertempCleared=true; OvertempDetected=false;' });

// ---- SensorDiagnostics (B65 ECT channel of SensorAFE, enum SensorFaultMode, REQ-DIAG-07)
const DIA = 'lay_SensorDiagnostics';
const inWindow = 'vEctPin>=0.18 && vEctPin<=4.82 && sensorDrift==0';
state('DIAG_NORMAL', 'NORMAL', DIA, 0, 0, { auto: true, color: 'run', entry: 'sensorFaultMode=0; useSubstitute=false;' });
state('DIAG_OPEN', 'OPEN', DIA, 280, 0, { color: 'warn', entry: 'sensorFaultMode=1; dtcSensor=true; useSubstitute=true;' });
state('DIAG_SCG', 'SCG', DIA, 280, 140, { color: 'warn', entry: 'sensorFaultMode=2; dtcSensor=true; useSubstitute=true;' });
state('DIAG_SCB', 'SCB', DIA, 280, 280, { color: 'warn', entry: 'sensorFaultMode=3; dtcSensor=true; useSubstitute=true;' });
state('DIAG_DRIFT', 'DRIFT', DIA, 0, 280, { color: 'warn', entry: 'sensorFaultMode=4; dtcSensor=true; useSubstitute=true;' });
accept('d01_scg', 'DIAG_NORMAL', 'DIAG_SCG', null, 'vEctPin<0.18', { order: 0 });
accept('d02_scb', 'DIAG_NORMAL', 'DIAG_SCB', null, 'vEctPin>5.0', { order: 1 });
accept('d03_open', 'DIAG_NORMAL', 'DIAG_OPEN', null, 'vEctPin>4.82', { order: 2 });
accept('d04_drift', 'DIAG_NORMAL', 'DIAG_DRIFT', null, 'sensorDrift==1', { order: 3 });
for (const [id, from] of [['d05_okOpen', 'DIAG_OPEN'], ['d06_okScg', 'DIAG_SCG'], ['d07_okScb', 'DIAG_SCB'], ['d08_okDrift', 'DIAG_DRIFT']]) {
  accept(id, from, 'DIAG_NORMAL', null, inWindow);
}

// ---- layers
const layerOf = new Map(states.map(s => [s.id, s.parentId]));
const layer = (id: string, name: string, parentStateId: string | null, decomposition: 'OR' | 'AND'): Layer & { decomposition: 'OR' | 'AND' } => ({
  id, name, parentStateId, decomposition,
  stateIds: states.filter(s => s.parentId === id).map(s => s.id),
  transitionIds: transitions.filter(t => layerOf.get(t.sourceId) === id).map(t => t.id),
  junctionIds: [],
});
export const layers = [
  layer('root', 'MR_PLD_A5414465340_behaviour', null, 'AND'),
  ...REGIONS.map(([stateId, , layerId]) => layer(layerId, stateId.slice(3), stateId, 'OR')),
  layer(RUN, 'ST_RUN', 'ST_RUN', 'OR'),
];
export const junctions: JunctionData[] = [];

// ------------------------------------------------------------------- HMI
type Widget = Record<string, unknown>;
export const hmiComponents: Widget[] = [];
const widget = (id: string, type: string, name: string, x: number, y: number, variable: string | null, w = 150, h = 70, extra: Widget = {}) => {
  hmiComponents.push({ id, type, name, x, y, width: w, height: h, variableId: variable ? `v_${variable}` : null, min: 0, max: 100, ...extra });
};
// Laid out for the HMI Dashboard window (about 840 px wide): inputs, outputs, active states, trace.
widget('h_title', 'label', 'MR-PLD A 541 446 53 40 - OM 501 LA', 20, 10, null, 560, 40, { text: 'MR-PLD ECU A 541 446 53 40 (TEMIC 287699.01 B) - OM 501 LA.II/2-00 V6' });
widget('h_start', 'simulation-command', 'Start', 600, 10, null, 110, 44, { command: 'start' });
widget('h_reset', 'simulation-command', 'Reset', 720, 10, null, 110, 44, { command: 'reset' });
const EVENT_BUTTONS = ['KL15_On', 'KL15_Off', 'KL50_CrankRequest', 'BlockStartButton', 'BlockStopButton', 'SelfTestPassed', 'ImmoRejected',
  'EngineRunning', 'EngineStopped', 'EngineBrakeRequest', 'EngineBrakeRelease', 'BankShortDetected', 'CanTimeout', 'CanRestored',
  'AfterrunComplete', 'SoiTrigger', 'PeakCurrentReached', 'BipDetected', 'EoiTrigger', 'OvercurrentTrip'];
EVENT_BUTTONS.forEach((event, i) => widget(`h_ev_${event}`, 'pulse-button', event, 20 + (i % 5) * 165, 70 + Math.floor(i / 5) * 58, event, 155, 50));
['immoValid', 'ckpValid', 'cmpValid', 'sensorDrift'].forEach((name, i) => widget(`h_in_${name}`, 'toggle', name, 20 + i * 205, 310, name, 195, 60));
widget('h_rpm', 'slider', 'Engine speed [rpm]', 20, 380, 'rpm', 265, 80, { max: 2500, step: 10, precision: 0, unit: 'rpm' });
widget('h_ect', 'slider', 'Coolant [°C]', 295, 380, 'coolantC', 265, 80, { min: -40, max: 130, step: 1, precision: 0, unit: '°C' });
widget('h_vect', 'slider', 'ECT pin X2-34 [V]', 570, 380, 'vEctPin', 265, 80, { max: 5.5, step: 0.01, precision: 2, unit: 'V' });
const LAMPS: Array<[string, string]> = [['powerLatch', 'green'], ['starter', 'orange'], ['injEnable', 'green'], ['engineBrakeValves', 'yellow'],
  ['speedLimited', 'red'], ['dtcImmo', 'red'], ['driversTristated', 'red'], ['eepromWrite', 'blue'], ['hsGate', 'blue'], ['lsGate', 'blue'],
  ['holdChop', 'blue'], ['cylCutoff', 'red'], ['warnLamp', 'red'], ['dtcSensor', 'red'], ['useSubstitute', 'yellow']];
LAMPS.forEach(([name, color], i) => widget(`h_out_${name}`, 'lamp', name, 20 + (i % 5) * 165, 480 + Math.floor(i / 5) * 76, name, 155, 66, { color }));
widget('h_torque', 'gauge', 'Torque limit [%]', 20, 715, 'torqueLimitPct', 200, 160, { precision: 0, unit: '%' });
widget('h_fan', 'gauge', 'PV3 fan duty [%]', 230, 715, 'pv3DutyPct', 200, 160, { precision: 0, unit: '%' });
widget('h_sync', 'lcd', 'SyncMode (0 BOTH 1 CMP 2 CKP 3 NONE)', 440, 715, 'syncMode', 395, 74, { max: 3, precision: 0 });
widget('h_diag', 'lcd', 'SensorFaultMode (0 OK 1 OPEN 2 SCG 3 SCB 4 DRIFT)', 440, 800, 'sensorFaultMode', 395, 74, { max: 4, precision: 0 });
const INDICATED = ['ST_STANDBY', 'ST_INIT_IMMO', 'ST_IMMO_LOCKED', 'ST_READY', 'ST_CRANK_SYNC', 'ST_RUN_NORMAL', 'ST_ENGINE_BRAKE',
  'ST_LIMP_DERATE', 'ST_FAULT_SHUTDOWN', 'ST_AFTERRUN', 'INJ_IDLE', 'INJ_PEAK', 'INJ_BIP_WAIT', 'INJ_HOLD', 'INJ_SPILL', 'INJ_CYL_CUTOFF'];
INDICATED.forEach((stateId, i) => widget(`h_st_${stateId}`, 'active-state-indicator', stateId, 20 + (i % 4) * 205, 890 + Math.floor(i / 4) * 52, null, 195, 44, { stateId }));
widget('h_scope', 'dashboard-scope', 'Trace', 20, 1105, null, 815, 220, { variableIds: ['v_rpm', 'v_coolantC', 'v_torqueLimitPct', 'v_pv3DutyPct', 'v_syncMode'] });
