// Powertrain Blockset / Engine Calibration / Test Cell and DoE and Control and Calibration (EC-05).
// User-spec blocks: Engine Dynamometer, Calibration ECU, Calibration Map 2D.
import type { XValue } from '../../types';
import { makeBus } from '../../bus/busCore';
import { definePtBlock } from '../ptBlock';
import { lookupNd, rpm2radps, radps2rpm, validateBreakpoints, validateTable } from '../ptMath';
import type { PtBlockSpec, PtParamSpec, PtPortSpec } from '../ptSpec';

const SPEC_REF = 'docs/powertrain/engine-calibration-spec.md#2-blocks';
const CLIP = { interp: 'linear', extrap: 'clip' } as const;

const inp = (id: string, unit: string, simulinkIndex: number, description: string, feedthrough?: boolean): PtPortSpec =>
  ({ id, name: id, direction: 'input', unit, simulinkIndex, description, ...(feedthrough === false ? { feedthrough } : {}) });
const out = (id: string, unit: string, simulinkIndex: number, description: string, dataType?: string): PtPortSpec =>
  ({ id, name: id, direction: 'output', unit, simulinkIndex, description, ...(dataType ? { dataType } : {}) });
const sc = (name: string, label: string, unit: string, def: number, description: string, min?: number, minExclusive?: boolean): PtParamSpec =>
  ({ name, label, unit, default: def, kind: 'scalar', description, ...(min !== undefined ? { min } : {}), ...(minExclusive ? { minExclusive } : {}) });

const num = (v: XValue | undefined): number => (typeof v === 'number' ? v : Array.isArray(v) ? Number((v as any[]).flat(Infinity)[0]) : NaN);

// ---------------- Engine Dynamometer ----------------
const DYNO_SPEC: PtBlockSpec = {
  type: 'PT_ENGINE_DYNO',
  label: 'Engine Dynamometer',
  category: 'Powertrain / Engine Calibration / Test Cell and DoE',
  simulinkPath: '',
  source: 'user-spec',
  specRef: SPEC_REF,
  symbol: 'dyno',
  inputs: [
    inp('N_set', 'rpm', 1, 'Speed set point used in Speed mode; ignored in Torque mode.'),
    inp('T_brake', 'N*m', 2, 'Engine brake torque driving the shaft (from the engine block); it accelerates the shaft but does not change T_load instantly.', false),
    inp('T_set', 'N*m', 3, 'Absorbing torque set point used in Torque mode; ignored in Speed mode.'),
  ],
  outputs: [
    out('Info', 'bus', 1, 'Bus with SpeedError (rpm), Integrator (rpm*s) and J_total (kg*m^2).', 'Bus: EngineDynoInfo'),
    out('N_actual', 'rpm', 2, 'Shaft speed of the engine and dynamometer.'),
    out('T_load', 'N*m', 3, 'Torque absorbed by the dynamometer; positive absorbs power from the engine.'),
    out('P_dyno', 'kW', 4, 'Power absorbed by the dynamometer, T_load times shaft speed in kW.'),
  ],
  params: [
    { name: 'mode', label: 'Control mode', unit: '', default: 'Speed', kind: 'enum', options: ['Speed', 'Torque'], description: 'Speed: a PI controller sets T_load to hold N_set. Torque: T_load equals T_set and the shaft speed is free.' },
    sc('Kp', 'Proportional gain', 'N*m/rpm', 0.5, 'Speed-mode proportional gain on the speed error in rpm; 0.5 N*m/rpm gives 50 N*m of load for a 100 rpm error.', 0),
    sc('Ki', 'Integral gain', 'N*m/(rpm*s)', 5, 'Speed-mode integral gain on the accumulated speed error; it removes the steady-state error so T_load settles at the engine torque.', 0),
    sc('J_dyno', 'Dynamometer inertia', 'kg*m^2', 0.5, 'Rotational inertia of the dynamometer rotor; adds to the engine inertia. Must be greater than 0.', 0, true),
    sc('J_eng', 'Engine inertia', 'kg*m^2', 0.15, 'Rotational inertia of the engine and coupling shaft. Must be greater than 0.', 0, true),
    sc('N_o', 'Initial speed', 'rpm', 800, 'Shaft speed at the start of the simulation.'),
  ],
  states: ['omega', 'z'],
  equations: [
    'J = J_eng + J_dyno; J*d(omega)/dt = T_brake - T_load; N = omega*60/(2*pi)',
    'Speed mode: T_load = Kp*(N - N_set) + Ki*z, dz/dt = N - N_set',
    'Torque mode: T_load = T_set, dz/dt = 0',
    'P_dyno = T_load*omega/1000 [kW]',
  ],
  references: [
    'Heywood, Internal Combustion Engine Fundamentals, 2nd ed., McGraw-Hill 2018, ch. 2 (engine testing and dynamometers)',
    'docs/powertrain/engine-calibration-spec.md section 2',
  ],
  description: 'Test-cell dynamometer coupled to an engine shaft. In Speed mode a PI controller loads the engine to hold a set speed; in Torque mode it absorbs a fixed torque. The shaft speed is integrated from the torque balance of the engine and dynamometer inertias.',
  behavior: 'In Speed mode T_load = Kp*(N - N_set) + Ki*z with z the integral of the speed error, so the load rises while the shaft runs above the set point and settles at the engine torque T_brake. In Torque mode T_load equals T_set exactly and the shaft accelerates at (T_brake - T_set)/(J_eng + J_dyno). T_brake does not act on T_load instantly, so there is no algebraic loop with the engine. Info reports SpeedError (zero in Torque mode), Integrator and J_total.',
  example: 'With the defaults (N_o 800 rpm, N_set 2000 rpm, T_brake 150 N*m) the speed mode run reaches 2051.7 rpm after 0.5 s with T_load 283.6 N*m, then settles: after 10 s N_actual is 2000.0 rpm, T_load 150.0 N*m and P_dyno 31.42 kW. In Torque mode from 1000 rpm with T_brake 150 and T_set 100 N*m, after 2 s the shaft is at 2469.1 rpm and T_load is 100 N*m.',
};

const dynoFactory = definePtBlock(DYNO_SPEC, {
  init: p => ({ omega: rpm2radps(p.N_o), z: 0 }),
  derivatives: (ins, p, state) => {
    const Tb = num(ins[1]), Ns = num(ins[0]);
    const J = p.J_eng + p.J_dyno;
    const N = radps2rpm(state.omega);
    if (p.mode === 'Speed') {
      if (![Tb, Ns].every(Number.isFinite)) return { omega: 0, z: 0 };
      const TL = p.Kp * (N - Ns) + p.Ki * state.z;
      return { omega: (Tb - TL) / J, z: N - Ns };
    }
    const Ts = num(ins[2]);
    if (![Tb, Ts].every(Number.isFinite)) return { omega: 0, z: 0 };
    return { omega: (Tb - Ts) / J, z: 0 };
  },
  execute: (ins, p, state) => {
    const Ns = num(ins[0]), Ts = num(ins[2]);
    const speed = p.mode === 'Speed';
    if (!Number.isFinite(speed ? Ns : Ts)) return { outputs: [], error: speed ? 'N_set must be finite' : 'T_set must be finite' };
    const N = radps2rpm(state.omega);
    const err = speed ? N - Ns : 0;
    const TL = speed ? p.Kp * err + p.Ki * state.z : Ts;
    const info = makeBus(['SpeedError', 'Integrator', 'J_total'], [err, state.z, p.J_eng + p.J_dyno]);
    return { outputs: [info, N, TL, (TL * state.omega) / 1000] };
  },
});

// ---------------- Calibration ECU ----------------
const FACTORS = ['SOI', 'P_rail', 'PW', 'SA', 'VgtPos', 'EgrPos'] as const;
const FACTOR_UNITS: Record<string, string> = { SOI: 'deg', P_rail: 'MPa', PW: 'ms', SA: 'deg', VgtPos: '%', EgrPos: '%' };
const FACTOR_DEFAULTS: Record<string, number> = { SOI: 6, P_rail: 120, PW: 0.8, SA: 20, VgtPos: 50, EgrPos: 0 };
const FACTOR_WHAT: Record<string, string> = {
  SOI: 'start of injection', P_rail: 'rail pressure', PW: 'injection pulse width', SA: 'spark advance',
  VgtPos: 'variable-geometry turbine position', EgrPos: 'EGR valve position',
};
const SPEED_BP = [1000, 2000, 3000, 4000], LOAD_BP = [0, 25, 50, 75, 100];
const constTable = (v: number, rows = SPEED_BP.length, cols = LOAD_BP.length): number[][] => Array.from({ length: rows }, () => Array(cols).fill(v));

const ECU_SPEC: PtBlockSpec = {
  type: 'PT_CALIBRATION_ECU',
  label: 'Calibration ECU',
  category: 'Powertrain / Engine Calibration / Control and Calibration',
  simulinkPath: '',
  source: 'user-spec',
  specRef: SPEC_REF,
  symbol: 'calibration-ecu',
  inputs: [
    inp('N', 'rpm', 1, 'Engine speed used by the Map mode lookup.'),
    inp('Load', '%', 2, 'Engine load (torque demand or pedal) in percent, used by the Map mode lookup.'),
    inp('DoE', '1', 3, 'Vector of factor values from the DoE sweeper; element i drives the factor named at position i of factorOrder.'),
  ],
  outputs: [
    out('Info', 'bus', 1, 'Bus with Mode (1 = DoE override, 2 = Map) and Source_<name> per output (1 = DoE, 2 = Default, 3 = Map).', 'Bus: CalibrationEcuInfo'),
    ...FACTORS.map((f, i) => out(f, FACTOR_UNITS[f], i + 2, `Commanded ${FACTOR_WHAT[f]}.`)),
  ],
  params: [
    { name: 'mode', label: 'Mode', unit: '', default: 'DoE override', kind: 'enum', options: ['DoE override', 'Map'], description: 'DoE override passes the DoE vector through by factorOrder and uses defaults for the rest. Map looks up every output in its speed by load table.' },
    { name: 'factorOrder', label: 'Factor order', unit: '', default: FACTORS.join(','), kind: 'string', description: 'Comma-separated output names, in the order of the DoE vector elements. Allowed names are SOI, P_rail, PW, SA, VgtPos and EgrPos; an unknown name is a block error.' },
    ...FACTORS.map(f => sc(`default_${f}`, `Default ${f}`, FACTOR_UNITS[f], FACTOR_DEFAULTS[f], `Value of ${FACTOR_WHAT[f]} used when the DoE vector does not supply ${f}.`)),
    { name: 'speedBp', label: 'Speed breakpoints', unit: 'rpm', default: SPEED_BP, kind: 'vector', description: 'Engine speed breakpoints (strictly increasing) of the Map mode tables; the rows of each map_ table.' },
    { name: 'loadBp', label: 'Load breakpoints', unit: '%', default: LOAD_BP, kind: 'vector', description: 'Engine load breakpoints (strictly increasing) of the Map mode tables; the columns of each map_ table.' },
    ...FACTORS.map(f => ({
      name: `map_${f}`, label: `${f} map`, unit: FACTOR_UNITS[f], default: constTable(FACTOR_DEFAULTS[f]), kind: 'table' as const,
      description: `Map mode table of ${FACTOR_WHAT[f]}, size length(speedBp) x length(loadBp). A table that is still the constant default_${f} value is resized to the breakpoints automatically.`,
    })),
  ],
  states: [],
  equations: [
    'DoE override: output factorOrder[i] = DoE[i] for i < length(DoE); every other output = default_<name>',
    'Map: output_k = interp2(speedBp, loadBp, map_k, N, Load), bilinear, clipped to the table range',
  ],
  references: ['docs/powertrain/engine-calibration-spec.md section 2', 'MathWorks 2-D Lookup Table (bilinear interpolation, clip) as the lookup convention'],
  description: 'Engine calibration source for the six engine actuation set points: start of injection, rail pressure, injection pulse width, spark advance, VGT position and EGR position. It either applies a DoE factor vector or reads speed by load calibration maps.',
  behavior: 'DoE override mode copies DoE element i to the output named at position i of factorOrder; outputs not named, or beyond the length of a shorter DoE vector, use their default_<name> parameter. A DoE vector longer than factorOrder, an unknown or repeated name in factorOrder, or a non-finite element is a block error. Map mode looks each output up bilinearly in its speed by load table and clips outside the breakpoints; a map table that is still the constant default value is resized to the breakpoints, any other size mismatch is an error. Info reports Mode (1 DoE override, 2 Map) and Source_<name> (1 DoE, 2 Default, 3 Map).',
  example: 'With default parameters and DoE = [8 140] at 2000 rpm and 50 % load, SOI = 8 deg and P_rail = 140 MPa come from the DoE (Source 1) while PW 0.8 ms, SA 20 deg, VgtPos 50 % and EgrPos 0 % are defaults (Source 2). In Map mode with map_SOI rows [0 10 20 30 40] at every speed, 2500 rpm and 60 % load give SOI = 24 deg and the other outputs stay at their defaults.',
};

const ecuFactors = (p: Record<string, any>): string[] | string => {
  const names = String(p.factorOrder).split(',').map(s => s.trim()).filter(s => s.length > 0);
  const unknown = names.filter(n => !(FACTORS as readonly string[]).includes(n));
  if (unknown.length > 0) return `factorOrder contains unknown name(s): ${unknown.join(', ')}. Allowed: ${FACTORS.join(', ')}`;
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  if (dup.length > 0) return `factorOrder repeats name(s): ${[...new Set(dup)].join(', ')}`;
  return names;
};

function ecuTables(p: Record<string, any>): Record<string, number[][]> | string {
  const b1 = validateBreakpoints(p.speedBp);
  if (b1) return `speedBp: ${b1}`;
  const b2 = validateBreakpoints(p.loadBp);
  if (b2) return `loadBp: ${b2}`;
  const bp = [p.speedBp, p.loadBp];
  const tables: Record<string, number[][]> = {};
  for (const f of FACTORS) {
    let t = p[`map_${f}`];
    const err = validateTable(t, bp);
    if (err) {
      const d = p[`default_${f}`];
      const isDefaultConst = Array.isArray(t) && (t as any[]).flat(Infinity).every(v => v === d);
      if (!isDefaultConst) return `map_${f}: ${err}`;
      t = constTable(d, p.speedBp.length, p.loadBp.length);
    }
    tables[f] = t;
  }
  return tables;
}

const ecuFactory = definePtBlock(ECU_SPEC, {
  execute: (ins, p) => {
    const names = ecuFactors(p);
    if (typeof names === 'string') return { outputs: [], error: names };
    const vals: Record<string, number> = {};
    const src: Record<string, number> = {};
    if (p.mode === 'DoE override') {
      const raw = ins[2];
      const doe: unknown[] = Array.isArray(raw) ? (raw as any[]).flat(Infinity) : raw === undefined ? [] : [raw];
      if (doe.length > names.length) return { outputs: [], error: `DoE vector has ${doe.length} elements but factorOrder names only ${names.length}` };
      if (!doe.every(v => typeof v === 'number' && Number.isFinite(v))) return { outputs: [], error: 'DoE vector elements must be finite numbers' };
      for (const f of FACTORS) { vals[f] = p[`default_${f}`]; src[f] = 2; }
      doe.forEach((v, i) => { vals[names[i]] = v as number; src[names[i]] = 1; });
    } else {
      const tables = ecuTables(p);
      if (typeof tables === 'string') return { outputs: [], error: tables };
      const N = num(ins[0]), L = num(ins[1]);
      if (![N, L].every(Number.isFinite)) return { outputs: [], error: 'N and Load must be finite' };
      for (const f of FACTORS) { vals[f] = lookupNd(tables[f], [p.speedBp, p.loadBp], [N, L], CLIP); src[f] = 3; }
    }
    const info = makeBus(['Mode', ...FACTORS.map(f => `Source_${f}`)], [p.mode === 'DoE override' ? 1 : 2, ...FACTORS.map(f => src[f])]);
    return { outputs: [info, ...FACTORS.map(f => vals[f])] };
  },
});

// ---------------- Calibration Map 2D ----------------
/** Second derivatives of the natural cubic spline (M0 = Mn = 0) through (x, y); Thomas algorithm. */
function naturalSplineM(x: number[], y: number[]): number[] {
  const n = x.length;
  const M = new Array<number>(n).fill(0);
  if (n < 3) return M;
  const c = new Array<number>(n).fill(0), d = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const h0 = x[i] - x[i - 1], h1 = x[i + 1] - x[i];
    const a = h0, b = 2 * (h0 + h1), cc = h1;
    const rhs = 6 * ((y[i + 1] - y[i]) / h1 - (y[i] - y[i - 1]) / h0);
    const den = b - a * c[i - 1];
    c[i] = cc / den;
    d[i] = (rhs - a * d[i - 1]) / den;
  }
  for (let i = n - 2; i >= 1; i--) M[i] = d[i] - c[i] * M[i + 1];
  return M;
}

function splineEval(x: number[], y: number[], xq: number): number {
  const n = x.length;
  if (n === 1) return y[0];
  const M = naturalSplineM(x, y);
  let k = 0;
  while (k < n - 2 && xq > x[k + 1]) k++;
  const h = x[k + 1] - x[k];
  const A = (x[k + 1] - xq) / h, B = (xq - x[k]) / h;
  return A * y[k] + B * y[k + 1] + ((A ** 3 - A) * M[k] + (B ** 3 - B) * M[k + 1]) * h * h / 6;
}

const MAP_SPEC: PtBlockSpec = {
  type: 'PT_CALIBRATION_MAP_2D',
  label: 'Calibration Map 2D',
  category: 'Powertrain / Engine Calibration / Control and Calibration',
  simulinkPath: '',
  source: 'user-spec',
  specRef: SPEC_REF,
  symbol: 'calibration-map',
  inputs: [
    inp('X_in', '1', 1, 'First lookup coordinate, matched to X_bp (the rows of Z). Clipped to the X_bp range.'),
    inp('Y_in', '1', 2, 'Second lookup coordinate, matched to Y_bp (the columns of Z). Clipped to the Y_bp range.'),
  ],
  outputs: [out('Z_out', '1', 1, 'Interpolated table value at (X_in, Y_in).')],
  params: [
    { name: 'X_bp', label: 'X breakpoints', unit: '1', default: [1000, 2000, 3000], kind: 'vector', description: 'Strictly increasing breakpoints for X_in; the rows of Z.' },
    { name: 'Y_bp', label: 'Y breakpoints', unit: '1', default: [0, 50, 100], kind: 'vector', description: 'Strictly increasing breakpoints for Y_in; the columns of Z.' },
    { name: 'Z', label: 'Table', unit: '1', default: [[1, 2, 3], [2, 3, 4], [3, 4, 5]], kind: 'table', description: 'Table values, size length(X_bp) x length(Y_bp). The default is X/1000 + Y/50.' },
    { name: 'method', label: 'Interpolation', unit: '', default: 'Bilinear', kind: 'enum', options: ['Bilinear', 'Bicubic'], description: 'Bilinear: linear in both directions. Bicubic: tensor-product natural cubic spline, smooth across breakpoints.' },
  ],
  states: [],
  equations: [
    'Bilinear: Z = (1-fx)*((1-fy)*Z[i][j] + fy*Z[i][j+1]) + fx*((1-fy)*Z[i+1][j] + fy*Z[i+1][j+1]), inputs clipped to the grid',
    'Bicubic: v_i = S_Y,i(Y_in) natural cubic spline along Y for every X row, then Z = S_X(X_in) natural cubic spline of v over X_bp; second derivative 0 at both ends',
  ],
  references: ['docs/powertrain/engine-calibration-spec.md section 2', 'Press et al., Numerical Recipes, 3rd ed., section 3.3 (cubic spline interpolation)'],
  description: 'Generic two-input calibration map. It interpolates a table over X and Y breakpoints, either bilinearly or with a smooth natural cubic spline, and clips the inputs to the grid.',
  behavior: 'Bilinear interpolates linearly between the four surrounding grid values. Bicubic fits a natural cubic spline (second derivative 0 at both end breakpoints) along Y through each X row, then a natural cubic spline along X through those results, so the surface and its slope are continuous across breakpoints but it can overshoot between sparse points. Both clip X_in and Y_in to the breakpoint range. Non-increasing breakpoints, a Z size different from length(X_bp) x length(Y_bp) or a non-finite input is a block error.',
  example: 'With the default table Z = X/1000 + Y/50, X_in 1500 and Y_in 25 give Z_out = 2.0, and X_in 5000 clips to 3000 giving 3.5. For Z = (X/1000)^2 on X_bp [1000 1500 2500 4000], X_in 2000 gives 4.25 with Bilinear and 3.955 with Bicubic (exact value 4).',
};

const mapFactory = definePtBlock(MAP_SPEC, {
  execute: (ins, p) => {
    const e1 = validateBreakpoints(p.X_bp);
    if (e1) return { outputs: [], error: `X_bp: ${e1}` };
    const e2 = validateBreakpoints(p.Y_bp);
    if (e2) return { outputs: [], error: `Y_bp: ${e2}` };
    const e3 = validateTable(p.Z, [p.X_bp, p.Y_bp]);
    if (e3) return { outputs: [], error: `Z: ${e3}` };
    const x = num(ins[0]), y = num(ins[1]);
    if (![x, y].every(Number.isFinite)) return { outputs: [], error: 'X_in and Y_in must be finite' };
    if (p.method === 'Bilinear') return { outputs: [lookupNd(p.Z, [p.X_bp, p.Y_bp], [x, y], CLIP)] };
    const X: number[] = p.X_bp, Y: number[] = p.Y_bp;
    const xc = Math.min(Math.max(x, X[0]), X[X.length - 1]);
    const yc = Math.min(Math.max(y, Y[0]), Y[Y.length - 1]);
    const col = (p.Z as number[][]).map(row => splineEval(Y, row, yc));
    return { outputs: [splineEval(X, col, xc)] };
  },
});

export const TEST_CELL_CONTROL_BLOCKS: { spec: PtBlockSpec; factory: typeof dynoFactory }[] = [
  { spec: DYNO_SPEC, factory: dynoFactory },
  { spec: ECU_SPEC, factory: ecuFactory },
  { spec: MAP_SPEC, factory: mapFactory },
];
