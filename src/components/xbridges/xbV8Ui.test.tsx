// @vitest-environment jsdom
/**
 * WP-19 — gate V8 (UI) at component level: palette, block node, wiring rules, properties panel, undo/copy.
 * Plan: docs/superpowers/plans/2026-11-10-xbridges-full-verification.md (section 2 V8, section 6 UI, section 9 findings).
 *
 * Oracle: the block contract (BLOCK_LIBRARY factory: ports, parameters) and the plan's UI rules, never the rendered
 * output. Defects that exist today are pinned: single rules with `it.fails('XBV-9xx: ...')`, per-block rules with a
 * ratchet list (the actual failing list must equal the pinned one, so a new failure cannot appear unnoticed and a
 * fixed one must be removed from the list). Provisional ids XBV-9xx are renumbered by the planner.
 */
import React from 'react';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ReactFlow, ReactFlowProvider } from '@xyflow/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { BLOCK_LIBRARY, XBRIDGES_CATEGORIES } from '../../engine/xbridges/BlockDefinitions';
import { getPowertrainSpec } from '../../engine/xbridges/powertrain';

// Capture the props the workspace gives to ReactFlow so the connect/drop/click handlers can be fired in jsdom.
const captured: { props: any } = { props: null };
vi.mock('@xyflow/react', async (orig) => {
  const m: any = await orig();
  const Wrapped = (p: any) => { if (p.onConnect) captured.props = p; return React.createElement(m.ReactFlow, p); };
  return { ...m, ReactFlow: Wrapped };
});

import { XBlockNode } from './XBlockNode';
import { XbridgesPropertiesPanel } from './XbridgesPropertiesPanel';
import { XbridgesWorkspace } from './XbridgesWorkspace';

// The mock above wraps ReactFlow for the workspace; the node harness uses the same wrapper (harmless).
beforeAll(() => {
  class RO { observe() {} unobserve() {} disconnect() {} }
  (globalThis as any).ResizeObserver ??= RO;
  (globalThis as any).DOMMatrixReadOnly ??= class { m22 = 1; };
  window.HTMLElement.prototype.scrollIntoView ??= (() => undefined);
});
afterEach(cleanup);

const PALETTE = (XBRIDGES_CATEGORIES as { name: string; blocks: { type: string; label: string }[] }[]);
const PALETTE_TYPES = [...new Set(PALETTE.flatMap((c) => c.blocks.map((b) => b.type)))].sort();
const make = (type: string, params: Record<string, any> = {}) => BLOCK_LIBRARY[type](`${type}-t`, params) as any;
const wait = (ms: number) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });

/** Failing items of a per-block rule; the pinned list is the expected actual result (ratchet). */
function ratchet(actual: string[], pinned: string[]) {
  expect(actual.slice().sort()).toEqual(pinned.slice().sort());
}
const nodeTypes = { xblock: XBlockNode };

/** Renders one block inside ReactFlow and returns its handles in DOM order plus the console errors raised. */
function renderNode(data: any) {
  const errors: string[] = [];
  const spy = vi.spyOn(console, 'error').mockImplementation((...a: any[]) => { errors.push(a.map(String).join(' ').slice(0, 200)); });
  try {
    const { container, unmount } = render(
      <div style={{ width: 800, height: 600 }}>
        <ReactFlowProvider>
          <ReactFlow nodes={[{ id: data.id, type: 'xblock', position: { x: 0, y: 0 }, data }]} edges={[]} nodeTypes={nodeTypes} />
        </ReactFlowProvider>
      </div>,
    );
    const handles = Array.from(container.querySelectorAll('.react-flow__handle')).map((h) => ({
      id: h.getAttribute('data-handleid') ?? '',
      kind: h.classList.contains('source') ? 'source' : 'target',
      pos: h.getAttribute('data-handlepos') ?? '',
    }));
    const text = container.textContent ?? '';
    unmount();
    return { handles, text, errors };
  } finally { spy.mockRestore(); }
}

/** Contract handles of a block: virtual bridging ports of Inport/Outport are hidden by design (XBlockNode.renderPort). */
function expectedHandles(b: any) {
  const hidden = (p: any) => (b.type === 'Inport' && p.id === 'in') || (b.type === 'Outport' && p.id === 'out');
  return [
    ...(b.inputs ?? []).filter((p: any) => !hidden(p)).map((p: any) => ({ id: p.id, kind: 'target', pos: p.position ?? 'left' })),
    ...(b.outputs ?? []).filter((p: any) => !hidden(p)).map((p: any) => ({ id: p.id, kind: 'source', pos: p.position ?? 'right' })),
  ];
}
const key = (h: { id: string; kind: string; pos: string }) => `${h.kind}:${h.id}:${h.pos}`;

const PINNED: Record<string, string[]> = { 'V8-N2': [] };
const DEBUG = !!process.env.XBV8_DEBUG;
const report = (name: string, list: string[]) => { if (DEBUG) console.log(`RATCHET ${name} (${list.length}): ${JSON.stringify(list.sort())}`); };

const nodeRuns = new Map<string, ReturnType<typeof renderNode> & { block: any }>();
const nodeRun = (t: string) => {
  let r = nodeRuns.get(t);
  if (!r) { const block = make(t); r = { ...renderNode(block), block }; nodeRuns.set(t, r); }
  return r;
};

describe('block node (XBlockNode) over every palette block', () => {
  it('renders every palette block (checked count)', () => {
    expect(PALETTE_TYPES.length).toBe(228);
    for (const t of PALETTE_TYPES) nodeRun(t);
  }, 240_000);

  it('V8-N1: one handle per contract port, port id as handle id, source for outputs and target for inputs', () => {
    const bad = PALETTE_TYPES.filter((t) => {
      const r = nodeRun(t);
      const want = expectedHandles(r.block).map(key).map((k) => k.split(':').slice(0, 2).join(':')).sort();
      const got = r.handles.map(key).map((k) => k.split(':').slice(0, 2).join(':')).sort();
      return JSON.stringify(want) !== JSON.stringify(got);
    });
    report('V8-N1', bad);
    ratchet(bad, PINNED['V8-N1'] ?? []);
  }, 240_000);

  it('V8-N2: handles appear in factory order within inputs and within outputs on each side', () => {
    const bad = PALETTE_TYPES.filter((t) => {
      const r = nodeRun(t);
      const w = expectedHandles(r.block);
      // The node renders the ports grouped by side, so the contract order is checked within kind and side.
      const order = (list: { id: string; kind: string; pos: string }[], kind: string, pos: string) => list.filter((h) => h.kind === kind && h.pos === pos).map((h) => h.id).join(',');
      return ['left', 'right', 'top', 'bottom'].some((pos) => ['target', 'source'].some((kind) => order(w, kind, pos) !== order(r.handles, kind, pos)));
    });
    report('V8-N2', bad);
    ratchet(bad, PINNED['V8-N2'] ?? []);
  }, 240_000);

  it('V8-N3: each handle sits on the side the factory gives (defaults: inputs left, outputs right)', () => {
    const bad = PALETTE_TYPES.filter((t) => {
      const r = nodeRun(t);
      const got = new Map(r.handles.map((h) => [`${h.kind}:${h.id}`, h.pos]));
      return expectedHandles(r.block).some((h) => got.get(`${h.kind}:${h.id}`) !== h.pos);
    });
    report('V8-N3', bad);
    ratchet(bad, PINNED['V8-N3'] ?? []);
  }, 240_000);

  it('V8-N4: the block label (or its type name) is shown', () => {
    const bad = PALETTE_TYPES.filter((t) => {
      const r = nodeRun(t);
      // Inport, Outport and Subsystem are shown by their name parameter (the workspace keeps label and params.name in sync).
      const shown = String(r.block.label ?? (['Inport', 'Outport', 'Subsystem'].includes(t) ? r.block.params?.name : undefined) ?? r.block.type);
      return !r.text.includes(shown) && !r.text.includes(t);
    });
    report('V8-N4', bad);
    ratchet(bad, PINNED['V8-N4'] ?? []);
  }, 240_000);

  it('V8-N5: rendering raises no React or console error', () => {
    const bad = PALETTE_TYPES.filter((t) => nodeRun(t).errors.length > 0);
    report('V8-N5', bad);
    ratchet(bad, PINNED['V8-N5'] ?? []);
  }, 240_000);

  it('V8-N6: dynamic-input blocks render numInputs handles for 2 and for 5', () => {
    const dyn = PALETTE_TYPES.filter((t) => make(t).allowDynamicInputs);
    expect(dyn.length).toBe(14);
    const bad = dyn.filter((t) => [2, 5].some((n) => {
      // FUZZY_RULE sizes its inputs by numAntecedents (plus the fixed consequent input), every other block by numInputs.
      const block = t === 'FUZZY_RULE' ? make(t, { numAntecedents: n }) : make(t, { numInputs: n });
      const want = t === 'FUZZY_RULE' ? n + 1 : n;
      const r = renderNode(block);
      return r.handles.filter((h) => h.kind === 'target').length !== want;
    }));
    report('V8-N6', bad);
    ratchet(bad, PINNED['V8-N6'] ?? []);
  }, 120_000);
});

// ---------------------------------------------------------------------------------------------------------------------
// Properties panel
// ---------------------------------------------------------------------------------------------------------------------
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const HIDDEN_TF = new Set(['A', 'B', 'C', 'D', 'numerator', 'denominator', 'zeros', 'poles', 'gain', 'maxGain', 'representation', 'equation', 'lastFactor', 'lastMaxDegree', 'lastMappingType']);
/** Parameters edited elsewhere in the panel by design (derived transfer-function values, the sum sign editor, PWM duty from its port). */
function editedElsewhere(type: string, name: string) {
  if (['TRANSFER_FUNCTION', 'DISCRETE_TRANSFER_FUNCTION', 'ZERO_POLE_GAIN', 'ROOT_LOCUS', 'LAPLACE_TRANSFORM'].includes(type) && HIDDEN_TF.has(name)) return true;
  if (type === 'SUM_JUNCTION' && (name === 'signs' || name === 'numInputs')) return true;
  if (type === 'PWM_GENERATOR' && name === 'duty') return true;
  return false;
}
/** Documented labels other than the parameter name. */
function acceptedLabels(type: string, name: string): string[] {
  const out = [name];
  const pt = getPowertrainSpec(type)?.params.find((p) => p.name === name);
  if (pt?.label) out.push(pt.label);
  if (name === 'output_type') out.push('Output data type');
  if (name === 'smVarId') out.push('Source/Target SM Variable');
  if (name === 'fisConfig') out.push('Fuzzy Inference System (FIS)');
  return out.map(norm);
}
function editorFor(container: HTMLElement, type: string, name: string): HTMLElement | null {
  const wanted = acceptedLabels(type, name);
  for (const l of Array.from(container.querySelectorAll('label'))) {
    if (!wanted.includes(norm(l.textContent ?? ''))) continue;
    const e = l.parentElement?.querySelector('input,select,textarea');
    if (e) return e as HTMLElement;
  }
  const aria = Array.from(container.querySelectorAll('[aria-label]')).find((e) => wanted.includes(norm(e.getAttribute('aria-label') ?? '')));
  return (aria as HTMLElement) ?? null;
}
const isEnum = (type: string, name: string) => {
  const pt = getPowertrainSpec(type)?.params.find((p) => p.name === name);
  if (pt) return pt.kind === 'enum';
  return parameterKind(type, name)?.kind === 'option';
};
const paramsOf = (type: string) => Object.entries(make(type).params ?? {}).filter(([n]) => !editedElsewhere(type, n)) as [string, any][];

import { parameterKind } from '../../engine/xbridges/parameterSchema';

interface PanelRun { type: string; calls: any[]; container: HTMLElement; unmount: () => void }
function openPanel(type: string): PanelRun {
  const block = make(type);
  const calls: any[] = [];
  const onUpdate = vi.fn((id: string, d: any) => { calls.push(d); });
  const { container, unmount } = render(<XbridgesPropertiesPanel block={block} onUpdate={onUpdate} onClose={vi.fn()} availableVariables={[]} />);
  return { type, calls, container, unmount };
}
const lastParam = (calls: any[], name: string) => {
  for (let i = calls.length - 1; i >= 0; i--) if (calls[i]?.params && name in calls[i].params) return { found: true, value: calls[i].params[name] };
  return { found: false, value: undefined as any };
};

// Ratchet lists measured on this commit (see the findings in the WP-19 report).
const PINNED_911 = ["MatrixConcat.axis", "SWITCH_CASE.numCases", "Scope.bufferSize", "Scope.numSignals"];
const PINNED_912 = ["LAPLACE_TRANSFORM.mappingType"];
/** XBV-137 pinned as 'Type: param param ...' (type names contain no spaces, parameter names no spaces). */
const PINNED_913_GROUPED = [
  "AC_INDUCTION_MOTOR: B J Lm Lr Ls P Rr Rs",
  "AC_MOTOR_PID_CONTROL: B J Kd Ki Kp Lm Lr Ls N P Rr Rs tl w_ref",
  "AIR_FRYER_LEARNING_MODEL: K_c K_evap K_f K_h K_loss T_ambient learning_rate sampleTime tau_c tau_f tau_h tau_s theta",
  "BUS_CREATOR: Inputs",
  "DOE_MODULE: maxLayers neuronsPerLayer",
  "FIELD_WEAKENING: Ki Kp id_max id_min v_max",
  "FUZZY_AND: numInputs",
  "FUZZY_DEFUZZIFY: range_max range_min resolution",
  "FUZZY_INFERENCE_SYSTEM: defuzzResolution numInputs",
  "FUZZY_MF_GAUSSMF: c sigma",
  "FUZZY_MF_SIGMF: a c",
  "FUZZY_MF_TRAPMF: a b c d",
  "FUZZY_MF_TRIMF: a b c",
  "FUZZY_OR: numInputs",
  "FUZZY_PID_CONTROLLER: Kd_base Ki_base Kp_base N max min numMFs",
  "FUZZY_RULE: numAntecedents",
  "FUZZY_SURFACE_VIEWER: resolution",
  "IM_FLUX_OBSERVER: Lm Lr P Rr",
  "IM_FOC_CONTROL: Ki_curr Ki_speed Kp_curr Kp_speed Lm Lr P Rr psi_ref",
  "IM_SCALAR_CONTROL: boost rated_f v_f_ratio",
  "INTERP_PRELOOKUP: NumberOfTableDimensions",
  "LMS_ADAPTIVE_FILTER: lr",
  "LOOKUP_ND: NumberOfTableDimensions",
  "MPC_CONTROLLER: Nc Np u_max u_min",
  "MTPA_CONTROLLER: Ld Lq psi_m",
  "MTPA_FW_MANAGER: Ld Lq P i_max psi_m v_max",
  "MatrixConcat: axis",
  "NEURAL_NEURON_LEARNING: initBias initW1 initW2 lr",
  "PT_AMBIENT: P_amb RH T_amb",
  "PT_AMT_CONTROLLER: Gear_o tHold",
  "PT_AUTOMATED_MANUAL_TRANSMISSION: Gear_o J_in Tc_max b_in omega_tol t_dis t_eng t_syn w_in_o",
  "PT_CALIBRATION_ECU: default_EgrPos default_PW default_P_rail default_SA default_SOI default_VgtPos",
  "PT_CI_CORE_ENGINE: AFRst LHV Ncyl R Vd cp_air cp_exh",
  "PT_CI_CYLINDER: B CR EVO IVC L LHV Ncyl R S T_knee Twall afrStoich aw cfA cfB cfC cfD cpB dTheta etaComb etaTrap gamma k_NOx mw s_diss",
  "PT_COMPRESSOR: P_ref R T_ref cp",
  "PT_CONTINUOUSLY_VARIABLE_TRANSMISSION: N_o Nmax Nmin eta tau",
  "PT_CONTROL_VOLUME: NumPorts P_o R T_o V cp",
  "PT_CVT_CONTROLLER: Nmax Nmin wMin",
  "PT_DATASHEET_BATTERY: BattCapInit BattChargeMax Np Ns",
  "PT_DCT_CONTROLLER: Gear_o tHold",
  "PT_DISC_CLUTCH: Ap J_in J_out Nf Ri Ro b_in b_out muk mus omega_tol w_in_o w_out_o",
  "PT_DOE_SWEEPER: Lambda_min NOx_max Pmax_limit Texh_limit averageWindow centerPoints dwell levels samples seed",
  "PT_DRIVE_CYCLE_SOURCE: Ts",
  "PT_DRIVE_SHAFT: J b w_o",
  "PT_DUAL_CLUTCH_TRANSMISSION: Gear_o J_in Tc_max b_in omega_tol t_x w_in_o",
  "PT_ENGINE_DYNO: J_dyno J_eng Ki Kp N_o",
  "PT_EQUIVALENT_CIRCUIT_BATTERY: BattCapInit BattChargeMax Np Ns",
  "PT_FLOW_BOUNDARY: Prs Temp",
  "PT_FLOW_RESTRICTION: Area Cd R cp",
  "PT_FUEL_INJECTOR: Cd N_cyl d_noz n_holes rho_f",
  "PT_HEAT_EXCHANGER: Area Cd R cp eps",
  "PT_INTAKE_MANIFOLD: P_o R V_m Vd_tot eta_v",
  "PT_LIMITED_SLIP_DIFFERENTIAL: Fc Jd Jw1 Jw2 Ndiff Np Ri Ro bd bw1 bw2 eta muc w1_o w2_o",
  "PT_LONGITUDINAL_DRIVER: Kaw Kff Kg Ki Kp vnom",
  "PT_LONGITUDINAL_WHEEL: B C Crr D E Iyy OMEGA_TH Re Rm VXLOW disc_abore mu_kinetic num_pads omega_o",
  "PT_MAPPED_MOTOR: Tc",
  "PT_OPEN_DIFFERENTIAL: Ndiff bw eta",
  "PT_PLANETARY_GEAR: Jc Jr Js Nr Ns wc_o ws_o",
  "PT_ROTATIONAL_INERTIA: J b omega_o",
  "PT_SI_CYLINDER: AFR_stoich B CR EVO IVC L LHV Ncyl ON R S T_knee Twall aw cfA cfB cfC cfD cpB dTheta dTheta_comb dTheta_id etaComb etaTrap gamma k_NOx mw s_diss",
  "PT_THROTTLE_BODY: A_leak Cd D_th R alpha0 gamma",
  "PT_TORSIONAL_COMPLIANCE: b k theta_o",
  "PT_TRANSFER_CASE: Ntc TrqSplitRatio eta",
  "PT_TURBINE: Cd_wg P_ref R T_ref cp",
  "PT_TURBOCHARGER: A_t_max A_t_min A_wg_max Cd_t J_tc N_tc0 R cp_c cp_t eta_c eta_m eta_t gamma_c gamma_t r_c sigma",
  "PT_VEHICLE_BODY_1DOF: Af Cd Cl Cpm M NF NR Pabs a b g h xdot_o",
  "PT_VVT_VALVETRAIN: B CR D_exh D_int EVC_base EVO_base IVC_base IVO_base L L_max S eta_v0 gamma k_ov",
  "PWM_GENERATOR: frequency",
  "RL_Q_LEARNING_CONTROLLER: alpha epsilon gamma numActions numStates",
  "ROBOT_VACUUM_BATTERY: capacity_Ah charge_rate nominal_voltage static_draw_A",
  "ROBOT_VACUUM_BOUSTROPHEDON_SWEEP: spacing",
  "ROBOT_VACUUM_COMM: latency_ms packet_loss_rate",
  "ROBOT_VACUUM_CONTINUOUS_ENERGY: energy_per_meter safety_margin",
  "ROBOT_VACUUM_DIGITAL_TWIN: Ki_wheel Kp_wheel encoder_cpr lidar_max_range lidar_noise_std motor_K motor_L motor_R robot_inertia robot_mass wheel_radius wheel_separation",
  "ROBOT_VACUUM_DYNAMICS: cg_offset robot_inertia robot_mass wheel_friction wheel_radius wheel_separation",
  "ROBOT_VACUUM_ENCODER: encoder_cpr noise_std",
  "ROBOT_VACUUM_ENVIRONMENT: lidar_max_range lidar_noise_std",
  "ROBOT_VACUUM_ERODE_MASK: radius",
  "ROBOT_VACUUM_FUSION: filter_gain",
  "ROBOT_VACUUM_KINEMATICS: wheel_radius wheel_separation",
  "ROBOT_VACUUM_LIDAR: lidar_max_range lidar_noise_std",
  "ROBOT_VACUUM_LOCALIZATION: filter_gain",
  "ROBOT_VACUUM_MAPPING: lidar_max_range",
  "ROBOT_VACUUM_MOTOR: encoder_cpr encoder_noise_std inertia motor_K motor_L motor_R",
  "ROBOT_VACUUM_MOTOR_COMMAND: Ki_wheel Kp_wheel wheel_radius wheel_separation",
  "ROBOT_VACUUM_ODOMETRY: encoder_cpr wheel_radius wheel_separation",
  "ROBOT_VACUUM_SLAM: lidar_max_range",
  "ROBOT_VACUUM_THETA_STAR: inflation",
  "ROBOT_VACUUM_WHEEL_CONTROL: Ki_wheel Kp_wheel V_bat",
  "SENSORLESS_SIX_STEP: threshold",
  "SINGLE_PHASE_H_BRIDGE: Ron",
  "SVPWM_CORE: Ts Vdc",
  "SVPWM_GATE_GENERATOR: Ts",
  "SVPWM_MODULATOR: Ts Vdc",
  "SWITCH_CASE: numCases",
  "Scope: bufferSize numSignals",
  "THREE_PHASE_INVERTER: Ron Vf",
  "THREE_PHASE_PWM: frequency",
  "VF_SLIP_COMP: rated_iq rated_slip v_f_ratio",
];
const PINNED_913 = PINNED_913_GROUPED.flatMap((g) => { const [t, ps] = g.split(': '); return ps.split(' ').map((p) => `${t}.${p}`); });

describe('properties panel over every palette block', () => {
  const pairs: [string, string, any][] = PALETTE_TYPES.flatMap((t) => paramsOf(t).map(([n, v]) => [t, n, v] as [string, string, any]));
  const numeric = pairs.filter(([t, n, v]) => typeof v === 'number' && !isEnum(t, n));
  const enums = pairs.filter(([t, n]) => isEnum(t, n));

  it('counts of what is checked', () => {
    if (DEBUG) console.log(`PANEL blocks=${PALETTE_TYPES.length} params=${pairs.length} numeric=${numeric.length} enums=${enums.length}`);
    expect(pairs.length).toBeGreaterThan(300);
  });

  it('V8-P0: every factory parameter has an editor labelled with its name or documented label', () => {
    const bad: string[] = [];
    for (const t of PALETTE_TYPES) {
      const run = openPanel(t);
      for (const [n] of paramsOf(t)) if (!editorFor(run.container, t, n)) bad.push(`${t}.${n}`);
      run.unmount();
    }
    report('V8-P0', bad);
    ratchet(bad, PINNED['V8-P0'] ?? []);
  }, 240_000);

  // Pinned: the numeric parameters edited through a select (MatrixConcat.axis, SWITCH_CASE.numCases, Scope.numSignals,
  // Scope.bufferSize) cannot take 0, -2.5 or 0.125; every text editor stores the exact number.
  it('XBV-135: editing a numeric parameter to 0, -2.5 and 0.125 stores exactly that number', () => {
    const bad: string[] = [];
    for (const t of PALETTE_TYPES) {
      const mine = numeric.filter(([tt]) => tt === t);
      if (mine.length === 0) continue;
      const run = openPanel(t);
      for (const [, n] of mine) {
        const ed = editorFor(run.container, t, n) as HTMLInputElement | null;
        // Select-edited numeric parameters are XBV-135, not this rule: skip them so this pin can flip on an onBlur fix.
        if (!ed || ed.tagName !== 'INPUT') continue;
        fireEvent.change(ed, { target: { value: '99' } });
        const ok = [0, -2.5, 0.125].every((v) => {
          fireEvent.change(ed, { target: { value: String(v) } });
          const r = lastParam(run.calls, n);
          return r.found && Object.is(r.value, v);
        });
        if (!ok) bad.push(`${t}.${n}`);
      }
      run.unmount();
    }
    report('XBV-135', bad);
    ratchet(bad, PINNED_911);
  }, 240_000);

  it('XBV-136: an enumerated parameter is a select whose options include the current default', () => {
    const bad: string[] = [];
    for (const t of PALETTE_TYPES) {
      const mine = enums.filter(([tt]) => tt === t);
      if (mine.length === 0) continue;
      const run = openPanel(t);
      for (const [, n, v] of mine) {
        const ed = editorFor(run.container, t, n) as HTMLSelectElement | null;
        if (!ed || ed.tagName !== 'SELECT' || !Array.from(ed.options).some((o) => o.value === String(v))) bad.push(`${t}.${n}`);
      }
      run.unmount();
    }
    report('XBV-136', bad);
    ratchet(bad, PINNED_912);
  }, 240_000);

  it('XBV-137: invalid text ("abc") in a numeric parameter shows an error', () => {
    const bad: string[] = [];
    for (const t of PALETTE_TYPES) {
      const mine = numeric.filter(([tt]) => tt === t);
      if (mine.length === 0) continue;
      const run = openPanel(t);
      for (const [, n] of mine) {
        const ed = editorFor(run.container, t, n) as HTMLInputElement | null;
        if (!ed || ed.tagName !== 'INPUT') { bad.push(`${t}.${n}`); continue; }
        fireEvent.change(ed, { target: { value: 'abc' } });
        const field = ed.parentElement as HTMLElement;
        if (!field.querySelector('[role="alert"]')) bad.push(`${t}.${n}`);
      }
      run.unmount();
    }
    report('XBV-137', bad);
    ratchet(bad, PINNED_913);
  }, 240_000);

  // Pinned for every numeric parameter (576): on blur the panel stores the raw text "abc" as the parameter value
  // (the model is then refused at run time by the parameter diagnostics, but the number is lost).
  it.fails('XBV-138: invalid text ("abc") in a numeric parameter does not overwrite the stored number', () => {
    const bad: string[] = [];
    for (const t of PALETTE_TYPES) {
      const mine = numeric.filter(([tt]) => tt === t);
      if (mine.length === 0) continue;
      const run = openPanel(t);
      for (const [, n] of mine) {
        const ed = editorFor(run.container, t, n) as HTMLInputElement | null;
        if (!ed || ed.tagName !== 'INPUT') { bad.push(`${t}.${n}`); continue; }
        fireEvent.change(ed, { target: { value: 'abc' } });
        fireEvent.blur(ed);
        const r = lastParam(run.calls, n);
        if (r.found && typeof r.value !== 'number') bad.push(`${t}.${n}`);
      }
      run.unmount();
    }
    report('XBV-138', bad);
    expect(bad).toEqual([]);
  }, 240_000);
});

it.fails('XBV-139: a parameter editor is programmatically tied to its label (getByLabelText finds it)', () => {
  // The panel renders <label> and the editor as siblings without htmlFor / aria-label, so assistive technology and
  // getByLabelText cannot reach the editor (Constant.value, GAIN.gain as the sample).
  render(<XbridgesPropertiesPanel block={make('GAIN')} onUpdate={vi.fn()} onClose={vi.fn()} />);
  expect(screen.getByLabelText(/^gain$/i)).toBeTruthy();
});

// ---------------------------------------------------------------------------------------------------------------------
// Workspace: palette, wiring, undo/redo, copy/paste
// ---------------------------------------------------------------------------------------------------------------------
const wsNode = (id: string, type: string, x = 0, y = 0) => ({ id, type: 'xblock', position: { x, y }, data: make(type, {}) && { ...BLOCK_LIBRARY[type](id, {}) } });
// The workspace re-renders endlessly when its default array props are recreated on each render, so stable ones are passed.
const NO_MAPPINGS: any[] = [];
const NO_VARIABLES: any[] = [];
const renderWorkspace = (nodes: any[] = [], edges: any[] = []) =>
  render(<XbridgesWorkspace initialNodes={nodes} initialEdges={edges} initialMappings={NO_MAPPINGS} availableVariables={NO_VARIABLES} />);
const rfNodes = () => (captured.props?.nodes ?? []) as any[];
const rfEdges = () => (captured.props?.edges ?? []) as any[];
const keyDown = (code: string, extra: Record<string, any> = {}) => act(async () => { fireEvent.keyDown(window, { code, key: code, ...extra }); });
const fakeDrop = (type: string) => ({
  preventDefault() {}, target: { getBoundingClientRect: () => ({ width: 0, height: 0, left: 0, top: 0 }) },
  dataTransfer: { getData: () => type },
});
const dropBlock = async (type: string) => { await act(async () => { captured.props.onDrop(fakeDrop(type)); }); };
const selectNode = async (id: string) => {
  const n = rfNodes().find((x) => x.id === id);
  // A click selects the node in React Flow as well; without that React Flow reports an empty selection and the panel closes.
  await act(async () => { captured.props.onNodesChange([{ type: 'select', id, selected: true }]); });
  await act(async () => { captured.props.onNodeClick({}, rfNodes().find((x) => x.id === id) ?? n); });
};
const dataOf = (id: string) => rfNodes().find((x) => x.id === id)?.data;

describe('palette in the rendered workspace', () => {
  it('lists exactly the XBRIDGES_CATEGORIES entries, with their labels, once the categories are expanded', async () => {
    const { container } = renderWorkspace();
    await wait(50);
    for (const cat of PALETTE) {
      const header = screen.getByText(cat.name, { selector: 'button *, button' }).closest('button') as HTMLElement;
      if (header.parentElement!.children.length === 1) fireEvent.click(header); // collapsed: no block list next to the header
    }
    const shown = Array.from(container.querySelectorAll('[draggable="true"]')).map((e) => (e.lastElementChild?.textContent ?? '').trim()).sort();
    const want = PALETTE.flatMap((c) => c.blocks.map((b) => b.label)).sort();
    expect(want.length).toBe(228);
    expect(shown).toEqual(want);
    // category headers: each palette category name is rendered in the library
    for (const c of PALETTE) expect(container.textContent ?? '', c.name).toContain(c.name);
  }, 120_000);

  it('searching the quick-search box by label finds every palette entry (checked: all labels)', async () => {
    renderWorkspace();
    await wait(50);
    await act(async () => { captured.props.onPaneClick({ detail: 2, clientX: 10, clientY: 10 }); });
    const box = screen.getByPlaceholderText('Search blocks...') as HTMLInputElement;
    const menu = box.closest('.fixed') as HTMLElement;
    const missing: string[] = [];
    for (const cat of PALETTE) for (const b of cat.blocks) {
      fireEvent.change(box, { target: { value: b.label } });
      const labels = Array.from(menu.querySelectorAll('span.text-xs')).map((e) => e.textContent);
      if (!labels.includes(b.label)) missing.push(`${b.type}(${b.label})`);
    }
    report('search', missing);
    expect(missing).toEqual([]);
  }, 240_000);
});

describe('wiring rules in the workspace', () => {
  const setup = async () => {
    renderWorkspace([wsNode('c1', 'Constant'), wsNode('c2', 'Constant', 0, 100), wsNode('g1', 'GAIN', 200, 0), wsNode('g2', 'GAIN', 200, 100)]);
    await wait(50);
  };
  const gain = make('GAIN');
  const constant = make('Constant');
  const IN = gain.inputs[0].id, OUT = gain.outputs[0].id, COUT = constant.outputs[0].id;
  const connect = (source: string, sourceHandle: string, target: string, targetHandle: string) =>
    act(async () => { captured.props.onConnect({ source, sourceHandle, target, targetHandle }); });

  it('output -> input is allowed and creates one edge', async () => {
    await setup();
    await connect('c1', COUT, 'g1', IN);
    expect(rfEdges().filter((e) => e.source === 'c1' && e.target === 'g1' && e.targetHandle === IN)).toHaveLength(1);
  });

  it('input -> input and output -> output are refused (isValidConnection when present, otherwise ReactFlow strict handle types)', async () => {
    await setup();
    const p = captured.props;
    // The workspace declares no isValidConnection and no connectionMode; ReactFlow then runs in strict mode, which only
    // connects a source handle to a target handle. Input ports are target handles and output ports are source handles
    // (see the V8-N1 ratchet), so the two illegal pairs cannot be drawn. onConnect itself has no guard.
    const mode = p.connectionMode ?? 'strict';
    if (typeof p.isValidConnection === 'function') {
      expect(p.isValidConnection({ source: 'g1', sourceHandle: IN, target: 'g2', targetHandle: IN })).toBe(false);
      expect(p.isValidConnection({ source: 'g1', sourceHandle: OUT, target: 'g2', targetHandle: OUT })).toBe(false);
    } else {
      expect(mode).toBe('strict');
    }
  });

  it.fails('XBV-140: a second driver on an already-connected input is refused or replaces the first (one driver per input)', async () => {
    await setup();
    await connect('c1', COUT, 'g1', IN);
    const first = rfEdges().length;
    expect(first).toBe(1);
    const refused = typeof captured.props.isValidConnection === 'function'
      && captured.props.isValidConnection({ source: 'c2', sourceHandle: COUT, target: 'g1', targetHandle: IN }) === false;
    if (!refused) await connect('c2', COUT, 'g1', IN);
    expect(rfEdges().filter((e) => e.target === 'g1' && e.targetHandle === IN)).toHaveLength(1);
  });

  it('fan-out: one output may drive several inputs', async () => {
    await setup();
    await connect('c1', COUT, 'g1', IN);
    await connect('c1', COUT, 'g2', IN);
    expect(rfEdges().filter((e) => e.source === 'c1')).toHaveLength(2);
  });

  it('a self-connection on a feed-through block is accepted at wiring time (the algebraic loop is diagnosed at compile)', async () => {
    await setup();
    await connect('g1', OUT, 'g1', IN);
    expect(rfEdges().filter((e) => e.source === 'g1' && e.target === 'g1')).toHaveLength(1);
  });
});

describe('undo, redo, copy and paste in the workspace', () => {
  const VALUE = 'value';
  const editConstant = async (id: string, text: string) => {
    await selectNode(id);
    const ed = editorFor(document.body, 'Constant', VALUE) as HTMLInputElement;
    fireEvent.change(ed, { target: { value: text } });
    await wait(20);
  };

  it('Ctrl+Z undoes the addition of a block', async () => {
    renderWorkspace();
    await wait(50);
    await dropBlock('Constant');
    expect(rfNodes()).toHaveLength(1);
    await keyDown('KeyZ', { ctrlKey: true });
    expect(rfNodes()).toHaveLength(0);
  });

  it.fails('XBV-141: undo after a parameter change restores the previous value and keeps the block', async () => {
    renderWorkspace();
    await wait(50);
    await dropBlock('Constant');
    const id = rfNodes()[0].id;
    const before = JSON.stringify(dataOf(id).params.value);
    await editConstant(id, '7');
    expect(dataOf(id).params.value).toBe(7);
    await keyDown('KeyZ', { ctrlKey: true });
    expect(rfNodes()).toHaveLength(1);
    expect(JSON.stringify(dataOf(id).params.value)).toBe(before);
  });

  it.fails('XBV-142: redo (Ctrl+Y or Ctrl+Shift+Z) reapplies an undone addition', async () => {
    renderWorkspace();
    await wait(50);
    await dropBlock('Constant');
    await keyDown('KeyZ', { ctrlKey: true });
    expect(rfNodes()).toHaveLength(0);
    await keyDown('KeyY', { ctrlKey: true });
    if (rfNodes().length === 0) await keyDown('KeyZ', { ctrlKey: true, shiftKey: true });
    expect(rfNodes()).toHaveLength(1);
  });

  it('Ctrl+C / Ctrl+V duplicates the selected block with a new id and the same parameters', async () => {
    renderWorkspace();
    await wait(50);
    await dropBlock('Constant');
    const id = rfNodes()[0].id;
    await editConstant(id, '5');
    await keyDown('KeyC', { ctrlKey: true });
    await keyDown('KeyV', { ctrlKey: true });
    expect(rfNodes()).toHaveLength(2);
    const copy = rfNodes().find((n) => n.id !== id);
    expect(copy.id).not.toBe(id);
    expect(copy.data.params).toEqual(dataOf(id).params);
    expect(copy.data.params.value).toBe(5);
  });
});
