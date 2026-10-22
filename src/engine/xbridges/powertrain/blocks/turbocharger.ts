// Powertrain / Engine Calibration / Air Path / Turbocharger (parametric compressor + turbine + shaft).
import type { XValue } from '../../types';
import { makeBus } from '../../bus/busCore';
import { definePtBlock } from '../ptBlock';
import type { PtBlockSpec, PtParamSpec, PtPortSpec } from '../ptSpec';
import { rpm2radps, radps2rpm, orificePsi } from '../ptMath';

const inp = (id: string, unit: string, simulinkIndex: number, description: string): PtPortSpec =>
  ({ id, name: id, direction: 'input', unit, simulinkIndex, description });
const out = (id: string, unit: string, simulinkIndex: number, description: string, dataType?: string): PtPortSpec =>
  ({ id, name: id, direction: 'output', unit, simulinkIndex, description, ...(dataType ? { dataType } : {}) });
const par = (name: string, label: string, unit: string, def: number, description: string,
  min?: number, minExclusive?: boolean, max?: number): PtParamSpec =>
  ({ name, label, unit, default: def, kind: 'scalar', description, ...(min !== undefined ? { min } : {}), ...(minExclusive ? { minExclusive } : {}), ...(max !== undefined ? { max } : {}) });

const spec: PtBlockSpec = {
  type: 'PT_TURBOCHARGER',
  label: 'Turbocharger',
  category: 'Powertrain / Engine Calibration / Air Path',
  simulinkPath: '',
  source: 'user-spec',
  specRef: 'docs/powertrain/engine-calibration-spec.md#2-blocks',
  symbol: 'turbocharger',
  inputs: [
    inp('mdot_comp', 'kg/s', 1, 'Air mass flow through the compressor.'),
    inp('mdot_exh', 'kg/s', 2, 'Exhaust mass flow arriving at the turbine; zero or negative means no turbine flow.'),
    inp('T_exh', 'K', 3, 'Exhaust gas temperature at the turbine inlet.'),
    inp('VgtPos', '%', 4, 'Turbine actuator position in percent, clamped to 0..100. VGT: vane opening. Wastegate: gate opening.'),
    inp('P_amb', 'Pa', 5, 'Ambient pressure at the compressor inlet and the turbine outlet.'),
    inp('T_amb', 'K', 6, 'Ambient temperature at the compressor inlet.'),
  ],
  outputs: [
    out('Info', 'bus', 1, 'Bus with PR, P_c, P_t, A_eff, TurbineFlw and omega.', 'Bus: TurbochargerInfo'),
    out('P_boost', 'Pa', 2, 'Compressor outlet pressure, PR times P_amb.'),
    out('T_comp', 'K', 3, 'Compressor outlet temperature.'),
    out('N_tc', 'rpm', 4, 'Turbocharger shaft speed.'),
    out('P_back', 'Pa', 5, 'Exhaust back pressure upstream of the turbine.'),
  ],
  params: [
    par('J_tc', 'Shaft inertia', 'kg*m^2', 2e-5, 'Polar inertia of the compressor wheel, shaft and turbine wheel.', 0, true),
    par('eta_m', 'Mechanical efficiency', '1', 0.95, 'Fraction of turbine power delivered to the shaft (bearing losses).', 0, true, 1),
    par('r_c', 'Compressor tip radius', 'm', 0.025, 'Compressor wheel tip radius; sets the tip speed U = omega*r_c.', 0, true),
    par('sigma', 'Slip factor', '1', 0.9, 'Compressor slip factor scaling the tip-speed work input.', 0, true),
    par('eta_c', 'Compressor isentropic efficiency', '1', 0.72, 'Isentropic efficiency of the compressor, assumed constant.', 0, true, 1),
    par('eta_t', 'Turbine isentropic efficiency', '1', 0.7, 'Isentropic efficiency of the turbine, assumed constant.', 0, true, 1),
    par('A_t_min', 'Turbine minimum flow area', 'm^2', 2e-4, 'Effective turbine flow area with the VGT closed, or the fixed area in wastegate mode.', 0, true),
    par('A_t_max', 'Turbine maximum flow area', 'm^2', 8e-4, 'Effective turbine flow area with the VGT fully open (VGT mode); must be at least A_t_min.', 0, true),
    par('A_wg_max', 'Wastegate maximum area', 'm^2', 4e-4, 'Wastegate flow area at 100 % position (wastegate mode).', 0),
    par('Cd_t', 'Turbine discharge coefficient', '1', 1, 'Discharge coefficient of the turbine orifice.', 0, true, 1),
    par('gamma_c', 'Compressor gas heat capacity ratio', '1', 1.4, 'Heat capacity ratio of the intake air.', 1, true),
    par('cp_c', 'Compressor gas specific heat', 'J/(kg*K)', 1005, 'Specific heat at constant pressure of the intake air.', 0, true),
    par('gamma_t', 'Turbine gas heat capacity ratio', '1', 1.33, 'Heat capacity ratio of the exhaust gas.', 1, true),
    par('cp_t', 'Turbine gas specific heat', 'J/(kg*K)', 1150, 'Specific heat at constant pressure of the exhaust gas.', 0, true),
    par('R', 'Exhaust gas constant', 'J/(kg*K)', 287, 'Specific gas constant of the exhaust gas in the turbine orifice equation.', 0, true),
    par('N_tc0', 'Initial shaft speed', 'rpm', 60000, 'Turbocharger shaft speed at the start of the simulation.', 0),
    { name: 'mode', label: 'Turbine control', unit: '', default: 'VGT', kind: 'enum', options: ['VGT', 'Wastegate'],
      description: 'VGT varies the turbine area between A_t_min and A_t_max with all exhaust through the turbine. Wastegate adds a bypass area A_wg_max*VgtPos/100 that diverts exhaust around the turbine.' },
  ],
  states: ['omega'],
  equations: [
    'U = omega*r_c; PR = (1 + eta_c*sigma*U^2/(cp_c*T_amb))^(gamma_c/(gamma_c-1)); P_boost = PR*P_amb',
    'T_comp = T_amb*(1 + (PR^((gamma_c-1)/gamma_c) - 1)/eta_c); P_c = mdot_comp*cp_c*(T_comp - T_amb)',
    'VGT: A_eff = A_t_min + VgtPos/100*(A_t_max - A_t_min), mdot_t = mdot_exh',
    'Wastegate: A_eff = A_t_min + VgtPos/100*A_wg_max, mdot_t = mdot_exh*A_t_min/A_eff',
    'mdot_exh = Cd_t*A_eff*P_back/sqrt(R*T_exh)*Psi_t(P_amb/P_back, gamma_t), P_back >= P_amb (bisection)',
    'P_t = mdot_t*cp_t*T_exh*eta_t*(1 - (P_amb/P_back)^((gamma_t-1)/gamma_t))',
    'J*d(omega)/dt = (eta_m*P_t - P_c)/max(omega, 100)',
  ],
  references: [
    'Watson & Janota, Turbocharging the Internal Combustion Engine, Macmillan 1982',
    'Guzzella & Onder, Introduction to Modeling and Control of Internal Combustion Engine Systems, 2nd ed., Springer 2010, ch. 2',
    'Parametric model (constant efficiencies, orifice turbine); to be replaced by user compressor and turbine maps',
  ],
  description: 'Parametric turbocharger made of a compressor, a turbine and a shaft. The compressor pressure ratio follows from the shaft tip speed, the turbine back pressure follows from the exhaust flow through an orifice, and the shaft speed integrates the power balance. It is a parametric stand-in to be replaced by user compressor and turbine maps.',
  behavior: 'The shaft speed omega is the only state. Compressor outputs are computed from the current speed. The back pressure is found by bisection on the orifice equation between P_amb and 100*P_amb; zero or negative exhaust flow gives P_back = P_amb and no turbine power. VgtPos is clamped to 0..100. If the exhaust flow cannot pass the turbine below 100*P_amb the block reports an error. Shaft acceleration is the power surplus divided by J*max(omega, 100).',
  example: 'With the default parameters, mdot_comp 0.08 kg/s, mdot_exh 0.085 kg/s, T_exh 900 K, VgtPos 40 %, P_amb 101325 Pa and T_amb 298.15 K, a shaft at 60000 rpm gives PR = 1.1996, P_boost = 121544 Pa, T_comp = 320.25 K, P_back = 151732 Pa, P_c = 1776.5 W and P_t = 5870.7 W. Held at these inputs from 40000 rpm the shaft settles after 3 s near 106310 rpm with P_boost = 174236 Pa, where 0.95*P_t = P_c within 0.1 %.',
};

const num = (v: XValue | undefined): number => (typeof v === 'number' ? v : Array.isArray(v) ? Number(v[0]) : NaN);

const psi = orificePsi;

interface Res { PR: number; Pboost: number; Tcomp: number; Pc: number; Pt: number; Aeff: number; mt: number; Pback: number }

function evaluate(ins: XValue[], p: Record<string, any>, omega: number): Res | string {
  const mc = num(ins[0]), me = num(ins[1]), Te = num(ins[2]), pos0 = num(ins[3]), Pa = num(ins[4]), Ta = num(ins[5]);
  if (![mc, me, Te, pos0, Pa, Ta, omega].every(Number.isFinite)) return 'Turbocharger inputs must be finite';
  if (Pa <= 0) return 'P_amb must be > 0 Pa';
  if (Ta <= 0) return 'T_amb must be > 0 K';
  if (mc < 0) return 'mdot_comp must be >= 0';
  if (p.A_t_max < p.A_t_min) return 'A_t_max must be >= A_t_min';
  const pos = Math.min(100, Math.max(0, pos0));
  const U = omega * p.r_c;
  const kc = (p.gamma_c - 1) / p.gamma_c;
  const PR = Math.pow(1 + p.eta_c * p.sigma * U * U / (p.cp_c * Ta), 1 / kc);
  const Tcomp = Ta * (1 + (Math.pow(PR, kc) - 1) / p.eta_c);
  const Pc = mc * p.cp_c * (Tcomp - Ta);
  const wg = p.mode === 'Wastegate';
  const Aeff = wg ? p.A_t_min + pos / 100 * p.A_wg_max : p.A_t_min + pos / 100 * (p.A_t_max - p.A_t_min);
  const mt = wg ? me * p.A_t_min / Aeff : me;
  let Pback = Pa, Pt = 0;
  if (me > 0) {
    if (Te <= 0) return 'T_exh must be > 0 K';
    const k = p.Cd_t * Aeff / Math.sqrt(p.R * Te);
    const f = (pb: number) => k * pb * psi(Pa / pb, p.gamma_t) - me;
    let lo = Pa, hi = Pa * 100;
    if (f(hi) < 0) return 'Exhaust flow exceeds turbine capacity below 100*P_amb';
    for (let i = 0; i < 300 && hi - lo > 1e-13 * hi; i++) {
      const mid = 0.5 * (lo + hi);
      if (f(mid) < 0) lo = mid; else hi = mid;
    }
    Pback = 0.5 * (lo + hi);
    Pt = mt * p.cp_t * Te * p.eta_t * (1 - Math.pow(Pa / Pback, (p.gamma_t - 1) / p.gamma_t));
  }
  return { PR, Pboost: PR * Pa, Tcomp, Pc, Pt, Aeff, mt, Pback };
}

const factory = definePtBlock(spec, {
  init: p => ({ omega: rpm2radps(p.N_tc0) }),
  derivatives: (ins, p, state) => {
    const r = evaluate(ins, p, state.omega);
    return typeof r === 'string' ? { omega: 0 } : { omega: (p.eta_m * r.Pt - r.Pc) / (p.J_tc * Math.max(state.omega, 100)) };
  },
  execute: (ins, p, state) => {
    const r = evaluate(ins, p, state.omega);
    if (typeof r === 'string') return { outputs: [{}, 0, 0, 0, 0], error: r };
    const info = makeBus(['PR', 'P_c', 'P_t', 'A_eff', 'TurbineFlw', 'omega'], [r.PR, r.Pc, r.Pt, r.Aeff, r.mt, state.omega]);
    return { outputs: [info, r.Pboost, r.Tcomp, radps2rpm(state.omega), r.Pback] };
  },
});

export const TURBOCHARGER_BLOCKS: { spec: PtBlockSpec; factory: typeof factory }[] = [{ spec, factory }];
