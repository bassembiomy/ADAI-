/**
 * Correctly rounded sin(x) for the interpreter's time-driven sources (double-double evaluation).
 *
 * V8's Math.sin (fdlibm) is within 1 ULP, glibc's sin used by the generated C is correctly rounded in practice; the
 * wave blocks feed ill-conditioned blocks (acos near 1), so the interpreter must produce the same input value as the
 * generated code. Falls back to Math.sin for non-finite and very large arguments (range reduction would need more
 * constant parts).
 */
type DD = readonly [number, number];

const SPLITTER = 134217729;
const PIO2: readonly [number, number, number] = [1.5707963267948966, 6.123233995736766e-17, -1.4973849048591698e-33];

const twoSum = (a: number, b: number): DD => {
  const s = a + b;
  const bb = s - a;
  return [s, (a - (s - bb)) + (b - bb)];
};
const fastTwoSum = (a: number, b: number): DD => {
  const s = a + b;
  return [s, b - (s - a)];
};
const split = (a: number): DD => {
  const t = SPLITTER * a;
  const hi = t - (t - a);
  return [hi, a - hi];
};
const twoProd = (a: number, b: number): DD => {
  const p = a * b;
  const [ah, al] = split(a);
  const [bh, bl] = split(b);
  return [p, ((ah * bh - p) + ah * bl + al * bh) + al * bl];
};
const ddAdd = (a: DD, b: DD): DD => {
  const [s1, s2] = twoSum(a[0], b[0]);
  const [t1, t2] = twoSum(a[1], b[1]);
  const [u1, u2] = fastTwoSum(s1, s2 + t1);
  return fastTwoSum(u1, u2 + t2);
};
const ddNeg = (a: DD): DD => [-a[0], -a[1]];
const ddMul = (a: DD, b: DD): DD => {
  const [p, e] = twoProd(a[0], b[0]);
  return fastTwoSum(p, e + (a[0] * b[1] + a[1] * b[0]));
};
const ddDivD = (a: DD, b: number): DD => {
  const q1 = a[0] / b;
  const [p, e] = twoProd(q1, b);
  const rest = ddAdd(a, ddNeg([p, e]));
  return fastTwoSum(q1, rest[0] / b);
};

const sinCosSeries = (r: DD, cosine: boolean): DD => {
  const r2neg = ddNeg(ddMul(r, r));
  let term: DD = cosine ? [1, 0] : r;
  let sum: DD = term;
  for (let i = 1; i <= 18; i += 1) {
    const n = cosine ? 2 * i : 2 * i + 1;
    term = ddDivD(ddMul(term, r2neg), n * (n - 1));
    sum = ddAdd(sum, term);
  }
  return sum;
};

export const accurateSin = (x: number): number => {
  if (!Number.isFinite(x) || Math.abs(x) > 1e8) return Math.sin(x);
  if (x === 0) return x;
  const k = Math.round(x / PIO2[0]);
  let r: DD = [x, 0];
  r = ddAdd(r, ddNeg(twoProd(k, PIO2[0])));
  r = ddAdd(r, ddNeg(twoProd(k, PIO2[1])));
  r = ddAdd(r, [-(k * PIO2[2]), 0]);
  const quadrant = ((k % 4) + 4) % 4;
  const value = quadrant === 0 ? sinCosSeries(r, false)
    : quadrant === 1 ? sinCosSeries(r, true)
      : quadrant === 2 ? ddNeg(sinCosSeries(r, false))
        : ddNeg(sinCosSeries(r, true));
  return value[0] + value[1];
};
