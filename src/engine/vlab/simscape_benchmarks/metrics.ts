export type Series = ArrayLike<number>;

export interface MetricSet {
  nrmse: number;
  maxAbs: number;
  finalValueErrPct: number;
  peak: number;
  peakGolden: number;
  overshootPct: number;
  settlingTime: number;
  settlingTimeGolden: number;
  dominantFreq: number;
  dominantFreqGolden: number;
}

export function range(y: Series): number {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < y.length; i++) {
    if (y[i] < lo) lo = y[i];
    if (y[i] > hi) hi = y[i];
  }
  return hi - lo;
}

/** RMS error normalised by the golden range. Falls back to max|golden| (then 1) for flat signals. */
export function nrmse(y: Series, golden: Series): number {
  const n = Math.min(y.length, golden.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += (y[i] - golden[i]) ** 2;
  let norm = range(golden);
  if (!(norm > 0)) {
    norm = 0;
    for (let i = 0; i < golden.length; i++) norm = Math.max(norm, Math.abs(golden[i]));
    if (!(norm > 0)) norm = 1;
  }
  return Math.sqrt(s / Math.max(n, 1)) / norm;
}

export function maxAbs(y: Series, golden: Series): number {
  const n = Math.min(y.length, golden.length);
  let m = 0;
  for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(y[i] - golden[i]));
  return m;
}

/** Final value error in percent of |golden final| (absolute percent of golden range if the final value is ~0). */
export function finalValueErrPct(y: Series, golden: Series): number {
  const yf = y[y.length - 1];
  const gf = golden[golden.length - 1];
  const denom = Math.abs(gf) > 1e-12 ? Math.abs(gf) : range(golden) || 1;
  return (Math.abs(yf - gf) / denom) * 100;
}

export function peak(y: Series): number {
  let m = -Infinity;
  for (let i = 0; i < y.length; i++) m = Math.max(m, Math.abs(y[i]));
  return m;
}

/** Overshoot above the final value as percent of the step size |final - initial|. */
export function overshootPct(y: Series): number {
  const y0 = y[0];
  const yf = y[y.length - 1];
  const step = yf - y0;
  if (Math.abs(step) < 1e-12) return 0;
  const dir = Math.sign(step);
  let ext = 0;
  for (let i = 0; i < y.length; i++) ext = Math.max(ext, (y[i] - yf) * dir);
  return (ext / Math.abs(step)) * 100;
}

/** Last time the signal is outside +/- band of its final value (band = 2% of |final - initial|). Returns t[0] if never. */
export function settlingTime(t: Series, y: Series, band = 0.02): number {
  const yf = y[y.length - 1];
  const step = Math.abs(yf - y[0]);
  const tol = band * (step > 1e-12 ? step : Math.max(Math.abs(yf), 1e-12));
  for (let i = y.length - 1; i >= 0; i--) {
    if (Math.abs(y[i] - yf) > tol) return i + 1 < t.length ? t[i + 1] : t[t.length - 1];
  }
  return t[0];
}

/** Times at which y crosses `level` (linear interpolation). direction: 1 rising, -1 falling, 0 both. */
export function eventTimes(t: Series, y: Series, level: number, direction: -1 | 0 | 1 = 0): number[] {
  const out: number[] = [];
  for (let i = 1; i < y.length; i++) {
    const a = y[i - 1] - level;
    const b = y[i] - level;
    const rising = a < 0 && b >= 0;
    const falling = a > 0 && b <= 0;
    if ((rising && direction >= 0) || (falling && direction <= 0)) {
      const f = a === b ? 0 : a / (a - b);
      out.push(t[i - 1] + f * (t[i] - t[i - 1]));
    }
  }
  return out;
}

/** Dominant frequency (Hz) from mean-crossings: (N crossings - 1) / 2 / (t_last - t_first). 0 if < 3 crossings. */
export function dominantFrequency(t: Series, y: Series): number {
  let mean = 0;
  for (let i = 0; i < y.length; i++) mean += y[i];
  mean /= y.length || 1;
  const c = eventTimes(t, y, mean, 0);
  if (c.length < 3) return 0;
  return (c.length - 1) / 2 / (c[c.length - 1] - c[0]);
}

/** Linear interpolation of (t, y) onto grid `tq`; clamps outside the range. */
export function resample(t: Series, y: Series, tq: Series): number[] {
  const out: number[] = new Array(tq.length);
  let j = 0;
  for (let i = 0; i < tq.length; i++) {
    const x = tq[i];
    if (x <= t[0]) { out[i] = y[0]; continue; }
    if (x >= t[t.length - 1]) { out[i] = y[y.length - 1]; continue; }
    while (j < t.length - 2 && t[j + 1] < x) j++;
    const f = (x - t[j]) / (t[j + 1] - t[j]);
    out[i] = y[j] + f * (y[j + 1] - y[j]);
  }
  return out;
}

export function computeMetrics(t: Series, y: Series, golden: Series): MetricSet {
  return {
    nrmse: nrmse(y, golden),
    maxAbs: maxAbs(y, golden),
    finalValueErrPct: finalValueErrPct(y, golden),
    peak: peak(y),
    peakGolden: peak(golden),
    overshootPct: overshootPct(y) - overshootPct(golden),
    settlingTime: settlingTime(t, y),
    settlingTimeGolden: settlingTime(t, golden),
    dominantFreq: dominantFrequency(t, y),
    dominantFreqGolden: dominantFrequency(t, golden),
  };
}

export function formatMetricTable(signal: string, m: MetricSet): string {
  const f = (v: number) => (Number.isFinite(v) ? v.toPrecision(5) : String(v));
  return [
    `signal ${signal}`,
    `  nrmse            ${f(m.nrmse * 100)} %`,
    `  maxAbs           ${f(m.maxAbs)}`,
    `  finalValueErr    ${f(m.finalValueErrPct)} %`,
    `  peak / golden    ${f(m.peak)} / ${f(m.peakGolden)}`,
    `  overshoot delta  ${f(m.overshootPct)} %`,
    `  settling / gold  ${f(m.settlingTime)} / ${f(m.settlingTimeGolden)} s`,
    `  freq / golden    ${f(m.dominantFreq)} / ${f(m.dominantFreqGolden)} Hz`,
  ].join('\n');
}
