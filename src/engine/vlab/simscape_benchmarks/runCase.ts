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
    | { type: 'halfwave_rectifier_pwl'; Vpk: number; f: number; Vf: number; Ron: number; Roff: number; R: number };
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
