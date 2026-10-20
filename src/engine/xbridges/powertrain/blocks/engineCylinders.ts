// Powertrain / Engine Calibration / Engine Plant: CI Cylinder (Wiebe) and SI Cylinder (Wiebe).
// Spec: docs/powertrain/engine-calibration-spec.md section 1 (equations) and section 2 (rows).
import type { XValue } from '../../types';
import { makeBus } from '../../bus/busCore';
import { definePtBlock } from '../ptBlock';
import type { PtBlockSpec, PtParamSpec, PtPortSpec } from '../ptSpec';
import { runEngineCycle, type CycleOptions, type CycleResult, type EngineGeometry } from '../engineCycle';

const SPEC_REF = 'docs/powertrain/engine-calibration-spec.md#2-blocks';
const CATEGORY = 'Powertrain / Engine Calibration / Engine Plant' as const;

const inp = (id: string, unit: string, simulinkIndex: number, description: string): PtPortSpec =>
  ({ id, name: id, direction: 'input', unit, simulinkIndex, description });
const out = (id: string, unit: string, simulinkIndex: number, description: string, dataType?: string): PtPortSpec =>
  ({ id, name: id, direction: 'output', unit, simulinkIndex, description, ...(dataType ? { dataType } : {}) });
const par = (name: string, label: string, unit: string, def: number, description: string,
  min?: number, minExclusive?: boolean, max?: number, maxExclusive?: boolean): PtParamSpec =>
  ({ name, label, unit, default: def, kind: 'scalar', description, ...(min !== undefined ? { min } : {}),
    ...(minExclusive ? { minExclusive } : {}), ...(max !== undefined ? { max } : {}), ...(maxExclusive ? { maxExclusive } : {}) });

interface Defaults { B: number; S: number; CR: number; IVC: number; LHV: number; afr: number }

function commonParams(d: Defaults, afrName: string): PtParamSpec[] {
  return [
    par('B', 'Bore', 'm', d.B, 'Cylinder bore diameter. Sets the piston area, the displaced volume and the Woschni heat transfer area.', 0, true),
    par('S', 'Stroke', 'm', d.S, 'Piston stroke. Sets the displaced volume, the crank radius S/2 and the mean piston speed 2 S N / 60.', 0, true),
    par('L', 'Connecting rod length', 'm', 0.145, 'Connecting rod length. It must be larger than the crank radius S/2; it sets the piston motion asymmetry.', 0, true),
    par('Ncyl', 'Number of cylinders', '1', 4, 'Number of identical cylinders. Scales torque, power and fuel flow of the engine.', 1),
    par('CR', 'Compression ratio', '1', d.CR, 'Geometric compression ratio (Vd + Vc)/Vc. It must be greater than 1.', 1, true),
    par('IVC', 'Intake valve closing', 'deg', d.IVC, 'Crank angle where the closed cycle starts (0 = firing TDC, negative before TDC). Must be smaller than EVO.', -360, false, 0, true),
    par('EVO', 'Exhaust valve opening', 'deg', 130, 'Crank angle where the closed cycle ends and the blowdown starts. Must be larger than IVC.', 0, true, 360),
    par('LHV', 'Lower heating value', 'J/kg', d.LHV, 'Lower heating value of the fuel. Sets the heat released per kilogram of fuel burned.', 0, true),
    par('aw', 'Wiebe efficiency factor a_w', '1', 5, 'Wiebe efficiency factor. The burned fraction at the end of combustion is 1 - exp(-a_w); 5 gives 99.3 %.', 0, true),
    par('mw', 'Wiebe shape factor m_w', '1', 2, 'Wiebe shape exponent. Larger values delay and sharpen the heat release.', 0),
    par('gamma', 'Heat capacity ratio', '1', 1.35, 'Constant ratio of specific heats of the cylinder charge, used in the pressure equation and in the blowdown.', 1, true),
    par('R', 'Gas constant', 'J/(kg*K)', 287, 'Specific gas constant of the cylinder charge, used for the trapped mass and the temperature.', 0, true),
    par('etaComb', 'Combustion efficiency', '1', 1, 'Fraction of the fuel energy released as heat. Q_tot = eta_comb * m_f * LHV.', 0),
    par('etaTrap', 'Trapping efficiency', '1', 1, 'Trapped mass relative to P_map V(IVC)/(R T_map). Scales the mass in the cylinder at IVC.', 0, true),
    { name: 'wallHeat', label: 'Wall heat transfer', unit: '', default: 'Woschni', kind: 'enum', options: ['Woschni', 'Adiabatic'],
      description: 'Wall heat transfer model. Woschni uses the 1967 correlation with the wall temperature; Adiabatic sets the heat loss to zero.' },
    par('Twall', 'Wall temperature', 'K', 450, 'Mean cylinder wall temperature used by the Woschni heat transfer model.', 0, true),
    par('dTheta', 'Crank angle step', 'deg', 0.5, 'Fixed RK4 step in crank angle. Smaller steps give a more accurate pressure trace and cost more computation.', 0, true),
    par('cfA', 'Chen-Flynn constant term A', 'Pa', 0.25e5, 'Constant term of the Chen-Flynn friction mean effective pressure.', 0),
    par('cfB', 'Chen-Flynn peak pressure factor B', '1', 0.005, 'Factor on the peak cylinder pressure in the Chen-Flynn friction.', 0),
    par('cfC', 'Chen-Flynn speed term C', 'Pa*s/m', 0.09e5, 'Coefficient on the mean piston speed in the Chen-Flynn friction.', 0),
    par('cfD', 'Chen-Flynn speed squared term D', 'Pa*s^2/m^2', 0.0009e5, 'Coefficient on the squared mean piston speed in the Chen-Flynn friction.', 0),
    par(afrName, 'Stoichiometric air-fuel ratio', '1', d.afr, 'Stoichiometric air to fuel mass ratio of the fuel. Used for the NOx flame temperature and the equivalence ratio.', 0, true),
    par('T_knee', 'Dissociation knee temperature', 'K', 2400, 'Flame temperature above which dissociation losses start in the NOx model; piecewise-linear approximation of dissociation losses above T_knee.', 0, true),
    par('s_diss', 'Dissociation slope', '1', 0.35, 'Fraction of the flame temperature rise above T_knee that is kept; piecewise-linear approximation of dissociation losses above T_knee. 1 means no dissociation, 0 a hard cap.', 0, false, 1),
    par('k_NOx', 'NOx calibration factor', '1', 1, 'Multiplier on the modelled NOx, to be calibrated against measurements. 1 keeps the uncalibrated model value.', 0),
    par('cpB', 'Burned gas specific heat', 'J/(kg*K)', 1400, 'Specific heat of the burned gas, used for the stoichiometric flame temperature rise in the NOx model.', 0, true),
  ];
}

const REFERENCES = [
  'Heywood, J. B., Internal Combustion Engine Fundamentals, McGraw-Hill, 1988',
  'Wiebe, I. I., Brennverlauf und Kreisprozess von Verbrennungsmotoren, VEB Verlag Technik, 1970',
  'Woschni, G., A universally applicable equation for the instantaneous heat transfer coefficient in the internal combustion engine, SAE 670931, 1967',
  'Chen, S. K. and Flynn, P. F., Development of a single cylinder compression ignition research engine, SAE 650733, 1965',
  'Douaud, A. M. and Eyzat, P., Four-octane-number method for predicting the anti-knock behavior of fuels and engines, SAE 780080, 1978',
  'Livengood, J. C. and Wu, P. C., Correlation of autoignition phenomena in internal combustion engines and rapid compression machines, Proc. Combustion Institute 5, 1955',
];

const COMMON_EQUATIONS = [
  'a = S/2, Vd = pi B^2 S/4, Vc = Vd/(CR - 1), V(th) = Vc + (pi B^2/4) (L + a - a cos(th) - sqrt(L^2 - a^2 sin^2(th)))',
  'm = eta_trap P_map V(IVC)/(R T_map); x_b = 1 - exp(-a_w ((th - th0)/dTheta_comb)^(m_w + 1)), Q_tot = eta_comb m_f LHV',
  'dp/dth = (gamma - 1)/V (dQ/dth - dQw/dth) - gamma p/V dV/dth, T = p V/(m R); RK4 in crank angle from IVC to EVO',
  'Woschni: h = 3.26 B^-0.2 (p/1000)^0.8 T^-0.55 w^0.8, w = 2.28 Sp + 0.00324 Vd T_IVC/(P_IVC V_IVC) (p - p_mot), dQw/dth = h A (T - Twall)/(6 N)',
  'IMEP_gross = int p dV/Vd, PMEP = P_exh - P_map, IMEP = IMEP_gross - PMEP, FMEP = A + B P_max + C Sp + D Sp^2, BMEP = IMEP - FMEP',
  'T_brake = BMEP Vd Ncyl/(4 pi), P_brake = T_brake 2 pi N/60, BSFC = 3.6e9 mdot_f/P_brake, eta_th = (W_gross - PMEP Vd)/(m_f LHV)',
  'T_exh = T_EVO (P_exh/p_EVO)^((gamma - 1)/gamma); NOx: Heywood 1988 thermal-NO rate of burned elements',
  'Knock: tau = 17.68e-3 (ON/100)^3.402 (p/101325)^-1.7 exp(3800/T_u), KnockIndex = int dt/tau (Livengood-Wu)',
];

const num = (v: XValue | undefined): number => (typeof v === 'number' ? v : Array.isArray(v) ? Number(v[0]) : NaN);

function geomOf(p: Record<string, any>): EngineGeometry {
  return { B: p.B, S: p.S, L: p.L, CR: p.CR, Ncyl: p.Ncyl, IVC: p.IVC, EVO: p.EVO };
}

function optsOf(p: Record<string, any>, afr: number): CycleOptions {
  return {
    LHV: p.LHV, aw: p.aw, mw: p.mw, gamma: p.gamma, R: p.R, etaComb: p.etaComb, etaTrap: p.etaTrap,
    wallHeat: p.wallHeat, Twall: p.Twall, dTheta: p.dTheta,
    cf: { A: p.cfA, B: p.cfB, C: p.cfC, D: p.cfD }, afrStoich: afr, cpB: p.cpB, Tknee: p.T_knee, sDiss: p.s_diss, kNOx: p.k_NOx, ON: p.ON ?? 95,
  };
}

const INFO_KEYS = ['BMEP', 'IMEP_gross', 'PMEP', 'P_brake', 'eta_th', 'thetaPmax', 'FuelFlw'];
const infoValues = (r: CycleResult): number[] =>
  [r.bmep, r.imepGross, r.pmep, r.Pbrake, r.etaTh * 100, r.thetaPmax, r.fuelFlw];

const INFO_DESC = 'Bus with BMEP [Pa], IMEP_gross [Pa], PMEP [Pa], P_brake [W], eta_th [%], thetaPmax [deg], FuelFlw [kg/s], ';

// Measured with the default parameters (see the example texts); numbers come from running the blocks.
const ciSpec: PtBlockSpec = {
  type: 'PT_CI_CYLINDER',
  label: 'CI Cylinder (Wiebe)',
  category: CATEGORY,
  simulinkPath: '',
  source: 'user-spec',
  specRef: SPEC_REF,
  symbol: 'cylinder-ci',
  inputs: [
    inp('N', 'rpm', 1, 'Engine speed. Zero or negative speed is a stopped engine and gives zero outputs.'),
    inp('m_f', 'mg', 2, 'Injected fuel mass per cylinder and cycle (mg/stroke).'),
    inp('SOI', 'deg', 3, 'Start of injection in degrees before firing TDC.'),
    inp('dTheta_comb', 'deg', 4, 'Burn duration of the Wiebe heat release.'),
    inp('dTheta_id', 'deg', 5, 'Ignition delay in crank angle; combustion starts at theta0 = -SOI + dTheta_id.'),
    inp('P_map', 'Pa', 6, 'Intake manifold pressure; cylinder pressure at IVC.'),
    inp('T_map', 'K', 7, 'Intake manifold temperature; charge temperature at IVC.'),
    inp('P_exh', 'Pa', 8, 'Exhaust pressure; sets the pumping loss and the blowdown end state.'),
  ],
  outputs: [
    out('Info', 'bus', 1, INFO_DESC + 'and Stalled.', 'Bus: CICylinderInfo'),
    out('T_brake', 'N*m', 2, 'Brake torque of the whole engine.'),
    out('IMEP', 'Pa', 3, 'Net indicated mean effective pressure including pumping.'),
    out('FMEP', 'Pa', 4, 'Chen-Flynn friction mean effective pressure.'),
    out('BSFC', 'g/(kW*h)', 5, 'Brake specific fuel consumption; 0 when the brake power is not positive.'),
    out('T_exh', 'K', 6, 'Exhaust gas temperature after isentropic blowdown to P_exh.'),
    out('P_max', 'Pa', 7, 'Peak cylinder pressure over the closed cycle.'),
    out('NOx', 'g/(kW*h)', 8, 'Brake specific NOx from the thermal-NO indicator model (uncalibrated trend value).'),
  ],
  params: commonParams({ B: 0.084, S: 0.09, CR: 16.5, IVC: -160, LHV: 43e6, afr: 14.5 }, 'afrStoich'),
  states: [],
  equations: COMMON_EQUATIONS,
  references: REFERENCES,
  description: 'Crank-angle single-zone model of a compression ignition engine. One closed cycle from IVC to EVO is integrated per evaluation with a Wiebe heat release, Woschni wall heat and Chen-Flynn friction, and gives torque, BSFC, peak pressure, exhaust temperature and a NOx indicator.',
  behavior: 'Quasi-steady: every evaluation runs one full cycle from the current inputs. Combustion starts at -SOI + dTheta_id and burns the injected fuel over dTheta_comb degrees. Advancing the injection raises peak pressure and NOx. A speed of zero or below returns zeros and sets Info.Stalled. Invalid geometry, such as a rod shorter than the crank radius, is a block error.',
  example: 'With the default 2.0 L diesel (B 0.084 m, S 0.09 m, CR 16.5) at N = 2000 rpm, m_f = 30 mg, SOI = 6 deg, dTheta_comb = 50 deg, dTheta_id = 5 deg, P_map = 1.8 bar, T_map = 320 K and P_exh = 2.0 bar the block gives T_brake = 164.8 N*m, BMEP = 10.38 bar, BSFC = 208.6 g/(kW*h), P_max = 76.5 bar at 0 deg, T_exh = 749 K, eta_th = 44.8 % and NOx = 17.6 g/(kW*h).',
};

const siSpec: PtBlockSpec = {
  type: 'PT_SI_CYLINDER',
  label: 'SI Cylinder (Wiebe)',
  category: CATEGORY,
  simulinkPath: '',
  source: 'user-spec',
  specRef: SPEC_REF,
  symbol: 'cylinder-si',
  inputs: [
    inp('N', 'rpm', 1, 'Engine speed. Zero or negative speed is a stopped engine and gives zero outputs.'),
    inp('SA', 'deg', 2, 'Spark advance in degrees before firing TDC.'),
    inp('mdot_air', 'kg/s', 3, 'Engine air mass flow; used for the fuel in lambda mode and for the equivalence ratio.'),
    inp('mdot_fuel', 'kg/s', 4, 'Engine fuel mass flow; used when fuelInput is mdot_fuel.'),
    inp('lambda', '1', 5, 'Air-fuel equivalence ratio; used when fuelInput is lambda.'),
    inp('P_map', 'Pa', 6, 'Intake manifold pressure; cylinder pressure at IVC.'),
    inp('T_map', 'K', 7, 'Intake manifold temperature; charge temperature at IVC.'),
    inp('P_exh', 'Pa', 8, 'Exhaust pressure; sets the pumping loss and the blowdown end state.'),
  ],
  outputs: [
    out('Info', 'bus', 1, INFO_DESC + 'm_f_mg [mg/stroke] and Stalled.', 'Bus: SICylinderInfo'),
    out('T_brake', 'N*m', 2, 'Brake torque of the whole engine.'),
    out('BSFC', 'g/(kW*h)', 3, 'Brake specific fuel consumption; 0 when the brake power is not positive.'),
    out('eta_th', '%', 4, 'Indicated thermal efficiency.'),
    out('T_exh', 'K', 5, 'Exhaust gas temperature after isentropic blowdown to P_exh.'),
    out('KnockIndex', '1', 6, 'Livengood-Wu knock integral; 1 or more means knock.'),
    out('KnockMargin', '1', 7, 'clamp(1 - KnockIndex, 0, 1).'),
    out('P_max', 'Pa', 8, 'Peak cylinder pressure over the closed cycle.'),
    out('NOx', 'g/(kW*h)', 9, 'Brake specific NOx from the thermal-NO indicator model (uncalibrated trend value).'),
  ],
  params: [
    ...commonParams({ B: 0.086, S: 0.086, CR: 10.5, IVC: -140, LHV: 44e6, afr: 14.7 }, 'AFR_stoich'),
    par('ON', 'Octane number', '1', 95, 'Fuel octane number in the Douaud-Eyzat ignition delay; a lower value shortens the delay and raises the knock index.', 0, true),
    par('dTheta_comb', 'Burn duration', 'deg', 45, 'Duration of the Wiebe heat release in crank angle.', 0, true),
    par('dTheta_id', 'Ignition delay', 'deg', 5, 'Crank angle from spark to the start of the heat release; theta0 = -SA + dTheta_id.'),
    { name: 'fuelInput', label: 'Fuel input', unit: '', default: 'mdot_fuel', kind: 'enum', options: ['mdot_fuel', 'lambda'],
      description: 'Selects the fuel source: the mdot_fuel input, or mdot_air/(AFR_stoich lambda) from the lambda input.' },
  ],
  states: [],
  equations: [...COMMON_EQUATIONS, 'm_f = mdot_fuel 120/(N Ncyl) or mdot_air/(AFR_stoich lambda) 120/(N Ncyl); theta0 = -SA + dTheta_id; KnockMargin = clamp(1 - KnockIndex, 0, 1)'],
  references: REFERENCES,
  description: 'Crank-angle single-zone model of a spark ignition engine. One closed cycle from IVC to EVO is integrated per evaluation with a Wiebe heat release, Woschni wall heat and Chen-Flynn friction, and gives torque, BSFC, efficiency, a knock index and margin, peak pressure and a NOx indicator.',
  behavior: 'Quasi-steady: every evaluation runs one full cycle. The fuel per stroke comes from mdot_fuel or from mdot_air and lambda, selected by fuelInput. Combustion starts at -SA + dTheta_id and lasts dTheta_comb degrees. The knock index integrates the reciprocal ignition delay up to the end of combustion. A speed of zero or below returns zeros and sets Info.Stalled.',
  example: 'With the default 1.9 L gasoline engine (B = S = 0.086 m, CR 10.5) at N = 3000 rpm, SA = 25 deg, mdot_air = 0.03 kg/s, mdot_fuel = mdot_air/14.7, P_map = 0.9 bar, T_map = 310 K and P_exh = 1.05 bar the block burns 20.41 mg per stroke and gives T_brake = 110.5 N*m, BSFC = 211.7 g/(kW*h), eta_th = 46.3 %, P_max = 57.5 bar at 11.5 deg, T_exh = 844 K and KnockIndex = 1.13 (KnockMargin = 0) and NOx = 14.0 g/(kW*h).',
};

function stalled(nOut: number, keys: string[]): XValue[] {
  const o: XValue[] = new Array(nOut).fill(0);
  o[0] = makeBus(keys, keys.map(k => (k === 'Stalled' ? 1 : 0)));
  return o;
}

function finiteIns(ins: XValue[]): number[] | null {
  const v = ins.map(num);
  return v.every(Number.isFinite) ? v : null;
}

const ciFactory = definePtBlock(ciSpec, {
  execute: (ins, p) => {
    const keys = [...INFO_KEYS, 'Stalled'];
    const v = finiteIns(ins);
    if (!v) return { outputs: stalled(8, keys), error: 'CI Cylinder inputs must be finite' };
    const [N, mfMg, SOI, dComb, dId, Pmap, Tmap, Pexh] = v;
    if (N <= 0) return { outputs: stalled(8, keys) };
    if (mfMg < 0) return { outputs: stalled(8, keys), error: 'm_f must be >= 0' };
    const r = runEngineCycle(geomOf(p),
      { N, mf: mfMg * 1e-6, theta0: -SOI + dId, dThetaComb: dComb, Pivc: Pmap, Tivc: Tmap, Pexh }, optsOf(p, p.afrStoich));
    const info = makeBus([...INFO_KEYS, 'Stalled'], [...infoValues(r), 0]);
    return { outputs: [info, r.Tbrake, r.imep, r.fmep, r.bsfc, r.Texh, r.pMax, r.noxGPerKWh] };
  },
});

const siFactory = definePtBlock(siSpec, {
  execute: (ins, p) => {
    const keys = [...INFO_KEYS, 'm_f_mg', 'Stalled'];
    const v = finiteIns(ins);
    if (!v) return { outputs: stalled(9, keys), error: 'SI Cylinder inputs must be finite' };
    const [N, SA, mAir, mFuel, lambda, Pmap, Tmap, Pexh] = v;
    if (N <= 0) return { outputs: stalled(9, keys) };
    const lamMode = p.fuelInput === 'lambda';
    const afr = p.AFR_stoich;
    let mdotF: number;
    let phi: number | undefined;
    if (lamMode) {
      if (!(lambda > 0)) return { outputs: stalled(9, keys), error: 'lambda must be > 0' };
      if (mAir < 0) return { outputs: stalled(9, keys), error: 'mdot_air must be >= 0' };
      mdotF = mAir / (afr * lambda);
      phi = 1 / lambda;
    } else {
      if (mFuel < 0) return { outputs: stalled(9, keys), error: 'mdot_fuel must be >= 0' };
      mdotF = mFuel;
      phi = mAir > 0 ? afr * mFuel / mAir : undefined;
    }
    const mf = mdotF * 120 / (N * p.Ncyl);
    const r = runEngineCycle(geomOf(p),
      { N, mf, theta0: -SA + p.dTheta_id, dThetaComb: p.dTheta_comb, Pivc: Pmap, Tivc: Tmap, Pexh, ...(phi !== undefined ? { phi } : {}) },
      optsOf(p, afr));
    const info = makeBus(keys, [...infoValues(r), mf * 1e6, 0]);
    const km = Math.min(1, Math.max(0, 1 - r.knockIndex));
    return { outputs: [info, r.Tbrake, r.bsfc, r.etaTh * 100, r.Texh, r.knockIndex, km, r.pMax, r.noxGPerKWh] };
  },
});

export const ENGINE_CYLINDER_BLOCKS: { spec: PtBlockSpec; factory: typeof ciFactory }[] = [
  { spec: ciSpec, factory: ciFactory },
  { spec: siSpec, factory: siFactory },
];
