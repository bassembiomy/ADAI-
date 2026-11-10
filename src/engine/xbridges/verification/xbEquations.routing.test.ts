/**
 * WP-05 — gate V2/V3 for linear algebra, routing, logic, bitwise and sequential blocks.
 * Plan: docs/superpowers/plans/2026-11-10-xbridges-full-verification.md (sections 2, 3 oracle 1, 4.2).
 *
 * Oracles: hand-computed matrix results; Simulink block semantics (Switch criteria, Multiport Switch one-based
 * control, n-ary XOR = odd parity, non-zero is true, Submatrix one-based indices, edge-triggered flip-flops,
 * counters that wrap). Sequential blocks are driven with the state threaded through execute as the engine does.
 */
import { describe, expect, it } from 'vitest';
import { BLOCK_LIBRARY } from '../BlockDefinitions';

const run = (type: string, params: Record<string, unknown>, inputs: unknown[], t = 0) => {
  const b = BLOCK_LIBRARY[type]('x', params);
  try {
    const r = b.execute(inputs as never, b.params, b.state, t);
    return { y: r.outputs, error: r.error ?? r.diagnostic?.code, threw: null as string | null };
  } catch (e) {
    return { y: [] as unknown[], error: undefined, threw: String((e as Error).message) };
  }
};
const y0 = (type: string, params: Record<string, unknown>, inputs: unknown[]) => run(type, params, inputs).y[0];
/** Drives a sequential block over a list of input vectors, threading its state; returns output 0 per step. */
const sequence = (type: string, params: Record<string, unknown>, steps: unknown[][], port = 0) => {
  const b = BLOCK_LIBRARY[type]('x', params);
  let state = b.state;
  return steps.map((ins, k) => {
    const r = b.execute(ins as never, b.params, state, k * 0.1);
    if (r.nextState !== undefined) state = r.nextState;
    return Number(r.outputs[port]);
  });
};
const near = (a: unknown, e: number[][] | number[] | number, tol = 1e-12) => {
  const flat = (v: unknown): number[] => (Array.isArray(v) ? v.flatMap(flat) : [Number(v)]);
  const A = flat(a); const E = flat(e);
  expect(A.length, `shape of ${JSON.stringify(a)}`).toBe(E.length);
  A.forEach((x, i) => expect(Math.abs(x - E[i]), `element ${i} of ${JSON.stringify(a)}`).toBeLessThan(tol));
};

describe('linear algebra', () => {
  const A = [[1, 2], [3, 4]];
  it('MatrixMul, Transpose, Inverse, Determinant, IdentityMatrix (hand-computed)', () => {
    expect(y0('MatrixMul', {}, [A, [[5, 6], [7, 8]]])).toEqual([[19, 22], [43, 50]]);
    expect(y0('MatrixMul', {}, [[[1, 2, 3]], [[1], [1], [1]]])).toEqual([[6]]);
    expect(y0('Transpose', {}, [[[1, 2, 3], [4, 5, 6]]])).toEqual([[1, 4], [2, 5], [3, 6]]);
    near(y0('Inverse', {}, [[[4, 7], [2, 6]]]), [[0.6, -0.7], [-0.2, 0.4]]);
    near(y0('Determinant', {}, [A]), -2);
    expect(y0('IdentityMatrix', { dim: 3 }, [])).toEqual([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  });
  it('MatrixSolve: A x = b for a well-conditioned system', () => {
    near(y0('MatrixSolve', {}, [[[2, 1], [1, 3]], [3, 5]]), [0.8, 1.4]);
  });
  it.fails('XBV-055: MatrixMul of non-conformable matrices (1x2 * 1x2) is reported by the block, not thrown', () => {
    expect(run('MatrixMul', {}, [[[1, 2]], [[1, 2]]]).threw).toBeNull();
  });
  it.fails('XBV-055: Inverse of a singular matrix is reported by the block, not thrown', () => {
    const r = run('Inverse', {}, [[[1, 2], [2, 4]]]);
    expect(r.threw).toBeNull();
  });
  it.fails('XBV-055: MatrixSolve on a singular, inconsistent system is reported by the block, not thrown', () => {
    const r = run('MatrixSolve', {}, [[[1, 2], [2, 4]], [1, 3]]);
    expect(r.threw).toBeNull();
    expect(Boolean(r.error) || JSON.stringify(r.y).includes('null')).toBe(true);
  });
  it('MatrixConcat: axis 0 stacks rows (Simulink dimension 1), axis 1 stacks columns (dimension 2)', () => {
    expect(y0('MatrixConcat', { axis: 0 }, [[[1, 2]], [[3, 4]]])).toEqual([[1, 2], [3, 4]]);
    expect(y0('MatrixConcat', { axis: 1 }, [[[1], [2]], [[3], [4]]])).toEqual([[1, 3], [2, 4]]);
  });
  it('MatrixDiag: create from a vector, extract from a matrix', () => {
    expect(y0('MatrixDiag', { diagMode: 'create' }, [[1, 2]])).toEqual([[1, 0], [0, 2]]);
    expect(y0('MatrixDiag', { diagMode: 'extract' }, [[[1, 2], [3, 4]]])).toEqual([1, 4]);
  });
  it.fails('XBV-052: SubMatrix uses one-based start/end indices like Simulink Submatrix (rows 2..3, cols 1..2 of a 3x3)', () => {
    const M = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
    expect(y0('SubMatrix', { rowStart: 2, rowEnd: 3, colStart: 1, colEnd: 2 }, [M])).toEqual([[4, 5], [7, 8]]);
  });
});

describe('routing', () => {
  it('Switch: u1 when ctrl >= threshold (default), u2 otherwise; ">" and "~=0" criteria', () => {
    expect(y0('SWITCH', { threshold: 0.5, criteria: '>=' }, [10, 20, 0.5])).toBe(10);
    expect(y0('SWITCH', { threshold: 0.5, criteria: '>=' }, [10, 20, 0.4])).toBe(20);
    expect(y0('SWITCH', { threshold: 0.5, criteria: '>' }, [10, 20, 0.5])).toBe(20);
    expect(y0('SWITCH', { threshold: 0, criteria: '>=' }, [[1, 2], [3, 4], 1])).toEqual([1, 2]);
  });
  // Simulink Switch offers u2 >= Threshold, u2 > Threshold and u2 ~= 0; the canvas offers >, <, >=, <= and the block
  // silently passes u2 for any other criterion.
  it.fails('XBV-054: Switch supports the Simulink criterion "u2 ~= 0"', () => {
    expect(y0('SWITCH', { threshold: 0, criteria: '~=0' }, [10, 20, -3])).toBe(10);
    expect(y0('SWITCH', { threshold: 0, criteria: '~=0' }, [10, 20, 0])).toBe(20);
  });
  it.fails('XBV-053: Mux concatenates a scalar and a vector into one flat vector [1 2 3]', () => {
    expect(y0('MUX', { numInputs: 2 }, [1, [2, 3]])).toEqual([1, 2, 3]);
  });
  it('Mux of scalars and Demux of a vector', () => {
    expect(y0('MUX', { numInputs: 2 }, [1, 2])).toEqual([1, 2]);
    const r = run('DEMUX', { numOutputs: 2 }, [[7, 8]]);
    expect(r.y).toEqual([7, 8]);
  });
  it('If-Else: u_true when cond is non-zero', () => {
    expect(y0('IF_ELSE', {}, [1, 'a', 'b'])).toBe('a');
    expect(y0('IF_ELSE', {}, [-2, 5, 6])).toBe(5);
    expect(y0('IF_ELSE', {}, [0, 5, 6])).toBe(6);
  });
  it('Switch Case (Multiport Switch, one-based control): sel 1 -> in1, sel 2 -> in2', () => {
    expect(y0('SWITCH_CASE', { numCases: 2 }, [1, 11, 22])).toBe(11);
    expect(y0('SWITCH_CASE', { numCases: 2 }, [2, 11, 22])).toBe(22);
  });
});

describe('logic (non-zero is true)', () => {
  const TT = [[0, 0], [0, 1], [1, 0], [1, 1]];
  const truth: Record<string, (a: boolean, b: boolean) => boolean> = {
    AND: (a, b) => a && b, OR: (a, b) => a || b, NAND: (a, b) => !(a && b), NOR: (a, b) => !(a || b), XOR: (a, b) => a !== b,
  };
  for (const [type, f] of Object.entries(truth)) {
    it(`${type}: truth table, and non-zero values (-2.5, 7) count as true`, () => {
      for (const [a, b] of TT) expect(Number(y0(type, {}, [a, b])), `${type}(${a},${b})`).toBe(Number(f(!!a, !!b)));
      expect(Number(y0(type, {}, [-2.5, 7]))).toBe(Number(f(true, true)));
    });
  }
  it('NOT, and three-input AND/OR/XOR (XOR is odd parity)', () => {
    expect(Number(y0('NOT', {}, [0]))).toBe(1);
    expect(Number(y0('NOT', {}, [3]))).toBe(0);
    expect(Number(y0('AND', { numInputs: 3 }, [1, 1, 0]))).toBe(0);
    expect(Number(y0('OR', { numInputs: 3 }, [0, 0, 1]))).toBe(1);
    expect(Number(y0('XOR', { numInputs: 3 }, [1, 1, 1]))).toBe(1);
    expect(Number(y0('XOR', { numInputs: 3 }, [1, 1, 0]))).toBe(0);
  });
});

describe('bitwise', () => {
  it('AND / OR / XOR on 12 and 10; NOT is an involution', () => {
    expect(Number(y0('BitwiseAND', {}, [12, 10]))).toBe(8);
    expect(Number(y0('BitwiseOR', {}, [12, 10]))).toBe(14);
    expect(Number(y0('BitwiseXOR', {}, [12, 10]))).toBe(6);
    expect(Number(y0('BitwiseNOT', {}, [y0('BitwiseNOT', {}, [77])]))).toBe(77);
  });
  it('shifts: 3 << 2 = 12, 16 >> 2 = 4, -16 >> 2 = -4 (arithmetic for signed), shift by 0 is identity', () => {
    expect(Number(y0('ShiftLeft', {}, [3, 2]))).toBe(12);
    expect(Number(y0('ShiftRight', {}, [16, 2]))).toBe(4);
    expect(Number(y0('ShiftRight', {}, [-16, 2]))).toBe(-4);
    expect(Number(y0('ShiftLeft', {}, [5, 0]))).toBe(5);
  });
});

describe('sequential (edge-triggered, state threaded)', () => {
  it('D flip-flop: Q takes D on a rising clock edge only; reset clears Q', () => {
    //               d  clk rst
    const q = sequence('DFlipFlop', {}, [[1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 0], [0, 1, 0], [1, 0, 0], [1, 1, 0], [1, 1, 1]]);
    expect(q).toEqual([0, 1, 1, 1, 0, 0, 1, 0]);
  });
  it('JK flip-flop: set, hold, reset, toggle on rising edges', () => {
    //               j  k  clk rst
    const q = sequence('JKFlipFlop', {}, [[1, 0, 0, 0], [1, 0, 1, 0], [0, 0, 0, 0], [0, 0, 1, 0], [0, 1, 0, 0], [0, 1, 1, 0], [1, 1, 0, 0], [1, 1, 1, 0], [1, 1, 0, 0], [1, 1, 1, 0]]);
    expect(q).toEqual([0, 1, 1, 1, 1, 0, 0, 1, 1, 0]);
  });
  it('Register: loads the input masked to bitWidth on a rising edge when enabled; reset clears it', () => {
    //                                  in  clk en rst
    const r = sequence('Register', { bitWidth: 8 }, [[300, 0, 1, 0], [300, 1, 1, 0], [5, 0, 0, 0], [5, 1, 0, 0], [5, 0, 1, 0], [5, 1, 1, 0], [5, 1, 1, 1]]);
    expect(r).toEqual([0, 300 & 0xff, 44, 44, 44, 5, 0]);
  });
  it('Counter: counts rising edges when enabled and wraps after maxValue to 0; reset clears it', () => {
    const steps: unknown[][] = [];
    for (let k = 0; k < 4; k++) { steps.push([0, 1, 0]); steps.push([1, 1, 0]); } // 4 rising edges
    steps.push([0, 1, 1]);
    expect(sequence('Counter', { maxValue: 2 }, steps)).toEqual([0, 1, 1, 2, 2, 0, 0, 1, 0]);
  });
});
