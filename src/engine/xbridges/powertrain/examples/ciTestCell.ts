// EC-07 CI engine test cell (2.0 L 4-cylinder common-rail diesel on a dynamometer) swept by the DoE Sweeper.
// Built only from registered X-Bridges block factories. Not imported by powertrain/index.ts or the registry.
//
// Topology:
//   Ambient -> Turbocharger (P_amb, T_amb) ; turbo P_boost/T_comp -> charge pipe (Throttle Body, fully open; its P_amb/T_amb
//   inputs are the compressor outlet) -> Intake Manifold mdot_in ; manifold P_map/T_map -> CI Cylinder and charge pipe P_map
//   manifold mdot_cyl -> turbo mdot_comp ; exhaust flow = mdot_cyl + injector mdot_f_mean -> turbo mdot_exh
//   Memory blocks (one macro step, the shaft/turbo states are slow) break the block-level algebraic loops: turbo P_boost/T_comp
//   -> charge pipe, manifold P_map -> charge pipe, cylinder T_brake -> dyno, cylinder T_exh -> turbo.
//   cylinder T_exh -> Memory (one macro step, breaks the T_exh <-> P_back algebraic loop) -> turbo T_exh ; turbo P_back -> cylinder P_exh ; manifold T_in = constant 320 K intercooler outlet
//   DoE Sweeper NextPoint -> Calibration ECU (DoE override) -> SOI to cylinder, P_rail and PW to injector, VgtPos to turbo
//   injector m_f -> cylinder ; cylinder T_brake -> Dyno (speed mode) ; dyno N_actual -> cylinder, manifold, injector, ECU
//   cylinder T_brake, BSFC, P_max, T_exh, NOx -> Bus Creator -> sweeper Responses
import type { XBlock } from '../../types';
import { BLOCK_LIBRARY } from '../../BlockDefinitions';

export const CI_TEST_CELL_IDS = {
  ambient: 'ambient', turbo: 'turbo', chargePipe: 'chargePipe', manifold: 'manifold', ecu: 'ecu',
  injector: 'injector', cylinder: 'cylinder', dyno: 'dyno', sweeper: 'sweeper', responses: 'responses',
} as const;

/** All numeric choices of the test cell (2.0 L, 4 cylinder, 2000 rpm; cylinder geometry keeps the block defaults). */
export const CI_TEST_CELL_DEFAULTS = {
  // Ambient
  P_amb: 101325,      // Pa, ISO standard pressure
  T_amb: 298.15,      // K
  RH: 50,             // %, relative humidity
  // Dyno (speed mode)
  N_set: 2000,        // rpm, speed set point
  T_set: 0,           // N*m, unused in speed mode
  dynoKp: 0.5,        // N*m/rpm
  dynoKi: 5,          // N*m/(rpm*s)
  J_eng: 0.15,        // kg*m^2
  J_dyno: 0.5,        // kg*m^2
  // Cylinder inputs
  dTheta_comb: 50,    // deg, Wiebe burn duration
  dTheta_id: 5,       // deg, ignition delay
  // Injector: 8 holes of 0.14 mm give about 27 mg (100 MPa) to 37 mg (180 MPa) at 0.8 ms
  n_holes: 8,         // -
  d_noz: 0.14e-3,     // m
  Cd_inj: 0.7,        // -
  P_cyl_inj: 6e6,     // Pa, cylinder pressure at injection
  // ECU
  default_PW: 0.8,        // ms
  default_VgtPos: 50,     // %
  Load: 50,               // %, only used by the (inactive) map mode
  // Turbocharger: block defaults except the VGT turbine area, sized for 0.06 kg/s of 800 K exhaust at about 1.8 bar back pressure (boost 1.3-1.7 bar abs)
  A_t_min: 1.25e-4,       // m^2, effective turbine area with the VGT closed
  A_t_max: 5.0e-4,        // m^2, effective turbine area with the VGT fully open
  // Manifold / air path
  T_ic: 320,              // K, intercooler outlet temperature (constant; the compressor outlet would be about 375 K at 1.8 bar)
  alpha_open: 85,         // deg, charge pipe plate angle; clamped to the fully open angle (90 - alpha0 = 85)
  D_pipe: 0.02,           // m, equivalent bore of the charge pipe + intercooler restriction (about 14 kPa drop at 0.06 kg/s)
  T_exh0: 800,            // K, initial value of the exhaust temperature memory (breaks the T_exh <-> P_back algebraic loop)
  P_boost0: 1.2e5,        // Pa, initial value of the boost-pressure memory (turbo at its 60000 rpm start: PR 1.2)
  T_comp0: 320,           // K, initial value of the compressor-outlet temperature memory
  T_brake0: 100,          // N*m, initial value of the brake-torque memory
  mdot_egr: 0,            // kg/s, no EGR
  T_egr: 600,             // K, unused with zero EGR flow
  V_m: 1e-2,              // m^3, manifold plus charge pipe volume (large enough for a stable one-step memory loop)
  eta_v: 0.9,             // -
  Vd_tot: 2.0e-3,         // m^3 (pi*0.084^2/4*0.09*4)
  P_o: 1.5e5,             // Pa, initial manifold pressure
  // Design
  design: {
    designType: 'Full Factorial' as string, factors: 'SOI,P_rail', bounds: [[2, 14], [100, 180]] as number[][],
    levels: 3, dwell: 3, averageWindow: 1,
  },
  limits: { Pmax_limit: 160e5, Texh_limit: 1050 }, // Pa, K
};

type Defaults = typeof CI_TEST_CELL_DEFAULTS;
type Conn = { sourceBlock: string; sourcePort: string; targetBlock: string; targetPort: string };

export function buildCiTestCell(opts: {
  design?: Partial<Defaults['design']>; limits?: Partial<Defaults['limits']>; overrides?: Partial<Defaults>;
} = {}): { blocks: XBlock[]; connections: Conn[] } {
  const d: Defaults = { ...CI_TEST_CELL_DEFAULTS, ...(opts.overrides ?? {}) };
  const design = { ...d.design, ...(opts.design ?? {}) };
  const limits = { ...d.limits, ...(opts.limits ?? {}) };
  const ID = CI_TEST_CELL_IDS;
  const L = BLOCK_LIBRARY as Record<string, (id: string, params?: any) => XBlock>;

  const blocks: XBlock[] = [
    L.PT_AMBIENT(ID.ambient, { P_amb: d.P_amb, T_amb: d.T_amb, RH: d.RH }),
    L.PT_TURBOCHARGER(ID.turbo, { A_t_min: d.A_t_min, A_t_max: d.A_t_max }),
    L.PT_THROTTLE_BODY(ID.chargePipe, { D_th: d.D_pipe }),
    L.Constant('alphaOpen', { value: d.alpha_open }),
    L.PT_INTAKE_MANIFOLD(ID.manifold, { V_m: d.V_m, eta_v: d.eta_v, Vd_tot: d.Vd_tot, P_o: d.P_o }),
    L.Constant('icTemp', { value: d.T_ic }),
    L.Constant('egrFlow', { value: d.mdot_egr }),
    L.Constant('egrTemp', { value: d.T_egr }),
    L.Sum('exhFlow', { signs: '++' }),
    L.MEMORY('texhMem', { initialCondition: d.T_exh0 }),
    L.MEMORY('pmapMem', { initialCondition: d.P_o }),
    L.MEMORY('boostMem', { initialCondition: d.P_boost0 }),
    L.MEMORY('tcompMem', { initialCondition: d.T_comp0 }),
    L.MEMORY('tbrakeMem', { initialCondition: d.T_brake0 }),
    L.PT_CALIBRATION_ECU(ID.ecu, {
      mode: 'DoE override', factorOrder: design.factors, default_PW: d.default_PW, default_VgtPos: d.default_VgtPos,
    }),
    L.Constant('load', { value: d.Load }),
    L.PT_FUEL_INJECTOR(ID.injector, { n_holes: d.n_holes, d_noz: d.d_noz, Cd: d.Cd_inj }),
    L.Constant('pCylInj', { value: d.P_cyl_inj }),
    L.PT_CI_CYLINDER(ID.cylinder, {}),
    L.Constant('dThetaComb', { value: d.dTheta_comb }),
    L.Constant('dThetaId', { value: d.dTheta_id }),
    L.PT_ENGINE_DYNO(ID.dyno, { mode: 'Speed', Kp: d.dynoKp, Ki: d.dynoKi, J_eng: d.J_eng, J_dyno: d.J_dyno, N_o: d.N_set }),
    L.Constant('nSet', { value: d.N_set }),
    L.Constant('tSet', { value: d.T_set }),
    L.BUS_CREATOR(ID.responses, { Inputs: 5, SignalNames: 'T_brake,BSFC,P_max,T_exh,NOx' }),
    L.PT_DOE_SWEEPER(ID.sweeper, {
      designType: design.designType, factors: design.factors, bounds: design.bounds.map(r => [...r]), levels: design.levels,
      dwell: design.dwell, averageWindow: design.averageWindow, Pmax_limit: limits.Pmax_limit, Texh_limit: limits.Texh_limit,
    }),
  ];

  const c = (sourceBlock: string, sourcePort: string, targetBlock: string, targetPort: string): Conn =>
    ({ sourceBlock, sourcePort, targetBlock, targetPort });
  const connections: Conn[] = [
    // ambient -> turbo
    c(ID.ambient, 'P_amb', ID.turbo, 'P_amb'),
    c(ID.ambient, 'T_amb', ID.turbo, 'T_amb'),
    // turbo -> charge pipe (upstream = compressor outlet) -> manifold
    c(ID.turbo, 'P_boost', 'boostMem', 'u'),
    c('boostMem', 'y', ID.chargePipe, 'P_amb'),
    c(ID.turbo, 'T_comp', 'tcompMem', 'u'),
    c('tcompMem', 'y', ID.chargePipe, 'T_amb'),
    c('alphaOpen', 'out', ID.chargePipe, 'alpha'),
    c(ID.manifold, 'P_map', 'pmapMem', 'u'),
    c('pmapMem', 'y', ID.chargePipe, 'P_map'),
    c(ID.chargePipe, 'mdot_th', ID.manifold, 'mdot_in'),
    c(ID.dyno, 'N_actual', ID.manifold, 'N'),
    c('egrFlow', 'out', ID.manifold, 'mdot_egr'),
    c('icTemp', 'out', ID.manifold, 'T_in'),
    c('egrTemp', 'out', ID.manifold, 'T_egr'),
    // exhaust side
    c(ID.manifold, 'mdot_cyl', ID.turbo, 'mdot_comp'),
    c(ID.manifold, 'mdot_cyl', 'exhFlow', 'in1'),
    c(ID.injector, 'mdot_f_mean', 'exhFlow', 'in2'),
    c('exhFlow', 'out', ID.turbo, 'mdot_exh'),
    c(ID.cylinder, 'T_exh', 'texhMem', 'u'),
    c('texhMem', 'y', ID.turbo, 'T_exh'),
    c(ID.turbo, 'P_back', ID.cylinder, 'P_exh'),
    c(ID.ecu, 'VgtPos', ID.turbo, 'VgtPos'),
    // ECU
    c(ID.sweeper, 'NextPoint', ID.ecu, 'DoE'),
    c(ID.dyno, 'N_actual', ID.ecu, 'N'),
    c('load', 'out', ID.ecu, 'Load'),
    c(ID.ecu, 'SOI', ID.cylinder, 'SOI'),
    c(ID.ecu, 'P_rail', ID.injector, 'P_rail'),
    c(ID.ecu, 'PW', ID.injector, 'ET'),
    c('pCylInj', 'out', ID.injector, 'P_cyl'),
    c(ID.dyno, 'N_actual', ID.injector, 'N'),
    c(ID.injector, 'm_f', ID.cylinder, 'm_f'),
    // cylinder
    c(ID.dyno, 'N_actual', ID.cylinder, 'N'),
    c('dThetaComb', 'out', ID.cylinder, 'dTheta_comb'),
    c('dThetaId', 'out', ID.cylinder, 'dTheta_id'),
    c(ID.manifold, 'P_map', ID.cylinder, 'P_map'),
    c(ID.manifold, 'T_map', ID.cylinder, 'T_map'),
    // dyno
    c(ID.cylinder, 'T_brake', 'tbrakeMem', 'u'),
    c('tbrakeMem', 'y', ID.dyno, 'T_brake'),
    c('nSet', 'out', ID.dyno, 'N_set'),
    c('tSet', 'out', ID.dyno, 'T_set'),
    // responses
    c(ID.cylinder, 'T_brake', ID.responses, 'in1'),
    c(ID.cylinder, 'BSFC', ID.responses, 'in2'),
    c(ID.cylinder, 'P_max', ID.responses, 'in3'),
    c(ID.cylinder, 'T_exh', ID.responses, 'in4'),
    c(ID.cylinder, 'NOx', ID.responses, 'in5'),
    c(ID.responses, 'bus', ID.sweeper, 'Responses'),
  ];
  return { blocks, connections };
}
