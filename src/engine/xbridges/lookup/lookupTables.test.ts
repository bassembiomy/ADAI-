// WP-03 acceptance tests (Powertrain plan §2.R): Simulink-equivalent lookup tables.
// Expected values are computed by hand or from functions that multilinear interpolation reproduces exactly.
import { describe, it, expect } from 'vitest';
import { BLOCK_LIBRARY, XBRIDGES_CATEGORIES as CANVAS_CATEGORIES } from '../BlockDefinitions';
import { XBRIDGES_CATEGORIES as HELP_CATEGORIES } from '../../../utils/xbridges/XbridgesLibrary';
import { XbridgesEngine } from '../XbridgesEngine';
import { Solvers } from '../Solvers';
import { validateBreakpoints, prelookup, interpolateNd, lookupNd } from './lookupCore';

const LUT_TYPES = ['LOOKUP_1D', 'LOOKUP_2D', 'LOOKUP_ND', 'PRELOOKUP', 'INTERP_PRELOOKUP'];
const close = (a: number, b: number, tol = 1e-12) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));
const run = (type: string, params: any, ins: any[]) => {
  const b = BLOCK_LIBRARY[type]('t', params);
  return b.execute(ins, b.params, b.state, 0);
};

describe('lookupCore', () => {
  it('validates breakpoints: finite, at least two, strictly increasing', () => {
    expect(validateBreakpoints([0, 1, 2, 4])).toBeNull();
    expect(validateBreakpoints([0, 1, 1, 4])).toMatch(/strictly increasing/);
    expect(validateBreakpoints([0, 2, 1])).toMatch(/strictly increasing/);
    expect(validateBreakpoints([3])).toMatch(/at least two/);
    expect(validateBreakpoints([0, NaN])).toMatch(/finite/);
  });

  it('prelookup returns zero-based index and fraction with Simulink clip / linear / last-breakpoint rules', () => {
    const bp = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110];
    expect(prelookup(bp, 35, { extrap: 'clip' })).toEqual({ k: 2, f: 0.5 });
    expect(prelookup(bp, 10, { extrap: 'clip' })).toEqual({ k: 0, f: 0 });
    expect(prelookup(bp, 5, { extrap: 'clip' })).toEqual({ k: 0, f: 0 });
    expect(prelookup(bp, 5, { extrap: 'linear' })).toEqual({ k: 0, f: -0.5 });
    expect(prelookup(bp, 110, { extrap: 'clip' })).toEqual({ k: 9, f: 1 });
    expect(prelookup(bp, 110, { extrap: 'clip', useLastBreakpoint: true })).toEqual({ k: 10, f: 0 });
    expect(prelookup(bp, 120, { extrap: 'clip' })).toEqual({ k: 9, f: 1 });
    expect(prelookup(bp, 120, { extrap: 'linear' })).toEqual({ k: 9, f: 2 });
    expect(prelookup(bp, 40, { extrap: 'linear' })).toEqual({ k: 3, f: 0 });
  });

  it('1-D linear interpolation and extrapolation, flat and nearest', () => {
    const bp = [0, 1, 2, 4];
    const T = [0, 10, 15, 40];
    const lin = { interp: 'linear', extrap: 'linear' } as const;
    const clip = { interp: 'linear', extrap: 'clip' } as const;
    close(lookupNd(T, [bp], [3], lin), 27.5);
    close(lookupNd(T, [bp], [-1], lin), -10);
    close(lookupNd(T, [bp], [5], lin), 52.5);
    close(lookupNd(T, [bp], [-1], clip), 0);
    close(lookupNd(T, [bp], [5], clip), 40);
    close(lookupNd(T, [bp], [4], clip), 40);
    const flat = { interp: 'flat', extrap: 'clip' } as const;
    expect(lookupNd(T, [bp], [1.5], flat)).toBe(10);
    expect(lookupNd(T, [bp], [2], flat)).toBe(15);
    expect(lookupNd(T, [bp], [3.99], flat)).toBe(15);
    expect(lookupNd(T, [bp], [4], flat)).toBe(40);
    expect(lookupNd(T, [bp], [10], flat)).toBe(40);
    expect(lookupNd(T, [bp], [-3], flat)).toBe(0);
    const nearest = { interp: 'nearest', extrap: 'clip' } as const;
    expect(lookupNd(T, [bp], [1.4], nearest)).toBe(10);
    expect(lookupNd(T, [bp], [2.9], nearest)).toBe(15);
    expect(lookupNd(T, [bp], [3.1], nearest)).toBe(40);
  });

  it('2-D bilinear interpolation is exact for f = x*y, inside and with linear extrapolation', () => {
    const bx = [0, 1, 3, 7];
    const by = [-2, 0.5, 4];
    const T = bx.map(x => by.map(y => x * y));
    const lin = { interp: 'linear', extrap: 'linear' } as const;
    for (const [x, y] of [[0.5, 0], [2, 1], [6.5, 3.9], [3, 0.5]]) close(lookupNd(T, [bx, by], [x, y], lin), x * y);
    // Extrapolation extends the edge cell's bilinear patch, which is exact for x*y as well.
    for (const [x, y] of [[-1, -3], [8, 5], [10, 1]]) close(lookupNd(T, [bx, by], [x, y], lin), x * y);
    // Clip clamps each coordinate to its breakpoint range.
    close(lookupNd(T, [bx, by], [10, 5], { interp: 'linear', extrap: 'clip' }), 7 * 4);
    close(lookupNd(T, [bx, by], [-1, 1], { interp: 'linear', extrap: 'clip' }), 0);
  });

  it('3-D and 4-D multilinear lookup reproduces an affine function everywhere with linear extrapolation', () => {
    const f3 = (x: number, y: number, z: number) => 1 + 2 * x - 3 * y + 4 * z;
    const b1 = [0, 1, 2.5], b2 = [-1, 1], b3 = [0, 2, 3, 10];
    const T3 = b1.map(x => b2.map(y => b3.map(z => f3(x, y, z))));
    const lin = { interp: 'linear', extrap: 'linear' } as const;
    for (const p of [[0.3, 0, 1], [2.5, 1, 10], [-1, 2, -4], [4, -3, 11]]) close(lookupNd(T3, [b1, b2, b3], p, lin), f3(p[0], p[1], p[2]), 1e-11);
    close(lookupNd(T3, [b1, b2, b3], [4, -3, 11], { interp: 'linear', extrap: 'clip' }), f3(2.5, -1, 10), 1e-11);
    const f4 = (a: number, b: number, c: number, d: number) => 0.5 * a + b - 2 * c + 7 * d - 1;
    const c1 = [0, 1], c2 = [0, 2, 5], c3 = [1, 3], c4 = [-1, 0, 1];
    const T4 = c1.map(a => c2.map(b => c3.map(c => c4.map(d => f4(a, b, c, d)))));
    close(lookupNd(T4, [c1, c2, c3, c4], [0.25, 4, 2, 0.5], lin), f4(0.25, 4, 2, 0.5), 1e-11);
    close(lookupNd(T4, [c1, c2, c3, c4], [2, -1, 0, 3], lin), f4(2, -1, 0, 3), 1e-11);
  });

  it('interpolateNd uses (k, f) pairs, including the last-breakpoint form k = N-1, f = 0', () => {
    const T = [0, 10, 15, 40];
    close(interpolateNd(T, [{ k: 2, f: 0.5 }], { interp: 'linear', extrap: 'clip' }), 27.5);
    close(interpolateNd(T, [{ k: 3, f: 0 }], { interp: 'linear', extrap: 'clip' }), 40);
    close(interpolateNd(T, [{ k: 2, f: 1 }], { interp: 'linear', extrap: 'clip' }), 40);
    close(interpolateNd(T, [{ k: 2, f: 1.5 }], { interp: 'linear', extrap: 'clip' }), 40);
    close(interpolateNd(T, [{ k: 2, f: 1.5 }], { interp: 'linear', extrap: 'linear' }), 52.5);
    close(interpolateNd(T, [{ k: 0, f: -1 }], { interp: 'linear', extrap: 'linear' }), -10);
  });
});

describe('lookup blocks (Simulink parameter names, ports and defaults)', () => {
  it('LOOKUP_1D: Simulink defaults Table = tanh(-5:5), breakpoints -5:5, Linear point-slope, Linear extrapolation', () => {
    const b = BLOCK_LIBRARY.LOOKUP_1D('l1', {});
    expect(b.inputs.map(p => p.id)).toEqual(['u1']);
    expect(b.outputs.map(p => p.id)).toEqual(['y']);
    expect(b.params.InterpMethod).toBe('Linear point-slope');
    expect(b.params.ExtrapMethod).toBe('Linear');
    const bp = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
    expect(b.params.BreakpointsForDimension1).toEqual(bp);
    bp.forEach((x, i) => close(b.params.Table[i], Math.tanh(x)));
    const y = b.execute([0.5], b.params, b.state, 0).outputs[0] as number;
    close(y, 0.5 * Math.tanh(1));
    const y2 = b.execute([6], b.params, b.state, 0).outputs[0] as number;
    close(y2, Math.tanh(5) + (Math.tanh(5) - Math.tanh(4)));
  });

  it('LOOKUP_1D accepts MATLAB text for table and breakpoints and every interpolation option', () => {
    const p = { Table: '[0 10 15 40]', BreakpointsForDimension1: '[0 1 2 4]' };
    close(run('LOOKUP_1D', { ...p, InterpMethod: 'Linear point-slope', ExtrapMethod: 'Clip' }, [5]).outputs[0] as number, 40);
    close(run('LOOKUP_1D', { ...p, InterpMethod: 'Linear Lagrange', ExtrapMethod: 'Linear' }, [3]).outputs[0] as number, 27.5);
    expect(run('LOOKUP_1D', { ...p, InterpMethod: 'Flat', ExtrapMethod: 'Clip' }, [1.5]).outputs[0]).toBe(10);
    expect(run('LOOKUP_1D', { ...p, InterpMethod: 'Nearest', ExtrapMethod: 'Clip' }, [3.1]).outputs[0]).toBe(40);
  });

  it('LOOKUP_2D: Simulink defaults and row/column order (u1 selects rows, u2 columns)', () => {
    const b = BLOCK_LIBRARY.LOOKUP_2D('l2', {});
    expect(b.inputs.map(p => p.id)).toEqual(['u1', 'u2']);
    expect(b.outputs.map(p => p.id)).toEqual(['y']);
    expect(b.params.Table).toEqual([[4, 5, 6], [16, 19, 20], [10, 18, 23]]);
    expect(b.params.BreakpointsForDimension1).toEqual([1, 2, 3]);
    expect(b.params.BreakpointsForDimension2).toEqual([4, 5, 6]);
    close(b.execute([1.5, 5.5], b.params, b.state, 0).outputs[0] as number, (5 + 6 + 19 + 20) / 4);
    close(b.execute([1, 6], b.params, b.state, 0).outputs[0] as number, 6);
    close(b.execute([3, 4], b.params, b.state, 0).outputs[0] as number, 10);
    close(b.execute([0, 4], b.params, b.state, 0).outputs[0] as number, 2 * 4 - 16);
    close(run('LOOKUP_2D', { ExtrapMethod: 'Clip' }, [0, 7]).outputs[0] as number, 6);
    close(run('LOOKUP_2D', { Table: '[4 5 6;16 19 20;10 18 23]' }, [2, 5]).outputs[0] as number, 19);
  });

  it('LOOKUP_ND: one input port per NumberOfTableDimensions (1..4)', () => {
    for (const n of [1, 2, 3, 4]) {
      const b = BLOCK_LIBRARY.LOOKUP_ND('ln', { NumberOfTableDimensions: n });
      expect(b.inputs.map(p => p.id)).toEqual(Array.from({ length: n }, (_, i) => `u${i + 1}`));
      expect(b.outputs.map(p => p.id)).toEqual(['y']);
    }
    const f3 = (x: number, y: number, z: number) => x + 10 * y + 100 * z;
    const b1 = [0, 1], b2 = [0, 1, 2], b3 = [0, 5];
    const params = {
      NumberOfTableDimensions: 3, InterpMethod: 'Linear point-slope', ExtrapMethod: 'Linear',
      Table: b1.map(x => b2.map(y => b3.map(z => f3(x, y, z)))),
      BreakpointsForDimension1: b1, BreakpointsForDimension2: b2, BreakpointsForDimension3: b3
    };
    close(run('LOOKUP_ND', params, [0.5, 1.5, 2]).outputs[0] as number, f3(0.5, 1.5, 2), 1e-11);
  });

  it('PRELOOKUP outputs k and f; Index only outputs k', () => {
    const b = BLOCK_LIBRARY.PRELOOKUP('p', { BreakpointsData: [10, 20, 30, 40], ExtrapMethod: 'Clip' });
    expect(b.inputs.map(p => p.id)).toEqual(['u']);
    expect(b.outputs.map(p => p.id)).toEqual(['k', 'f']);
    expect(b.execute([25], b.params, b.state, 0).outputs).toEqual([1, 0.5]);
    expect(b.execute([40], b.params, b.state, 0).outputs).toEqual([2, 1]);
    expect(run('PRELOOKUP', { BreakpointsData: [10, 20, 30, 40], ExtrapMethod: 'Clip', UseLastBreakpoint: 'on' }, [40]).outputs).toEqual([3, 0]);
    expect(run('PRELOOKUP', { BreakpointsData: [10, 20, 30, 40], ExtrapMethod: 'Linear' }, [0]).outputs).toEqual([0, -1]);
    const only = BLOCK_LIBRARY.PRELOOKUP('p2', { BreakpointsData: [10, 20, 30, 40], OutputSelection: 'Index only' });
    expect(only.outputs.map(p => p.id)).toEqual(['k']);
  });

  it('INTERP_PRELOOKUP takes k1, f1, k2, f2 ... in Simulink port order', () => {
    const b = BLOCK_LIBRARY.INTERP_PRELOOKUP('ip', { NumberOfTableDimensions: 2, Table: [[1, 2], [3, 4]], ExtrapMethod: 'Clip' });
    expect(b.inputs.map(p => p.id)).toEqual(['k1', 'f1', 'k2', 'f2']);
    expect(b.outputs.map(p => p.id)).toEqual(['y']);
    close(b.execute([0, 0.5, 0, 0.5], b.params, b.state, 0).outputs[0] as number, 2.5);
    close(b.execute([1, 0, 0, 1], b.params, b.state, 0).outputs[0] as number, 4);
  });

  it('reports invalid parameters as a block error instead of a silent value', () => {
    const p = { Table: [0, 10, 15, 40], BreakpointsForDimension1: [0, 1, 2, 4] };
    expect(run('LOOKUP_1D', { ...p, BreakpointsForDimension1: [0, 2, 1, 4] }, [1]).error).toMatch(/strictly increasing/);
    expect(run('LOOKUP_1D', { ...p, Table: [0, 10, 15] }, [1]).error).toMatch(/size/i);
    expect(run('LOOKUP_1D', { ...p, InterpMethod: 'Flat', ExtrapMethod: 'Linear' }, [1]).error).toMatch(/Clip/);
    expect(run('LOOKUP_1D', { ...p, InterpMethod: 'Cubic spline' }, [1]).error).toMatch(/not supported/i);
    expect(run('LOOKUP_1D', p, [NaN]).error).toMatch(/finite/i);
    expect(run('LOOKUP_2D', { Table: [[1, 2], [3, 4]], BreakpointsForDimension1: [0, 1], BreakpointsForDimension2: [0, 1, 2] }, [0, 0]).error).toMatch(/size/i);
    expect(run('LOOKUP_ND', { NumberOfTableDimensions: 5 }, [0, 0, 0, 0, 0]).error).toMatch(/1.*4/);
    for (const r of [
      run('LOOKUP_1D', { ...p, BreakpointsForDimension1: [0, 2, 1, 4] }, [1]),
      run('LOOKUP_1D', p, [NaN])
    ]) for (const v of r.outputs) expect(Number.isNaN(v as number)).toBe(false);
  });
});

describe('lookup blocks in the X-Bridges engine', () => {
  it('Constant -> LOOKUP_2D gives the bilinear value after a fixed-step run', () => {
    const blocks = [
      BLOCK_LIBRARY.Constant('c1', { value: 1.5 }),
      BLOCK_LIBRARY.Constant('c2', { value: 5.5 }),
      BLOCK_LIBRARY.LOOKUP_2D('lut', {})
    ];
    const engine = new XbridgesEngine({ blocks, connections: [
      { sourceBlock: 'c1', sourcePort: 'out', targetBlock: 'lut', targetPort: 'u1' },
      { sourceBlock: 'c2', sourcePort: 'out', targetBlock: 'lut', targetPort: 'u2' }
    ] } as any);
    Solvers.runFixedStep(engine, { solver: 'ode4', startTime: 0, stopTime: 0.05, fixedStep: 0.01 } as any);
    close(engine.getSignalValue('lut', 'y'), 12.5);
  });

  it('a ramp through LOOKUP_1D follows the table at every step, including linear extrapolation', () => {
    const table = { Table: [0, 10, 15, 40], BreakpointsForDimension1: [0, 1, 2, 4], ExtrapMethod: 'Linear' };
    const ref = (u: number) => u < 1 ? 10 * u : u < 2 ? 10 + 5 * (u - 1) : 15 + 12.5 * (u - 2);
    const blocks = [
      BLOCK_LIBRARY.Constant('one', { value: 1 }),
      BLOCK_LIBRARY.Integrator('ramp', { initialCondition: -1 }),
      BLOCK_LIBRARY.LOOKUP_1D('lut', table)
    ];
    const engine = new XbridgesEngine({ blocks, connections: [
      { sourceBlock: 'one', sourcePort: 'out', targetBlock: 'ramp', targetPort: 'in' },
      { sourceBlock: 'ramp', sourcePort: 'out', targetBlock: 'lut', targetPort: 'u1' }
    ] } as any);
    for (const stop of [0.5, 1.7, 3.2, 6]) {
      Solvers.runFixedStep(engine, { solver: 'ode4', startTime: 0, stopTime: stop, fixedStep: 0.01 } as any);
      const u = engine.getSignalValue('ramp', 'out') as number;
      close(engine.getSignalValue('lut', 'y') as number, ref(u), 1e-9);
    }
  });

  it('PRELOOKUP x2 -> INTERP_PRELOOKUP equals LOOKUP_2D on the same table', () => {
    const T = [[4, 5, 6], [16, 19, 20], [10, 18, 23]];
    const blocks = [
      BLOCK_LIBRARY.Constant('c1', { value: 2.25 }),
      BLOCK_LIBRARY.Constant('c2', { value: 4.75 }),
      BLOCK_LIBRARY.PRELOOKUP('p1', { BreakpointsData: [1, 2, 3], ExtrapMethod: 'Clip' }),
      BLOCK_LIBRARY.PRELOOKUP('p2', { BreakpointsData: [4, 5, 6], ExtrapMethod: 'Clip' }),
      BLOCK_LIBRARY.INTERP_PRELOOKUP('ip', { NumberOfTableDimensions: 2, Table: T, ExtrapMethod: 'Clip' }),
      BLOCK_LIBRARY.LOOKUP_2D('lut', { Table: T, ExtrapMethod: 'Clip' })
    ];
    const c = (s: string, sp: string, t: string, tp: string) => ({ sourceBlock: s, sourcePort: sp, targetBlock: t, targetPort: tp });
    const engine = new XbridgesEngine({ blocks, connections: [
      c('c1', 'out', 'p1', 'u'), c('c2', 'out', 'p2', 'u'),
      c('p1', 'k', 'ip', 'k1'), c('p1', 'f', 'ip', 'f1'), c('p2', 'k', 'ip', 'k2'), c('p2', 'f', 'ip', 'f2'),
      c('c1', 'out', 'lut', 'u1'), c('c2', 'out', 'lut', 'u2')
    ] } as any);
    Solvers.runFixedStep(engine, { solver: 'ode4', startTime: 0, stopTime: 0.02, fixedStep: 0.01 } as any);
    const expected = 16 + 0.25 * (10 - 16) + 0.75 * (19 - 16) + 0.25 * 0.75 * (18 - 10 - 19 + 16);
    close(engine.getSignalValue('ip', 'y') as number, expected);
    close(engine.getSignalValue('lut', 'y') as number, expected);
  });

  it('an invalid table surfaces as a BLOCK_RUNTIME_FAULT diagnostic', () => {
    const blocks = [
      BLOCK_LIBRARY.Constant('c1', { value: 1 }),
      BLOCK_LIBRARY.LOOKUP_1D('lut', { Table: [1, 2, 3], BreakpointsForDimension1: [0, 0, 1] })
    ];
    const engine = new XbridgesEngine({ blocks, connections: [
      { sourceBlock: 'c1', sourcePort: 'out', targetBlock: 'lut', targetPort: 'u1' }
    ] } as any);
    Solvers.runFixedStep(engine, { solver: 'ode4', startTime: 0, stopTime: 0.02, fixedStep: 0.01 } as any);
    expect(engine.diagnostics.some(d => d.code === 'BLOCK_RUNTIME_FAULT' && d.blockIds?.includes('lut'))).toBe(true);
  });
});

describe('lookup blocks in both palettes', () => {
  it('a "Lookup Tables" category lists the five blocks on the canvas palette and the help/AI palette', () => {
    for (const cats of [CANVAS_CATEGORIES, HELP_CATEGORIES]) {
      const cat = cats.find(c => c.name === 'Lookup Tables');
      expect(cat, 'Lookup Tables category').toBeDefined();
      expect(cat!.blocks.map(b => b.type)).toEqual(LUT_TYPES);
    }
  });
});
