// Learning lab: OM 501 LA V6 (MR-PLD style unit-pump diesel) engine calibration (X-Bridges), Powertrain Blockset blocks only.
// Engine (public data + assumptions, not OEM calibration): 6 cylinders, B 130 mm, S 150 mm (11.95 L), L 260 mm, CR 17.25,
// wastegate turbocharger, ideal intercooler, no EGR. Fuel quantity Q [mg/stroke] is commanded directly (qMap -> cylinder m_f).
// Bench A: injector flow bench (PW sweep -> injector m_f) gives the Injection Duration map; bench B: engine dyno DoE
// (speed x load x SOI x wastegate) gives Base SOI, Smoke Limiter and Full-Load maps and the Mapped Engine tables.
// Registered in XBRIDGES_LEARNING_LABS (XbridgesWorkspace.tsx).

export interface Om501LabNode { id: string; type: string; position: { x: number; y: number }; label: string; params: Record<string, any> }
export interface Om501LabEdge { id: string; source: string; sourceHandle: string; target: string; targetHandle: string }
export interface Om501MrPldLab {
  id: string; name: string; category: string; difficulty: string; description: string;
  solverType: 'euler'; fixedStep: number; nodes: Om501LabNode[]; edges: Om501LabEdge[];
}
export interface Om501LabObjective { id: string; label: string; check: (wState: any) => boolean }
export interface Om501LabStep { title: string; instructions: string; targetNodeId?: string; objectives: Om501LabObjective[] }

const BP_N = [800, 1200, 1800];
const BP_LOAD = [25, 50, 75, 100];
const Q_FULL = 185;
const Q_BP = BP_LOAD.map(l => (l / 100) * Q_FULL);
const grid = (v: number) => BP_N.map(() => BP_LOAD.map(() => v));
const mapParams = (Z: number[][]) => ({ X_bp: [...BP_N], Y_bp: [...BP_LOAD], Z });

const n = (id: string, type: string, x: number, y: number, label: string, params: Record<string, any> = {}): Om501LabNode =>
  ({ id, type, position: { x, y }, label, params });

const nodes: Om501LabNode[] = [
  // injector flow bench (top left)
  n('benchDoe', 'PT_DOE_SWEEPER', 50, 40, 'Injector Bench DoE (PW sweep)', {
    designType: 'Full Factorial', factors: 'PW', bounds: [[0.2, 4]], levels: 9, dwell: 0.1, averageWindow: 0.04,
    operatingPoints: 'Grid', opSpeeds: [...BP_N], opLoads: [100],
  }),
  n('benchEcu', 'PT_CALIBRATION_ECU', 450, 40, 'Bench ECU', { mode: 'DoE override', factorOrder: 'PW' }),
  n('pumpPressureMap', 'PT_CALIBRATION_MAP_2D', 50, 320, 'Unit-Pump Injection Pressure Map (MPa)',
    { X_bp: [...BP_N], Y_bp: [0, 100], Z: [[80, 80], [120, 120], [160, 160]] }),
  n('pCylMap', 'PT_CALIBRATION_MAP_2D', 450, 320, 'Cylinder Pressure at Injection Map (Pa)',
    { X_bp: [...BP_N], Y_bp: [0, 100], Z: [[6e6, 6e6], [6e6, 6e6], [6e6, 6e6]] }),
  n('injector', 'PT_FUEL_INJECTOR', 850, 160, 'Unit Injector (8 x 0.2 mm)', { n_holes: 8, d_noz: 0.2e-3, Cd: 0.7, N_cyl: 6 }),
  // air path (top)
  n('ambient', 'PT_AMBIENT', 1300, 40, 'Ambient'),
  n('turbo', 'PT_TURBOCHARGER', 1700, 40, 'Wastegate Turbocharger', { mode: 'Wastegate', r_c: 0.06, A_t_min: 7e-4, A_t_max: 4e-3, A_wg_max: 1.5e-3, J_tc: 2e-4 }),
  n('chargePipe', 'PT_THROTTLE_BODY', 2100, 40, 'Charge Pipe + Intercooler Restriction', { D_th: 0.07 }),
  n('manifold', 'PT_INTAKE_MANIFOLD', 2500, 40, 'Intake Manifold', { V_m: 4e-2, eta_v: 0.92, Vd_tot: 11.95e-3, P_o: 1.8e5 }),
  // engine (middle)
  n('ecu', 'PT_CALIBRATION_ECU', 880, 640, 'Calibration ECU', { mode: 'DoE override', factorOrder: 'SOI,VgtPos' }),
  n('cylinder', 'PT_CI_CYLINDER', 1300, 560, 'OM 501 LA Cylinders (11.95 L)', { B: 0.13, S: 0.15, L: 0.26, Ncyl: 6, CR: 17.25, dTheta: 2 }),
  n('dyno', 'PT_ENGINE_DYNO', 1750, 560, 'Engine Dynamometer', { mode: 'Speed', Kp: 3, Ki: 30, J_eng: 2.5, J_dyno: 3, N_o: 800 }),
  n('qMap', 'PT_CALIBRATION_MAP_2D', 50, 560, 'Fuel Quantity Command Map (mg/stroke)', mapParams(BP_N.map(() => [...Q_BP]))),
  n('throttleMap', 'PT_CALIBRATION_MAP_2D', 50, 800, 'Charge Pipe Plate Map (deg, fully open)', mapParams(grid(85))),
  n('burnMap', 'PT_CALIBRATION_MAP_2D', 50, 1040, 'Burn Duration Map (deg)', mapParams(grid(60))),
  n('ignDelayMap', 'PT_CALIBRATION_MAP_2D', 50, 1280, 'Ignition Delay Map (deg)', mapParams(grid(6))),
  // engine DoE (bottom)
  n('doe', 'PT_DOE_SWEEPER', 880, 1000, 'Engine DoE (Speed x Load x SOI x Wastegate)', {
    designType: 'Full Factorial', factors: 'SOI,VgtPos', bounds: [[4, 22], [0, 60]], levels: 3, dwell: 2, averageWindow: 2 / 3,
    operatingPoints: 'Grid', opSpeeds: [...BP_N], opLoads: [...BP_LOAD], Pmax_limit: 190e5, Texh_limit: 1000, Lambda_min: 1.3, NOx_max: 30, objective: 'BSFC',
  }),
  // generated map targets (right column, inputs open)
  n('map1Soi', 'PT_CALIBRATION_MAP_2D', 3000, 40, '1. Base SOI Map (deg BTDC)'),
  n('map3Duration', 'PT_CALIBRATION_MAP_2D', 3000, 280, '3. Injection Duration Map (ms)'),
  n('map6Smoke', 'PT_CALIBRATION_MAP_2D', 3000, 520, '6. Smoke Limiter Map (mg/stroke)'),
  n('map7FuelLimit', 'PT_CALIBRATION_MAP_2D', 3000, 760, '7. Full-Load Fuel Limit (mg/stroke)'),
  n('map7Torque', 'PT_CALIBRATION_MAP_2D', 3000, 1000, '7. Full-Load Torque Curve (N*m)'),
  n('engineMap', 'PT_MAPPED_CI_ENGINE', 3000, 1240, 'Mapped Diesel Engine (export target)'),
];

let k = 0;
const e = (source: string, sourceHandle: string, target: string, targetHandle: string): Om501LabEdge =>
  ({ id: `om501e${++k}`, source, sourceHandle, target, targetHandle });

const ENGINE_MAPS = ['qMap', 'throttleMap', 'burnMap', 'ignDelayMap'];

const edges: Om501LabEdge[] = [
  // engine bench
  e('ambient', 'P_amb', 'turbo', 'P_amb'),
  e('ambient', 'T_amb', 'turbo', 'T_amb'),
  e('turbo', 'P_boost', 'chargePipe', 'P_amb'),
  e('turbo', 'T_comp', 'chargePipe', 'T_amb'),
  e('throttleMap', 'Z_out', 'chargePipe', 'alpha'),
  e('manifold', 'P_map', 'chargePipe', 'P_map'),
  e('chargePipe', 'mdot_th', 'manifold', 'mdot_in'),
  e('dyno', 'N_actual', 'manifold', 'N'),
  e('ambient', 'T_amb', 'manifold', 'T_in'),
  e('ambient', 'T_amb', 'manifold', 'T_egr'),
  e('manifold', 'mdot_cyl', 'turbo', 'mdot_comp'),
  e('manifold', 'mdot_cyl', 'turbo', 'mdot_exh'),
  e('cylinder', 'T_exh', 'turbo', 'T_exh'),
  e('ecu', 'VgtPos', 'turbo', 'VgtPos'),
  e('turbo', 'P_back', 'cylinder', 'P_exh'),
  e('doe', 'NextPoint', 'ecu', 'DoE'),
  e('dyno', 'N_actual', 'ecu', 'N'),
  e('doe', 'Load', 'ecu', 'Load'),
  e('ecu', 'SOI', 'cylinder', 'SOI'),
  e('qMap', 'Z_out', 'cylinder', 'm_f'),
  ...ENGINE_MAPS.flatMap(m => [e('dyno', 'N_actual', m, 'X_in'), e('doe', 'Load', m, 'Y_in')]),
  e('dyno', 'N_actual', 'cylinder', 'N'),
  e('burnMap', 'Z_out', 'cylinder', 'dTheta_comb'),
  e('ignDelayMap', 'Z_out', 'cylinder', 'dTheta_id'),
  e('manifold', 'P_map', 'cylinder', 'P_map'),
  e('manifold', 'T_map', 'cylinder', 'T_map'),
  e('cylinder', 'T_brake', 'dyno', 'T_brake'),
  e('doe', 'N_set', 'dyno', 'N_set'),
  e('cylinder', 'Info', 'doe', 'Responses'),
  // injector flow bench
  e('benchDoe', 'NextPoint', 'benchEcu', 'DoE'),
  e('benchDoe', 'N_set', 'benchEcu', 'N'),
  e('benchDoe', 'Load', 'benchEcu', 'Load'),
  e('benchEcu', 'PW', 'injector', 'ET'),
  e('pumpPressureMap', 'Z_out', 'injector', 'P_rail'),
  e('pCylMap', 'Z_out', 'injector', 'P_cyl'),
  ...['pumpPressureMap', 'pCylMap'].flatMap(m => [e('benchDoe', 'N_set', m, 'X_in'), e('benchDoe', 'Load', m, 'Y_in')]),
  e('benchDoe', 'N_set', 'injector', 'N'),
  e('injector', 'Info', 'benchDoe', 'Responses'),
];

export const OM501_MRPLD_LAB: Om501MrPldLab = {
  id: 'om501_mrpld_calibration',
  name: 'OM 501 LA V6 (MR-PLD) Engine Calibration Lab',
  category: 'Powertrain & Engine Calibration',
  difficulty: 'Expert',
  description: 'Calibrate the maps of a heavy-duty unit-pump diesel (OM 501 LA, 11.95 L, MR-PLD style) on two virtual benches: an injector flow bench that inverts the fuel mass to the injection duration map, and an engine dyno DoE (speed x fuel quantity x SOI x wastegate) with peak-pressure, exhaust-temperature, smoke (lambda) and NOx limits. Generate the Base SOI, Injection Duration, Smoke Limiter and Full-Load maps and the Mapped Engine tables. All numbers are model-generated from public data and assumptions, not OEM calibration.',
  solverType: 'euler',
  fixedStep: 0.02,
  nodes,
  edges,
};

// Checks never throw: every access is guarded and any failure returns false.
const safe = (f: (w: any) => boolean) => (w: any): boolean => { try { return f(w) === true; } catch { return false; } };
const find = (w: any, id: string): any => (Array.isArray(w?.nodes) ? w.nodes.find((x: any) => x?.id === id) : undefined);
const sameVec = (a: any, b: number[]) => Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i]);
const rowsOf = (w: any, id: string): number => {
  const rows = find(w, id)?.data?.state?.rows;
  return Array.isArray(rows) ? rows.length : 0;
};
const param = (w: any, id: string, name: string): any => find(w, id)?.data?.params?.[name];

export const OM501_MRPLD_LAB_STEPS: Om501LabStep[] = [
  {
    title: '1. Explore the MR-PLD calibration plan',
    targetNodeId: 'cylinder',
    instructions: 'This lab calibrates an OM 501 LA V6 heavy-duty diesel (6 cylinders, bore 130 mm, stroke 150 mm, 11.95 L, compression ratio 17.25) with an MR-PLD style unit-pump injection system. Two test benches are modelled.\n\nBench A (top left) is the injector flow bench: a DoE Sweeper steps the pulse width PW from 0.2 to 4 ms at 800, 1200 and 1800 rpm through a bench ECU into the unit injector (8 holes of 0.2 mm). The injection pressure comes from a unit-pump pressure map (80, 120 and 160 MPa), and the injector reports the injected fuel mass m_f.\n\nBench B (centre) is the engine dyno: the fuel quantity Q [mg/stroke] is commanded directly by a map (25, 50, 75 and 100 % of 185 mg), and a second DoE Sweeper runs a full factorial in start of injection (SOI) and wastegate position at 12 speed/load points, limited by peak pressure 190 bar, exhaust temperature 1000 K, a smoke limit of lambda 1.3 and an engine-out NOx limit of 30 g/kWh (on the uncalibrated NOx scale of this model). The NOx limit is what shapes the Base SOI map: advanced injection saves fuel but raises NOx, so the optimum retards SOI where NOx is high, as in a real emissions calibration.\n\nMR-PLD signal flow: driver demand -> fuel quantity Q -> SOI map and injection duration map (energizing time that delivers Q at the pump pressure). This lab generates these maps: 1 Base SOI, 3 Injection Duration, 6 Smoke Limiter, 7 Full-Load limit and torque curve, plus the Mapped Engine tables.\n\nIt cannot generate these maps: 2 Cold Start SOI advance and 4 fuel density/viscosity compensation (ADIA has no coolant or fuel temperature physics); 5 BIP window and cylinder balancing (no solenoid electrics); 8 derate, 9 idle governor, 10 fan PWM and 11 engine brake (protection and strategy tables, no blocks); 12-16 Sensor linearization (no sensor blocks).\n\nAll numbers are model-generated from public OM 501 LA data plus assumptions, not OEM calibration. The exhaust temperature sets the turbine back pressure, which acts on the cylinder in the same time step: a real algebraic loop that the engine solves every step, so the Diagnostics badge shows one expected ALGEBRAIC_LOOP warning.\n\nSelect the CI Cylinder block to see its parameters.',
    objectives: [
      { id: 'select_cylinder', label: 'Select the CI Cylinder block', check: safe(w => w?.selectedNodeId === 'cylinder') },
    ],
  },
  {
    title: '2. Run the test benches',
    targetNodeId: 'benchDoe',
    instructions: 'Click Run. Both benches run at the same time. The injector bench needs 27 points (9 pulse widths x 3 speeds) x 0.1 s and finishes first; the engine sweep needs 108 points (12 speed/load points x 9 SOI/wastegate combinations) x 2 s = 216 s of simulated time. Wait until the injector bench has collected 27 rows.',
    objectives: [
      { id: 'run', label: 'Start the simulation', check: safe(w => w?.isSimulating === true) },
      { id: 'bench_done', label: 'Wait until the injector bench has 27 result rows', check: safe(w => rowsOf(w, 'benchDoe') === 27) },
    ],
  },
  {
    title: '3. Generate map 3 (Injection Duration)',
    targetNodeId: 'map3Duration',
    instructions: 'Select the injector bench DoE Sweeper (benchDoe). In the Calibration map section choose "3. Injection Duration (speed x fuel)", set the fuel quantity at 100 % load to 185 mg/stroke, choose the target "3. Injection Duration Map (ms)" and click "Write calibration map". The bench fuel mass m_f(PW) is inverted per speed at 25, 50, 75 and 100 % of 185 mg (46.25, 92.5, 138.75 and 185 mg).',
    objectives: [
      { id: 'map3_x', label: 'Injection Duration map speed breakpoints 800, 1200, 1800 rpm', check: safe(w => sameVec(param(w, 'map3Duration', 'X_bp'), [800, 1200, 1800])) },
      { id: 'map3_y', label: 'Injection Duration map fuel breakpoints 46.25 ... 185 mg', check: safe(w => sameVec(param(w, 'map3Duration', 'Y_bp'), [46.25, 92.5, 138.75, 185])) },
    ],
  },
  {
    title: '4. Wait for the engine sweep',
    targetNodeId: 'doe',
    instructions: 'Keep the simulation running until the engine DoE Sweeper has collected all 108 rows (216 s of simulated time). A row marked x in its results table is infeasible (peak pressure, exhaust temperature, lambda below 1.3 or NOx above 30 g/kWh); a row marked * is the best feasible row (lowest BSFC) of its speed/load point.',
    objectives: [
      { id: 'engine_done', label: 'Wait until the engine sweeper has 108 result rows', check: safe(w => rowsOf(w, 'doe') === 108) },
    ],
  },
  {
    title: '5. Generate maps 1, 6 and 7',
    targetNodeId: 'doe',
    instructions: 'Select the engine DoE Sweeper (doe) and write four maps with the Calibration map section (fuel quantity at 100 % load 185 mg/stroke, smoke lambda limit 1.3): "1. Base SOI (speed x fuel)" into the Base SOI Map; "6. Smoke limiter (speed x boost)" into the Smoke Limiter Map (boost 1 to 3 bar absolute); "7. Full-load fuel limit (speed)" into the Full-Load Fuel Limit; and "7. Full-load torque (speed)" into the Full-Load Torque Curve. The one-dimensional curves of map 7 are stored with two equal columns (Y_bp 0 and 1). Note the model limits: the smoke limiter is the same at every speed because this air path has a constant volumetric efficiency, and the SOI grid has only 3 levels (4, 13, 22 deg); a finer design gives a smoother SOI map at the cost of a longer sweep.',
    objectives: [
      { id: 'map1', label: 'Base SOI map fuel breakpoints 46.25 ... 185 mg', check: safe(w => sameVec(param(w, 'map1Soi', 'Y_bp'), [46.25, 92.5, 138.75, 185])) },
      { id: 'map6', label: 'Smoke Limiter map boost breakpoints 1 ... 3 bar', check: safe(w => sameVec(param(w, 'map6Smoke', 'Y_bp'), [1, 1.5, 2, 2.5, 3])) },
      { id: 'map7_fuel', label: 'Full-Load Fuel Limit curve over 800, 1200, 1800 rpm',
        check: safe(w => sameVec(param(w, 'map7FuelLimit', 'X_bp'), [800, 1200, 1800]) && sameVec(param(w, 'map7FuelLimit', 'Y_bp'), [0, 1])) },
      { id: 'map7_torque', label: 'Full-Load Torque Curve over 800, 1200, 1800 rpm',
        check: safe(w => sameVec(param(w, 'map7Torque', 'X_bp'), [800, 1200, 1800]) && sameVec(param(w, 'map7Torque', 'Y_bp'), [0, 1])) },
    ],
  },
  {
    title: '6. Export the engine map',
    targetNodeId: 'engineMap',
    instructions: 'With the engine DoE Sweeper selected, choose the Mapped Diesel Engine as target engine, set the reference torque to the maximum torque and click "Write maps to Mapped Engine". The optimum of each speed/load point becomes the brake torque, fuel flow and air flow tables of the Mapped CI Engine over 800, 1200 and 1800 rpm, ready for vehicle-level simulation.',
    objectives: [
      { id: 'write_engine', label: 'Write the maps to the Mapped Engine (speed breakpoints 800, 1200, 1800 rpm)',
        check: safe(w => sameVec(param(w, 'engineMap', 'f_tbrake_n_bpt'), [800, 1200, 1800])) },
    ],
  },
];
