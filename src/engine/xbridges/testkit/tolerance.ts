export type FloatFormat = 'float64' | 'float32';

const f64 = new Float64Array(1);
const i64 = new BigInt64Array(f64.buffer);
const f32 = new Float32Array(1);
const i32 = new Int32Array(f32.buffer);

/** Monotonic integer key of the IEEE bit pattern; +0 and -0 map to 0. */
function key64(x: number): bigint {
  f64.fill(x);
  const b = i64[0];
  return b < 0n ? -(b & 0x7fffffffffffffffn) : b;
}
function key32(x: number): number {
  f32[0] = x;
  const b = i32[0];
  return b < 0 ? -(b & 0x7fffffff) : b;
}

/** Number of representable values between a and b. NaN -> Infinity. */
export function ulpDistance(a: number, b: number, format: FloatFormat = 'float64'): number {
  if (Number.isNaN(a) || Number.isNaN(b)) return Infinity;
  if (format === 'float32') {
    const x = Math.fround(a), y = Math.fround(b);
    if (x === y) return 0;
    return Math.abs(key32(x) - key32(y));
  }
  if (a === b) return 0;
  const d = key64(a) - key64(b);
  return Number(d < 0n ? -d : d);
}

export interface Tolerance { rel?: number; abs?: number; ulp?: number }

/** True if any given criterion is satisfied. NaN matches only NaN; equal infinities match. */
export function withinTolerance(actual: number, expected: number, tol: Tolerance): boolean {
  if (Number.isNaN(actual) || Number.isNaN(expected)) return Number.isNaN(actual) && Number.isNaN(expected);
  if (actual === expected) return true;
  if (!Number.isFinite(actual) || !Number.isFinite(expected)) return false;
  const diff = Math.abs(actual - expected);
  if (tol.abs !== undefined && diff <= tol.abs) return true;
  if (tol.rel !== undefined && diff <= tol.rel * Math.abs(expected)) return true;
  if (tol.ulp !== undefined && ulpDistance(actual, expected) <= tol.ulp) return true;
  return false;
}
