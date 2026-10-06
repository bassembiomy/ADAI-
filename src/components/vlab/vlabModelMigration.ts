import { VLAB_LIBRARY } from '../../utils/vlabLibrary';
import type { VLabEdge, VLabNode } from './VLabWorkspaceTypes';

const LEGACY_REMOVED_BLOCKS = new Set(['gas_properties']);
const MULTIBODY_JOINT_TYPES = new Set(['revolute_joint', 'prismatic_joint', 'spherical_joint', 'universal_joint', 'weld_joint']);

const effectiveBlockType = (node: VLabNode): string =>
  String(node.data?.type ?? node.type ?? '').toLowerCase();

/**
 * WP-08: one canonical parameter key per block (the key in vlabLibrary.ts). Equations read only canonical keys, so
 * every legacy synonym an old equation used to accept (`params.R || params.resistance`, `params.torque`, ...) or an
 * old library key is mapped to the canonical key here, when a model is loaded.
 * Rule: legacy -> canonical only when the canonical key is absent (the canonical value always won in the old chains);
 * the legacy key is removed either way.
 */
export const LEGACY_PARAM_RENAMES: Record<string, Record<string, string>> = {
  resistor: { resistance: 'R' },
  capacitor: { capacitance: 'C' },
  inductor: { inductance: 'L' },
  dc_voltage: { V_const: 'V' },
  dc_current: { I_const: 'I' },
  cccs: { Rin: 'R_in' },
  ccvs: { Rin: 'R_in', Rout: 'R_out' },
  rotational_electromechanical_converter: { motor_constant: 'K', resistance: 'R' },
  dc_motor: { resistance: 'Ra', inductance: 'La', inertia: 'J', damping: 'B' },
  ac_motor: { pole_pairs: 'P', inertia: 'J', damping: 'B' },
  bldc_motor: { inertia: 'J', damping: 'B' },
  pmsm: { inertia: 'J', damping: 'B' },
  rot_spring: { spring_const: 'k' },
  rot_damper: { damping: 'b' },
  mass: { mass: 'm' },
  trans_spring: { spring_const: 'k' },
  trans_damper: { damping: 'b' },
  torque_source: { torque: 'T' },
  force_source: { force: 'F' },
  ang_vel_source: { w: 'omega' },
  wheel_axle: { radius: 'Rw' },
  heat_src: { Q_const: 'Q' },
  temp_src: { T_const: 'T' },
  thermal_mass: { heat_capacity: 'C' },
  conductive_heat: { conductivity: 'k' },
  thermal_resistor: { resistance: 'R', Rth: 'R' },
  permanent_magnet: { L: 'Lm' },
  ps_step: { stepTime: 'time', step_time: 'time' },
  ps_sine: { A: 'amp', amplitude: 'amp', f: 'freq', frequency: 'freq' },
  ps_ramp: { start_time: 'start' },
  ps_math: { function: 'func' },
  ps_transfer_fcn: { time_constant: 'T' },
  ps_pid_ctrl: { saturation: 'limit' },
  ps_smith_predictor: { delay: 'tau' },
  ps_stair_gen: { step_time: 'ts' },
  ps_sliding_mode: { eta: 'k' },
  ps_dead_zone: { start: 'upper', end: 'lower' },
  ma_flow_source: { flow: 'rate' },
  ma_moisture_source: { flow: 'rate' },
  doe_custom: { deployment: 'deploymentModel' },
};

/** Parameters that were removed from the library (or were never read by any equation); old saved values are ignored. */
export const LEGACY_PARAM_DROPS: Record<string, string[]> = {
  busbar: ['nodes'],
  force_sensor: ['k'],
  torque_sensor: ['k'],
  rot_motion_sensor: ['b'],
  trans_motion_sensor: ['b'],
  wheel_axle: ['Ra'],
  upper_heater: ['surface_area'],
  magnetron: ['freq'],
  microwave_inverter: ['switching_freq'],
  ma_chamber: ['heat_capacity'],
  // amp / freq were library parameters no equation read; the equation always ran on Vpk / f
  ps_sine_3phase: ['amp', 'freq'],
  // WP-19a: the ideal weld has no stiffness (the old value was never read by any equation; the constraint is exact)
  weld_joint: ['stiffness'],
  // WP-12a (F-059): one back-EMF / torque constant k = Ke (SI: Kt = Ke). A Kt that differed from Ke is reported by
  // machineConstantNotice and dropped; Ke is kept as k.
  dc_motor: ['Kt'], bldc_motor: ['Kt'],
  // WP-12b: the three-level PWM takes its reference vector from the wired vabc (width 3); the internal reference oscillator
  // (and its output frequency) is gone, so the saved value is never read
  pwm_3ph_3level: ['output_frequency_hz'],
};

/** Library parameters exposed by WP-08 (previously hidden): backfilled into saved nodes so the inspector shows them. */
export const WP08_EXPOSED_PARAMS: Record<string, string[]> = {
  igbt: ['Roff'], translational_electromechanical_converter: ['R'], controlled_voltage: ['R_int'],
  cccs: ['R_in'], ccvs: ['R_in', 'R_out'], gas_chamber: ['T', 'P0'], gas_restriction: ['Cd', 'T', 'gamma'], gas_pipe: ['f', 'T', 'mu'],
  gas_rotational_conv: ['T'], gas_translational_conv: ['T'], rot_friction: ['Tv', 'cv', 'wthr'],
  rot_hard_stop: ['k', 'c', 'transition'], trans_friction: ['Fv', 'cv', 'vthr'], trans_hard_stop: ['k', 'transition'],
  // WP-13: Simscape Initial deformation of the springs, internal damping of the belt end (0 = the old lossless belt)
  rot_spring: ['theta0'], trans_spring: ['x0'], belt_end: ['damping'],
  ma_chamber: ['ambient_temp', 'wall_mass', 'wall_cp', 'food_mass', 'food_cp', 'k_loss', 'max_temp', 'P0', 'phi'],
  ma_pipe: ['resistance', 'D', 'roughness', 'T', 'phi', 'UA'],
  ma_rot_conv: ['h0', 'k', 'V0', 'T', 'P0', 'p_env', 'phi'], ma_trans_conv: ['h0', 'k', 'V0', 'T', 'P0', 'p_env', 'phi'], im_flux_observer: ['Lr', 'Rr'],
  ps_lookup_1d: ['table_x', 'table_y'], ps_sliding_mode: ['boundary_layer'], magnetron: ['v_nominal'],
  upper_heater: ['efficiency'], mag_controlled_mmf: ['MMF'], washing_basket: ['damping'], doe_custom: ['deploymentModel'],
  ps_dead_zone: ['upper', 'lower'], ps_sine_3phase: ['Vpk', 'f'],
  // WP-15: Thermal Mass Initial Temperature T0 (the old model always started at 293.15 K = the default); Variable Reluctance R
  // for the unwired control port (the old equation hard-coded 1e6 = the default); Fundamental Reluctance geometry
  thermal_mass: ['T0'], variable_reluctance: ['R'], fundamental_reluctance: ['A', 'mu_r', 'l'],
  // WP-17: new physical parameters of the fluid / gas / moist-air / steam blocks (defaults = the previous effective behaviour where one existed)
  orifice: ['mu', 'Re_crit'], restriction_il: ['mu', 'Re_crit'], fluid_capacitance: ['P0'], check_valve: ['P_crack'],
  steam_nozzle: ['gamma'], steam_generator: ['v_rated', 'eta', 'k_loss', 'ambient_temp'],
  ma_moisture_sensor: ['T', 'phi'], ma_thermo_sensor: ['T', 'phi'], ma_pt_sensor: ['T'],
  // WP-12a: machine leakage inductances (the old induction model hard-coded Lr = 0.06 H), PMSM zero-sequence inductance,
  // three-phase source phase angle of phase A (the old source had a hidden +45 deg shift; Simscape default is 0)
  ac_motor: ['Lls', 'Llr'], pmsm: ['L0'], three_phase_source: ['phase'],
  // WP-12b: amplitude of the inverter's internal V/f generator (the old equation took it from the scalar vabc input)
  pwm_3ph_2level: ['modulation_index'],
  // WP-19a: joint parameters of the shared multibody joint core (axis defaults to Z like Simscape; weld reference pose)
  revolute_joint: ['axis'], prismatic_joint: ['axis'], weld_joint: ['offset', 'rotation'],
};

/**
 * WP-13 (F-074, F-075): parameters whose OLD effective value (the equation's hidden default) differs from the new library
 * default. A saved node that lacks the key keeps the value it used to run with, so its response does not change:
 *  - inertia B = 0.001 and mass b = 0.1: the old equations added this viscous drag to the inertial frame by default; the
 *    Simscape Inertia / Mass have none, so the library default is now 0 (an explicit saved value is never touched);
 *  - trans_hard_stop c = 1: the old equation always added 1.0 * v.
 */
export const LEGACY_DEFAULT_BACKFILL: Record<string, Record<string, number>> = {
  inertia: { B: 0.001 },
  mass: { b: 0.1 },
  trans_hard_stop: { c: 1 },
};

/**
 * WP-13: the friction blocks used T = Ts * tanh(10 w) + Tv * w (rot) and F = Fs * tanh(5 v) + Fv * v (trans), i.e. a pure
 * Coulomb friction. The Simscape form is [Tc + (Tbrk - Tc) exp(-cv |w|)] tanh(4 w / wthr) + Tv w, so Ts becomes
 * Tbrk = Tc = Ts (no Stribeck dip) with the velocity threshold that reproduces the old smoothing exactly:
 * tanh(4 w / wthr) = tanh(10 w) -> wthr = 0.4 rad/s; tanh(4 v / vthr) = tanh(5 v) -> vthr = 0.8 m/s.
 */
const FRICTION_MIGRATION: Record<string, { legacy: string; brk: string; coulomb: string; threshold: string; thresholdValue: number }> = {
  rot_friction: { legacy: 'Ts', brk: 'Tbrk', coulomb: 'Tc', threshold: 'wthr', thresholdValue: 0.4 },
  trans_friction: { legacy: 'Fs', brk: 'Fbrk', coulomb: 'Fc', threshold: 'vthr', thresholdValue: 0.8 },
};

const isWrapper = (v: unknown): v is { value: unknown } =>
  !!v && typeof v === 'object' && !Array.isArray(v) && 'value' in (v as object);
const rawOf = (v: unknown): unknown => (isWrapper(v) ? v.value : v);
const asNumber = (v: unknown): number => {
  const r = rawOf(v);
  return typeof r === 'number' ? r : typeof r === 'string' && r.trim() !== '' ? Number(r) : NaN;
};

/**
 * Canonicalize the numeric parameters of one saved node. Returns the same params object when nothing changes.
 * Never reads an equation; purely maps keys. Values are copied untouched (0, negatives, text are preserved).
 */
export const canonicalizeLegacyParams = (
  type: string,
  params: Record<string, any>,
): Record<string, any> => {
  const block = VLAB_LIBRARY.flatMap((d) => d.blocks).find((b) => b.id === type);
  if (!block) return params;
  let next: Record<string, any> | undefined;
  const edit = () => (next ??= { ...params });
  // keep the library's unit/label on a moved value; keep raw numbers raw
  const moved = (to: string, legacy: unknown) => {
    const lib = block.params?.[to];
    return isWrapper(legacy) && lib ? { ...legacy, unit: lib.unit, label: lib.label } : legacy;
  };

  // legacy-only geometry form of conductive_heat: Q = (k A / L) dT, now a conductance k [W/K]
  if (type === 'conductive_heat' && params.A !== undefined && params.L !== undefined) {
    const A = asNumber(params.A);
    const L = asNumber(params.L);
    const k = asNumber(params.k ?? params.conductivity);
    const out = edit();
    if (Number.isFinite(A) && Number.isFinite(L) && L !== 0 && Number.isFinite(k)) {
      const cur = out.k ?? out.conductivity;
      out.k = isWrapper(cur) ? { ...cur, value: (k * A) / L } : (k * A) / L;
    }
    delete out.A;
    delete out.L;
  }
  // ps_lpf used a time constant T (s); the canonical parameter is the cutoff f_cut = 1 / (2 pi T)
  if (type === 'ps_lpf' && params.f_cut === undefined) {
    const T = asNumber(params.T ?? params.time_constant);
    if (Number.isFinite(T) && T > 0) {
      edit().f_cut = { value: 1 / (2 * Math.PI * T), unit: block.params.f_cut.unit, label: block.params.f_cut.label };
    }
  }
  if (type === 'ps_lpf') {
    for (const k of ['T', 'time_constant']) if (k in (next ?? params)) delete edit()[k];
  }

  // transformer: the legacy key N meant v2 = N * v1 (N2/N1); the canonical N12 = N1/N2 = 1 / N (value-transforming, not a rename).
  // N = 0 (was never legal) becomes N12 = 0 so the parameter bounds report it; non-numeric text is carried over unchanged.
  if (type === 'transformer' && 'N' in params) {
    const out = edit();
    if (out.N12 === undefined || out.N12 === null) {
      const n = asNumber(out.N);
      const lib = block.params.N12;
      const value = Number.isFinite(n) ? (n === 0 ? 0 : 1 / n) : rawOf(out.N);
      out.N12 = { value, unit: lib.unit, label: lib.label };
    }
    delete out.N;
  }

  // WP-15: Fundamental Reluctance ran on a hidden R; the printed equation R = l / (mu0 mu_r A) is implemented now. A saved R is kept
  // exactly by solving for l with the library A and mu_r (fundamentalReluctanceNotice reports it).
  if (type === 'fundamental_reluctance' && 'R' in params) {
    const out = edit();
    const R = asNumber(out.R);
    if (Number.isFinite(R) && R > 0 && out.l === undefined) {
      const A = Number(block.params.A.value);
      const mur = Number(block.params.mu_r.value);
      out.l = isWrapper(out.R) ? { ...out.R, value: R * MU0 * mur * A, unit: block.params.l.unit, label: block.params.l.label } : R * MU0 * mur * A;
    }
    delete out.R;
  }

  for (const [legacy, canonical] of Object.entries(LEGACY_PARAM_RENAMES[type] ?? {})) {
    if (!(legacy in (next ?? params))) continue;
    const out = edit();
    if (out[canonical] === undefined || out[canonical] === null) out[canonical] = moved(canonical, out[legacy]);
    delete out[legacy];
  }
  const friction = FRICTION_MIGRATION[type];
  if (friction && friction.legacy in params) {
    const out = edit();
    const legacy = out[friction.legacy];
    for (const key of [friction.brk, friction.coulomb]) {
      if (out[key] === undefined || out[key] === null) out[key] = moved(key, legacy);
    }
    if (out[friction.threshold] === undefined || out[friction.threshold] === null) {
      out[friction.threshold] = isWrapper(legacy)
        ? { value: friction.thresholdValue, unit: block.params[friction.threshold].unit, label: block.params[friction.threshold].label }
        : friction.thresholdValue;
    }
    delete out[friction.legacy];
  }
  for (const [key, value] of Object.entries(LEGACY_DEFAULT_BACKFILL[type] ?? {})) {
    if ((next ?? params)[key] === undefined && block.params[key]) {
      edit()[key] = { value, unit: block.params[key].unit, label: block.params[key].label };
    }
  }
  for (const key of LEGACY_PARAM_DROPS[type] ?? []) {
    if (key in (next ?? params)) delete edit()[key];
  }
  for (const key of WP08_EXPOSED_PARAMS[type] ?? []) {
    if ((next ?? params)[key] === undefined && block.params[key]) {
      edit()[key] = { value: block.params[key].value, unit: block.params[key].unit, label: block.params[key].label };
    }
  }
  return next ?? params;
};

/**
 * WP-12a (F-059): a saved dc_motor / bldc_motor with a torque constant Kt different from its back-EMF constant Ke. In SI the
 * two are one constant (Kt [N m/A] = Ke [V s/rad], otherwise the machine creates or destroys energy). Ke is kept as k and
 * the discarded Kt is reported here (stored in `data.migrationNotices`). Returns undefined when nothing was lost.
 */
export const machineConstantNotice = (type: string, params: Record<string, any>): string | undefined => {
  if (type !== 'dc_motor' && type !== 'bldc_motor') return undefined;
  if (!('Kt' in params)) return undefined;
  const lib = VLAB_LIBRARY.flatMap((d) => d.blocks).find((b) => b.id === type);
  const kt = asNumber(params.Kt);
  const ke = params.Ke === undefined || params.Ke === null ? Number(lib?.params?.Ke?.value) : asNumber(params.Ke);
  if (!Number.isFinite(kt) || !Number.isFinite(ke) || kt === ke) return undefined;
  return `${type}: the torque constant Kt = ${kt} N m/A differed from the back-EMF constant Ke = ${ke} V s/rad. In SI they are one constant k ` +
    `(otherwise energy is created or destroyed), so k = Ke = ${ke} is used and Kt was removed.`;
};

/**
 * WP-15 (F-011): the Thermal Reference used to be pinned at 293.15 K, so a Temperature Sensor wired against it read T - 293.15 K.
 * Simscape's Thermal Reference is absolute zero: the same sensor now reads the absolute temperature, i.e. +293.15 K compared with
 * a reading saved before the correction. That is the correct physics, so no value is rewritten; the change is reported here
 * (a saved node cannot be told apart from a new one, so the text names the condition).
 */
export const THERMAL_REFERENCE_NOTICE =
  'Thermal temperatures are now absolute: the Thermal Reference is 0 K (Simscape), not 293.15 K. In a model saved with the old ' +
  'reference a Temperature Sensor read T - 293.15 K; it now reads the absolute temperature T, so old scope readings are shifted by ' +
  '+293.15 K. Use a Temperature Source (for example 293.15 K) for an ambient boundary; Thermal Mass starts at its Initial Temperature T0.';

export const thermalReferenceNotice = (type: string): string | undefined =>
  type === 'thermal_ref' || type === 'temp_sensor' ? THERMAL_REFERENCE_NOTICE : undefined;

/**
 * WP-15: the Fundamental Reluctance equation printed in the UI (R = l / (mu0 mu_r A)) is now implemented; the old block ran on a
 * hidden R parameter. A saved R keeps its value by solving for the core length l with the library A and mu_r.
 */
const MU0 = 1.25663706212e-6;
export const fundamentalReluctanceNotice = (type: string, params: Record<string, any>): string | undefined => {
  if (type !== 'fundamental_reluctance' || !('R' in params)) return undefined;
  const R = asNumber(params.R);
  if (!Number.isFinite(R) || R <= 0) return `fundamental_reluctance: the saved reluctance R = ${String(rawOf(params.R))} is not a positive number and was removed; set l, A and mu_r.`;
  return `fundamental_reluctance: the reluctance is now R = l / (mu0 mu_r A). The saved R = ${R} A-t/Wb was kept by setting the core length l ` +
    'with the default A and mu_r.';
};

const canonicalizeNodeParams = (node: VLabNode): VLabNode => {
  const params = node.data?.params;
  const type = effectiveBlockType(node);
  const refNotice = thermalReferenceNotice(type);
  if (!params || typeof params !== 'object') {
    if (!refNotice) return node;
    const existing = Array.isArray(node.data?.migrationNotices) ? node.data.migrationNotices : [];
    if (existing.includes(refNotice)) return node;
    return { ...node, data: { ...node.data, migrationNotices: [...existing, refNotice] } };
  }
  const found = [machineConstantNotice(type, params), fundamentalReluctanceNotice(type, params), refNotice]
    .filter((n): n is string => !!n);
  const next = canonicalizeLegacyParams(type, params);
  const existing: string[] = Array.isArray(node.data.migrationNotices) ? node.data.migrationNotices : [];
  const fresh = found.filter((n) => !existing.includes(n));
  if (next === params && fresh.length === 0) return node;
  const notices = fresh.length ? [...new Set([...existing, ...found])] : undefined;
  return { ...node, data: { ...node.data, params: next, ...(notices ? { migrationNotices: notices } : {}) } };
};

/**
 * WP-12a (F-068): a saved three_phase_source has scalar ports a, b, c with absolute potentials to the model ground. The
 * block is now a wye source with the composite port abc and a star-point terminal n. The migration keeps the circuit:
 *  - a Phase Splitter (abc -> a, b, c) is inserted and the old a / b / c edges are re-pointed to its scalar ports;
 *  - an Electrical Reference is wired to the new star point n (the old source was referenced to ground).
 * Nodes without a saved `ports` list (they take the library ports) and already migrated nodes are untouched.
 */
const migrateThreePhaseSources = (nodes: VLabNode[], edges: VLabEdge[]): { nodes: VLabNode[]; edges: VLabEdge[] } => {
  const legacy = nodes.filter((n) => effectiveBlockType(n) === 'three_phase_source'
    && Array.isArray(n.data?.ports) && n.data.ports.some((p: any) => p?.id === 'a') && !n.data.ports.some((p: any) => p?.id === 'abc'));
  if (legacy.length === 0) return { nodes, edges };
  const blocks = VLAB_LIBRARY.flatMap((d) => d.blocks);
  const libPorts = (id: string) => blocks.find((b) => b.id === id)!.ports.map((p) => ({ ...p }));
  const taken = new Set(nodes.map((n) => n.id));
  const fresh = (base: string) => { let id = base; for (let i = 2; taken.has(id); i++) id = `${base}_${i}`; taken.add(id); return id; };
  const addedNodes: VLabNode[] = [];
  const addedEdges: VLabEdge[] = [];
  const legacyIds = new Map<string, { splitter: string }>();
  const migratedNodes = nodes.map((node) => {
    if (!legacy.includes(node)) return node;
    const splitter = fresh(`${node.id}_phase_split`);
    const reference = fresh(`${node.id}_ref`);
    legacyIds.set(node.id, { splitter });
    const at = node.position ?? { x: 0, y: 0 };
    addedNodes.push(
      { id: splitter, type: node.type, position: { x: at.x + 120, y: at.y }, data: { type: 'phase_splitter', label: 'Phase Splitter', params: {}, ports: libPorts('phase_splitter') } } as VLabNode,
      { id: reference, type: node.type, position: { x: at.x, y: at.y + 120 }, data: { type: 'ground', label: 'Electrical Reference', params: {}, ports: libPorts('ground') } } as VLabNode,
    );
    addedEdges.push(
      { id: `${node.id}_abc_to_split`, source: node.id, sourceHandle: 'abc_s', target: splitter, targetHandle: 'abc_t' } as VLabEdge,
      { id: `${node.id}_n_to_ref`, source: node.id, sourceHandle: 'n_s', target: reference, targetHandle: libPorts('ground')[0].id + '_t' } as VLabEdge,
    );
    return { ...node, data: { ...node.data, ports: libPorts('three_phase_source') } } as VLabNode;
  });
  const phase = /^([abc])_[st]$/;
  const migratedEdges = edges.map((edge) => {
    let next = edge;
    if (legacyIds.has(edge.source) && phase.test(edge.sourceHandle ?? '')) {
      next = { ...next, source: legacyIds.get(edge.source)!.splitter };
    }
    if (legacyIds.has(edge.target) && phase.test(edge.targetHandle ?? '')) {
      next = { ...next, target: legacyIds.get(edge.target)!.splitter };
    }
    return next;
  });
  return { nodes: [...migratedNodes, ...addedNodes], edges: [...migratedEdges, ...addedEdges] };
};

/**
 * WP-12b: the stator / AC terminals of the three-phase machines (ac_motor, pmsm, bldc_motor) and of the two-level inverter
 * (pwm_3ph_2level) are the composite three-phase port `abc` (like the WP-12a three_phase_source) instead of the scalar ports
 * a, b, c. A saved node with scalar a / b / c keeps its circuit: a Phase Splitter (abc -> a, b, c) is inserted between the
 * composite port and the old scalar wires, and every edge that touched a / b / c is re-pointed to the splitter's scalar
 * ports. A legacy inverter's scalar `vabc` input was the amplitude of its V/f generator (it is a width-3 reference now), so
 * that wire is re-pointed to the new scalar `amp` input.
 * A node is legacy when its saved `ports` list has `a` and no `abc`, or when it has no saved list but an edge uses a phase handle.
 */
const COMPOSITE_PHASE_BLOCKS: ReadonlySet<string> = new Set(['ac_motor', 'pmsm', 'bldc_motor', 'pwm_3ph_2level']);
const PHASE_HANDLE = /^([abc])_[st]$/;

const migrateScalarPhasePorts = (nodes: VLabNode[], edges: VLabEdge[]): { nodes: VLabNode[]; edges: VLabEdge[] } => {
  const touchedByPhaseEdge = new Set<string>();
  for (const e of edges) {
    if (PHASE_HANDLE.test(e.sourceHandle ?? '')) touchedByPhaseEdge.add(e.source);
    if (PHASE_HANDLE.test(e.targetHandle ?? '')) touchedByPhaseEdge.add(e.target);
  }
  const legacy = nodes.filter((n) => {
    if (!COMPOSITE_PHASE_BLOCKS.has(effectiveBlockType(n))) return false;
    const ports = n.data?.ports;
    if (Array.isArray(ports)) return ports.some((p: any) => p?.id === 'a') && !ports.some((p: any) => p?.id === 'abc');
    return touchedByPhaseEdge.has(n.id);
  });
  if (legacy.length === 0) return { nodes, edges };
  const blocks = VLAB_LIBRARY.flatMap((d) => d.blocks);
  const libPorts = (id: string) => blocks.find((b) => b.id === id)!.ports.map((p) => ({ ...p }));
  const taken = new Set(nodes.map((n) => n.id));
  const fresh = (base: string) => { let id = base; for (let i = 2; taken.has(id); i++) id = `${base}_${i}`; taken.add(id); return id; };
  const addedNodes: VLabNode[] = [];
  const addedEdges: VLabEdge[] = [];
  const splitterOf = new Map<string, string>();
  const migratedNodes = nodes.map((node) => {
    if (!legacy.includes(node)) return node;
    const splitter = fresh(`${node.id}_phase_split`);
    splitterOf.set(node.id, splitter);
    const at = node.position ?? { x: 0, y: 0 };
    addedNodes.push(
      { id: splitter, type: node.type, position: { x: at.x - 120, y: at.y }, data: { type: 'phase_splitter', label: 'Phase Splitter', params: {}, ports: libPorts('phase_splitter') } } as VLabNode,
    );
    addedEdges.push({ id: `${node.id}_abc_to_split`, source: node.id, sourceHandle: 'abc_s', target: splitter, targetHandle: 'abc_t' } as VLabEdge);
    return Array.isArray(node.data?.ports)
      ? { ...node, data: { ...node.data, ports: libPorts(effectiveBlockType(node)) } } as VLabNode
      : node;
  });
  const migratedEdges = edges.map((edge) => {
    let next = edge;
    if (splitterOf.has(edge.source) && PHASE_HANDLE.test(edge.sourceHandle ?? '')) next = { ...next, source: splitterOf.get(edge.source)! };
    if (splitterOf.has(edge.target)) {
      if (PHASE_HANDLE.test(edge.targetHandle ?? '')) next = { ...next, target: splitterOf.get(edge.target)! };
      else if (effectiveBlockType(nodes.find((n) => n.id === edge.target)!) === 'pwm_3ph_2level' && /^vabc_[st]$/.test(edge.targetHandle ?? '')) {
        next = { ...next, targetHandle: 'amp_t' };
      }
    }
    return next;
  });
  return { nodes: [...migratedNodes, ...addedNodes], edges: [...migratedEdges, ...addedEdges] };
};

export const normalizeLegacyVLabGraph = (
  inputNodes: VLabNode[],
  inputEdges: VLabEdge[],
): { nodes: VLabNode[]; edges: VLabEdge[] } => {
  const sources = migrateThreePhaseSources(inputNodes, inputEdges);
  const { nodes, edges } = migrateScalarPhasePorts(sources.nodes, sources.edges);
  const removedNodeIds = new Set(
    nodes
      .filter((node) => LEGACY_REMOVED_BLOCKS.has(effectiveBlockType(node)))
      .map((node) => node.id),
  );

  return {
    nodes: nodes
      .filter((node) => !removedNodeIds.has(node.id))
      .map(canonicalizeNodeParams)
      .map((node) => {
        const type = effectiveBlockType(node);
        // Every joint is re-synchronised with the library ports (new typed outputs are added, existing ids never renamed).
        if (!MULTIBODY_JOINT_TYPES.has(type)) return node;
        const block = VLAB_LIBRARY.flatMap((domain) => domain.blocks).find(
          (block) => block.id === type,
        )!;
        if (type === 'universal_joint') {
          const params = { ...node.data.params };
          for (const name of ['axis1', 'axis2', 'damping'])
            if (params[name] === undefined)
              params[name] = { ...block.params[name] };
          return {
            ...node,
            data: {
              ...node.data,
              params,
              ports: block.ports.map((port) => ({ ...port })),
            },
          };
        }
        // the ball joint has no rotational damping; revolute / prismatic / weld keep their (canonicalized) parameters
        const { damping: _legacyDamping, ...withoutDamping } = node.data.params ?? {};
        const params = type === 'spherical_joint' ? withoutDamping : { ...(node.data.params ?? {}) };
        return {
          ...node,
          data: {
            ...node.data,
            params,
            ports: block.ports.map((port) => ({ ...port })),
          },
        };
      }),
    edges: edges.filter(
      (edge) =>
        !removedNodeIds.has(edge.source) && !removedNodeIds.has(edge.target),
    ),
  };
};
