import * as fs from 'node:fs';
import * as path from 'node:path';
import { SimulationHarness } from '../whitebox_benchmarks/boundary_generator/SimulationHarness';
import type { VLabTestBoundary } from '../whitebox_benchmarks/boundary_generator/types';
import { resample } from './metrics';
import type { ToleranceClass } from './tolerances';

export const BENCH_ROOT = path.resolve(__dirname, '../../../../benchmarks/simscape');

export interface CaseSignal {
  name: string;
  unit: string;
  vlabProbe: { nodeId: string; handle: string; variableName?: string };
}
export interface CaseSpec {
  id: string;
  class: ToleranceClass;
  stopTime: number;
  signals: CaseSignal[];
  /** V-Lab step (s) and golden/analytic grid spacing; default 0.001 */
  dt?: number;
  analytic?:
    | { type: 'first_order_step'; final: number; tau: number }
    /** series RLC driven by a DC step V through R, L into C (underdamped): the closed form of the capacitor voltage */
    | { type: 'rlc_series_underdamped'; V: number; R: number; L: number; C: number }
    /** half-wave rectifier, ideal source Vpk sin(2 pi f t) -> piecewise-linear diode (Vf, Ron, Roff) -> load R: load voltage */
    | { type: 'halfwave_rectifier_pwl'; Vpk: number; f: number; Vf: number; Ron: number; Roff: number; R: number }
    /**
     * DC motor driven by a voltage step V into a rotor of total inertia J and total viscous damping B (motor + load + damper):
     * La di/dt = V - Ra i - k w,  J dw/dt = k i - B w,  i(0) = w(0) = 0 -> closed form of the shaft speed w(t) (WP-12a).
     */
    | { type: 'dc_motor_load_step'; V: number; Ra: number; La: number; k: number; J: number; B: number }
    /**
     * Buck converter in continuous conduction, state-space averaged (Erickson ch. 7): the cycle-average output voltage is the step response of
     * D Vin / (L C s^2 + (L/R + C Rs) s + 1 + Rs/R) with Rs = D Ron_switch + (1 - D) Ron_diode, from v(0) = i(0) = 0 (WP-12b).
     */
    | { type: 'buck_converter_averaged'; Vin: number; D: number; L: number; C: number; R: number; Rs: number }
    /** force step F on a mass m with a spring k and a damper b to the reference: position of m x'' + b x' + k x = F, x(0) = x'(0) = 0 (WP-13) */
    | { type: 'mass_spring_damper_step'; F: number; m: number; k: number; b: number };
}

/** Closed-form reference of `spec.analytic` at time t. */
export function analyticValue(a: NonNullable<CaseSpec['analytic']>, t: number): number {
  if (a.type === 'first_order_step') return a.final * (1 - Math.exp(-t / a.tau));
  if (a.type === 'halfwave_rectifier_pwl') {
    // Series loop vs = vD + i R with the Simscape piecewise-linear diode: off i = vD/Roff, on i = (vD - Vf)/Ron + Vf/Roff.
    const vs = a.Vpk * Math.sin(2 * Math.PI * a.f * t);
    const iOn = (vs - a.Vf + (a.Ron * a.Vf) / a.Roff) / (a.R + a.Ron); // on-branch loop solution
    const vdOn = vs - iOn * a.R;
    if (vdOn > a.Vf) return iOn * a.R;
    return (vs / (a.R + a.Roff)) * a.R; // off-branch loop solution
  }
  if (a.type === 'dc_motor_load_step') {
    // s^2 + (Ra/La + B/J) s + (Ra B + k^2)/(La J) = 0, w(0) = 0, w'(0) = k i(0)/J = 0, w(inf) = k V/(Ra B + k^2)
    const wss = (a.k * a.V) / (a.Ra * a.B + a.k * a.k);
    const sum = a.Ra / a.La + a.B / a.J;
    const prod = (a.Ra * a.B + a.k * a.k) / (a.La * a.J);
    const disc = sum * sum - 4 * prod;
    if (disc >= 0) {
      const s1 = (-sum + Math.sqrt(disc)) / 2, s2 = (-sum - Math.sqrt(disc)) / 2;
      return wss * (1 - (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t)) / (s2 - s1));
    }
    const al = sum / 2, bw = Math.sqrt(-disc) / 2;
    return wss * (1 - Math.exp(-al * t) * (Math.cos(bw * t) + (al / bw) * Math.sin(bw * t)));
  }
  if (a.type === 'mass_spring_damper_step') {
    // wn = sqrt(k/m), zeta = b / (2 sqrt(k m)); x(t) = (F/k) [1 - e^(-zeta wn t) (cos wd t + zeta / sqrt(1 - zeta^2) sin wd t)] (zeta < 1)
    const wn = Math.sqrt(a.k / a.m), z = a.b / (2 * Math.sqrt(a.k * a.m)), xss = a.F / a.k;
    if (z < 1) {
      const wd = wn * Math.sqrt(1 - z * z);
      return xss * (1 - Math.exp(-z * wn * t) * (Math.cos(wd * t) + (z / Math.sqrt(1 - z * z)) * Math.sin(wd * t)));
    }
    const r = wn * Math.sqrt(z * z - 1), s1 = -z * wn + r, s2 = -z * wn - r;
    return xss * (1 - (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t)) / (s2 - s1));
  }
  if (a.type === 'buck_converter_averaged') {
    const a2 = a.L * a.C, a1 = a.L / a.R + a.C * a.Rs, a0 = 1 + a.Rs / a.R;
    const vf = (a.D * a.Vin) / a0, al = a1 / (2 * a2), w02 = a0 / a2, disc = al * al - w02;
    if (disc > 0) {
      const r = Math.sqrt(disc), s1 = -al + r, s2 = -al - r;
      return vf * (1 - (s2 * Math.exp(s1 * t) - s1 * Math.exp(s2 * t)) / (s2 - s1));
    }
    const wd = Math.sqrt(-disc);
    return vf * (1 - Math.exp(-al * t) * (Math.cos(wd * t) + (al / wd) * Math.sin(wd * t)));
  }
  // vC(t) = V [1 - e^(-alpha t) (cos wd t + (alpha/wd) sin wd t)], alpha = R/2L, wd = sqrt(1/LC - alpha^2)
  const alpha = a.R / (2 * a.L);
  const wd = Math.sqrt(1 / (a.L * a.C) - alpha * alpha);
  return a.V * (1 - Math.exp(-alpha * t) * (Math.cos(wd * t) + (alpha / wd) * Math.sin(wd * t)));
}
export interface Golden {
  time: number[];
  signals: Record<string, number[]>;
}

export function listCases(): string[] {
  const dir = path.join(BENCH_ROOT, 'cases');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(dir, d.name, 'case.json')))
    .map((d) => d.name);
}

export function loadCase(id: string): CaseSpec {
  return JSON.parse(fs.readFileSync(path.join(BENCH_ROOT, 'cases', id, 'case.json'), 'utf8'));
}

export function loadGolden(id: string): Golden | null {
  const p = path.join(BENCH_ROOT, 'golden', `${id}.csv`);
  if (!fs.existsSync(p)) return null;
  const lines = fs.readFileSync(p, 'utf8').trim().split(/\r?\n/);
  const header = lines[0].split(',').map((s) => s.trim());
  const cols = header.map(() => [] as number[]);
  for (let i = 1; i < lines.length; i++) lines[i].split(',').forEach((v, k) => cols[k].push(Number(v)));
  const signals: Record<string, number[]> = {};
  header.forEach((h, k) => { if (k > 0) signals[h] = cols[k]; });
  return { time: cols[0], signals };
}

/** Simulates vlab_model.json with the worker's engine path and resamples onto `grid` (linear). */
export function runCase(id: string, grid: number[], dtOverride?: number): Record<string, number[]> {
  const spec = loadCase(id);
  const dt = dtOverride ?? spec.dt ?? 0.001;
  const model = JSON.parse(fs.readFileSync(path.join(BENCH_ROOT, 'cases', id, 'vlab_model.json'), 'utf8'));
  const boundary: VLabTestBoundary = {
    id,
    name: id,
    domain: 'electrical',
    dt,
    totalTime: spec.stopTime,
    excitation: { type: 'constant', sourceNodeId: '', amplitude: 0 },
    nodes: model.nodes,
    edges: model.edges,
    probes: spec.signals.map((s, i) => ({
      id: `p${i}`,
      sourceNodeId: s.vlabProbe.nodeId,
      sourceHandle: s.vlabProbe.handle,
      variableName: s.vlabProbe.variableName ?? s.name,
      unit: s.unit,
    })),
  } as VLabTestBoundary;
  const traj = SimulationHarness.runBoundarySimulation(boundary);
  // Harness samples at (k+1)*dt; prepend t=0 with the first sample's initial value of 0 state.
  const t = [0, ...traj.time];
  const out: Record<string, number[]> = {};
  for (const s of spec.signals) {
    const name = s.vlabProbe.variableName ?? s.name;
    out[s.name] = resample(t, [0, ...traj.signals[name]], grid);
  }
  return out;
}
