// Phase 2 end-to-end fixture (planner-owned): a closed-loop thermostat across all three models.
//   State machine (thermostat, 10 ms tick): OFF <-> HEATING with a 55..65 hysteresis band on dT.
//   X-Bridges (global canvas): GAIN `heaterGain` (gain 100) turns heaterOn (0/1) into a power command [%].
//   V-Lab (global canvas): ps_constant `power` (value <- power command) -> ps_lpf `chamber` (T = 5 s) = dT.
// The TRM scenario couples them: SM.heaterOn -> XB heaterGain.u, XB heaterGain.y -> VLab power.value,
// VLab chamber.y -> SM.dT (backward coupling, one step delay).
export const TAU_S = 5;
export const F_CUT_HZ = 1 / (2 * Math.PI * TAU_S);

const state = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, name, x: 0, y: 0, width: 120, height: 60, entry: '', during: '', exit: '', isActive: false, color: '#334155',
  parentId: null, children: [], priority: 1, isParallel: false, regionId: null, autostart: false, ...over,
});
const transition = (id: string, sourceId: string, targetId: string, condition: string, order = 1) => ({
  id, sourceId, targetId, condition, action: '', afterTicks: null, type: 'condition', hasControlPoint: false, order,
});
const variable = (id: string, type: string, initialValue: string) => ({
  id, name: id, type, initialValue, currentValue: type === 'bool' ? initialValue === 'true' : Number(initialValue), visibleInScope: true,
});

export interface ThermostatOptions { upper?: number; lower?: number; gain?: number }

export function thermostatProject(options: ThermostatOptions = {}) {
  const upper = options.upper ?? 65;
  const lower = options.lower ?? 55;
  const gain = options.gain ?? 100;
  return {
    projectName: 'Thermostat closed loop',
    schemaVersion: 5,
    tickMs: 10,
    safetyMode: false,
    states: [
      state('st_off', 'OFF', { autostart: true, priority: 1, entry: 'heaterOn=false;' }),
      state('st_heating', 'HEATING', { priority: 2, entry: 'heaterOn=true;' }),
    ],
    junctions: [],
    transitions: [
      transition('tr_on', 'st_off', 'st_heating', `enable==true && dT<${lower}`),
      transition('tr_off', 'st_heating', 'st_off', `dT>=${upper} || enable==false`),
    ],
    variables: [variable('enable', 'bool', 'false'), variable('heaterOn', 'bool', 'false'), variable('dT', 'double', '0')],
    layers: [{ id: 'root', name: 'root', parentStateId: null, decomposition: 'OR', stateIds: ['st_off', 'st_heating'], transitionIds: ['tr_on', 'tr_off'], junctionIds: [] }],
    globalXBridgesNodes: [
      { id: 'heaterGain', type: 'xbridgesBlock', position: { x: 0, y: 0 }, data: { id: 'heaterGain', type: 'GAIN', params: { gain } } },
    ],
    globalXBridgesEdges: [],
    vlabNodes: [
      { id: 'power', type: 'default', position: { x: 0, y: 0 }, data: { type: 'ps_constant', params: { value: 0 } } },
      { id: 'chamber', type: 'default', position: { x: 200, y: 0 }, data: { type: 'ps_lpf', params: { f_cut: F_CUT_HZ } } },
    ],
    vlabEdges: [{ id: 've1', source: 'power', sourceHandle: 'y_s', target: 'chamber', targetHandle: 'u_t' }],
  };
}

export const T = {
  enable: 'sim:sm/var/enable',
  heaterOn: 'sim:sm/var/heaterOn',
  dT: 'sim:sm/var/dT',
  heating: 'st_heating',
  gainIn: 'sim:xb/global/heaterGain/u',
  gainOut: 'sim:xb/global/heaterGain/y',
  gainParam: 'sim:xb/global/heaterGain/$param/gain',
  powerValue: 'sim:vlab/global/power/$param/value',
  chamberOut: 'sim:vlab/global/chamber/y',
} as const;

/** The §9 scenario (plain object so tests do not depend on production types). */
export function thermostatScenario(over: Record<string, unknown> = {}) {
  return {
    id: 'scn-thermostat',
    verificationCaseId: 'vc-thermo',
    duration: 30,
    step: 0.01,
    order: ['sm', 'xb', 'vlab'],
    signals: [
      { alias: 'dT', target: T.chamberOut },
      { alias: 'heaterOn', target: T.heaterOn },
      { alias: 'power', target: T.gainOut },
      { alias: 'heating', target: T.heating },
    ],
    stimuli: [{ target: T.enable, profile: { kind: 'constant', value: 1 } }],
    couplings: [
      { from: T.heaterOn, to: T.gainIn },
      { from: T.gainOut, to: T.powerValue },
      { from: T.chamberOut, to: T.dT },
    ],
    assertions: [
      { id: 'as-t1', requirementId: 'req-t1', name: 'Warm-up', condition: 'dT >= 60', temporal: { kind: 'eventually', window: [0, 10] } },
      { id: 'as-t2', requirementId: 'req-t2', name: 'Regulation', condition: 'dT >= 50 && dT <= 70', temporal: { kind: 'always', window: [15, 30] } },
      { id: 'as-t3', requirementId: 'req-t3', name: 'Over-temperature', condition: 'heaterOn == 0', temporal: { kind: 'response', trigger: 'dT >= 65', within: 0.2 } },
      { id: 'as-t4', requirementId: 'req-t4', name: 'Power limit', condition: 'power > 100', temporal: { kind: 'never' } },
      { id: 'as-t5', requirementId: 'req-t5', name: 'Heater turns on', condition: 'heating == 1', temporal: { kind: 'eventually' } },
    ],
    ...over,
  };
}

export const THERMO_REQUIREMENTS = [
  { id: 'req-t1', requirementId: 'REQ-T1', name: 'Warm-up', text: 'When enabled, the chamber temperature rise dT shall reach 60 within 10 s.' },
  { id: 'req-t2', requirementId: 'REQ-T2', name: 'Regulation', text: 'After 15 s, dT shall stay within 50..70.' },
  { id: 'req-t3', requirementId: 'REQ-T3', name: 'Over-temperature', text: 'When dT reaches 65, the heater shall switch off within 0.2 s.' },
  { id: 'req-t4', requirementId: 'REQ-T4', name: 'Power limit', text: 'The heater power command shall never exceed 100 %.' },
  { id: 'req-t5', requirementId: 'REQ-T5', name: 'Heater turns on', text: 'The heater shall turn on.' },
] as const;

/**
 * Independent reference of the documented coupled semantics (plan §7.7, §9), plain arithmetic only:
 * per step: SM (one tick, reads dT from the previous step) -> GAIN -> backward-Euler LPF.
 */
export function thermostatReference(options: ThermostatOptions & { duration?: number; step?: number } = {}) {
  const upper = options.upper ?? 65, lower = options.lower ?? 55, gain = options.gain ?? 100;
  const step = options.step ?? 0.01, n = Math.round((options.duration ?? 30) / step);
  const a = step / (TAU_S + step);
  const dT: (number | null)[] = [null], heaterOn = [0], power = [0], heating = [0];
  let on = 0, y = 0, smDT = 0; // smDT: the value the chart sees (0 = its initial value until V-Lab has solved once)
  for (let k = 1; k <= n; k++) {
    if (on === 0 && smDT < lower) on = 1; else if (on === 1 && smDT >= upper) on = 0;
    const p = gain * on;
    y = a * p + (1 - a) * y;
    smDT = y;
    dT.push(y); heaterOn.push(on); power.push(p); heating.push(on);
  }
  return { times: Array.from({ length: n + 1 }, (_, k) => k * step), dT, heaterOn, power, heating };
}
