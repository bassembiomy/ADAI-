// Simulink-equivalent lookup table blocks: 1-D, 2-D, n-D Lookup Table, Prelookup, Interpolation Using Prelookup.
// Must not import BlockDefinitions.ts (BlockDefinitions registers these factories).
import type { XBlock, XPort, XValue } from '../types';
import { VectorUtils } from '../VectorUtils';
import {
  validateBreakpoints, validateTable, prelookup, interpolateNd,
  type LutInterp, type LutExtrap, type LutKF, type LutTable
} from './lookupCore';

const port = (id: string, dir: 'input' | 'output'): XPort => ({
  id, name: id, type: 'auto', direction: dir, value: 0, position: dir === 'input' ? 'left' : 'right'
});

const INTERP_SPLINE_MSG = 'Cubic spline/Akima spline interpolation is not supported yet';
const N_DIMS_MSG = 'NumberOfTableDimensions must be an integer from 1 to 4';

/** Parse MATLAB text when needed; column vectors ([[a],[b]] or [[a b c]]) become flat vectors. */
function parseValue(v: any): any {
  return typeof v === 'string' ? VectorUtils.parseMatlabArray(v) : v;
}
function asVector(v: any): any {
  const p = parseValue(v);
  if (Array.isArray(p) && p.length > 0 && p.every(e => Array.isArray(e) && e.length === 1)) return p.map((e: any[]) => e[0]);
  if (Array.isArray(p) && p.length === 1 && Array.isArray(p[0]) && p[0].every((e: any) => typeof e === 'number')) return p[0];
  return p;
}
function asTable(v: any, dims: number): any {
  return dims === 1 ? asVector(v) : parseValue(v);
}
function parseDims(v: any, fallback: number): number {
  const p = parseValue(v);
  return p === undefined || p === null ? fallback : typeof p === 'number' ? p : NaN;
}
const validDims = (n: number) => Number.isInteger(n) && n >= 1 && n <= 4;

function mapInterp(raw: any): { interp?: LutInterp; error?: string } {
  const m = raw ?? 'Linear point-slope';
  if (m === 'Linear point-slope') return { interp: 'linear' };
  if (m === 'Linear Lagrange') return { interp: 'linear-lagrange' };
  if (m === 'Flat') return { interp: 'flat' };
  if (m === 'Nearest') return { interp: 'nearest' };
  if (m === 'Cubic spline' || m === 'Akima spline') return { error: INTERP_SPLINE_MSG };
  return { error: `Unknown InterpMethod '${String(m)}'` };
}
function mapExtrap(raw: any): { extrap?: LutExtrap; error?: string } {
  const m = raw ?? 'Linear';
  if (m === 'Clip') return { extrap: 'clip' };
  if (m === 'Linear') return { extrap: 'linear' };
  return { error: `Unknown ExtrapMethod '${String(m)}'` };
}
function methods(params: Record<string, any>): { interp: LutInterp; extrap: LutExtrap } | string {
  const i = mapInterp(params.InterpMethod);
  if (i.error) return i.error;
  const e = mapExtrap(params.ExtrapMethod);
  if (e.error) return e.error;
  if ((i.interp === 'flat' || i.interp === 'nearest') && e.extrap === 'linear') return "Flat and Nearest interpolation require ExtrapMethod 'Clip'";
  return { interp: i.interp!, extrap: e.extrap! };
}
function scalarInput(v: XValue | undefined, name: string): number | string {
  const x = typeof v === 'boolean' ? Number(v) : v;
  if (typeof x !== 'number' || !Number.isFinite(x)) return `Input ${name} must be a finite scalar`;
  return x;
}

const TANH_BP = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
const DEFAULT_2D_TABLE = [[4, 5, 6], [16, 19, 20], [10, 18, 23]];

function defaultsFor(n: number, fixed: boolean): { table: any; bps: number[][] } {
  if (fixed && n === 1) return { table: TANH_BP.map(x => Math.tanh(x)), bps: [TANH_BP.slice()] };
  if (n === 2) return { table: DEFAULT_2D_TABLE.map(r => r.slice()), bps: [[1, 2, 3], [4, 5, 6]] };
  const bps = Array.from({ length: n }, () => [0, 1]);
  const build = (d: number): any => (d === n ? 0 : [build(d + 1), build(d + 1)]);
  return { table: build(0), bps };
}

function resolveLutParams(params: Record<string, any>, n: number, fixed: boolean) {
  const out: Record<string, any> = {};
  const dn = validDims(n) ? n : 2;
  const def = defaultsFor(dn, fixed);
  out.Table = asTable(params.Table ?? def.table, dn);
  for (let d = 1; d <= dn; d++) {
    out[`BreakpointsForDimension${d}`] = asVector(params[`BreakpointsForDimension${d}`] ?? def.bps[d - 1]);
  }
  return out;
}

function evalLut(params: Record<string, any>, inputs: XValue[], fixedN?: number): { y?: number; error?: string } {
  const n = fixedN ?? parseDims(params.NumberOfTableDimensions, 2);
  if (!validDims(n)) return { error: N_DIMS_MSG };
  const m = methods(params);
  if (typeof m === 'string') return { error: m };
  const bps: number[][] = [];
  for (let d = 1; d <= n; d++) {
    const bp = asVector(params[`BreakpointsForDimension${d}`]);
    if (!Array.isArray(bp)) return { error: `BreakpointsForDimension${d} must be a numeric vector` };
    const e = validateBreakpoints(bp);
    if (e) return { error: `BreakpointsForDimension${d}: ${e}` };
    bps.push(bp);
  }
  const table = asTable(params.Table, n);
  const te = validateTable(table, bps);
  if (te) return { error: te };
  const kf: LutKF[] = [];
  for (let d = 0; d < n; d++) {
    const u = scalarInput(inputs[d], `u${d + 1}`);
    if (typeof u === 'string') return { error: u };
    kf.push(prelookup(bps[d], u, { extrap: m.extrap }));
  }
  const y = interpolateNd(table as LutTable, kf, m);
  if (!Number.isFinite(y)) return { error: 'Lookup result is not finite' };
  return { y };
}

function lutBlock(type: string, id: string, params: any, n: number, fixed: boolean): XBlock {
  const p = params ?? {};
  const params2: Record<string, any> = {
    ...(fixed ? {} : { NumberOfTableDimensions: n }),
    ...resolveLutParams(p, n, fixed),
    InterpMethod: p.InterpMethod ?? 'Linear point-slope',
    ExtrapMethod: p.ExtrapMethod ?? 'Linear'
  };
  const portN = validDims(n) ? n : 2;
  const names = ['u1', 'u2', 'u3', 'u4'].slice(0, portN);
  const label = fixed ? `${n}-D` : 'n-D';
  return {
    id, type, params: params2,
    inputs: names.map(x => port(x, 'input')),
    outputs: [port('y', 'output')],
    icon: 'grid',
    equation: n === 1 ? 'y = T[k] + f*(T[k+1] - T[k]), (k, f) from the breakpoints'
      : 'y = multilinear interpolation of Table over the cell (k1, f1, ..., kn, fn) found in the breakpoints',
    description: `${label} Lookup Table: approximates a sampled function by ${n === 1 ? '' : 'multilinear '}interpolation (linear, flat or nearest) with clip or linear extrapolation.`,
    execute: (inputs, runtimeParams) => {
      const r = evalLut(runtimeParams, inputs, fixed ? n : undefined);
      return r.error !== undefined ? { outputs: [0], error: r.error } : { outputs: [r.y as number] };
    }
  };
}

function lookup1d(id: string, params: any): XBlock { return lutBlock('LOOKUP_1D', id, params, 1, true); }
function lookup2d(id: string, params: any): XBlock { return lutBlock('LOOKUP_2D', id, params, 2, true); }
function lookupNdBlock(id: string, params: any): XBlock {
  const n = parseDims((params ?? {}).NumberOfTableDimensions, 2);
  const b = lutBlock('LOOKUP_ND', id, params, n, false);
  b.params.NumberOfTableDimensions = validDims(n) ? n : (params ?? {}).NumberOfTableDimensions;
  return b;
}

function prelookupBlock(id: string, params: any): XBlock {
  const p = params ?? {};
  const bp = asVector(p.BreakpointsData ?? [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110]);
  const pr: Record<string, any> = {
    BreakpointsData: bp,
    ExtrapMethod: p.ExtrapMethod ?? 'Linear',
    UseLastBreakpoint: p.UseLastBreakpoint ?? 'off',
    OutputSelection: p.OutputSelection ?? 'Index and fraction'
  };
  const outsFor = (sel: any) => (sel === 'Index only' ? ['k'] : ['k', 'f']);
  return {
    id, type: 'PRELOOKUP', params: pr,
    inputs: [port('u', 'input')],
    outputs: outsFor(pr.OutputSelection).map(x => port(x, 'output')),
    icon: 'grid',
    equation: 'bp[k] <= u < bp[k+1], f = (u - bp[k]) / (bp[k+1] - bp[k]); k is zero-based',
    description: 'Prelookup: finds the zero-based breakpoint index k and the interval fraction f of the input, for use by Interpolation Using Prelookup.',
    execute: (inputs, rp) => {
      const sel = rp.OutputSelection ?? 'Index and fraction';
      const nOut = sel === 'Index only' ? 1 : 2;
      const fail = (error: string) => ({ outputs: new Array(nOut).fill(0) as XValue[], error });
      if (sel === 'Index and fraction as bus') return fail('OutputSelection "Index and fraction as bus" is not supported until bus signals (WP-04)');
      if (sel !== 'Index and fraction' && sel !== 'Index only') return fail(`Unknown OutputSelection '${String(sel)}'`);
      const e = mapExtrap(rp.ExtrapMethod);
      if (e.error) return fail(e.error);
      const useLast = rp.UseLastBreakpoint ?? 'off';
      if (useLast !== 'on' && useLast !== 'off') return fail(`Unknown UseLastBreakpoint '${String(useLast)}'`);
      const v = asVector(rp.BreakpointsData);
      if (!Array.isArray(v)) return fail('BreakpointsData must be a numeric vector');
      const be = validateBreakpoints(v);
      if (be) return fail(`BreakpointsData: ${be}`);
      const u = scalarInput(inputs[0], 'u');
      if (typeof u === 'string') return fail(u);
      const r = prelookup(v, u, { extrap: e.extrap!, useLastBreakpoint: useLast === 'on' });
      return { outputs: sel === 'Index only' ? [r.k] : [r.k, r.f] };
    }
  };
}

function interpPrelookupBlock(id: string, params: any): XBlock {
  const p = params ?? {};
  const n = parseDims(p.NumberOfTableDimensions, 2);
  const sq = Array.from({ length: 11 }, (_, i) => Array.from({ length: 11 }, (_, j) => Math.sqrt((i + 1) * (j + 1))));
  const pr: Record<string, any> = {
    NumberOfTableDimensions: validDims(n) ? n : p.NumberOfTableDimensions,
    Table: asTable(p.Table ?? (n === 2 ? sq : defaultsFor(validDims(n) ? n : 2, false).table), n),
    InterpMethod: p.InterpMethod ?? 'Linear point-slope',
    ExtrapMethod: p.ExtrapMethod ?? 'Linear'
  };
  const portN = validDims(n) ? n : 2;
  const inputs: XPort[] = [];
  for (let d = 1; d <= portN; d++) inputs.push(port(`k${d}`, 'input'), port(`f${d}`, 'input'));
  return {
    id, type: 'INTERP_PRELOOKUP', params: pr, inputs, outputs: [port('y', 'output')], icon: 'grid',
    equation: 'y = multilinear interpolation of Table at the zero-based indices k1..kn with fractions f1..fn',
    description: 'Interpolation Using Prelookup: interpolates an n-D table with the index and fraction pairs produced by Prelookup blocks.',
    execute: (ins, rp) => {
      const fail = (error: string) => ({ outputs: [0] as XValue[], error });
      const nn = parseDims(rp.NumberOfTableDimensions, 2);
      if (!validDims(nn)) return fail(N_DIMS_MSG);
      const m = methods(rp);
      if (typeof m === 'string') return fail(m);
      const table = asTable(rp.Table, nn);
      const sizes: number[] = [];
      let probe: any = table;
      for (let d = 0; d < nn; d++) {
        if (!Array.isArray(probe) || probe.length < 1) return fail(`Table size does not have ${nn} dimensions`);
        sizes.push(probe.length);
        probe = probe[0];
      }
      const te = validateTable(table, sizes.map(s => new Array(s).fill(0)));
      if (te) return fail(te);
      const kf: LutKF[] = [];
      for (let d = 0; d < nn; d++) {
        const k = scalarInput(ins[2 * d], `k${d + 1}`);
        if (typeof k === 'string') return fail(k);
        const f = scalarInput(ins[2 * d + 1], `f${d + 1}`);
        if (typeof f === 'string') return fail(f);
        if (!Number.isInteger(k) || k < 0 || k > sizes[d] - 1) return fail(`Input k${d + 1} must be an integer index from 0 to ${sizes[d] - 1} (table size ${sizes[d]})`);
        kf.push({ k, f });
      }
      const y = interpolateNd(table as LutTable, kf, m);
      if (!Number.isFinite(y)) return fail('Interpolation result is not finite');
      return { outputs: [y] };
    }
  };
}

export const LOOKUP_FACTORIES: Record<string, (id: string, params: any) => XBlock> = {
  LOOKUP_1D: lookup1d,
  LOOKUP_2D: lookup2d,
  LOOKUP_ND: lookupNdBlock,
  PRELOOKUP: prelookupBlock,
  INTERP_PRELOOKUP: interpPrelookupBlock
};

export const LOOKUP_CATEGORY = {
  name: 'Lookup Tables',
  blocks: [
    { type: 'LOOKUP_1D', label: '1-D Lookup Table', icon: 'grid' },
    { type: 'LOOKUP_2D', label: '2-D Lookup Table', icon: 'grid' },
    { type: 'LOOKUP_ND', label: 'n-D Lookup Table', icon: 'grid' },
    { type: 'PRELOOKUP', label: 'Prelookup', icon: 'grid' },
    { type: 'INTERP_PRELOOKUP', label: 'Interpolation Using Prelookup', icon: 'grid' }
  ]
};
