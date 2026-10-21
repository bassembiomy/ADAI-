// Learning lab: V8 diesel engine mapping and calibrated control (X-Bridges), built only from Powertrain Blockset blocks.
// Engine: 6.6 L V8 (B 103 mm, S 99 mm, CR 16.8, L 165 mm), VGT turbocharger, ideal intercooler (T_in = ambient), no EGR.
// Test cell: DoE Sweeper (3 x 3 speed/load grid x 3-level full factorial in SOI and P_rail) -> Calibration ECU -> engine.
// Registered in XBRIDGES_LEARNING_LABS (XbridgesWorkspace.tsx).

export interface CiV8LabNode { id: string; type: string; position: { x: number; y: number }; label: string; params: Record<string, any> }
export interface CiV8LabEdge { id: string; source: string; sourceHandle: string; target: string; targetHandle: string }
export interface CiV8MappingLab {
  id: string; name: string; category: string; difficulty: string; description: string;
  solverType: 'euler'; fixedStep: number; nodes: CiV8LabNode[]; edges: CiV8LabEdge[];
}
export interface CiV8LabObjective { id: string; label: string; check: (wState: any) => boolean }
export interface CiV8LabStep { title: string; instructions: string; targetNodeId?: string; objectives: CiV8LabObjective[] }

const BP_N = [1200, 1800, 2400];
const BP_LOAD = [40, 70, 100];
const grid = (v: number) => BP_N.map(() => BP_LOAD.map(() => v));
const mapParams = (Z: number[][]) => ({ X_bp: [...BP_N], Y_bp: [...BP_LOAD], Z });

const n = (id: string, type: string, x: number, y: number, label: string, params: Record<string, any> = {}): CiV8LabNode =>
  ({ id, type, position: { x, y }, label, params });

const nodes: CiV8LabNode[] = [
  // air path (top)
  n('ambient', 'PT_AMBIENT', 40, 40, 'Ambient'),
  n('turbo', 'PT_TURBOCHARGER', 360, 40, 'VGT Turbocharger', { r_c: 0.035, A_t_min: 4e-4, A_t_max: 1.6e-3, J_tc: 6e-5 }),
  n('chargePipe', 'PT_THROTTLE_BODY', 680, 40, 'Charge Pipe + Intercooler Restriction', { D_th: 0.04 }),
  n('manifold', 'PT_INTAKE_MANIFOLD', 1000, 40, 'Intake Manifold', { V_m: 2e-2, eta_v: 0.9, Vd_tot: 6.6e-3, P_o: 1.5e5 }),
  // fuel / ECU (middle)
  n('ecu', 'PT_CALIBRATION_ECU', 680, 360, 'Calibration ECU', { mode: 'DoE override', factorOrder: 'SOI,P_rail', default_VgtPos: 50 }),
  n('injector', 'PT_FUEL_INJECTOR', 1000, 360, 'Common-Rail Injector', { n_holes: 8, d_noz: 0.16e-3, Cd: 0.7, N_cyl: 8 }),
  // cylinder / dyno (right)
  n('cylinder', 'PT_CI_CYLINDER', 1340, 200, 'V8 Diesel Cylinders (6.6 L)', { B: 0.103, S: 0.099, L: 0.165, Ncyl: 8, CR: 16.8, dTheta: 2 }),
  n('dyno', 'PT_ENGINE_DYNO', 1680, 200, 'Engine Dynamometer', { mode: 'Speed', Kp: 1, Ki: 10, J_eng: 0.6, J_dyno: 1.0, N_o: 1200 }),
  // DoE (bottom)
  n('doe', 'PT_DOE_SWEEPER', 400, 720, 'DoE Sweeper (Speed x Load x SOI x P_rail)', {
    designType: 'Full Factorial', factors: 'SOI,P_rail', bounds: [[2, 18], [100, 180]], levels: 3, dwell: 2, averageWindow: 2 / 3,
    operatingPoints: 'Grid', opSpeeds: [...BP_N], opLoads: [...BP_LOAD], Pmax_limit: 135e5, Texh_limit: 950, objective: 'BSFC',
  }),
  // maps (left)
  n('fuelMap', 'PT_CALIBRATION_MAP_2D', 40, 300, 'Fuel Demand Map (ms)', mapParams(BP_N.map(() => [0.7, 1.0, 1.3]))),
  n('throttleMap', 'PT_CALIBRATION_MAP_2D', 40, 510, 'Charge Pipe Plate Map (deg, fully open)', mapParams(grid(85))),
  n('burnMap', 'PT_CALIBRATION_MAP_2D', 40, 720, 'Burn Duration Map (deg)', mapParams(grid(50))),
  n('ignDelayMap', 'PT_CALIBRATION_MAP_2D', 40, 930, 'Ignition Delay Map (deg)', mapParams(grid(5))),
  n('pCylMap', 'PT_CALIBRATION_MAP_2D', 40, 1140, 'Cylinder Pressure at Injection Map (Pa)', mapParams(grid(7e6))),
  // export target
  n('engineMap', 'PT_MAPPED_CI_ENGINE', 1340, 720, 'Mapped Diesel Engine (export target)'),
];

let k = 0;
const e = (source: string, sourceHandle: string, target: string, targetHandle: string): CiV8LabEdge =>
  ({ id: `v8e${++k}`, source, sourceHandle, target, targetHandle });

const MAP_IDS = ['fuelMap', 'throttleMap', 'burnMap', 'ignDelayMap', 'pCylMap'];

const edges: CiV8LabEdge[] = [
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
  e('ecu', 'P_rail', 'injector', 'P_rail'),
  e('fuelMap', 'Z_out', 'injector', 'ET'),
  e('pCylMap', 'Z_out', 'injector', 'P_cyl'),
  e('dyno', 'N_actual', 'injector', 'N'),
  ...MAP_IDS.flatMap(m => [e('dyno', 'N_actual', m, 'X_in'), e('doe', 'Load', m, 'Y_in')]),
  e('injector', 'm_f', 'cylinder', 'm_f'),
  e('dyno', 'N_actual', 'cylinder', 'N'),
  e('burnMap', 'Z_out', 'cylinder', 'dTheta_comb'),
  e('ignDelayMap', 'Z_out', 'cylinder', 'dTheta_id'),
  e('manifold', 'P_map', 'cylinder', 'P_map'),
  e('manifold', 'T_map', 'cylinder', 'T_map'),
  e('cylinder', 'T_brake', 'dyno', 'T_brake'),
  e('doe', 'N_set', 'dyno', 'N_set'),
  e('cylinder', 'Info', 'doe', 'Responses'),
];

export const CI_V8_MAPPING_LAB: CiV8MappingLab = {
  id: 'ci_v8_engine_mapping',
  name: 'V8 Diesel Engine Mapping & Calibrated Control Lab',
  category: 'Powertrain & Engine Calibration',
  difficulty: 'Expert',
  description: 'Map a 6.6 L V8 common-rail diesel on a virtual test cell: a DoE sweeper runs a speed x load grid with a 3-level factorial in start of injection and rail pressure, respecting peak-pressure and exhaust-temperature limits. Write the BSFC optimum to the calibration ECU, rerun with calibrated control, and export the maps to a mapped engine.',
  solverType: 'euler',
  fixedStep: 0.02,
  nodes,
  edges,
};

// Checks never throw: every access is guarded and any failure returns false.
const safe = (f: (w: any) => boolean) => (w: any): boolean => { try { return f(w) === true; } catch { return false; } };
const find = (w: any, id: string): any => (Array.isArray(w?.nodes) ? w.nodes.find((x: any) => x?.id === id) : undefined);
const sameVec = (a: any, b: number[]) => Array.isArray(a) && a.length === b.length && a.every((v, i) => v === b[i]);
const sweeperRows = (w: any): number => {
  const rows = find(w, 'doe')?.data?.state?.rows;
  return Array.isArray(rows) ? rows.length : 0;
};
const ecuMap = (w: any) => find(w, 'ecu')?.data?.params?.mode === 'Map';

export const CI_V8_MAPPING_LAB_STEPS: CiV8LabStep[] = [
  {
    title: '1. Explore the V8 test cell',
    targetNodeId: 'cylinder',
    instructions: 'This is a virtual engine test cell for a 6.6 L V8 common-rail diesel (bore 103 mm, stroke 99 mm, compression ratio 16.8). Air flows from Ambient through the VGT turbocharger, a charge pipe with intercooler restriction and the intake manifold into the cylinders; the exhaust drives the turbine. The five maps on the left supply fuel pulse width, charge pipe angle, burn duration, ignition delay and cylinder pressure at injection as functions of speed x load. The DoE Sweeper at the bottom steps through a 3 x 3 speed/load grid and a 3-level full factorial in start of injection (SOI) and rail pressure, 81 points in all.\n\nThe exhaust temperature sets the turbine back pressure, which acts on the cylinder in the same time step: a real algebraic loop, which the engine solves every step. The Diagnostics badge therefore shows one ALGEBRAIC_LOOP warning; this is expected.\n\nSelect the CI Cylinder block to see its parameters.',
    objectives: [
      { id: 'select_cylinder', label: 'Select the CI Cylinder block', check: safe(w => w?.selectedNodeId === 'cylinder') },
    ],
  },
  {
    title: '2. Run the mapping sweep',
    targetNodeId: 'doe',
    instructions: 'Click Run. The sweeper holds every design point for 2 s, averages the last third of the dwell and stores one result row per point. The full sweep needs 81 points x 2 s = 162 s of simulated time. Wait until the sweeper has collected all 81 rows.',
    objectives: [
      { id: 'run_sweep', label: 'Start the simulation', check: safe(w => w?.isSimulating === true) },
      { id: 'sweep_done', label: 'Wait until the sweeper has 81 result rows', check: safe(w => sweeperRows(w) >= 81) },
    ],
  },
  {
    title: '3. Optimise',
    targetNodeId: 'doe',
    instructions: 'Select the DoE Sweeper and read the results table. A row marked x is infeasible: its peak cylinder pressure exceeded 135 bar or its exhaust temperature exceeded 950 K. A row marked * is the best feasible row (lowest BSFC) of its speed/load point. Note how the limits push the optimum away from the lowest-BSFC corner of the factor grid.\n\nThen click "Write optimum to ECU" with the Calibration ECU as target. The ECU switches to Map mode and receives the SOI and rail pressure maps.',
    objectives: [
      { id: 'select_doe', label: 'Select the DoE Sweeper', check: safe(w => w?.selectedNodeId === 'doe') },
      { id: 'write_ecu', label: 'Write the optimum to the ECU (ECU mode becomes Map)', check: safe(w => ecuMap(w)) },
    ],
  },
  {
    title: '4. Calibrated control',
    targetNodeId: 'ecu',
    instructions: 'Run the simulation again. With the ECU in Map mode it no longer follows the sweeper factors: it schedules the start of injection and rail pressure from engine speed and load. The sweeper still steps through the speed/load grid, so the calibrated engine should reproduce the optimum BSFC at every point and respect both limits.',
    objectives: [
      { id: 'run_map', label: 'Run the simulation with the ECU in Map mode', check: safe(w => w?.isSimulating === true && ecuMap(w)) },
    ],
  },
  {
    title: '5. Engine map',
    targetNodeId: 'engineMap',
    instructions: 'Select the DoE Sweeper, choose the Mapped Diesel Engine as target and click "Write maps to Mapped Engine". The optimum of each speed/load point becomes the brake torque, fuel flow and air flow tables of the Mapped CI Engine over 1200, 1800 and 2400 rpm (the torque axis is the load in percent times the reference torque), ready for vehicle-level simulation.',
    objectives: [
      { id: 'write_engine', label: 'Write the maps to the Mapped Engine (speed breakpoints 1200, 1800, 2400 rpm)',
        check: safe(w => sameVec(find(w, 'engineMap')?.data?.params?.f_tbrake_n_bpt, [1200, 1800, 2400])) },
    ],
  },
  {
    title: '6. Explore',
    targetNodeId: 'doe',
    instructions: 'Change the sweeper objective from BSFC to NOx and rerun the sweep. Compare the optimum rows: lower NOx needs retarded injection, which costs fuel. This is the BSFC/NOx trade-off the calibrator has to balance.',
    objectives: [
      { id: 'objective_nox', label: 'Set the sweeper objective to NOx', check: safe(w => find(w, 'doe')?.data?.params?.objective === 'NOx') },
    ],
  },
];
