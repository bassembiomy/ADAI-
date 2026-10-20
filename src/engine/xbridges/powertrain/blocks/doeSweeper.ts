// Powertrain / Engine Calibration: DoE Sweeper & Constraint Evaluator (user spec, no Simulink counterpart).
import type { XBlock, XValue } from '../../types';
import { isBus, makeBus } from '../../bus/busCore';
import type { DOEInputTable } from '../../../doe/types';
import { definePtBlock } from '../ptBlock';
import type { PtBlockSpec, PtParamSpec, PtPortSpec } from '../ptSpec';
import { centralComposite, fullFactorial, latinHypercube, scaleCoded, scaleUnit } from '../doeDesigns';

const SPEC_REF = 'docs/powertrain/engine-calibration-spec.md#2-blocks';
const MAX_POINTS = 100000;
const DEFAULT_FACTORS = 'SOI,P_rail';
const TIME_EPS = 1e-9;

export interface DoeRow {
  index: number;
  point: number[];
  responses: Record<string, number>;
  feasible: boolean;
  violations: string[];
}

const inp = (id: string, unit: string, simulinkIndex: number, description: string, feedthrough?: boolean): PtPortSpec =>
  ({ id, name: id, direction: 'input', unit, simulinkIndex, description, ...(feedthrough === undefined ? {} : { feedthrough }) });
const out = (id: string, unit: string, simulinkIndex: number, description: string, dataType?: string): PtPortSpec =>
  ({ id, name: id, direction: 'output', unit, simulinkIndex, description, ...(dataType ? { dataType } : {}) });
const par = (name: string, label: string, unit: string, def: number, description: string,
  o: { min?: number; max?: number; minExclusive?: boolean; maxExclusive?: boolean } = {}): PtParamSpec =>
  ({ name, label, unit, default: def, kind: 'scalar', description, ...o });

const spec: PtBlockSpec = {
  type: 'PT_DOE_SWEEPER',
  label: 'DoE Sweeper & Constraint Evaluator',
  category: 'Powertrain / Engine Calibration / Test Cell and DoE',
  simulinkPath: '',
  source: 'user-spec',
  specRef: SPEC_REF,
  symbol: 'doe-sweeper',
  inputs: [inp('Responses', 'bus', 1, 'Response bus of the engine under test (T_brake, BSFC, P_max, T_exh, NOx and any other numeric element). Averaged over the last averageWindow seconds of each dwell. It does not act on any output instantaneously.', false)],
  outputs: [
    out('Info', 'bus', 1, 'Bus with Points (design size), Completed (finished points), BestIndex (index of the best feasible point, -1 if none) and BestObjective (its objective response).', 'Bus: DoeSweeperInfoBus'),
    out('NextPoint', '1', 2, 'Factor values of the active design point, in the order of the factors parameter (units of the factors). The last point is held after the sweep.'),
    out('PointIndex', '1', 3, 'Zero-based index of the active design point.'),
    out('Done', '1', 4, '1 once every design point has had its dwell time, otherwise 0.'),
  ],
  params: [
    { name: 'designType', label: 'Design type', unit: '', default: 'Full Factorial', kind: 'enum', options: ['Full Factorial', 'Latin Hypercube', 'Central Composite'],
      description: 'Experimental design: Full Factorial (all level combinations), Latin Hypercube (seeded space filling, one point per stratum of every factor) or Central Composite (corners, axial and centre points).' },
    { name: 'bounds', label: 'Factor bounds', unit: '', default: [[-25, 5], [50, 200]], kind: 'table',
      description: 'One row [low, high] per factor, in the units of that factor. The row count sets the number of factors; every row needs low < high.' },
    { name: 'factors', label: 'Factor names', unit: '', default: DEFAULT_FACTORS, kind: 'string',
      description: 'Comma-separated factor names, one per row of the bounds table, in the order of the NextPoint vector (for example SOI,P_rail). They name the columns of the exported DOE table.' },
    par('levels', 'Levels per factor', '1', 3, 'Number of equally spaced levels per factor for the Full Factorial design (integer, 2 or more).', { min: 2 }),
    par('samples', 'Samples', '1', 10, 'Number of design points for the Latin Hypercube design (integer, 1 or more).', { min: 1 }),
    par('seed', 'Random seed', '1', 1, 'Seed of the Latin Hypercube generator; the same seed always gives the same design.'),
    { name: 'ccdAlpha', label: 'CCD axial distance', unit: '', default: 'face', kind: 'enum', options: ['face', 'rotatable'],
      description: 'Axial distance of the Central Composite design: face centred (alpha = 1) or rotatable (alpha = (2^k)^(1/4)). For rotatable the coded design is divided by alpha so the axial points lie on the bounds.' },
    par('centerPoints', 'Centre points', '1', 1, 'Number of centre points added to the Central Composite design (integer, 0 or more).', { min: 0 }),
    par('dwell', 'Dwell time', 's', 2, 'Time each design point is held before the next one is applied.', { min: 0, minExclusive: true }),
    par('averageWindow', 'Averaging window', 's', 0.5, 'Length of the window at the end of each dwell over which the responses are averaged (must not exceed the dwell time).', { min: 0, minExclusive: true }),
    par('Pmax_limit', 'Peak pressure limit', 'Pa', 180e5, 'Hard limit on the averaged P_max response; a point above it is infeasible.', { min: 0, minExclusive: true }),
    par('Texh_limit', 'Exhaust temperature limit', 'K', 1050, 'Hard limit on the averaged T_exh response; a point above it is infeasible.', { min: 0, minExclusive: true }),
    { name: 'objective', label: 'Objective', unit: '', default: 'BSFC', kind: 'enum', options: ['BSFC', 'NOx', 'T_exh', '-T_brake'],
      description: 'Response minimised over the feasible points. -T_brake maximises brake torque.' },
  ],
  states: ['accumulated response sums', 'finished design points'],
  equations: [
    'Full Factorial: levels_j = lo_j + (hi_j - lo_j)*m/(L - 1), m = 0..L-1; all combinations, first factor slowest',
    'Latin Hypercube: x_ij = (pi_j(i) + u_ij)/n, pi_j a seeded random permutation of 0..n-1, u_ij ~ U[0,1); scaled to lo_j + x*(hi_j - lo_j)',
    'Central Composite: 2^k corners (+-1), 2k axial points (+-alpha), centre points; alpha = 1 (face) or (2^k)^(1/4) (rotatable)',
    'Point index i = floor(t/dwell); responses averaged for t in [(i+1)*dwell - averageWindow, (i+1)*dwell)',
    'Feasible iff P_max <= Pmax_limit and T_exh <= Texh_limit; best = argmin of the objective over feasible points',
  ],
  references: [
    'Montgomery, Design and Analysis of Experiments, Wiley',
    'McKay, Beckman & Conover, A comparison of three methods for selecting values of input variables in the analysis of output from a computer code, Technometrics 21(2), 1979',
    'Box & Wilson, On the experimental attainment of optimum conditions, J. R. Stat. Soc. B 13, 1951',
  ],
  description: 'Drives an engine model through a designed experiment and evaluates hard limits on the way. It steps through the design points, holds each for a dwell time, averages the responses over the end of the dwell, flags points that break the peak-pressure or exhaust-temperature limit and reports the best feasible point.',
  behavior: "The design (scaled to the factor bounds) is computed once from the parameters. Point i = floor(t/dwell) is output on NextPoint (the last point is held after the sweep, Done = 1 and PointIndex is the last index). The Responses bus is sampled at every macro step inside the last averageWindow seconds of the dwell; when the next point starts, the samples are averaged into a result row. A row is infeasible when the averaged P_max exceeds Pmax_limit or the averaged T_exh exceeds Texh_limit, and lists the violated response names. Info reports the design size, the number of finished rows and the best feasible row for the objective (BestIndex = -1 and BestObjective = 0 while none is feasible; BestObjective is the response value, not its sign-flipped form). For the Central Composite design the face-centred option (alpha = 1) places the axial points on the face of the cube, i.e. on the bounds; the rotatable option divides the coded points by alpha = (2^k)^(1/4), so the axial points sit on the bounds and the corners lie inside them (inscribed CCD, 'CCI'). A missing or non-bus Responses input adds no sample. Invalid bounds, level or sample counts are reported as a block error. The helpers doeSweeperResults, bestFeasible and toDoeInputTable export the rows to the DOE module.",
  example: "Two factors SOI in [0, 16] deg and P_rail in [100, 200] MPa, Full Factorial with 3 levels (9 points), dwell 1 s, averageWindow 0.5 s, Pmax_limit 120e5 Pa, on a toy plant with BSFC = 200 + (SOI - 8)^2 + 0.001*(P_rail - 150)^2 and P_max = 60e5 + 5e5*SOI + 1e4*P_rail. Point 4 = [8, 150] gives BSFC 200 and P_max 115e5 Pa (feasible); the three points with SOI 16 give P_max 150e5 to 160e5 Pa and are flagged P_max. The best feasible point is index 4 and Info shows Points 9, Completed 9, BestIndex 4, BestObjective 200. The factors parameter ('SOI,P_rail' by default) only names the columns of the exported table; it is free text and must list as many names as the bounds table has rows. A Central Composite design with the default bounds and one centre point gives 9 points: corners [-25,50], [-25,200], [5,50], [5,200], axial points [-25,125], [5,125], [-10,50], [-10,200] and the centre [-10,125].",
};

interface SweeperState { cur: number; count: number; sums: Record<string, number>; rows: DoeRow[] }
const initState = (): SweeperState => ({ cur: 0, count: 0, sums: {}, rows: [] });

function parseNames(factors: unknown): string[] {
  return typeof factors === 'string' ? factors.split(',').map(s => s.trim()).filter(s => s !== '') : [];
}

function boundsRows(b: unknown): number[][] {
  if (!Array.isArray(b)) throw new Error('Parameter bounds must be a table of [low, high] rows');
  const rows: number[][] = Array.isArray(b[0]) ? (b as number[][]) : [b as number[]];
  rows.forEach((r, j) => {
    if (!Array.isArray(r) || r.length !== 2) throw new Error(`Parameter bounds row ${j + 1} must be [low, high]`);
    if (!(r[0] < r[1])) throw new Error(`Parameter bounds row ${j + 1} needs low < high`);
  });
  return rows;
}

function isInt(v: number): boolean { return Number.isInteger(v); }

function buildDesign(p: Record<string, any>): number[][] {
  const bounds = boundsRows(p.bounds);
  const k = bounds.length;
  const names = parseNames(p.factors);
  if (names.length !== 0 && names.length !== k) throw new Error(`Parameter factors lists ${names.length} names but bounds has ${k} rows`);
  if (p.averageWindow > p.dwell) throw new Error('Parameter averageWindow must be <= dwell');
  if (p.designType === 'Full Factorial') {
    if (!isInt(p.levels) || p.levels < 2) throw new Error('Parameter levels must be an integer >= 2');
    if (Math.pow(p.levels, k) > MAX_POINTS) throw new Error(`Full factorial design exceeds ${MAX_POINTS} points`);
    const lv = bounds.map(([lo, hi]) => Array.from({ length: p.levels }, (_, m) => lo + ((hi - lo) * m) / (p.levels - 1)));
    return fullFactorial(lv);
  }
  if (p.designType === 'Latin Hypercube') {
    if (!isInt(p.samples) || p.samples < 1) throw new Error('Parameter samples must be an integer >= 1');
    if (p.samples > MAX_POINTS) throw new Error(`Latin hypercube design exceeds ${MAX_POINTS} points`);
    return scaleUnit(latinHypercube(k, p.samples, p.seed), bounds);
  }
  if (!isInt(p.centerPoints) || p.centerPoints < 0) throw new Error('Parameter centerPoints must be an integer >= 0');
  if (k > 16) throw new Error('Central composite design supports at most 16 factors');
  const alpha = p.ccdAlpha === 'rotatable' ? Math.pow(2 ** k, 0.25) : 1;
  const coded = centralComposite(k, { alpha: p.ccdAlpha === 'rotatable' ? 'rotatable' : 'face', centerPoints: p.centerPoints });
  return scaleCoded(coded.map(r => r.map(c => c / alpha)), bounds);
}

// The runtime params object handed to execute is stable per block, so the design is cached on it.
const designCache = new WeakMap<object, number[][]>();
function designFor(p: Record<string, any>): number[][] {
  const hit = designCache.get(p);
  if (hit) return hit;
  const d = buildDesign(p);
  designCache.set(p, d);
  return d;
}

const objectiveValue = (row: DoeRow, objective: string): number | undefined => {
  const neg = objective.startsWith('-');
  const v = row.responses[neg ? objective.slice(1) : objective];
  return v === undefined ? undefined : neg ? -v : v;
};

/** Index (in rows) of the best feasible row: minimum objective, ties to the lowest index. */
function bestRow(rows: DoeRow[], objective: string): DoeRow | undefined {
  let best: DoeRow | undefined;
  let bestV = Infinity;
  for (const r of rows) {
    if (!r.feasible) continue;
    const v = objectiveValue(r, objective);
    if (v === undefined || !Number.isFinite(v)) continue;
    if (best === undefined || v < bestV) { best = r; bestV = v; }
  }
  return best;
}

export function doeSweeperResults(state: any): DoeRow[] {
  const rows = state?.rows;
  return Array.isArray(rows) ? rows.map((r: DoeRow) => ({ ...r, point: [...r.point], responses: { ...r.responses }, violations: [...r.violations] })) : [];
}

export function bestFeasible(rows: DoeRow[], objective: string): DoeRow | undefined {
  return bestRow(rows, objective);
}

export function toDoeInputTable(rows: DoeRow[], factorNames: string[], responseName: string): DOEInputTable {
  return {
    factorNames: [...factorNames],
    responseName,
    factors: rows.map(r => [...r.point]),
    responses: rows.map(r => r.responses[responseName] ?? 0),
    runOrder: rows.map(r => r.index),
  };
}

function finaliseRow(index: number, point: number[], st: SweeperState, p: Record<string, any>): DoeRow {
  const responses: Record<string, number> = {};
  if (st.count > 0) for (const [k, s] of Object.entries(st.sums)) responses[k] = s / st.count;
  const violations: string[] = [];
  if (st.count === 0) violations.push('no samples');
  if (responses.P_max !== undefined && responses.P_max > p.Pmax_limit) violations.push('P_max');
  if (responses.T_exh !== undefined && responses.T_exh > p.Texh_limit) violations.push('T_exh');
  return { index, point: [...point], responses, feasible: violations.length === 0, violations };
}

const doeFactory = definePtBlock(spec, {
  init: () => initState(),
  execute: (ins, p, state, t) => {
    const design = designFor(p);
    const n = design.length;
    const st: SweeperState = state && Array.isArray(state.rows) ? state : initState();
    const i = Math.max(0, Math.floor(t / p.dwell + TIME_EPS));
    const idx = Math.min(i, n - 1);

    // state update: finalise finished points, accumulate the averaging window of the active point
    let cur = st.cur, count = st.count, sums = st.sums, rows = st.rows;
    while (cur < Math.min(i, n)) {
      rows = [...rows, finaliseRow(cur, design[cur], { cur, count, sums, rows }, p)];
      cur++; count = 0; sums = {};
    }
    if (i < n && t >= (i + 1) * p.dwell - p.averageWindow - TIME_EPS) {
      const r = ins[0] as XValue | undefined;
      if (isBus(r)) {
        const next = { ...sums };
        let any = false;
        for (const [k, v] of Object.entries(r)) {
          if (typeof v === 'number' && Number.isFinite(v)) { next[k] = (next[k] ?? 0) + v; any = true; }
        }
        if (any) { sums = next; count++; }
      }
    }

    const best = bestRow(st.rows, p.objective);
    const info = makeBus(['Points', 'Completed', 'BestIndex', 'BestObjective'],
      [n, st.rows.length, best ? best.index : -1, best ? (best.responses[p.objective.startsWith('-') ? p.objective.slice(1) : p.objective] ?? 0) : 0]);
    return {
      outputs: [info, [...design[idx]], idx, i >= n ? 1 : 0],
      nextState: { cur, count, sums, rows },
    };
  },
});

export const DOE_SWEEPER_BLOCKS: { spec: PtBlockSpec; factory: (id: string, params?: Record<string, any>) => XBlock }[] = [{ spec, factory: doeFactory }];
