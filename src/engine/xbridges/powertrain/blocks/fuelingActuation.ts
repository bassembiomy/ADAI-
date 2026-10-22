// Powertrain / Engine Calibration: Fuel Injector, VVT / Valvetrain (user spec, no Simulink counterpart).
import type { XValue } from '../../types';
import { makeBus } from '../../bus/busCore';
import { definePtBlock } from '../ptBlock';
import type { PtBlockSpec, PtParamSpec, PtPortSpec } from '../ptSpec';
import { cylinderVolume, validateGeometry } from '../engineCycle';

const SPEC_REF = 'docs/powertrain/engine-calibration-spec.md#2-blocks';
const CATEGORY = 'Powertrain / Engine Calibration / Fueling and Actuation';
const OVERLAP_STEP_DEG = 0.25;

const inp = (id: string, unit: string, simulinkIndex: number, description: string): PtPortSpec =>
  ({ id, name: id, direction: 'input', unit, simulinkIndex, description });
const out = (id: string, unit: string, simulinkIndex: number, description: string, dataType?: string): PtPortSpec =>
  ({ id, name: id, direction: 'output', unit, simulinkIndex, description, ...(dataType ? { dataType } : {}) });
const par = (name: string, label: string, unit: string, def: number, description: string,
  o: { min?: number; max?: number; minExclusive?: boolean; maxExclusive?: boolean } = {}): PtParamSpec =>
  ({ name, label, unit, default: def, kind: 'scalar', description, ...o });

const num = (v: XValue | undefined): number => (typeof v === 'number' ? v : Array.isArray(v) ? Number(v[0]) : NaN);

// ---------------------------------------------------------------- Fuel Injector
const injectorSpec: PtBlockSpec = {
  type: 'PT_FUEL_INJECTOR',
  label: 'Fuel Injector',
  category: CATEGORY,
  simulinkPath: '',
  source: 'user-spec',
  specRef: SPEC_REF,
  symbol: 'fuel-injector',
  inputs: [
    inp('P_rail', 'MPa', 1, 'Fuel rail pressure upstream of the nozzle holes.'),
    inp('P_cyl', 'Pa', 2, 'Cylinder pressure downstream of the nozzle holes at injection.'),
    inp('ET', 'ms', 3, 'Energizing (injection) time per injection event, must be >= 0.'),
    inp('N', 'rpm', 4, 'Engine speed; sets the injection duration in crank degrees and the mean fuel flow.'),
  ],
  outputs: [
    out('Info', 'bus', 1, 'Bus with DeltaP (Pa, rail minus cylinder), Area (m^2, total hole area), InjDuration_deg (crank degrees), m_f (mg, the m_f output) and ET (ms, the ET input).', 'Bus: FuelInjectorInfo'),
    out('m_f', 'mg', 2, 'Fuel mass injected per event and cylinder.'),
    out('mdot_f', 'kg/s', 3, 'Instantaneous fuel mass flow while the injector is open.'),
    out('mdot_f_mean', 'kg/s', 4, 'Mean fuel mass flow of the whole engine, N_cyl events per two crank revolutions.'),
  ],
  params: [
    par('n_holes', 'Number of nozzle holes', '1', 7, 'Number of identical spray holes of the injector nozzle.', { min: 1 }),
    par('d_noz', 'Nozzle hole diameter', 'm', 0.12e-3, 'Diameter of one spray hole.', { min: 0, minExclusive: true }),
    par('Cd', 'Discharge coefficient', '1', 0.7, 'Discharge coefficient of the nozzle holes, 0 (excluded) to 1.', { min: 0, max: 1, minExclusive: true }),
    par('rho_f', 'Fuel density', 'kg/m^3', 830, 'Liquid fuel density at injection conditions.', { min: 0, minExclusive: true }),
    par('N_cyl', 'Number of cylinders', '1', 4, 'Number of cylinders, each injecting once per engine cycle (two revolutions).', { min: 1 }),
  ],
  states: [],
  equations: [
    'A = n_holes*pi*d_noz^2/4',
    'mdot = Cd*A*sqrt(2*rho_f*(P_rail*1e6 - P_cyl)), 0 if P_rail*1e6 <= P_cyl (Bernoulli orifice)',
    'm_f[mg] = mdot*ET[ms]*1e-3*1e6',
    'mdot_mean = mdot*ET[ms]*1e-3*N_cyl*N/120',
    'InjDuration_deg = ET[ms]*1e-3*6*N',
  ],
  references: [
    'Heywood, Internal Combustion Engine Fundamentals, McGraw-Hill 1988, ch. 10 (injector orifice flow)',
  ],
  description: 'Common-rail fuel injector reduced to a set of identical orifices. From rail pressure, cylinder back pressure and the energizing time it gives the injected mass per event and the mean engine fuel flow.',
  behavior: 'The flow follows the incompressible Bernoulli orifice law with a constant discharge coefficient and is zero when the cylinder pressure reaches the rail pressure. Needle opening and closing transients and the injector dead time are not modeled, so the injected mass is proportional to ET. A negative ET, a negative pressure or a negative speed is reported as an error.',
  example: 'With the defaults, P_rail = 160 MPa, P_cyl = 5 MPa, ET = 0.8 ms and N = 2000 rpm the total hole area is 7.917e-8 m^2, the flow is 0.02811 kg/s, one event injects 22.49 mg, the mean engine flow is 1.499e-3 kg/s and the injection lasts 9.6 crank degrees.',
};

const injectorFactory = definePtBlock(injectorSpec, {
  execute: (ins, p) => {
    const Prail = num(ins[0]), Pcyl = num(ins[1]), ET = num(ins[2]), N = num(ins[3]);
    const zero = (error: string) => ({ outputs: [{}, 0, 0, 0] as XValue[], error });
    if (![Prail, Pcyl, ET, N].every(Number.isFinite)) return zero('Fuel injector inputs must be finite');
    if (ET < 0) return zero('ET (energizing time) must be >= 0 ms');
    if (Prail < 0 || Pcyl < 0) return zero('P_rail and P_cyl must be >= 0');
    if (N < 0) return zero('N must be >= 0 rpm');
    const A = (p.n_holes * Math.PI * p.d_noz * p.d_noz) / 4;
    const dP = Prail * 1e6 - Pcyl;
    const mdot = dP > 0 ? p.Cd * A * Math.sqrt(2 * p.rho_f * dP) : 0;
    const mKg = mdot * ET * 1e-3;
    return {
      outputs: [
        makeBus(['DeltaP', 'Area', 'InjDuration_deg', 'm_f', 'ET'], [dP, A, ET * 1e-3 * 6 * N, mKg * 1e6, ET]),
        mKg * 1e6, mdot, (mKg * p.N_cyl * N) / 120,
      ],
    };
  },
});

// ---------------------------------------------------------------- VVT / Valvetrain
const vvtSpec: PtBlockSpec = {
  type: 'PT_VVT_VALVETRAIN',
  label: 'VVT / Valvetrain',
  category: CATEGORY,
  simulinkPath: '',
  source: 'user-spec',
  specRef: SPEC_REF,
  symbol: 'valvetrain',
  inputs: [
    inp('dTheta_int', 'deg', 1, 'Intake cam phasing; positive retards (delays) the intake valve events.'),
    inp('dTheta_exh', 'deg', 2, 'Exhaust cam phasing; positive retards (delays) the exhaust valve events.'),
    inp('N', 'rpm', 3, 'Engine speed, must be > 0; scavenging time scale of the overlap residual term.'),
    inp('P_map', 'Pa', 4, 'Intake manifold absolute pressure, must be > 0.'),
    inp('P_exh', 'Pa', 5, 'Exhaust back pressure, must be > 0.'),
  ],
  outputs: [
    out('Info', 'bus', 1, 'Bus with IVO_eff (deg), EVC_eff (deg), OF (overlap factor, m^2*deg) and OverlapDeg (deg).', 'Bus: ValvetrainInfo'),
    out('IVC_eff', 'deg', 2, 'Effective intake valve closing angle, IVC_base + dTheta_int (0 = firing TDC).'),
    out('EVO_eff', 'deg', 3, 'Effective exhaust valve opening angle, EVO_base + dTheta_exh (0 = firing TDC).'),
    out('RGF', '%', 4, 'Residual gas fraction, clamped to 0 .. 100 %.'),
    out('eta_v', '1', 5, 'Volumetric efficiency.'),
  ],
  params: [
    par('B', 'Bore', 'm', 0.084, 'Cylinder bore for the slider-crank volume.', { min: 0, minExclusive: true }),
    par('S', 'Stroke', 'm', 0.09, 'Piston stroke for the slider-crank volume.', { min: 0, minExclusive: true }),
    par('L', 'Connecting rod length', 'm', 0.145, 'Connecting rod length; must exceed half the stroke.', { min: 0, minExclusive: true }),
    par('CR', 'Compression ratio', '1', 16.5, 'Geometric compression ratio, must be > 1; also the inverse of the ideal residual fraction.', { min: 1, minExclusive: true }),
    par('L_max', 'Maximum valve lift', 'mm', 9, 'Peak lift of both valves.', { min: 0, minExclusive: true }),
    par('D_int', 'Intake valve diameter', 'm', 0.03, 'Intake valve head diameter used for the curtain area.', { min: 0, minExclusive: true }),
    par('D_exh', 'Exhaust valve diameter', 'm', 0.026, 'Exhaust valve head diameter used for the curtain area.', { min: 0, minExclusive: true }),
    par('IVO_base', 'Intake valve opening, base', 'deg', -370, 'Intake opening angle at zero phasing (0 = firing TDC, intake stroke at negative angles).'),
    par('IVC_base', 'Intake valve closing, base', 'deg', -140, 'Intake closing angle at zero phasing.'),
    par('EVO_base', 'Exhaust valve opening, base', 'deg', 130, 'Exhaust opening angle at zero phasing, measured on the cycle before the intake event.'),
    par('EVC_base', 'Exhaust valve closing, base', 'deg', 370, 'Exhaust closing angle at zero phasing, 10 deg after gas-exchange TDC at 360 deg.'),
    par('eta_v0', 'Reference volumetric efficiency', '1', 0.95, 'Volumetric efficiency of the reference cam timing without residuals.', { min: 0, minExclusive: true }),
    par('gamma', 'Heat capacity ratio', '1', 1.35, 'Ratio of specific heats of the burned gas in the ideal residual term.', { min: 1, minExclusive: true }),
    par('k_ov', 'Overlap scavenging gain', '1', 6e8, 'Tuning constant of the overlap residual term (simplified assumption), to be calibrated against measured residuals. Reference point: with the default valve timing at 2000 rpm, P_map 1e5 Pa and P_exh 1.1e5 Pa the default value adds about 3 % RGF.', { min: 0 }),
  ],
  states: [],
  equations: [
    'lift(theta) = L_max/2*(1 - cos(2*pi*(theta - open)/(close - open))) inside [open, close], else 0 (theta: 0 = firing TDC)',
    'intake event [IVO_base + dTheta_int, IVC_base + dTheta_int] shifted by +720 deg onto the axis of the exhaust event [EVO_base + dTheta_exh, EVC_base + dTheta_exh]',
    'curtain area A = pi*D_v*lift, lift converted mm -> m',
    'OF = integral over the overlap of min(A_int, A_exh) dtheta [m^2*deg], midpoint rule with a step of at most 0.25 deg',
    'RGF[%] = 100*min(1, (1/CR)*(P_exh/P_map)^(1/gamma) + k_ov*OF*sqrt(|P_exh - P_map|)/(N*P_map)) (simplified assumption)',
    'eta_v = eta_v0*V(IVC_eff)/V(-180)*(1 - RGF/100), V from the slider-crank geometry',
  ],
  references: [
    'Heywood, Internal Combustion Engine Fundamentals, McGraw-Hill 1988, ch. 6 and 14 (valve curtain area, residual gas fraction)',
    'Fox, Cheng & Heywood, Model for predicting residual gas fraction in spark-ignition engines, SAE 931025, 1993 (overlap and residuals)',
  ],
  description: 'Variable valve timing model with cam phasing on the intake and exhaust side. It shifts the valve events, computes the valve overlap and returns the residual gas fraction and the volumetric efficiency.',
  behavior: 'Both valves follow a raised-cosine lift profile between their opening and closing angles. The overlap factor integrates the smaller curtain area of the two valves over the overlap window. The residual fraction is the ideal term plus an overlap term; this formula is a simplified assumption, not a validated residual model. Volumetric efficiency scales with the cylinder volume trapped at the effective intake closing relative to bottom dead center and with the fresh charge share. Invalid geometry, events with closing before opening, N <= 0 or non-positive pressures are reported as errors.',
  example: 'With the defaults, no phasing, N = 2000 rpm, P_map = 1.0e5 Pa and P_exh = 1.1e5 Pa the overlap is 20 deg with OF = 9.35e-5 m^2*deg, RGF = 9.31 % (6.50 % ideal term plus 2.81 % from the overlap) and eta_v = 0.793. With dTheta_int = -20 deg and dTheta_exh = +20 deg the overlap widens to 60 deg with OF = 2.45e-3 m^2*deg and the overlap term dominates (RGF = 80.1 %, eta_v = 0.185), which shows that k_ov must be calibrated before wide overlaps are used.',
};

const liftFn = (theta: number, open: number, close: number, lmax: number): number =>
  theta < open || theta > close ? 0 : (lmax / 2) * (1 - Math.cos((2 * Math.PI * (theta - open)) / (close - open)));

const vvtFactory = definePtBlock(vvtSpec, {
  execute: (ins, p) => {
    const dI = num(ins[0]), dE = num(ins[1]), N = num(ins[2]), Pm = num(ins[3]), Pe = num(ins[4]);
    const zero = (error: string) => ({ outputs: [{}, 0, 0, 0, 0] as XValue[], error });
    if (![dI, dE, N, Pm, Pe].every(Number.isFinite)) return zero('VVT inputs must be finite');
    if (!(N > 0)) return zero('N must be > 0 rpm');
    if (!(Pm > 0) || !(Pe > 0)) return zero('P_map and P_exh must be > 0 Pa');
    if (!(p.IVC_base > p.IVO_base)) return zero('IVC_base must be greater than IVO_base');
    if (!(p.EVC_base > p.EVO_base)) return zero('EVC_base must be greater than EVO_base');
    const IVO = p.IVO_base + dI, IVC = p.IVC_base + dI, EVO = p.EVO_base + dE, EVC = p.EVC_base + dE;
    const G = { B: p.B, S: p.S, L: p.L, CR: p.CR, Ncyl: 1, IVC, EVO };
    try { validateGeometry({ ...G, IVC: -1, EVO: 1 }); } catch (e) { return zero(e instanceof Error ? e.message : String(e)); }
    const iOpen = IVO + 720, iClose = IVC + 720;
    const lo = Math.max(iOpen, EVO), hi = Math.min(iClose, EVC);
    let OF = 0, overlap = 0;
    if (hi > lo) {
      overlap = hi - lo;
      const n = Math.ceil(overlap / OVERLAP_STEP_DEG), h = overlap / n;
      for (let k = 0; k < n; k++) {
        const th = lo + (k + 0.5) * h;
        const aI = Math.PI * p.D_int * (liftFn(th, iOpen, iClose, p.L_max) * 1e-3);
        const aE = Math.PI * p.D_exh * (liftFn(th, EVO, EVC, p.L_max) * 1e-3);
        OF += Math.min(aI, aE) * h;
      }
    }
    const rgfRaw = 100 * Math.min(1, (1 / p.CR) * Math.pow(Pe / Pm, 1 / p.gamma) + (p.k_ov * OF * Math.sqrt(Math.abs(Pe - Pm))) / (N * Pm));
    const RGF = Math.min(100, Math.max(0, rgfRaw));
    const etaV = p.eta_v0 * (cylinderVolume(G, IVC) / cylinderVolume(G, -180)) * (1 - RGF / 100);
    return { outputs: [makeBus(['IVO_eff', 'EVC_eff', 'OF', 'OverlapDeg'], [IVO, EVC, OF, overlap]), IVC, EVO, RGF, etaV] };
  },
});

export const FUELING_ACTUATION_BLOCKS: { spec: PtBlockSpec; factory: typeof injectorFactory }[] = [
  { spec: injectorSpec, factory: injectorFactory },
  { spec: vvtSpec, factory: vvtFactory },
];
