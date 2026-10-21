/**
 * Behaviour half of MR_PLD_A5414465340.adia: the executable state machine, its
 * variables and the HMI panel, built from package OperationalBehavior of
 * models/mr_pld_a5414465340/MR_PLD_A5414465340.sysml.
 *
 * The state machine has one orthogonal (AND) root region per behaviour, each named
 * `<owner block>_<behaviour>` after a block of the source:
 *
 *   ECU behaviour (the source's state defs and the monitors that raise their Signals)
 *     MR_PLD_ECU_OperatingStates            state def MR_PLD_OperatingStates (11 states, all 25 transitions)
 *     PLD_C1_1_InjectionMicroCycle          state def InjectionMicroCycle (6 states, 8 transitions)
 *     SAK_C167CS_LM_SyncSupervisor          enum SyncMode; CkpLost / CmpLost / CkpRestored / SyncLost / SyncLocked
 *     ValveAndStarterDrivers_ThermalFanControl  REQ-THM-08; OvertempDetected / OvertempCleared
 *     SensorAFE_SensorDiagnostics           enum SensorFaultMode, REQ-DIAG-07 window
 *     SAK_C167CS_LM_SelfTestAndEeprom       do runSelfTests (SelfTestPassed / ImmoRejected), do writeEeprom (AfterrunComplete)
 *     SAK_C167CS_LM_CanTimeout              CanTimeout / CanRestored from the IES-CAN frames of FR_CabECU
 *     SAK_C167CS_LM_SpeedMonitor            EngineRunning / EngineStopped from the CKP speed
 *     SAK_C167CS_LM_InjectionTiming         CAPCOM SoiTrigger / EoiTrigger
 *     InjectionPowerStage_CurrentSense      shunt + LM2901D: PeakCurrentReached / BipDetected / OvercurrentTrip / BankShortDetected
 *   Vehicle side (the test bench the HMI drives, as attributes of block SimulationScenario)
 *     FR_CabECU_DriverRequests              key switch (KeyState) -> KL15_On / KL15_Off / KL50_CrankRequest / EngineBrake*
 *     OM501LA_EngineSystem_EngineDynamics   starter + fuel -> engine speed (mrpld_sim.py: 220 rpm cranking, 600 + 13 * pedal running)
 *
 * `accept Signal` is a Boolean event variable with the Signal's name; the transition
 * that accepts it consumes it (`Signal=false;`). The monitor that raises a Signal clears
 * it again one tick later if no transition took it (UML: an event nobody accepts is
 * lost), except the fault Signals, which stay pending until the operating mode that
 * reacts to them is reached. `if guard` stays a guard on the state def attributes.
 * `accept after t [s]` becomes an `after` transition in ticks of TICK_MS.
 *
 * The operator works the HMI like the source's workstation simulator (block
 * SimulationScenario): key switch OFF / IGN / CRANK / RUN / BRAKE, accelerator pedal,
 * coolant temperature and the fault levels immoValid, ckpValid, cmpValid, canValid,
 * bank1Short. Everything else follows from the model.
 */
import type { JunctionData, Layer, StateData, TransitionData, VariableDef } from '../src/types/sm_types';
import type { HmiComponentType } from '../src/types/sysml_types';
import { createHmiDashboard, createStateMachineEditor, createVariablesPanel, type HmiPanelEdit } from './lib/adiaEditorSession';

export const TICK_MS = 1;
/**
 * Durations of the monitors, in ticks. The app runs about 15 to 60 ticks per second in a browser, so these are
 * scaled for the operator (each step takes one to three seconds on screen), not the physical milliseconds.
 */
export const BENCH_TICKS = { selfTest: 15, eepromWrite: 30, crankToFire: 20, canTimeout: 15, soiPeriod: 15, injection: 5 } as const;

type VarType = VariableDef['type'];
const VARIABLES: Array<[string, VarType, string]> = [
  // ---- Signals accepted by MR_PLD_OperatingStates (events)
  ['KL15_On', 'bool', 'false'], ['KL15_Off', 'bool', 'false'], ['KL50_CrankRequest', 'bool', 'false'],
  ['BlockStartButton', 'bool', 'false'], ['BlockStopButton', 'bool', 'false'], ['SelfTestPassed', 'bool', 'false'],
  ['ImmoRejected', 'bool', 'false'], ['EngineRunning', 'bool', 'false'], ['EngineStopped', 'bool', 'false'],
  ['SyncLost', 'bool', 'false'], ['CkpLost', 'bool', 'false'], ['CkpRestored', 'bool', 'false'], ['CmpLost', 'bool', 'false'],
  ['SyncLocked', 'bool', 'false'],
  ['OvertempDetected', 'bool', 'false'], ['OvertempCleared', 'bool', 'false'], ['BankShortDetected', 'bool', 'false'],
  ['CanTimeout', 'bool', 'false'], ['CanRestored', 'bool', 'false'], ['EngineBrakeRequest', 'bool', 'false'],
  ['EngineBrakeRelease', 'bool', 'false'], ['AfterrunComplete', 'bool', 'false'],
  // ---- Signals accepted by InjectionMicroCycle (events)
  ['SoiTrigger', 'bool', 'false'], ['PeakCurrentReached', 'bool', 'false'], ['BipDetected', 'bool', 'false'],
  ['EoiTrigger', 'bool', 'false'], ['OvercurrentTrip', 'bool', 'false'],
  // ---- operator inputs: the attributes of block SimulationScenario. Levels are 0/1 (uint8), not events.
  ['keyState', 'int', '0'],               // KeyState: 0 OFF, 1 IGN, 2 CRANK, 3 RUN, 4 BRAKE
  ['pedalPct', 'double', '0'],
  ['coolantC', 'double', '20'], ['immoValid', 'uint8', '1'],
  ['ckpValid', 'uint8', '1'], ['cmpValid', 'uint8', '1'], ['canValid', 'uint8', '1'], ['bank1Short', 'uint8', '0'],
  // ---- SensorDiagnostics inputs: B65 ECT pin voltage (X2-34) and plausibility
  ['vEctPin', 'double', '2.5'], ['sensorDrift', 'uint8', '0'],
  // ---- attribute of state def MR_PLD_OperatingStates computed by the engine (guards)
  ['rpm', 'double', '0'],
  // ---- outputs driven by the entry / do / exit actions
  ['powerLatch', 'uint8', '0'],        // powerLatchOn / release in ST_AFTERRUN
  ['selfTestRun', 'uint8', '0'],       // do action runSelfTests of ST_INIT_IMMO
  ['starter', 'uint8', '0'],           // starterOn / starterOff (X2-18, X1-12)
  ['injEnable', 'uint8', '0'],         // injection enabled (start fuel, run, limp)
  ['engineBrakeValves', 'uint8', '0'], // engineBrakeValvesOn / Off (PV1 + PV2)
  ['torqueLimitPct', 'double', '100'],    // applyTorqueLimit
  ['speedLimited', 'bool', 'false'],      // <= 1800 rpm on CMP only (REQ-LIMP-09)
  ['dtcImmo', 'bool', 'false'],           // storeImmoFault (MR 9964)
  ['driversTristated', 'uint8', '0'],  // tristateDrivers
  ['eepromWrite', 'uint8', '0'],       // do action writeEeprom of ST_AFTERRUN
  ['hsGate', 'uint8', '0'], ['lsGate', 'uint8', '0'], ['holdChop', 'uint8', '0'], ['cylCutoff', 'bool', 'false'],
  ['syncMode', 'int', '0'],               // SyncMode: 0 BOTH, 1 CMP_ONLY, 2 CKP_ONLY, 3 NONE
  ['pv3DutyPct', 'double', '0'], ['warnLamp', 'bool', 'false'],
  ['sensorFaultMode', 'int', '0'],        // SensorFaultMode: 0 NORMAL, 1 OPEN, 2 SCG, 3 SCB, 4 DRIFT
  ['dtcSensor', 'bool', 'false'], ['useSubstitute', 'bool', 'false'],
];

// Built with the editor's own operations (scripts/lib/adiaEditorSession.ts), as a user builds it.
const panel = createVariablesPanel();
for (const [name, type, initialValue] of VARIABLES) panel.add(name, type, initialValue);
export const variables: VariableDef[] = panel.variables;

// ------------------------------------------------------------ state machine
const editor = createStateMachineEditor();
/** the region (layer) id behind each key, the state id behind each key, and the state key behind each name */
const regionId: Record<string, string> = { root: 'root' };
const stateId: Record<string, string> = {};
/** the id the editor gave the state of each key */
export const STATE_ID: Readonly<Record<string, string>> = stateId;
export const STATE_KEY_BY_NAME: Record<string, string> = {};
const lastPriority: Record<string, number> = {};

interface StateOptions { w?: number; h?: number; entry?: string; during?: string; exit?: string; auto?: boolean; safe?: boolean; parallel?: boolean; internal?: string }
/** "New State" in a region, then the State panel (and the canvas position / size). */
function state(key: string, name: string, region: string, x: number, y: number, o: StateOptions = {}) {
  const id = editor.createState(regionId[region], name);
  stateId[key] = id;
  STATE_KEY_BY_NAME[name] = key;
  // the canvas gives every new state of a region the next priority
  lastPriority[region] = (lastPriority[region] ?? 0) + 10;
  editor.editState(id, {
    x, y, width: o.w ?? 190, height: o.h ?? 110, priority: lastPriority[region],
    ...(o.entry ? { entry: o.entry } : {}), ...(o.during ? { during: o.during } : {}), ...(o.exit ? { exit: o.exit } : {}),
    ...(o.auto ? { autostart: true } : {}), ...(o.parallel ? { isParallel: true } : {}), ...(o.safe ? { isSafeState: true } : {}),
    ...(o.internal ? { internalTransitions: o.internal } : {}),
  });
}
/** Opening a state on the canvas gives it its region, named after the state. */
function region(key: string, ofState: string, name: string) {
  regionId[key] = editor.createRegion(stateId[ofState], name);
}

/** `accept <event> [if guard]`: the event is consumed by the transition that accepts it. */
function accept(_key: string, source: string, target: string, event: string | null, guard = '', o: { order?: number; action?: string; afterS?: number; afterTicks?: number } = {}) {
  const condition = [event ? `${event}==true` : '', guard].filter(Boolean).join(' && ');
  const afterTicks = o.afterTicks ?? (o.afterS === undefined ? null : Math.max(1, Math.round((o.afterS * 1000) / TICK_MS)));
  const type: TransitionData['type'] = afterTicks === null ? 'condition' : condition ? 'and' : 'after';
  const action = [event ? `${event}=false;` : '', o.action ?? ''].filter(Boolean).join(' ');
  const id = editor.createTransition(stateId[source], stateId[target]);
  editor.editTransition(id, { condition, action, type, afterTicks, order: o.order ?? 0 });
}
/** A monitor transition: a guard on levels (and optionally a time in ticks) that raises Signals in its action. */
const when = (key: string, source: string, target: string, guard: string, o: { order?: number; action?: string; afterTicks?: number } = {}) =>
  accept(key, source, target, null, guard, o);

// Root: one orthogonal region per behaviour. Every region starts with the machine (AutoStart on all parallel
// children) and never exits; its one internal transition discards the stale events of that region (UML: an
// event that no transition accepts is lost) or keeps its outputs consistent. The creation order is the
// execution order of the regions in a tick (priority 10, 20, ...): the operating modes first, then the
// monitors that raise the Signals they accept one tick later.
const REGIONS: Array<[string, string, string, number, number, string]> = [
  // id, name (<owner block>_<behaviour>, a C identifier), child layer, x, y (overview box; open it for the states), internal transition
  ['SM_OperatingStates', 'MR_PLD_ECU_OperatingStates', 'lay_OperatingStates', 380, 0,
    '[KL15_On==true && powerLatch==1 && eepromWrite==0] / KL15_On=false;'],
  ['SM_InjectionMicroCycle', 'PLD_C1_1_InjectionMicroCycle', 'lay_InjectionMicroCycle', 380, 440,
    '[SoiTrigger==true && injEnable==0] / SoiTrigger=false;'],
  ['SM_SyncSupervisor', 'SAK_C167CS_LM_SyncSupervisor', 'lay_SyncSupervisor', 0, 220,
    '[SyncLost==true && ckpValid==1 && cmpValid==1] / SyncLost=false;'],
  ['SM_ThermalFanControl', 'ValveAndStarterDrivers_ThermalFanControl', 'lay_ThermalFanControl', 760, 220,
    '[OvertempDetected==true && coolantC<100] / OvertempDetected=false;'],
  ['SM_SensorDiagnostics', 'SensorAFE_SensorDiagnostics', 'lay_SensorDiagnostics', 1140, 220,
    '[useSubstitute==true && sensorFaultMode==0] / useSubstitute=false;'],
  ['SM_DriverRequests', 'FR_CabECU_DriverRequests', 'lay_DriverRequests', 0, 0,
    '[KL50_CrankRequest==true && keyState!=2] / KL50_CrankRequest=false;'],
  ['SM_SelfTestAndEeprom', 'SAK_C167CS_LM_SelfTestAndEeprom', 'lay_SelfTestAndEeprom', 760, 0,
    '[SelfTestPassed==true && selfTestRun==0] / SelfTestPassed=false;'],
  ['SM_CanTimeout', 'SAK_C167CS_LM_CanTimeout', 'lay_CanTimeout', 1140, 0,
    '[CanTimeout==true && canValid==1] / CanTimeout=false;'],
  ['SM_EngineDynamics', 'OM501LA_EngineSystem_EngineDynamics', 'lay_EngineDynamics', 1140, 440,
    '[rpm>0 && starter==0 && injEnable==0 && engineBrakeValves==0] / rpm=0;'],
  ['SM_SpeedMonitor', 'SAK_C167CS_LM_SpeedMonitor', 'lay_SpeedMonitor', 380, 220,
    '[EngineRunning==true && rpm<300] / EngineRunning=false;'],
  ['SM_InjectionTiming', 'SAK_C167CS_LM_InjectionTiming', 'lay_InjectionTiming', 0, 440,
    '[EoiTrigger==true && injEnable==0] / EoiTrigger=false;'],
  ['SM_CurrentSense', 'InjectionPowerStage_CurrentSense', 'lay_CurrentSense', 760, 440,
    '[OvercurrentTrip==true && hsGate==0 && lsGate==0] / OvercurrentTrip=false;'],
];
// isParallel marks the children of an AND layer (the loader derives the decomposition from it)
for (const [key, name, layerKey, x, y, internal] of REGIONS) {
  state(key, name, 'root', x, y, { w: 340, h: 160, parallel: true, auto: true, internal });
  region(layerKey, key, name);
}

// ---- MR_PLD_OperatingStates (exhibited by MR_PLD_ECU)
const OP = 'lay_OperatingStates';
// ST_STANDBY: power-down clears the RAM of the ECU, so a pending bank-short report does not survive a key cycle
state('ST_STANDBY', 'ST_STANDBY', OP, 0, 0, { auto: true, entry: 'powerLatch=0; injEnable=0; starter=0; BankShortDetected=false;' });
state('ST_INIT_IMMO', 'ST_INIT_IMMO', OP, 280, 0, { entry: 'powerLatch=1; dtcImmo=false; driversTristated=0; selfTestRun=1;', exit: 'selfTestRun=0;' });
state('ST_IMMO_LOCKED', 'ST_IMMO_LOCKED', OP, 280, 260, { entry: 'dtcImmo=true; starter=0; injEnable=0;' });
state('ST_READY', 'ST_READY', OP, 560, 0, { entry: 'starter=0; injEnable=0;' });
state('ST_CRANK_SYNC', 'ST_CRANK_SYNC', OP, 840, 0, { entry: 'starter=1; injEnable=1;', exit: 'starter=0;' });
state('ST_RUN', 'ST_RUN', OP, 840, 260, { w: 560, h: 220, entry: 'injEnable=1;' });
// entering limp discards the recovery Signals of an earlier episode, so only a recovery seen in limp ends it
state('ST_LIMP_DERATE', 'ST_LIMP_DERATE', OP, 560, 560, {
  entry: 'torqueLimitPct=65; speedLimited=true; injEnable=1; CkpRestored=false; SyncLocked=false; OvertempCleared=false; CanRestored=false;',
  exit: 'torqueLimitPct=100; speedLimited=false;',
});
state('ST_FAULT_SHUTDOWN', 'ST_FAULT_SHUTDOWN', OP, 980, 560, { entry: 'driversTristated=1; injEnable=0;', safe: true });
state('ST_AFTERRUN', 'ST_AFTERRUN', OP, 0, 560, { entry: 'injEnable=0; starter=0;', during: 'eepromWrite=1;', exit: 'eepromWrite=0; driversTristated=0;' });
// ST_RUN region
const RUN = 'lay_RUN';
region(RUN, 'ST_RUN', 'ST_RUN');
state('ST_RUN_NORMAL', 'ST_RUN_NORMAL', RUN, 0, 0, { auto: true, entry: 'torqueLimitPct=100; speedLimited=false; injEnable=1;' });
state('ST_ENGINE_BRAKE', 'ST_ENGINE_BRAKE', RUN, 300, 0, { entry: 'engineBrakeValves=1; injEnable=0;', exit: 'engineBrakeValves=0; injEnable=1;' });

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
// CMP back (or CKP and CMP back) after a CMP loss: the source only recovers on CkpRestored, which a CMP loss never raises
accept('g08_syncLocked', 'ST_LIMP_DERATE', 'ST_RUN', 'SyncLocked', 'ckpValid==1 && cmpValid==1 && coolantC<100', { order: 7 });

// ---- InjectionMicroCycle (executed by PLD_C1_1 with LM2901D feedback)
const INJ = 'lay_InjectionMicroCycle';
state('INJ_IDLE', 'IDLE', INJ, 0, 0, { auto: true, entry: 'hsGate=0; lsGate=0;' });
state('INJ_PEAK', 'PEAK', INJ, 260, 0, { entry: 'hsGate=1; lsGate=1;' });
state('INJ_BIP_WAIT', 'BIP_WAIT', INJ, 520, 0, { entry: 'hsGate=0;' });
state('INJ_HOLD', 'HOLD', INJ, 780, 0, { entry: 'holdChop=1;', exit: 'holdChop=0;' });
state('INJ_SPILL', 'SPILL', INJ, 780, 220, { entry: 'hsGate=0; lsGate=0;' });
state('INJ_CYL_CUTOFF', 'CYL_CUTOFF', INJ, 390, 220, { entry: 'hsGate=0; lsGate=0; cylCutoff=true;', exit: 'cylCutoff=false;' });
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
state('SYNC_BOTH', 'BOTH', SYN, 0, 0, { auto: true, entry: 'syncMode=0;' });
state('SYNC_CMP_ONLY', 'CMP_ONLY', SYN, 280, 0, { entry: 'syncMode=1;' });
state('SYNC_CKP_ONLY', 'CKP_ONLY', SYN, 0, 220, { entry: 'syncMode=2;' });
state('SYNC_NONE', 'NONE', SYN, 280, 220, { entry: 'syncMode=3;' });
when('s01_bothLost', 'SYNC_BOTH', 'SYNC_NONE', 'ckpValid==0 && cmpValid==0', { order: 0, action: 'SyncLost=true;' });
when('s02_ckpLost', 'SYNC_BOTH', 'SYNC_CMP_ONLY', 'ckpValid==0', { order: 1, action: 'CkpLost=true; CkpRestored=false;' });
when('s03_cmpLost', 'SYNC_BOTH', 'SYNC_CKP_ONLY', 'cmpValid==0', { order: 2, action: 'CmpLost=true;' });
when('s04_ckpBack', 'SYNC_CMP_ONLY', 'SYNC_BOTH', 'ckpValid==1', { order: 1, action: 'CkpRestored=true; CkpLost=false; SyncLocked=true;' });
when('s05_cmpGone', 'SYNC_CMP_ONLY', 'SYNC_NONE', 'cmpValid==0', { order: 0, action: 'SyncLost=true;' });
when('s06_cmpBack', 'SYNC_CKP_ONLY', 'SYNC_BOTH', 'cmpValid==1', { order: 1, action: 'CmpLost=false; SyncLocked=true;' });
when('s07_ckpGone', 'SYNC_CKP_ONLY', 'SYNC_NONE', 'ckpValid==0', { order: 0, action: 'SyncLost=true;' });
when('s08_bothBack', 'SYNC_NONE', 'SYNC_BOTH', 'ckpValid==1 && cmpValid==1', { order: 0, action: 'SyncLost=false; CkpRestored=true; SyncLocked=true;' });
when('s09_cmpOnly', 'SYNC_NONE', 'SYNC_CMP_ONLY', 'cmpValid==1', { order: 1, action: 'SyncLost=false;' });
when('s10_ckpOnly', 'SYNC_NONE', 'SYNC_CKP_ONLY', 'ckpValid==1', { order: 2, action: 'SyncLost=false; CkpRestored=true;' });

// ---- ThermalFanControl (PV3 fan clutch of ValveAndStarterDrivers, REQ-THM-08)
const FAN = 'lay_ThermalFanControl';
state('FAN_OFF', 'FAN_OFF', FAN, 0, 0, { auto: true, entry: 'pv3DutyPct=0;' });
state('FAN_PWM', 'FAN_PWM', FAN, 260, 0, { during: 'pv3DutyPct=(coolantC-92)*12.5;' });
state('FAN_FULL', 'FAN_FULL', FAN, 520, 0, { entry: 'pv3DutyPct=100;' });
state('FAN_OVERTEMP', 'OVERTEMP', FAN, 780, 0, { entry: 'pv3DutyPct=100; warnLamp=true;', exit: 'warnLamp=false;' });
when('f01_on', 'FAN_OFF', 'FAN_PWM', 'coolantC>=92');
when('f02_full', 'FAN_PWM', 'FAN_FULL', 'coolantC>=100', { order: 0 });
when('f03_off', 'FAN_PWM', 'FAN_OFF', 'coolantC<92', { order: 1 });
when('f04_hot', 'FAN_FULL', 'FAN_OVERTEMP', 'coolantC>=103', { order: 0, action: 'OvertempDetected=true; OvertempCleared=false;' });
when('f05_pwm', 'FAN_FULL', 'FAN_PWM', 'coolantC<100', { order: 1 });
when('f06_cooled', 'FAN_OVERTEMP', 'FAN_FULL', 'coolantC<100', { action: 'OvertempCleared=true; OvertempDetected=false;' });

// ---- SensorDiagnostics (B65 ECT channel of SensorAFE, enum SensorFaultMode, REQ-DIAG-07)
const DIA = 'lay_SensorDiagnostics';
const inWindow = 'vEctPin>=0.18 && vEctPin<=4.82 && sensorDrift==0';
state('DIAG_NORMAL', 'NORMAL', DIA, 0, 0, { auto: true, entry: 'sensorFaultMode=0; useSubstitute=false;' });
state('DIAG_OPEN', 'OPEN', DIA, 280, 0, { entry: 'sensorFaultMode=1; dtcSensor=true; useSubstitute=true;' });
state('DIAG_SCG', 'SCG', DIA, 280, 140, { entry: 'sensorFaultMode=2; dtcSensor=true; useSubstitute=true;' });
state('DIAG_SCB', 'SCB', DIA, 280, 280, { entry: 'sensorFaultMode=3; dtcSensor=true; useSubstitute=true;' });
state('DIAG_DRIFT', 'DRIFT', DIA, 0, 280, { entry: 'sensorFaultMode=4; dtcSensor=true; useSubstitute=true;' });
when('d01_scg', 'DIAG_NORMAL', 'DIAG_SCG', 'vEctPin<0.18', { order: 0 });
when('d02_scb', 'DIAG_NORMAL', 'DIAG_SCB', 'vEctPin>5.0', { order: 1 });
when('d03_open', 'DIAG_NORMAL', 'DIAG_OPEN', 'vEctPin>4.82', { order: 2 });
when('d04_drift', 'DIAG_NORMAL', 'DIAG_DRIFT', 'sensorDrift==1', { order: 3 });
for (const [id, from] of [['d05_okOpen', 'DIAG_OPEN'], ['d06_okScg', 'DIAG_SCG'], ['d07_okScb', 'DIAG_SCB'], ['d08_okDrift', 'DIAG_DRIFT']]) {
  when(id, from, 'DIAG_NORMAL', inWindow);
}

// ---- DriverRequests (FR_CabECU: the key switch and the engine brake switch of the cab, sd m01 / m06 / m07)
// keyState 0 OFF, 1 IGN, 2 CRANK, 3 RUN, 4 BRAKE. KL15 and KL50 are edges of the key; a Signal no state takes is
// dropped one tick later. KL50 stays requested while the key is held in CRANK, as on the vehicle.
const KEY = 'lay_DriverRequests';
state('KEY_OFF', 'KEY_OFF', KEY, 0, 0, { auto: true, during: 'KL15_Off=false;' });
state('KEY_ON', 'KEY_ON', KEY, 280, 0, { during: 'KL15_On=false; EngineBrakeRelease=false;', exit: 'KL15_On=false; EngineBrakeRelease=false;' });
state('KEY_CRANK', 'KEY_CRANK', KEY, 560, 0, { entry: 'KL50_CrankRequest=true;', during: 'KL50_CrankRequest=true;', exit: 'KL50_CrankRequest=false;' });
state('KEY_BRAKE', 'KEY_BRAKE', KEY, 280, 220, { entry: 'EngineBrakeRequest=true;', exit: 'EngineBrakeRequest=false;' });
when('k01_keyOn', 'KEY_OFF', 'KEY_ON', 'keyState!=0', { action: 'KL15_Off=false; KL15_On=true;' });
when('k02_keyOff', 'KEY_ON', 'KEY_OFF', 'keyState==0', { order: 0, action: 'KL15_Off=true;' });
when('k03_crank', 'KEY_ON', 'KEY_CRANK', 'keyState==2', { order: 1 });
when('k04_brake', 'KEY_ON', 'KEY_BRAKE', 'keyState==4 && pedalPct==0', { order: 2 });
// KL15 is still on when the ECU went back to standby (stop button, after-run done): it wakes the ECU again
when('k05_rewake', 'KEY_ON', 'KEY_ON', 'powerLatch==0', { order: 3, action: 'KL15_On=true;' });
when('k06_crankOff', 'KEY_CRANK', 'KEY_OFF', 'keyState==0', { order: 0, action: 'KL15_Off=true;' });
when('k07_crankRelease', 'KEY_CRANK', 'KEY_ON', 'keyState!=2', { order: 1 });
when('k08_brakeKeyOff', 'KEY_BRAKE', 'KEY_OFF', 'keyState==0', { order: 0, action: 'KL15_Off=true;' });
when('k09_brakeRelease', 'KEY_BRAKE', 'KEY_ON', 'keyState!=4 || pedalPct>0', { order: 1, action: 'EngineBrakeRelease=true;' });

// ---- SelfTestAndEeprom (SAK_C167CS_LM: do action runSelfTests of ST_INIT_IMMO with the IES-CAN immobiliser
// release frame of FR_CabECU, sd m03..m05; do action writeEeprom of ST_AFTERRUN into M93C86)
const MCU = 'lay_SelfTestAndEeprom';
state('MCU_IDLE', 'MCU_IDLE', MCU, 0, 0, { auto: true });
state('MCU_SELF_TEST', 'MCU_SELF_TEST', MCU, 280, 0);
state('MCU_TEST_DONE', 'MCU_TEST_DONE', MCU, 560, 0, { during: 'SelfTestPassed=false; ImmoRejected=false;' });
state('MCU_EEPROM_WRITE', 'MCU_EEPROM_WRITE', MCU, 280, 220);
state('MCU_WRITE_DONE', 'MCU_WRITE_DONE', MCU, 560, 220, { during: 'AfterrunComplete=false;' });
when('m01_test', 'MCU_IDLE', 'MCU_SELF_TEST', 'selfTestRun==1', { order: 0 });
when('m02_write', 'MCU_IDLE', 'MCU_EEPROM_WRITE', 'eepromWrite==1', { order: 1 });
when('m03_testAborted', 'MCU_SELF_TEST', 'MCU_IDLE', 'selfTestRun==0', { order: 0 });
// no immobiliser release frame while the IES-CAN is down: the ECU waits in ST_INIT_IMMO
when('m04_authorised', 'MCU_SELF_TEST', 'MCU_TEST_DONE', 'immoValid==1 && canValid==1', { order: 1, afterTicks: BENCH_TICKS.selfTest, action: 'SelfTestPassed=true;' });
when('m05_codeMismatch', 'MCU_SELF_TEST', 'MCU_TEST_DONE', 'immoValid==0 && canValid==1', { order: 2, afterTicks: BENCH_TICKS.selfTest, action: 'ImmoRejected=true;' });
when('m06_testClosed', 'MCU_TEST_DONE', 'MCU_IDLE', 'selfTestRun==0', { action: 'SelfTestPassed=false; ImmoRejected=false;' });
when('m07_writeAborted', 'MCU_EEPROM_WRITE', 'MCU_IDLE', 'eepromWrite==0', { order: 0 });
when('m08_written', 'MCU_EEPROM_WRITE', 'MCU_WRITE_DONE', 'eepromWrite==1', { order: 1, afterTicks: BENCH_TICKS.eepromWrite, action: 'AfterrunComplete=true;' });
when('m09_writeClosed', 'MCU_WRITE_DONE', 'MCU_IDLE', 'eepromWrite==0', { action: 'AfterrunComplete=false;' });

// ---- CanTimeout (SAK_C167CS_LM CAN controller watching the IES-CAN frames of FR_CabECU). CanTimeout stays
// pending until the running engine reacts to it (limp); CanRestored until limp takes it.
const CAN = 'lay_CanTimeout';
state('CAN_OK', 'CAN_OK', CAN, 0, 0, { auto: true });
state('CAN_MISSING', 'CAN_MISSING', CAN, 280, 0);
state('CAN_TIMEOUT', 'CAN_TIMEOUT', CAN, 560, 0);
when('c01_missing', 'CAN_OK', 'CAN_MISSING', 'canValid==0');
when('c02_back', 'CAN_MISSING', 'CAN_OK', 'canValid==1', { order: 0 });
when('c03_timeout', 'CAN_MISSING', 'CAN_TIMEOUT', 'canValid==0', { order: 1, afterTicks: BENCH_TICKS.canTimeout, action: 'CanRestored=false; CanTimeout=true;' });
when('c04_restored', 'CAN_TIMEOUT', 'CAN_OK', 'canValid==1', { action: 'CanTimeout=false; CanRestored=true;' });

// ---- EngineDynamics (OM501LA_EngineSystem, the engine the ECU drives; speeds of mrpld_sim.py)
const ENG = 'lay_EngineDynamics';
state('ENG_STOPPED', 'ENG_STOPPED', ENG, 0, 0, { auto: true, entry: 'rpm=0;' });
state('ENG_CRANKING', 'ENG_CRANKING', ENG, 280, 0, { entry: 'rpm=220;' });
state('ENG_RUNNING', 'ENG_RUNNING', ENG, 560, 0, {
  entry: 'rpm=600+pedalPct*13*torqueLimitPct/100;', during: 'rpm=600+pedalPct*13*torqueLimitPct/100;',
});
when('e01_crank', 'ENG_STOPPED', 'ENG_CRANKING', 'starter==1');
// fires once it is fuelled and the ECU is synchronised on CKP or CMP
when('e02_fires', 'ENG_CRANKING', 'ENG_RUNNING', 'injEnable==1 && syncMode!=3', { order: 0, afterTicks: BENCH_TICKS.crankToFire });
when('e03_starterOff', 'ENG_CRANKING', 'ENG_STOPPED', 'starter==0', { order: 1 });
// fuel cut stops it; with the engine brake the vehicle keeps turning it
when('e04_fuelCut', 'ENG_RUNNING', 'ENG_STOPPED', 'injEnable==0 && engineBrakeValves==0');

// ---- SpeedMonitor (SAK_C167CS_LM: engine running / stopped from the CKP speed)
const SPD = 'lay_SpeedMonitor';
state('SPD_STOPPED', 'SPD_STOPPED', SPD, 0, 0, { auto: true, during: 'EngineStopped=false;', exit: 'EngineStopped=false;' });
state('SPD_RUNNING', 'SPD_RUNNING', SPD, 280, 0, { during: 'EngineRunning=false;', exit: 'EngineRunning=false;' });
when('r01_running', 'SPD_STOPPED', 'SPD_RUNNING', 'rpm>500', { action: 'EngineRunning=true;' });
when('r02_stopped', 'SPD_RUNNING', 'SPD_STOPPED', 'rpm<300', { action: 'EngineStopped=true;' });

// ---- InjectionTiming (CAPCOM of SAK_C167CS_LM: start and end of injection while the engine turns, sd m12)
const CAP = 'lay_InjectionTiming';
state('CAP_WAIT', 'CAP_WAIT', CAP, 0, 0, { auto: true, during: 'EoiTrigger=false;', exit: 'EoiTrigger=false;' });
state('CAP_INJECT', 'CAP_INJECT', CAP, 280, 0, { during: 'SoiTrigger=false;', exit: 'SoiTrigger=false;' });
when('p01_soi', 'CAP_WAIT', 'CAP_INJECT', 'injEnable==1 && driversTristated==0 && rpm>0', { afterTicks: BENCH_TICKS.soiPeriod, action: 'SoiTrigger=true;' });
when('p02_eoi', 'CAP_INJECT', 'CAP_WAIT', '', { afterTicks: BENCH_TICKS.injection, action: 'EoiTrigger=true;' });

// ---- CurrentSense (InjectionPowerStage: DaleShunt + LM2901D comparator feedback to PLD_C1_1, sd m14 / m16)
const CS = 'lay_CurrentSense';
state('CS_OFF', 'CS_OFF', CS, 0, 0, { auto: true });
state('CS_PEAK', 'CS_PEAK', CS, 280, 0, { exit: 'PeakCurrentReached=false;' });
state('CS_BIP', 'CS_BIP', CS, 560, 0, { exit: 'BipDetected=false;' });
state('CS_SHORT', 'CS_SHORT', CS, 280, 220, { exit: 'OvercurrentTrip=false;' });
// a shorted bank exceeds 24 A instead of settling at the 16 A peak
when('a01_short', 'CS_OFF', 'CS_SHORT', 'hsGate==1 && lsGate==1 && bank1Short==1', { order: 0, action: 'OvercurrentTrip=true; BankShortDetected=true;' });
when('a02_peak', 'CS_OFF', 'CS_PEAK', 'hsGate==1 && lsGate==1 && bank1Short==0', { order: 1, action: 'PeakCurrentReached=true;' });
when('a03_bip', 'CS_PEAK', 'CS_BIP', 'hsGate==0 && lsGate==1', { order: 0, action: 'BipDetected=true;' });
when('a04_peakOff', 'CS_PEAK', 'CS_OFF', 'lsGate==0', { order: 1 });
when('a05_bipOff', 'CS_BIP', 'CS_OFF', 'holdChop==1 || lsGate==0');
when('a06_shortOff', 'CS_SHORT', 'CS_OFF', 'hsGate==0 || lsGate==0');

// ---- the machine as the editor holds it
export const states: StateData[] = editor.snapshot.states;
export const transitions: TransitionData[] = editor.snapshot.transitions;
export const layers: Layer[] = editor.snapshot.layers;
export const junctions: JunctionData[] = editor.snapshot.junctions;

// ------------------------------------------------------------------- HMI
// The HMI Dashboard: a palette entry per widget, then its Properties (name, binding, position, size, ...).
// Every widget is bound to a variable or a state of the machine; the operator inputs are the attributes of
// block SimulationScenario. Sized for the HMI Dashboard window (maximise it): the controls and the operating
// mode are always visible, the details are on four tabs.
const dashboard = createHmiDashboard();
export const hmiComponents = dashboard.components;
const widget = (_key: string, type: HmiComponentType, name: string, x: number, y: number, variable: string | null, w = 150, h = 70, extra: HmiPanelEdit = {}) =>
  dashboard.add(type, { name, x, y, width: w, height: h, ...(variable ? { variableId: panel.idOf(variable) } : {}), ...extra });

// -- always visible: the driver's controls
widget('h_key', 'mode-selector', '1 Key switch', 20, 10, 'keyState', 340, 90, {
  min: 0, max: 4, precision: 0,
  options: [{ label: 'OFF', value: 0 }, { label: 'IGN', value: 1 }, { label: 'CRANK', value: 2 }, { label: 'RUN', value: 3 }, { label: 'BRAKE', value: 4 }],
});
widget('h_pedal', 'slider', '2 Accelerator pedal [%]', 370, 10, 'pedalPct', 250, 90, { max: 100, step: 5, precision: 0, unit: '%' });
widget('h_blockStart', 'pulse-button', 'Engine-block start button', 630, 10, 'BlockStartButton', 216, 43, { text: 'Start engine' });
widget('h_blockStop', 'pulse-button', 'Engine-block stop button', 630, 57, 'BlockStopButton', 216, 43, { text: 'Stop engine' });
// -- always visible: the ECU operating mode
const MODES: Array<[string, string]> = [['ST_STANDBY', 'Off (KL15 off)'], ['ST_INIT_IMMO', 'Self-test, immobiliser'], ['ST_IMMO_LOCKED', 'Start locked (wrong key)'],
  ['ST_READY', 'Ready to crank'], ['ST_CRANK_SYNC', 'Cranking, sync'], ['ST_RUN_NORMAL', 'Running'], ['ST_ENGINE_BRAKE', 'Engine brake'],
  ['ST_LIMP_DERATE', 'Limp home (65 % torque)'], ['ST_FAULT_SHUTDOWN', 'Fault shutdown'], ['ST_AFTERRUN', 'After-run (EEPROM)']];
MODES.forEach(([key, label], i) => widget(`h_st_${key}`, 'active-state-indicator', label, 20 + (i % 5) * 166, 110 + Math.floor(i / 5) * 62, null, 160, 56, { stateId: stateId[key] }));

// -- the four tabs
const tabs = widget('h_tabs', 'tabs', 'Details', 20, 240, null, 826, 470, {
  tabs: [{ id: 'engine', label: 'Engine & outputs' }, { id: 'faults', label: 'Sensors & faults' }, { id: 'injection', label: 'Injection' }, { id: 'trace', label: 'Trace' }],
});
const inTab = (tabId: string): HmiPanelEdit => ({ parentId: tabs, tabId });
// Engine & outputs
widget('h_rpm', 'gauge', 'Engine speed [rpm]', 10, 70, 'rpm', 200, 170, { max: 2500, precision: 0, unit: 'rpm', ...inTab('engine') });
widget('h_torque', 'gauge', 'Torque limit [%]', 216, 70, 'torqueLimitPct', 200, 170, { precision: 0, unit: '%', ...inTab('engine') });
widget('h_fan', 'gauge', 'PV3 fan clutch duty [%]', 422, 70, 'pv3DutyPct', 200, 170, { precision: 0, unit: '%', ...inTab('engine') });
widget('h_coolantShow', 'thermometer', 'Coolant [°C]', 628, 70, 'coolantC', 176, 170, { min: -40, max: 130, precision: 0, unit: '°C', ...inTab('engine') });
const LAMPS: Array<[string, string, NonNullable<HmiPanelEdit['color']>]> = [
  ['powerLatch', 'Power latch', 'green'], ['starter', 'Starter relay X2-18', 'orange'], ['injEnable', 'Injection enabled', 'green'],
  ['engineBrakeValves', 'Engine brake PV1+PV2', 'yellow'], ['speedLimited', 'Speed limited (limp)', 'red'], ['driversTristated', 'Drivers tristated', 'red'],
  ['eepromWrite', 'EEPROM write', 'blue'], ['warnLamp', 'Overtemp warning lamp', 'red']];
LAMPS.forEach(([name, label, color], i) => widget(`h_out_${name}`, 'lamp', label, 10 + (i % 4) * 200, 250 + Math.floor(i / 4) * 74, name, 194, 66, { color, ...inTab('engine') }));
// Sensors & faults: the levels of SimulationScenario, then what the ECU makes of them
const FAULTS: Array<[string, string]> = [['immoValid', 'Immobiliser key valid'], ['canValid', 'IES-CAN frames OK'], ['ckpValid', 'CKP crank sensor OK'],
  ['cmpValid', 'CMP cam sensor OK'], ['bank1Short', 'Bank 1 short circuit'], ['sensorDrift', 'ECT sensor drift']];
FAULTS.forEach(([name, label], i) => widget(`h_in_${name}`, 'toggle', label, 10 + (i % 3) * 268, 70 + Math.floor(i / 3) * 68, name, 260, 60, inTab('faults')));
widget('h_ect', 'slider', 'Coolant [°C] (fan from 92, limp at 103)', 10, 208, 'coolantC', 395, 80, { min: -40, max: 130, step: 1, precision: 0, unit: '°C', ...inTab('faults') });
widget('h_vect', 'slider', 'ECT pin X2-34 [V] (valid 0.18..4.82)', 413, 208, 'vEctPin', 393, 80, { max: 5.5, step: 0.01, precision: 2, unit: 'V', ...inTab('faults') });
widget('h_sync', 'lcd', 'SyncMode (0 BOTH 1 CMP 2 CKP 3 NONE)', 10, 296, 'syncMode', 395, 70, { max: 3, precision: 0, ...inTab('faults') });
widget('h_diag', 'lcd', 'SensorFaultMode (0 OK 1 OPEN 2 SCG 3 SCB 4 DRIFT)', 413, 296, 'sensorFaultMode', 393, 70, { max: 4, precision: 0, ...inTab('faults') });
widget('h_dtc_dtcImmo', 'lamp', 'DTC immobiliser (MR 9964)', 10, 374, 'dtcImmo', 260, 66, { color: 'red', ...inTab('faults') });
widget('h_dtc_dtcSensor', 'lamp', 'DTC ECT sensor', 278, 374, 'dtcSensor', 260, 66, { color: 'red', ...inTab('faults') });
widget('h_dtc_useSubstitute', 'lamp', 'ECT substitute value in use', 546, 374, 'useSubstitute', 260, 66, { color: 'yellow', ...inTab('faults') });
// Injection
const INJ_STATES = ['INJ_IDLE', 'INJ_PEAK', 'INJ_BIP_WAIT', 'INJ_HOLD', 'INJ_SPILL', 'INJ_CYL_CUTOFF'];
INJ_STATES.forEach((key, i) => widget(`h_st_${key}`, 'active-state-indicator', key, 10 + (i % 3) * 268, 70 + Math.floor(i / 3) * 62, null, 260, 56, { stateId: stateId[key], ...inTab('injection') }));
([['hsGate', 'Bank high-side gate'], ['lsGate', 'Cylinder low-side gate'], ['holdChop', 'Hold chopping 8 A'], ['cylCutoff', 'Cylinder cut off (DTC 5Nxx)']] as const)
  .forEach(([name, label], i) => widget(`h_out_${name}`, 'lamp', label, 10 + (i % 2) * 400, 200 + Math.floor(i / 2) * 74, name, 394, 66, { color: name === 'cylCutoff' ? 'red' : 'blue', ...inTab('injection') }));
// Trace
widget('h_scope', 'dashboard-scope', 'Trace', 10, 70, null, 796, 380, {
  variableIds: ['rpm', 'pedalPct', 'coolantC', 'torqueLimitPct', 'pv3DutyPct'].map(panel.idOf), ...inTab('trace'),
});
