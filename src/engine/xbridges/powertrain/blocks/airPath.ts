// Powertrain / Engine Calibration: Ambient Conditions, Throttle Body, Intake Manifold (user spec, no Simulink counterpart).
import type { XValue } from '../../types';
import { makeBus } from '../../bus/busCore';
import { definePtBlock } from '../ptBlock';
import type { PtBlockSpec, PtParamSpec, PtPortSpec } from '../ptSpec';

const SPEC_REF = 'docs/powertrain/engine-calibration-spec.md#2-blocks';
const R_DRY = 287.058; // J/(kg*K), dry air
const R_VAP = 461.495; // J/(kg*K), water vapor

const inp = (id: string, unit: string, simulinkIndex: number, description: string): PtPortSpec =>
  ({ id, name: id, direction: 'input', unit, simulinkIndex, description });
const out = (id: string, unit: string, simulinkIndex: number, description: string, dataType?: string): PtPortSpec =>
  ({ id, name: id, direction: 'output', unit, simulinkIndex, description, ...(dataType ? { dataType } : {}) });
const par = (name: string, label: string, unit: string, def: number, description: string,
  o: { min?: number; max?: number; minExclusive?: boolean; maxExclusive?: boolean } = {}): PtParamSpec =>
  ({ name, label, unit, default: def, kind: 'scalar', description, ...o });

const num = (v: XValue | undefined): number => (typeof v === 'number' ? v : Array.isArray(v) ? Number(v[0]) : NaN);

// ---------------------------------------------------------------- Ambient Conditions
const ambientSpec: PtBlockSpec = {
  type: 'PT_AMBIENT',
  label: 'Ambient Conditions',
  category: 'Powertrain / Engine Calibration / Test Cell and DoE',
  simulinkPath: '',
  source: 'user-spec',
  specRef: SPEC_REF,
  symbol: 'ambient',
  inputs: [],
  outputs: [
    out('Amb', 'bus', 1, 'Bus with P (Pa), T (K), RH (%), rho (kg/m^3, moist air) and p_v (Pa, vapor partial pressure).', 'Bus: AmbientBus'),
    out('P_amb', 'Pa', 2, 'Ambient absolute pressure.'),
    out('T_amb', 'K', 3, 'Ambient air temperature.'),
  ],
  params: [
    par('P_amb', 'Ambient pressure', 'Pa', 101325, 'Ambient absolute pressure of the test cell or site.', { min: 0, minExclusive: true }),
    par('T_amb', 'Ambient temperature', 'K', 298.15, 'Ambient air temperature of the test cell or site.', { min: 0, minExclusive: true }),
    par('RH', 'Relative humidity', '%', 50, 'Relative humidity of the ambient air, 0 (dry) to 100 (saturated).', { min: 0, max: 100 }),
  ],
  states: [],
  equations: [
    'p_sat = 610.94*exp(17.625*(T - 273.15)/(T - 30.11)) Pa, T in K (Magnus form, Alduchov & Eskridge 1996)',
    'p_v = RH/100*p_sat',
    'rho = (P - p_v)/(287.058*T) + p_v/(461.495*T)',
  ],
  references: [
    'Alduchov & Eskridge, Improved Magnus form approximation of saturation vapor pressure, J. Appl. Meteorol. 35, 1996',
    'Heywood, Internal Combustion Engine Fundamentals, McGraw-Hill 1988, ch. 4 (moist air)',
  ],
  description: 'Constant ambient condition source for engine test cells and calibration experiments. It outputs pressure, temperature and relative humidity together with the moist-air density and the water-vapor partial pressure.',
  behavior: 'Computes the saturation pressure with the Magnus formula, scales it by the relative humidity to get the vapor partial pressure, and adds the densities of dry air and water vapor as ideal gases. Outputs are constant. A vapor pressure at or above the total pressure is reported as an error.',
  example: 'With the defaults 101325 Pa, 298.15 K and 50 % RH the block gives p_v = 1580.9 Pa and rho = 1.1769 kg/m^3, slightly below the dry-air value 1.1839 kg/m^3.',
};

const ambientFactory = definePtBlock(ambientSpec, {
  execute: (_ins, p) => {
    const P = p.P_amb, T = p.T_amb, RH = p.RH;
    const psat = 610.94 * Math.exp((17.625 * (T - 273.15)) / (T - 30.11));
    const pv = (RH / 100) * psat;
    if (!(pv < P)) return { outputs: [{}, 0, 0], error: 'Vapor pressure must be below the ambient pressure' };
    const rho = (P - pv) / (R_DRY * T) + pv / (R_VAP * T);
    return { outputs: [makeBus(['P', 'T', 'RH', 'rho', 'p_v'], [P, T, RH, rho, pv]), P, T] };
  },
});

// ---------------------------------------------------------------- Throttle Body
const throttleSpec: PtBlockSpec = {
  type: 'PT_THROTTLE_BODY',
  label: 'Throttle Body',
  category: 'Powertrain / Engine Calibration / Air Path',
  simulinkPath: '',
  source: 'user-spec',
  specRef: SPEC_REF,
  symbol: 'throttle',
  inputs: [
    inp('alpha', 'deg', 1, 'Throttle plate angle from the closed stop, clamped to 0 .. 90 - alpha0.'),
    inp('P_amb', 'Pa', 2, 'Ambient (upstream) absolute pressure.'),
    inp('P_map', 'Pa', 3, 'Intake manifold (downstream) absolute pressure.'),
    inp('T_amb', 'K', 4, 'Ambient air temperature; used as the upstream temperature for both flow directions.'),
  ],
  outputs: [
    out('Info', 'bus', 1, 'Bus with Area (m^2), PressureRatio, Choked (1/0) and FlowDirection (1, -1 or 0).', 'Bus: ThrottleBodyInfo'),
    out('mdot_th', 'kg/s', 2, 'Air mass flow through the throttle; positive into the manifold, negative when the manifold pressure is higher.'),
  ],
  params: [
    par('D_th', 'Throttle bore diameter', 'm', 0.05, 'Diameter of the throttle bore; sets the fully open flow area.', { min: 0, minExclusive: true }),
    par('Cd', 'Discharge coefficient', '1', 0.8, 'Discharge coefficient of the throttle orifice, 0 to 1.', { min: 0, max: 1, minExclusive: true }),
    par('alpha0', 'Closed plate offset angle', 'deg', 5, 'Angle of the plate at the closed stop relative to the bore axis plane; the plate is fully open at alpha = 90 - alpha0.', { min: 0, max: 90, maxExclusive: true }),
    par('A_leak', 'Leak area', 'm^2', 1e-6, 'Residual flow area with a closed plate (idle bypass and plate clearance).', { min: 0 }),
    par('gamma', 'Heat capacity ratio', '1', 1.4, 'Ratio of specific heats of the intake air; sets the choking pressure ratio.', { min: 1, minExclusive: true }),
    par('R', 'Gas constant', 'J/(kg*K)', 287, 'Specific gas constant of the intake air.', { min: 0, minExclusive: true }),
  ],
  states: [],
  equations: [
    'alpha is clamped to [0, 90 - alpha0] deg; psi = alpha + alpha0',
    'A = (pi*D_th^2/4)*(1 - cos(psi)/cos(alpha0)) + A_leak',
    'upstream = side with the higher pressure; pr = p_down/p_up; T_up = T_amb for both flow directions',
    'mdot = sign*Cd*A*p_up/sqrt(R*T_up)*Psi(pr), sign = +1 for P_amb > P_map, -1 for P_amb < P_map, 0 if equal',
    'Psi = sqrt(2g/(g-1)*(pr^(2/g) - pr^((g+1)/g))) for pr > pr_c = (2/(g+1))^(g/(g-1)); else sqrt(g*(2/(g+1))^((g+1)/(g-1))) (choked)',
  ],
  references: [
    'Heywood, Internal Combustion Engine Fundamentals, McGraw-Hill 1988, ch. 7 (flow through the throttle)',
    'Guzzella & Onder, Introduction to Modeling and Control of Internal Combustion Engine Systems, Springer 2010, ch. 2',
  ],
  description: 'Throttle plate in the intake duct modeled as a variable-area compressible orifice. The plate angle sets the flow area, and the pressures on both sides set the flow, including choked flow and reverse flow.',
  behavior: 'The flow area grows from the leak area at the closed stop to the full bore at 90 - alpha0 degrees; angles outside that range are clamped. The side with the higher pressure is upstream and its temperature is taken as T_amb for both directions (assumption). Flow is choked at pressure ratios at or below the critical ratio and is exactly zero when both pressures are equal.',
  example: 'With the defaults, alpha = 30 deg and T_amb = 298.15 K the area is 3.4995e-4 m^2. At P_amb = 101325 Pa and P_map = 30000 Pa the flow is choked (pressure ratio 0.296) and mdot_th = 0.0664 kg/s; at P_map = 91192.5 Pa (ratio 0.9) it is 0.0410 kg/s.',
};

const psiFn = (pr: number, g: number): { psi: number; choked: boolean } => {
  const prc = Math.pow(2 / (g + 1), g / (g - 1));
  if (pr <= prc) return { psi: Math.sqrt(g * Math.pow(2 / (g + 1), (g + 1) / (g - 1))), choked: true };
  return { psi: Math.sqrt(((2 * g) / (g - 1)) * (Math.pow(pr, 2 / g) - Math.pow(pr, (g + 1) / g))), choked: false };
};

const throttleFactory = definePtBlock(throttleSpec, {
  execute: (ins, p) => {
    const alphaIn = num(ins[0]), Pa = num(ins[1]), Pm = num(ins[2]), Ta = num(ins[3]);
    const zero = { outputs: [{}, 0] as XValue[] };
    if (![alphaIn, Pa, Pm, Ta].every(Number.isFinite)) return { ...zero, error: 'Throttle inputs must be finite' };
    if (Pa < 0 || Pm < 0) return { ...zero, error: 'Pressures must be >= 0 Pa' };
    if (Ta <= 0) return { ...zero, error: 'T_amb must be > 0 K' };
    const alpha = Math.min(Math.max(alphaIn, 0), 90 - p.alpha0);
    const psiAng = ((alpha + p.alpha0) * Math.PI) / 180;
    const A = ((Math.PI * p.D_th * p.D_th) / 4) * (1 - Math.cos(psiAng) / Math.cos((p.alpha0 * Math.PI) / 180)) + p.A_leak;
    if (Pa === Pm) {
      return { outputs: [makeBus(['Area', 'PressureRatio', 'Choked', 'FlowDirection'], [A, 1, 0, 0]), 0] };
    }
    const dir = Pa > Pm ? 1 : -1;
    const pUp = Math.max(Pa, Pm), pDown = Math.min(Pa, Pm);
    const pr = pDown / pUp;
    const { psi, choked } = psiFn(pr, p.gamma);
    const mdot = (dir * p.Cd * A * pUp * psi) / Math.sqrt(p.R * Ta);
    return { outputs: [makeBus(['Area', 'PressureRatio', 'Choked', 'FlowDirection'], [A, pr, choked ? 1 : 0, dir]), mdot] };
  },
});

// ---------------------------------------------------------------- Intake Manifold
const manifoldSpec: PtBlockSpec = {
  type: 'PT_INTAKE_MANIFOLD',
  label: 'Intake Manifold',
  category: 'Powertrain / Engine Calibration / Air Path',
  simulinkPath: '',
  source: 'user-spec',
  specRef: SPEC_REF,
  symbol: 'intake-manifold',
  inputs: [
    inp('mdot_in', 'kg/s', 1, 'Air mass flow into the manifold (from the throttle or compressor); negative for reverse flow.'),
    inp('N', 'rpm', 2, 'Engine speed; N <= 0 gives zero cylinder flow.'),
    inp('mdot_egr', 'kg/s', 3, 'Recirculated exhaust gas mass flow into the manifold.'),
    inp('T_in', 'K', 4, 'Temperature of the incoming air.'),
    inp('T_egr', 'K', 5, 'Temperature of the recirculated exhaust gas.'),
  ],
  outputs: [
    out('Info', 'bus', 1, 'Bus with dPdt (Pa/s), MassIn (kg/s, total inflow) and MassOut (kg/s, cylinder flow).', 'Bus: IntakeManifoldInfo'),
    out('P_map', 'Pa', 2, 'Manifold absolute pressure (state).'),
    out('T_map', 'K', 3, 'Manifold gas temperature, flow-weighted mix of the inflows.'),
    out('mdot_cyl', 'kg/s', 4, 'Air mass flow drawn by the cylinders (speed-density).'),
  ],
  params: [
    par('V_m', 'Manifold volume', 'm^3', 3e-3, 'Gas volume of the intake manifold including runners.', { min: 0, minExclusive: true }),
    par('R', 'Gas constant', 'J/(kg*K)', 287, 'Specific gas constant of the manifold gas.', { min: 0, minExclusive: true }),
    par('eta_v', 'Volumetric efficiency', '1', 0.9, 'Constant volumetric efficiency used in the speed-density cylinder flow.', { min: 0, minExclusive: true }),
    par('Vd_tot', 'Total displacement', 'm^3', 2e-3, 'Displaced volume of all cylinders per engine cycle.', { min: 0, minExclusive: true }),
    par('P_o', 'Initial manifold pressure', 'Pa', 1e5, 'Manifold absolute pressure at the start of the simulation.', { min: 0, minExclusive: true }),
  ],
  states: ['P'],
  equations: [
    'T_map = (mdot_in*T_in + mdot_egr*T_egr)/(mdot_in + mdot_egr) for non-negative inflows with a positive sum; otherwise T_in',
    'mdot_cyl = eta_v*P*Vd_tot*N/(120*R*T_map), 0 for N <= 0',
    'dP/dt = R*T_map/V_m*(mdot_in + mdot_egr - mdot_cyl), P(0) = P_o',
  ],
  references: [
    'Heywood, Internal Combustion Engine Fundamentals, McGraw-Hill 1988, ch. 7 (manifold filling)',
    'Guzzella & Onder, Introduction to Modeling and Control of Internal Combustion Engine Systems, Springer 2010, ch. 2 (mean-value manifold model)',
  ],
  description: 'Lumped intake manifold volume with one pressure state. Air from the throttle and recirculated exhaust fill it, and the cylinders empty it with a speed-density flow.',
  behavior: 'Pressure follows the mass balance of an isothermal volume. The manifold temperature is the mass-flow-weighted mix of the inflows, or T_in when there is no net positive inflow (including reverse flow). Cylinder flow is proportional to pressure and speed and is zero at N <= 0. A pressure that becomes negative is reported as an error.',
  example: 'With the defaults, P = 1e5 Pa, mdot_in = 0.03 kg/s, mdot_egr = 0, N = 2500 rpm and T_in = 298.15 K, T_map = 298.15 K, mdot_cyl = 0.04382 kg/s and dP/dt = -394309 Pa/s, so the manifold empties.',
};

const manifoldDyn = (ins: XValue[], p: Record<string, any>, P: number) => {
  const mIn = num(ins[0]), N = num(ins[1]), mEgr = num(ins[2]), Tin = num(ins[3]), Tegr = num(ins[4]);
  if (![mIn, N, mEgr, Tin, Tegr, P].every(Number.isFinite)) return 'Intake manifold inputs must be finite';
  if (Tin <= 0 || Tegr <= 0) return 'T_in and T_egr must be > 0 K';
  if (P < 0) return 'Manifold pressure became negative';
  const tot = mIn + mEgr;
  const Tm = mIn >= 0 && mEgr >= 0 && tot > 0 ? (mIn * Tin + mEgr * Tegr) / tot : Tin;
  const mCyl = N > 0 ? (p.eta_v * P * p.Vd_tot * N) / (120 * p.R * Tm) : 0;
  const dP = ((p.R * Tm) / p.V_m) * (tot - mCyl);
  return { Tm, mCyl, dP, tot };
};

const manifoldFactory = definePtBlock(manifoldSpec, {
  init: p => ({ P: p.P_o }),
  derivatives: (ins, p, state) => {
    const d = manifoldDyn(ins, p, state.P);
    return typeof d === 'string' ? { P: 0 } : { P: d.dP };
  },
  execute: (ins, p, state) => {
    const d = manifoldDyn(ins, p, state.P);
    if (typeof d === 'string') return { outputs: [{}, 0, 0, 0], error: d };
    return { outputs: [makeBus(['dPdt', 'MassIn', 'MassOut'], [d.dP, d.tot, d.mCyl]), state.P, d.Tm, d.mCyl] };
  },
});

export const AIR_PATH_BLOCKS: { spec: PtBlockSpec; factory: typeof ambientFactory }[] = [
  { spec: ambientSpec, factory: ambientFactory },
  { spec: throttleSpec, factory: throttleFactory },
  { spec: manifoldSpec, factory: manifoldFactory },
];
