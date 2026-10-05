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
  analytic?: { type: 'first_order_step'; final: number; tau: number };
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
export function runCase(id: string, grid: number[], dt = 0.001): Record<string, number[]> {
  const spec = loadCase(id);
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
