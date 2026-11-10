export type OdeFn = (t: number, x: number[]) => number[];

function rk4(f: OdeFn, x0: number[], t0: number, t1: number, n: number): number[] {
  const h = (t1 - t0) / n;
  let x = x0.slice();
  const add = (a: number[], b: number[], s: number) => a.map((v, i) => v + s * b[i]);
  for (let k = 0; k < n; k++) {
    const t = t0 + k * h;
    const k1 = f(t, x);
    const k2 = f(t + h / 2, add(x, k1, h / 2));
    const k3 = f(t + h / 2, add(x, k2, h / 2));
    const k4 = f(t + h, add(x, k3, h));
    x = x.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
  }
  return x;
}

/** Classical RK4 with N and 2N steps and one Richardson extrapolation (oracle 4). */
export function referenceIntegrate(f: OdeFn, x0: number[], t0: number, t1: number, opts: { steps?: number } = {}): number[] {
  const n = opts.steps ?? 2000;
  if (!Number.isInteger(n) || n < 1) throw new Error(`referenceIntegrate: invalid steps ${n}`);
  const a = rk4(f, x0, t0, t1, n);
  const b = rk4(f, x0, t0, t1, 2 * n);
  return b.map((v, i) => v + (v - a[i]) / 15);
}
